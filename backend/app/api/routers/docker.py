from fastapi import APIRouter
from app.services.docker_service import docker_service
from app.schemas.docker import DockerStatusResponse

router = APIRouter()


@router.get("/status", response_model=DockerStatusResponse)
async def get_docker_status():
    """Return Docker engine connection status, versions, host info, and error details."""
    status_data = docker_service.get_connection_status()
    return DockerStatusResponse(**status_data)
