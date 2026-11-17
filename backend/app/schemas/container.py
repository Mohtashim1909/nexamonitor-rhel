from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class ContainerBase(BaseModel):
    container_id: str
    name: str
    image: str
    status: str


class ContainerSummary(BaseModel):
    id: str
    full_id: str
    name: str
    image: str
    image_tag: str = "latest"
    image_id: Optional[str] = None
    status: str
    state: Dict[str, Any] = {}
    created: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    ports: List[str] = []
    network: Dict[str, Any] = {}
    labels: Dict[str, str] = {}
    cpu_percent: float = 0.0
    memory_usage: float = 0.0
    memory_limit: float = 0.0
    memory_percent: float = 0.0
    network_rx: float = 0.0
    network_tx: float = 0.0
    uptime: str = ""


class ContainerActionResponse(BaseModel):
    success: bool
    action: str
    container_id: str
    message: str


class LogEntry(BaseModel):
    timestamp: str
    level: str
    message: str
    raw: str
    stream: str = "stdout"


class ContainerLogsResponse(BaseModel):
    container_id: str
    container_name: Optional[str] = None
    lines: List[str]
    total_lines: int
    filtered_lines: int = 0
    entries: List[LogEntry] = []


class ContainerMetricBase(BaseModel):
    container_id: str
    container_name: str
    cpu_percent: float
    memory_usage: float
    memory_limit: float
    memory_percent: float
    network_rx: float
    network_tx: float


class AlertBase(BaseModel):
    container_id: Optional[str] = None
    container_name: Optional[str] = None
    severity: str
    message: str


class AlertResponse(AlertBase):
    id: int
    is_acknowledged: bool
    created_at: datetime
    acknowledged_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class HealthResponse(BaseModel):
    status: str
    version: str
    docker_connected: bool
    database_connected: bool
    timestamp: datetime
