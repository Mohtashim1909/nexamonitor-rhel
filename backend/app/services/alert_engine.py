"""
NexaMonitor Intelligent Alert Engine
Evaluates container and host thresholds, manages alert lifecycle (ACTIVE, ACKNOWLEDGED, RESOLVED),
applies hysteresis to prevent flapping, deduplicates consecutive events, and broadcasts real-time updates.
"""

from typing import List, Optional, Dict, Any, Tuple
import datetime
import logging
import asyncio
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.models.metrics import Alert
from app.database.connection import SessionLocal

logger = logging.getLogger("nexamonitor.alert_engine")


class AlertSettings(BaseModel):
    # CPU Thresholds and Hysteresis Recovery
    cpu_warning_threshold: float = Field(75.0, ge=1.0, le=100.0)
    cpu_critical_threshold: float = Field(90.0, ge=1.0, le=100.0)
    cpu_recovery_warning: float = Field(70.0, ge=1.0, le=100.0)
    cpu_recovery_critical: float = Field(85.0, ge=1.0, le=100.0)

    # Memory Thresholds and Hysteresis Recovery
    memory_warning_threshold: float = Field(80.0, ge=1.0, le=100.0)
    memory_critical_threshold: float = Field(90.0, ge=1.0, le=100.0)
    memory_recovery_warning: float = Field(75.0, ge=1.0, le=100.0)
    memory_recovery_critical: float = Field(85.0, ge=1.0, le=100.0)

    # Host Disk Thresholds
    disk_warning_threshold: float = Field(80.0, ge=1.0, le=100.0)
    disk_critical_threshold: float = Field(95.0, ge=1.0, le=100.0)

    # Feature Toggles
    container_lifecycle_enabled: bool = True
    docker_daemon_enabled: bool = True
    enabled: bool = True


def alert_to_dict(alert: Alert) -> Dict[str, Any]:
    """Serialize an Alert ORM object into a dictionary for JSON and WebSocket payloads."""
    return {
        "id": alert.id,
        "container_id": alert.container_id,
        "container_name": alert.container_name,
        "alert_type": alert.alert_type,
        "severity": alert.severity,
        "status": alert.status,
        "title": alert.title or alert.message,
        "message": alert.message,
        "description": alert.description,
        "observed_value": alert.observed_value,
        "threshold_value": alert.threshold_value,
        "occurrence_count": alert.occurrence_count,
        "is_acknowledged": alert.is_acknowledged,
        "created_at": alert.created_at.isoformat() if alert.created_at else None,
        "triggered_at": alert.triggered_at.isoformat() if alert.triggered_at else None,
        "last_occurrence": alert.last_occurrence.isoformat() if alert.last_occurrence else None,
        "acknowledged_at": alert.acknowledged_at.isoformat() if alert.acknowledged_at else None,
        "resolved_at": alert.resolved_at.isoformat() if alert.resolved_at else None,
    }


class AlertEngine:
    def __init__(self):
        self.settings = AlertSettings()
        # In-memory mapping: (container_id, alert_type) -> alert_id for ACTIVE / ACKNOWLEDGED alerts
        self._active_alert_ids: Dict[Tuple[Optional[str], str], int] = {}
        self._initialized = False

    def _ensure_active_cache(self, db: Session):
        """Populate active alert cache from database on startup or first evaluation."""
        if not self._initialized:
            try:
                active_records = (
                    db.query(Alert.id, Alert.container_id, Alert.alert_type)
                    .filter(Alert.status.in_(["ACTIVE", "ACKNOWLEDGED"]))
                    .all()
                )
                for rec in active_records:
                    self._active_alert_ids[(rec.container_id, rec.alert_type)] = rec.id
                self._initialized = True
            except Exception as e:
                logger.debug(f"Could not initialize active alert cache: {e}")

    def _broadcast_alert(self, event_type: str, alert_data: Dict[str, Any]):
        """Safely broadcast WebSocket alert event to active clients."""
        try:
            from app.websocket.manager import manager
            if not manager.active_connections:
                return

            payload = {
                "type": event_type,
                "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                "data": alert_data,
            }

            try:
                loop = asyncio.get_running_loop()
                loop.create_task(manager.broadcast(payload))
            except RuntimeError:
                # Running from a synchronous worker thread; schedule onto running loop if present
                pass
        except Exception as e:
            logger.debug(f"Failed to broadcast alert event: {e}")

    # =========================================================================
    # Threshold Evaluation Logic with Hysteresis & Deduplication
    # =========================================================================

    def evaluate_container_metrics(
        self,
        db: Session,
        container_id: str,
        container_name: str,
        cpu_percent: Optional[float],
        memory_percent: Optional[float],
        memory_usage_bytes: Optional[int] = None,
        memory_limit_bytes: Optional[int] = None,
    ) -> List[Alert]:
        """
        Evaluate CPU and Memory metrics for a running container.
        Applies hysteresis to prevent flapping, deduplicates consecutive events,
        and automatically resolves alerts when metrics normalize.
        """
        if not self.settings.enabled:
            return []

        self._ensure_active_cache(db)
        emitted_alerts: List[Alert] = []

        # 1. CPU Threshold Evaluation
        if cpu_percent is not None:
            alert = self._evaluate_metric_threshold(
                db=db,
                container_id=container_id,
                container_name=container_name,
                alert_type="CPU_THRESHOLD",
                metric_name="CPU",
                observed_value=cpu_percent,
                unit="%",
                warning_threshold=self.settings.cpu_warning_threshold,
                critical_threshold=self.settings.cpu_critical_threshold,
                recovery_warning=self.settings.cpu_recovery_warning,
                recovery_critical=self.settings.cpu_recovery_critical,
            )
            if alert:
                emitted_alerts.append(alert)

        # 2. Memory Threshold Evaluation
        # If container has unlimited memory (e.g. limit > 1PB), skip memory percentage checks
        is_unlimited_mem = memory_limit_bytes and memory_limit_bytes > 1_000_000_000_000_000
        if memory_percent is not None and not is_unlimited_mem:
            alert = self._evaluate_metric_threshold(
                db=db,
                container_id=container_id,
                container_name=container_name,
                alert_type="MEMORY_THRESHOLD",
                metric_name="Memory",
                observed_value=memory_percent,
                unit="%",
                warning_threshold=self.settings.memory_warning_threshold,
                critical_threshold=self.settings.memory_critical_threshold,
                recovery_warning=self.settings.memory_recovery_warning,
                recovery_critical=self.settings.memory_recovery_critical,
            )
            if alert:
                emitted_alerts.append(alert)

        return emitted_alerts

    def _evaluate_metric_threshold(
        self,
        db: Session,
        container_id: Optional[str],
        container_name: Optional[str],
        alert_type: str,
        metric_name: str,
        observed_value: float,
        unit: str,
        warning_threshold: float,
        critical_threshold: float,
        recovery_warning: float,
        recovery_critical: float,
    ) -> Optional[Alert]:
        """
        Generic hysteresis state machine for any scalar metric.
        Handles:
          - Warning breach
          - Critical breach
          - Severity escalation (warning -> critical)
          - Severity de-escalation with hysteresis (critical -> warning)
          - Automatic resolution with hysteresis (metric drops below recovery_warning)
          - Consecutive sample deduplication (increments occurrence_count, updates last_occurrence)
        """
        cache_key = (container_id, alert_type)
        existing_alert_id = self._active_alert_ids.get(cache_key)
        now_dt = datetime.datetime.utcnow()

        existing_alert: Optional[Alert] = None
        if existing_alert_id:
            existing_alert = db.query(Alert).filter(Alert.id == existing_alert_id).first()
            if not existing_alert or existing_alert.status == "RESOLVED":
                # Invalidate stale cache
                self._active_alert_ids.pop(cache_key, None)
                existing_alert = None

        # Determine target severity based on current value and hysteresis
        target_severity: Optional[str] = None
        threshold_val: Optional[float] = None

        if observed_value >= critical_threshold:
            target_severity = "critical"
            threshold_val = critical_threshold
        elif observed_value >= warning_threshold:
            # If already critical, only de-escalate to warning if below recovery_critical (hysteresis)
            if existing_alert and existing_alert.severity == "critical":
                if observed_value >= recovery_critical:
                    target_severity = "critical"
                    threshold_val = critical_threshold
                else:
                    target_severity = "warning"
                    threshold_val = warning_threshold
            else:
                target_severity = "warning"
                threshold_val = warning_threshold
        else:
            # Below warning threshold: check hysteresis recovery
            if existing_alert:
                if existing_alert.severity == "critical" and observed_value >= recovery_critical:
                    target_severity = "critical"
                    threshold_val = critical_threshold
                elif observed_value >= recovery_warning:
                    # In hysteresis band between recovery_warning and warning_threshold
                    target_severity = "warning"
                    threshold_val = warning_threshold
                else:
                    # Dropped below recovery_warning -> RESOLVE
                    target_severity = None
            else:
                target_severity = None

        # Case 1: Threshold is breached
        if target_severity is not None:
            display_name = container_name or container_id or "Host"
            title = f"{metric_name} {target_severity.capitalize()} on {display_name}"
            msg = (
                f"{metric_name} usage is at {observed_value:.1f}{unit}, "
                f"exceeding the {target_severity} threshold of {threshold_val:.1f}{unit}"
            )

            if existing_alert is None:
                # Brand new alert
                new_alert = Alert(
                    container_id=container_id,
                    container_name=container_name,
                    alert_type=alert_type,
                    severity=target_severity,
                    status="ACTIVE",
                    title=title,
                    message=msg,
                    description=f"Automated {metric_name} threshold trigger",
                    observed_value=round(observed_value, 2),
                    threshold_value=threshold_val,
                    occurrence_count=1,
                    is_acknowledged=False,
                    created_at=now_dt,
                    triggered_at=now_dt,
                    last_occurrence=now_dt,
                )
                db.add(new_alert)
                db.commit()
                db.refresh(new_alert)

                self._active_alert_ids[cache_key] = new_alert.id
                logger.info(f"New Alert [{target_severity}]: {msg}")
                self._broadcast_alert("alert_created", alert_to_dict(new_alert))
                return new_alert

            else:
                # Existing active/acknowledged alert
                is_severity_change = existing_alert.severity != target_severity
                existing_alert.occurrence_count += 1
                existing_alert.last_occurrence = now_dt
                existing_alert.observed_value = round(observed_value, 2)

                if is_severity_change:
                    # Severity escalated or de-escalated
                    existing_alert.severity = target_severity
                    existing_alert.threshold_value = threshold_val
                    existing_alert.title = title
                    existing_alert.message = msg
                    if target_severity == "critical":
                        # Escalating to critical resets unacknowledged status
                        existing_alert.status = "ACTIVE"
                        existing_alert.is_acknowledged = False
                    db.commit()
                    db.refresh(existing_alert)
                    logger.info(f"Alert [{existing_alert.id}] changed severity to {target_severity}: {msg}")
                    self._broadcast_alert("alert_created", alert_to_dict(existing_alert))
                else:
                    # Deduplicated sample update without spamming WebSocket alerts
                    db.commit()

                return existing_alert

        # Case 2: Metric returned to normal -> Auto-resolve active alert
        elif existing_alert is not None:
            existing_alert.status = "RESOLVED"
            existing_alert.resolved_at = now_dt
            existing_alert.observed_value = round(observed_value, 2)
            db.commit()
            db.refresh(existing_alert)

            self._active_alert_ids.pop(cache_key, None)
            logger.info(
                f"Alert [{existing_alert.id}] auto-resolved: {metric_name} dropped to {observed_value:.1f}{unit}"
            )
            self._broadcast_alert("alert_resolved", alert_to_dict(existing_alert))
            return existing_alert

        return None

    # =========================================================================
    # Lifecycle & System Alert Evaluation
    # =========================================================================

    def evaluate_container_lifecycle(
        self,
        db: Session,
        container_id: str,
        container_name: str,
        status: str,
        exit_code: Optional[int] = None,
    ) -> Optional[Alert]:
        """Evaluate container status and trigger alert if exited unexpectedly."""
        if not self.settings.enabled or not self.settings.container_lifecycle_enabled:
            return None

        self._ensure_active_cache(db)
        cache_key = (container_id, "CONTAINER_LIFECYCLE")
        existing_alert_id = self._active_alert_ids.get(cache_key)

        now_dt = datetime.datetime.utcnow()

        if status in ("exited", "dead") and exit_code not in (0, None):
            title = f"Container {container_name} Exited (Code: {exit_code})"
            msg = f"Container {container_name} failed unexpectedly with exit code {exit_code}."
            if existing_alert_id:
                alert = db.query(Alert).filter(Alert.id == existing_alert_id).first()
                if alert and alert.status != "RESOLVED":
                    alert.occurrence_count += 1
                    alert.last_occurrence = now_dt
                    db.commit()
                    return alert

            alert = Alert(
                container_id=container_id,
                container_name=container_name,
                alert_type="CONTAINER_LIFECYCLE",
                severity="critical" if exit_code != 0 else "warning",
                status="ACTIVE",
                title=title,
                message=msg,
                description=f"Status: {status}, ExitCode: {exit_code}",
                observed_value=float(exit_code),
                threshold_value=0.0,
                occurrence_count=1,
                is_acknowledged=False,
                created_at=now_dt,
                triggered_at=now_dt,
                last_occurrence=now_dt,
            )
            db.add(alert)
            db.commit()
            db.refresh(alert)
            self._active_alert_ids[cache_key] = alert.id
            self._broadcast_alert("alert_created", alert_to_dict(alert))
            return alert

        elif status == "running" and existing_alert_id:
            # Container recovered and is now running
            alert = db.query(Alert).filter(Alert.id == existing_alert_id).first()
            if alert and alert.status != "RESOLVED":
                alert.status = "RESOLVED"
                alert.resolved_at = now_dt
                db.commit()
                db.refresh(alert)
                self._active_alert_ids.pop(cache_key, None)
                self._broadcast_alert("alert_resolved", alert_to_dict(alert))
                return alert

        return None

    def evaluate_docker_connection(
        self,
        db: Session,
        is_connected: bool,
        error_msg: Optional[str] = None,
    ) -> Optional[Alert]:
        """Trigger or resolve an alert when Docker Engine connection state changes."""
        if not self.settings.enabled or not self.settings.docker_daemon_enabled:
            return None

        self._ensure_active_cache(db)
        cache_key = (None, "DOCKER_ENGINE")
        existing_alert_id = self._active_alert_ids.get(cache_key)
        now_dt = datetime.datetime.utcnow()

        if not is_connected:
            title = "Docker Engine Disconnected"
            msg = f"Lost connection to Docker daemon socket: {error_msg or 'Socket unavailable'}"

            if existing_alert_id:
                alert = db.query(Alert).filter(Alert.id == existing_alert_id).first()
                if alert and alert.status != "RESOLVED":
                    alert.occurrence_count += 1
                    alert.last_occurrence = now_dt
                    db.commit()
                    return alert

            alert = Alert(
                container_id=None,
                container_name=None,
                alert_type="DOCKER_ENGINE",
                severity="critical",
                status="ACTIVE",
                title=title,
                message=msg,
                description=error_msg,
                observed_value=0.0,
                threshold_value=1.0,
                occurrence_count=1,
                is_acknowledged=False,
                created_at=now_dt,
                triggered_at=now_dt,
                last_occurrence=now_dt,
            )
            db.add(alert)
            db.commit()
            db.refresh(alert)
            self._active_alert_ids[cache_key] = alert.id
            self._broadcast_alert("alert_created", alert_to_dict(alert))
            return alert

        elif is_connected and existing_alert_id:
            alert = db.query(Alert).filter(Alert.id == existing_alert_id).first()
            if alert and alert.status != "RESOLVED":
                alert.status = "RESOLVED"
                alert.resolved_at = now_dt
                db.commit()
                db.refresh(alert)
                self._active_alert_ids.pop(cache_key, None)
                self._broadcast_alert("alert_resolved", alert_to_dict(alert))
                return alert

        return None

    def evaluate_host_metrics(self, db: Session, metrics: dict):
        """Check host-level metrics and create alerts when thresholds are breached."""
        if not self.settings.enabled:
            return

        cpu = metrics.get("cpu", {}).get("percent", 0.0)
        mem = metrics.get("memory", {}).get("percent", 0.0)
        disk = metrics.get("disk", {}).get("percent", 0.0)

        # Host CPU
        self._evaluate_metric_threshold(
            db=db,
            container_id=None,
            container_name=None,
            alert_type="HOST_CPU",
            metric_name="Host CPU",
            observed_value=cpu,
            unit="%",
            warning_threshold=self.settings.cpu_warning_threshold,
            critical_threshold=self.settings.cpu_critical_threshold,
            recovery_warning=self.settings.cpu_recovery_warning,
            recovery_critical=self.settings.cpu_recovery_critical,
        )

        # Host Memory
        self._evaluate_metric_threshold(
            db=db,
            container_id=None,
            container_name=None,
            alert_type="HOST_MEMORY",
            metric_name="Host Memory",
            observed_value=mem,
            unit="%",
            warning_threshold=self.settings.memory_warning_threshold,
            critical_threshold=self.settings.memory_critical_threshold,
            recovery_warning=self.settings.memory_recovery_warning,
            recovery_critical=self.settings.memory_recovery_critical,
        )

        # Host Disk
        self._evaluate_metric_threshold(
            db=db,
            container_id=None,
            container_name=None,
            alert_type="HOST_DISK",
            metric_name="Host Disk",
            observed_value=disk,
            unit="%",
            warning_threshold=self.settings.disk_warning_threshold,
            critical_threshold=self.settings.disk_critical_threshold,
            recovery_warning=self.settings.disk_warning_threshold - 5.0,
            recovery_critical=self.settings.disk_critical_threshold - 5.0,
        )

    # =========================================================================
    # Alert Query and Management Operations
    # =========================================================================

    def get_alerts(
        self,
        db: Session,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        container_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Alert]:
        """Query alerts with flexible filtering and pagination."""
        query = db.query(Alert)

        if status:
            status_upper = status.upper()
            if status_upper in ("ACTIVE", "ACKNOWLEDGED", "RESOLVED"):
                query = query.filter(Alert.status == status_upper)
            elif status_upper == "UNRESOLVED":
                query = query.filter(Alert.status.in_(["ACTIVE", "ACKNOWLEDGED"]))

        if severity and severity.lower() != "all":
            query = query.filter(Alert.severity == severity.lower())

        if container_id and container_id != "all":
            query = query.filter(Alert.container_id == container_id)

        return (
            query.order_by(desc(Alert.triggered_at), desc(Alert.id))
            .offset(offset)
            .limit(limit)
            .all()
        )

    def get_active_alerts(self, db: Session, limit: int = 100) -> List[Alert]:
        """Retrieve active or unacknowledged alerts."""
        return (
            db.query(Alert)
            .filter(Alert.status.in_(["ACTIVE", "ACKNOWLEDGED"]))
            .order_by(desc(Alert.triggered_at), desc(Alert.id))
            .limit(limit)
            .all()
        )

    def get_alert_counts(self, db: Session) -> Dict[str, int]:
        """Compute triage counts by severity and status."""
        active_critical = (
            db.query(func.count(Alert.id))
            .filter(Alert.status == "ACTIVE", Alert.severity == "critical")
            .scalar()
            or 0
        )
        active_warning = (
            db.query(func.count(Alert.id))
            .filter(Alert.status == "ACTIVE", Alert.severity == "warning")
            .scalar()
            or 0
        )
        active_info = (
            db.query(func.count(Alert.id))
            .filter(Alert.status == "ACTIVE", Alert.severity == "info")
            .scalar()
            or 0
        )
        total_active = (
            db.query(func.count(Alert.id))
            .filter(Alert.status.in_(["ACTIVE", "ACKNOWLEDGED"]))
            .scalar()
            or 0
        )
        total_resolved = (
            db.query(func.count(Alert.id)).filter(Alert.status == "RESOLVED").scalar() or 0
        )

        return {
            "critical": active_critical,
            "warning": active_warning,
            "info": active_info,
            "active": total_active,
            "resolved": total_resolved,
            "total": total_active + total_resolved,
        }

    def acknowledge_alert(self, db: Session, alert_id: int) -> Optional[Alert]:
        """Mark an alert as ACKNOWLEDGED."""
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        if alert:
            alert.is_acknowledged = True
            alert.status = "ACKNOWLEDGED"
            alert.acknowledged_at = datetime.datetime.utcnow()
            db.commit()
            db.refresh(alert)
            self._broadcast_alert("alert_acknowledged", alert_to_dict(alert))
        return alert

    def acknowledge_all_alerts(self, db: Session) -> int:
        """Acknowledge all ACTIVE alerts simultaneously."""
        now_dt = datetime.datetime.utcnow()
        active_alerts = db.query(Alert).filter(Alert.status == "ACTIVE").all()
        count = len(active_alerts)
        for a in active_alerts:
            a.is_acknowledged = True
            a.status = "ACKNOWLEDGED"
            a.acknowledged_at = now_dt
            self._broadcast_alert("alert_acknowledged", alert_to_dict(a))
        db.commit()
        return count

    def resolve_alert(self, db: Session, alert_id: int) -> Optional[Alert]:
        """Manually mark an alert as RESOLVED."""
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        if alert:
            alert.status = "RESOLVED"
            alert.resolved_at = datetime.datetime.utcnow()
            db.commit()
            db.refresh(alert)
            cache_key = (alert.container_id, alert.alert_type)
            self._active_alert_ids.pop(cache_key, None)
            self._broadcast_alert("alert_resolved", alert_to_dict(alert))
        return alert

    # =========================================================================
    # Settings Management
    # =========================================================================

    def get_settings(self) -> Dict[str, Any]:
        """Return the current active threshold rules and configuration."""
        return self.settings.model_dump()

    def update_settings(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and apply dynamic alert threshold updates."""
        current = self.settings.model_dump()
        current.update(updates)
        self.settings = AlertSettings(**current)
        logger.info(f"Alert engine settings updated: {self.settings}")
        return self.settings.model_dump()


alert_engine = AlertEngine()
