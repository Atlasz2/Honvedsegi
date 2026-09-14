"""Helyszín-foglaltság névtelenül, napi zárás, ütközés-előrejelzés, parancs-zárolás,
ügyeleti átadás-átvétel, reggeli összefoglaló, import-különbözet."""
from __future__ import annotations

import io
from datetime import date


def _login(client, username, password):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _user(client, admin_headers, username, region):
    client.post("/api/users", json={"username": username, "password": "jelszo123", "display_name": username.title(), "role": "editor", "active": True, "region": region}, headers=admin_headers)
    return _login(client, username, "jelszo123")


def _person(client, headers, name, sztsz, unit):
    return client.post("/api/personnel", json={"name": name, "sztsz": sztsz, "rank": "honvéd", "unit": unit, "status": "Aktív"}, headers=headers).json()["id"]


def _exercise(client, headers, **kw):
    body = {"name": "X", "type": "Gyakorlat", "startDate": "2099-05-10", "endDate": "2099-05-12", "location": "Lőtér", "maxPersonnel": 10,
            "description": "", "status": "Tervezett", "qualificationId": "", "assigned": []}
    body.update(kw)
    r = client.post("/api/exercises", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_location_bookings_of_other_battalion_are_anonymous(client, admin_headers):
    vas = _user(client, admin_headers, "vasi3", "Vas")
    vp = _user(client, admin_headers, "veszpremi3", "Veszprém")
    _exercise(client, vp, name="Veszprémi lövészet", location="Központi lőtér", startDate="2099-06-01", endDate="2099-06-02")
    rows = client.get("/api/availability?start_date=2099-06-01&end_date=2099-06-02&q=lőtér", headers=vas).json()
    mine = [b for b in rows if b["location"] == "Központi lőtér"]
    assert mine and mine[0]["foreign"] is True and mine[0]["eventName"] == "foglalt — 31. TVZ" and mine[0]["eventId"] == ""
    own = client.get("/api/availability?start_date=2099-06-01&end_date=2099-06-02&q=lőtér", headers=vp).json()
    assert any(b["eventName"] == "Veszprémi lövészet" and b["foreign"] is False for b in own)
    c = client.get("/api/conflicts?location=Központi lőtér&start_date=2099-06-02&end_date=2099-06-03", headers=vas).json()
    assert c and c[0]["foreign"] is True and c[0]["eventName"].startswith("foglalt")


def test_daily_attendance_close_and_override(client, admin_headers):
    vp = _user(client, admin_headers, "veszpremi4", "Veszprém")
    pid = _person(client, admin_headers, "Zárás Zoltán", "66100001", "31 TVZ")
    day = "2099-07-01"
    r = client.post("/api/attendance/close", json={"date": day, "note": "reggeli jelentés"}, headers=vp)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["closedForMe"] is True and body["closures"][0]["unit"] == "31 TVZ" and body["closures"][0]["unitLabel"] == "31. TVZ"
    assert client.post("/api/attendance/close", json={"date": day}, headers=vp).status_code == 409
    put = client.put("/api/attendance", json={"date": day, "items": [{"personnelId": pid, "status": "Betegállomány", "note": ""}]}, headers=vp)
    assert put.status_code == 409
    put = client.put("/api/attendance", json={"date": day, "items": [{"personnelId": pid, "status": "Betegállomány", "note": ""}], "overrideReason": "utólagos orvosi igazolás"}, headers=vp)
    assert put.status_code == 200, put.text
    admin_day = client.get(f"/api/attendance?date={day}", headers=admin_headers).json()
    assert [c["unit"] for c in admin_day["closures"]] == ["31 TVZ"] and admin_day["closedForMe"] is False
    assert client.delete(f"/api/attendance/close?date={day}", headers=vp).status_code == 400
    assert client.delete(f"/api/attendance/close?date={day}&reason=elírás", headers=vp).status_code == 200
    assert client.get(f"/api/attendance?date={day}", headers=vp).json()["closedForMe"] is False


def test_assignment_forecast_counts_busy_people(client, admin_headers):
    vp = _user(client, admin_headers, "veszpremi5", "Veszprém")
    a = _person(client, admin_headers, "Foglalt Ferenc", "66100011", "31 TVZ")
    _person(client, admin_headers, "Szabad Szabolcs", "66100012", "31 TVZ")
    _person(client, admin_headers, "Vasi Vilmos", "66100013", "83 TVZ")
    ex = _exercise(client, admin_headers, name="Lekötő", unit="31 TVZ", startDate="2099-08-10", endDate="2099-08-12",
                   assigned=[{"personId": a, "personName": "Foglalt Ferenc", "role": "résztvevő"}])
    f = client.get("/api/conflicts/forecast?start_date=2099-08-11&end_date=2099-08-11", headers=vp).json()
    assert f["busy"] == 1 and f["busyPeople"][0]["name"] == "Foglalt Ferenc" and f["assignable"] >= 2
    assert all(p["unit"] == "31 TVZ" for p in f["busyPeople"])
    f2 = client.get(f"/api/conflicts/forecast?start_date=2099-08-11&end_date=2099-08-11&exclude_type=exercise&exclude_id={ex['id']}", headers=vp).json()
    assert f2["busy"] == 0
    assert client.get("/api/conflicts/forecast?start_date=&end_date=", headers=vp).status_code == 400


def test_issued_order_is_locked_and_amendable(client, admin_headers):
    ot = client.post("/api/orders/types", json={"name": "Zár-teszt", "chapters": [{"name": "A", "responsible": "Jog"}], "signers": ["Parancsnok"]}, headers=admin_headers).json()
    order = client.post("/api/orders", json={"orderTypeId": ot["id"], "subject": "Zárolandó"}, headers=admin_headers).json()
    ch = order["chapters"][0]
    client.put(f"/api/orders/{order['id']}/chapters/{ch['id']}", json={"status": "Kész", "content": "kész szöveg", "assignee": "", "dueDate": "", "note": ""}, headers=admin_headers)
    client.put(f"/api/orders/{order['id']}/signatures", json={"signatures": [{"role": "Parancsnok", "name": "N", "signed": True}]}, headers=admin_headers)
    assert client.post(f"/api/orders/{order['id']}/amend", json={"subject": "korai"}, headers=admin_headers).status_code == 400
    issued = client.post(f"/api/orders/{order['id']}/issue", headers=admin_headers).json()
    assert issued["locked"] is True
    assert client.put(f"/api/orders/{order['id']}/chapters/{ch['id']}", json={"status": "Kész", "content": "átírva", "assignee": "", "dueDate": "", "note": ""}, headers=admin_headers).status_code == 409
    assert client.put(f"/api/orders/{order['id']}/signatures", json={"signatures": []}, headers=admin_headers).status_code == 409
    assert client.post(f"/api/orders/{order['id']}/chapters", json={"name": "B", "responsible": "Jog"}, headers=admin_headers).status_code == 409
    meta = {"subject": "Zárolandó", "status": "Kiadva", "number": "", "issuer": issued["issuer"], "dueDate": issued["dueDate"], "issuedDate": issued["issuedDate"], "notes": "megjegyzés mehet"}
    assert client.put(f"/api/orders/{order['id']}", json=meta, headers=admin_headers).status_code == 200
    assert client.put(f"/api/orders/{order['id']}", json={**meta, "subject": "Átírt tárgy"}, headers=admin_headers).status_code == 409
    amend = client.post(f"/api/orders/{order['id']}/amend", json={"subject": "Módosítás: Zárolandó"}, headers=admin_headers)
    assert amend.status_code == 201, amend.text
    a = amend.json()
    assert a["amendsOrderId"] == order["id"] and a["locked"] is False and a["status"] == "Előkészítés"
    assert a["chapters"][0]["content"] == "kész szöveg"
    assert client.get(f"/api/orders/{order['id']}", headers=admin_headers).json()["amendedByIds"] == [a["id"]]
    assert client.get(f"/api/orders/{order['id']}", headers=admin_headers).json()["chapters"][0]["content"] == "kész szöveg"


def test_duty_handover(client, admin_headers):
    duty = _exercise(client, admin_headers, name="Őrség", type="Őrszolgálat", startDate="2099-09-01T08:00", endDate="2099-09-02T08:00")
    plain = _exercise(client, admin_headers, name="Nem szolgálat", type="Gyakorlat")
    assert client.post(f"/api/exercises/{plain['id']}/handover", json={"action": "handover"}, headers=admin_headers).status_code == 400
    assert client.post(f"/api/exercises/{duty['id']}/handover", json={"action": "takeover", "personName": "Új Ügyeletes"}, headers=admin_headers).status_code == 400
    r = client.post(f"/api/exercises/{duty['id']}/handover", json={"action": "handover", "personName": "Régi Ügyeletes", "note": "rendkívüli esemény nem volt"}, headers=admin_headers)
    assert r.status_code == 200 and r.json()["handover"]["handedOverBy"] == "Régi Ügyeletes" and r.json()["handover"]["handedOverAt"]
    r = client.post(f"/api/exercises/{duty['id']}/handover", json={"action": "takeover", "personName": "Új Ügyeletes"}, headers=admin_headers)
    h = r.json()["handover"]
    assert h["takenOverBy"] == "Új Ügyeletes" and h["takenOverAt"] and h["note"] == "rendkívüli esemény nem volt"
    assert client.post(f"/api/exercises/{duty['id']}/handover", json={"action": "clear"}, headers=admin_headers).json()["handover"] in (None, {})


def test_daily_digest_is_scoped(client, admin_headers):
    vp = _user(client, admin_headers, "veszpremi6", "Veszprém")
    today = date.today().isoformat()
    _exercise(client, admin_headers, name="Mai vasi", unit="83 TVZ", startDate=today, endDate=today)
    _exercise(client, vp, name="Mai veszprémi", startDate=today, endDate=today)
    d = client.get("/api/me/todos", headers=vp).json()
    assert d["unit"] == "31 TVZ" and d["digest"]["scope"] == "31. TVZ – Veszprém"
    texts = " | ".join(line["text"] for line in d["digest"]["lines"])
    assert "Mai veszprémi" in texts and "Mai vasi" not in texts
    assert any(line["kind"] == "todo" and "létszám" in line["text"].lower() for line in d["digest"]["lines"])
    client.post("/api/attendance/close", json={"date": today}, headers=vp)
    d = client.get("/api/me/todos", headers=vp).json()
    assert any(line["kind"] == "ok" and "lezárva" in line["text"] for line in d["digest"]["lines"])


def test_import_preview_diff_summary(client, admin_headers):
    from openpyxl import Workbook
    _person(client, admin_headers, "Marad Márton", "77100001", "31 TVZ")
    _person(client, admin_headers, "Költöző Kata", "77100002", "31 TVZ")
    _person(client, admin_headers, "Leszerelő Lajos", "77100003", "31 TVZ")
    _person(client, admin_headers, "Vasi Viola", "77100004", "83 TVZ")
    wb = Workbook()
    ws = wb.active
    ws.append(["Név", "SZTSZ", "Rendfokozat", "Alegység", "Státusz"])
    ws.append(["Marad Márton", "77100001", "honvéd", "31 TVZ", "Aktív"])
    ws.append(["Költöző Kata", "77100002", "honvéd", "19 TVZ", "Aktív"])
    ws.append(["Leszerelő Lajos", "77100003", "honvéd", "31 TVZ", "Leszerelt"])
    ws.append(["Vasi Viola", "77100004", "őrmester", "83 TVZ", "Aktív"])
    ws.append(["Új Ubul", "77100005", "honvéd", "31 TVZ", "Aktív"])
    buf = io.BytesIO()
    wb.save(buf)
    vp = _user(client, admin_headers, "veszpremi7", "Veszprém")
    r = client.post("/api/import/personnel/preview", files={"file": ("kgir.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}, headers=vp)
    assert r.status_code == 200, r.text
    diff = r.json()["diff"]
    assert diff["new"] == 1 and diff["unchanged"] == 1 and diff["discharged"] == 1 and diff["unitChanges"] == 1 and diff["outOfScope"] == 1
    item = next(i for i in r.json()["items"] if i["key"] == "77100002")
    assert item["changes"]["unit"] == ["31 TVZ", "19 TVZ"]
