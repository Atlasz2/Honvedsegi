from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker


ROOT_DIR = Path(__file__).resolve().parents[1]

# Tests (and alternative deployments) can point the database elsewhere via
# BACKEND_DB_PATH; otherwise it lives next to the backend in data/.
_db_path_override = os.getenv("BACKEND_DB_PATH", "").strip()
if _db_path_override:
    DB_PATH = Path(_db_path_override).expanduser().resolve()
else:
    DB_PATH = ROOT_DIR / "data" / "guard_guard_duty.db"

DB_PATH.parent.mkdir(parents=True, exist_ok=True)


class Base(DeclarativeBase):
    pass


engine = create_engine(
    f"sqlite:///{DB_PATH}",
    future=True,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=10,
)


@event.listens_for(engine, "connect")
def set_sqlite_pragmas(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=10000")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA cache_size=-32000")   # 32 MB page cache
    cursor.execute("PRAGMA temp_store=MEMORY")
    cursor.execute("PRAGMA mmap_size=268435456")  # 256 MB memory-mapped I/O
    cursor.execute("PRAGMA wal_autocheckpoint=1000")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
