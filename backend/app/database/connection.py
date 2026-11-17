import logging
from sqlalchemy import create_engine, text, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

logger = logging.getLogger("nexamonitor.database")

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False}
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable SQLite WAL mode and busy timeout for high-concurrency read/write."""
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()
    except Exception as pragma_err:
        logger.debug(f"SQLite PRAGMA configuration note: {pragma_err}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_or_migrate_db():
    """
    Ensure all tables, missing columns, and composite indexes exist safely without data loss.
    """
    # Import models so Base.metadata is fully populated
    import app.models.metrics  # noqa: F401

    # 1. Create tables if not exist
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as ddl_err:
        logger.debug(f"Metadata create_all notice: {ddl_err}")

    # 2. Add missing columns dynamically for schema evolution in SQLite
    try:
        with engine.begin() as conn:
            res = conn.execute(text("PRAGMA table_info(container_metrics)"))
            existing_cols = {row[1] for row in res.fetchall()}

            col_defs = {
                "cpu_usage_total": "BIGINT",
                "network_rx_speed": "FLOAT",
                "network_tx_speed": "FLOAT",
                "disk_read_bytes": "BIGINT",
                "disk_write_bytes": "BIGINT",
                "disk_read_speed": "FLOAT",
                "disk_write_speed": "FLOAT",
            }

            for col_name, col_type in col_defs.items():
                if col_name not in existing_cols:
                    conn.execute(text(f"ALTER TABLE container_metrics ADD COLUMN {col_name} {col_type}"))
                    logger.info(f"Added column container_metrics.{col_name} {col_type}")

            # Ensure composite and timestamp indexes exist on container_metrics
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_container_metrics_cid_timestamp "
                "ON container_metrics (container_id, timestamp)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_container_metrics_timestamp "
                "ON container_metrics (timestamp)"
            ))

            # 3. Add missing columns for alerts table
            alert_res = conn.execute(text("PRAGMA table_info(alerts)"))
            existing_alert_cols = {row[1] for row in alert_res.fetchall()}

            alert_col_defs = {
                "alert_type": "VARCHAR DEFAULT 'RESOURCE_THRESHOLD'",
                "status": "VARCHAR DEFAULT 'ACTIVE'",
                "title": "VARCHAR DEFAULT ''",
                "description": "VARCHAR",
                "observed_value": "FLOAT",
                "threshold_value": "FLOAT",
                "occurrence_count": "INTEGER DEFAULT 1",
                "triggered_at": "DATETIME",
                "last_occurrence": "DATETIME",
                "resolved_at": "DATETIME",
            }

            for col_name, col_type in alert_col_defs.items():
                if col_name not in existing_alert_cols:
                    conn.execute(text(f"ALTER TABLE alerts ADD COLUMN {col_name} {col_type}"))
                    logger.info(f"Added column alerts.{col_name} {col_type}")

            # Populate triggered_at and last_occurrence for pre-existing alerts if null
            conn.execute(text(
                "UPDATE alerts SET triggered_at = created_at WHERE triggered_at IS NULL"
            ))
            conn.execute(text(
                "UPDATE alerts SET last_occurrence = created_at WHERE last_occurrence IS NULL"
            ))
            # Sync status for already acknowledged alerts
            conn.execute(text(
                "UPDATE alerts SET status = 'ACKNOWLEDGED' WHERE is_acknowledged = 1 AND status = 'ACTIVE'"
            ))

            # Ensure indexes exist on alerts table
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_alerts_status ON alerts (status)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_alerts_container_id_status ON alerts (container_id, status)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_alerts_triggered_at ON alerts (triggered_at)"
            ))
    except Exception as e:
        logger.debug(f"Schema migration check completed: {e}")
