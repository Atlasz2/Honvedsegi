"""Régi adatbázison is el kell indulnia: a hiányzó oszlopokat az indulás pótolja,
MIELŐTT bármi az ORM-en át olvasna (a seed is). Ez a teszt egy department
nélküli users táblával lévő adatbázison futtatja végig az indulási lépéseket."""
from __future__ import annotations

import sqlite3

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.startup import _ensure_extended_schema, _ensure_personnel_sztsz_schema
from app.seed import seed_database


def test_startup_steps_work_on_a_database_without_new_columns(tmp_path, monkeypatch):
    monkeypatch.setenv("BACKEND_ADMIN_PASSWORD", "Admin123")
    monkeypatch.setenv("BACKEND_DEV_MASTER_PASSWORD", "Malnas123")
    db_path = tmp_path / "regi.db"
    con = sqlite3.connect(db_path)
    con.execute(
        "CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, display_name TEXT, "
        "role TEXT, active BOOLEAN, protected BOOLEAN, last_login DATETIME, created_at DATETIME)"
    )
    con.execute("INSERT INTO users VALUES ('u1','regi','x','Régi','admin',1,0,NULL,'2026-01-01')")
    con.commit()
    con.close()

    engine = create_engine(f"sqlite:///{db_path}", future=True)
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, future=True)
    with session_factory() as db:
        # ugyanaz a sorrend, mint a main.lifespan-ben
        _ensure_personnel_sztsz_schema(db)
        _ensure_extended_schema(db)
        seed_database(db)  # a meglévő user miatt nem seedel, de az ORM-en át olvas
        assert "department" in {r[1] for r in db.execute(text("PRAGMA table_info(users)")).fetchall()}
        assert db.execute(text("SELECT department FROM users WHERE username='regi'")).scalar() in ("", None)
