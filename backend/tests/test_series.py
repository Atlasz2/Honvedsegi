"""Felkészítés-sorozat (series) és szint (level) a műveleteknél."""
from __future__ import annotations


def test_training_series_and_level_roundtrip(client, admin_headers):
    payload = {
        "name": "ABV", "type": "Kiképzés", "startDate": "2026-06-01", "endDate": "2026-06-02",
        "location": "Gyakorlótér", "organizer": "Törzs", "maxPersonnel": 20, "description": "",
        "status": "Tervezett", "qualificationId": "",
        "series": "7×20 Tartalékos szakfelkészítés", "level": "Alap", "assigned": [],
    }
    created = client.post("/api/trainings", json=payload, headers=admin_headers)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["series"] == "7×20 Tartalékos szakfelkészítés"
    assert body["level"] == "Alap"

    listing = client.get("/api/trainings", headers=admin_headers).json()
    match = next(t for t in listing if t["id"] == body["id"])
    assert match["series"] == "7×20 Tartalékos szakfelkészítés"
    assert match["level"] == "Alap"


def test_exercise_series_roundtrip(client, admin_headers):
    payload = {
        "name": "Műszaki", "type": "Gyakorlat", "startDate": "2026-06-03", "endDate": "2026-06-04",
        "location": "Műszaki pálya", "maxPersonnel": 15, "description": "", "status": "Tervezett",
        "qualificationId": "", "series": "7×20 Tartalékos szakfelkészítés", "level": "Haladó", "assigned": [],
    }
    created = client.post("/api/exercises", json=payload, headers=admin_headers)
    assert created.status_code == 201, created.text
    assert created.json()["series"] == "7×20 Tartalékos szakfelkészítés"
    assert created.json()["level"] == "Haladó"
