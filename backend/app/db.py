from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
DB_PATH = DATA_DIR / "guard_guard_duty.db"

DATA_DIR.mkdir(parents=True, exist_ok=True)


class Base(DeclarativeBase):
    pass


engine = create_engine(
    f"sqlite:///{DB_PATH}",
    future=True,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)


@event.listens_for(engine, "connect")
def set_sqlite_pragmas(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
