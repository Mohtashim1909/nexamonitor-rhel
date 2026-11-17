from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.database.connection import engine, Base, init_or_migrate_db
from app.api.routers import health, containers, system, alerts, images, docker, monitoring, analytics, insights, reports
from app.websocket.manager import manager
from app.services.monitoring_engine import monitoring_engine
import json
import datetime
import logging
import asyncio
import threading
from app.services.docker_service import docker_service, parse_and_classify_log_line

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

init_or_migrate_db()

app = FastAPI(title=settings.APP_NAME, version=settings.VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(docker.router, prefix="/api/docker", tags=["docker"])
app.include_router(containers.router, prefix="/api/containers", tags=["containers"])
app.include_router(system.router, prefix="/api/system", tags=["system"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["alerts"])
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(monitoring.router, prefix="/api/monitoring", tags=["monitoring"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(insights.router, prefix="/api/insights", tags=["insights"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])


@app.on_event("startup")
async def startup_event():
    """Start centralized real-time Docker & host monitoring engine."""
    await monitoring_engine.start()


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanly terminate background monitoring tasks on server shutdown."""
    await monitoring_engine.stop()


async def _handle_websocket(websocket: WebSocket):
    """Centralized WebSocket connection and incoming message handler."""
    await manager.connect(websocket)
    try:
        while True:
            text = await websocket.receive_text()
            try:
                msg = json.loads(text)
                action = msg.get("action") or msg.get("type")
                if action == "set_interval":
                    interval = int(msg.get("interval_ms", 1000))
                    new_val = monitoring_engine.set_interval(interval)
                    await websocket.send_text(
                        json.dumps({"type": "interval_updated", "interval_ms": new_val})
                    )
                elif action == "ping":
                    await websocket.send_text(
                        json.dumps({
                            "type": "pong",
                            "timestamp": datetime.datetime.utcnow().isoformat() + "Z"
                        })
                    )
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.debug(f"WebSocket connection closed: {e}")
        manager.disconnect(websocket)


@app.websocket("/ws/monitoring")
async def websocket_monitoring(websocket: WebSocket):
    await _handle_websocket(websocket)


@app.websocket("/ws/metrics")
async def websocket_metrics(websocket: WebSocket):
    await _handle_websocket(websocket)


@app.websocket("/ws/containers/{container_id}/logs")
async def websocket_container_logs(
    websocket: WebSocket,
    container_id: str,
    tail: int = 100,
    timestamps: bool = True,
    stdout: bool = True,
    stderr: bool = True,
):
    """Real-time log streaming for a single container over WebSocket."""
    await websocket.accept()

    if not docker_service.is_connected:
        await websocket.send_text(
            json.dumps({"type": "error", "message": "Docker Engine is disconnected"})
        )
        await websocket.close()
        return

    # Send initial backlog of logs
    try:
        init_logs = await asyncio.to_thread(
            docker_service.get_structured_container_logs,
            container_id=container_id,
            tail=tail,
            timestamps=timestamps,
            stdout=stdout,
            stderr=stderr,
        )
        await websocket.send_text(
            json.dumps({
                "type": "init",
                "container_id": container_id,
                "container_name": init_logs.get("container_name"),
                "total_lines": init_logs.get("total_lines", 0),
                "entries": init_logs.get("entries", []),
            })
        )
    except Exception as e:
        await websocket.send_text(
            json.dumps({"type": "error", "message": f"Failed to fetch initial logs: {e}"})
        )
        await websocket.close()
        return

    # Set up streaming
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue(maxsize=1000)
    stop_event = threading.Event()

    def reader_worker():
        try:
            log_stream = docker_service.stream_logs_iterator(
                container_id=container_id,
                tail=0,  # only new incoming lines
                timestamps=timestamps,
                stdout=stdout,
                stderr=stderr,
            )
            for chunk in log_stream:
                if stop_event.is_set():
                    break
                if isinstance(chunk, bytes):
                    text = chunk.decode("utf-8", errors="replace")
                else:
                    text = str(chunk)
                for line in text.splitlines():
                    if line and not stop_event.is_set():
                        loop.call_soon_threadsafe(queue.put_nowait, line)
        except Exception:
            pass
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    thread = threading.Thread(target=reader_worker, daemon=True)
    thread.start()

    # Async transmitter loop
    try:
        while True:
            get_line_task = asyncio.create_task(queue.get())
            recv_msg_task = asyncio.create_task(websocket.receive_text())

            done, pending = await asyncio.wait(
                [get_line_task, recv_msg_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()

            if recv_msg_task in done:
                try:
                    client_msg = recv_msg_task.result()
                    parsed_cmd = json.loads(client_msg)
                    if parsed_cmd.get("action") == "ping":
                        await websocket.send_text(
                            json.dumps({
                                "type": "pong",
                                "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                            })
                        )
                except Exception:
                    pass

            if get_line_task in done:
                line = get_line_task.result()
                if line is None:
                    # Stream ended
                    break
                entry = parse_and_classify_log_line(line)
                await websocket.send_text(
                    json.dumps({"type": "log_entry", "data": entry})
                )

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug(f"Log streaming websocket ended: {e}")
    finally:
        stop_event.set()


@app.get("/")
async def root():
    return {"message": "NexaMonitor API", "version": settings.VERSION, "docs": "/docs"}
