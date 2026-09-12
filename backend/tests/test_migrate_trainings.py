"""A kiképzések Műveletekbe olvasztása: a trainings sor gyakorlat lesz (a
szervező átmegy), a résztvevők/követelmények event_type-ja 'exercise', az
azonosító megmarad. Új adatbázisban nincs trainings tábla — a migráció akkor
is lefut hiba nélkül."""
from __future__ import annotations

from sqlalchemy import text

from app.db import SessionLocal
from app.migrate import _migrate_trainings_into_exercises
from app.models import ParticipantModel

_KEY = "v6_trainings_into_exercises"


def _fresh(db):
    db.execute(text(f"DELETE FROM db_migrations WHERE key='{_KEY}'"))
    db.execute(text("DROP TABLE IF EXISTS trainings"))
    db.execute(text(
        "CREATE TABLE trainings (id TEXT PRIMARY KEY, name TEXT, type TEXT, start_date TEXT, end_date TEXT, "
        "location TEXT, organizer TEXT, max_personnel INTEGER, description TEXT, status TEXT, "
        "qualification_id TEXT, series_id TEXT, level TEXT, assigned JSON)"
    ))


def test_training_rows_become_exercises(client, admin_headers):
    with SessionLocal() as db:
        _fresh(db)
        db.execute(text(
            "INSERT INTO trainings VALUES ('tm1', 'ABV alap', 'Kiképzés', '2026-03-01', '2026-03-02', "
            "'Gyakorlótér', 'Törzs', 20, 'leírás', 'Törölve', '', '', 'Alap', '[]')"
        ))
        db.add(ParticipantModel(
            id="pm1", event_type="training", event_id="tm1", personnel_id="p1", person_name="Szabó Anna",
            rank="őrmester", rank_short="őrm.", sztsz="11111111", role="résztvevő", status="Megjelent",
        ))
        db.commit()
        _migrate_trainings_into_exercises(db)

    body = next((e for e in client.get("/api/exercises", headers=admin_headers).json() if e["id"] == "tm1"), None)
    assert body is not None, "a kiképzés műveletként megjelenik"
    assert body["organizer"] == "Törzs" and body["level"] == "Alap" and body["status"] == "Lemondva"
    assert [a["personName"] for a in body["assigned"]] == ["Szabó Anna"]

    with SessionLocal() as db:
        assert db.execute(text("SELECT COUNT(*) FROM participants WHERE event_type='training'")).scalar() == 0
        # újrafuttatva nem duplikál és nem hibázik
        _migrate_trainings_into_exercises(db)
    assert sum(1 for e in client.get("/api/exercises", headers=admin_headers).json() if e["id"] == "tm1") == 1


def test_migration_is_noop_without_trainings_table(client):
    with SessionLocal() as db:
        db.execute(text(f"DELETE FROM db_migrations WHERE key='{_KEY}'"))
        db.execute(text("DROP TABLE IF EXISTS trainings"))
        db.commit()
        _migrate_trainings_into_exercises(db)
        assert db.execute(text(f"SELECT 1 FROM db_migrations WHERE key='{_KEY}'")).first() is not None
