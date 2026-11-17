"""
Phase 5 Unit and Integration Tests for Module B: Advanced Container Log Management:
- Parse and classify log lines (timestamps, severity levels: CRITICAL, ERROR, WARN, DEBUG, INFO)
- Structured logs retrieval with tail clamping and filtering
- Keyword/regex search filtering
- REST endpoint GET /api/containers/{id}/logs
- Download log file attachment endpoint GET /api/containers/{id}/logs/download
- WebSocket live log streaming endpoint /ws/containers/{id}/logs with init packet and ping/pong
"""

import pytest
import json
from unittest.mock import MagicMock, patch, PropertyMock
from fastapi.testclient import TestClient

from app.main import app
from app.services.docker_service import docker_service, DockerService, parse_and_classify_log_line


@pytest.fixture
def client():
    return TestClient(app)


def test_parse_and_classify_log_line():
    """Verify log parsing and severity classification for various formats."""
    # 1. Critical log line with RFC3339 timestamp
    raw1 = "2026-11-17T02:40:15.123456789Z FATAL database connection failed: out of disk space"
    p1 = parse_and_classify_log_line(raw1)
    assert p1["timestamp"] == "2026-11-17T02:40:15.123456789Z"
    assert p1["level"] == "CRITICAL"
    assert "out of disk space" in p1["message"]

    # 2. Error log line
    raw2 = "2026-11-17T02:40:16.000Z [ERROR] Failed to query external API endpoint: 502 Bad Gateway"
    p2 = parse_and_classify_log_line(raw2)
    assert p2["level"] == "ERROR"

    # 3. Warning log line
    raw3 = "2026-11-17T02:40:17.000Z [WARN] Memory buffer near threshold (81.4%)"
    p3 = parse_and_classify_log_line(raw3)
    assert p3["level"] == "WARN"

    # 4. Debug log line
    raw4 = "2026-11-17T02:40:18.000Z [DEBUG] Cache lookup for key session_123"
    p4 = parse_and_classify_log_line(raw4)
    assert p4["level"] == "DEBUG"

    # 5. Normal Info log line without timestamp
    raw5 = "Server listening on http://0.0.0.0:8000"
    p5 = parse_and_classify_log_line(raw5)
    assert p5["level"] == "INFO"
    assert p5["message"] == "Server listening on http://0.0.0.0:8000"
    assert p5["timestamp"] is not None


def test_get_structured_container_logs_filtering():
    """Verify severity and keyword filtering on structured logs."""
    mock_container = MagicMock()
    mock_container.name = "/nexamonitor-backend"
    sample_raw = (
        b"2026-11-17T02:00:01Z [INFO] Application started\n"
        b"2026-11-17T02:00:02Z [WARN] Cache eviction rate high\n"
        b"2026-11-17T02:00:03Z [ERROR] Unhandled ZeroDivisionError in calculation\n"
        b"2026-11-17T02:00:04Z [CRITICAL] Out of memory fatal crash\n"
        b"2026-11-17T02:00:05Z [INFO] Heartbeat OK\n"
    )
    mock_container.logs.return_value = sample_raw

    with patch.object(DockerService, "is_connected", new_callable=PropertyMock, return_value=True), \
         patch.object(docker_service, "_find_docker_container", return_value=mock_container):

        # 1. Unfiltered query
        res = docker_service.get_structured_container_logs(
            container_id="test-cid", tail=100, timestamps=True
        )
        assert res["total_lines"] == 5
        assert res["filtered_lines"] == 5
        assert res["container_name"] == "nexamonitor-backend"

        # 2. Filter by level=ERROR
        res_err = docker_service.get_structured_container_logs(
            container_id="test-cid", tail=100, level="ERROR"
        )
        assert res_err["filtered_lines"] == 1
        assert res_err["entries"][0]["level"] == "ERROR"

        # 3. Filter by search="ZeroDivisionError"
        res_search = docker_service.get_structured_container_logs(
            container_id="test-cid", tail=100, search="ZeroDivision"
        )
        assert res_search["filtered_lines"] == 1
        assert "ZeroDivisionError" in res_search["lines"][0]

        # 4. Tail bounded clamping test
        docker_service.get_structured_container_logs(container_id="test-cid", tail=5000)
        # Should be clamped to 2000
        call_kwargs = mock_container.logs.call_args[1]
        assert call_kwargs["tail"] == 2000


def test_api_get_logs_endpoint(client):
    """Test REST API GET /api/containers/{container_id}/logs."""
    mock_container = MagicMock()
    mock_container.name = "/auth-service"
    mock_container.logs.return_value = (
        b"2026-11-17T02:10:00Z [INFO] User logged in\n"
        b"2026-11-17T02:10:01Z [ERROR] Invalid JWT token signature\n"
    )

    with patch.object(DockerService, "is_connected", new_callable=PropertyMock, return_value=True), \
         patch.object(docker_service, "_find_docker_container", return_value=mock_container):

        response = client.get("/api/containers/c12345678901/logs?tail=50&timestamps=true")
        assert response.status_code == 200
        data = response.json()
        assert data["container_id"] == "c12345678901"
        assert data["container_name"] == "auth-service"
        assert data["total_lines"] == 2
        assert len(data["lines"]) == 2
        assert len(data["entries"]) == 2
        assert data["entries"][1]["level"] == "ERROR"


def test_api_download_logs_endpoint(client):
    """Test file download attachment endpoint GET /api/containers/{container_id}/logs/download."""
    mock_container = MagicMock()
    mock_container.name = "/postgres-db"
    mock_container.logs.return_value = (
        b"2026-11-17T01:00:00Z [INFO] PostgreSQL 15 database system is ready\n"
        b"2026-11-17T01:05:00Z [INFO] Checkpoint starting: time\n"
    )

    with patch.object(DockerService, "is_connected", new_callable=PropertyMock, return_value=True), \
         patch.object(docker_service, "_find_docker_container", return_value=mock_container):

        response = client.get("/api/containers/c12345678901/logs/download?tail=500")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/plain")
        assert "Content-Disposition" in response.headers
        assert "attachment; filename=" in response.headers["Content-Disposition"]
        assert "postgres-db" in response.headers["Content-Disposition"]
        assert "PostgreSQL 15 database system is ready" in response.text


def test_websocket_container_logs_streaming(client):
    """Test live WebSocket container log streaming connection and init packet."""
    mock_container = MagicMock()
    mock_container.name = "/worker-daemon"
    mock_container.logs.side_effect = [
        # First call: get_structured_container_logs (stream=False)
        b"2026-11-17T02:20:00Z [INFO] Worker thread spawned\n",
        # Second call: stream_logs_iterator (stream=True)
        iter([b"2026-11-17T02:20:05Z [INFO] Task executed in 12ms\n"])
    ]

    with patch.object(DockerService, "is_connected", new_callable=PropertyMock, return_value=True), \
         patch.object(docker_service, "_find_docker_container", return_value=mock_container):

        with client.websocket_connect("/ws/containers/c12345678901/logs?tail=50") as websocket:
            # 1. First packet must be 'init' with existing lines
            init_packet = json.loads(websocket.receive_text())
            assert init_packet["type"] == "init"
            assert init_packet["container_id"] == "c12345678901"
            assert len(init_packet["entries"]) == 1
            assert init_packet["entries"][0]["message"] == "[INFO] Worker thread spawned"

            # 2. Test ping / pong
            websocket.send_text(json.dumps({"action": "ping"}))
            # Might receive log_entry or pong
            msg = json.loads(websocket.receive_text())
            assert msg["type"] in ("log_entry", "pong")
