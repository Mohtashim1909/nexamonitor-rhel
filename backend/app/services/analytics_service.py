import datetime
import logging
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy import text
from app.database.connection import SessionLocal

logger = logging.getLogger("nexamonitor.analytics")


class AnalyticsService:
    @staticmethod
    def parse_time_range(
        time_range: Optional[str] = "24h",
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
    ) -> Tuple[datetime.datetime, datetime.datetime, str]:
        """
        Parse and validate start_time and end_time from preset or custom ISO strings.
        Returns (start_dt, end_dt, effective_time_range_label).
        """
        now = datetime.datetime.utcnow()

        if start_time and end_time:
            try:
                start_dt = datetime.datetime.fromisoformat(start_time.replace("Z", "+00:00")).replace(tzinfo=None)
                end_dt = datetime.datetime.fromisoformat(end_time.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception as pe:
                raise ValueError(f"Invalid ISO timestamp format: {pe}")

            if start_dt >= end_dt:
                raise ValueError("start_time must be earlier than end_time")
            if (end_dt - start_dt).days > 90:
                raise ValueError("Date range cannot exceed 90 days")
            return start_dt, end_dt, "custom"

        preset_map = {
            "15m": datetime.timedelta(minutes=15),
            "30m": datetime.timedelta(minutes=30),
            "1h": datetime.timedelta(hours=1),
            "6h": datetime.timedelta(hours=6),
            "12h": datetime.timedelta(hours=12),
            "24h": datetime.timedelta(hours=24),
            "7d": datetime.timedelta(days=7),
            "30d": datetime.timedelta(days=30),
        }

        delta = preset_map.get(time_range or "24h", datetime.timedelta(hours=24))
        start_dt = now - delta
        return start_dt, now, time_range or "24h"

    @staticmethod
    def get_bucket_seconds(start_dt: datetime.datetime, end_dt: datetime.datetime, interval_override: Optional[str] = None) -> int:
        """Calculate optimal time bucket resolution in seconds."""
        if interval_override and interval_override != "auto":
            interval_seconds_map = {
                "raw": 5,
                "5s": 5,
                "10s": 10,
                "30s": 30,
                "1m": 60,
                "5m": 300,
                "15m": 900,
                "1h": 3600,
                "6h": 21600,
                "1d": 86400,
            }
            if interval_override in interval_seconds_map:
                return interval_seconds_map[interval_override]

        duration_sec = (end_dt - start_dt).total_seconds()
        if duration_sec <= 1800:       # <= 30 mins -> 10s
            return 10
        elif duration_sec <= 7200:     # <= 2 hours -> 1 min
            return 60
        elif duration_sec <= 43200:    # <= 12 hours -> 5 mins
            return 300
        elif duration_sec <= 172800:   # <= 2 days -> 15 mins
            return 900
        elif duration_sec <= 1209600:  # <= 14 days -> 1 hour
            return 3600
        else:                          # > 14 days -> 6 hours
            return 21600

    def get_container_history(
        self,
        container_id: str,
        start_dt: datetime.datetime,
        end_dt: datetime.datetime,
        interval: Optional[str] = "auto",
        metric: Optional[str] = "all",
    ) -> Dict[str, Any]:
        """Query aggregated historical time series for a container."""
        bucket_sec = self.get_bucket_seconds(start_dt, end_dt, interval)
        db = SessionLocal()
        try:
            # Query container name
            name_row = db.execute(
                text("SELECT container_name FROM container_metrics WHERE container_id = :cid ORDER BY timestamp DESC LIMIT 1"),
                {"cid": container_id}
            ).fetchone()
            container_name = name_row[0] if name_row else container_id

            sql = text("""
                SELECT
                    (CAST(strftime('%s', timestamp) / :bucket_sec AS INTEGER) * :bucket_sec) AS bucket_epoch,
                    ROUND(AVG(cpu_percent), 2) AS cpu_avg,
                    ROUND(MAX(cpu_percent), 2) AS cpu_max,
                    ROUND(MIN(cpu_percent), 2) AS cpu_min,
                    ROUND(AVG(memory_usage) / 1048576.0, 2) AS mem_avg_mb,
                    ROUND(AVG(memory_percent), 2) AS mem_pct_avg,
                    ROUND(MAX(memory_percent), 2) AS mem_pct_max,
                    ROUND(MIN(memory_percent), 2) AS mem_pct_min,
                    ROUND(AVG(network_rx_speed), 2) AS rx_speed_avg,
                    ROUND(AVG(network_tx_speed), 2) AS tx_speed_avg,
                    ROUND(AVG(network_rx_speed) / 1024.0, 2) AS rx_kb_avg,
                    ROUND(AVG(network_tx_speed) / 1024.0, 2) AS tx_kb_avg,
                    ROUND(AVG(disk_read_speed), 2) AS read_speed_avg,
                    ROUND(AVG(disk_write_speed), 2) AS write_speed_avg,
                    ROUND(AVG(disk_read_speed) / 1024.0, 2) AS read_kb_avg,
                    ROUND(AVG(disk_write_speed) / 1024.0, 2) AS write_kb_avg
                FROM container_metrics
                WHERE container_id = :cid
                  AND timestamp >= :start_dt
                  AND timestamp <= :end_dt
                GROUP BY bucket_epoch
                ORDER BY bucket_epoch ASC
            """)

            rows = db.execute(sql, {
                "cid": container_id,
                "bucket_sec": bucket_sec,
                "start_dt": start_dt,
                "end_dt": end_dt
            }).fetchall()

            points = []
            for r in rows:
                dt_point = datetime.datetime.utcfromtimestamp(r.bucket_epoch)
                points.append({
                    "timestamp": dt_point.isoformat() + "Z",
                    "time": dt_point.strftime("%H:%M:%S" if bucket_sec < 3600 else "%m-%d %H:%M"),
                    "cpu": r.cpu_avg,
                    "cpu_avg": r.cpu_avg,
                    "cpu_max": r.cpu_max,
                    "cpu_min": r.cpu_min,
                    "memory": r.mem_avg_mb,
                    "memory_percent": r.mem_pct_avg,
                    "memory_max": r.mem_pct_max,
                    "memory_min": r.mem_pct_min,
                    "network_rx_speed": r.rx_speed_avg,
                    "network_tx_speed": r.tx_speed_avg,
                    "network_rx_kb": r.rx_kb_avg,
                    "network_tx_kb": r.tx_kb_avg,
                    "disk_read_speed": r.read_speed_avg,
                    "disk_write_speed": r.write_speed_avg,
                    "disk_read_kb": r.read_kb_avg,
                    "disk_write_kb": r.write_kb_avg,
                })

            return {
                "container_id": container_id,
                "container_name": container_name,
                "start_time": start_dt.isoformat() + "Z",
                "end_time": end_dt.isoformat() + "Z",
                "interval": f"{bucket_sec}s",
                "metric": metric or "all",
                "points": points,
            }
        finally:
            db.close()

    def get_container_summary(
        self,
        container_id: str,
        start_dt: datetime.datetime,
        end_dt: datetime.datetime,
        time_range_label: str = "24h",
    ) -> Dict[str, Any]:
        """Compute statistical summary for a container over the specified time range."""
        db = SessionLocal()
        try:
            # Aggregate stats across entire range
            sql = text("""
                SELECT
                    COUNT(id) AS sample_count,
                    COALESCE(MAX(container_name), :cid) AS container_name,
                    ROUND(AVG(cpu_percent), 2) AS avg_cpu,
                    ROUND(MAX(cpu_percent), 2) AS max_cpu,
                    ROUND(MIN(cpu_percent), 2) AS min_cpu,
                    ROUND(AVG(memory_usage), 0) AS avg_mem,
                    ROUND(MAX(memory_usage), 0) AS max_mem,
                    ROUND(MIN(memory_usage), 0) AS min_mem,
                    ROUND(AVG(memory_percent), 2) AS avg_mem_pct,
                    ROUND(MAX(memory_percent), 2) AS max_mem_pct,
                    MAX(memory_limit) AS limit_mem,
                    ROUND(AVG(network_rx_speed), 2) AS avg_rx_speed,
                    ROUND(AVG(network_tx_speed), 2) AS avg_tx_speed,
                    ROUND(MAX(network_rx_speed), 2) AS max_rx_speed,
                    ROUND(MAX(network_tx_speed), 2) AS max_tx_speed,
                    ROUND(AVG(disk_read_speed), 2) AS avg_read_speed,
                    ROUND(AVG(disk_write_speed), 2) AS avg_write_speed
                FROM container_metrics
                WHERE container_id = :cid
                  AND timestamp >= :start_dt
                  AND timestamp <= :end_dt
            """)

            row = db.execute(sql, {"cid": container_id, "start_dt": start_dt, "end_dt": end_dt}).fetchone()
            sample_count = row.sample_count if row else 0

            # Compute traffic volume accurately by accumulating consecutive positive counter differences
            cum_sql = text("""
                SELECT network_rx, network_tx, disk_read_bytes, disk_write_bytes
                FROM container_metrics
                WHERE container_id = :cid
                  AND timestamp >= :start_dt
                  AND timestamp <= :end_dt
                ORDER BY timestamp ASC
            """)
            counter_rows = db.execute(cum_sql, {"cid": container_id, "start_dt": start_dt, "end_dt": end_dt}).fetchall()

            total_rx_bytes = 0
            total_tx_bytes = 0
            total_read_bytes = 0
            total_write_bytes = 0

            if len(counter_rows) > 1:
                for i in range(1, len(counter_rows)):
                    curr = counter_rows[i]
                    prev = counter_rows[i - 1]
                    # Accrue only positive deltas (handles container restart counter resets)
                    if curr.network_rx and prev.network_rx and curr.network_rx >= prev.network_rx:
                        total_rx_bytes += curr.network_rx - prev.network_rx
                    if curr.network_tx and prev.network_tx and curr.network_tx >= prev.network_tx:
                        total_tx_bytes += curr.network_tx - prev.network_tx
                    if curr.disk_read_bytes and prev.disk_read_bytes and curr.disk_read_bytes >= prev.disk_read_bytes:
                        total_read_bytes += curr.disk_read_bytes - prev.disk_read_bytes
                    if curr.disk_write_bytes and prev.disk_write_bytes and curr.disk_write_bytes >= prev.disk_write_bytes:
                        total_write_bytes += curr.disk_write_bytes - prev.disk_write_bytes

            # Trend calculation: compare first half average against second half average
            midpoint = start_dt + (end_dt - start_dt) / 2
            trend_sql = text("""
                SELECT
                    (SELECT AVG(cpu_percent) FROM container_metrics WHERE container_id = :cid AND timestamp >= :start_dt AND timestamp < :mid) AS first_half_cpu,
                    (SELECT AVG(cpu_percent) FROM container_metrics WHERE container_id = :cid AND timestamp >= :mid AND timestamp <= :end_dt) AS second_half_cpu
            """)
            trend_row = db.execute(trend_sql, {"cid": container_id, "start_dt": start_dt, "mid": midpoint, "end_dt": end_dt}).fetchone()

            trend = "stable"
            if trend_row and trend_row.first_half_cpu is not None and trend_row.second_half_cpu is not None:
                diff = trend_row.second_half_cpu - trend_row.first_half_cpu
                if diff > 3.0:
                    trend = "increasing"
                elif diff < -3.0:
                    trend = "decreasing"

            return {
                "container_id": container_id,
                "container_name": row.container_name if row else container_id,
                "time_range": time_range_label,
                "start_time": start_dt.isoformat() + "Z",
                "end_time": end_dt.isoformat() + "Z",
                "sample_count": sample_count,
                "cpu": {
                    "avg": row.avg_cpu or 0.0,
                    "max": row.max_cpu or 0.0,
                    "min": row.min_cpu or 0.0,
                    "trend": trend,
                },
                "memory": {
                    "avg_bytes": int(row.avg_mem or 0),
                    "peak_bytes": int(row.max_mem or 0),
                    "min_bytes": int(row.min_mem or 0),
                    "avg_percent": row.avg_mem_pct or 0.0,
                    "peak_percent": row.max_mem_pct or 0.0,
                    "limit_bytes": int(row.limit_mem or 0),
                },
                "network": {
                    "total_rx_bytes": int(total_rx_bytes),
                    "total_tx_bytes": int(total_tx_bytes),
                    "avg_rx_speed": row.avg_rx_speed or 0.0,
                    "avg_tx_speed": row.avg_tx_speed or 0.0,
                    "peak_rx_speed": row.max_rx_speed or 0.0,
                    "peak_tx_speed": row.max_tx_speed or 0.0,
                },
                "disk": {
                    "total_read_bytes": int(total_read_bytes),
                    "total_write_bytes": int(total_write_bytes),
                    "avg_read_speed": row.avg_read_speed or 0.0,
                    "avg_write_speed": row.avg_write_speed or 0.0,
                },
            }
        finally:
            db.close()

    def get_cluster_overview(
        self,
        start_dt: datetime.datetime,
        end_dt: datetime.datetime,
        time_range_label: str = "24h",
    ) -> Dict[str, Any]:
        """Aggregate cluster-wide telemetry analytics over the requested time period."""
        db = SessionLocal()
        try:
            # Overall statistics
            stats_sql = text("""
                SELECT
                    COUNT(DISTINCT container_id) AS total_containers,
                    COUNT(id) AS total_samples,
                    ROUND(AVG(cpu_percent), 2) AS avg_cpu,
                    ROUND(MAX(cpu_percent), 2) AS max_cpu,
                    ROUND(MIN(cpu_percent), 2) AS min_cpu,
                    ROUND(AVG(memory_usage), 0) AS avg_mem,
                    ROUND(MAX(memory_usage), 0) AS max_mem,
                    ROUND(MIN(memory_usage), 0) AS min_mem,
                    ROUND(AVG(memory_percent), 2) AS avg_mem_pct,
                    ROUND(MAX(memory_percent), 2) AS max_mem_pct,
                    ROUND(AVG(network_rx_speed), 2) AS avg_rx_speed,
                    ROUND(AVG(network_tx_speed), 2) AS avg_tx_speed,
                    ROUND(MAX(network_rx_speed), 2) AS max_rx_speed,
                    ROUND(MAX(network_tx_speed), 2) AS max_tx_speed,
                    ROUND(AVG(disk_read_speed), 2) AS avg_read_speed,
                    ROUND(AVG(disk_write_speed), 2) AS avg_write_speed
                FROM container_metrics
                WHERE timestamp >= :start_dt AND timestamp <= :end_dt
            """)
            stats_row = db.execute(stats_sql, {"start_dt": start_dt, "end_dt": end_dt}).fetchone()

            # Time series aggregation across cluster
            bucket_sec = self.get_bucket_seconds(start_dt, end_dt)
            series_sql = text("""
                SELECT
                    (CAST(strftime('%s', timestamp) / :bucket_sec AS INTEGER) * :bucket_sec) AS bucket_epoch,
                    ROUND(AVG(cpu_percent), 2) AS avg_cpu,
                    ROUND(AVG(memory_usage) / 1048576.0, 2) AS avg_mem_mb,
                    ROUND(AVG(memory_percent), 2) AS avg_mem_pct,
                    ROUND(AVG(network_rx_speed) / 1024.0, 2) AS rx_kb_avg,
                    ROUND(AVG(network_tx_speed) / 1024.0, 2) AS tx_kb_avg,
                    ROUND(AVG(disk_read_speed) / 1024.0, 2) AS read_kb_avg,
                    ROUND(AVG(disk_write_speed) / 1024.0, 2) AS write_kb_avg
                FROM container_metrics
                WHERE timestamp >= :start_dt AND timestamp <= :end_dt
                GROUP BY bucket_epoch
                ORDER BY bucket_epoch ASC
            """)
            series_rows = db.execute(series_sql, {"bucket_sec": bucket_sec, "start_dt": start_dt, "end_dt": end_dt}).fetchall()

            series = []
            for r in series_rows:
                dt_point = datetime.datetime.utcfromtimestamp(r.bucket_epoch)
                series.append({
                    "timestamp": dt_point.isoformat() + "Z",
                    "time": dt_point.strftime("%H:%M:%S" if bucket_sec < 3600 else "%m-%d %H:%M"),
                    "cpu": r.avg_cpu,
                    "memory": r.avg_mem_mb,
                    "memory_percent": r.avg_mem_pct,
                    "rx_rate": r.rx_kb_avg,
                    "tx_rate": r.tx_kb_avg,
                    "read_io": r.read_kb_avg,
                    "write_io": r.write_kb_avg,
                })

            # Calculate total volumes across all containers
            vol_sql = text("""
                SELECT container_id, network_rx, network_tx, disk_read_bytes, disk_write_bytes
                FROM container_metrics
                WHERE timestamp >= :start_dt AND timestamp <= :end_dt
                ORDER BY container_id, timestamp ASC
            """)
            vol_rows = db.execute(vol_sql, {"start_dt": start_dt, "end_dt": end_dt}).fetchall()

            total_rx = 0
            total_tx = 0
            total_read = 0
            total_write = 0
            prev_by_cid: Dict[str, Any] = {}

            for r in vol_rows:
                cid = r.container_id
                prev = prev_by_cid.get(cid)
                if prev:
                    if r.network_rx and prev.network_rx and r.network_rx >= prev.network_rx:
                        total_rx += r.network_rx - prev.network_rx
                    if r.network_tx and prev.network_tx and r.network_tx >= prev.network_tx:
                        total_tx += r.network_tx - prev.network_tx
                    if r.disk_read_bytes and prev.disk_read_bytes and r.disk_read_bytes >= prev.disk_read_bytes:
                        total_read += r.disk_read_bytes - prev.disk_read_bytes
                    if r.disk_write_bytes and prev.disk_write_bytes and r.disk_write_bytes >= prev.disk_write_bytes:
                        total_write += r.disk_write_bytes - prev.disk_write_bytes
                prev_by_cid[cid] = r

            return {
                "time_range": time_range_label,
                "start_time": start_dt.isoformat() + "Z",
                "end_time": end_dt.isoformat() + "Z",
                "total_containers_tracked": stats_row.total_containers if stats_row else 0,
                "total_samples": stats_row.total_samples if stats_row else 0,
                "cpu": {
                    "avg": stats_row.avg_cpu or 0.0 if stats_row else 0.0,
                    "max": stats_row.max_cpu or 0.0 if stats_row else 0.0,
                    "min": stats_row.min_cpu or 0.0 if stats_row else 0.0,
                    "trend": "stable",
                },
                "memory": {
                    "avg_bytes": int(stats_row.avg_mem or 0) if stats_row else 0,
                    "peak_bytes": int(stats_row.max_mem or 0) if stats_row else 0,
                    "min_bytes": int(stats_row.min_mem or 0) if stats_row else 0,
                    "avg_percent": stats_row.avg_mem_pct or 0.0 if stats_row else 0.0,
                    "peak_percent": stats_row.max_mem_pct or 0.0 if stats_row else 0.0,
                    "limit_bytes": 0,
                },
                "network": {
                    "total_rx_bytes": int(total_rx),
                    "total_tx_bytes": int(total_tx),
                    "avg_rx_speed": stats_row.avg_rx_speed or 0.0 if stats_row else 0.0,
                    "avg_tx_speed": stats_row.avg_tx_speed or 0.0 if stats_row else 0.0,
                    "peak_rx_speed": stats_row.max_rx_speed or 0.0 if stats_row else 0.0,
                    "peak_tx_speed": stats_row.max_tx_speed or 0.0 if stats_row else 0.0,
                },
                "disk": {
                    "total_read_bytes": int(total_read),
                    "total_write_bytes": int(total_write),
                    "avg_read_speed": stats_row.avg_read_speed or 0.0 if stats_row else 0.0,
                    "avg_write_speed": stats_row.avg_write_speed or 0.0 if stats_row else 0.0,
                },
                "series": series,
            }
        finally:
            db.close()

    def get_top_consumers(
        self,
        start_dt: datetime.datetime,
        end_dt: datetime.datetime,
        metric: str = "cpu",
        limit: int = 5,
        sort_by: str = "avg",
        time_range_label: str = "24h",
    ) -> Dict[str, Any]:
        """Rank containers based on compute, RAM, network, or disk usage."""
        db = SessionLocal()
        try:
            sql = text("""
                SELECT
                    container_id,
                    COALESCE(MAX(container_name), container_id) AS container_name,
                    ROUND(AVG(cpu_percent), 2) AS avg_cpu,
                    ROUND(MAX(cpu_percent), 2) AS peak_cpu,
                    ROUND(AVG(memory_usage) / 1048576.0, 2) AS avg_memory_mb,
                    ROUND(MAX(memory_usage) / 1048576.0, 2) AS peak_memory_mb,
                    COALESCE(MAX(network_rx), 0) AS network_rx_bytes,
                    COALESCE(MAX(network_tx), 0) AS network_tx_bytes,
                    COALESCE(MAX(disk_read_bytes), 0) AS disk_read_bytes,
                    COALESCE(MAX(disk_write_bytes), 0) AS disk_write_bytes
                FROM container_metrics
                WHERE timestamp >= :start_dt AND timestamp <= :end_dt
                GROUP BY container_id
            """)
            rows = db.execute(sql, {"start_dt": start_dt, "end_dt": end_dt}).fetchall()

            rankings = []
            for r in rows:
                if metric == "cpu":
                    val = r.avg_cpu if sort_by == "avg" else r.peak_cpu
                    unit = "%"
                elif metric == "memory":
                    val = r.avg_memory_mb if sort_by == "avg" else r.peak_memory_mb
                    unit = "MB"
                elif metric == "network":
                    val = float(r.network_rx_bytes + r.network_tx_bytes)
                    unit = "Bytes"
                elif metric == "disk":
                    val = float(r.disk_read_bytes + r.disk_write_bytes)
                    unit = "Bytes"
                else:
                    val = r.avg_cpu
                    unit = "%"

                rankings.append({
                    "container_id": r.container_id,
                    "container_name": r.container_name,
                    "value": round(val or 0.0, 2),
                    "unit": unit,
                    "avg_cpu": r.avg_cpu or 0.0,
                    "peak_cpu": r.peak_cpu or 0.0,
                    "avg_memory_mb": r.avg_memory_mb or 0.0,
                    "peak_memory_mb": r.peak_memory_mb or 0.0,
                    "network_rx_bytes": int(r.network_rx_bytes or 0),
                    "network_tx_bytes": int(r.network_tx_bytes or 0),
                    "disk_read_bytes": int(r.disk_read_bytes or 0),
                    "disk_write_bytes": int(r.disk_write_bytes or 0),
                })

            # Sort descending by value
            rankings.sort(key=lambda x: x["value"], reverse=True)
            safe_limit = max(1, min(limit, 50))
            rankings = rankings[:safe_limit]

            return {
                "time_range": time_range_label,
                "metric": metric,
                "sort_by": sort_by,
                "rankings": rankings,
            }
        finally:
            db.close()

    def compare_containers(
        self,
        container_ids: List[str],
        start_dt: datetime.datetime,
        end_dt: datetime.datetime,
        metric: str = "all",
        time_range_label: str = "24h",
    ) -> Dict[str, Any]:
        """Compare resource consumption across multiple containers over a shared time window."""
        if not container_ids:
            return {
                "time_range": time_range_label,
                "start_time": start_dt.isoformat() + "Z",
                "end_time": end_dt.isoformat() + "Z",
                "containers": [],
                "series": [],
            }

        db = SessionLocal()
        try:
            placeholders = ", ".join([f":cid_{i}" for i in range(len(container_ids))])
            params: Dict[str, Any] = {f"cid_{i}": cid for i, cid in enumerate(container_ids)}
            params["start_dt"] = start_dt
            params["end_dt"] = end_dt

            # Container stats overview
            overview_sql = text(f"""
                SELECT
                    container_id,
                    COALESCE(MAX(container_name), container_id) AS container_name,
                    ROUND(AVG(cpu_percent), 2) AS avg_cpu,
                    ROUND(MAX(cpu_percent), 2) AS peak_cpu,
                    ROUND(AVG(memory_usage) / 1048576.0, 2) AS avg_memory_mb,
                    ROUND(MAX(memory_usage) / 1048576.0, 2) AS peak_memory_mb,
                    ROUND(MAX(memory_percent), 2) AS peak_memory_percent,
                    COALESCE(MAX(network_rx) + MAX(network_tx), 0) AS total_network_bytes,
                    COALESCE(MAX(disk_read_bytes) + MAX(disk_write_bytes), 0) AS total_disk_bytes
                FROM container_metrics
                WHERE container_id IN ({placeholders})
                  AND timestamp >= :start_dt
                  AND timestamp <= :end_dt
                GROUP BY container_id
            """)
            summary_rows = db.execute(overview_sql, params).fetchall()

            # Inspect live container configurations if Docker is connected
            live_docker_meta: Dict[str, Dict[str, Any]] = {}
            try:
                from app.services.docker_service import docker_service
                if docker_service.is_connected:
                    c_all = docker_service.get_containers(all_containers=True)
                    for c in c_all:
                        live_docker_meta[c.get("id")] = {
                            "status": c.get("status", "unknown"),
                            "uptime": c.get("uptime", "—"),
                            "restart_count": c.get("restart_count", 0),
                        }
            except Exception:
                pass

            container_metrics = []
            for r in summary_rows:
                meta = live_docker_meta.get(r.container_id, {})
                container_metrics.append({
                    "container_id": r.container_id,
                    "container_name": r.container_name,
                    "status": meta.get("status", "running"),
                    "uptime": meta.get("uptime", "—"),
                    "restart_count": meta.get("restart_count", 0),
                    "avg_cpu": r.avg_cpu or 0.0,
                    "peak_cpu": r.peak_cpu or 0.0,
                    "avg_memory_mb": r.avg_memory_mb or 0.0,
                    "peak_memory_mb": r.peak_memory_mb or 0.0,
                    "peak_memory_percent": r.peak_memory_percent or 0.0,
                    "total_network_bytes": int(r.total_network_bytes or 0),
                    "total_disk_bytes": int(r.total_disk_bytes or 0),
                    "is_highest_cpu": False,
                    "is_highest_memory": False,
                    "is_highest_network": False,
                    "is_highest_disk": False,
                })

            # Identify highest resource consumers
            if container_metrics:
                max_cpu_c = max(container_metrics, key=lambda x: x["avg_cpu"])
                max_cpu_c["is_highest_cpu"] = True

                max_mem_c = max(container_metrics, key=lambda x: x["avg_memory_mb"])
                max_mem_c["is_highest_memory"] = True

                max_net_c = max(container_metrics, key=lambda x: x["total_network_bytes"])
                max_net_c["is_highest_network"] = True

                max_disk_c = max(container_metrics, key=lambda x: x["total_disk_bytes"])
                max_disk_c["is_highest_disk"] = True

            # Common time-bucketed series
            bucket_sec = self.get_bucket_seconds(start_dt, end_dt)
            params["bucket_sec"] = bucket_sec

            series_sql = text(f"""
                SELECT
                    (CAST(strftime('%s', timestamp) / :bucket_sec AS INTEGER) * :bucket_sec) AS bucket_epoch,
                    container_id,
                    COALESCE(MAX(container_name), container_id) AS container_name,
                    ROUND(AVG(cpu_percent), 2) AS avg_cpu,
                    ROUND(AVG(memory_usage) / 1048576.0, 2) AS avg_mem_mb,
                    ROUND(AVG(network_rx_speed) / 1024.0, 2) AS rx_kb,
                    ROUND(AVG(network_tx_speed) / 1024.0, 2) AS tx_kb,
                    ROUND((AVG(disk_read_speed) + AVG(disk_write_speed)) / 1024.0, 2) AS disk_kb
                FROM container_metrics
                WHERE container_id IN ({placeholders})
                  AND timestamp >= :start_dt
                  AND timestamp <= :end_dt
                GROUP BY bucket_epoch, container_id
                ORDER BY bucket_epoch ASC
            """)
            series_rows = db.execute(series_sql, params).fetchall()

            # Align rows into single timeline
            time_map: Dict[int, Dict[str, Any]] = {}
            for r in series_rows:
                ep = r.bucket_epoch
                if ep not in time_map:
                    dt = datetime.datetime.utcfromtimestamp(ep)
                    time_map[ep] = {
                        "timestamp": dt.isoformat() + "Z",
                        "time": dt.strftime("%H:%M:%S" if bucket_sec < 3600 else "%m-%d %H:%M"),
                    }
                cid_alias = r.container_name or r.container_id
                time_map[ep][f"cpu_{cid_alias}"] = r.avg_cpu or 0.0
                time_map[ep][f"mem_{cid_alias}"] = r.avg_mem_mb or 0.0
                time_map[ep][f"rx_{cid_alias}"] = r.rx_kb or 0.0
                time_map[ep][f"tx_{cid_alias}"] = r.tx_kb or 0.0
                time_map[ep][f"disk_{cid_alias}"] = r.disk_kb or 0.0
                # Backward compatibility
                time_map[ep][f"net_{cid_alias}"] = (r.rx_kb or 0.0) + (r.tx_kb or 0.0)

            series = [time_map[ep] for ep in sorted(time_map.keys())]

            return {
                "time_range": time_range_label,
                "start_time": start_dt.isoformat() + "Z",
                "end_time": end_dt.isoformat() + "Z",
                "containers": container_metrics,
                "series": series,
            }
        finally:
            db.close()


analytics_service = AnalyticsService()
