"""A szabadság-/távollét-kezelés (A2) tesztjei, az A1-integrációval együtt."""
from __future__ import annotations


def _create_person(client, headers, *, name, sztsz):
    payload = {"name": name, "sztsz": sztsz, "rank": "honvéd", "unit": "1. század", "status": "Aktív"}
    response = client.post("/api/personnel", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _approved_leave(client, headers, person_id, *, start, end, ltype="Szabadság"):
    created = client.post(
        "/api/leave",
        json={"personnelId": person_id, "type": ltype, "startDate": start, "endDate": end},
        headers=headers,
    ).json()
    client.post(f"/api/leave/{created['id']}/decision", json={"approve": True}, headers=headers)
    return created["id"]


def test_leave_requires_auth(client):
    assert client.get("/api/leave").status_code == 401


def test_create_and_list_leave(client, admin_headers):
    pid = _create_person(client, admin_headers, name="Szabados Pál", sztsz="16000001")
    payload = {"personnelId": pid, "type": "Szabadság", "startDate": "2026-08-01", "endDate": "2026-08-05", "reason": "pihenő"}
    created = client.post("/api/leave", json=payload, headers=admin_headers)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["status"] == "Beadva"
    assert body["days"] == 5
    assert body["personName"] == "Szabados Pál"

    listing = client.get("/api/leave?status=Beadva", headers=admin_headers).json()
    assert any(item["id"] == body["id"] for item in listing)


def test_create_leave_rejects_reversed_range(client, admin_headers):
    pid = _create_person(client, admin_headers, name="Fordi Tóth", sztsz="16000002")
    payload = {"personnelId": pid, "type": "Szabadság", "startDate": "2026-08-10", "endDate": "2026-08-01"}
    assert client.post("/api/leave", json=payload, headers=admin_headers).status_code == 400


def test_decision_approves_leave(client, admin_headers):
    pid = _create_person(client, admin_headers, name="Döntő Géza", sztsz="16000003")
    created = client.post(
        "/api/leave",
        json={"personnelId": pid, "type": "Szabadság", "startDate": "2026-08-01", "endDate": "2026-08-03"},
        headers=admin_headers,
    ).json()
    decided = client.post(f"/api/leave/{created['id']}/decision", json={"approve": True}, headers=admin_headers)
    assert decided.status_code == 200, decided.text
    assert decided.json()["status"] == "Jóváhagyva"


def test_approved_leave_appears_in_attendance(client, admin_headers):
    pid = _create_person(client, admin_headers, name="Távol Levente", sztsz="16000004")
    _approved_leave(client, admin_headers, pid, start="2026-09-10", end="2026-09-12")

    covered = client.get("/api/attendance?date=2026-09-11", headers=admin_headers).json()
    assert next(i for i in covered["items"] if i["personnelId"] == pid)["status"] == "Szabadság"

    uncovered = client.get("/api/attendance?date=2026-09-20", headers=admin_headers).json()
    assert next(i for i in uncovered["items"] if i["personnelId"] == pid)["status"] == "Jelen"


def test_explicit_attendance_overrides_leave(client, admin_headers):
    pid = _create_person(client, admin_headers, name="Felülír Imre", sztsz="16000005")
    _approved_leave(client, admin_headers, pid, start="2026-09-10", end="2026-09-12")

    client.put(
        "/api/attendance",
        json={"date": "2026-09-11", "items": [{"personnelId": pid, "status": "Szolgálatban"}]},
        headers=admin_headers,
    )
    day = client.get("/api/attendance?date=2026-09-11", headers=admin_headers).json()
    assert next(i for i in day["items"] if i["personnelId"] == pid)["status"] == "Szolgálatban"


def test_delete_leave(client, admin_headers):
    pid = _create_person(client, admin_headers, name="Törlő Tamás", sztsz="16000006")
    created = client.post(
        "/api/leave",
        json={"personnelId": pid, "type": "Egyéb", "startDate": "2026-08-01", "endDate": "2026-08-01"},
        headers=admin_headers,
    ).json()
    assert client.delete(f"/api/leave/{created['id']}", headers=admin_headers).status_code == 204
