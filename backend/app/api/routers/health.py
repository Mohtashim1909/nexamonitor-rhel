from fastapi import APIRouter
from datetime import datetime
from app.schemas.container import HealthResponse
from app.services.docker_service import docker_service

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        docker_connected=docker_service.is_connected,
        database_connected=True,
        timestamp=datetime.utcnow()
    )
