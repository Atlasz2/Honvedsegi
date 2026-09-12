"""Jogviszony altípus: aktív (szerződéses/hivatásos) és tartalékos (önkéntes /
állandó behívásos). Szabadság csak aktívnak, szolgálatmentesség csak állandó
behívásos tartalékosnak."""
from __future__ import annotations


def _person(client, headers, name, sztsz, status, service_type=""):
    r = client.post("/api/personnel", json={"name": name, "sztsz": sztsz, "rank": "honvéd", "unit": "1. század",
                                            "status": status, "serviceType": service_type}, headers=headers)
    return r


def _leave(client, headers, pid, leave_type):
    return client.post("/api/leave", json={"personnelId": pid, "type": leave_type, "startDate": "2099-03-02", "endDate": "2099-03-03", "reason": ""}, headers=headers)


def test_service_type_must_match_status(client, admin_headers):
    ok = _person(client, admin_headers, "Hivatásos Hugó", "44100001", "Aktív", "Hivatásos")
    assert ok.status_code == 200, ok.text
    assert ok.json()["serviceType"] == "Hivatásos"
    bad = _person(client, admin_headers, "Rossz Rezső", "44100002", "Tartalékos", "Hivatásos")
    assert bad.status_code == 422
    assert "Tartalékos" in bad.text
    empty = _person(client, admin_headers, "Üres Ubul", "44100003", "Tartalékos")
    assert empty.status_code == 200 and empty.json()["serviceType"] == ""

    ref = client.get("/api/reference", headers=admin_headers).json()
    assert ref["serviceTypes"]["Tartalékos"] == ["Önkéntes tartalékos", "Állandó behívásos"]


def test_leave_rules_by_service_type(client, admin_headers):
    active = _person(client, admin_headers, "Aktív Aladár", "44100011", "Aktív", "Szerződéses").json()["id"]
    reserve = _person(client, admin_headers, "Tartalékos Tibor", "44100012", "Tartalékos", "Önkéntes tartalékos").json()["id"]
    permanent = _person(client, admin_headers, "Behívott Béla", "44100013", "Tartalékos", "Állandó behívásos").json()["id"]

    assert _leave(client, admin_headers, active, "Szabadság").status_code == 201
    assert _leave(client, admin_headers, active, "Szolgálatmentesség").status_code == 400

    r = _leave(client, admin_headers, reserve, "Szabadság")
    assert r.status_code == 400 and "aktív" in r.json()["detail"].lower()
    assert _leave(client, admin_headers, reserve, "Szolgálatmentesség").status_code == 400
    assert _leave(client, admin_headers, reserve, "Betegszabadság").status_code == 201

    r = _leave(client, admin_headers, permanent, "Szabadság")
    assert r.status_code == 400 and "szolgálatmentesség" in r.json()["detail"].lower()
    assert _leave(client, admin_headers, permanent, "Szolgálatmentesség").status_code == 201
