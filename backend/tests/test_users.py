"""Felhasználókezelés — létrehozás/törlés és védelmek."""
from __future__ import annotations


def test_create_and_delete_user(client, admin_headers):
    payload = {
        "username": "torlendo", "password": "ErosJelszo_2026!",
        "display_name": "Törlendő Tamás", "role": "reader", "active": True,
    }
    created = client.post("/api/users", json=payload, headers=admin_headers)
    assert created.status_code == 200, created.text

    deleted = client.delete("/api/users/torlendo", headers=admin_headers)
    assert deleted.status_code == 204

    users = client.get("/api/users", headers=admin_headers).json()
    assert all(u["username"] != "torlendo" for u in users)


def test_cannot_delete_own_account(client, admin_headers):
    # Az admin_headers az 'admin' fiókhoz tartozik — a sajátját nem törölheti.
    response = client.delete("/api/users/admin", headers=admin_headers)
    assert response.status_code == 403


def test_delete_missing_user_returns_404(client, admin_headers):
    assert client.delete("/api/users/nincs-ilyen-felhasznalo", headers=admin_headers).status_code == 404


def test_weak_password_is_a_400_not_a_500(client, admin_headers):
    r = client.post("/api/users", json={"username": "gyenge", "password": "rovid", "display_name": "Gyenge", "role": "reader", "active": True}, headers=admin_headers)
    assert r.status_code == 400, r.text
    assert "jelszó" in r.json()["detail"].lower()


def test_simple_dev_password_is_accepted(client, admin_headers):
    r = client.post("/api/users", json={"username": "egyszeru", "password": "olvaso123", "display_name": "Egyszerű", "role": "reader", "active": True}, headers=admin_headers)
    assert r.status_code == 200, r.text


def _p(client, headers, name, sztsz):
    return client.post("/api/personnel", json={"name": name, "sztsz": sztsz, "rank": "honvéd", "unit": "1. század", "status": "Aktív"}, headers=headers).json()["id"]


def test_bulk_update_and_grant(client, admin_headers):
    a = _p(client, admin_headers, "Tömeg Tamás", "20100001")
    b = _p(client, admin_headers, "Tömeg Tibor", "20100002")
    r = client.post("/api/personnel/bulk", json={"ids": [a, b], "status": "Tartalékos", "unit": "2. század"}, headers=admin_headers)
    assert r.status_code == 200 and r.json()["changed"] == 2
    person = client.get(f"/api/personnel/{a}", headers=admin_headers).json()
    assert person["status"] == "Tartalékos" and person["unit"] == "2. század"
    assert client.post("/api/personnel/bulk", json={"ids": [a]}, headers=admin_headers).status_code == 400

    qt = client.post("/api/qualifications/types", json={"name": "Tömeges teszt-képesítés", "category": "Általános"}, headers=admin_headers).json()
    r = client.post("/api/personnel/bulk-grant", json={"ids": [a, b], "qualTypeId": qt["id"], "earnedDate": "2026-06-01"}, headers=admin_headers)
    assert r.json()["granted"] == 2
    again = client.post("/api/personnel/bulk-grant", json={"ids": [a, b], "qualTypeId": qt["id"], "earnedDate": "2026-06-01"}, headers=admin_headers)
    assert again.json() == {"granted": 0, "skipped": 2, "summariesGranted": 0}
