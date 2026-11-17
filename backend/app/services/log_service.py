"""Log service - streams and retrieves container logs via Docker SDK."""
from typing import List, Optional
from app.services.docker_service import docker_service
import logging

logger = logging.getLogger(__name__)


class LogService:
    def get_container_logs(
        self,
        container_id: str,
        tail: int = 100,
        timestamps: bool = True,
        stdout: bool = True,
        stderr: bool = True,
        since: Optional[int] = None,
    ) -> List[str]:
        if not docker_service.is_connected:
            raise ConnectionError("Docker daemon is not connected")
        return docker_service.get_container_logs(
            container_id=container_id,
            tail=tail,
            timestamps=timestamps,
            stdout=stdout,
            stderr=stderr,
            since=since,
        )


log_service = LogService()
