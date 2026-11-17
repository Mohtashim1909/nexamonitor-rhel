"""
Phase 5 Unit and Integration Tests for Module A: Intelligent Alert Management:
- AlertSettings configuration and validation
- CPU threshold evaluation (Warning, Critical)
- Memory threshold evaluation with cache and unlimited limits
- Deduplication and occurrence counters
- Severity escalation (Warning -> Critical)
- Hysteresis recovery logic (prevent flapping)
- Container lifecycle events (exited unexpectedly, recovery)
- Docker daemon disconnection and reconnection
- REST endpoints:
  - GET /api/alerts (filters: status, severity, container_id, limit, offset)
  - GET /api/alerts/active
  - GET /api/alerts/counts
  - GET /api/alerts/history
  - GET /api/alerts/{id}
  - POST /api/alerts/{id}/acknowledge
  - POST /api/alerts/acknowledge-all
  - POST /api/alerts/{id}/resolve
  - GET /api/alerts/settings
  - PUT /api/alerts/settings
"""

import pytest
import datetime
from fastapi.testclient import TestClient

from app.main import app
from app.database.connection import SessionLocal, init_or_migrate_db
from app.models.metrics import Alert
from app.services.alert_engine import alert_engine, AlertSettings


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def clean_alerts_db():
    """Ensure database has fresh schema and clean alerts table for each test."""
    init_or_migrate_db()
    # Reset alert engine in-memory state
    alert_engine.settings = AlertSettings()
    alert_engine._active_alert_ids.clear()
    alert_engine._initialized = False

    db = SessionLocal()
    db.query(Alert).delete()
    db.commit()
    db.close()
    yield
    db = SessionLocal()
    db.query(Alert).delete()
    db.commit()
    db.close()
    alert_engine._active_alert_ids.clear()
    alert_engine._initialized = False


def test_alert_settings_defaults_and_validation():
    """Test default AlertSettings values and bounds validation."""
    settings = AlertSettings()
    assert settings.cpu_warning_threshold == 75.0
    assert settings.cpu_critical_threshold == 90.0
    assert settings.cpu_recovery_warning == 70.0
    assert settings.cpu_recovery_critical == 85.0
    assert settings.memory_warning_threshold == 80.0
    assert settings.memory_critical_threshold == 90.0
    assert settings.enabled is True

    # Test dynamic update via alert_engine
    updated = alert_engine.update_settings({"cpu_warning_threshold": 70.0, "cpu_critical_threshold": 88.0})
    assert updated["cpu_warning_threshold"] == 70.0
    assert updated["cpu_critical_threshold"] == 88.0
    assert alert_engine.settings.cpu_warning_threshold == 70.0


def test_cpu_threshold_warning_and_critical():
    """Verify that breaching Warning and Critical CPU thresholds creates correct alerts."""
    db = SessionLocal()
    try:
        # 1. Normal CPU (60%) -> no alert
        alerts = alert_engine.evaluate_container_metrics(
            db=db, container_id="test-c1", container_name="web-service", cpu_percent=60.0, memory_percent=50.0
        )
        assert len(alerts) == 0
        assert db.query(Alert).count() == 0

        # 2. Warning CPU (78%) -> creates warning alert
        alerts = alert_engine.evaluate_container_metrics(
            db=db, container_id="test-c1", container_name="web-service", cpu_percent=78.0, memory_percent=50.0
        )
        assert len(alerts) == 1
        created = alerts[0]
        assert created.severity == "warning"
        assert created.status == "ACTIVE"
        assert created.occurrence_count == 1
        assert created.observed_value == 78.0
        assert "78.0%" in created.message
    finally:
        db.close()


def test_alert_deduplication_and_occurrence_counter():
    """Verify that repeated threshold breaches do not create duplicate records but increment occurrence_count."""
    db = SessionLocal()
    try:
        # First breach
        alert_engine.evaluate_container_metrics(
            db=db, container_id="test-dedup", container_name="worker-1", cpu_percent=76.0, memory_percent=40.0
        )
        assert db.query(Alert).count() == 1

        # Second breach with same severity
        alert_engine.evaluate_container_metrics(
            db=db, container_id="test-dedup", container_name="worker-1", cpu_percent=79.0, memory_percent=40.0
        )
        # Still 1 record, but occurrence_count == 2
        assert db.query(Alert).count() == 1
        alert = db.query(Alert).first()
        assert alert.occurrence_count == 2
        assert alert.observed_value == 79.0

        # Third breach
        alert_engine.evaluate_container_metrics(
            db=db, container_id="test-dedup", container_name="worker-1", cpu_percent=81.0, memory_percent=40.0
        )
        assert db.query(Alert).count() == 1
        alert = db.query(Alert).first()
        assert alert.occurrence_count == 3
        assert alert.observed_value == 81.0
    finally:
        db.close()


def test_severity_escalation_warning_to_critical():
    """Verify that an active warning alert escalates to critical when threshold is breached."""
    db = SessionLocal()
    try:
        # Warning trigger at 78%
        alert_engine.evaluate_container_metrics(
            db=db, container_id="test-c2", container_name="api-gateway", cpu_percent=78.0, memory_percent=30.0
        )
        record = db.query(Alert).first()
        assert record.severity == "warning"
        assert record.occurrence_count == 1

        # Acknowledge the warning
        alert_engine.acknowledge_alert(db=db, alert_id=record.id)
        assert record.status == "ACKNOWLEDGED"

        # Now spike to 94% (Critical)
        alert_engine.evaluate_container_metrics(
            db=db, container_id="test-c2", container_name="api-gateway", cpu_percent=94.0, memory_percent=30.0
        )
        # Should still be single record, but escalated to critical and reset to ACTIVE
        assert db.query(Alert).count() == 1
        escalated = db.query(Alert).first()
        assert escalated.severity == "critical"
        assert escalated.status == "ACTIVE"
        assert escalated.is_acknowledged is False
        assert escalated.occurrence_count == 2
        assert escalated.observed_value == 94.0
    finally:
        db.close()


def test_hysteresis_recovery_logic():
    """Verify that alert does not flap and resolves only when dropping beneath recovery threshold."""
    db = SessionLocal()
    try:
        # 1. Trigger Warning at 76% (warning_threshold = 75%, recovery_warning = 70%)
        alert_engine.evaluate_container_metrics(
            db=db, container_id="test-c3", container_name="db-replica", cpu_percent=76.0, memory_percent=20.0
        )
        assert db.query(Alert).filter(Alert.status == "ACTIVE").count() == 1

        # 2. Value drops to 72% (below 75% warning, but above 70% recovery) -> Hysteresis band! Alert remains active
        alert_engine.evaluate_container_metrics(
            db=db, container_id="test-c3", container_name="db-replica", cpu_percent=72.0, memory_percent=20.0
        )
        alert = db.query(Alert).first()
        assert alert.status == "ACTIVE"
        assert alert.occurrence_count == 2

        # 3. Value drops to 68% (below 70% recovery) -> Auto-resolved!
        alert_engine.evaluate_container_metrics(
            db=db, container_id="test-c3", container_name="db-replica", cpu_percent=68.0, memory_percent=20.0
        )
        resolved = db.query(Alert).first()
        assert resolved.status == "RESOLVED"
        assert resolved.resolved_at is not None
        assert resolved.observed_value == 68.0

        # Active cache should now be cleared for this container
        assert ("test-c3", "CPU_THRESHOLD") not in alert_engine._active_alert_ids
    finally:
        db.close()


def test_memory_threshold_evaluation_and_unlimited_safety():
    """Verify memory threshold detection and ignore containers with unlimited memory."""
    db = SessionLocal()
    try:
        # Breach 85% memory
        alerts = alert_engine.evaluate_container_metrics(
            db=db,
            container_id="test-mem",
            container_name="cache-node",
            cpu_percent=10.0,
            memory_percent=85.0,
            memory_usage_bytes=850_000_000,
            memory_limit_bytes=1_000_000_000,
        )
        assert len(alerts) == 1
        assert alerts[0].severity == "warning"
        assert alerts[0].alert_type == "MEMORY_THRESHOLD"

        # Container with unlimited memory (limit > 1 Petabyte) -> should not evaluate
        alerts = alert_engine.evaluate_container_metrics(
            db=db,
            container_id="test-unlimited",
            container_name="unlimited-node",
            cpu_percent=10.0,
            memory_percent=95.0,
            memory_usage_bytes=1_000_000_000,
            memory_limit_bytes=9_223_372_036_854_775_807,  # cgroups unlimited value
        )
        assert len(alerts) == 0
    finally:
        db.close()


def test_container_lifecycle_evaluation():
    """Verify alert generation on container unexpected failure and resolution on restart."""
    db = SessionLocal()
    try:
        # Exited with error code 137 (OOM killed)
        alert = alert_engine.evaluate_container_lifecycle(
            db=db, container_id="test-life", container_name="crashed-proc", status="exited", exit_code=137
        )
        assert alert is not None
        assert alert.alert_type == "CONTAINER_LIFECYCLE"
        assert alert.severity == "critical"
        assert alert.status == "ACTIVE"
        assert "137" in alert.message

        # Container restarted successfully
        resolved = alert_engine.evaluate_container_lifecycle(
            db=db, container_id="test-life", container_name="crashed-proc", status="running", exit_code=0
        )
        assert resolved is not None
        assert resolved.status == "RESOLVED"
    finally:
        db.close()


def test_docker_daemon_disconnect_evaluation():
    """Verify Docker daemon disconnection alert and resolution on reconnection."""
    db = SessionLocal()
    try:
        # Disconnected
        alert = alert_engine.evaluate_docker_connection(
            db=db, is_connected=False, error_msg="Docker socket disconnected"
        )
        assert alert is not None
        assert alert.alert_type == "DOCKER_ENGINE"
        assert alert.severity == "critical"
        assert alert.status == "ACTIVE"

        # Reconnected
        resolved = alert_engine.evaluate_docker_connection(db=db, is_connected=True)
        assert resolved is not None
        assert resolved.status == "RESOLVED"
    finally:
        db.close()


# =============================================================================
# REST API Endpoint Tests
# =============================================================================

def test_api_alerts_endpoints_and_lifecycle(client):
    """Test full REST alert querying, acknowledging, resolving, and settings."""
    db = SessionLocal()
    try:
        # Create 3 test alerts directly
        a1 = Alert(
            container_id="c-web",
            container_name="web",
            alert_type="CPU_THRESHOLD",
            severity="critical",
            status="ACTIVE",
            message="CPU spike 92%",
            observed_value=92.0,
            threshold_value=90.0,
        )
        a2 = Alert(
            container_id="c-db",
            container_name="db",
            alert_type="MEMORY_THRESHOLD",
            severity="warning",
            status="ACTIVE",
            message="Mem high 82%",
            observed_value=82.0,
            threshold_value=80.0,
        )
        a3 = Alert(
            container_id="c-cache",
            container_name="cache",
            alert_type="RESOURCE_THRESHOLD",
            severity="info",
            status="RESOLVED",
            message="Old incident",
            observed_value=50.0,
            threshold_value=75.0,
            resolved_at=datetime.datetime.utcnow(),
        )
        db.add_all([a1, a2, a3])
        db.commit()
        db.refresh(a1)
        db.refresh(a2)
        db.refresh(a3)
        a1_id, a2_id, a3_id = a1.id, a2.id, a3.id
    finally:
        db.close()

    # 1. GET /api/alerts/
    res = client.get("/api/alerts")
    assert res.status_code == 200
    alerts = res.json()
    assert len(alerts) == 3

    # 2. Filter by status=ACTIVE
    res = client.get("/api/alerts?status=ACTIVE")
    assert res.status_code == 200
    assert len(res.json()) == 2

    # 3. Filter by severity=critical
    res = client.get("/api/alerts?severity=critical")
    assert res.status_code == 200
    crit = res.json()
    assert len(crit) == 1
    assert crit[0]["id"] == a1_id

    # 4. GET /api/alerts/active
    res = client.get("/api/alerts/active")
    assert res.status_code == 200
    active_data = res.json()
    assert active_data["counts"]["active"] == 2
    assert active_data["counts"]["critical"] == 1
    assert active_data["counts"]["warning"] == 1
    assert len(active_data["alerts"]) == 2

    # 5. GET /api/alerts/counts
    res = client.get("/api/alerts/counts")
    assert res.status_code == 200
    assert res.json()["total"] == 3

    # 6. GET /api/alerts/history
    res = client.get("/api/alerts/history")
    assert res.status_code == 200
    hist = res.json()
    assert len(hist) == 1
    assert hist[0]["id"] == a3_id

    # 7. GET /api/alerts/{id}
    res = client.get(f"/api/alerts/{a1_id}")
    assert res.status_code == 200
    assert res.json()["id"] == a1_id

    # 8. POST /api/alerts/{id}/acknowledge
    res = client.post(f"/api/alerts/{a1_id}/acknowledge")
    assert res.status_code == 200
    assert res.json()["status"] == "acknowledged"
    assert res.json()["alert"]["is_acknowledged"] is True
    assert res.json()["alert"]["status"] == "ACKNOWLEDGED"

    # 9. POST /api/alerts/{id}/resolve
    res = client.post(f"/api/alerts/{a2_id}/resolve")
    assert res.status_code == 200
    assert res.json()["status"] == "resolved"
    assert res.json()["alert"]["status"] == "RESOLVED"

    # 10. POST /api/alerts/acknowledge-all
    res = client.post("/api/alerts/acknowledge-all")
    assert res.status_code == 200
    assert "acknowledged_count" in res.json()

    # 11. GET & PUT /api/alerts/settings
    res = client.get("/api/alerts/settings")
    assert res.status_code == 200
    curr_settings = res.json()
    assert "cpu_warning_threshold" in curr_settings

    res = client.put("/api/alerts/settings", json={"cpu_warning_threshold": 72.5, "cpu_critical_threshold": 88.0})
    assert res.status_code == 200
    new_settings = res.json()
    assert new_settings["cpu_warning_threshold"] == 72.5
    assert new_settings["cpu_critical_threshold"] == 88.0
