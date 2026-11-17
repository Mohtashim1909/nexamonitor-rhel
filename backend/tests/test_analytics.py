"""
Phase 4 unit and integration tests for Historical Data Storage and Advanced Analytics:
- Database schema, columns, and composite indexing
- Controlled persistence batch insertion
- Time-range parsing and dynamic bucket calculations
- /api/analytics/containers/{id}/history
- /api/analytics/containers/{id}/summary
- /api/analytics/overview
- /api/analytics/containers/comparison
- /api/analytics/top-consumers
- Data retention cleanup
- Network counter reset handling and volume calculation
"""
import pytest
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.main import app
from app.database.connection import SessionLocal, engine, init_or_migrate_db
from app.models.metrics import ContainerMetric
from app.services.monitoring_engine import monitoring_engine
from app.services.analytics_service import analytics_service


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def clean_db():
    """Ensure database has fresh schema and clean state for tests."""
    init_or_migrate_db()
    db = SessionLocal()
    db.query(ContainerMetric).delete()
    db.commit()
    db.close()
    yield
    db = SessionLocal()
    db.query(ContainerMetric).delete()
    db.commit()
    db.close()


# ==============================================================================
# Task 1: Database Inspection & Schema Tests
# ==============================================================================

def test_database_schema_and_indexes():
    """Verify that all Phase 4 columns and composite indexes exist on container_metrics."""
    with engine.connect() as conn:
        res = conn.execute(text("PRAGMA table_info(container_metrics)"))
        cols = {row[1] for row in res.fetchall()}

        required_cols = {
            "id",
            "container_id",
            "container_name",
            "cpu_percent",
            "cpu_usage_total",
            "memory_usage",
            "memory_limit",
            "memory_percent",
            "network_rx",
            "network_tx",
            "network_rx_speed",
            "network_tx_speed",
            "disk_read_bytes",
            "disk_write_bytes",
            "disk_read_speed",
            "disk_write_speed",
            "timestamp",
        }
        for col in required_cols:
            assert col in cols, f"Missing required column: {col}"

        # Verify indexes
        idx_res = conn.execute(text("PRAGMA index_list(container_metrics)"))
        idx_names = {row[1] for row in idx_res.fetchall()}
        assert "ix_container_metrics_cid_timestamp" in idx_names or "ix_container_metrics_container_id" in idx_names


# ==============================================================================
# Task 2: Controlled Metric Persistence Tests
# ==============================================================================

def test_metric_persistence_batch():
    """Verify that monitoring engine persists metrics batch with accurate values."""
    metrics_sample = [
        {
            "container_id": "cid_test_1",
            "container_name": "web_server",
            "cpu_usage_percent": 14.5,
            "cpu_usage_total": 500000000,
            "memory_usage_bytes": 268435456,  # 256 MB
            "memory_limit_bytes": 1073741824, # 1 GB
            "memory_usage_percent": 25.0,
            "network_rx_bytes": 1048576,
            "network_tx_bytes": 524288,
            "network_rx_bytes_per_sec": 10240.0,
            "network_tx_bytes_per_sec": 4096.0,
            "disk_read_bytes": 204800,
            "disk_write_bytes": 409600,
            "disk_read_bytes_per_sec": 512.0,
            "disk_write_bytes_per_sec": 1024.0,
        },
        {
            "container_id": "cid_test_2",
            "container_name": "db_server",
            "cpu_usage_percent": 35.0,
            "cpu_usage_total": 1200000000,
            "memory_usage_bytes": 536870912,  # 512 MB
            "memory_limit_bytes": 2147483648, # 2 GB
            "memory_usage_percent": 25.0,
            "network_rx_bytes": 2097152,
            "network_tx_bytes": 1048576,
            "network_rx_bytes_per_sec": 20480.0,
            "network_tx_bytes_per_sec": 8192.0,
            "disk_read_bytes": 1048576,
            "disk_write_bytes": 2097152,
            "disk_read_bytes_per_sec": 4096.0,
            "disk_write_bytes_per_sec": 8192.0,
        }
    ]

    saved = monitoring_engine._persist_metrics_batch(metrics_sample)
    assert saved == 2

    db = SessionLocal()
    records = db.query(ContainerMetric).all()
    assert len(records) == 2
    rec1 = db.query(ContainerMetric).filter_by(container_id="cid_test_1").first()
    assert rec1 is not None
    assert rec1.container_name == "web_server"
    assert rec1.cpu_percent == 14.5
    assert rec1.memory_usage == 268435456
    assert rec1.network_rx_speed == 10240.0
    db.close()


# ==============================================================================
# Task 3 & 4: Historical Metrics API & Time Range Filtering
# ==============================================================================

def test_get_container_history_empty(client):
    """Verify endpoint handles containers with no history gracefully."""
    response = client.get("/api/analytics/containers/non_existent_cid/history?time_range=1h")
    assert response.status_code == 200
    data = response.json()
    assert data["container_id"] == "non_existent_cid"
    assert data["points"] == []


def test_get_container_history_with_data(client):
    """Verify aggregated history returns time-bucketed points with avg/max/min."""
    db = SessionLocal()
    base_time = datetime.datetime.utcnow() - datetime.timedelta(minutes=10)

    # Insert 5 sample records 1 minute apart
    for i in range(5):
        sample_time = base_time + datetime.timedelta(minutes=i)
        metric = ContainerMetric(
            container_id="c_history_test",
            container_name="app_worker",
            cpu_percent=10.0 + i * 5.0, # 10, 15, 20, 25, 30
            memory_usage=100 * 1024 * 1024 + i * 10 * 1024 * 1024,
            memory_limit=1024 * 1024 * 1024,
            memory_percent=10.0 + i,
            network_rx=1000 + i * 500,
            network_tx=500 + i * 250,
            network_rx_speed=500.0,
            network_tx_speed=250.0,
            disk_read_bytes=100,
            disk_write_bytes=200,
            disk_read_speed=10.0,
            disk_write_speed=20.0,
            timestamp=sample_time,
        )
        db.add(metric)
    db.commit()
    db.close()

    response = client.get("/api/analytics/containers/c_history_test/history?time_range=1h")
    assert response.status_code == 200
    data = response.json()
    assert data["container_id"] == "c_history_test"
    assert data["container_name"] == "app_worker"
    assert len(data["points"]) > 0
    # Check metric fields
    first_pt = data["points"][0]
    assert "cpu" in first_pt
    assert "cpu_avg" in first_pt
    assert "cpu_max" in first_pt
    assert "cpu_min" in first_pt
    assert "memory" in first_pt
    assert "network_rx_kb" in first_pt


def test_invalid_time_range_handling(client):
    """Verify endpoint rejects invalid custom date ranges."""
    # start_time > end_time
    response = client.get(
        "/api/analytics/containers/c1/history?"
        "start_time=2026-11-17T10:00:00Z&end_time=2026-11-17T08:00:00Z"
    )
    assert response.status_code == 400

    # Range > 90 days
    response2 = client.get(
        "/api/analytics/containers/c1/history?"
        "start_time=2026-01-01T00:00:00Z&end_time=2026-11-17T00:00:00Z"
    )
    assert response2.status_code == 400


# ==============================================================================
# Task 5: Summary Calculations & Counter Resets
# ==============================================================================

def test_container_summary_calculation(client):
    """Verify statistical summary and network volume calculation."""
    db = SessionLocal()
    now = datetime.datetime.utcnow()

    # Insert 3 records with positive cumulative byte increases
    db.add(ContainerMetric(
        container_id="c_summary",
        container_name="api_service",
        cpu_percent=10.0,
        memory_usage=200 * 1024 * 1024,
        memory_limit=1024 * 1024 * 1024,
        memory_percent=20.0,
        network_rx=1000,
        network_tx=500,
        network_rx_speed=100.0,
        network_tx_speed=50.0,
        disk_read_bytes=1000,
        disk_write_bytes=2000,
        timestamp=now - datetime.timedelta(minutes=3),
    ))
    db.add(ContainerMetric(
        container_id="c_summary",
        container_name="api_service",
        cpu_percent=30.0,
        memory_usage=300 * 1024 * 1024,
        memory_limit=1024 * 1024 * 1024,
        memory_percent=30.0,
        network_rx=2500, # +1500 diff
        network_tx=1000, # +500 diff
        network_rx_speed=300.0,
        network_tx_speed=150.0,
        disk_read_bytes=2000, # +1000 diff
        disk_write_bytes=4000, # +2000 diff
        timestamp=now - datetime.timedelta(minutes=1),
    ))
    db.commit()
    db.close()

    response = client.get("/api/analytics/containers/c_summary/summary?time_range=1h")
    assert response.status_code == 200
    data = response.json()
    assert data["container_id"] == "c_summary"
    assert data["sample_count"] == 2
    assert data["cpu"]["avg"] == 20.0
    assert data["cpu"]["max"] == 30.0
    assert data["cpu"]["min"] == 10.0
    assert data["memory"]["avg_percent"] == 25.0
    # Network total traffic must equal delta sum (1500 RX, 500 TX), NOT sum of cumulative counters (1000 + 2500 = 3500)
    assert data["network"]["total_rx_bytes"] == 1500
    assert data["network"]["total_tx_bytes"] == 500
    assert data["disk"]["total_read_bytes"] == 1000
    assert data["disk"]["total_write_bytes"] == 2000


def test_network_volume_counter_reset_on_container_restart(client):
    """Verify container restart (counter dropping) is handled without negative/corrupted volume."""
    db = SessionLocal()
    now = datetime.datetime.utcnow()

    # 1. Before restart
    db.add(ContainerMetric(
        container_id="c_restart",
        container_name="worker",
        network_rx=50_000_000,
        network_tx=20_000_000,
        timestamp=now - datetime.timedelta(minutes=5),
    ))
    db.add(ContainerMetric(
        container_id="c_restart",
        container_name="worker",
        network_rx=52_000_000, # +2,000,000 diff
        network_tx=21_000_000, # +1,000,000 diff
        timestamp=now - datetime.timedelta(minutes=4),
    ))
    # 2. Container restarted: counter dropped back to 1000
    db.add(ContainerMetric(
        container_id="c_restart",
        container_name="worker",
        network_rx=1000, # reset, ignored
        network_tx=500,  # reset, ignored
        timestamp=now - datetime.timedelta(minutes=2),
    ))
    # 3. After restart: counter resumed growing
    db.add(ContainerMetric(
        container_id="c_restart",
        container_name="worker",
        network_rx=6000, # +5000 diff
        network_tx=2500, # +2000 diff
        timestamp=now - datetime.timedelta(minutes=1),
    ))
    db.commit()
    db.close()

    response = client.get("/api/analytics/containers/c_restart/summary?time_range=1h")
    assert response.status_code == 200
    data = response.json()
    # Expected RX: 2,000,000 + 5000 = 2,005,000 (negative delta on reset skipped)
    assert data["network"]["total_rx_bytes"] == 2_005_000
    # Expected TX: 1,000,000 + 2000 = 1,002,000
    assert data["network"]["total_tx_bytes"] == 1_002_000


# ==============================================================================
# Task 6: Cluster Overview Analytics Tests
# ==============================================================================

def test_cluster_overview_analytics(client):
    """Verify cluster overview returns aggregate statistics and series across all containers."""
    db = SessionLocal()
    now = datetime.datetime.utcnow()

    db.add(ContainerMetric(
        container_id="c_a",
        container_name="service_a",
        cpu_percent=15.0,
        memory_usage=200 * 1024 * 1024,
        memory_percent=20.0,
        network_rx=1000,
        network_tx=500,
        network_rx_speed=500.0,
        network_tx_speed=200.0,
        disk_read_speed=50.0,
        disk_write_speed=100.0,
        timestamp=now - datetime.timedelta(minutes=2),
    ))
    db.add(ContainerMetric(
        container_id="c_b",
        container_name="service_b",
        cpu_percent=25.0,
        memory_usage=400 * 1024 * 1024,
        memory_percent=40.0,
        network_rx=2000,
        network_tx=1000,
        network_rx_speed=800.0,
        network_tx_speed=400.0,
        disk_read_speed=80.0,
        disk_write_speed=150.0,
        timestamp=now - datetime.timedelta(minutes=2),
    ))
    db.commit()
    db.close()

    response = client.get("/api/analytics/overview?time_range=1h")
    assert response.status_code == 200
    data = response.json()
    assert data["total_containers_tracked"] == 2
    assert data["total_samples"] == 2
    assert data["cpu"]["avg"] == 20.0
    assert data["cpu"]["max"] == 25.0
    assert data["cpu"]["min"] == 15.0
    assert len(data["series"]) > 0


# ==============================================================================
# Task 8 & 9: Container Comparison & Top Consumers Tests
# ==============================================================================

def test_container_comparison_analytics(client):
    """Verify comparing multiple container IDs."""
    db = SessionLocal()
    now = datetime.datetime.utcnow()

    for cid, name, cpu in [("c1", "redis", 5.0), ("c2", "postgres", 35.0)]:
        db.add(ContainerMetric(
            container_id=cid,
            container_name=name,
            cpu_percent=cpu,
            memory_usage=200 * 1024 * 1024,
            memory_percent=20.0,
            network_rx=1000,
            network_tx=500,
            network_rx_speed=100.0,
            network_tx_speed=50.0,
            timestamp=now - datetime.timedelta(minutes=2),
        ))
    db.commit()
    db.close()

    response = client.get("/api/analytics/containers/comparison?container_ids=c1,c2&time_range=1h")
    assert response.status_code == 200
    data = response.json()
    assert len(data["containers"]) == 2
    cids = {c["container_id"] for c in data["containers"]}
    assert "c1" in cids
    assert "c2" in cids


def test_top_consumers_analytics(client):
    """Verify top consumers ranking by CPU and memory."""
    db = SessionLocal()
    now = datetime.datetime.utcnow()

    for cid, name, cpu, mem_mb in [
        ("c_low", "low_load", 5.0, 50.0),
        ("c_high", "high_load", 85.0, 500.0),
        ("c_med", "med_load", 40.0, 200.0),
    ]:
        db.add(ContainerMetric(
            container_id=cid,
            container_name=name,
            cpu_percent=cpu,
            memory_usage=int(mem_mb * 1024 * 1024),
            memory_percent=cpu / 2,
            network_rx=1000,
            network_tx=500,
            timestamp=now - datetime.timedelta(minutes=1),
        ))
    db.commit()
    db.close()

    # Query top 2 CPU consumers
    response = client.get("/api/analytics/top-consumers?metric=cpu&limit=2&time_range=1h")
    assert response.status_code == 200
    data = response.json()
    assert len(data["rankings"]) == 2
    assert data["rankings"][0]["container_id"] == "c_high"
    assert data["rankings"][0]["avg_cpu"] == 85.0
    assert data["rankings"][1]["container_id"] == "c_med"


# ==============================================================================
# Task 10: Data Retention & Cleanup Tests
# ==============================================================================

def test_data_retention_cleanup(client):
    """Verify records older than retention period are safely purged."""
    db = SessionLocal()
    now = datetime.datetime.utcnow()

    # 1. Old record (45 days ago)
    db.add(ContainerMetric(
        container_id="c_old",
        container_name="old_job",
        cpu_percent=10.0,
        timestamp=now - datetime.timedelta(days=45),
    ))
    # 2. Recent record (5 days ago)
    db.add(ContainerMetric(
        container_id="c_recent",
        container_name="recent_job",
        cpu_percent=20.0,
        timestamp=now - datetime.timedelta(days=5),
    ))
    db.commit()
    db.close()

    # Cleanup with 30-day retention
    response = client.post("/api/analytics/retention/cleanup?retention_days=30")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["deleted_records"] == 1

    # Verify only recent record remains
    db = SessionLocal()
    remaining = db.query(ContainerMetric).all()
    assert len(remaining) == 1
    assert remaining[0].container_id == "c_recent"
    db.close()
