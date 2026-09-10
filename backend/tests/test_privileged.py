"""A god-szint (dev_master) védelmeit és extra jogosultságait őrző tesztek.

Ha a védelmet kiveszik a kódból, ezeknek el KELL bukniuk — ez teszi a szintet
„nem eltüntethetővé csendben". A tesztek a viselkedést rögzítik, nem a
belső implementációt.
"""
from __future__ import annotations

import os

import pytest
from sqlalchemy import select

from app.core.privileged import god_username
from app.db import SessionLocal
from app.models import UserModel


GOD = god_username()


@pytest.fixture
def god_headers(client):
    pwd = os.environ["BACKEND_DEV_MASTER_PASSWORD"]
    response = client.post("/api/auth/login", json={"username": GOD, "password": pwd})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


@pytest.fixture
def second_admin_headers(client, god_headers):
    """Egy második admin fiók, hogy az 'admin nem kezelhet admint' szabály tesztelhető legyen.

    Admint csak a god hozhat létre — ez maga is a hierarchia egyik szabálya."""
    client.post(
        "/api/users",
        json={"username": "admin2", "password": "MasodikAdmin_2026!", "display_name": "Második Admin",
              "role": "admin", "active": True},
        headers=god_headers,
    )
    token = client.post("/api/auth/login", json={"username": "admin2", "password": "MasodikAdmin_2026!"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


# ── Létezés és kizárólagosság ──────────────────────────────────────────────

def test_god_account_exists_after_startup(client):
    with SessionLocal() as db:
        god = db.scalar(select(UserModel).where(UserModel.username == GOD))
        assert god is not None, "a god-fiókot az indításnak garantálnia kell"
        assert god.role == "fejleszto"
        assert god.protected is True
        assert god.active is True


def test_god_role_is_unique_to_the_god_account(client):
    with SessionLocal() as db:
        holders = db.scalars(select(UserModel).where(UserModel.role == "fejleszto")).all()
        assert [u.username for u in holders] == [GOD], "a god-szerep kizárólagos"


def test_god_can_log_in(client, god_headers):
    assert client.get("/api/auth/me", headers=god_headers).status_code == 200


# ── Rejtés az admin elől ───────────────────────────────────────────────────

def test_admin_does_not_see_the_god_account_in_the_user_list(client, admin_headers):
    users = client.get("/api/users", headers=admin_headers).json()
    assert all(u["username"] != GOD for u in users)
    assert all(u["role"] != "fejleszto" for u in users)


def test_god_sees_itself_in_the_user_list(client, god_headers):
    users = client.get("/api/users", headers=god_headers).json()
    assert any(u["username"] == GOD for u in users)


def test_god_account_looks_nonexistent_to_admin(client, admin_headers):
    """Az admin számára a god-fiók 404 — nem 403 —, hogy a létezése se szivárogjon."""
    assert client.get("/api/users", headers=admin_headers).status_code == 200
    probe = client.put(
        f"/api/users/{GOD}",
        json={"display_name": "x", "role": "admin", "active": True},
        headers=admin_headers,
    )
    assert probe.status_code == 404
    assert client.delete(f"/api/users/{GOD}", headers=admin_headers).status_code == 404


# ── Nem módosítható / nem törölhető ────────────────────────────────────────

def test_god_account_cannot_be_deleted_even_by_god(client, god_headers):
    assert client.delete(f"/api/users/{GOD}", headers=god_headers).status_code == 403


def test_god_account_cannot_be_demoted_even_by_god(client, god_headers):
    response = client.put(
        f"/api/users/{GOD}",
        json={"display_name": "Fejlesztő Mester", "role": "admin", "active": True},
        headers=god_headers,
    )
    assert response.status_code == 403


def test_god_role_cannot_be_assigned_to_anyone(client, god_headers):
    response = client.post(
        "/api/users",
        json={"username": "alm=god", "password": "ErosJelszo_2026!", "display_name": "Ál God",
              "role": "fejleszto", "active": True},
        headers=god_headers,
    )
    assert response.status_code == 403


# ── God az admin fölött ────────────────────────────────────────────────────

def test_admin_cannot_create_another_admin(client, admin_headers):
    response = client.post(
        "/api/users",
        json={"username": "ujadmin", "password": "ErosJelszo_2026!", "display_name": "Új Admin",
              "role": "admin", "active": True},
        headers=admin_headers,
    )
    assert response.status_code == 403


def test_admin_cannot_modify_another_admin(client, admin_headers, second_admin_headers):
    response = client.put(
        "/api/users/admin2",
        json={"display_name": "Átírt", "role": "reader", "active": True},
        headers=admin_headers,
    )
    assert response.status_code == 403


def test_god_can_manage_admins(client, god_headers, second_admin_headers):
    response = client.put(
        "/api/users/admin2",
        json={"display_name": "God átírta", "role": "editor", "active": True},
        headers=god_headers,
    )
    assert response.status_code == 200
    assert response.json()["role"] == "editor"


# ── Extra jogosultságok: karbantartás (god-only) ───────────────────────────

def test_maintenance_is_god_only(client, admin_headers):
    # Az adminnak semleges 403 — nem árul el magasabb szintet.
    assert client.get("/api/maintenance/status", headers=admin_headers).status_code == 403


def test_maintenance_requires_authentication(client):
    assert client.get("/api/maintenance/status").status_code == 401


def test_god_sees_system_status(client, god_headers):
    response = client.get("/api/maintenance/status", headers=god_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert "database" in body and "sessions" in body and "users" in body


def test_god_can_force_logout_and_purge(client, god_headers):
    assert client.post("/api/maintenance/sessions/purge", headers=god_headers).status_code == 200
    # nem létező felhasználó kijelentkeztetése 404
    assert client.post("/api/maintenance/users/nincs-ilyen/logout", headers=god_headers).status_code == 404


def test_god_actions_are_hidden_from_admin_in_the_audit_log(client, admin_headers, god_headers):
    """A god műveletei naplózódnak, de csak god-szinten láthatók — az admin nem
    látja őket. Ez az elszámoltathatóság és a rejtés együtt."""
    # god csinál egy auditált műveletet (admin2 létrehozása a fixture-ben történik,
    # de itt egy friss, egyértelmű művelet kell)
    client.post(
        "/api/users",
        json={"username": "godcreated", "password": "ErosJelszo_2026!", "display_name": "God hozta létre",
              "role": "reader", "active": True},
        headers=god_headers,
    )
    admin_logs = client.get("/api/activity-log", headers=admin_headers).json()
    god_entries = [l for l in admin_logs if l.get("userId") == GOD or l.get("userRole") == "fejleszto"]
    assert god_entries == [], "az admin nem láthatja a god műveleteit a naplóban"

    god_logs = client.get("/api/activity-log", headers=god_headers).json()
    assert any(l.get("userRole") == "fejleszto" for l in god_logs), "a god látja a saját műveleteit"
