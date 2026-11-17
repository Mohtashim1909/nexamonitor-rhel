from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class ContainerRealtimeMetric(BaseModel):
    container_id: str
    container_name: str
    status: str
    cpu_usage_percent: float
    cpu_usage_total: int
    cpu_system_usage: int
    cpu_count: int
    memory_usage_bytes: int
    memory_limit_bytes: int
    memory_usage_percent: float
    memory_cache_bytes: int
    memory_available_bytes: int
    network_rx_bytes: int
    network_tx_bytes: int
    network_rx_packets: int
    network_tx_packets: int
    network_rx_errors: int
    network_tx_errors: int
    network_rx_dropped: int
    network_tx_dropped: int
    network_rx_bytes_per_sec: float
    network_tx_bytes_per_sec: float
    network_rx_mbps: float
    network_tx_mbps: float
    disk_read_bytes: int = 0
    disk_write_bytes: int = 0
    disk_read_bytes_per_sec: float = 0.0
    disk_write_bytes_per_sec: float = 0.0
    timestamp: str


class MonitoringSettings(BaseModel):
    interval_ms: int = Field(1000, description="Sampling interval in milliseconds (1000, 2000, 5000, 10000)")
    persistence_interval_ms: int = Field(5000, description="Database persistence interval in milliseconds")
    retention_days: int = Field(30, description="Historical data retention in days")
    supported_intervals_ms: List[int] = [1000, 2000, 5000, 10000]
    is_active: bool = True
    connected_clients: int = 0


class UpdateMonitoringSettingsRequest(BaseModel):
    interval_ms: Optional[int] = Field(None, description="Sampling interval in milliseconds (500 to 60000)")
    persistence_interval_ms: Optional[int] = Field(None, description="Persistence interval in milliseconds (1000 to 60000)")
    retention_days: Optional[int] = Field(None, description="Retention duration in days (1 to 365)")
