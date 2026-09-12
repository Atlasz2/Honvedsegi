"""Felkészítés-sorozat (szülő entitás) + a műveletek tagsága (series_id)."""
from __future__ import annotations


def _reader_headers(client):
    r = client.post("/api/auth/login", json={"username": "olvaso", "password": "olvaso123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_series_membership_and_item_count(client, admin_headers):
    created = client.post(
        "/api/series",
        json={"name": "7×20 Tartalékos szakfelkészítés", "description": "Sorozat"},
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    sid = created.json()["id"]
    assert created.json()["itemCount"] == 0

    training = client.post(
        "/api/exercises",
        json={
            "name": "ABV", "type": "Kiképzés", "startDate": "2026-06-01", "endDate": "2026-06-02",
            "location": "Gyakorlótér", "organizer": "Törzs", "maxPersonnel": 20, "description": "",
            "status": "Tervezett", "qualificationId": "", "seriesId": sid, "level": "Alap", "assigned": [],
        },
        headers=admin_headers,
    )
    assert training.status_code == 201, training.text
    assert training.json()["seriesId"] == sid
    assert training.json()["level"] == "Alap"

    series_list = client.get("/api/series", headers=admin_headers).json()
    match = next(s for s in series_list if s["id"] == sid)
    assert match["itemCount"] == 1


def test_deleting_series_orphans_children(client, admin_headers):
    sid = client.post("/api/series", json={"name": "Törlendő sorozat"}, headers=admin_headers).json()["id"]
    ex = client.post(
        "/api/exercises",
        json={
            "name": "Modul", "type": "Gyakorlat", "startDate": "2026-07-01", "endDate": "2026-07-01",
            "location": "X", "maxPersonnel": 10, "description": "", "status": "Tervezett",
            "qualificationId": "", "seriesId": sid, "level": "", "assigned": [],
        },
        headers=admin_headers,
    ).json()

    assert client.delete(f"/api/series/{sid}", headers=admin_headers).status_code == 204

    listing = client.get("/api/exercises", headers=admin_headers).json()
    match = next(x for x in listing if x["id"] == ex["id"])
    assert match["seriesId"] == ""  # önállóvá vált, nem törlődött


def test_series_create_requires_editor(client):
    res = client.post("/api/series", json={"name": "Tilos"}, headers=_reader_headers(client))
    assert res.status_code == 403


def test_series_progression_matrix(client, admin_headers):
    sid = client.post("/api/series", json={"name": "Mátrix sorozat"}, headers=admin_headers).json()["id"]
    pid = client.post(
        "/api/personnel",
        json={"name": "Mátrix Máté", "sztsz": "14500001", "rank": "honvéd", "unit": "1. század", "status": "Aktív"},
        headers=admin_headers,
    ).json()["id"]
    training = client.post(
        "/api/exercises",
        json={
            "name": "ABV Alap", "type": "Kiképzés", "startDate": "2026-06-01", "endDate": "2026-06-02",
            "location": "X", "organizer": "T", "maxPersonnel": 20, "description": "", "status": "Befejezett",
            "qualificationId": "", "seriesId": sid, "level": "Alap",
            "assigned": [{"personId": pid, "personName": "Mátrix Máté", "attendance": "Megjelent", "qualificationApproved": False}],
        },
        headers=admin_headers,
    )
    assert training.status_code == 201, training.text
    op_id = training.json()["id"]

    matrix = client.get(f"/api/series/{sid}/matrix", headers=admin_headers).json()
    assert any(o["id"] == op_id and o["level"] == "Alap" for o in matrix["operations"])
    row = next(r for r in matrix["rows"] if r["personnelId"] == pid)
    assert op_id in row["completed"]


def _qual_type_id(client, admin_headers, name):
    from app.db import SessionLocal
    from app.models import QualificationTypeModel, new_id
    qid = new_id()
    with SessionLocal() as db:
        db.add(QualificationTypeModel(id=qid, name=name, category="Kiképzés", validity_days=None, description=""))
        db.commit()
    return qid


def test_auto_level_chain_sets_prerequisite(client, admin_headers):
    qid = _qual_type_id(client, admin_headers, "ABV alap képesítés")
    sid = client.post("/api/series", json={"name": "Lánc sorozat"}, headers=admin_headers).json()["id"]

    base = {
        "type": "Gyakorlat", "startDate": "2026-06-01", "endDate": "2026-06-02", "location": "X",
        "maxPersonnel": 10, "description": "", "status": "Tervezett", "seriesId": sid, "assigned": [],
    }
    # Alap ad egy képesítést
    client.post("/api/exercises", json={**base, "name": "ABV", "level": "Alap", "qualificationId": qid}, headers=admin_headers)
    # Haladó (azonos név) → automatikusan megköveteli az Alap képesítését
    haladó = client.post("/api/exercises", json={**base, "name": "ABV", "level": "Haladó", "qualificationId": ""}, headers=admin_headers)
    assert haladó.status_code == 201, haladó.text

    prereq = client.get(f"/api/prerequisites/exercise/{haladó.json()['id']}", headers=admin_headers).json()
    assert qid in prereq["qualTypeIds"]
