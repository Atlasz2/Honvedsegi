"""Parancs-műhely: típusok fejezet-sablonnal és aláírókkal, független
fejezetek szöveggel, automatikus státusz-lépés, aláírás, export."""
from __future__ import annotations

import uuid
from datetime import date, timedelta

LESZERELES = [
    {"name": "Bevezető", "responsible": "Ügyvitel", "template": "{{rendfokozat}} {{név}} ({{sztsz}}) ügyében."},
    {"name": "Jogi rész", "responsible": "Jog"},
    {"name": "Személyügyi rész", "responsible": "Személyügy"},
    {"name": "Pénzügyi rész", "responsible": "Pénzügy", "required": False},
]
SIGNERS = ["Parancsnok", "Törzsfőnök"]


def _type(client, headers, chapters=LESZERELES, signers=SIGNERS, name=None):
    name = name or f"Leszerelési parancs {uuid.uuid4().hex[:6]}"
    r = client.post("/api/orders/types", json={"name": name, "chapters": chapters, "signers": signers}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def _order(client, headers, type_id, subject="Kiss Béla leszerelése", **extra):
    r = client.post("/api/orders", json={"orderTypeId": type_id, "subject": subject, **extra}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def _set_chapter(client, headers, order, index, status, **extra):
    chapter = order["chapters"][index]
    body = {"status": status, "content": extra.pop("content", chapter["content"]), **extra}
    r = client.put(f"/api/orders/{order['id']}/chapters/{chapter['id']}", json=body, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _person(client, headers, name, sztsz):
    r = client.post("/api/personnel", json={"name": name, "sztsz": sztsz, "rank": "őrmester", "unit": "1. század", "status": "Aktív"}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_type_requires_chapters_signers_and_known_responsible(client, admin_headers):
    r = client.post("/api/orders/types", json={"name": "Üres", "chapters": [], "signers": SIGNERS}, headers=admin_headers)
    assert r.status_code == 400
    r = client.post("/api/orders/types", json={"name": f"Aláíró nélkül {uuid.uuid4().hex[:4]}", "chapters": LESZERELES[:1], "signers": []}, headers=admin_headers)
    assert r.status_code == 201, "aláíró nélkül is létrehozható; a parancson utólag felvehető"
    r = client.post("/api/orders/types", json={"name": "Rossz felelős", "chapters": [{"name": "x", "responsible": "Ellenjegyzés"}], "signers": SIGNERS}, headers=admin_headers)
    assert r.status_code == 400, "az ellenjegyzés nem részleg, hanem aláírás"


def test_order_fills_templates_and_snapshots_signers(client, admin_headers):
    order_type = _type(client, admin_headers)
    person = _person(client, admin_headers, "Sablon Sára", "16100010")
    order = _order(client, admin_headers, order_type["id"], personnelId=person["id"], number="12/2026")

    assert order["chapters"][0]["content"] == "őrmester Sablon Sára (16100010) ügyében."
    assert [s["role"] for s in order["signatures"]] == SIGNERS
    assert order["number"] == "12/2026" and order["issuer"], "alapértelmezett kiadó kerül be"
    assert order["pendingResponsibles"] == ["Ügyvitel", "Jog", "Személyügy"], "a nem kötelező Pénzügy nem tart fel"
    assert order["readyToSign"] is False


def test_chapters_are_independent_and_status_advances_automatically(client, admin_headers):
    order_type = _type(client, admin_headers)
    order = _order(client, admin_headers, order_type["id"])

    # A Jog előbb kész lehet, mint az Ügyvitel — nincs sorrendi kényszer.
    order = _set_chapter(client, admin_headers, order, 1, "Kész", content="Jogi indoklás.", assignee="dr. Kovács")
    assert order["pendingResponsibles"] == ["Ügyvitel", "Személyügy"]
    assert order["chapters"][1]["content"] == "Jogi indoklás." and order["chapters"][1]["updatedBy"] == "admin"

    order = _set_chapter(client, admin_headers, order, 0, "Kész", content="Bevezető.")
    order = _set_chapter(client, admin_headers, order, 2, "Nem szükséges")
    assert order["pendingResponsibles"] == []
    assert order["readyToSign"] is True
    assert order["status"] == "Aláírásra vár", "minden kötelező fejezet kész → aláírásra vár"

    # Aláírások: az első csak névvel, a második aláírva → még nem kiadott.
    r = client.put(f"/api/orders/{order['id']}/signatures", json={"signatures": [
        {"role": "Parancsnok", "name": "Nagy ezredes", "signed": False},
        {"role": "Törzsfőnök", "name": "Kis alezredes", "signed": True},
    ]}, headers=admin_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["signedCount"] == 1 and body["status"] == "Aláírásra vár"
    assert body["signatures"][1]["signedBy"] == "admin" and body["signatures"][1]["signedAt"]

    r = client.put(f"/api/orders/{order['id']}/signatures", json={"signatures": [
        {"role": "Parancsnok", "name": "Nagy ezredes", "signed": True},
        {"role": "Törzsfőnök", "name": "Kis alezredes", "signed": True},
    ]}, headers=admin_headers)
    body = r.json()
    assert body["status"] == "Kiadva" and body["issuedDate"] == date.today().isoformat()
    assert body["pendingResponsibles"] == []


def test_type_change_does_not_alter_existing_orders(client, admin_headers):
    order_type = _type(client, admin_headers)
    order = _order(client, admin_headers, order_type["id"])
    r = client.put(f"/api/orders/types/{order_type['id']}", json={"name": order_type["name"], "chapters": LESZERELES[:2], "signers": ["Parancsnok"]}, headers=admin_headers)
    assert r.status_code == 200
    again = client.get(f"/api/orders/{order['id']}", headers=admin_headers).json()
    assert again["totalChapters"] == 4 and len(again["signatures"]) == 2


def test_type_with_orders_cannot_be_deleted(client, admin_headers):
    order_type = _type(client, admin_headers)
    _order(client, admin_headers, order_type["id"])
    assert client.delete(f"/api/orders/types/{order_type['id']}", headers=admin_headers).status_code == 409


def test_order_flags_overdue_until_issued(client, admin_headers):
    order_type = _type(client, admin_headers)
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    order = _order(client, admin_headers, order_type["id"], dueDate=yesterday)
    assert order["isOverdue"] is True
    r = client.put(f"/api/orders/{order['id']}", json={"subject": order["subject"], "status": "Kiadva", "dueDate": yesterday}, headers=admin_headers)
    assert r.json()["isOverdue"] is False and r.json()["pendingResponsibles"] == []


def test_overview_counts_pending_per_responsible(client, admin_headers):
    order_type = _type(client, admin_headers, chapters=[
        {"name": "Bevezető", "responsible": "Ügyvitel"},
        {"name": "Jogi rész", "responsible": "Jog"},
    ])
    a = _order(client, admin_headers, order_type["id"], subject="A")
    _order(client, admin_headers, order_type["id"], subject="B")
    _set_chapter(client, admin_headers, a, 0, "Kész")

    overview = client.get("/api/orders/overview", headers=admin_headers).json()
    by = {row["responsible"]: row for row in overview["byResponsible"]}
    assert "Ellenjegyzés" not in by
    assert by["Ügyvitel"]["blockingOrders"] >= 1   # B-nél még nyitott
    assert by["Jog"]["blockingOrders"] >= 2        # A-nál és B-nél is nyitott — függetlenül az Ügyviteltől


def test_exports_docx_and_pdf(client, admin_headers):
    order_type = _type(client, admin_headers)
    order = _order(client, admin_headers, order_type["id"], number="7/2026")
    _set_chapter(client, admin_headers, order, 0, "Kész", content="Első bekezdés.\nMásodik bekezdés.")

    docx = client.get(f"/api/orders/{order['id']}/export.docx", headers=admin_headers)
    pdf = client.get(f"/api/orders/{order['id']}/export.pdf", headers=admin_headers)
    assert docx.status_code == 200 and docx.content[:2] == b"PK"
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


def test_delete_order_removes_chapters(client, admin_headers):
    order_type = _type(client, admin_headers)
    order = _order(client, admin_headers, order_type["id"])
    assert client.delete(f"/api/orders/{order['id']}", headers=admin_headers).status_code == 204
    assert client.get(f"/api/orders/{order['id']}", headers=admin_headers).status_code == 404
    assert client.delete(f"/api/orders/types/{order_type['id']}", headers=admin_headers).status_code == 204


def test_orders_require_auth(client):
    assert client.get("/api/orders").status_code == 401


def test_signature_slots_can_be_added_and_removed_on_the_order(client, admin_headers):
    order_type = _type(client, admin_headers, signers=["Parancsnok"])
    order = _order(client, admin_headers, order_type["id"])
    # hozzáadás + törlés pozíció szerint; az aláírt nyoma megmarad
    r = client.put(f"/api/orders/{order['id']}/signatures", json={"signatures": [
        {"role": "Parancsnok", "name": "Nagy ezredes", "signed": False},
        {"role": "Törzsfőnök", "name": "", "signed": False},
    ]}, headers=admin_headers)
    assert [s["role"] for s in r.json()["signatures"]] == ["Parancsnok", "Törzsfőnök"]
    r = client.put(f"/api/orders/{order['id']}/signatures", json={"signatures": [
        {"role": "Törzsfőnök", "name": "Kis alezredes", "signed": False},
    ]}, headers=admin_headers)
    assert [s["role"] for s in r.json()["signatures"]] == ["Törzsfőnök"]
