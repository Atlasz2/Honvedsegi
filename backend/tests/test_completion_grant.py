"""H2 — képesítés automatikus jóváírása az esemény teljesítésekor."""
from __future__ import annotations

from app.db import SessionLocal
from app.models import QualificationTypeModel, new_id


def _qual_type(name: str) -> str:
    qid = new_id()
    with SessionLocal() as db:
        db.add(QualificationTypeModel(id=qid, name=name, category="Kiképzés", validity_days=None, description=""))
        db.commit()
    return qid


def _person(client, headers, name, sztsz) -> str:
    payload = {"name": name, "sztsz": sztsz, "rank": "honvéd", "unit": "1. század", "status": "Aktív"}
    response = client.post("/api/personnel", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["id"]


def test_completed_exercise_grants_qualification_to_present(client, admin_headers):
    qid = _qual_type("Alapkiképzés 26")
    pid = _person(client, admin_headers, "Teljesítő Tamás", "12000001")
    payload = {
        "name": "Alapkiképzés 26", "type": "Gyakorlat",
        "startDate": "2026-05-01", "endDate": "2026-05-02", "location": "Bázis",
        "maxPersonnel": 10, "description": "", "status": "Befejezett",
        "qualificationId": qid,
        "assigned": [{"personId": pid, "personName": "Teljesítő Tamás", "role": "résztvevő", "attendance": "Megjelent"}],
    }
    created = client.post("/api/exercises", json=payload, headers=admin_headers)
    assert created.status_code == 201, created.text

    quals = client.get(f"/api/qualifications/personnel/{pid}", headers=admin_headers).json()
    assert any(q["qualTypeId"] == qid for q in quals)


def test_absent_participant_is_not_granted(client, admin_headers):
    qid = _qual_type("Speciális kiképzés")
    pid = _person(client, admin_headers, "Hiányzó Hanna", "12000002")
    payload = {
        "name": "Speciális kiképzés foglalkozás", "type": "Gyakorlat",
        "startDate": "2026-05-01", "endDate": "2026-05-02", "location": "Bázis",
        "maxPersonnel": 10, "description": "", "status": "Befejezett",
        "qualificationId": qid,
        "assigned": [{"personId": pid, "personName": "Hiányzó Hanna", "role": "résztvevő", "attendance": "Hiányzott"}],
    }
    created = client.post("/api/exercises", json=payload, headers=admin_headers)
    assert created.status_code == 201, created.text

    quals = client.get(f"/api/qualifications/personnel/{pid}", headers=admin_headers).json()
    assert not any(q["qualTypeId"] == qid for q in quals)
