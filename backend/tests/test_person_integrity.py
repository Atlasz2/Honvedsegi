"""Személytörlés és egyidejű szerkesztés (feltárás-2: H2, H3)."""
from __future__ import annotations

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import (
    AttendanceModel,
    EquipmentModel,
    LeaveRequestModel,
    PersonDocumentModel,
    PersonModel,
)
from app.services.person_removal import remove_orphans


def _login(client, username, password):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _editor(client, admin_headers):
    client.post("/api/users", json={"username": "integritas-ugyintezo", "password": "jelszo123",
                                    "display_name": "Ügyintéző", "role": "editor", "active": True},
                headers=admin_headers)
    return _login(client, "integritas-ugyintezo", "jelszo123")


def _person(client, headers, sztsz):
    r = client.post("/api/personnel", json={"name": f"Teszt {sztsz}", "sztsz": sztsz, "rank": "honvéd",
                                            "unit": "", "status": "Aktív"}, headers=headers)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _add_document(client, headers, person_id):
    r = client.post(f"/api/documents/personnel/{person_id}", json={"name": "Egyéb okmány"}, headers=headers)
    assert r.status_code == 201, r.text


def _count(model, column, person_id):
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(model).where(column == person_id))


def test_editor_can_delete_person_without_history(client, admin_headers):
    editor = _editor(client, admin_headers)
    person = _person(client, admin_headers, "IN000001")
    assert client.delete(f"/api/personnel/{person['id']}", headers=editor).status_code == 204


def test_editor_cannot_delete_person_with_history(client, admin_headers):
    editor = _editor(client, admin_headers)
    person = _person(client, admin_headers, "IN000002")
    _add_document(client, admin_headers, person["id"])

    r = client.delete(f"/api/personnel/{person['id']}", headers=editor)
    assert r.status_code == 409
    assert "Leszerelt" in r.json()["detail"]
    assert "1 okmány" in r.json()["detail"]
    assert client.get(f"/api/personnel/{person['id']}", headers=admin_headers).status_code == 200


def test_admin_delete_removes_dependent_records(client, admin_headers):
    person = _person(client, admin_headers, "IN000003")
    _add_document(client, admin_headers, person["id"])
    with SessionLocal() as db:
        db.add(LeaveRequestModel(personnel_id=person["id"], type="Szabadság",
                                 start_date="2026-11-01", end_date="2026-11-03"))
        db.add(AttendanceModel(date="2026-11-01", personnel_id=person["id"], status="Jelen"))
        db.commit()

    assert client.delete(f"/api/personnel/{person['id']}", headers=admin_headers).status_code == 204
    assert _count(PersonDocumentModel, PersonDocumentModel.personnel_id, person["id"]) == 0
    assert _count(LeaveRequestModel, LeaveRequestModel.personnel_id, person["id"]) == 0
    assert _count(AttendanceModel, AttendanceModel.personnel_id, person["id"]) == 0


def test_delete_refused_while_person_holds_equipment(client, admin_headers):
    person = _person(client, admin_headers, "IN000004")
    with SessionLocal() as db:
        db.add(EquipmentModel(name="Távcső T-1", category="Optika", condition="Jó",
                              checked_out_to=person["id"], checked_out_to_name=person["name"]))
        db.commit()

    r = client.delete(f"/api/personnel/{person['id']}", headers=admin_headers)
    assert r.status_code == 409
    assert "Távcső T-1" in r.json()["detail"]


def test_remove_orphans_cleans_rows_of_missing_people():
    with SessionLocal() as db:
        db.add(PersonDocumentModel(personnel_id="nincs-ilyen-szemely", name="Árva okmány"))
        db.commit()
        removed = remove_orphans(db)
        db.commit()
    assert removed.get("okmány", 0) >= 1
    assert _count(PersonDocumentModel, PersonDocumentModel.personnel_id, "nincs-ilyen-szemely") == 0


def test_concurrent_edit_gets_conflict(client, admin_headers):
    person = _person(client, admin_headers, "IN000005")
    assert person["version"] == 1
    base = {k: v for k, v in person.items() if k not in ("id", "extra")}

    first = client.put(f"/api/personnel/{person['id']}", json={**base, "phone": "+36 30 111 2222"},
                       headers=admin_headers)
    assert first.status_code == 200, first.text
    assert first.json()["version"] == 2

    # A második ügyintéző még az 1-es verziót látja.
    stale = client.put(f"/api/personnel/{person['id']}", json={**base, "beosztas": "Lövész"},
                       headers=admin_headers)
    assert stale.status_code == 409
    assert client.get(f"/api/personnel/{person['id']}", headers=admin_headers).json()["phone"] == "+36 30 111 2222"


def test_update_without_version_still_works(client, admin_headers):
    person = _person(client, admin_headers, "IN000006")
    base = {k: v for k, v in person.items() if k not in ("id", "extra", "version")}
    r = client.put(f"/api/personnel/{person['id']}", json={**base, "notes": "régi kliens"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    with SessionLocal() as db:
        assert db.get(PersonModel, person["id"]).version == 2
