from pydantic import BaseModel
from typing import Optional, Dict, Any


class DockerStatusResponse(BaseModel):
    connected: bool
    server_version: Optional[str] = None
    api_version: Optional[str] = None
    operating_system: Optional[str] = None
    architecture: Optional[str] = None
    containers_count: Optional[int] = None
    images_count: Optional[int] = None
    docker_host: Optional[str] = None
    error: Optional[str] = None
