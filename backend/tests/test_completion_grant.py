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


# ── Állapot a dátumból, lemondás kézzel ──────────────────────────────────────

def _exercise_payload(name, start, end, status, assigned=None, qid=""):
    return {
        "name": name, "type": "Gyakorlat", "startDate": start, "endDate": end, "location": "Bázis",
        "maxPersonnel": 10, "description": "", "status": status, "qualificationId": qid,
        "assigned": assigned or [],
    }


def test_status_is_derived_from_dates_not_from_input(client, admin_headers):
    past = client.post("/api/exercises", json=_exercise_payload("Múltbeli", "2020-01-01", "2020-01-02", "Tervezett"), headers=admin_headers)
    future = client.post("/api/exercises", json=_exercise_payload("Jövőbeli", "2099-01-01", "2099-01-02", "Befejezett"), headers=admin_headers)
    assert past.json()["status"] == "Befejezett"
    assert future.json()["status"] == "Tervezett"


def test_cancelled_is_kept_and_can_be_restored(client, admin_headers):
    created = client.post("/api/exercises", json=_exercise_payload("Lefújt", "2099-03-01", "2099-03-02", "Lemondva"), headers=admin_headers).json()
    assert created["status"] == "Lemondva"
    restored = client.put(f"/api/exercises/{created['id']}", json=_exercise_payload("Lefújt", "2099-03-01", "2099-03-02", "Tervezett"), headers=admin_headers).json()
    assert restored["status"] == "Tervezett"


def test_present_participant_is_granted_even_before_end_date(client, admin_headers):
    """A megjelenés rögzítése a teljesítés — nem kell megvárni a „Befejezett" állapotot."""
    qid = _qual_type("Jelenlét-alapú jóváírás")
    pid = _person(client, admin_headers, "Korai Kornél", "12000010")
    assigned = [{"personId": pid, "personName": "Korai Kornél", "role": "résztvevő", "attendance": "Megjelent"}]
    created = client.post("/api/exercises", json=_exercise_payload("Ma zajló", "2099-06-01", "2099-06-03", "Tervezett", assigned, qid), headers=admin_headers)
    assert created.status_code == 201, created.text
    quals = client.get(f"/api/qualifications/personnel/{pid}", headers=admin_headers).json()
    assert any(q["qualTypeId"] == qid for q in quals)


def test_cancelled_exercise_grants_nothing(client, admin_headers):
    qid = _qual_type("Lemondott jóváírás")
    pid = _person(client, admin_headers, "Lemondott Lajos", "12000011")
    assigned = [{"personId": pid, "personName": "Lemondott Lajos", "role": "résztvevő", "attendance": "Megjelent"}]
    client.post("/api/exercises", json=_exercise_payload("Lefújt gyakorlat", "2026-01-01", "2026-01-02", "Lemondva", assigned, qid), headers=admin_headers)
    quals = client.get(f"/api/qualifications/personnel/{pid}", headers=admin_headers).json()
    assert not any(q["qualTypeId"] == qid for q in quals)


def test_participant_can_withdraw(client, admin_headers):
    pid = _person(client, admin_headers, "Visszamondó Viki", "12000012")
    assigned = [{"personId": pid, "personName": "Visszamondó Viki", "role": "résztvevő", "attendance": "Visszamondta"}]
    created = client.post("/api/exercises", json=_exercise_payload("Visszamondás", "2099-07-01", "2099-07-02", "Tervezett", assigned), headers=admin_headers)
    assert created.status_code == 201, created.text
    assert created.json()["assigned"][0]["attendance"] == "Visszamondta"
