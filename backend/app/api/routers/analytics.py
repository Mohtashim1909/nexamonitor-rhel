import logging
from typing import Optional, List
from fastapi import APIRouter, Query, HTTPException, Path
from app.services.analytics_service import analytics_service
from app.services.monitoring_engine import monitoring_engine
from app.schemas.analytics import (
    ContainerHistoryResponse,
    ContainerSummaryResponse,
    ClusterOverviewAnalytics,
    ContainerComparisonResponse,
    TopConsumersResponse,
)

logger = logging.getLogger("nexamonitor.api.analytics")
router = APIRouter()


@router.get("/containers/{container_id}/history", response_model=ContainerHistoryResponse)
async def get_container_history(
    container_id: str = Path(..., description="Container ID or prefix"),
    start_time: Optional[str] = Query(None, description="Start timestamp (ISO 8601)"),
    end_time: Optional[str] = Query(None, description="End timestamp (ISO 8601)"),
    time_range: Optional[str] = Query("24h", description="Preset time range (15m, 30m, 1h, 6h, 12h, 24h, 7d, 30d)"),
    interval: Optional[str] = Query("auto", description="Aggregation bucket interval (e.g. auto, 1m, 5m, 1h)"),
    metric: Optional[str] = Query("all", description="Metric filter (all, cpu, memory, network, disk)"),
):
    """Retrieve time-series historical resource statistics for a container."""
    try:
        start_dt, end_dt, effective_label = analytics_service.parse_time_range(time_range, start_time, end_time)
        return analytics_service.get_container_history(
            container_id=container_id,
            start_dt=start_dt,
            end_dt=end_dt,
            interval=interval,
            metric=metric,
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error querying container history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve container historical telemetry")


@router.get("/containers/{container_id}/summary", response_model=ContainerSummaryResponse)
async def get_container_summary(
    container_id: str = Path(..., description="Container ID or prefix"),
    time_range: Optional[str] = Query("24h", description="Preset time range (15m, 30m, 1h, 6h, 12h, 24h, 7d, 30d)"),
    start_time: Optional[str] = Query(None, description="Start timestamp (ISO 8601)"),
    end_time: Optional[str] = Query(None, description="End timestamp (ISO 8601)"),
):
    """Compute aggregate statistical summary for a container over the requested time window."""
    try:
        start_dt, end_dt, effective_label = analytics_service.parse_time_range(time_range, start_time, end_time)
        return analytics_service.get_container_summary(
            container_id=container_id,
            start_dt=start_dt,
            end_dt=end_dt,
            time_range_label=effective_label,
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error computing container summary: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to calculate container summary statistics")


@router.get("/overview", response_model=ClusterOverviewAnalytics)
async def get_cluster_overview_analytics(
    time_range: Optional[str] = Query("24h", description="Preset time range (15m, 30m, 1h, 6h, 12h, 24h, 7d, 30d)"),
    start_time: Optional[str] = Query(None, description="Start timestamp (ISO 8601)"),
    end_time: Optional[str] = Query(None, description="End timestamp (ISO 8601)"),
):
    """Retrieve cluster-wide aggregated analytics, overall stats and multi-metric trends."""
    try:
        start_dt, end_dt, effective_label = analytics_service.parse_time_range(time_range, start_time, end_time)
        return analytics_service.get_cluster_overview(
            start_dt=start_dt,
            end_dt=end_dt,
            time_range_label=effective_label,
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error computing cluster overview analytics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve cluster overview analytics")


@router.get("/containers/comparison", response_model=ContainerComparisonResponse)
async def compare_containers_analytics(
    container_ids: Optional[str] = Query(None, description="Comma-separated container IDs"),
    time_range: Optional[str] = Query("24h", description="Preset time range"),
    start_time: Optional[str] = Query(None, description="Start timestamp (ISO 8601)"),
    end_time: Optional[str] = Query(None, description="End timestamp (ISO 8601)"),
    metric: Optional[str] = Query("all", description="Metric focus"),
):
    """Compare resource consumption across multiple containers over a shared time period."""
    try:
        cids: List[str] = []
        if container_ids:
            cids = [c.strip() for c in container_ids.split(",") if c.strip()]
        start_dt, end_dt, effective_label = analytics_service.parse_time_range(time_range, start_time, end_time)
        return analytics_service.compare_containers(
            container_ids=cids,
            start_dt=start_dt,
            end_dt=end_dt,
            metric=metric or "all",
            time_range_label=effective_label,
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error generating comparison analytics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to compare container resource metrics")


@router.get("/top-consumers", response_model=TopConsumersResponse)
async def get_top_consumers_analytics(
    time_range: Optional[str] = Query("24h", description="Preset time range (15m, 30m, 1h, 6h, 12h, 24h, 7d, 30d)"),
    metric: Optional[str] = Query("cpu", description="Ranking metric (cpu, memory, network, disk)"),
    limit: Optional[int] = Query(5, ge=1, le=50, description="Top N containers"),
    sort_by: Optional[str] = Query("avg", description="Sort by 'avg' or 'peak'"),
    start_time: Optional[str] = Query(None, description="Start timestamp (ISO 8601)"),
    end_time: Optional[str] = Query(None, description="End timestamp (ISO 8601)"),
):
    """Rank containers with the highest historical resource consumption."""
    try:
        if metric not in ("cpu", "memory", "network", "disk"):
            metric = "cpu"
        if sort_by not in ("avg", "peak"):
            sort_by = "avg"
        start_dt, end_dt, effective_label = analytics_service.parse_time_range(time_range, start_time, end_time)
        return analytics_service.get_top_consumers(
            start_dt=start_dt,
            end_dt=end_dt,
            metric=metric,
            limit=limit or 5,
            sort_by=sort_by,
            time_range_label=effective_label,
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error retrieving top consumers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to rank resource consumer workloads")


@router.post("/retention/cleanup")
async def trigger_retention_cleanup(
    retention_days: Optional[int] = Query(30, ge=1, le=365, description="Retention cutoff in days")
):
    """Manually invoke data retention cleanup of expired historical metrics."""
    try:
        days = retention_days or 30
        deleted = monitoring_engine.cleanup_old_metrics(days)
        return {
            "success": True,
            "deleted_records": deleted,
            "retention_days": days,
            "message": f"Cleaned up {deleted} records older than {days} days"
        }
    except Exception as e:
        logger.error(f"Error in retention cleanup endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to execute retention cleanup: {str(e)}")
