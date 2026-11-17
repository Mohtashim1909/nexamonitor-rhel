import pytest
from datetime import datetime, timezone
from app.services.insight_engine import insight_engine
from app.models.metrics import ContainerMetric
from app.database.connection import SessionLocal
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_insight_sustained_cpu():
    """Test sustained high CPU rule triggers when average exceeds 80%."""
    db = SessionLocal()
    cid = "test-high-cpu-container"
    now = datetime.now(timezone.utc)

    try:
        # Seed samples with 92% CPU
        for i in range(15):
            sample = ContainerMetric(
                container_id=cid,
                container_name="cpu-hog",
                cpu_percent=92.0,
                memory_usage=50000000,
                memory_limit=1000000000,
                memory_percent=5.0,
                network_rx=1000,
                network_tx=1000,
                timestamp=now,
            )
            db.add(sample)
        db.commit()

        insights = insight_engine.evaluate_container(db, cid, "cpu-hog")
        cpu_insights = [i for i in insights if i["category"] == "CPU_SATURATION"]
        assert len(cpu_insights) > 0
        assert cpu_insights[0]["severity"] == "CRITICAL"
        assert cpu_insights[0]["category"] == "CPU_SATURATION"
    finally:
        db.query(ContainerMetric).filter(ContainerMetric.container_id == cid).delete()
        db.commit()
        db.close()


def test_insight_idle_workload():
    """Test idle container rule triggers when CPU < 0.5% and low network."""
    db = SessionLocal()
    cid = "test-idle-container"
    now = datetime.now(timezone.utc)

    try:
        # Seed 15 idle samples
        for i in range(15):
            sample = ContainerMetric(
                container_id=cid,
                container_name="idle-box",
                cpu_percent=0.1,
                memory_usage=50000000,
                memory_limit=1000000000,
                memory_percent=5.0,
                network_rx_speed=50.0,
                network_tx_speed=50.0,
                timestamp=now,
            )
            db.add(sample)
        db.commit()

        insights = insight_engine.evaluate_container(db, cid, "idle-box")
        idle_insights = [i for i in insights if i["category"] == "IDLE_CANDIDATE"]
        assert len(idle_insights) > 0
        assert idle_insights[0]["severity"] == "INFO"
        assert idle_insights[0]["category"] == "IDLE_CANDIDATE"
    finally:
        db.query(ContainerMetric).filter(ContainerMetric.container_id == cid).delete()
        db.commit()
        db.close()


def test_api_insights_endpoints():
    """Test GET /api/insights and /api/insights/summary."""
    res = client.get("/api/insights")
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    summary_res = client.get("/api/insights/summary")
    assert summary_res.status_code == 200
    s_data = summary_res.json()
    assert "total" in s_data
    assert "by_category" in s_data
    assert "critical" in s_data

