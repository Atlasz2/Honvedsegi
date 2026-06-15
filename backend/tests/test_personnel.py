"""A personnel lista- és lapozó-végpontok tesztjei.

A test_paged_has_no_n_plus_one a #1 hiányosság (ál-lapozás + N+1) regressziós
tesztje: rögzíti, hogy a képesítések egyetlen kötegelt lekérdezéssel töltődnek be.
"""
from __future__ import annotations

from sqlalchemy import event

from app.db import engine


def _create_person(client, headers, *, name, sztsz, rank="őrvezető", unit="1. század", status="Aktív"):
    payload = {"name": name, "sztsz": sztsz, "rank": rank, "unit": unit, "status": status}
    response = client.post("/api/personnel", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_health(client):
    assert client.get("/api/health").status_code == 200


def test_paged_requires_auth(client):
    assert client.get("/api/personnel/paged").status_code == 401


def test_paged_returns_page_metadata(client, admin_headers):
    response = client.get("/api/personnel/paged?page=1&page_size=5", headers=admin_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert {"items", "page", "pageSize", "total", "totalPages"} <= set(body)
    assert body["page"] == 1
    assert body["pageSize"] == 5
    assert len(body["items"]) <= 5
    assert body["total"] >= len(body["items"])


def test_paged_does_not_exceed_total(client, admin_headers):
    first = client.get("/api/personnel/paged?page=1&page_size=10", headers=admin_headers).json()
    # Egy biztosan túlindexelt oldal az utolsó, nem-üres oldalra korlátozódik.
    far = client.get("/api/personnel/paged?page=9999&page_size=10", headers=admin_headers).json()
    assert far["total"] == first["total"]
    assert far["page"] == far["totalPages"]


def test_search_is_accent_insensitive(client, admin_headers):
    _create_person(client, admin_headers, name="Ödön Ürményi", sztsz="19000001")
    response = client.get("/api/personnel/paged?q=odon urmenyi", headers=admin_headers)
    assert response.status_code == 200, response.text
    names = [item["name"] for item in response.json()["items"]]
    assert any("Ödön Ürményi" == name for name in names)


def test_paged_has_no_n_plus_one(client, admin_headers):
    # Több személy a lapon: a régi kód fejenként külön lekérdezte a képesítéseket.
    for i in range(5):
        _create_person(client, admin_headers, name=f"Teszt Katona {i}", sztsz=f"1800000{i}")

    statements: list[str] = []

    def _record(conn, cursor, statement, parameters, context, executemany):
        if "personnel_qualifications" in statement:
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", _record)
    try:
        response = client.get("/api/personnel/paged?page=1&page_size=25", headers=admin_headers)
        assert response.status_code == 200, response.text
    finally:
        event.remove(engine, "before_cursor_execute", _record)

    assert len(statements) == 1, (
        f"a képesítéseket egyetlen kötegelt lekérdezéssel kell betölteni, "
        f"de {len(statements)} futott le"
    )
