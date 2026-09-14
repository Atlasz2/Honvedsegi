"""Személy-ütközés: ugyanaz az ember két átfedő műveletben."""
from __future__ import annotations


def _person(client, headers, name, sztsz):
    return client.post("/api/personnel", json={"name": name, "sztsz": sztsz, "rank": "honvéd", "unit": "1. század", "status": "Aktív"}, headers=headers).json()["id"]


def _exercise(client, headers, name, start, end, pid, status="Tervezett", attendance="Tervezett"):
    r = client.post("/api/exercises", json={
        "name": name, "type": "Gyakorlat", "startDate": start, "endDate": end, "location": "Bázis", "maxPersonnel": 10,
        "description": "", "status": status, "qualificationId": "",
        "assigned": [{"personId": pid, "personName": "X", "role": "résztvevő", "attendance": attendance}],
    }, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_overlapping_assignment_is_reported(client, admin_headers):
    pid = _person(client, admin_headers, "Ütköző Ödön", "22100001")
    first = _exercise(client, admin_headers, "Első gyakorlat", "2099-05-10", "2099-05-12", pid)
    _exercise(client, admin_headers, "Lefújt", "2099-05-11", "2099-05-11", pid, status="Lemondva")
    _exercise(client, admin_headers, "Visszamondta", "2099-05-11", "2099-05-11", pid, attendance="Visszamondta")

    r = client.get(f"/api/conflicts/person?personnel_id={pid}&start_date=2099-05-12&end_date=2099-05-14", headers=admin_headers)
    assert r.status_code == 200
    names = [c["eventName"] for c in r.json()]
    assert names == ["Első gyakorlat"], "a lemondott művelet és a visszamondott részvétel nem ütközik"

    # önmagát kizárja, és nem átfedő időben nincs találat
    assert client.get(f"/api/conflicts/person?personnel_id={pid}&start_date=2099-05-10&end_date=2099-05-12&exclude_type=exercise&exclude_id={first['id']}", headers=admin_headers).json() == []
    assert client.get(f"/api/conflicts/person?personnel_id={pid}&start_date=2099-06-01&end_date=2099-06-02", headers=admin_headers).json() == []
    assert client.get("/api/conflicts/person?personnel_id=&start_date=2099-06-01&end_date=2099-06-02", headers=admin_headers).json() == []


def test_move_person_marks_old_participation_as_withdrawn(client, admin_headers):
    pid = _person(client, admin_headers, "Költöző Kálmán", "22100002")
    first = _exercise(client, admin_headers, "Eredeti", "2099-07-10", "2099-07-12", pid)

    r = client.post("/api/conflicts/person/move", json={
        "personnelId": pid, "targetName": "Új gyakorlat",
        "fromEvents": [{"eventType": "exercise", "eventId": first["id"]}],
    }, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert [m["eventName"] for m in r.json()["moved"]] == ["Eredeti"]

    # az eredetiben „Visszamondta" + megjegyzés, és már nem ütközik
    body = next(e for e in client.get("/api/exercises", headers=admin_headers).json() if e["id"] == first["id"])
    me = next(a for a in body["assigned"] if a["personId"] == pid)
    assert me["attendance"] == "Visszamondta" and "Új gyakorlat" in me["notes"]
    assert client.get(f"/api/conflicts/person?personnel_id={pid}&start_date=2099-07-11&end_date=2099-07-11", headers=admin_headers).json() == []

    # újra hívva nem hibázik, nem csinál semmit; rossz típus 400
    assert client.post("/api/conflicts/person/move", json={"personnelId": pid, "fromEvents": [{"eventType": "exercise", "eventId": first["id"]}]}, headers=admin_headers).json() == {"moved": []}
    assert client.post("/api/conflicts/person/move", json={"personnelId": pid, "fromEvents": [{"eventType": "duty", "eventId": "x"}]}, headers=admin_headers).status_code == 400


def test_assignment_notes_round_trip(client, admin_headers):
    pid = _person(client, admin_headers, "Jegyzet Jenő", "22100003")
    r = client.post("/api/exercises", json={
        "name": "Engedélyes", "type": "Gyakorlat", "startDate": "2099-08-01", "endDate": "2099-08-02", "location": "B", "maxPersonnel": 5,
        "description": "", "status": "Tervezett", "qualificationId": "",
        "assigned": [{"personId": pid, "personName": "Jegyzet Jenő", "role": "résztvevő", "attendance": "Tervezett", "notes": "Parancsnoki engedéllyel átfedésben: Másik"}],
    }, headers=admin_headers)
    assert r.status_code == 201, r.text
    assert r.json()["assigned"][0]["notes"] == "Parancsnoki engedéllyel átfedésben: Másik"
