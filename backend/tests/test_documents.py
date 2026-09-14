"""Személyi okmányok / alkalmasság (C1/C2) + lejárat-riasztás."""
from __future__ import annotations

from datetime import date, timedelta


def _person(client, headers, name, sztsz):
    r = client.post(
        "/api/personnel",
        json={"name": name, "sztsz": sztsz, "rank": "honvéd", "unit": "1. század", "status": "Aktív"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_document_crud_and_expiry_flag(client, admin_headers):
    pid = _person(client, admin_headers, "Okmány Ottó", "14700001")
    past = (date.today() - timedelta(days=5)).isoformat()
    created = client.post(
        f"/api/documents/personnel/{pid}",
        json={"category": "Okmány", "name": "Katonai igazolvány", "expiryDate": past},
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    assert created.json()["isExpired"] is True

    docs = client.get(f"/api/documents/personnel/{pid}", headers=admin_headers).json()
    assert any(d["name"] == "Katonai igazolvány" for d in docs)

    assert client.delete(f"/api/documents/{created.json()['id']}", headers=admin_headers).status_code == 204


def test_expiring_documents_alert(client, admin_headers):
    pid = _person(client, admin_headers, "Lejáró Lóránt", "14700002")
    soon = (date.today() + timedelta(days=10)).isoformat()
    client.post(
        f"/api/documents/personnel/{pid}",
        json={"category": "Alkalmasság", "name": "Orvosi alkalmasság", "expiryDate": soon},
        headers=admin_headers,
    )
    expiring = client.get("/api/documents/expiring?days=60", headers=admin_headers).json()
    match = next((e for e in expiring if e["personnelId"] == pid), None)
    assert match is not None
    assert match["documentName"] == "Orvosi alkalmasság"
    assert 0 <= match["daysUntilExpiry"] <= 60


def test_document_add_requires_editor(client):
    r = client.post("/api/auth/login", json={"username": "olvaso", "password": "olvaso123"})
    headers = {"Authorization": f"Bearer {r.json()['token']}"}
    res = client.post("/api/documents/personnel/whatever", json={"category": "Okmány", "name": "X"}, headers=headers)
    assert res.status_code == 403
