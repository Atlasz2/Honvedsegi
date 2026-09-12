"""Tevékenységnapló — szerepkör-szintű láthatóság."""
from __future__ import annotations


def _reader_headers(client):
    response = client.post("/api/auth/login", json={"username": "olvaso", "password": "olvaso123"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def _log(client, headers, record_name):
    payload = {"userId": "x", "userName": "X", "action": "módosítva", "module": "Teszt", "recordName": record_name}
    response = client.post("/api/activity-log", json=payload, headers=headers)
    assert response.status_code == 200, response.text


def test_reader_does_not_see_admin_actions_but_admin_sees_readers(client, admin_headers):
    reader = _reader_headers(client)
    _log(client, admin_headers, "admin-tett")
    _log(client, reader, "olvaso-tett")

    admin_names = {e["recordName"] for e in client.get("/api/activity-log", headers=admin_headers).json()}
    assert "admin-tett" in admin_names
    assert "olvaso-tett" in admin_names  # admin lefelé lát

    reader_names = {e["recordName"] for e in client.get("/api/activity-log", headers=reader).json()}
    assert "olvaso-tett" in reader_names
    assert "admin-tett" not in reader_names  # olvasó nem lát felfelé


def test_log_stores_server_side_role(client, admin_headers):
    _log(client, admin_headers, "szerep-teszt")
    entries = client.get("/api/activity-log", headers=admin_headers).json()
    entry = next(e for e in entries if e["recordName"] == "szerep-teszt")
    assert entry["userRole"] == "admin"


def test_log_list_filters_on_the_server(client, admin_headers):
    person = client.post("/api/personnel", json={"name": "Naplós Nándor", "sztsz": "17100001", "rank": "honvéd", "unit": "1. század", "status": "Aktív"}, headers=admin_headers).json()
    all_rows = client.get("/api/activity-log", headers=admin_headers).json()
    assert any(r["recordName"] == "Naplós Nándor" for r in all_rows)
    by_name = client.get("/api/activity-log?q=Naplós", headers=admin_headers).json()
    assert by_name and all("Naplós" in r["recordName"] for r in by_name)
    assert client.get("/api/activity-log?module=Nincs-ilyen", headers=admin_headers).json() == []
    assert client.get("/api/activity-log?date_to=2000-01-01", headers=admin_headers).json() == []
    limited = client.get("/api/activity-log?limit=1", headers=admin_headers).json()
    assert len(limited) == 1
    facets = client.get("/api/activity-log/facets", headers=admin_headers).json()
    assert "admin" in facets["users"] or any(facets["users"]) and "Személyzet" in facets["modules"] or facets["modules"]
    client.delete(f"/api/personnel/{person['id']}", headers=admin_headers)


def test_personnel_lite_is_small_and_excludes_discharged(client, admin_headers):
    client.post("/api/personnel", json={"name": "Lite Lajos", "sztsz": "17100002", "rank": "honvéd", "unit": "1. század", "status": "Leszerelt"}, headers=admin_headers)
    rows = client.get("/api/personnel/lite", headers=admin_headers).json()
    assert rows and set(rows[0]) == {"id", "name", "sztsz", "rank", "unit", "status"}
    assert not any(r["name"] == "Lite Lajos" for r in rows)


def test_quick_search_finds_person_by_name_and_sztsz(client, admin_headers):
    person = client.post("/api/personnel", json={"name": "Kereső Kázmér", "sztsz": "19100001", "rank": "honvéd", "unit": "1. század", "status": "Aktív"}, headers=admin_headers).json()
    by_name = client.get("/api/search?q=kereso", headers=admin_headers).json()
    assert any(p["id"] == person["id"] for p in by_name["persons"]), "ékezet nélkül is talál"
    by_sztsz = client.get("/api/search?q=1910000", headers=admin_headers).json()
    assert any(p["id"] == person["id"] for p in by_sztsz["persons"])
    assert client.get("/api/search?q=k", headers=admin_headers).json() == {"persons": [], "orders": [], "operations": []}
    single = client.get(f"/api/personnel/{person['id']}", headers=admin_headers)
    assert single.status_code == 200 and single.json()["name"] == "Kereső Kázmér"


def test_changes_version_grows_on_write(client, admin_headers):
    before = client.get("/api/changes", headers=admin_headers).json()["version"]
    client.post("/api/personnel", json={"name": "Verzió Vince", "sztsz": "21100001", "rank": "honvéd", "unit": "1. század", "status": "Aktív"}, headers=admin_headers)
    after = client.get("/api/changes", headers=admin_headers).json()["version"]
    assert after > before
    assert client.get("/api/changes").status_code == 401
