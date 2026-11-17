"""
API integration tests for FastAPI routes:
- /api/docker/status
- /api/containers
- /api/containers/{id}/stats
- /api/containers/{id}/start, stop, restart, delete
- /api/containers/{id}/logs
- /api/images
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch, PropertyMock
from app.main import app
from app.services.docker_service import DockerService


@pytest.fixture
def client():
    return TestClient(app)


def test_docker_status_endpoint_connected(client):
    """Test GET /api/docker/status when Docker is connected."""
    mock_status = {
        "connected": True,
        "server_version": "24.0.7",
        "api_version": "1.43",
        "operating_system": "Docker Desktop",
        "architecture": "aarch64",
        "containers_count": 4,
        "images_count": 6,
        "docker_host": "unix:///var/run/docker.sock",
        "error": None,
    }
    with patch("app.services.docker_service.docker_service.get_connection_status", return_value=mock_status):
        response = client.get("/api/docker/status")
        assert response.status_code == 200
        data = response.json()
        assert data["connected"] is True
        assert data["server_version"] == "24.0.7"
        assert data["containers_count"] == 4


def test_docker_status_endpoint_disconnected(client):
    """Test GET /api/docker/status when Docker is disconnected."""
    mock_status = {
        "connected": False,
        "server_version": None,
        "api_version": None,
        "operating_system": None,
        "architecture": None,
        "containers_count": None,
        "images_count": None,
        "docker_host": "unix:///var/run/docker.sock",
        "error": "Docker socket not accessible",
    }
    with patch("app.services.docker_service.docker_service.get_connection_status", return_value=mock_status):
        response = client.get("/api/docker/status")
        assert response.status_code == 200
        data = response.json()
        assert data["connected"] is False
        assert "not accessible" in data["error"]


def test_list_containers_endpoint(client):
    """Test GET /api/containers."""
    mock_containers = [
        {
            "id": "abc123456789",
            "full_id": "abc123456789full",
            "name": "web-service",
            "image": "nginx:latest",
            "image_tag": "latest",
            "image_id": "sha256:123",
            "status": "running",
            "state": {"status": "running", "running": True},
            "created": "2026-11-16T10:00:00Z",
            "ports": ["80:80/tcp"],
            "network": {"ip_address": "172.17.0.2"},
            "labels": {},
            "cpu_percent": 12.5,
            "memory_usage": 1000000,
            "memory_limit": 5000000,
            "memory_percent": 20.0,
            "network_rx": 500,
            "network_tx": 200,
            "uptime": "Up 2 hours",
        }
    ]
    with patch.object(DockerService, "is_connected", new_callable=PropertyMock, return_value=True), \
         patch("app.services.docker_service.docker_service.get_containers", return_value=mock_containers):
        response = client.get("/api/containers")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "web-service"
        assert data[0]["status"] == "running"


def test_list_containers_disconnected_returns_503(client):
    """Test GET /api/containers returns 503 when Docker is disconnected."""
    with patch.object(DockerService, "is_connected", new_callable=PropertyMock, return_value=False), \
         patch("app.services.docker_service.docker_service.get_connection_status", return_value={"error": "daemon down"}):
        response = client.get("/api/containers")
        assert response.status_code == 503
        assert "Docker not connected" in response.json()["detail"]


def test_container_stats_endpoint(client):
    """Test GET /api/containers/{id}/stats."""
    mock_stats = {
        "container_id": "c1",
        "container_name": "api",
        "status": "running",
        "read": "2026-11-16T12:00:00Z",
        "cpu": {"usage": 5000, "percent": 15.2, "system_cpu_usage": 10000, "online_cpus": 2},
        "memory": {"usage": 50000, "limit": 100000, "percent": 50.0, "cache": 0, "stats": {}},
        "network": {"rx_bytes": 100, "tx_bytes": 200, "rx_packets": 1, "tx_packets": 2, "rx_errors": 0, "tx_errors": 0, "rx_dropped": 0, "tx_dropped": 0},
        "disk_io": {"read_bytes": 0, "write_bytes": 0, "read_ops": 0, "write_ops": 0},
    }
    with patch.object(DockerService, "is_connected", new_callable=PropertyMock, return_value=True), \
         patch("app.services.docker_service.docker_service.get_container_stats", return_value=mock_stats):
        response = client.get("/api/containers/c1/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["cpu"]["percent"] == 15.2
        assert data["memory"]["percent"] == 50.0


def test_container_lifecycle_endpoints(client):
    """Test start, stop, restart, and remove API routes."""
    with patch.object(DockerService, "is_connected", new_callable=PropertyMock, return_value=True):
        # Start
        with patch("app.services.docker_service.docker_service.start_container", return_value={"success": True, "action": "start", "container_id": "c1", "message": "Started"}):
            res = client.post("/api/containers/c1/start")
            assert res.status_code == 200
            assert res.json()["success"] is True

        # Stop
        with patch("app.services.docker_service.docker_service.stop_container", return_value={"success": True, "action": "stop", "container_id": "c1", "message": "Stopped"}):
            res = client.post("/api/containers/c1/stop?timeout=5")
            assert res.status_code == 200
            assert res.json()["success"] is True

        # Restart
        with patch("app.services.docker_service.docker_service.restart_container", return_value={"success": True, "action": "restart", "container_id": "c1", "message": "Restarted"}):
            res = client.post("/api/containers/c1/restart?timeout=5")
            assert res.status_code == 200
            assert res.json()["success"] is True

        # Delete
        with patch("app.services.docker_service.docker_service.remove_container", return_value={"success": True, "action": "remove", "container_id": "c1", "message": "Removed"}):
            res = client.delete("/api/containers/c1?force=true")
            assert res.status_code == 200
            assert res.json()["success"] is True


def test_container_logs_endpoint(client):
    """Test GET /api/containers/{id}/logs."""
    mock_lines = ["[INFO] Booting server", "[INFO] Application started"]
    with patch.object(DockerService, "is_connected", new_callable=PropertyMock, return_value=True), \
         patch("app.services.docker_service.docker_service.get_container_logs", return_value=mock_lines):
        res = client.get("/api/containers/c1/logs?tail=50")
        assert res.status_code == 200
        data = res.json()
        assert data["total_lines"] == 2
        assert len(data["lines"]) == 2


def test_images_endpoint(client):
    """Test GET /api/images."""
    mock_images = [
        {
            "id": "112233",
            "full_id": "sha256:112233",
            "name": "python",
            "repository": "python",
            "tag": "3.11",
            "tags": ["python:3.11"],
            "size": 50000000,
            "created": "2026-11-16T08:00:00Z",
            "dangling": False,
            "in_use": True,
            "container_count": 2,
        }
    ]
    with patch.object(DockerService, "is_connected", new_callable=PropertyMock, return_value=True), \
         patch("app.services.image_service.image_service.get_images", return_value=mock_images):
        res = client.get("/api/images")
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 1
        assert data[0]["name"] == "python"
        assert data[0]["in_use"] is True


def test_invalid_container_id_validation(client):
    """Test input validation for illegal container IDs."""
    with patch.object(DockerService, "is_connected", new_callable=PropertyMock, return_value=True):
        res = client.get("/api/containers/invalid$$id")
        assert res.status_code == 400
        assert "Invalid container identifier" in res.json()["detail"]
