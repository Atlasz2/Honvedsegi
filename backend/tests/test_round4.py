"""Sorozat: alsorozat + zászlóalj-hatókör; parancs-átfutás időszak; státusz nélkül „Szabadságon"."""
from __future__ import annotations

from datetime import date, timedelta


def _login(client, username, password):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _user(client, admin_headers, username, region):
    client.post("/api/users", json={"username": username, "password": "jelszo123", "display_name": username, "role": "editor", "active": True, "region": region}, headers=admin_headers)
    return _login(client, username, "jelszo123")


def test_subseries_and_scope(client, admin_headers):
    vp = _user(client, admin_headers, "vp-sor", "Veszprém")
    vas = _user(client, admin_headers, "vas-sor", "Vas")
    root = client.post("/api/series", json={"name": "7×20"}, headers=vp).json()
    assert root["unit"] == "31 TVZ"
    child = client.post("/api/series", json={"name": "Támadás", "parentId": root["id"]}, headers=vp).json()
    grand = client.post("/api/series", json={"name": "Támadás Alap", "parentId": child["id"]}, headers=vp).json()
    assert child["parentId"] == root["id"] and grand["unit"] == "31 TVZ"
    # a szülőn látszik, hány alsorozata van; a másik zászlóalj a nevét sem látja
    names_vp = {s["name"]: s for s in client.get("/api/series", headers=vp).json()}
    assert names_vp["7×20"]["childCount"] == 1
    assert "7×20" not in {s["name"] for s in client.get("/api/series", headers=vas).json()}
    assert client.get(f"/api/series/{root['id']}/matrix", headers=vas).status_code == 404
    # kör tiltva
    assert client.put(f"/api/series/{root['id']}", json={"name": "7×20", "parentId": grand["id"]}, headers=vp).status_code == 400
    # a mátrix az egész fát nézi
    ex = client.post("/api/exercises", json={"name": "Támadás alap 1", "type": "Kiképzés", "startDate": "2099-01-01", "endDate": "2099-01-02", "location": "X",
                                             "maxPersonnel": 5, "description": "", "status": "Tervezett", "qualificationId": "", "seriesId": grand["id"], "level": "Alap", "assigned": []}, headers=vp).json()
    ops = client.get(f"/api/series/{root['id']}/matrix", headers=vp).json()["operations"]
    assert any(o["id"] == ex["id"] and o["seriesName"] == "Támadás Alap" for o in ops)
    # törléskor az alsorozat a szülő szintjére lép
    client.delete(f"/api/series/{child['id']}", headers=vp)
    assert next(s for s in client.get("/api/series", headers=vp).json() if s["id"] == grand["id"])["parentId"] == root["id"]


def test_order_stats_periods(client, admin_headers):
    ot = client.post("/api/orders/types", json={"name": "Időszak-teszt", "chapters": [{"name": "A", "responsible": "Jog"}], "signers": ["P"]}, headers=admin_headers).json()
    client.post("/api/orders", json={"orderTypeId": ot["id"], "subject": "Mai parancs"}, headers=admin_headers)
    today = date.today().isoformat()
    week = client.get(f"/api/orders/stats?period=week&anchor={today}", headers=admin_headers).json()
    assert week["period"]["kind"] == "week" and week["totals"]["orders"] >= 1
    assert date.fromisoformat(week["period"]["from"]).weekday() == 0
    month = client.get(f"/api/orders/stats?period=month&anchor={today}", headers=admin_headers).json()
    assert month["period"]["from"].endswith("-01")
    far = (date.today() - timedelta(days=60)).isoformat()
    assert client.get(f"/api/orders/stats?period=week&anchor={far}", headers=admin_headers).json()["totals"]["orders"] == 0
    assert client.get("/api/orders/stats?period=day", headers=admin_headers).status_code == 422
    assert client.get("/api/orders/stats?period=week&anchor=nem-datum", headers=admin_headers).status_code == 400


def test_legacy_leave_status_maps_to_active(client, admin_headers):
    r = client.post("/api/personnel", json={"name": "Régi Rekord", "sztsz": "88100001", "rank": "honvéd", "unit": "31 TVZ", "status": "Szabadságon"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Aktív"
    assert "Szabadságon" not in client.get("/api/reference", headers=admin_headers).json()["personStatuses"]


def test_import_dry_run_pdf_and_person_timeline(client, admin_headers):
    import io
    from openpyxl import Workbook
    pid = client.post("/api/personnel", json={"name": "Időszalag Tamás", "sztsz": "88100011", "rank": "honvéd", "unit": "31 TVZ", "status": "Aktív", "joinDate": "2020-01-15"}, headers=admin_headers).json()["id"]
    ex = client.post("/api/exercises", json={"name": "Időszalag gyak", "type": "Gyakorlat", "startDate": "2099-02-01", "endDate": "2099-02-02", "location": "X", "maxPersonnel": 5,
                                             "description": "", "status": "Tervezett", "qualificationId": "", "assigned": [{"personId": pid, "personName": "Időszalag Tamás", "role": "résztvevő"}]}, headers=admin_headers).json()
    client.post("/api/leave", json={"personnelId": pid, "type": "Szabadság", "startDate": "2099-03-01", "endDate": "2099-03-03"}, headers=admin_headers)
    tl = client.get(f"/api/personnel/{pid}/timeline", headers=admin_headers).json()
    kinds = {i["kind"] for i in tl["items"]}
    assert {"operation", "leave", "milestone"} <= kinds
    assert tl["items"][0]["date"] >= tl["items"][-1]["date"], "időrend: legfrissebb elöl"
    assert any(i["ref"] == {"type": "exercise", "id": ex["id"]} for i in tl["items"])

    wb = Workbook(); ws = wb.active
    ws.append(["Név", "SZTSZ", "Rendfokozat", "Alegység", "Státusz"])
    ws.append(["Időszalag Tamás", "88100011", "tizedes", "31 TVZ", "Aktív"])
    ws.append(["Új Ember", "88100012", "honvéd", "31 TVZ", "Aktív"])
    buf = io.BytesIO(); wb.save(buf)
    preview = client.post("/api/import/personnel/preview", files={"file": ("kgir.xlsx", buf.getvalue(), "application/octet-stream")}, headers=admin_headers).json()
    pdf = client.get(f"/api/import/personnel/draft/{preview['draftId']}/export.pdf?filename=kgir.xlsx", headers=admin_headers)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    # a draft a PDF után is elfogadható
    assert client.post(f"/api/import/personnel/confirm/{preview['draftId']}", headers=admin_headers).status_code == 200


def test_exercise_lite_list_and_single_get(client, admin_headers):
    pid = client.post("/api/personnel", json={"name": "Karcsú Kázmér", "sztsz": "88100021", "rank": "honvéd", "unit": "31 TVZ", "status": "Aktív"}, headers=admin_headers).json()["id"]
    ex = client.post("/api/exercises", json={"name": "Karcsú gyak", "type": "Gyakorlat", "startDate": "2099-04-01", "endDate": "2099-04-02", "location": "X", "maxPersonnel": 5,
                                             "description": "", "status": "Tervezett", "qualificationId": "", "assigned": [{"personId": pid, "personName": "Karcsú Kázmér", "role": "résztvevő"}]}, headers=admin_headers).json()
    lite = next(e for e in client.get("/api/exercises?lite=true", headers=admin_headers).json() if e["id"] == ex["id"])
    assert lite["assigned"] == [] and lite["assignedCount"] == 1 and lite["assignedNames"] == ["Karcsú Kázmér"]
    full = client.get(f"/api/exercises/{ex['id']}", headers=admin_headers).json()
    assert full["assigned"][0]["personId"] == pid and full["assignedCount"] == 1
    assert client.get("/api/exercises/nincs-ilyen", headers=admin_headers).status_code == 404
