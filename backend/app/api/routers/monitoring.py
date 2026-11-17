from fastapi import APIRouter, HTTPException
from app.services.monitoring_engine import monitoring_engine
from app.websocket.manager import manager
from app.schemas.monitoring import MonitoringSettings, UpdateMonitoringSettingsRequest

router = APIRouter()


@router.get("/settings", response_model=MonitoringSettings)
async def get_monitoring_settings():
    """Retrieve current monitoring engine interval, persistence interval and retention status."""
    return MonitoringSettings(
        interval_ms=monitoring_engine.interval_ms,
        persistence_interval_ms=monitoring_engine.persistence_interval_ms,
        retention_days=monitoring_engine.retention_days,
        is_active=monitoring_engine.is_running,
        connected_clients=len(manager.active_connections),
    )


@router.post("/settings", response_model=MonitoringSettings)
async def update_monitoring_settings(body: UpdateMonitoringSettingsRequest):
    """Update monitoring sampling frequency or persistence dynamically without restarting the server."""
    if body.interval_ms is not None:
        if body.interval_ms < 500 or body.interval_ms > 60000:
            raise HTTPException(
                status_code=400,
                detail="Sampling interval must be between 500ms and 60000ms"
            )
        monitoring_engine.set_interval(body.interval_ms)

    if body.persistence_interval_ms is not None:
        if body.persistence_interval_ms < 1000 or body.persistence_interval_ms > 60000:
            raise HTTPException(
                status_code=400,
                detail="Persistence interval must be between 1000ms and 60000ms"
            )
        monitoring_engine.set_persistence_interval(body.persistence_interval_ms)

    if body.retention_days is not None:
        if body.retention_days < 1 or body.retention_days > 365:
            raise HTTPException(
                status_code=400,
                detail="Retention period must be between 1 and 365 days"
            )
        monitoring_engine.set_retention_days(body.retention_days)

    return MonitoringSettings(
        interval_ms=monitoring_engine.interval_ms,
        persistence_interval_ms=monitoring_engine.persistence_interval_ms,
        retention_days=monitoring_engine.retention_days,
        is_active=monitoring_engine.is_running,
        connected_clients=len(manager.active_connections),
    )


@router.get("/snapshot")
async def get_monitoring_snapshot():
    """Return the latest in-memory metric frame collected by the engine."""
    return monitoring_engine._last_metrics or {"type": "empty", "data": {}}
