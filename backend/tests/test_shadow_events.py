"""A művelet-adminisztráció árnyék-eseménye nem esemény: nem látszhat a
listákban, a naptárban, a foglaltságban és az ütközés-vizsgálatban."""
from __future__ import annotations


def test_shadow_event_is_not_listed_anywhere(client, admin_headers):
    ex = client.post("/api/exercises", json={
        "name": "Árnyék-próba lövészet", "type": "Lövészet", "startDate": "2099-08-01", "endDate": "2099-08-02",
        "location": "Árnyék lőtér", "maxPersonnel": 5, "description": "", "status": "Tervezett", "qualificationId": "", "assigned": [],
    }, headers=admin_headers).json()
    # a részfeladat-fül megnyitása létrehozza az árnyékot
    assert client.get(f"/api/operations/{ex['id']}/attendance", headers=admin_headers).status_code == 200

    events = client.get("/api/events", headers=admin_headers).json()
    assert not any(e["id"] == ex["id"] for e in events), "az árnyék nem esemény"

    bookings = client.get("/api/availability?start_date=2099-08-01&end_date=2099-08-02&q=Árnyék", headers=admin_headers).json()
    hits = [b for b in bookings if b.get("eventId") == ex["id"]] if isinstance(bookings, list) else []
    assert len(hits) <= 1, "a gyakorlat egyszer foglal, nem kétszer"

    conflicts = client.get("/api/conflicts?location=Árnyék lőtér&start_date=2099-08-01&end_date=2099-08-02", headers=admin_headers).json()
    assert sum(1 for c in conflicts if c["eventId"] == ex["id"]) == 1
