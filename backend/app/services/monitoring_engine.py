"""
Real-time container and host monitoring engine.
Continuously samples running Docker containers, computes accurate CPU/Memory/Network rates,
and broadcasts metrics frames over WebSockets.
"""
import asyncio
import datetime
import logging
import time
from typing import Dict, Any, List, Optional
import psutil

from app.services.docker_service import docker_service
from app.services.host_monitor import host_monitor
from app.websocket.manager import manager

logger = logging.getLogger(__name__)


class MonitoringEngine:
    def __init__(self, default_interval_ms: int = 1000, default_persistence_ms: int = 5000):
        self.interval_ms: int = default_interval_ms
        self.persistence_interval_ms: int = default_persistence_ms
        self.retention_days: int = 30
        self.is_running: bool = False
        self._task: Optional[asyncio.Task] = None
        self._last_persistence_time: float = 0.0
        self._last_retention_check_time: float = 0.0
        # Stores previous samples for rate computations:
        # { container_id: { "timestamp": float, "rx_bytes": int, "tx_bytes": int, "read_bytes": int, "write_bytes": int } }
        self._prev_samples: Dict[str, Dict[str, Any]] = {}
        self._last_metrics: Dict[str, Any] = {}
        self._host_total_memory = psutil.virtual_memory().total

    def set_interval(self, interval_ms: int) -> int:
        """Update monitoring interval in milliseconds (clamped between 500ms and 60000ms)."""
        valid_interval = max(500, min(interval_ms, 60000))
        self.interval_ms = valid_interval
        logger.info(f"Monitoring interval updated to {self.interval_ms}ms")
        return self.interval_ms

    def set_persistence_interval(self, interval_ms: int) -> int:
        """Update database persistence interval in milliseconds (clamped between 1000ms and 60000ms)."""
        valid_interval = max(1000, min(interval_ms, 60000))
        self.persistence_interval_ms = valid_interval
        logger.info(f"Persistence interval updated to {self.persistence_interval_ms}ms")
        return self.persistence_interval_ms

    def set_retention_days(self, days: int) -> int:
        """Update historical metric retention period in days (1 to 365)."""
        valid_days = max(1, min(days, 365))
        self.retention_days = valid_days
        logger.info(f"Data retention policy updated to {self.retention_days} days")
        return self.retention_days

    async def start(self) -> None:
        """Start the centralized background monitoring loop."""
        if self.is_running:
            return
        self.is_running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("Monitoring engine background task started")

    async def stop(self) -> None:
        """Gracefully stop the background monitoring loop on shutdown."""
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Monitoring engine background task stopped")

    async def _run_loop(self) -> None:
        """Main non-blocking sampling loop."""
        while self.is_running:
            start_time = time.time()
            try:
                await self._collect_and_broadcast()
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}", exc_info=True)

            # Calculate sleep duration to maintain consistent frequency
            elapsed = time.time() - start_time
            sleep_duration = max(0.05, (self.interval_ms / 1000.0) - elapsed)
            try:
                await asyncio.sleep(sleep_duration)
            except asyncio.CancelledError:
                break

    async def _collect_and_broadcast(self) -> None:
        """Collect metrics across all containers and host, then broadcast."""
        now_ts = datetime.datetime.utcnow().isoformat() + "Z"
        now_epoch = time.time()

        # 1. Check Docker connection
        is_docker_connected = docker_service.is_connected
        if not is_docker_connected:
            # Docker is offline; prune historical container diffs and broadcast host snapshot + status
            self._prev_samples.clear()
            host_snapshot = host_monitor.get_full_snapshot()
            status_payload = {
                "type": "docker_status",
                "timestamp": now_ts,
                "connected": False,
                "error": "Docker Engine disconnected or unavailable",
                "system": host_snapshot,
            }
            if manager.active_connections:
                await manager.broadcast(status_payload)
            # Evaluate offline Docker alert in background
            asyncio.create_task(asyncio.to_thread(self._evaluate_docker_disconnected, status_payload["error"]))
            return

        # 2. Retrieve running containers off the event loop thread
        try:
            containers = await asyncio.to_thread(docker_service.get_containers, all_containers=False)
        except Exception as e:
            logger.warning(f"Failed to list running containers in loop: {e}")
            containers = []

        active_container_ids = set()
        container_metrics_list: List[Dict[str, Any]] = []

        # 3. Sample each running container concurrently
        for c in containers:
            cid = c.get("id")
            if not cid:
                continue
            active_container_ids.add(cid)

            # Sample container stats off the main thread to prevent blocking
            try:
                raw_stats = await asyncio.to_thread(self._fetch_stats_snapshot, cid)
            except Exception as se:
                logger.debug(f"Could not read stats for {cid}: {se}")
                raw_stats = None

            if not raw_stats:
                continue

            parsed = self.compute_metrics(
                container_id=cid,
                container_name=c.get("name", cid),
                status=c.get("status", "running"),
                stats=raw_stats,
                sample_time=now_epoch,
                iso_timestamp=now_ts,
            )
            container_metrics_list.append(parsed)

            # Also broadcast individual container update event for targeted views
            individual_msg = {
                "type": "metrics_update",
                "timestamp": now_ts,
                "data": parsed,
            }
            if manager.active_connections:
                await manager.broadcast(individual_msg)

        # 4. Prune removed or stopped containers from rate tracker
        dead_keys = [k for k in self._prev_samples if k not in active_container_ids]
        for k in dead_keys:
            del self._prev_samples[k]

        # 5. Collect Host System snapshot
        host_snapshot = host_monitor.get_full_snapshot()

        # 6. Broadcast batch update to all connected clients
        batch_payload = {
            "type": "containers_metrics",
            "timestamp": now_ts,
            "data": {
                "containers": container_metrics_list,
                "system": host_snapshot,
                "running_count": len(container_metrics_list),
                "interval_ms": self.interval_ms,
            },
        }
        self._last_metrics = batch_payload
        if manager.active_connections:
            await manager.broadcast(batch_payload)

        # 6b. Evaluate intelligent alert rules asynchronously
        asyncio.create_task(
            asyncio.to_thread(self._evaluate_alerts_for_sample, list(container_metrics_list), dict(host_snapshot))
        )

        # 7. Controlled Database Persistence (Task 2)
        # Store metrics at independent persistence interval off-thread so DB writes never block WebSocket streaming
        if container_metrics_list and (now_epoch - self._last_persistence_time >= (self.persistence_interval_ms / 1000.0)):
            self._last_persistence_time = now_epoch
            asyncio.create_task(asyncio.to_thread(self._persist_metrics_batch, list(container_metrics_list)))

        # 8. Periodic data retention cleanup (Task 10) - run once per hour
        if now_epoch - self._last_retention_check_time >= 3600:
            self._last_retention_check_time = now_epoch
            asyncio.create_task(asyncio.to_thread(self.cleanup_old_metrics, self.retention_days))

    def _evaluate_alerts_for_sample(
        self, container_metrics_list: List[Dict[str, Any]], host_snapshot: Dict[str, Any]
    ):
        """Evaluate container and host thresholds against the active AlertEngine."""
        from app.database.connection import SessionLocal
        from app.services.alert_engine import alert_engine

        db = SessionLocal()
        try:
            # Reconnection evaluation
            alert_engine.evaluate_docker_connection(db, True)

            # Container thresholds evaluation
            for m in container_metrics_list:
                cid = m.get("container_id")
                if not cid:
                    continue
                alert_engine.evaluate_container_metrics(
                    db=db,
                    container_id=cid,
                    container_name=m.get("container_name", cid),
                    cpu_percent=m.get("cpu_usage_percent"),
                    memory_percent=m.get("memory_usage_percent"),
                    memory_usage_bytes=m.get("memory_usage_bytes"),
                    memory_limit_bytes=m.get("memory_limit_bytes"),
                )

            # Host thresholds evaluation
            if host_snapshot:
                alert_engine.evaluate_host_metrics(db, host_snapshot)
        except Exception as e:
            logger.debug(f"Error during alert evaluation: {e}")
        finally:
            db.close()

    def _evaluate_docker_disconnected(self, error_msg: str):
        """Evaluate Docker daemon disconnect alert."""
        from app.database.connection import SessionLocal
        from app.services.alert_engine import alert_engine

        db = SessionLocal()
        try:
            alert_engine.evaluate_docker_connection(db, False, error_msg)
        except Exception as e:
            logger.debug(f"Error evaluating docker disconnect alert: {e}")
        finally:
            db.close()

    def _persist_metrics_batch(self, metrics: List[Dict[str, Any]]) -> int:
        """Persist a batch of container metric records into SQLite."""
        if not metrics:
            return 0
        from app.database.connection import SessionLocal
        from app.models.metrics import ContainerMetric

        db = SessionLocal()
        saved_count = 0
        try:
            now_dt = datetime.datetime.utcnow()
            for m in metrics:
                cid = m.get("container_id")
                if not cid:
                    continue
                record = ContainerMetric(
                    container_id=cid,
                    container_name=m.get("container_name"),
                    cpu_percent=m.get("cpu_usage_percent"),
                    cpu_usage_total=m.get("cpu_usage_total"),
                    memory_usage=m.get("memory_usage_bytes"),
                    memory_limit=m.get("memory_limit_bytes"),
                    memory_percent=m.get("memory_usage_percent"),
                    network_rx=m.get("network_rx_bytes"),
                    network_tx=m.get("network_tx_bytes"),
                    network_rx_speed=m.get("network_rx_bytes_per_sec"),
                    network_tx_speed=m.get("network_tx_bytes_per_sec"),
                    disk_read_bytes=m.get("disk_read_bytes"),
                    disk_write_bytes=m.get("disk_write_bytes"),
                    disk_read_speed=m.get("disk_read_bytes_per_sec"),
                    disk_write_speed=m.get("disk_write_bytes_per_sec"),
                    timestamp=now_dt,
                )
                db.add(record)
                saved_count += 1
            db.commit()
            return saved_count
        except Exception as e:
            db.rollback()
            logger.warning(f"Failed to persist metrics batch to SQLite: {e}")
            return 0
        finally:
            db.close()

    def cleanup_old_metrics(self, retention_days: int = 30) -> int:
        """Safe batched deletion of metrics older than retention cutoff (Task 10)."""
        if retention_days <= 0:
            return 0
        from app.database.connection import engine
        from sqlalchemy import text

        cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=retention_days)
        total_deleted = 0
        try:
            with engine.begin() as conn:
                while True:
                    result = conn.execute(text(
                        "DELETE FROM container_metrics WHERE id IN ("
                        "SELECT id FROM container_metrics WHERE timestamp < :cutoff LIMIT 1000)"
                    ), {"cutoff": cutoff})
                    count = result.rowcount
                    total_deleted += count
                    if count < 1000:
                        break
            if total_deleted > 0:
                logger.info(f"Data retention policy cleaned up {total_deleted} records older than {retention_days} days")
            return total_deleted
        except Exception as e:
            logger.warning(f"Error during data retention cleanup: {e}")
            return total_deleted

    def _fetch_stats_snapshot(self, container_id: str) -> Optional[Dict[str, Any]]:
        """Synchronously pull a one-shot stats snapshot from Docker client."""
        client = docker_service.client
        if not client:
            return None
        try:
            container = client.containers.get(container_id)
            if container.status.lower() != "running":
                return None
            return container.stats(stream=False)
        except Exception:
            return None

    def compute_metrics(
        self,
        container_id: str,
        container_name: str,
        status: str,
        stats: Dict[str, Any],
        sample_time: float,
        iso_timestamp: str,
    ) -> Dict[str, Any]:
        """
        Pure calculation method computing CPU %, RAM %, and differential network/disk rates.
        Can be tested independently with mocks and historical samples.
        """
        cpu_stats = stats.get("cpu_stats", {})
        precpu_stats = stats.get("precpu_stats", {})
        memory_stats = stats.get("memory_stats", {})
        blkio_stats = stats.get("blkio_stats", {})
        networks = stats.get("networks", {}) or {}

        # 1. CPU Utilization
        cpu_usage_total = cpu_stats.get("cpu_usage", {}).get("total_usage", 0)
        precpu_usage_total = precpu_stats.get("cpu_usage", {}).get("total_usage", 0)
        cpu_delta = cpu_usage_total - precpu_usage_total

        system_cpu_usage = cpu_stats.get("system_cpu_usage", 0)
        pre_system_cpu_usage = precpu_stats.get("system_cpu_usage", 0)
        system_delta = system_cpu_usage - pre_system_cpu_usage

        cpu_count = cpu_stats.get("online_cpus")
        if not cpu_count:
            percpu = cpu_stats.get("cpu_usage", {}).get("percpu_usage")
            cpu_count = len(percpu) if percpu else 1

        has_precpu = (
            bool(precpu_stats)
            and "system_cpu_usage" in precpu_stats
            and "total_usage" in precpu_stats.get("cpu_usage", {})
        )

        cpu_percent = 0.0
        if system_delta > 0 and cpu_delta > 0 and has_precpu:
            cpu_percent = (cpu_delta / system_delta) * cpu_count * 100.0
            cpu_percent = round(min(cpu_percent, cpu_count * 100.0), 2)

        # 2. Memory Usage & Percentage
        raw_mem = memory_stats.get("usage", 0)
        stats_dict = memory_stats.get("stats", {}) or {}
        cache_bytes = stats_dict.get(
            "inactive_file",
            stats_dict.get("cache", stats_dict.get("total_inactive_file", 0))
        )
        mem_usage = max(0, raw_mem - cache_bytes) if raw_mem > cache_bytes else raw_mem
        mem_limit = memory_stats.get("limit", 0)

        # Handle unlimited memory limits (Linux default 9223372036854771712 or 0 or exceeds host memory)
        if mem_limit <= 0 or mem_limit > self._host_total_memory * 2:
            mem_limit = self._host_total_memory

        mem_percent = 0.0
        if mem_limit > 0:
            mem_percent = round((mem_usage / mem_limit) * 100.0, 2)
        mem_available = max(0, mem_limit - mem_usage)

        # 3. Cumulative Network Metrics
        cum_rx_bytes = sum(v.get("rx_bytes", 0) for v in networks.values())
        cum_tx_bytes = sum(v.get("tx_bytes", 0) for v in networks.values())
        cum_rx_pkts = sum(v.get("rx_packets", 0) for v in networks.values())
        cum_tx_pkts = sum(v.get("tx_packets", 0) for v in networks.values())
        cum_rx_errs = sum(v.get("rx_errors", 0) for v in networks.values())
        cum_tx_errs = sum(v.get("tx_errors", 0) for v in networks.values())
        cum_rx_drop = sum(v.get("rx_dropped", 0) for v in networks.values())
        cum_tx_drop = sum(v.get("tx_dropped", 0) for v in networks.values())

        # 4. Cumulative Block I/O Metrics
        cum_read_bytes = 0
        cum_write_bytes = 0
        service_bytes = blkio_stats.get("io_service_bytes_recursive") or []
        for entry in service_bytes:
            op = entry.get("op", "").lower()
            val = entry.get("value", 0)
            if op == "read":
                cum_read_bytes += val
            elif op == "write":
                cum_write_bytes += val

        # 5. Differential Transfer Rates (Speed in bytes/sec and Mbps)
        rx_rate = 0.0
        tx_rate = 0.0
        read_rate = 0.0
        write_rate = 0.0

        prev = self._prev_samples.get(container_id)
        if prev:
            dt = sample_time - prev["timestamp"]
            if dt > 0.05:
                delta_rx = cum_rx_bytes - prev["rx_bytes"]
                delta_tx = cum_tx_bytes - prev["tx_bytes"]
                delta_read = cum_read_bytes - prev["read_bytes"]
                delta_write = cum_write_bytes - prev["write_bytes"]

                # Handle counter resets (container restarted or counters rolled over):
                # Clamp negative deltas to 0 so we don't produce false speed spikes or negative rates
                delta_rx = max(0, delta_rx)
                delta_tx = max(0, delta_tx)
                delta_read = max(0, delta_read)
                delta_write = max(0, delta_write)

                rx_rate = round(delta_rx / dt, 2)
                tx_rate = round(delta_tx / dt, 2)
                read_rate = round(delta_read / dt, 2)
                write_rate = round(delta_write / dt, 2)

        # Update previous sample record
        self._prev_samples[container_id] = {
            "timestamp": sample_time,
            "rx_bytes": cum_rx_bytes,
            "tx_bytes": cum_tx_bytes,
            "read_bytes": cum_read_bytes,
            "write_bytes": cum_write_bytes,
        }

        # Calculate Mbps: (bytes/sec * 8 bits/byte) / 1,000,000
        rx_mbps = round((rx_rate * 8.0) / 1_000_000.0, 4)
        tx_mbps = round((tx_rate * 8.0) / 1_000_000.0, 4)

        return {
            "container_id": container_id,
            "container_name": container_name,
            "status": status,
            "cpu_usage_percent": cpu_percent,
            "cpu_usage_total": cpu_usage_total,
            "cpu_system_usage": system_cpu_usage,
            "cpu_count": cpu_count,
            "memory_usage_bytes": mem_usage,
            "memory_limit_bytes": mem_limit,
            "memory_usage_percent": mem_percent,
            "memory_cache_bytes": cache_bytes,
            "memory_available_bytes": mem_available,
            "network_rx_bytes": cum_rx_bytes,
            "network_tx_bytes": cum_tx_bytes,
            "network_rx_packets": cum_rx_pkts,
            "network_tx_packets": cum_tx_pkts,
            "network_rx_errors": cum_rx_errs,
            "network_tx_errors": cum_tx_errs,
            "network_rx_dropped": cum_rx_drop,
            "network_tx_dropped": cum_tx_drop,
            "network_rx_bytes_per_sec": rx_rate,
            "network_tx_bytes_per_sec": tx_rate,
            "network_rx_mbps": rx_mbps,
            "network_tx_mbps": tx_mbps,
            "disk_read_bytes": cum_read_bytes,
            "disk_write_bytes": cum_write_bytes,
            "disk_read_bytes_per_sec": read_rate,
            "disk_write_bytes_per_sec": write_rate,
            "timestamp": iso_timestamp,
        }


monitoring_engine = MonitoringEngine()
