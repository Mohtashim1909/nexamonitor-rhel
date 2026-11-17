from fastapi import APIRouter, HTTPException, Query, Response, Body
from pydantic import BaseModel, Field
from app.services.docker_service import docker_service
from app.schemas.container import (
    ContainerSummary,
    ContainerActionResponse,
    ContainerLogsResponse,
)
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("", response_model=List[ContainerSummary])
@router.get("/", response_model=List[ContainerSummary], include_in_schema=False)
async def list_containers(all: bool = Query(True, description="Include stopped containers")):
    """Retrieve real running and stopped Docker containers."""
    if not docker_service.is_connected:
        status_info = docker_service.get_connection_status()
        err = status_info.get("error") or "Docker Engine is disconnected or unavailable"
        raise HTTPException(status_code=503, detail=f"Docker not connected: {err}")

    containers = docker_service.get_containers(all_containers=all)
    return containers


@router.get("/{container_id}", response_model=ContainerSummary)
async def get_container(container_id: str):
    """Retrieve detailed information for a specific container by ID or name."""
    if not docker_service.is_connected:
        status_info = docker_service.get_connection_status()
        err = status_info.get("error") or "Docker Engine is disconnected or unavailable"
        raise HTTPException(status_code=503, detail=f"Docker not connected: {err}")

    try:
        container = docker_service.get_container(container_id)
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))

    if not container:
        raise HTTPException(status_code=404, detail=f"Container '{container_id}' not found")
    return container


@router.get("/{container_id}/stats")
async def get_container_stats(container_id: str):
    """Retrieve container CPU, Memory, Network, and Block I/O statistics."""
    if not docker_service.is_connected:
        status_info = docker_service.get_connection_status()
        err = status_info.get("error") or "Docker Engine is disconnected or unavailable"
        raise HTTPException(status_code=503, detail=f"Docker not connected: {err}")

    try:
        stats = docker_service.get_container_stats(container_id)
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))

    if stats is None:
        # Check if container actually exists
        container = docker_service.get_container(container_id)
        if not container:
            raise HTTPException(status_code=404, detail=f"Container '{container_id}' not found")
        raise HTTPException(status_code=503, detail="Stats unavailable for container")
    return stats


@router.post("/{container_id}/start", response_model=ContainerActionResponse)
async def start_container(container_id: str):
    """Start a stopped Docker container."""
    if not docker_service.is_connected:
        raise HTTPException(status_code=503, detail="Docker not connected")

    try:
        result = docker_service.start_container(container_id)
        return result
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except LookupError as not_found:
        raise HTTPException(status_code=404, detail=str(not_found))
    except Exception as e:
        logger.error(f"Error starting container {container_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Docker operation failed: {e}")


@router.post("/{container_id}/stop", response_model=ContainerActionResponse)
async def stop_container(
    container_id: str,
    timeout: int = Query(10, ge=1, le=60, description="Grace period before killing")
):
    """Stop a running Docker container."""
    if not docker_service.is_connected:
        raise HTTPException(status_code=503, detail="Docker not connected")

    try:
        result = docker_service.stop_container(container_id, timeout=timeout)
        return result
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except LookupError as not_found:
        raise HTTPException(status_code=404, detail=str(not_found))
    except Exception as e:
        logger.error(f"Error stopping container {container_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Docker operation failed: {e}")


@router.post("/{container_id}/restart", response_model=ContainerActionResponse)
async def restart_container(
    container_id: str,
    timeout: int = Query(10, ge=1, le=60, description="Grace period before restarting")
):
    """Restart a Docker container."""
    if not docker_service.is_connected:
        raise HTTPException(status_code=503, detail="Docker not connected")

    try:
        result = docker_service.restart_container(container_id, timeout=timeout)
        return result
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except LookupError as not_found:
        raise HTTPException(status_code=404, detail=str(not_found))
    except Exception as e:
        logger.error(f"Error restarting container {container_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Docker operation failed: {e}")


@router.delete("/{container_id}", response_model=ContainerActionResponse)
async def remove_container(
    container_id: str,
    force: bool = Query(False, description="Force removal of a running container"),
    v: bool = Query(False, description="Remove associated volumes")
):
    """Delete a Docker container instance."""
    if not docker_service.is_connected:
        raise HTTPException(status_code=503, detail="Docker not connected")

    try:
        result = docker_service.remove_container(container_id, force=force, v=v)
        return result
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except LookupError as not_found:
        raise HTTPException(status_code=404, detail=str(not_found))
    except Exception as e:
        logger.error(f"Error removing container {container_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Docker removal failed: {e}")


class ContainerLimitUpdateRequest(BaseModel):
    mem_limit_bytes: Optional[int] = Field(None, ge=0, description="Memory limit in bytes")
    mem_reservation_bytes: Optional[int] = Field(None, ge=0, description="Soft memory reservation in bytes")
    cpu_quota: Optional[int] = Field(None, ge=0, description="CPU CFS quota in microseconds")
    cpu_period: Optional[int] = Field(None, ge=0, description="CPU CFS period in microseconds")
    cpu_shares: Optional[int] = Field(None, ge=0, description="CPU relative weighting shares")
    cpuset_cpus: Optional[str] = Field(None, description="Specific CPU core pinning (e.g. 0,1)")


@router.get("/{container_id}/limits")
async def get_container_limits(container_id: str):
    """Inspect configured CPU and memory resource constraints and compare to live consumption."""
    if not docker_service.is_connected:
        raise HTTPException(status_code=503, detail="Docker not connected")

    try:
        limits = docker_service.get_container_limits(container_id)
        return limits
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except LookupError as not_found:
        raise HTTPException(status_code=404, detail=str(not_found))
    except Exception as e:
        logger.error(f"Error reading limits for {container_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to inspect resource limits: {e}")


@router.put("/{container_id}/limits")
async def update_container_limits(
    container_id: str,
    payload: ContainerLimitUpdateRequest,
):
    """Dynamically modify CPU and memory limits on a running or stopped container."""
    if not docker_service.is_connected:
        raise HTTPException(status_code=503, detail="Docker not connected")

    try:
        result = docker_service.update_container_limits(
            container_id=container_id,
            mem_limit_bytes=payload.mem_limit_bytes,
            mem_reservation_bytes=payload.mem_reservation_bytes,
            cpu_quota=payload.cpu_quota,
            cpu_period=payload.cpu_period,
            cpu_shares=payload.cpu_shares,
            cpuset_cpus=payload.cpuset_cpus,
        )
        return result
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except LookupError as not_found:
        raise HTTPException(status_code=404, detail=str(not_found))
    except Exception as e:
        logger.error(f"Error updating limits for {container_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update resource limits: {e}")


@router.get("/{container_id}/logs", response_model=ContainerLogsResponse)
async def get_container_logs(
    container_id: str,
    tail: int = Query(100, ge=1, le=2000, description="Number of lines to retrieve from end"),
    timestamps: bool = Query(True, description="Prefix log lines with ISO timestamps"),
    stdout: bool = Query(True, description="Include stdout"),
    stderr: bool = Query(True, description="Include stderr"),
    since: Optional[int] = Query(None, description="UNIX timestamp to filter logs from"),
    until: Optional[int] = Query(None, description="UNIX timestamp to filter logs until"),
    search: Optional[str] = Query(None, description="Filter log lines by search substring"),
    level: Optional[str] = Query(None, description="Filter by severity level: DEBUG, INFO, WARN, ERROR, CRITICAL"),
):
    """Retrieve real stdout and stderr logs for a container with classification and search."""
    if not docker_service.is_connected:
        raise HTTPException(status_code=503, detail="Docker not connected")

    try:
        structured = docker_service.get_structured_container_logs(
            container_id=container_id,
            tail=tail,
            timestamps=timestamps,
            stdout=stdout,
            stderr=stderr,
            since=since,
            until=until,
            search=search,
            level=level,
        )
        return ContainerLogsResponse(**structured)
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except LookupError as not_found:
        raise HTTPException(status_code=404, detail=str(not_found))
    except Exception as e:
        logger.error(f"Error fetching logs for {container_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch logs: {e}")


@router.get("/{container_id}/logs/download")
async def download_container_logs(
    container_id: str,
    tail: int = Query(1000, ge=1, le=5000, description="Number of lines to include"),
    timestamps: bool = Query(True, description="Include ISO timestamps"),
    stdout: bool = Query(True, description="Include stdout"),
    stderr: bool = Query(True, description="Include stderr"),
    since: Optional[int] = Query(None, description="UNIX timestamp to filter logs from"),
    search: Optional[str] = Query(None, description="Filter log lines by search text"),
    level: Optional[str] = Query(None, description="Filter by severity level"),
):
    """Download container log file formatted as plain text attachment."""
    if not docker_service.is_connected:
        raise HTTPException(status_code=503, detail="Docker not connected")

    try:
        structured = docker_service.get_structured_container_logs(
            container_id=container_id,
            tail=tail,
            timestamps=timestamps,
            stdout=stdout,
            stderr=stderr,
            since=since,
            search=search,
            level=level,
        )
        c_name = structured.get("container_name") or container_id[:12]
        sanitized_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in c_name)
        short_id = container_id[:12]
        filename = f"{sanitized_name}_{short_id}_logs.log"

        content = "\n".join(structured.get("lines", []))
        return Response(
            content=content,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except LookupError as not_found:
        raise HTTPException(status_code=404, detail=str(not_found))
    except Exception as e:
        logger.error(f"Error downloading logs for {container_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to download logs: {e}")
