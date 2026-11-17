import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.services.docker_service import docker_service

client = TestClient(app)


def test_inspect_image_mocked():
    """Test inspecting deep image metadata."""
    mock_image = MagicMock()
    mock_image.id = "sha256:abcd1234efgh5678"
    mock_image.short_id = "abcd1234efgh"
    mock_image.tags = ["test/image:v1.0"]
    mock_image.attrs = {
        "Created": "2026-11-16T12:00:00Z",
        "Size": 104857600,  # 100 MB
        "VirtualSize": 104857600,
        "Architecture": "arm64",
        "Os": "linux",
        "DockerVersion": "25.0.3",
        "Author": "NexaMonitor Team",
        "Config": {
            "Entrypoint": ["/entrypoint.sh"],
            "Cmd": ["app", "--run"],
            "Env": ["ENV=prod", "PORT=8000"],
            "WorkingDir": "/app",
            "Labels": {"version": "1.0"},
            "ExposedPorts": {"8000/tcp": {}},
        },
        "RootFS": {
            "Layers": [
                "sha256:layer1",
                "sha256:layer2",
            ]
        },
    }

    mock_client = MagicMock()
    mock_client.images.get.return_value = mock_image

    with patch.object(docker_service, "_client", mock_client):
        response = client.get("/api/images/sha256:abcd1234efgh5678")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "abcd1234efgh"
        assert data["size_mb"] == 100.0
        assert data["architecture"] == "arm64"
        assert data["layer_count"] == 2
        assert "ENV=prod" in data["env"]


def test_prune_images_mocked():
    """Test pruning dangling images."""
    prune_res = {
        "ImagesDeleted": [
            {"Deleted": "sha256:dangling1"},
            {"Deleted": "sha256:dangling2"},
        ],
        "SpaceReclaimed": 524288000,  # 500 MB
    }

    mock_client = MagicMock()
    mock_client.images.prune.return_value = prune_res

    with patch.object(docker_service, "_client", mock_client):
        response = client.post("/api/images/prune?dangling_only=true")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["images_deleted"]) == 2
        assert data["space_reclaimed_mb"] == 500.0


def test_inspect_image_not_found():
    """Test 404 response on non-existent image inspect."""
    import docker.errors

    mock_client = MagicMock()
    mock_client.images.get.side_effect = docker.errors.ImageNotFound("Image not found")

    with patch.object(docker_service, "_client", mock_client):
        response = client.get("/api/images/non-existent-image-id")
        assert response.status_code == 404
