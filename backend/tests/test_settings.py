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
