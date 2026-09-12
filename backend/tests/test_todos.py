"""Teendőim: a részlegem nyitott fejezetei, várakozó szabadságok, riasztás-számok."""
from __future__ import annotations

from datetime import date, timedelta


def _login(client, username, password):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]


def test_department_is_validated_and_returned(client, admin_headers):
    bad = client.post("/api/users", json={"username": "reszleg-rossz", "password": "jelszo123", "display_name": "R", "role": "editor", "active": True, "department": "Konyha"}, headers=admin_headers)
    assert bad.status_code == 400
    ok = client.post("/api/users", json={"username": "jogasz", "password": "jelszo123", "display_name": "Dr. Jog", "role": "editor", "active": True, "department": "Jog"}, headers=admin_headers)
    assert ok.status_code == 200, ok.text
    assert ok.json()["department"] == "Jog"
    _, auth_user = _login(client, "jogasz", "jelszo123")
    assert auth_user["department"] == "Jog"


def test_todos_show_my_departments_open_chapters(client, admin_headers):
    headers, _ = _login(client, "jogasz", "jelszo123")
    order_type = client.post("/api/orders/types", json={"name": "Teendő-teszt típus", "chapters": [
        {"name": "Bevezető", "responsible": "Ügyvitel"}, {"name": "Jogi rész", "responsible": "Jog"},
    ], "signers": ["Parancsnok"]}, headers=admin_headers).json()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    order = client.post("/api/orders", json={"orderTypeId": order_type["id"], "subject": "Teendős parancs"}, headers=admin_headers).json()
    jogi = next(c for c in order["chapters"] if c["responsible"] == "Jog")
    client.put(f"/api/orders/{order['id']}/chapters/{jogi['id']}", json={"status": "Folyamatban", "content": "", "dueDate": yesterday}, headers=admin_headers)

    todos = client.get("/api/me/todos", headers=headers).json()
    assert todos["department"] == "Jog"
    mine = [c for c in todos["myChapters"] if c["orderId"] == order["id"]]
    assert len(mine) == 1 and mine[0]["chapter"] == "Jogi rész" and mine[0]["isOverdue"] is True and mine[0]["hasText"] is False
    assert not any(c["chapter"] == "Bevezető" for c in todos["myChapters"]), "más részleg fejezete nem az enyém"
    assert todos["alerts"]["overdueOrderDeadlines"] >= 1
    assert "pendingLeaveCount" in todos and "upcoming" in todos

    # részleg nélküli felhasználónak nincs fejezet-teendője, de a többi látszik
    plain = client.get("/api/me/todos", headers=admin_headers).json()
    assert plain["department"] == "" and plain["myChapters"] == []
    assert client.get("/api/me/todos").status_code == 401


def test_event_time_change_creates_a_change_notice(client, admin_headers):
    created = client.post("/api/events", json={
        "name": "Állománygyűlés", "type": "Gyűlés", "startDate": "2099-09-20T19:00", "endDate": "2099-09-20T20:00",
        "location": "Klub", "organizer": "", "maxPersonnel": 0, "description": "", "status": "Tervezett", "assigned": [],
    }, headers=admin_headers)
    assert created.status_code == 201, created.text
    ev = created.json()
    r = client.put(f"/api/events/{ev['id']}", json={**{k: v for k, v in ev.items() if k != 'id'}, "startDate": "2099-09-20T20:00", "endDate": "2099-09-20T21:00"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    notices = [a for a in client.get("/api/announcements", headers=admin_headers).json() if a["category"] == "Változás"]
    assert any("Állománygyűlés" in a["title"] and "20:00" in a["content"] and "19:00" in a["content"] for a in notices)
    # a Teendőim tetején is látszik — ha a dátum a mai (a közlemény dátuma mindig ma)
    todos = client.get("/api/me/todos", headers=admin_headers).json()
    assert any("Állománygyűlés" in c["title"] for c in todos["changes"])
    # név-módosítás önmagában nem szül közleményt
    before = len(notices)
    client.put(f"/api/events/{ev['id']}", json={**{k: v for k, v in ev.items() if k != 'id'}, "startDate": "2099-09-20T20:00", "endDate": "2099-09-20T21:00", "name": "Állománygyűlés (frissítve)"}, headers=admin_headers)
    after = [a for a in client.get("/api/announcements", headers=admin_headers).json() if a["category"] == "Változás"]
    assert len(after) == before
