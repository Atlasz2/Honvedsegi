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
