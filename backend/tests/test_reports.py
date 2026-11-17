import pytest
from datetime import datetime, timezone, timedelta
from app.services.report_service import report_service
from app.models.metrics import ContainerMetric
from app.database.connection import SessionLocal
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_report_service_daily_computation():
    """Test generating a daily report with seeded metrics."""
    db = SessionLocal()
    cid = "test-report-container"
    now = datetime.now(timezone.utc)

    try:
        # Seed 10 metrics
        for i in range(10):
            sample = ContainerMetric(
                container_id=cid,
                container_name="report-worker",
                cpu_percent=15.0 + i,
                memory_usage=104857600 + (i * 1000000),  # ~100MB
                memory_limit=1073741824,
                memory_percent=10.0,
                network_rx=10000 * (i + 1),
                network_tx=5000 * (i + 1),
                timestamp=now - timedelta(minutes=10 - i),
            )
            db.add(sample)
        db.commit()

        start = now - timedelta(hours=24)
        report = report_service.get_report_data(start, now, "daily")

        assert report["report_type"] == "daily"
        assert report["summary"]["total_containers_tracked"] >= 1
        assert report["summary"]["avg_cpu_percent"] > 0
        assert report["summary"]["avg_memory_mb"] > 0
        assert len(report["containers"]) >= 1
    finally:
        db.query(ContainerMetric).filter(ContainerMetric.container_id == cid).delete()
        db.commit()
        db.close()


def test_api_report_endpoints():
    """Test GET /api/reports/daily, /weekly, and export endpoints."""
    # Daily
    res = client.get("/api/reports/daily")
    assert res.status_code == 200
    data = res.json()
    assert "summary" in data
    assert "containers" in data
    assert "top_consumers" in data

    # Weekly
    res_w = client.get("/api/reports/weekly")
    assert res_w.status_code == 200

    # CSV Export
    csv_res = client.get("/api/reports/daily/export/csv")
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    assert "NexaMonitor" in csv_res.text

    # PDF Export
    pdf_res = client.get("/api/reports/daily/export/pdf")
    assert pdf_res.status_code == 200
    assert "application/pdf" in pdf_res.headers["content-type"]
    # PDF files start with %PDF-
    assert pdf_res.content.startswith(b"%PDF-")
