from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class MetricHistoryPoint(BaseModel):
    timestamp: str
    time: str
    cpu: Optional[float] = None
    cpu_avg: Optional[float] = None
    cpu_max: Optional[float] = None
    cpu_min: Optional[float] = None
    memory: Optional[float] = None  # in MB for chart ease
    memory_percent: Optional[float] = None
    memory_max: Optional[float] = None
    memory_min: Optional[float] = None
    network_rx_speed: Optional[float] = None  # bytes/sec
    network_tx_speed: Optional[float] = None  # bytes/sec
    network_rx_kb: Optional[float] = None     # KB/s for chart
    network_tx_kb: Optional[float] = None     # KB/s for chart
    disk_read_speed: Optional[float] = None   # bytes/sec
    disk_write_speed: Optional[float] = None  # bytes/sec
    disk_read_kb: Optional[float] = None      # KB/s for chart
    disk_write_kb: Optional[float] = None     # KB/s for chart


class ContainerHistoryResponse(BaseModel):
    container_id: str
    container_name: Optional[str] = None
    start_time: str
    end_time: str
    interval: str
    metric: str
    points: List[MetricHistoryPoint] = []


class MetricStats(BaseModel):
    avg: float = 0.0
    max: float = 0.0
    min: float = 0.0
    trend: str = "stable"


class MemoryStats(BaseModel):
    avg_bytes: int = 0
    peak_bytes: int = 0
    min_bytes: int = 0
    avg_percent: float = 0.0
    peak_percent: float = 0.0
    limit_bytes: int = 0


class NetworkStats(BaseModel):
    total_rx_bytes: int = 0
    total_tx_bytes: int = 0
    avg_rx_speed: float = 0.0
    avg_tx_speed: float = 0.0
    peak_rx_speed: float = 0.0
    peak_tx_speed: float = 0.0


class DiskStats(BaseModel):
    total_read_bytes: int = 0
    total_write_bytes: int = 0
    avg_read_speed: float = 0.0
    avg_write_speed: float = 0.0


class ContainerSummaryResponse(BaseModel):
    container_id: str
    container_name: Optional[str] = None
    time_range: str
    start_time: str
    end_time: str
    sample_count: int
    cpu: MetricStats
    memory: MemoryStats
    network: NetworkStats
    disk: DiskStats


class ClusterOverviewAnalytics(BaseModel):
    time_range: str
    start_time: str
    end_time: str
    total_containers_tracked: int
    total_samples: int
    cpu: MetricStats
    memory: MemoryStats
    network: NetworkStats
    disk: DiskStats
    series: List[Dict[str, Any]] = []


class ContainerComparisonMetric(BaseModel):
    container_id: str
    container_name: str
    status: Optional[str] = "running"
    uptime: Optional[str] = "N/A"
    restart_count: int = 0
    avg_cpu: float = 0.0
    peak_cpu: float = 0.0
    avg_memory_mb: float = 0.0
    peak_memory_mb: float = 0.0
    peak_memory_percent: float = 0.0
    total_network_bytes: int = 0
    total_disk_bytes: int = 0
    is_highest_cpu: bool = False
    is_highest_memory: bool = False
    is_highest_network: bool = False
    is_highest_disk: bool = False


class ContainerComparisonResponse(BaseModel):
    time_range: str
    start_time: str
    end_time: str
    containers: List[ContainerComparisonMetric] = []
    series: List[Dict[str, Any]] = []


class ConsumerRanking(BaseModel):
    container_id: str
    container_name: str
    value: float
    unit: str
    avg_cpu: float = 0.0
    peak_cpu: float = 0.0
    avg_memory_mb: float = 0.0
    peak_memory_mb: float = 0.0
    network_rx_bytes: int = 0
    network_tx_bytes: int = 0
    disk_read_bytes: int = 0
    disk_write_bytes: int = 0


class TopConsumersResponse(BaseModel):
    time_range: str
    metric: str
    sort_by: str
    rankings: List[ConsumerRanking] = []
