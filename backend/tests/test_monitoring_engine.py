"""
Phase 3 unit and integration tests for Real-Time Resource Monitoring:
- MonitoringEngine metric calculations (CPU delta, Memory with cache subtraction & limit clamping, Network rates & counter resets, Disk I/O)
- Monitoring interval dynamic configuration and validation
- REST endpoints: /api/monitoring/settings, /api/monitoring/snapshot
- WebSocket communication: /ws/monitoring and /ws/metrics, ping/pong, interval updates
"""
import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from fastapi.testclient import TestClient

from app.main import app
from app.services.monitoring_engine import MonitoringEngine, monitoring_engine
from app.websocket.manager import ConnectionManager
from app.schemas.monitoring import MonitoringSettings, UpdateMonitoringSettingsRequest


@pytest.fixture
def client():
    return TestClient(app)


# ==============================================================================
# Task 2: CPU Calculation Tests
# ==============================================================================

def test_cpu_calculation_standard():
    """Verify standard Docker delta CPU percentage formula with multi-core multiplier."""
    engine = MonitoringEngine()
    stats = {
        "cpu_stats": {
            "cpu_usage": {"total_usage": 200_000_000, "percpu_usage": [100_000_000, 100_000_000]},
            "system_cpu_usage": 2_000_000_000,
            "online_cpus": 2,
        },
        "precpu_stats": {
            "cpu_usage": {"total_usage": 100_000_000},
            "system_cpu_usage": 1_000_000_000,
        },
        "memory_stats": {},
        "networks": {},
    }
    # cpu_delta = 100_000_000, system_delta = 1_000_000_000
    # ratio = 0.1 * 2 cores * 100 = 20.0%
    result = engine.compute_metrics("c1", "test-c1", "running", stats, 1000.0, "2026-11-17T00:00:00Z")
    assert result["cpu_usage_percent"] == 20.0
    assert result["cpu_usage_total"] == 200_000_000
    assert result["cpu_system_usage"] == 2_000_000_000
    assert result["cpu_count"] == 2


def test_cpu_calculation_zero_delta():
    """Verify zero CPU delta returns 0.0% without division-by-zero errors."""
    engine = MonitoringEngine()
    stats = {
        "cpu_stats": {
            "cpu_usage": {"total_usage": 500_000_000},
            "system_cpu_usage": 1_000_000_000,
            "online_cpus": 4,
        },
        "precpu_stats": {
            "cpu_usage": {"total_usage": 500_000_000},
            "system_cpu_usage": 1_000_000_000,
        },
        "memory_stats": {},
        "networks": {},
    }
    result = engine.compute_metrics("c2", "test-c2", "running", stats, 1000.0, "2026-11-17T00:00:00Z")
    assert result["cpu_usage_percent"] == 0.0
    assert result["cpu_count"] == 4


def test_cpu_calculation_missing_precpu():
    """Verify missing precpu stats gracefully returns 0.0%."""
    engine = MonitoringEngine()
    stats = {
        "cpu_stats": {
            "cpu_usage": {"total_usage": 500_000_000},
            "system_cpu_usage": 1_000_000_000,
        },
        "precpu_stats": {},
        "memory_stats": {},
        "networks": {},
    }
    result = engine.compute_metrics("c3", "test-c3", "running", stats, 1000.0, "2026-11-17T00:00:00Z")
    assert result["cpu_usage_percent"] == 0.0


# ==============================================================================
# Task 3: Memory Calculation Tests
# ==============================================================================

def test_memory_calculation_normal_with_cache_subtraction():
    """Verify memory calculation subtracts cgroup cache and computes accurate percentage."""
    engine = MonitoringEngine()
    stats = {
        "cpu_stats": {},
        "precpu_stats": {},
        "memory_stats": {
            "usage": 300 * 1024 * 1024,  # 300 MB raw
            "limit": 1024 * 1024 * 1024,  # 1 GB limit
            "stats": {
                "cache": 100 * 1024 * 1024,  # 100 MB cache
            },
        },
        "networks": {},
    }
    # Effective usage: 300 - 100 = 200 MB
    # 200 MB / 1024 MB = 19.53%
    result = engine.compute_metrics("c4", "test-c4", "running", stats, 1000.0, "2026-11-17T00:00:00Z")
    assert result["memory_usage_bytes"] == 200 * 1024 * 1024
    assert result["memory_limit_bytes"] == 1024 * 1024 * 1024
    assert round(result["memory_usage_percent"], 2) == 19.53
    assert result["memory_cache_bytes"] == 100 * 1024 * 1024
    assert result["memory_available_bytes"] == (1024 - 200) * 1024 * 1024


def test_memory_calculation_cgroup_v2_inactive_file():
    """Verify cgroup v2 inactive_file is used when total_inactive_file / cache not present."""
    engine = MonitoringEngine()
    stats = {
        "cpu_stats": {},
        "precpu_stats": {},
        "memory_stats": {
            "usage": 250 * 1024 * 1024,
            "limit": 500 * 1024 * 1024,
            "stats": {
                "inactive_file": 50 * 1024 * 1024,
            },
        },
        "networks": {},
    }
    # Effective usage = 250 - 50 = 200 MB
    # Limit = 500 MB -> 40.0%
    result = engine.compute_metrics("c5", "test-c5", "running", stats, 1000.0, "2026-11-17T00:00:00Z")
    assert result["memory_usage_bytes"] == 200 * 1024 * 1024
    assert result["memory_limit_bytes"] == 500 * 1024 * 1024
    assert result["memory_usage_percent"] == 40.0
    assert result["memory_cache_bytes"] == 50 * 1024 * 1024


def test_memory_calculation_unlimited_clamped_to_host():
    """Verify that unrealistic default unlimited Linux limits are clamped to host total memory."""
    engine = MonitoringEngine()
    unlimited_val = 9223372036854771712  # Standard 64-bit max int
    stats = {
        "cpu_stats": {},
        "precpu_stats": {},
        "memory_stats": {
            "usage": 100 * 1024 * 1024,
            "limit": unlimited_val,
            "stats": {},
        },
        "networks": {},
    }
    result = engine.compute_metrics("c6", "test-c6", "running", stats, 1000.0, "2026-11-17T00:00:00Z")
    assert result["memory_limit_bytes"] < unlimited_val
    assert result["memory_limit_bytes"] > 0
    assert 0 <= result["memory_usage_percent"] <= 100


# ==============================================================================
# Task 4: Network Differential Rate Calculations & Counter Resets
# ==============================================================================

def test_network_differential_transfer_rate_calculation():
    """Verify network speed is calculated from byte counter difference over elapsed time."""
    engine = MonitoringEngine()
    cid = "container_abc_123"

    # 1. First poll: Baseline established, rate is 0
    stats_t0 = {
        "cpu_stats": {},
        "precpu_stats": {},
        "memory_stats": {},
        "networks": {
            "eth0": {
                "rx_bytes": 10_000_000,
                "tx_bytes": 5_000_000,
                "rx_packets": 1000,
                "tx_packets": 500,
                "rx_errors": 0,
                "tx_errors": 0,
                "rx_dropped": 0,
                "tx_dropped": 0,
            }
        },
    }
    res_t0 = engine.compute_metrics(cid, "c-net", "running", stats_t0, 1000.0, "2026-11-17T00:00:00Z")
    assert res_t0["network_rx_bytes"] == 10_000_000
    assert res_t0["network_tx_bytes"] == 5_000_000
    assert res_t0["network_rx_bytes_per_sec"] == 0.0
    assert res_t0["network_tx_bytes_per_sec"] == 0.0

    # 2. Second poll: Exactly 2.0 seconds later, 2,000,000 bytes RX and 500,000 bytes TX added
    stats_t1 = {
        "cpu_stats": {},
        "precpu_stats": {},
        "memory_stats": {},
        "networks": {
            "eth0": {
                "rx_bytes": 12_000_000,
                "tx_bytes": 5_500_000,
                "rx_packets": 1200,
                "tx_packets": 550,
                "rx_errors": 0,
                "tx_errors": 0,
                "rx_dropped": 0,
                "tx_dropped": 0,
            }
        },
    }
    res_t1 = engine.compute_metrics(cid, "c-net", "running", stats_t1, 1002.0, "2026-11-17T00:00:02Z")
    # rx delta = 2,000,000 / 2.0s = 1,000,000 bytes/sec
    # tx delta = 500,000 / 2.0s = 250,000 bytes/sec
    assert res_t1["network_rx_bytes"] == 12_000_000
    assert res_t1["network_tx_bytes"] == 5_500_000
    assert res_t1["network_rx_bytes_per_sec"] == 1_000_000.0
    assert res_t1["network_tx_bytes_per_sec"] == 250_000.0
    # 1,000,000 * 8 / 1,000,000 = 8.0 Mbps
    assert res_t1["network_rx_mbps"] == 8.0
    # 250,000 * 8 / 1,000,000 = 2.0 Mbps
    assert res_t1["network_tx_mbps"] == 2.0


def test_network_counter_reset_on_container_restart():
    """Verify counter reset (negative delta) gracefully resets baseline without negative speed."""
    engine = MonitoringEngine()
    cid = "container_restarted"

    # First poll before restart
    stats_before = {
        "cpu_stats": {},
        "precpu_stats": {},
        "memory_stats": {},
        "networks": {
            "eth0": {"rx_bytes": 50_000_000, "tx_bytes": 30_000_000}
        },
    }
    engine.compute_metrics(cid, "c-restart", "running", stats_before, 1000.0, "2026-11-17T00:00:00Z")

    # Second poll after container restarted: counters reset back to low numbers
    stats_after_restart = {
        "cpu_stats": {},
        "precpu_stats": {},
        "memory_stats": {},
        "networks": {
            "eth0": {"rx_bytes": 100, "tx_bytes": 50}
        },
    }
    res_after = engine.compute_metrics(cid, "c-restart", "running", stats_after_restart, 1001.0, "2026-11-17T00:00:01Z")
    assert res_after["network_rx_bytes"] == 100
    assert res_after["network_tx_bytes"] == 50
    # Negative delta must NOT result in negative speed
    assert res_after["network_rx_bytes_per_sec"] == 0.0
    assert res_after["network_tx_bytes_per_sec"] == 0.0
    assert res_after["network_rx_mbps"] == 0.0
    assert res_after["network_tx_mbps"] == 0.0


def test_network_multiple_interfaces():
    """Verify statistics across multiple network interfaces (eth0 + eth1) are aggregated."""
    engine = MonitoringEngine()
    cid = "container_multi_net"

    stats = {
        "cpu_stats": {},
        "precpu_stats": {},
        "memory_stats": {},
        "networks": {
            "eth0": {"rx_bytes": 1000, "tx_bytes": 2000, "rx_packets": 10, "tx_packets": 20},
            "eth1": {"rx_bytes": 3000, "tx_bytes": 4000, "rx_packets": 30, "tx_packets": 40},
        },
    }
    res = engine.compute_metrics(cid, "c-multinet", "running", stats, 1000.0, "2026-11-17T00:00:00Z")
    assert res["network_rx_bytes"] == 4000
    assert res["network_tx_bytes"] == 6000
    assert res["network_rx_packets"] == 40
    assert res["network_tx_packets"] == 60


# ==============================================================================
# Task 5: Configurable Monitoring Interval & Endpoints
# ==============================================================================

def test_get_monitoring_settings(client):
    """Test GET /api/monitoring/settings returns current configuration."""
    response = client.get("/api/monitoring/settings")
    assert response.status_code == 200
    data = response.json()
    assert "interval_ms" in data
    assert "supported_intervals_ms" in data
    assert 1000 in data["supported_intervals_ms"]
    assert 2000 in data["supported_intervals_ms"]
    assert 5000 in data["supported_intervals_ms"]
    assert 10000 in data["supported_intervals_ms"]


def test_update_monitoring_settings_valid(client):
    """Test POST /api/monitoring/settings with valid intervals."""
    # Update to 2000 ms
    response = client.post("/api/monitoring/settings", json={"interval_ms": 2000})
    assert response.status_code == 200
    data = response.json()
    assert data["interval_ms"] == 2000
    assert monitoring_engine.interval_ms == 2000

    # Reset back to 1000 ms
    response = client.post("/api/monitoring/settings", json={"interval_ms": 1000})
    assert response.status_code == 200
    assert response.json()["interval_ms"] == 1000


def test_update_monitoring_settings_invalid(client):
    """Test POST /api/monitoring/settings rejects invalid intervals."""
    # Too small (< 500 ms)
    response = client.post("/api/monitoring/settings", json={"interval_ms": 100})
    assert response.status_code == 400

    # Too large (> 60,000 ms)
    response = client.post("/api/monitoring/settings", json={"interval_ms": 70000})
    assert response.status_code == 400


def test_get_monitoring_snapshot(client):
    """Test GET /api/monitoring/snapshot returns structured snapshot."""
    response = client.get("/api/monitoring/snapshot")
    assert response.status_code == 200
    data = response.json()
    assert "type" in data
    assert "data" in data


# ==============================================================================
# Task 6: WebSocket Streaming & Real-Time Protocol Tests
# ==============================================================================

def test_websocket_monitoring_ping_pong(client):
    """Test WebSocket ping/pong protocol over /ws/monitoring."""
    with client.websocket_connect("/ws/monitoring") as websocket:
        websocket.send_text('{"action": "ping"}')
        response = websocket.receive_json()
        assert response.get("type") == "pong"
        assert "timestamp" in response


def test_websocket_monitoring_set_interval(client):
    """Test dynamic interval reconfiguration via WebSocket client message."""
    with client.websocket_connect("/ws/monitoring") as websocket:
        websocket.send_text('{"action": "set_interval", "interval_ms": 5000}')
        response = websocket.receive_json()
        assert response.get("type") == "interval_updated"
        assert response.get("interval_ms") == 5000
        assert monitoring_engine.interval_ms == 5000

        # Restore default
        websocket.send_text('{"action": "set_interval", "interval_ms": 1000}')
        resp2 = websocket.receive_json()
        assert resp2.get("interval_ms") == 1000


def test_websocket_metrics_alias_endpoint(client):
    """Test that /ws/metrics alias behaves consistently with /ws/monitoring."""
    with client.websocket_connect("/ws/metrics") as websocket:
        websocket.send_text('{"action": "ping"}')
        response = websocket.receive_json()
        assert response.get("type") == "pong"
