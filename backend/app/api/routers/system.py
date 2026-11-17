from fastapi import APIRouter
from app.services.host_monitor import host_monitor

router = APIRouter()


@router.get("/snapshot")
async def get_system_snapshot():
    return host_monitor.get_full_snapshot()
