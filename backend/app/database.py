import sqlite3
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def ensure_sqlite_schema():
    """Ensures legacy SQLite database instances receive non-destructive ALTER TABLE additions."""
    if not settings.DATABASE_URL.startswith("sqlite"):
        return
        
    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        tables = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        
        def add_col_if_missing(table, col, typedef):
            if table not in tables:
                return
            cols = [r[1] for r in cursor.execute(f"PRAGMA table_info({table})")]
            if col not in cols:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typedef}")

        add_col_if_missing('plots', 'plot_code', 'VARCHAR(64)')
        add_col_if_missing('plots', 'is_active', 'BOOLEAN DEFAULT 1')
        add_col_if_missing('plots', 'updated_at', 'DATETIME')
        add_col_if_missing('users', 'hashed_password', 'VARCHAR(255)')
        add_col_if_missing('users', 'assigned_villages_json', "TEXT DEFAULT '[]'")
        add_col_if_missing('users', 'assigned_landscapes_json', "TEXT DEFAULT '[]'")
        add_col_if_missing('users', 'updated_at', 'DATETIME')
        add_col_if_missing('subplots', 'registration_id', 'VARCHAR(36)')
        add_col_if_missing('inspections', 'is_locked', 'BOOLEAN DEFAULT 0')
        add_col_if_missing('inspections', 'inspection_phase', "VARCHAR(64) DEFAULT 'phase_1_planting'")
        add_col_if_missing('inspections', 'phase_1_completed', 'BOOLEAN DEFAULT 0')
        add_col_if_missing('inspections', 'phase_2_completed', 'BOOLEAN DEFAULT 0')
        add_col_if_missing('inspections', 'phase_3_completed', 'BOOLEAN DEFAULT 0')
        add_col_if_missing('inspections', 'phase_1_date', 'DATE')
        add_col_if_missing('inspections', 'phase_2_date', 'DATE')
        add_col_if_missing('inspections', 'phase_3_date', 'DATE')
        add_col_if_missing('farmers', 'farmer_status', "VARCHAR(32) DEFAULT 'Existing'")
        add_col_if_missing('parcels', 'land_status', "VARCHAR(32) DEFAULT 'Organic'")
        add_col_if_missing('plot_season_registrations', 'land_status', "VARCHAR(32) DEFAULT 'Organic'")
        
        conn.commit()
        conn.close()
    except Exception:
        pass

# Run automatic SQLite schema checks
ensure_sqlite_schema()

def get_db():
    """FastAPI dependency for yielding database sessions with automatic cleanup."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
