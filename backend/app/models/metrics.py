from sqlalchemy import Column, Integer, BigInteger, String, Float, DateTime, Boolean, Index
from sqlalchemy.sql import func
from app.database.connection import Base


class ContainerMetric(Base):
    __tablename__ = "container_metrics"

    id = Column(Integer, primary_key=True, index=True)
    container_id = Column(String, index=True, nullable=False)
    container_name = Column(String, nullable=True)

    # CPU metrics
    cpu_percent = Column(Float, nullable=True)
    cpu_usage_total = Column(BigInteger, nullable=True)

    # Memory metrics
    memory_usage = Column(BigInteger, nullable=True)
    memory_limit = Column(BigInteger, nullable=True)
    memory_percent = Column(Float, nullable=True)

    # Network metrics (cumulative counters and real-time speeds in bytes/sec)
    network_rx = Column(BigInteger, nullable=True)
    network_tx = Column(BigInteger, nullable=True)
    network_rx_speed = Column(Float, nullable=True)
    network_tx_speed = Column(Float, nullable=True)

    # Disk I/O metrics (cumulative bytes and speeds in bytes/sec)
    disk_read_bytes = Column(BigInteger, nullable=True)
    disk_write_bytes = Column(BigInteger, nullable=True)
    disk_read_speed = Column(Float, nullable=True)
    disk_write_speed = Column(Float, nullable=True)

    # Timestamp
    timestamp = Column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_container_metrics_cid_timestamp", "container_id", "timestamp"),
        Index("ix_container_metrics_timestamp", "timestamp"),
    )


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    container_id = Column(String, index=True, nullable=True)
    container_name = Column(String, nullable=True)
    alert_type = Column(String, index=True, nullable=False, default="RESOURCE_THRESHOLD")
    severity = Column(String, index=True, nullable=False)  # critical, warning, info
    status = Column(String, nullable=False, default="ACTIVE")  # ACTIVE, ACKNOWLEDGED, RESOLVED
    title = Column(String, nullable=False, default="")
    message = Column(String, nullable=False)
    description = Column(String, nullable=True)
    observed_value = Column(Float, nullable=True)
    threshold_value = Column(Float, nullable=True)
    occurrence_count = Column(Integer, default=1, nullable=False)
    is_acknowledged = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    triggered_at = Column(DateTime, server_default=func.now(), nullable=False)
    last_occurrence = Column(DateTime, server_default=func.now(), nullable=False)
    acknowledged_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_alerts_status", "status"),
        Index("ix_alerts_container_id_status", "container_id", "status"),
        Index("ix_alerts_triggered_at", "triggered_at"),
    )
