"""
Alerts API Router
Provides REST endpoints for querying, acknowledging, resolving alerts,
inspecting triage counters, and managing dynamic alert threshold rules.
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database.connection import get_db
from app.models.metrics import Alert
from app.services.alert_engine import alert_engine, alert_to_dict

router = APIRouter()


class AlertSettingsUpdateRequest(BaseModel):
    cpu_warning_threshold: Optional[float] = Field(None, ge=1.0, le=100.0)
    cpu_critical_threshold: Optional[float] = Field(None, ge=1.0, le=100.0)
    cpu_recovery_warning: Optional[float] = Field(None, ge=1.0, le=100.0)
    cpu_recovery_critical: Optional[float] = Field(None, ge=1.0, le=100.0)
    memory_warning_threshold: Optional[float] = Field(None, ge=1.0, le=100.0)
    memory_critical_threshold: Optional[float] = Field(None, ge=1.0, le=100.0)
    memory_recovery_warning: Optional[float] = Field(None, ge=1.0, le=100.0)
    memory_recovery_critical: Optional[float] = Field(None, ge=1.0, le=100.0)
    disk_warning_threshold: Optional[float] = Field(None, ge=1.0, le=100.0)
    disk_critical_threshold: Optional[float] = Field(None, ge=1.0, le=100.0)
    container_lifecycle_enabled: Optional[bool] = None
    docker_daemon_enabled: Optional[bool] = None
    enabled: Optional[bool] = None


@router.get("/")
@router.get("")
async def get_alerts(
    status: Optional[str] = Query(None, description="Filter by status: ACTIVE, ACKNOWLEDGED, RESOLVED, UNRESOLVED, or ALL"),
    severity: Optional[str] = Query(None, description="Filter by severity: critical, warning, info, or all"),
    container_id: Optional[str] = Query(None, description="Filter by specific container ID"),
    limit: int = Query(100, ge=1, le=500, description="Max alerts to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db),
):
    """List container and system alerts with multi-dimensional filtering."""
    alerts = alert_engine.get_alerts(
        db=db,
        status=status,
        severity=severity,
        container_id=container_id,
        limit=limit,
        offset=offset,
    )
    return [alert_to_dict(a) for a in alerts]


@router.get("/active")
async def get_active_alerts(
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Retrieve currently active and unacknowledged alerts with triage counts."""
    alerts = alert_engine.get_active_alerts(db=db, limit=limit)
    counts = alert_engine.get_alert_counts(db=db)
    return {
        "counts": counts,
        "alerts": [alert_to_dict(a) for a in alerts],
    }


@router.get("/counts")
async def get_alert_counts(db: Session = Depends(get_db)):
    """Retrieve summary counts partitioned by severity and lifecycle state."""
    return alert_engine.get_alert_counts(db=db)


@router.get("/history")
async def get_alert_history(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Retrieve historical / resolved alerts."""
    alerts = alert_engine.get_alerts(
        db=db,
        status="RESOLVED",
        limit=limit,
        offset=offset,
    )
    return [alert_to_dict(a) for a in alerts]


@router.get("/settings")
async def get_alert_settings():
    """Retrieve active threshold rules and configuration."""
    return alert_engine.get_settings()


@router.put("/settings")
async def update_alert_settings(
    payload: AlertSettingsUpdateRequest,
):
    """Update dynamic alert threshold rules and hysteresis parameters."""
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updated = alert_engine.update_settings(updates)
    return updated


@router.get("/{alert_id}")
async def get_alert_by_id(alert_id: int, db: Session = Depends(get_db)):
    """Retrieve details of a single alert by ID."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert_to_dict(alert)


@router.post("/{alert_id}/acknowledge")
@router.patch("/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: int, db: Session = Depends(get_db)):
    """Acknowledge an active alert."""
    alert = alert_engine.acknowledge_alert(db=db, alert_id=alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {
        "status": "acknowledged",
        "alert": alert_to_dict(alert),
    }


@router.post("/acknowledge-all")
async def acknowledge_all_alerts(db: Session = Depends(get_db)):
    """Acknowledge all ACTIVE alerts simultaneously."""
    count = alert_engine.acknowledge_all_alerts(db=db)
    return {
        "status": "acknowledged_all",
        "acknowledged_count": count,
    }


@router.post("/{alert_id}/resolve")
async def resolve_alert(alert_id: int, db: Session = Depends(get_db)):
    """Manually resolve an alert."""
    alert = alert_engine.resolve_alert(db=db, alert_id=alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {
        "status": "resolved",
        "alert": alert_to_dict(alert),
    }
