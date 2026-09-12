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
