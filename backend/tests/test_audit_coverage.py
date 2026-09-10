"""Az audit-lefedettség tesztjei a személyes adatot és jogosultságot érintő modulokra.

A tevékenységnapló oldal azt ígéri a felhasználónak, hogy minden változás
követve van. Ezek a tesztek ezt az ígéretet őrzik: korábban 24 routerből
mindössze 3 naplózott, így egy szabadság-jóváhagyás vagy egy jogosultság-
változás nyomtalanul eltűnt.
"""
from __future__ import annotations

import uuid

import pytest


def _sztsz() -> str:
    return f"{uuid.uuid4().int % 100_000_000:08d}"


def _logs(client, headers, module: str, action: str) -> list[dict]:
    response = client.get("/api/activity-log", headers=headers)
    assert response.status_code == 200, response.text
    return [log for log in response.json() if log["module"] == module and log["action"] == action]


def _find(logs: list[dict], record_name: str) -> dict | None:
    return next((log for log in logs if log["recordName"] == record_name), None)


@pytest.fixture
def person(client, admin_headers):
    response = client.post(
        "/api/personnel",
        json={"name": "Audit Aladár", "sztsz": _sztsz(), "rank": "Honvéd", "unit": "31 TVZ", "status": "Aktív"},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


# ── Jogosultság ───────────────────────────────────────────────────────────

def test_user_creation_and_role_change_are_logged(client, admin_headers):
    username = f"audit_{uuid.uuid4().hex[:8]}"
    created = client.post(
        "/api/users",
        json={"username": username, "password": "ErosJelszo_2026!", "display_name": "Napló Teszt",
              "role": "reader", "active": True},
        headers=admin_headers,
    )
    assert created.status_code == 200, created.text
    assert _find(_logs(client, admin_headers, "Felhasználók", "létrehozva"), username)

    client.put(
        f"/api/users/{username}",
        json={"display_name": "Napló Teszt", "role": "editor", "active": True},
        headers=admin_headers,
    )

    log = _find(_logs(client, admin_headers, "Felhasználók", "módosítva"), username)
    assert log is not None, "a jogosultság-változásnak naplózódnia kell"
    role_change = next(c for c in log["payload"]["changes"] if c["field"] == "role")
    assert role_change["from"] == "reader"
    assert role_change["to"] == "editor"


def test_password_change_is_logged_without_the_password(client, admin_headers):
    username = f"audit_{uuid.uuid4().hex[:8]}"
    client.post(
        "/api/users",
        json={"username": username, "password": "ErosJelszo_2026!", "display_name": "Jelszó Teszt",
              "role": "reader", "active": True},
        headers=admin_headers,
    )
    client.put(
        f"/api/users/{username}",
        json={"display_name": "Jelszó Teszt", "role": "reader", "active": True,
              "password": "MasikErosJelszo_2026!"},
        headers=admin_headers,
    )

    log = _find(_logs(client, admin_headers, "Felhasználók", "módosítva"), username)
    assert log is not None
    assert any(c["field"] == "passwordChangedAt" for c in log["payload"]["changes"]), \
        "a jelszócsere ténye auditnyom"

    serialized = str(log["payload"])
    assert "ErosJelszo_2026!" not in serialized
    assert "MasikErosJelszo_2026!" not in serialized
    assert "scrypt" not in serialized


# ── Szabadság ─────────────────────────────────────────────────────────────

def test_leave_decision_is_logged_with_the_decider(client, admin_headers, person):
    created = client.post(
        "/api/leave",
        json={"personnelId": person["id"], "type": "Szabadság",
              "startDate": "2026-07-01", "endDate": "2026-07-05", "reason": "pihenés"},
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text

    client.post(f"/api/leave/{created.json()['id']}/decision", json={"approve": True}, headers=admin_headers)

    log = _find(_logs(client, admin_headers, "Szabadság", "módosítva"), person["name"])
    assert log is not None, "a jóváhagyási döntésnek naplózódnia kell"
    status_change = next(c for c in log["payload"]["changes"] if c["field"] == "status")
    assert status_change["from"] == "Beadva"
    assert status_change["to"] == "Jóváhagyva"
    assert log["userId"] == "admin"


# ── Okmányok ──────────────────────────────────────────────────────────────

def test_document_changes_are_logged(client, admin_headers, person):
    created = client.post(
        f"/api/documents/personnel/{person['id']}",
        json={"category": "Okmány", "name": "Katonai igazolvány", "expiryDate": "2027-01-01"},
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    assert _find(_logs(client, admin_headers, "Okmányok", "létrehozva"), person["name"])

    client.put(
        f"/api/documents/{created.json()['id']}",
        json={"category": "Okmány", "name": "Katonai igazolvány", "expiryDate": "2028-01-01"},
        headers=admin_headers,
    )
    log = _find(_logs(client, admin_headers, "Okmányok", "módosítva"), person["name"])
    assert log is not None
    assert any(c["field"] == "expiryDate" for c in log["payload"]["changes"])


# ── Eszközkezelés ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("path,payload,module,record_name", [
    ("/api/equipment",
     {"name": "Audit rádió", "category": "Híradó", "serialNumber": "AUD-1", "condition": "Jó", "description": ""},
     "Felszerelés", "Audit rádió"),
    ("/api/vehicles",
     {"plateNumber": "AUD-111", "type": "Terepjáró", "makeModel": "UAZ", "year": 2020, "km": 100,
      "nextService": "2026-12-01", "nextInspection": "2026-12-01", "status": "Elérhető", "notes": ""},
     "Járművek", "AUD-111"),
    ("/api/supplies",
     {"name": "Audit zsák", "category": "Egyéb", "unit": "db", "currentQty": 5, "minQty": 1, "description": ""},
     "Készletek", "Audit zsák"),
    ("/api/announcements",
     {"title": "Audit hirdetmény", "category": "Általános", "content": "szöveg", "pinned": False},
     "Hirdetmények", "Audit hirdetmény"),
])
def test_asset_modules_log_creation(client, admin_headers, path, payload, module, record_name):
    response = client.post(path, json=payload, headers=admin_headers)
    assert response.status_code in (200, 201), response.text
    assert _find(_logs(client, admin_headers, module, "létrehozva"), record_name)


def test_deletion_is_logged_with_the_previous_state(client, admin_headers):
    created = client.post(
        "/api/supplies",
        json={"name": "Törlendő készlet", "category": "Egyéb", "unit": "db",
              "currentQty": 7, "minQty": 1, "description": ""},
        headers=admin_headers,
    )
    assert client.delete(f"/api/supplies/{created.json()['id']}", headers=admin_headers).status_code == 204

    log = _find(_logs(client, admin_headers, "Készletek", "törölve"), "Törlendő készlet")
    assert log is not None
    assert log["payload"]["before"]["currentQty"] == 7, "a törölt rekord állapota megmarad a naplóban"


# ── Import ────────────────────────────────────────────────────────────────

def test_import_logs_a_summary_not_one_entry_per_row(client, admin_headers):
    """Egy import több száz személyt írhat felül — a naplónak ezt jeleznie kell,
    de soronkénti bejegyzés használhatatlan zajjá tenné."""
    csv = ("nev;sztsz;rendfokozat;szervezet;statusz\n"
           f"Import Imre;{_sztsz()};Honvéd;31 TVZ;Aktív\n"
           f"Import Ilona;{_sztsz()};Tizedes;83 TVZ;Aktív\n").encode("utf-8")

    preview = client.post(
        "/api/import/personnel/preview",
        files={"file": ("allomany.csv", csv, "text/csv")},
        headers=admin_headers,
    )
    assert preview.status_code == 200, preview.text

    before = len(_logs(client, admin_headers, "Import", "létrehozva"))
    confirm = client.post(
        f"/api/import/personnel/confirm/{preview.json()['draftId']}",
        headers=admin_headers,
    )
    assert confirm.status_code == 200, confirm.text

    logs = _logs(client, admin_headers, "Import", "létrehozva")
    assert len(logs) == before + 1, "importonként pontosan egy összesítő bejegyzés"
    assert logs[0]["payload"]["after"]["created"] == 2
