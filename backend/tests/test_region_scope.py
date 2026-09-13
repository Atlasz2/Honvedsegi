"""Területi hatókör: a Vas megyei ügyintéző nem látja a veszprémi állományt,
az ezredtörzs (üres terület) és az admin mindent lát."""
from __future__ import annotations


def _login(client, username, password):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]


def _person(client, headers, name, sztsz, unit):
    r = client.post("/api/personnel", json={"name": name, "sztsz": sztsz, "rank": "honvéd", "unit": unit, "status": "Aktív"}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_region_is_validated_and_scopes_personnel(client, admin_headers):
    bad = client.post("/api/users", json={"username": "regio-rossz", "password": "jelszo123", "display_name": "R", "role": "editor", "active": True, "region": "Zala"}, headers=admin_headers)
    assert bad.status_code == 400
    ok = client.post("/api/users", json={"username": "vasi", "password": "jelszo123", "display_name": "Vasi Vali", "role": "editor", "active": True, "region": "Vas"}, headers=admin_headers)
    assert ok.status_code == 200, ok.text
    assert ok.json()["region"] == "Vas"
    vas_headers, auth_user = _login(client, "vasi", "jelszo123")
    assert auth_user["region"] == "Vas"

    vas_id = _person(client, admin_headers, "Vasi Viktor", "55100001", "83 TVZ")
    veszprem_id = _person(client, admin_headers, "Veszprémi Vince", "55100002", "19 TVZ")

    names = {p["name"] for p in client.get("/api/personnel", headers=vas_headers).json()}
    assert "Vasi Viktor" in names and "Veszprémi Vince" not in names
    lite = {p["name"] for p in client.get("/api/personnel/lite", headers=vas_headers).json()}
    assert "Veszprémi Vince" not in lite
    paged = {p["name"] for p in client.get("/api/personnel/paged?page_size=100&q=v", headers=vas_headers).json()["items"]}
    assert "Vasi Viktor" in paged and "Veszprémi Vince" not in paged

    # más terület személye: mintha nem létezne (404), szerkeszteni sem lehet
    assert client.get(f"/api/personnel/{veszprem_id}", headers=vas_headers).status_code == 404
    assert client.get(f"/api/personnel/{vas_id}", headers=vas_headers).status_code == 200
    body = client.get(f"/api/personnel/{veszprem_id}", headers=admin_headers).json()
    assert client.put(f"/api/personnel/{veszprem_id}", json={**body, "notes": "x"}, headers=vas_headers).status_code == 404
    assert client.delete(f"/api/personnel/{veszprem_id}", headers=vas_headers).status_code == 404

    # kereső, létszám, szabadság is a hatókörön belül
    found = {p["name"] for p in client.get("/api/search?q=vince", headers=vas_headers).json()["persons"]}
    assert "Veszprémi Vince" not in found
    day = client.get("/api/attendance?date=2099-01-10", headers=vas_headers).json()
    assert "Veszprémi Vince" not in {i["name"] for i in day["items"]}
    assert client.post("/api/leave", json={"personnelId": veszprem_id, "type": "Egyéb", "startDate": "2099-01-10", "endDate": "2099-01-10"}, headers=vas_headers).status_code == 404
    assert client.post("/api/leave", json={"personnelId": vas_id, "type": "Egyéb", "startDate": "2099-01-10", "endDate": "2099-01-10"}, headers=vas_headers).status_code == 201

    # az admin (ezredtörzs) mindent lát
    all_names = {p["name"] for p in client.get("/api/personnel", headers=admin_headers).json()}
    assert {"Vasi Viktor", "Veszprémi Vince"} <= all_names


def test_units_scope_operations_orders_and_news(client, admin_headers):
    client.post("/api/users", json={"username": "veszpremi", "password": "jelszo123", "display_name": "V", "role": "editor", "active": True, "region": "Veszprém"}, headers=admin_headers)
    client.post("/api/users", json={"username": "vasi2", "password": "jelszo123", "display_name": "W", "role": "editor", "active": True, "region": "Vas"}, headers=admin_headers)
    vp, vp_user = _login(client, "veszpremi", "jelszo123")
    vas, _ = _login(client, "vasi2", "jelszo123")
    assert vp_user["unit"] == "31 TVZ" and vp_user["regionLabel"] == "31. TVZ – Veszprém"

    base = {"type": "Gyakorlat", "startDate": "2099-04-01", "endDate": "2099-04-02", "location": "X", "maxPersonnel": 5,
            "description": "", "status": "Tervezett", "qualificationId": "", "assigned": []}
    # a zászlóalj ügyintézője akármit ad meg, a sajátja lesz
    mine = client.post("/api/exercises", json={**base, "name": "Veszprémi gyak", "unit": "83 TVZ"}, headers=vp)
    assert mine.status_code == 201 and mine.json()["unit"] == "31 TVZ"
    # ezredtörzs: ezredszintű (üres) vagy megadott zászlóalj
    regiment = client.post("/api/exercises", json={**base, "name": "Ezred gyak"}, headers=admin_headers).json()
    assert regiment["unit"] == ""
    vas_ex = client.post("/api/exercises", json={**base, "name": "Vasi gyak", "unit": "83 TVZ"}, headers=admin_headers).json()
    assert client.post("/api/exercises", json={**base, "name": "Rossz", "unit": "99 TVZ"}, headers=admin_headers).status_code == 400

    names_vp = {e["name"] for e in client.get("/api/exercises", headers=vp).json()}
    assert "Veszprémi gyak" in names_vp and "Ezred gyak" in names_vp and "Vasi gyak" not in names_vp
    names_vas = {e["name"] for e in client.get("/api/exercises", headers=vas).json()}
    assert "Vasi gyak" in names_vas and "Veszprémi gyak" not in names_vas
    ops_vp = {o["name"] for o in client.get("/api/operations", headers=vp).json()}
    assert "Vasi gyak" not in ops_vp
    # idegen zászlóalj műveletét szerkeszteni/törölni nem lehet (404)
    assert client.put(f"/api/exercises/{vas_ex['id']}", json={**base, "name": "Vasi gyak"}, headers=vp).status_code == 404
    assert client.delete(f"/api/exercises/{vas_ex['id']}", headers=vp).status_code == 404
    assert client.get(f"/api/campaign/exercise/{vas_ex['id']}/plan", headers=vp).status_code == 404
    # az admin mindent lát
    assert {"Veszprémi gyak", "Ezred gyak", "Vasi gyak"} <= {e["name"] for e in client.get("/api/exercises", headers=admin_headers).json()}

    # parancsok
    ot = client.post("/api/orders/types", json={"name": "Hatókör-teszt", "chapters": [{"name": "A", "responsible": "Jog"}], "signers": ["Parancsnok"]}, headers=admin_headers).json()
    my_order = client.post("/api/orders", json={"orderTypeId": ot["id"], "subject": "Veszprémi parancs"}, headers=vp).json()
    assert my_order["unit"] == "31 TVZ"
    vas_order = client.post("/api/orders", json={"orderTypeId": ot["id"], "subject": "Vasi parancs", "unit": "83 TVZ"}, headers=admin_headers).json()
    subjects = {o["subject"] for o in client.get("/api/orders", headers=vp).json()}
    assert "Veszprémi parancs" in subjects and "Vasi parancs" not in subjects
    assert client.get(f"/api/orders/{vas_order['id']}", headers=vp).status_code == 404
    assert client.get(f"/api/orders/{vas_order['id']}", headers=admin_headers).status_code == 200

    # közlemények: ezredszintű mindenkinek, zászlóalji csak a sajátnak
    client.post("/api/announcements", json={"title": "Ezred hír", "category": "Fontos", "content": "x"}, headers=admin_headers)
    client.post("/api/announcements", json={"title": "Vasi hír", "category": "Fontos", "content": "x", "unit": "83 TVZ"}, headers=admin_headers)
    own = client.post("/api/announcements", json={"title": "Veszprémi hír", "category": "Általános", "content": "x"}, headers=vp).json()
    assert own["unit"] == "31 TVZ"
    titles_vp = {a["title"] for a in client.get("/api/announcements", headers=vp).json()}
    assert {"Ezred hír", "Veszprémi hír"} <= titles_vp and "Vasi hír" not in titles_vp
    titles_vas = {a["title"] for a in client.get("/api/announcements", headers=vas).json()}
    assert "Vasi hír" in titles_vas and "Veszprémi hír" not in titles_vas

    ref = client.get("/api/reference", headers=vp).json()
    assert ref["unitLabels"]["31 TVZ"] == "31. TVZ" and ref["regionLabels"][""] == "Ezredtörzs (Győr)"
