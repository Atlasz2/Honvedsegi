"""
Adatbázis kapcsolat – MySQL + SQLAlchemy
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DB_USER     = os.getenv("DB_USER",     "honved_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "valtozd_meg")
DB_HOST     = os.getenv("DB_HOST",     "localhost")
DB_PORT     = os.getenv("DB_PORT",     "3306")
DB_NAME     = os.getenv("DB_NAME",     "honved")

DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency – adatbázis session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
