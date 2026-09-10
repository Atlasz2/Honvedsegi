"""A művelet-modul tesztjei: fa, jelenléti ív, anyagigény, dokumentumok.

A dokumentum-tesztek külön figyelnek a feltöltés határaira: a MIME-típus nem
származhat a klienstől, és felhasználói tartalom nem szolgálható ki inline.
"""
from __future__ import annotations

import pytest


@pytest.fixture
def operation_node(client, admin_headers):
    """Egy gyökérszintű művelet-csomópont, amit a teszt szabadon piszkálhat."""
    response = client.post(
        "/api/operations/tree",
        json={
            "eventType": "esemeny",
            "name": "Teszt művelet",
            "type": "Gyakorlat",
            "startDate": "2026-05-01",
            "endDate": "2026-05-03",
            "location": "Lőtér",
            "status": "Tervezett",
        },
        headers=admin_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


# ── Művelet-fa ────────────────────────────────────────────────────────────

def test_tree_returns_roots_with_children(client, admin_headers, operation_node):
    child = client.post(
        "/api/operations/tree",
        json={
            "eventType": "esemeny", "name": "Részfeladat", "type": "Gyakorlat",
            "startDate": "2026-05-02", "endDate": "2026-05-02",
            "status": "Tervezett", "parentId": operation_node,
        },
        headers=admin_headers,
    )
    assert child.status_code == 201, child.text

    tree = client.get("/api/operations/tree", headers=admin_headers)
    assert tree.status_code == 200, tree.text

    root = next(node for node in tree.json() if node["id"] == operation_node)
    assert [c["id"] for c in root["children"]] == [child.json()["id"]]


def test_deleting_a_node_orphans_its_children_instead_of_cascading(client, admin_headers, operation_node):
    child = client.post(
        "/api/operations/tree",
        json={
            "eventType": "esemeny", "name": "Megmaradó részfeladat", "type": "Gyakorlat",
            "startDate": "2026-05-02", "endDate": "2026-05-02",
            "status": "Tervezett", "parentId": operation_node,
        },
        headers=admin_headers,
    ).json()

    assert client.delete(f"/api/operations/tree/{operation_node}", headers=admin_headers).status_code == 204

    ids = {node["id"] for node in client.get("/api/operations/tree", headers=admin_headers).json()}
    assert child["id"] in ids, "a gyerek gyökérszintre kerül, nem törlődik"


def test_tree_write_requires_editor(client):
    response = client.post("/api/operations/tree", json={})
    assert response.status_code == 401


# ── Jelenléti ív ──────────────────────────────────────────────────────────

def test_attendance_batch_upsert_then_patch(client, admin_headers, operation_node):
    upsert = client.put(
        f"/api/operations/{operation_node}/attendance",
        json={"entries": [
            {"personId": "p1", "personName": "Kovács János", "status": "Present"},
            {"personId": "p2", "personName": "Nagy Péter", "status": "Absent"},
        ]},
        headers=admin_headers,
    )
    assert upsert.status_code == 200, upsert.text
    assert {e["personId"]: e["status"] for e in upsert.json()} == {"p1": "Present", "p2": "Absent"}

    patch = client.patch(
        f"/api/operations/{operation_node}/attendance/p2",
        json={"status": "Excused", "note": "orvosnál"},
        headers=admin_headers,
    )
    assert patch.status_code == 200, patch.text
    assert patch.json()["status"] == "Excused"
    assert patch.json()["note"] == "orvosnál"
    assert patch.json()["updatedBy"] == "admin"


def test_attendance_upsert_is_idempotent_per_person(client, admin_headers, operation_node):
    body = {"entries": [{"personId": "p1", "personName": "Kovács János", "status": "Present"}]}
    client.put(f"/api/operations/{operation_node}/attendance", json=body, headers=admin_headers)
    second = client.put(f"/api/operations/{operation_node}/attendance", json=body, headers=admin_headers)

    assert second.status_code == 200
    assert len(second.json()) == 1, "ugyanaz a személy nem duplikálódik"


def test_attendance_rejects_unknown_status(client, admin_headers, operation_node):
    response = client.put(
        f"/api/operations/{operation_node}/attendance",
        json={"entries": [{"personId": "p1", "status": "Talán"}]},
        headers=admin_headers,
    )
    assert response.status_code == 422


def test_attendance_patch_on_missing_person_is_404(client, admin_headers, operation_node):
    response = client.patch(
        f"/api/operations/{operation_node}/attendance/nincs-ilyen",
        json={"status": "Present"},
        headers=admin_headers,
    )
    assert response.status_code == 404


def test_operation_attendance_does_not_touch_the_daily_headcount(client, admin_headers, operation_node):
    """A művelet-jelenlét és a napi létszámjelentés (A1) két külön nyilvántartás."""
    before = client.get("/api/attendance?date=2026-05-01", headers=admin_headers).json()

    client.put(
        f"/api/operations/{operation_node}/attendance",
        json={"entries": [{"personId": "p1", "personName": "Kovács János", "status": "Absent"}]},
        headers=admin_headers,
    )

    after = client.get("/api/attendance?date=2026-05-01", headers=admin_headers).json()
    assert after["summary"] == before["summary"]


# ── Anyagigény ────────────────────────────────────────────────────────────

def test_requirement_lifecycle(client, admin_headers, operation_node):
    created = client.post(
        f"/api/operations/{operation_node}/requirements",
        json={"itemName": "Vaklőszer", "quantity": 500, "unit": "db"},
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    req_id = created.json()["id"]
    assert created.json()["status"] == "Requested"

    approved = client.patch(
        f"/api/operations/{operation_node}/requirements/{req_id}",
        json={"status": "Approved", "quantity": 400},
        headers=admin_headers,
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "Approved"
    assert approved.json()["quantity"] == 400

    assert client.delete(
        f"/api/operations/{operation_node}/requirements/{req_id}", headers=admin_headers
    ).status_code == 204
    assert client.get(f"/api/operations/{operation_node}/requirements", headers=admin_headers).json() == []


def test_requirement_rejects_empty_name(client, admin_headers, operation_node):
    response = client.post(
        f"/api/operations/{operation_node}/requirements",
        json={"itemName": "   ", "quantity": 1},
        headers=admin_headers,
    )
    assert response.status_code == 400


def test_requirement_of_another_operation_is_not_reachable(client, admin_headers, operation_node):
    other = client.post(
        "/api/operations/tree",
        json={"eventType": "esemeny", "name": "Másik", "type": "Gyakorlat",
              "startDate": "2026-06-01", "endDate": "2026-06-01", "status": "Tervezett"},
        headers=admin_headers,
    ).json()["id"]
    req_id = client.post(
        f"/api/operations/{operation_node}/requirements",
        json={"itemName": "Homokzsák", "quantity": 10},
        headers=admin_headers,
    ).json()["id"]

    response = client.patch(
        f"/api/operations/{other}/requirements/{req_id}",
        json={"status": "Approved"},
        headers=admin_headers,
    )
    assert response.status_code == 404


# ── Dokumentumok ──────────────────────────────────────────────────────────

def _upload(client, headers, operation_id, filename, content, content_type):
    return client.post(
        f"/api/operations/{operation_id}/documents",
        files={"file": (filename, content, content_type)},
        data={"title": "Parancs"},
        headers=headers,
    )


def test_document_upload_and_listing(client, admin_headers, operation_node):
    response = _upload(client, admin_headers, operation_node, "parancs.txt", b"tartalom", "text/plain")

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["originalName"] == "parancs.txt"
    assert body["fileSize"] == len(b"tartalom")
    assert body["filename"] != "parancs.txt", "a tárolt név véletlen, nem a felhasználóé"

    listing = client.get(f"/api/operations/{operation_node}/documents", headers=admin_headers)
    assert [d["id"] for d in listing.json()] == [body["id"]]


def test_document_mime_comes_from_the_extension_not_the_client(client, admin_headers, operation_node):
    """Tárolt XSS elleni védelem: a kliens content_type fejléce nem megbízható."""
    response = _upload(client, admin_headers, operation_node, "trojai.txt", b"<script>alert(1)</script>", "text/html")

    assert response.status_code == 201, response.text
    assert "html" not in response.json()["mimeType"], "a text/html nem szivároghat át"


def test_non_pdf_document_is_never_served_inline(client, admin_headers, operation_node):
    doc_id = _upload(client, admin_headers, operation_node, "jegyzet.txt", b"szoveg", "text/plain").json()["id"]

    view = client.get(f"/api/operations/{operation_node}/documents/{doc_id}/view", headers=admin_headers)

    assert view.status_code == 200
    assert view.headers["content-disposition"].startswith("attachment")


def test_document_rejects_unsupported_extension(client, admin_headers, operation_node):
    response = _upload(client, admin_headers, operation_node, "kod.exe", b"MZ", "application/octet-stream")
    assert response.status_code == 400


def test_document_rejects_empty_file(client, admin_headers, operation_node):
    response = _upload(client, admin_headers, operation_node, "ures.txt", b"", "text/plain")
    assert response.status_code == 400


def test_document_download_and_delete(client, admin_headers, operation_node):
    doc_id = _upload(client, admin_headers, operation_node, "parancs.txt", b"tartalom", "text/plain").json()["id"]

    download = client.get(f"/api/operations/{operation_node}/documents/{doc_id}/download", headers=admin_headers)
    assert download.status_code == 200
    assert download.content == b"tartalom"

    assert client.delete(
        f"/api/operations/{operation_node}/documents/{doc_id}", headers=admin_headers
    ).status_code == 204
    assert client.get(f"/api/operations/{operation_node}/documents", headers=admin_headers).json() == []


def test_documents_require_authentication(client, operation_node):
    assert client.get(f"/api/operations/{operation_node}/documents").status_code == 401
