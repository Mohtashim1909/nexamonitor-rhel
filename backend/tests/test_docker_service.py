"""
Unit tests for DockerService and ImageService.
Tests Docker connection states, container discovery, stats math,
lifecycle operations, and image management using mocks.
"""
import pytest
from unittest.mock import MagicMock, patch
from app.services.docker_service import DockerService
from app.services.image_service import ImageService


@pytest.fixture
def mock_docker_service():
    """Create a DockerService instance with a mocked Docker client."""
    service = DockerService.__new__(DockerService)
    service._client = MagicMock()
    service._connected = True
    service._last_error = None
    return service


# ============================================================================
# 1. DOCKER CONNECTION TESTS
# ============================================================================

def test_docker_connection_available(mock_docker_service):
    """Test Docker status reporting when engine is connected."""
    mock_docker_service._client.ping.return_value = True
    mock_docker_service._client.version.return_value = {
        "Version": "24.0.7",
        "ApiVersion": "1.43",
        "Os": "linux",
        "Arch": "amd64",
    }
    mock_docker_service._client.info.return_value = {
        "Containers": 5,
        "Images": 12,
        "OperatingSystem": "Docker Desktop",
    }

    status = mock_docker_service.get_connection_status()
    assert status["connected"] is True
    assert status["server_version"] == "24.0.7"
    assert status["api_version"] == "1.43"
    assert status["containers_count"] == 5
    assert status["images_count"] == 12
    assert status["error"] is None


def test_docker_connection_unavailable():
    """Test Docker status reporting when engine is unavailable."""
    service = DockerService.__new__(DockerService)
    service._client = None
    service._connected = False
    service._last_error = "Connection refused at unix:///var/run/docker.sock"
    service.ping = MagicMock(return_value=False)

    status = service.get_connection_status()
    assert status["connected"] is False
    assert status["server_version"] is None
    assert "Connection refused" in status["error"]


def test_docker_ping_reconnect_failure():
    """Test ping behavior when reconnect fails."""
    service = DockerService.__new__(DockerService)
    service._client = MagicMock()
    service._client.ping.side_effect = Exception("Daemon crashed")
    service._try_connect = MagicMock(return_value=False)

    assert service.ping() is False
    assert service.is_connected is False


# ============================================================================
# 2. CONTAINER DISCOVERY TESTS
# ============================================================================

def test_get_containers_running_and_stopped(mock_docker_service):
    """Test retrieving both running and stopped containers with formatted fields."""
    mock_c1 = MagicMock()
    mock_c1.short_id = "abc123456789"
    mock_c1.id = "abc123456789fullid"
    mock_c1.name = "/web-app"
    mock_c1.status = "running"
    mock_c1.image.tags = ["nginx:1.25-alpine"]
    mock_c1.attrs = {
        "Created": "2026-11-16T10:00:00Z",
        "State": {
            "Status": "running",
            "Running": True,
            "StartedAt": "2026-11-16T10:00:00Z",
        },
        "NetworkSettings": {
            "Ports": {"80/tcp": [{"HostIp": "0.0.0.0", "HostPort": "8080"}]},
            "Networks": {"bridge": {"IPAddress": "172.17.0.2"}},
        },
        "Config": {"Labels": {"env": "prod"}},
    }

    mock_c2 = MagicMock()
    mock_c2.short_id = "def987654321"
    mock_c2.id = "def987654321fullid"
    mock_c2.name = "/worker-task"
    mock_c2.status = "exited"
    mock_c2.image.tags = ["python:3.11-slim"]
    mock_c2.attrs = {
        "Created": "2026-11-16T09:00:00Z",
        "State": {
            "Status": "exited",
            "Running": False,
            "ExitCode": 0,
            "FinishedAt": "2026-11-16T09:30:00Z",
        },
        "NetworkSettings": {"Ports": {}, "Networks": {}},
        "Config": {"Labels": {}},
    }

    mock_docker_service._client.containers.list.return_value = [mock_c1, mock_c2]
    containers = mock_docker_service.get_containers(all_containers=True)

    assert len(containers) == 2
    assert containers[0]["name"] == "web-app"
    assert containers[0]["status"] == "running"
    assert containers[0]["ports"] == ["8080->80/tcp"]
    assert containers[0]["labels"] == {"env": "prod"}

    assert containers[1]["name"] == "worker-task"
    assert containers[1]["status"] == "stopped"  # normalized exited -> stopped
    assert "Exited (0)" in containers[1]["uptime"]


def test_get_container_by_id_and_missing(mock_docker_service):
    """Test retrieving existing vs missing container."""
    mock_c = MagicMock()
    mock_c.short_id = "abc123456789"
    mock_c.id = "abc123456789fullid"
    mock_c.name = "web-app"
    mock_c.status = "running"
    mock_c.image.tags = ["nginx:alpine"]
    mock_c.attrs = {"State": {"Running": True}, "NetworkSettings": {}, "Config": {}}

    def mock_get(cid):
        if cid == "abc123":
            return mock_c
        raise Exception("Not found")

    mock_docker_service._client.containers.get.side_effect = mock_get
    mock_docker_service._client.containers.list.return_value = [mock_c]

    found = mock_docker_service.get_container("abc123")
    assert found is not None
    assert found["id"] == "abc123456789"

    missing = mock_docker_service.get_container("nonexistent")
    assert missing is None


# ============================================================================
# 3. CONTAINER RESOURCE STATISTICS TESTS
# ============================================================================

def test_running_container_stats_calculation(mock_docker_service):
    """Test CPU %, Memory %, Network, and Disk I/O calculations on a running container."""
    mock_c = MagicMock()
    mock_c.short_id = "test-cont"
    mock_c.name = "test-service"
    mock_c.status = "running"
    mock_docker_service._client.containers.get.return_value = mock_c

    raw_stats = {
        "read": "2026-11-16T12:00:00Z",
        "cpu_stats": {
            "cpu_usage": {"total_usage": 2000000000},
            "system_cpu_usage": 10000000000,
            "online_cpus": 4,
        },
        "precpu_stats": {
            "cpu_usage": {"total_usage": 1000000000},
            "system_cpu_usage": 5000000000,
            "online_cpus": 4,
        },
        "memory_stats": {
            "usage": 209715200,      # 200 MB
            "limit": 1073741824,     # 1 GB
            "stats": {"cache": 10485760},  # 10 MB cache
        },
        "networks": {
            "eth0": {
                "rx_bytes": 1048576,
                "tx_bytes": 524288,
                "rx_packets": 100,
                "tx_packets": 50,
                "rx_errors": 0,
                "tx_errors": 0,
                "rx_dropped": 0,
                "tx_dropped": 0,
            }
        },
        "blkio_stats": {
            "io_service_bytes_recursive": [
                {"op": "Read", "value": 4194304},
                {"op": "Write", "value": 2097152},
            ],
            "io_serviced_recursive": [
                {"op": "Read", "value": 40},
                {"op": "Write", "value": 20},
            ],
        },
        "pids_stats": {"current": 8},
    }
    mock_c.stats.return_value = raw_stats

    stats = mock_docker_service.get_container_stats("test-cont")
    assert stats is not None

    # CPU check:
    # cpu_delta = 1,000,000,000; system_delta = 5,000,000,000
    # ratio = 0.2 * 4 cores * 100% = 80.0%
    assert stats["cpu"]["percent"] == 80.0
    assert stats["cpu"]["online_cpus"] == 4

    # Memory check:
    # usage adjusted = 200MB - 10MB = 190MB (199,229,440 bytes)
    # percent = 190MB / 1024MB = ~18.55%
    assert stats["memory"]["percent"] == 18.55
    assert stats["memory"]["limit"] == 1073741824

    # Network check:
    assert stats["network"]["rx_bytes"] == 1048576
    assert stats["network"]["tx_bytes"] == 524288

    # Disk I/O check:
    assert stats["disk_io"]["read_bytes"] == 4194304
    assert stats["disk_io"]["write_bytes"] == 2097152
    assert stats["disk_io"]["read_ops"] == 40
    assert stats["disk_io"]["write_ops"] == 20


def test_stopped_container_stats_graceful(mock_docker_service):
    """Test that querying a stopped container does not raise an error or divide by zero."""
    mock_c = MagicMock()
    mock_c.short_id = "stopped-cont"
    mock_c.name = "stopped-service"
    mock_c.status = "exited"
    mock_docker_service._client.containers.get.return_value = mock_c

    stats = mock_docker_service.get_container_stats("stopped-cont")
    assert stats is not None
    assert stats["status"] == "exited"
    assert stats["cpu"]["percent"] == 0.0
    assert stats["memory"]["usage"] == 0
    assert stats["memory"]["percent"] == 0.0
    assert stats["disk_io"]["read_bytes"] == 0


def test_stats_zero_system_delta(mock_docker_service):
    """Test zero CPU delta / zero system delta avoids division by zero."""
    mock_c = MagicMock()
    mock_c.short_id = "idle-cont"
    mock_c.name = "idle-service"
    mock_c.status = "running"
    mock_docker_service._client.containers.get.return_value = mock_c

    raw_stats = {
        "read": "2026-11-16T12:00:00Z",
        "cpu_stats": {"cpu_usage": {"total_usage": 100}, "system_cpu_usage": 500},
        "precpu_stats": {"cpu_usage": {"total_usage": 100}, "system_cpu_usage": 500},  # identical -> delta=0
        "memory_stats": {"usage": 0, "limit": 0},
        "networks": {},
        "blkio_stats": {},
    }
    mock_c.stats.return_value = raw_stats

    stats = mock_docker_service.get_container_stats("idle-cont")
    assert stats is not None
    assert stats["cpu"]["percent"] == 0.0
    assert stats["memory"]["percent"] == 0.0


# ============================================================================
# 4. CONTAINER MANAGEMENT OPERATION TESTS
# ============================================================================

def test_container_lifecycle_operations(mock_docker_service):
    """Test start, stop, restart, and remove operations."""
    mock_c = MagicMock()
    mock_c.short_id = "test12345"
    mock_c.name = "my-service"
    mock_c.status = "stopped"
    mock_docker_service._client.containers.get.return_value = mock_c

    # Start
    res_start = mock_docker_service.start_container("test12345")
    assert res_start["success"] is True
    assert res_start["action"] == "start"
    mock_c.start.assert_called_once()

    # Stop
    mock_c.status = "running"
    res_stop = mock_docker_service.stop_container("test12345", timeout=5)
    assert res_stop["success"] is True
    assert res_stop["action"] == "stop"
    mock_c.stop.assert_called_once_with(timeout=5)

    # Restart
    res_restart = mock_docker_service.restart_container("test12345", timeout=5)
    assert res_restart["success"] is True
    assert res_restart["action"] == "restart"
    mock_c.restart.assert_called_once_with(timeout=5)

    # Remove
    res_remove = mock_docker_service.remove_container("test12345", force=True)
    assert res_remove["success"] is True
    assert res_remove["action"] == "remove"
    mock_c.remove.assert_called_once_with(force=True, v=False)


def test_container_invalid_identifier(mock_docker_service):
    """Test input validation rejecting illegal characters and empty container IDs."""
    with pytest.raises(ValueError):
        mock_docker_service.start_container("")

    with pytest.raises(ValueError):
        mock_docker_service.stop_container("cont; rm -rf /")

    with pytest.raises(ValueError):
        mock_docker_service.remove_container("test&echo 123")


# ============================================================================
# 5. CONTAINER LOGS TESTS
# ============================================================================

def test_get_container_logs_success(mock_docker_service):
    """Test retrieving and formatting container stdout and stderr logs."""
    mock_c = MagicMock()
    mock_c.short_id = "log-cont"
    mock_c.logs.return_value = b"2026-11-16T12:00:00Z Log line 1\n2026-11-16T12:00:01Z Log line 2\n"
    mock_docker_service._client.containers.get.return_value = mock_c

    lines = mock_docker_service.get_container_logs("log-cont", tail=50)
    assert len(lines) == 2
    assert "Log line 1" in lines[0]
    assert "Log line 2" in lines[1]


def test_get_container_logs_empty(mock_docker_service):
    """Test container with no logs returns empty list without error."""
    mock_c = MagicMock()
    mock_c.short_id = "empty-log-cont"
    mock_c.logs.return_value = b""
    mock_docker_service._client.containers.get.return_value = mock_c

    lines = mock_docker_service.get_container_logs("empty-log-cont")
    assert lines == []


# ============================================================================
# 6. DOCKER IMAGES TESTS
# ============================================================================

def test_image_service_listing_and_dangling(mock_docker_service):
    """Test image listing, detecting dangling images, and in-use status."""
    img_service = ImageService()

    # Image 1: tagged and in use
    img1 = MagicMock()
    img1.short_id = "sha256:111122223333"
    img1.id = "sha256:111122223333full"
    img1.tags = ["my-repo/web:latest"]
    img1.attrs = {"Size": 150000000, "Created": "2026-11-16T08:00:00Z"}

    # Image 2: untagged/dangling
    img2 = MagicMock()
    img2.short_id = "sha256:444455556666"
    img2.id = "sha256:444455556666full"
    img2.tags = []
    img2.attrs = {"Size": 80000000, "Created": "2026-11-16T07:00:00Z"}

    # Mock container referencing img1
    c1 = MagicMock()
    c1.image.id = "sha256:111122223333full"

    mock_docker_service._client.images.list.return_value = [img1, img2]
    mock_docker_service._client.containers.list.return_value = [c1]

    with patch("app.services.image_service.docker_service", mock_docker_service):
        images = img_service.get_images()

    assert len(images) == 2
    # img1
    assert images[0]["name"] == "my-repo/web"
    assert images[0]["tag"] == "latest"
    assert images[0]["in_use"] is True
    assert images[0]["dangling"] is False
    assert images[0]["container_count"] == 1

    # img2
    assert images[1]["name"] == "<none>"
    assert images[1]["dangling"] is True
    assert images[1]["in_use"] is False
