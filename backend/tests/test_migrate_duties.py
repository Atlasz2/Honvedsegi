"""A szolgálatok Műveletekbe olvasztása: a duties sor gyakorlat lesz,
a beosztott résztvevő, az azonosító megmarad."""
from __future__ import annotations

import json

from sqlalchemy import text

from app.db import SessionLocal
from app.migrate import _migrate_duties_into_exercises


def test_duty_rows_become_exercises_with_participants(client, admin_headers):
    with SessionLocal() as db:
        db.execute(text("DELETE FROM db_migrations WHERE key='v4_duties_into_exercises'"))
        db.execute(text(
            "INSERT INTO duties (id, type, start_date, end_date, location, person_id, person_name, assigned, notes, status) "
            "VALUES ('dm1', 'Őrszolgálat', '2026-03-01T08:00', '2026-03-02T08:00', 'Főkapu', 'p1', 'Szabó Anna', :assigned, 'napló', 'Teljesített')"
        ), {"assigned": json.dumps([{"personId": "p2", "personName": "Kovács János"}])})
        db.commit()
        _migrate_duties_into_exercises(db)

    body = next((e for e in client.get("/api/exercises", headers=admin_headers).json() if e["id"] == "dm1"), None)
    assert body is not None, "a szolgálat gyakorlatként megjelenik"
    assert body["type"] == "Őrszolgálat" and body["location"] == "Főkapu" and body["status"] == "Befejezett"
    names = {a["personName"] for a in body["assigned"]}
    assert names == {"Szabó Anna", "Kovács János"}
    assert all(a["attendance"] == "Megjelent" for a in body["assigned"]), "teljesített szolgálat → megjelent"

    with SessionLocal() as db:
        assert db.execute(text("SELECT COUNT(*) FROM duties")).scalar() == 0
        # újrafuttatva nem duplikál
        _migrate_duties_into_exercises(db)
    assert sum(1 for e in client.get("/api/exercises", headers=admin_headers).json() if e["id"] == "dm1") == 1
