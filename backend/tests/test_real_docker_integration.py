"""
Integration tests executing against a real Docker daemon.
Skips gracefully if Docker daemon is not accessible in current environment.
"""
import pytest
from app.services.docker_service import DockerService
from app.services.image_service import ImageService


@pytest.fixture(scope="module")
def real_docker_service():
    service = DockerService()
    if not service.is_connected:
        pytest.skip("Local Docker daemon is not connected in this execution environment")
    return service


def test_real_docker_ping_and_version(real_docker_service):
    """Verify ping and query server metadata on real Docker daemon."""
    assert real_docker_service.is_connected is True
    status = real_docker_service.get_connection_status()
    assert status["connected"] is True
    assert status["server_version"] is not None
    assert status["api_version"] is not None
    print(f"\n[Real Docker Engine] Version: {status['server_version']}, OS: {status['operating_system']}")


def test_real_docker_container_discovery(real_docker_service):
    """Retrieve real containers from the host Docker daemon."""
    containers = real_docker_service.get_containers(all_containers=True)
    assert isinstance(containers, list)
    print(f"\n[Real Docker Engine] Discovered {len(containers)} container(s)")
    if containers:
        first = containers[0]
        assert "id" in first
        assert "name" in first
        assert "status" in first
        assert "image" in first
        print(f"Sample Container: {first['name']} ({first['id']}) - {first['status']}")


def test_real_docker_container_stats(real_docker_service):
    """Retrieve stats for any existing container."""
    containers = real_docker_service.get_containers(all_containers=True)
    if not containers:
        pytest.skip("No containers exist to test statistics")

    first_id = containers[0]["id"]
    stats = real_docker_service.get_container_stats(first_id)
    assert stats is not None
    assert "cpu" in stats
    assert "memory" in stats
    assert "network" in stats
    assert "disk_io" in stats
    print(f"\n[Real Docker Stats] CPU: {stats['cpu']['percent']}%, Memory: {stats['memory']['usage']} bytes")


def test_real_docker_images_listing(real_docker_service):
    """Retrieve images from real Docker daemon."""
    img_service = ImageService()
    images = img_service.get_images()
    assert isinstance(images, list)
    print(f"\n[Real Docker Engine] Discovered {len(images)} image(s)")
    if images:
        img = images[0]
        assert "id" in img
        assert "size" in img
        assert "in_use" in img
        assert "dangling" in img
