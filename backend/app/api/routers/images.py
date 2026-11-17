from fastapi import APIRouter, HTTPException, Query
from app.services.image_service import image_service
from app.services.docker_service import docker_service
from app.schemas.images import ImageSummary, ImageActionResponse
from typing import List
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("", response_model=List[ImageSummary])
@router.get("/", response_model=List[ImageSummary], include_in_schema=False)
async def list_images():
    """Retrieve actual Docker images with size, tags, in-use, and dangling indicators."""
    if not docker_service.is_connected:
        status_info = docker_service.get_connection_status()
        err = status_info.get("error") or "Docker Engine is disconnected or unavailable"
        raise HTTPException(status_code=503, detail=f"Docker not connected: {err}")

    return image_service.get_images()


@router.post("/prune")
async def prune_images(
    dangling_only: bool = Query(True, description="Only prune dangling (untagged) images")
):
    """Remove unused or dangling images to reclaim disk space."""
    if not docker_service.is_connected:
        raise HTTPException(status_code=503, detail="Docker not connected")

    try:
        return image_service.prune_images(dangling_only=dangling_only)
    except Exception as e:
        logger.error(f"Error pruning images: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{image_id}")
async def inspect_image(image_id: str):
    """Retrieve deep inspect metadata for a Docker image."""
    if not docker_service.is_connected:
        raise HTTPException(status_code=503, detail="Docker not connected")

    try:
        return image_service.inspect_image(image_id=image_id)
    except LookupError as not_found:
        raise HTTPException(status_code=404, detail=str(not_found))
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        logger.error(f"Error inspecting image {image_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to inspect image: {e}")


@router.delete("/{image_id}", response_model=ImageActionResponse)
async def remove_image(
    image_id: str,
    force: bool = Query(False, description="Force removal of the image")
):
    """Remove a Docker image from the host engine."""
    if not docker_service.is_connected:
        raise HTTPException(status_code=503, detail="Docker not connected")

    try:
        res = image_service.remove_image(image_id=image_id, force=force)
        return ImageActionResponse(**res)
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        logger.error(f"Error removing image {image_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to remove image: {e}")
