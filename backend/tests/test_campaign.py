"""Kampányterv: beillesztett jelentkezők → jogosultság → export."""
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
            start_date="2026-11-10", end_date="2026-11-12", location="Lőtér", status="Tervezett",
        ))
        db.commit()
    return eid


def _person(client, headers, name, sztsz, status="Tartalékos") -> str:
    payload = {"name": name, "sztsz": sztsz, "rank": "őrmester", "unit": "2. század", "status": status}
    response = client.post("/api/personnel", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _grant(person_id, qual_type_id) -> None:
    with SessionLocal() as db:
        db.add(PersonnelQualificationModel(
            id=new_id(), personnel_id=person_id, qual_type_id=qual_type_id,
            earned_date=date.today().isoformat(), expiry_date=None,
        ))
        db.commit()


def _paste(client, headers, eid, text):
    return client.post(f"/api/campaign/exercise/{eid}/applicants", json={"text": text}, headers=headers)


def test_paste_resolves_by_sztsz_and_name(client, admin_headers):
    eid = _exercise("Kampány – beillesztés")
    by_sztsz = _person(client, admin_headers, "Sztsz Sándor", "15100001")
    by_name = _person(client, admin_headers, "Névvel Nóra", "15100002")
    _person(client, admin_headers, "Dupla Dávid", "15100003")
    _person(client, admin_headers, "Dupla Dávid", "15100004")

    text = "\n".join([
        "Sándor - 15100001",          # SZTSZ a sorban, név mellékes
        "nevvel nora",                 # ékezet/kisbetű nélkül is talál
        "Dupla Dávid",                 # két találat → kétértelmű
        "Nincs Ilyen",                 # nincs találat
        "",                            # üres sor kimarad
    ])
    body = _paste(client, admin_headers, eid, text).json()

    assert {m["personnelId"] for m in body["added"]} == {by_sztsz, by_name}
    assert body["unmatched"] == ["Nincs Ilyen"]
    assert len(body["ambiguous"]) == 1 and len(body["ambiguous"][0]["candidates"]) == 2

    participants = client.get(f"/api/exercises/{eid}/participants", headers=admin_headers).json()
    assert {p["personnelId"] for p in participants} == {by_sztsz, by_name}
    assert all(p["status"] == "Jelentkezett" for p in participants)
    assert next(p for p in participants if p["personnelId"] == by_sztsz)["rankShort"] == "Őrm"


def test_paste_is_idempotent(client, admin_headers):
    eid = _exercise("Kampány – ismétlés")
    pid = _person(client, admin_headers, "Kétszer Károly", "15100010")

    first = _paste(client, admin_headers, eid, "15100010").json()
    second = _paste(client, admin_headers, eid, "15100010").json()

    assert [m["personnelId"] for m in first["added"]] == [pid]
    assert first["alreadyPresent"] == []
    assert second["added"] == []
    assert [m["personnelId"] for m in second["alreadyPresent"]] == [pid]


def test_paste_rejects_empty_and_unknown_event(client, admin_headers):
    eid = _exercise("Kampány – üres")
    assert _paste(client, admin_headers, eid, "  \n ").status_code == 400
    assert _paste(client, admin_headers, "nincs-ilyen", "15100001").status_code == 404
    assert client.post("/api/campaign/duty/x/applicants", json={"text": "x"}, headers=admin_headers).status_code == 400


def test_plan_marks_eligibility_and_sorts_eligible_first(client, admin_headers):
    eid = _exercise("Kampány – jogosultság")
    alap = _qual_type("Alap támadás (kampányteszt)")
    client.put(f"/api/prerequisites/exercise/{eid}", json={"qualTypeIds": [alap]}, headers=admin_headers)
    ok = _person(client, admin_headers, "Alkalmas Aladár", "15100020")
    lacking = _person(client, admin_headers, "Hiányos Hédi", "15100021")
    _grant(ok, alap)
    _paste(client, admin_headers, eid, "15100021\n15100020")

    plan = client.get(f"/api/campaign/exercise/{eid}/plan", headers=admin_headers).json()

    assert plan["eventName"] == "Kampány – jogosultság"
    assert plan["requirements"] == ["Alap támadás (kampányteszt)"]
    assert [r["personnelId"] for r in plan["rows"]] == [ok, lacking], "jogosult elöl"
    assert plan["rows"][0]["eligible"] is True and plan["rows"][0]["missing"] == []
    assert plan["rows"][1]["eligible"] is False and plan["rows"][1]["missing"] == ["Alap támadás (kampányteszt)"]
    assert plan["rows"][1]["sztsz"] == "15100021"
    assert plan["rows"][1]["personStatus"] == "Tartalékos"


def test_plan_exports(client, admin_headers):
    eid = _exercise("Kampány – export")
    _person(client, admin_headers, "Export Emil", "15100030")
    _paste(client, admin_headers, eid, "15100030")

    xlsx = client.get(f"/api/campaign/exercise/{eid}/plan/export.xlsx", headers=admin_headers)
    pdf = client.get(f"/api/campaign/exercise/{eid}/plan/export.pdf", headers=admin_headers)

    assert xlsx.status_code == 200 and xlsx.content[:2] == b"PK"
    assert "kampanyterv-2026-11-10.xlsx" in xlsx.headers["content-disposition"]
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


def test_campaign_requires_auth(client):
    assert client.get("/api/campaign/exercise/x/plan").status_code == 401
