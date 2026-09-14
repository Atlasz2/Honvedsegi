"""Részletes (mező-szintű) tevékenység-naplózás a személyzeti műveleteknél."""
from __future__ import annotations


def test_person_lifecycle_is_logged_with_field_detail(client, admin_headers):
    created = client.post(
        "/api/personnel",
        json={"name": "Napló Nóra", "sztsz": "11000001", "rank": "honvéd", "unit": "1. század", "status": "Aktív"},
        headers=admin_headers,
    )
    assert created.status_code == 200, created.text
    pid = created.json()["id"]

    logs = client.get("/api/activity-log", headers=admin_headers).json()
    create_log = next(
        (l for l in logs if l["module"] == "Személyek" and l["action"] == "létrehozva"
         and (l.get("payload") or {}).get("after", {}).get("name") == "Napló Nóra"),
        None,
    )
    assert create_log is not None
    assert create_log["payload"]["entity"] == "personnel"
    assert create_log["userRole"] == "admin"  # ki okozta — szerepkörrel

    # Módosítás → mező-szintű diff
    client.put(
        f"/api/personnel/{pid}",
        json={"name": "Napló Nikolett", "sztsz": "11000001", "rank": "honvéd", "unit": "1. század", "status": "Aktív"},
        headers=admin_headers,
    )
    logs = client.get("/api/activity-log", headers=admin_headers).json()
    update_log = next(
        (l for l in logs if l["module"] == "Személyek" and l["action"] == "módosítva"
         and any(c["field"] == "name" for c in (l.get("payload") or {}).get("changes", []))),
        None,
    )
    assert update_log is not None
    name_change = next(c for c in update_log["payload"]["changes"] if c["field"] == "name")
    assert name_change["from"] == "Napló Nóra"
    assert name_change["to"] == "Napló Nikolett"

    # Törlés → a teljes előző állapot megőrizve
    assert client.delete(f"/api/personnel/{pid}", headers=admin_headers).status_code == 204
    logs = client.get("/api/activity-log", headers=admin_headers).json()
    delete_log = next(
        (l for l in logs if l["module"] == "Személyek" and l["action"] == "törölve"
         and (l.get("payload") or {}).get("before", {}).get("name") == "Napló Nikolett"),
        None,
    )
    assert delete_log is not None


def test_no_op_update_does_not_log(client, admin_headers):
    created = client.post(
        "/api/personnel",
        json={"name": "Változatlan Vince", "sztsz": "11000002", "rank": "honvéd", "unit": "1. század", "status": "Aktív"},
        headers=admin_headers,
    )
    pid = created.json()["id"]
    same = {"name": "Változatlan Vince", "sztsz": "11000002", "rank": "honvéd", "unit": "1. század", "status": "Aktív"}
    client.put(f"/api/personnel/{pid}", json=same, headers=admin_headers)

    logs = client.get("/api/activity-log", headers=admin_headers).json()
    update_logs = [
        l for l in logs
        if l["module"] == "Személyek" and l["action"] == "módosítva"
        and (l.get("payload") or {}).get("after", {}).get("sztsz") == "11000002"
    ]
    assert update_logs == []  # nincs tényleges változás → nincs napló


def _exercise_payload(**over):
    base = {
        "name": "Napló Gyakorlat", "type": "Gyakorlat", "startDate": "2026-08-01", "endDate": "2026-08-02",
        "location": "X", "maxPersonnel": 10, "description": "", "status": "Tervezett",
        "qualificationId": "", "seriesId": "", "level": "", "assigned": [],
    }
    base.update(over)
    return base


def test_exercise_create_and_update_are_logged_with_detail(client, admin_headers):
    created = client.post("/api/exercises", json=_exercise_payload(), headers=admin_headers)
    assert created.status_code == 201, created.text
    eid = created.json()["id"]

    logs = client.get("/api/activity-log", headers=admin_headers).json()
    assert any(
        l["module"] == "Műveletek" and l["action"] == "létrehozva"
        and (l.get("payload") or {}).get("entity") == "exercise"
        and (l.get("payload") or {}).get("after", {}).get("name") == "Napló Gyakorlat"
        for l in logs
    )

    client.put(f"/api/exercises/{eid}", json=_exercise_payload(location="Y"), headers=admin_headers)
    logs = client.get("/api/activity-log", headers=admin_headers).json()
    update_log = next(
        (l for l in logs if l["module"] == "Műveletek" and l["action"] == "módosítva"
         and any(c["field"] == "location" for c in (l.get("payload") or {}).get("changes", []))),
        None,
    )
    assert update_log is not None
    loc_change = next(c for c in update_log["payload"]["changes"] if c["field"] == "location")
    assert loc_change["from"] == "X" and loc_change["to"] == "Y"
