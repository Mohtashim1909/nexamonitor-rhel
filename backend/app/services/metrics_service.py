"""Metrics service - collects and stores container metrics to database."""
from sqlalchemy.orm import Session
from app.models.metrics import ContainerMetric
from app.services.docker_service import docker_service
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)


class MetricsService:
    def collect_container_metrics(self, db: Session) -> List[ContainerMetric]:
        """Collect metrics from all running containers and persist to DB."""
        if not docker_service.is_connected:
            return []

        containers = docker_service.get_containers(all_containers=False)
        saved = []
        for container in containers:
            raw_stats = docker_service.get_container_stats(container["id"])
            if not raw_stats:
                continue
            parsed = self._parse_stats(container, raw_stats)
            metric = ContainerMetric(**parsed)
            db.add(metric)
            saved.append(metric)
        db.commit()
        return saved

    def _parse_stats(self, container: Dict[str, Any], stats: Dict[str, Any]) -> Dict[str, Any]:
        cpu_delta = stats["cpu_stats"]["cpu_usage"]["total_usage"] - stats["precpu_stats"]["cpu_usage"]["total_usage"]
        system_delta = stats["cpu_stats"].get("system_cpu_usage", 0) - stats["precpu_stats"].get("system_cpu_usage", 0)
        num_cpus = stats["cpu_stats"].get("online_cpus", 1)
        cpu_percent = (cpu_delta / system_delta) * num_cpus * 100.0 if system_delta > 0 else 0.0

        mem_usage = stats["memory_stats"].get("usage", 0)
        mem_limit = stats["memory_stats"].get("limit", 1)
        mem_percent = (mem_usage / mem_limit) * 100.0 if mem_limit > 0 else 0.0

        networks = stats.get("networks", {})
        rx_bytes = sum(v.get("rx_bytes", 0) for v in networks.values())
        tx_bytes = sum(v.get("tx_bytes", 0) for v in networks.values())

        return {
            "container_id": container["id"],
            "container_name": container["name"],
            "cpu_percent": round(cpu_percent, 2),
            "memory_usage": mem_usage,
            "memory_limit": mem_limit,
            "memory_percent": round(mem_percent, 2),
            "network_rx": rx_bytes,
            "network_tx": tx_bytes,
        }

    def get_recent_metrics(self, db: Session, container_id: str, limit: int = 60) -> List[ContainerMetric]:
        return (
            db.query(ContainerMetric)
            .filter(ContainerMetric.container_id == container_id)
            .order_by(ContainerMetric.timestamp.desc())
            .limit(limit)
            .all()
        )


metrics_service = MetricsService()
