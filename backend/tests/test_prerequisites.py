"""A képzési követelmény / jogosultság (prerequisites) tesztjei."""
from __future__ import annotations

from datetime import date

from app.db import SessionLocal
from app.models import ExerciseModel, PersonnelQualificationModel, QualificationTypeModel, new_id


def _qual_type(name: str) -> str:
    qid = new_id()
    with SessionLocal() as db:
        db.add(QualificationTypeModel(id=qid, name=name, category="Kiképzés", validity_days=None, description=""))
        db.commit()
    return qid


def _exercise(name: str) -> str:
    eid = new_id()
    with SessionLocal() as db:
        db.add(ExerciseModel(
            id=eid, name=name, type="Gyakorlat",
            start_date="2026-12-01", end_date="2026-12-01", location="Gyakorlótér", status="Tervezett",
        ))
        db.commit()
    return eid


def _person(client, headers, name, sztsz) -> str:
    payload = {"name": name, "sztsz": sztsz, "rank": "honvéd", "unit": "1. század", "status": "Aktív"}
    response = client.post("/api/personnel", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _grant(person_id, qual_type_id, expiry=None) -> None:
    with SessionLocal() as db:
        db.add(PersonnelQualificationModel(
            id=new_id(), personnel_id=person_id, qual_type_id=qual_type_id,
            earned_date=date.today().isoformat(), expiry_date=expiry,
        ))
        db.commit()


def _reader_headers(client):
    response = client.post("/api/auth/login", json={"username": "olvaso", "password": "olvaso123"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_prerequisites_require_auth(client):
    assert client.get("/api/prerequisites/exercise/whatever").status_code == 401


def test_set_and_get_prerequisites(client, admin_headers):
    qid = _qual_type("Rendészet alap")
    eid = _exercise("Rendészet haladó")
    put = client.put(f"/api/prerequisites/exercise/{eid}", json={"qualTypeIds": [qid]}, headers=admin_headers)
    assert put.status_code == 200, put.text
    assert put.json()["qualTypeIds"] == [qid]

    got = client.get(f"/api/prerequisites/exercise/{eid}", headers=admin_headers).json()
    assert got["qualTypeIds"] == [qid]
    assert got["qualTypes"][0]["name"] == "Rendészet alap"


def test_eligibility_reflects_prerequisites(client, admin_headers):
    qid = _qual_type("Rendészet alap II")
    eid = _exercise("Rendészet haladó II")
    client.put(f"/api/prerequisites/exercise/{eid}", json={"qualTypeIds": [qid]}, headers=admin_headers)

    qualified = _person(client, admin_headers, "Jogos János", "13000001")
    missing_one = _person(client, admin_headers, "Hiányos Hugó", "13000002")
    _grant(qualified, qid)

    elig = client.get(f"/api/prerequisites/exercise/{eid}/eligibility?include_reserve=true", headers=admin_headers).json()
    by_id = {p["personnelId"]: p for p in elig}
    assert by_id[qualified]["eligible"] is True
    assert by_id[missing_one]["eligible"] is False
    assert "Rendészet alap II" in by_id[missing_one]["missing"]


def test_expired_qualification_does_not_satisfy(client, admin_headers):
    qid = _qual_type("Lejáró képesítés")
    eid = _exercise("Lejáró-függő gyakorlat")
    client.put(f"/api/prerequisites/exercise/{eid}", json={"qualTypeIds": [qid]}, headers=admin_headers)

    pid = _person(client, admin_headers, "Lejárt Lajos", "13000003")
    _grant(pid, qid, expiry="2000-01-01")

    elig = client.get(f"/api/prerequisites/exercise/{eid}/eligibility?include_reserve=true", headers=admin_headers).json()
    person = next(p for p in elig if p["personnelId"] == pid)
    assert person["eligible"] is False


def test_set_prerequisites_requires_editor(client):
    response = client.put(
        "/api/prerequisites/exercise/whatever",
        json={"qualTypeIds": []},
        headers=_reader_headers(client),
    )
    assert response.status_code == 403
