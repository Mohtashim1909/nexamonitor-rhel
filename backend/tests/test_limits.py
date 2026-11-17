import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.services.docker_service import docker_service

client = TestClient(app)


def test_get_container_limits_mocked():
    """Test retrieving container limits with mocked docker container."""
    mock_container = MagicMock()
    mock_container.id = "test-limits-id"
    mock_container.short_id = "test-limits-id"
    mock_container.name = "test-limits-container"
    mock_container.status = "stopped"
    mock_container.attrs = {
        "HostConfig": {
            "Memory": 1073741824,  # 1 GB
            "MemoryReservation": 536870912,  # 512 MB
            "MemorySwap": 2147483648,  # 2 GB
            "CpuShares": 1024,
            "CpuQuota": 100000,
            "CpuPeriod": 100000,
            "NanoCpus": 1000000000,
        }
    }

    mock_client = MagicMock()
    mock_client.containers.get.return_value = mock_container

    with patch.object(docker_service, "_client", mock_client):
        response = client.get("/api/containers/test-limits-id/limits")
        assert response.status_code == 200
        data = response.json()
        assert data["container_id"] == "test-limits-id"
        assert data["memory_limit_mb"] == 1024.0
        assert data["memory_reservation_mb"] == 512.0
        assert data["cpu_shares"] == 1024
        assert data["effective_cpus"] == 1.0


def test_update_container_limits_mocked():
    """Test updating container limits with mocked docker container."""
    mock_container = MagicMock()
    mock_container.id = "test-limits-id"
    mock_container.name = "test-limits-container"
    mock_container.update.return_value = {"Warnings": None}

    mock_client = MagicMock()
    mock_client.containers.get.return_value = mock_container

    with patch.object(docker_service, "_client", mock_client):
        payload = {
            "mem_limit": "512m",
            "cpu_shares": 512,
            "cpus": 1.5,
        }
        response = client.put("/api/containers/test-limits-id/limits", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "successfully" in data["message"].lower()
        mock_container.update.assert_called_once()


def test_get_container_limits_not_found():
    """Test 404 response when container does not exist."""
    import docker.errors

    mock_client = MagicMock()
    mock_client.containers.get.side_effect = docker.errors.NotFound("Not found")

    with patch.object(docker_service, "_client", mock_client):
        response = client.get("/api/containers/non-existent-id/limits")
        assert response.status_code == 404
