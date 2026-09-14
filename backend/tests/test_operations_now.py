"""Áttekintés: ma futó műveletek + a következő 7 napban induló műveletek.
A sorozat-elem is művelet — ugyanúgy megjelenik a közelgők között."""
from __future__ import annotations

from datetime import date, timedelta


def _exercise(client, headers, **overrides):
    body = {
        "name": "Most-teszt", "type": "Gyakorlat", "startDate": "2030-01-01", "endDate": "2030-01-02",
        "location": "X", "organizer": "", "maxPersonnel": 10, "description": "", "status": "Tervezett",
        "qualificationId": "", "seriesId": "", "level": "", "assigned": [],
    }
    body.update(overrides)
    r = client.post("/api/exercises", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_now_lists_running_and_upcoming_including_series_items(client, admin_headers):
    today = date.today()
    d = lambda n: (today + timedelta(days=n)).isoformat()  # noqa: E731
    sid = client.post("/api/series", json={"name": "Közelgő sorozat"}, headers=admin_headers).json()["id"]

    running = _exercise(client, admin_headers, name="Ma fut", startDate=d(-1), endDate=d(1))
    soon = _exercise(client, admin_headers, name="Holnapután", startDate=d(2), endDate=d(2))
    series_item = _exercise(client, admin_headers, name="Sorozat-elem", startDate=d(3), endDate=d(3), seriesId=sid, level="Alap")
    far = _exercise(client, admin_headers, name="Túl messze", startDate=d(9), endDate=d(9))
    cancelled = _exercise(client, admin_headers, name="Lemondott", startDate=d(4), endDate=d(4), status="Lemondva")

    body = client.get("/api/operations/now", headers=admin_headers).json()
    running_ids = {r["id"] for r in body["running"]}
    upcoming_ids = {u["id"] for u in body["upcoming"]}

    assert running["id"] in running_ids
    assert running["id"] not in upcoming_ids, "ami már fut, az nem „közelgő”"
    assert soon["id"] in upcoming_ids
    assert series_item["id"] in upcoming_ids, "a sorozat-elem is megjelenik"
    assert far["id"] not in upcoming_ids
    assert cancelled["id"] not in upcoming_ids
    item = next(u for u in body["upcoming"] if u["id"] == series_item["id"])
    assert item["seriesId"] == sid and item["source"] == "exercise"
