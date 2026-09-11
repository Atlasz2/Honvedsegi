"""Parancs-műhely: típusok fejezet-sablonnal, parancs fejezet-állapotokkal,
„ki tartja fel" és áttekintő."""
from __future__ import annotations

import uuid
from datetime import date, timedelta

LESZERELES = [
    {"name": "Bevezető", "responsible": "Ügyvitel"},
    {"name": "Jogi rész", "responsible": "Jog"},
    {"name": "Személyügyi rész", "responsible": "Személyügy"},
    {"name": "Pénzügyi rész", "responsible": "Pénzügy"},
    {"name": "Ellenjegyzés", "responsible": "Ellenjegyzés"},
]


def _type(client, headers, chapters=LESZERELES, name=None):
    name = name or f"Leszerelési parancs {uuid.uuid4().hex[:6]}"
    r = client.post("/api/orders/types", json={"name": name, "chapters": chapters}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def _order(client, headers, type_id, subject="Kiss Béla leszerelése", **extra):
    r = client.post("/api/orders", json={"orderTypeId": type_id, "subject": subject, **extra}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def _set_chapter(client, headers, order, index, status, **extra):
    chapter = order["chapters"][index]
    r = client.put(
        f"/api/orders/{order['id']}/chapters/{chapter['id']}",
        json={"status": status, **extra}, headers=headers,
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_type_requires_chapters_and_known_responsible(client, admin_headers):
    r = client.post("/api/orders/types", json={"name": "Üres", "chapters": []}, headers=admin_headers)
    assert r.status_code == 400
    r = client.post(
        "/api/orders/types",
        json={"name": "Rossz felelős", "chapters": [{"name": "x", "responsible": "Konyha"}]},
        headers=admin_headers,
    )
    assert r.status_code == 400


def test_order_snapshots_chapters_and_tracks_blocker(client, admin_headers):
    order_type = _type(client, admin_headers)
    order = _order(client, admin_headers, order_type["id"])

    assert order["typeName"] == order_type["name"]
    assert [c["name"] for c in order["chapters"]] == [c["name"] for c in LESZERELES]
    assert order["doneChapters"] == 0 and order["totalChapters"] == 5
    assert order["blockedBy"] == "Ügyvitel", "az első kész nem lévő fejezet felelőse tartja fel"

    order = _set_chapter(client, admin_headers, order, 0, "Kész", assignee="Kovács ügyintéző")
    assert order["blockedBy"] == "Jog"
    assert order["chapters"][0]["updatedBy"] == "admin"
    assert order["chapters"][0]["assignee"] == "Kovács ügyintéző"

    # A „Nem szükséges" is továbbengedi a folyamatot.
    order = _set_chapter(client, admin_headers, order, 1, "Nem szükséges")
    assert order["blockedBy"] == "Személyügy"
    assert order["doneChapters"] == 2


def test_type_change_does_not_alter_existing_orders(client, admin_headers):
    order_type = _type(client, admin_headers)
    order = _order(client, admin_headers, order_type["id"])

    r = client.put(
        f"/api/orders/types/{order_type['id']}",
        json={"name": order_type["name"], "chapters": LESZERELES[:2]},
        headers=admin_headers,
    )
    assert r.status_code == 200

    again = client.get(f"/api/orders/{order['id']}", headers=admin_headers).json()
    assert again["totalChapters"] == 5


def test_type_with_orders_cannot_be_deleted(client, admin_headers):
    order_type = _type(client, admin_headers)
    _order(client, admin_headers, order_type["id"])
    assert client.delete(f"/api/orders/types/{order_type['id']}", headers=admin_headers).status_code == 409


def test_order_links_person_and_flags_overdue(client, admin_headers):
    order_type = _type(client, admin_headers)
    person = client.post(
        "/api/personnel",
        json={"name": "Parancs Pál", "sztsz": "16100001", "rank": "honvéd", "unit": "1. század", "status": "Aktív"},
        headers=admin_headers,
    ).json()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    order = _order(client, admin_headers, order_type["id"], personnelId=person["id"], dueDate=yesterday)

    assert order["personName"] == "Parancs Pál"
    assert order["isOverdue"] is True

    # Kiadott parancs már nem lejárt és nem tart fel senkit.
    r = client.put(
        f"/api/orders/{order['id']}",
        json={"subject": order["subject"], "status": "Kiadva", "dueDate": yesterday},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["isOverdue"] is False and r.json()["blockedBy"] == ""


def test_overview_counts_open_chapters_per_responsible(client, admin_headers):
    order_type = _type(client, admin_headers, chapters=[
        {"name": "Bevezető", "responsible": "Ügyvitel"},
        {"name": "Jogi rész", "responsible": "Jog"},
    ])
    a = _order(client, admin_headers, order_type["id"], subject="A")
    b = _order(client, admin_headers, order_type["id"], subject="B")
    _set_chapter(client, admin_headers, a, 0, "Kész")

    overview = client.get("/api/orders/overview", headers=admin_headers).json()
    by = {row["responsible"]: row for row in overview["byResponsible"]}

    assert overview["openOrders"] >= 2
    assert by["Ügyvitel"]["openChapters"] >= 1     # B első fejezete
    assert by["Ügyvitel"]["blockingOrders"] >= 1   # B-t az Ügyvitel tartja fel
    assert by["Jog"]["blockingOrders"] >= 1        # A-t a Jog tartja fel
    assert by["Jog"]["openChapters"] >= 2


def test_list_filters_open_only(client, admin_headers):
    order_type = _type(client, admin_headers)
    done = _order(client, admin_headers, order_type["id"], subject="Kiadott")
    client.put(f"/api/orders/{done['id']}", json={"subject": "Kiadott", "status": "Kiadva"}, headers=admin_headers)
    open_ids = {o["id"] for o in client.get("/api/orders?open_only=true", headers=admin_headers).json()}
    assert done["id"] not in open_ids
    all_ids = {o["id"] for o in client.get("/api/orders", headers=admin_headers).json()}
    assert done["id"] in all_ids


def test_delete_order_removes_chapters(client, admin_headers):
    order_type = _type(client, admin_headers)
    order = _order(client, admin_headers, order_type["id"])
    assert client.delete(f"/api/orders/{order['id']}", headers=admin_headers).status_code == 204
    assert client.get(f"/api/orders/{order['id']}", headers=admin_headers).status_code == 404
    assert client.delete(f"/api/orders/types/{order_type['id']}", headers=admin_headers).status_code == 204


def test_orders_require_auth(client):
    assert client.get("/api/orders").status_code == 401
    assert client.get("/api/orders/types").status_code == 401
