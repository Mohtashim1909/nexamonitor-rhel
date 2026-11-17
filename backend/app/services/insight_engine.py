"""
NexaMonitor Smart Resource Usage Insights Engine
Evaluates container historical records and live metrics using deterministic rules
to detect abnormal patterns, memory leaks, restart flapping, and optimization opportunities.
"""

import datetime
from typing import List, Dict, Any, Optional
import logging
from sqlalchemy import text
from app.database.connection import SessionLocal

logger = logging.getLogger("nexamonitor.insight_engine")


class InsightEngine:
    def __init__(self):
        self._dismissed_ids: set = set()

    def dismiss_insight(self, insight_id: str) -> bool:
        """Mark an insight as dismissed for this session."""
        self._dismissed_ids.add(insight_id)
        return True

    def evaluate_container(
        self,
        db,
        container_id: str,
        container_name: str,
        status: str = "running",
        restart_count: int = 0,
        now_dt: Optional[datetime.datetime] = None,
    ) -> List[Dict[str, Any]]:
        """
        Evaluate deterministic rules for a single container and return generated insights.
        """
        if now_dt is None:
            now_dt = datetime.datetime.utcnow()
        now_iso = now_dt.isoformat() + "Z"
        cid = container_id
        cname = container_name
        insights = []

        # Rule 1: Repeated Container Restarts
        if restart_count >= 3:
            ins_id = f"ins-{cid[:8]}-restarts"
            if ins_id not in self._dismissed_ids:
                sev = "CRITICAL" if restart_count >= 8 else "WARNING"
                insights.append({
                    "id": ins_id,
                    "container_id": cid,
                    "container_name": cname,
                    "category": "RESTART_FLAPPING",
                    "severity": sev,
                    "title": f"Frequent Restarts Detected on {cname}",
                    "description": f"Container {cname} has restarted {restart_count} times. Frequent restarting typically indicates unhandled application crashes or aggressive healthcheck timeouts.",
                    "supporting_measurements": {"restart_count": restart_count, "status": status},
                    "detected_at": now_iso,
                    "status": "ACTIVE",
                    "suggested_action": "Check container stderr logs and crash exit codes for unhandled exceptions.",
                })

        if status != "running":
            return insights

        one_hour_ago = now_dt - datetime.timedelta(hours=1)
        rows = db.execute(
            text("""
                SELECT
                    cpu_percent,
                    memory_usage,
                    memory_limit,
                    memory_percent,
                    network_rx_speed,
                    network_tx_speed,
                    disk_read_speed,
                    disk_write_speed,
                    timestamp
                FROM container_metrics
                WHERE container_id = :cid AND timestamp >= :since
                ORDER BY timestamp ASC
            """),
            {"cid": cid, "since": one_hour_ago},
        ).fetchall()

        if not rows or len(rows) < 3:
            return insights

        cpu_vals = [r[0] for r in rows if r[0] is not None]
        mem_usages = [r[1] for r in rows if r[1] is not None]
        mem_percents = [r[3] for r in rows if r[3] is not None]
        mem_limits = [r[2] for r in rows if r[2] is not None]
        rx_speeds = [r[4] for r in rows if r[4] is not None]
        tx_speeds = [r[5] for r in rows if r[5] is not None]

        avg_cpu = sum(cpu_vals) / len(cpu_vals) if cpu_vals else 0.0
        peak_cpu = max(cpu_vals) if cpu_vals else 0.0
        avg_mem_pct = sum(mem_percents) / len(mem_percents) if mem_percents else 0.0
        peak_mem_pct = max(mem_percents) if mem_percents else 0.0
        max_rx_speed = max(rx_speeds) if rx_speeds else 0.0
        max_tx_speed = max(tx_speeds) if tx_speeds else 0.0

        # Rule 2: Sustained High CPU
        if avg_cpu >= 80.0:
            ins_id = f"ins-{cid[:8]}-cpu-saturation"
            if ins_id not in self._dismissed_ids:
                sev = "CRITICAL" if avg_cpu >= 90.0 else "WARNING"
                insights.append({
                    "id": ins_id,
                    "container_id": cid,
                    "container_name": cname,
                    "category": "CPU_SATURATION",
                    "severity": sev,
                    "title": f"Sustained High CPU Load on {cname}",
                    "description": f"Container {cname} has maintained an average CPU load of {avg_cpu:.1f}% (peak: {peak_cpu:.1f}%) over the past hour.",
                    "supporting_measurements": {"avg_cpu_percent": round(avg_cpu, 1), "peak_cpu_percent": round(peak_cpu, 1)},
                    "detected_at": now_iso,
                    "status": "ACTIVE",
                    "suggested_action": "Consider scaling compute capacity, increasing CPU quota, or profiling execution bottlenecks.",
                })

        # Rule 3: Memory Saturation / Near-Limit Consumption
        if peak_mem_pct >= 88.0:
            ins_id = f"ins-{cid[:8]}-mem-saturation"
            if ins_id not in self._dismissed_ids:
                sev = "CRITICAL" if peak_mem_pct >= 95.0 else "WARNING"
                effective_limit = mem_limits[-1] if mem_limits else 0
                insights.append({
                    "id": ins_id,
                    "container_id": cid,
                    "container_name": cname,
                    "category": "MEMORY_SATURATION",
                    "severity": sev,
                    "title": f"High Memory Saturation on {cname}",
                    "description": f"Container {cname} memory consumption reached {peak_mem_pct:.1f}% of its allocated limit, putting it at risk of Linux OOM killer termination.",
                    "supporting_measurements": {"peak_memory_percent": round(peak_mem_pct, 1), "avg_memory_percent": round(avg_mem_pct, 1), "limit_bytes": effective_limit},
                    "detected_at": now_iso,
                    "status": "ACTIVE",
                    "suggested_action": "Increase container memory limit or optimize in-memory buffer caches.",
                })

        # Rule 4: Memory Leak Tendency (Steady Upward Drift)
        if len(mem_usages) >= 10:
            half = len(mem_usages) // 2
            first_half_avg = sum(mem_usages[:half]) / half
            second_half_avg = sum(mem_usages[half:]) / (len(mem_usages) - half)
            growth_ratio = (second_half_avg - first_half_avg) / max(first_half_avg, 1)
            if growth_ratio >= 0.25 and second_half_avg > 50 * 1024 * 1024:
                ins_id = f"ins-{cid[:8]}-mem-leak"
                if ins_id not in self._dismissed_ids:
                    insights.append({
                        "id": ins_id,
                        "container_id": cid,
                        "container_name": cname,
                        "category": "MEMORY_LEAK_TREND",
                        "severity": "WARNING",
                        "title": f"Potential Memory Leak Detected on {cname}",
                        "description": f"Container {cname} has displayed a continuous upward memory trend of +{growth_ratio * 100:.1f}% across recent hours without garbage collection reclamation.",
                        "supporting_measurements": {
                            "initial_avg_bytes": int(first_half_avg),
                            "recent_avg_bytes": int(second_half_avg),
                            "growth_percent": round(growth_ratio * 100, 1),
                        },
                        "detected_at": now_iso,
                        "status": "ACTIVE",
                        "suggested_action": "Inspect heap allocations, unbound connection pools, or persistent object caches.",
                    })

        # Rule 5: High Network Traffic Ingest/Egress Spike
        peak_net_speed = max(max_rx_speed, max_tx_speed)
        if peak_net_speed >= 25 * 1024 * 1024:  # >= 25 MB/s
            ins_id = f"ins-{cid[:8]}-net-spike"
            if ins_id not in self._dismissed_ids:
                insights.append({
                    "id": ins_id,
                    "container_id": cid,
                    "container_name": cname,
                    "category": "NETWORK_SPIKE",
                    "severity": "INFO",
                    "title": f"High Network Throughput Spike on {cname}",
                    "description": f"Container {cname} handled peak transfer rates of {peak_net_speed / (1024 * 1024):.1f} MB/s during recent activity.",
                    "supporting_measurements": {"peak_throughput_bytes_per_sec": int(peak_net_speed)},
                    "detected_at": now_iso,
                    "status": "ACTIVE",
                    "suggested_action": "Monitor bandwidth limits and verify network socket connection pooling.",
                })

        # Rule 6: Idle Container Over-Provisioning Candidate
        if len(rows) >= 15 and avg_cpu < 0.5 and (max_rx_speed + max_tx_speed) < 2048:
            ins_id = f"ins-{cid[:8]}-idle-candidate"
            if ins_id not in self._dismissed_ids:
                insights.append({
                    "id": ins_id,
                    "container_id": cid,
                    "container_name": cname,
                    "category": "IDLE_CANDIDATE",
                    "severity": "INFO",
                    "title": f"Idle Workload Candidate: {cname}",
                    "description": f"Container {cname} has shown minimal compute activity (avg CPU: {avg_cpu:.2f}%, network: < 2 KB/s) across recent monitoring samples.",
                    "supporting_measurements": {"avg_cpu_percent": round(avg_cpu, 2), "sample_count": len(rows)},
                    "detected_at": now_iso,
                    "status": "ACTIVE",
                    "suggested_action": "Evaluate whether this workload can be paused, stopped, or scaled down to free host resources.",
                })

        return insights

    def generate_insights(self) -> List[Dict[str, Any]]:
        """
        Analyze recent telemetry and container status across the cluster
        to produce actionable, deterministic optimization insights.
        """
        from app.services.docker_service import docker_service

        insights: List[Dict[str, Any]] = []
        now_dt = datetime.datetime.utcnow()

        if not docker_service.is_connected:
            return []

        containers = []
        try:
            containers = docker_service.get_containers(all_containers=True)
        except Exception as e:
            logger.warning(f"Could not list containers for insight evaluation: {e}")
            return []

        db = SessionLocal()
        try:
            for c in containers:
                cid = c.get("id", "")
                cname = c.get("name", cid[:12])
                status = c.get("status", "unknown")
                restarts = c.get("restart_count", 0)

                c_insights = self.evaluate_container(
                    db,
                    container_id=cid,
                    container_name=cname,
                    status=status,
                    restart_count=restarts,
                    now_dt=now_dt,
                )
                insights.extend(c_insights)
        except Exception as e:
            logger.error(f"Error analyzing resource insights: {e}", exc_info=True)
        finally:
            db.close()

        # Sort insights by severity priority: CRITICAL -> WARNING -> INFO
        sev_rank = {"CRITICAL": 0, "WARNING": 1, "INFO": 2}
        insights.sort(key=lambda x: sev_rank.get(x["severity"], 3))
        return insights


insight_engine = InsightEngine()
