"""Tevékenységnapló — szerepkör-szintű láthatóság."""
from __future__ import annotations


def _reader_headers(client):
    response = client.post("/api/auth/login", json={"username": "olvaso", "password": "olvaso123"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def _log(client, headers, record_name):
    payload = {"userId": "x", "userName": "X", "action": "módosítva", "module": "Teszt", "recordName": record_name}
    response = client.post("/api/activity-log", json=payload, headers=headers)
    assert response.status_code == 200, response.text


def test_reader_does_not_see_admin_actions_but_admin_sees_readers(client, admin_headers):
    reader = _reader_headers(client)
    _log(client, admin_headers, "admin-tett")
    _log(client, reader, "olvaso-tett")

    admin_names = {e["recordName"] for e in client.get("/api/activity-log", headers=admin_headers).json()}
    assert "admin-tett" in admin_names
    assert "olvaso-tett" in admin_names  # admin lefelé lát

    reader_names = {e["recordName"] for e in client.get("/api/activity-log", headers=reader).json()}
    assert "olvaso-tett" in reader_names
    assert "admin-tett" not in reader_names  # olvasó nem lát felfelé


def test_log_stores_server_side_role(client, admin_headers):
    _log(client, admin_headers, "szerep-teszt")
    entries = client.get("/api/activity-log", headers=admin_headers).json()
    entry = next(e for e in entries if e["recordName"] == "szerep-teszt")
    assert entry["userRole"] == "admin"
