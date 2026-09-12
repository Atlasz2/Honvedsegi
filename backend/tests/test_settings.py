"""Admin-beállítások: riasztási küszöbök olvasása/írása, hatásuk a riasztásokra."""
from __future__ import annotations

from datetime import date, timedelta


def test_defaults_and_validation(client, admin_headers):
    items = client.get("/api/settings/alerts", headers=admin_headers).json()["items"]
    by = {i["key"]: i for i in items}
    assert by["order_deadline_warn_days"]["value"] == 7, "a parancs-határidő alapból 7 nap, nem 30"
    assert client.put("/api/settings/alerts", json={"values": {"order_deadline_warn_days": 999}}, headers=admin_headers).status_code == 400
    assert client.put("/api/settings/alerts", json={"values": {"nincs_ilyen": 1}}, headers=admin_headers).status_code == 400
    assert client.put("/api/settings/alerts", json={"values": {"order_deadline_warn_days": "x"}}, headers=admin_headers).status_code in (400, 422)


def test_changed_threshold_drives_the_alert(client, admin_headers):
    order_type = client.post("/api/orders/types", json={"name": "Küszöb-teszt", "chapters": [{"name": "Rész", "responsible": "Jog"}], "signers": ["Parancsnok"]}, headers=admin_headers).json()
    in_20_days = (date.today() + timedelta(days=20)).isoformat()
    order = client.post("/api/orders", json={"orderTypeId": order_type["id"], "subject": "Küszöb parancs", "dueDate": in_20_days}, headers=admin_headers).json()

    # 7 napos küszöbnél a 20 nap múlva esedékes még nem riaszt
    items = client.get("/api/alerts/order-deadlines", headers=admin_headers).json()["items"]
    assert not any(i["orderId"] == order["id"] for i in items)

    r = client.put("/api/settings/alerts", json={"values": {"order_deadline_warn_days": 30}}, headers=admin_headers)
    assert r.status_code == 200 and "order_deadline_warn_days" in r.json()["changed"]
    items = client.get("/api/alerts/order-deadlines", headers=admin_headers).json()["items"]
    assert any(i["orderId"] == order["id"] for i in items), "30 napra állítva már riaszt"

    client.put("/api/settings/alerts", json={"values": {"order_deadline_warn_days": 7}}, headers=admin_headers)


def test_settings_write_requires_admin(client):
    login = client.post("/api/auth/login", json={"username": "olvaso", "password": "olvaso123"}).json()
    headers = {"Authorization": f"Bearer {login['token']}"}
    assert client.get("/api/settings/alerts", headers=headers).status_code == 200
    assert client.put("/api/settings/alerts", json={"values": {"order_deadline_warn_days": 5}}, headers=headers).status_code == 403


def test_threshold_can_be_disabled_and_hides_its_alerts(client, admin_headers):
    # kikapcsolva: a parancs-határidő figyelmeztetés üres, a beállítás jelzi
    r = client.put("/api/settings/alerts", json={"enabled": {"order_deadline_warn_days": False}}, headers=admin_headers)
    assert r.status_code == 200, r.text
    item = next(i for i in r.json()["items"] if i["key"] == "order_deadline_warn_days")
    assert item["enabled"] is False and item["toggleable"] is True
    assert "order_deadline_warn_days.enabled" in r.json()["changed"]
    body = client.get("/api/alerts/order-deadlines", headers=admin_headers).json()
    assert body["orders"] == [] and body["chapters"] == []
    assert client.get("/api/alerts/leave-minimum", headers=admin_headers).json() is not None

    # nem kapcsolható paraméter → 400; visszakapcsolás
    assert client.put("/api/settings/alerts", json={"enabled": {"basic_training_deadline_days": False}}, headers=admin_headers).status_code == 400
    r = client.put("/api/settings/alerts", json={"enabled": {"order_deadline_warn_days": True}}, headers=admin_headers)
    assert next(i for i in r.json()["items"] if i["key"] == "order_deadline_warn_days")["enabled"] is True


def test_custom_date_rules_are_validated_and_evaluated(client, admin_headers):
    from datetime import date, timedelta
    soon = (date.today() - timedelta(days=350)).isoformat()   # +365 nap érvényesség → 15 nap múlva jár le
    old = (date.today() - timedelta(days=400)).isoformat()    # már lejárt
    # az `extra` importból jön (nem szerkeszthető) — itt közvetlenül töltjük
    from app.db import SessionLocal
    from app.models import PersonModel, new_id
    with SessionLocal() as db:
        for name, sztsz, value in (("Orvosi Ottó", "33100001", soon), ("Lejárt Lajos", "33100002", old), ("Friss Ferenc", "33100003", date.today().isoformat())):
            db.add(PersonModel(id=new_id(), name=name, sztsz=sztsz, rank="honvéd", unit="1. század", status="Aktív",
                               extra={"Orvosi alkalmassági": value}))
        db.commit()

    fields = client.get("/api/settings/alerts/custom", headers=admin_headers).json()["fields"]
    assert any(f["key"] == "extra:Orvosi alkalmassági" for f in fields)

    bad = client.put("/api/settings/alerts/custom", json={"rules": [{"id": "orvosi", "label": "", "field": "extra:Orvosi alkalmassági", "validityDays": 365, "warnDays": 30}]}, headers=admin_headers)
    assert bad.status_code == 400
    ok = client.put("/api/settings/alerts/custom", json={"rules": [
        {"id": "orvosi", "label": "Orvosi alkalmassági lejár", "field": "extra:Orvosi alkalmassági", "validityDays": 365, "warnDays": 30, "enabled": True},
        {"id": "kikapcsolt", "label": "Nem fut", "field": "join_date", "validityDays": 1, "warnDays": 365, "enabled": False},
    ]}, headers=admin_headers)
    assert ok.status_code == 200, ok.text
    assert [r["id"] for r in ok.json()["rules"]] == ["orvosi", "kikapcsolt"]

    body = client.get("/api/alerts/custom", headers=admin_headers).json()
    assert [r["id"] for r in body["rules"]] == ["orvosi"], "a kikapcsolt szabály nem fut"
    names = {i["name"]: i for i in body["items"]}
    assert "Friss Ferenc" not in names
    assert names["Lejárt Lajos"]["isOverdue"] is True
    assert names["Orvosi Ottó"]["isOverdue"] is False and 0 <= names["Orvosi Ottó"]["daysLeft"] <= 30

    # olvasó nem írhat
    reader = client.post("/api/auth/login", json={"username": "olvaso", "password": "olvaso123"}).json()["token"]
    assert client.put("/api/settings/alerts/custom", json={"rules": []}, headers={"Authorization": f"Bearer {reader}"}).status_code == 403
