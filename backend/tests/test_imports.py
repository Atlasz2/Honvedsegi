"""Az import folyamat jellemzés-tesztjei (preview -> draft -> confirm).

Ezek a tesztek a *meglévő* viselkedést rögzítik, hogy a réteg-refaktor
(routers/imports.py -> services/imports.py) bizonyíthatóan ne változtassa meg.

Szándékosan NEM assertelünk a hibaüzenetek szövegére: a refaktor pont azokat
javítja ékezetesre. A stabil szerződés a státuszkód és a darabszámok.
"""
from __future__ import annotations

import uuid

PERSONNEL_HEADER = "nev;sztsz;rendfokozat;szervezet;statusz"


def _sztsz() -> str:
    """Egyedi, 8 számjegyű SZTSz, hogy a tesztek ne ütközzenek egymással."""
    return f"{uuid.uuid4().int % 100_000_000:08d}"


def _personnel_csv(*rows: str) -> bytes:
    return ("\n".join([PERSONNEL_HEADER, *rows]) + "\n").encode("utf-8")


def _upload(client, headers, entity: str, content: bytes, filename: str = "adatok.csv"):
    return client.post(
        f"/api/import/{entity}/preview",
        files={"file": (filename, content, "text/csv")},
        headers=headers,
    )


# ── Preview ───────────────────────────────────────────────────────────────

def test_preview_counts_new_rows_as_created(client, admin_headers):
    csv = _personnel_csv(
        f"Teszt Elek;{_sztsz()};Őrmester;31 TVZ;Aktív",
        f"Proba Béla;{_sztsz()};Tizedes;83 TVZ;Aktív",
    )
    response = _upload(client, admin_headers, "personnel", csv)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["totalRows"] == 2
    assert body["created"] == 2
    assert body["updated"] == 0
    assert body["draftId"]
    assert len(body["items"]) == 2
    assert all(item["action"] == "create" for item in body["items"])


def test_preview_rejects_unknown_entity(client, admin_headers):
    response = _upload(client, admin_headers, "jarmuvek", _personnel_csv())
    assert response.status_code == 400


def test_preview_rejects_empty_file(client, admin_headers):
    response = _upload(client, admin_headers, "personnel", b"")
    assert response.status_code == 400


def test_preview_rejects_unsupported_format(client, admin_headers):
    response = _upload(client, admin_headers, "personnel", b"barmi", filename="adatok.rtf")
    assert response.status_code == 400


def test_preview_flags_row_with_missing_required_field(client, admin_headers):
    # Hiányzó rendfokozat/szervezet/státusz -> a sor nem alkalmazható.
    csv = ("nev;sztsz\nHiányos Elek;" + _sztsz() + "\n").encode("utf-8")
    response = _upload(client, admin_headers, "personnel", csv)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created"] == 0
    assert body["items"][0]["issues"]


def test_preview_requires_authentication(client):
    response = client.post(
        "/api/import/personnel/preview",
        files={"file": ("adatok.csv", _personnel_csv(), "text/csv")},
    )
    assert response.status_code == 401


# ── Draft módosítás ───────────────────────────────────────────────────────

def test_draft_update_can_disable_a_row(client, admin_headers):
    csv = _personnel_csv(
        f"Kihagyandó Elek;{_sztsz()};Őrmester;31 TVZ;Aktív",
        f"Megtartandó Béla;{_sztsz()};Tizedes;83 TVZ;Aktív",
    )
    preview = _upload(client, admin_headers, "personnel", csv).json()
    first_line = preview["items"][0]["line"]

    response = client.put(
        f"/api/import/personnel/draft/{preview['draftId']}",
        json={"items": [{"line": first_line, "enabled": False, "data": {}}]},
        headers=admin_headers,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created"] == 1
    assert body["skipped"] == 1


def test_draft_update_rejects_unknown_draft(client, admin_headers):
    response = client.put(
        "/api/import/personnel/draft/nincs-ilyen-draft",
        json={"items": []},
        headers=admin_headers,
    )
    assert response.status_code == 404


# ── Confirm ───────────────────────────────────────────────────────────────

def test_confirm_creates_the_personnel(client, admin_headers):
    sztsz = _sztsz()
    csv = _personnel_csv(f"Behozott Elek;{sztsz};Őrmester;31 TVZ;Aktív")
    preview = _upload(client, admin_headers, "personnel", csv).json()

    response = client.post(
        f"/api/import/personnel/confirm/{preview['draftId']}",
        headers=admin_headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["applied"] is True
    assert response.json()["created"] == 1

    listing = client.get(f"/api/personnel/paged?q={sztsz}", headers=admin_headers)
    assert listing.status_code == 200
    assert any(person["sztsz"] == sztsz for person in listing.json()["items"])


def test_confirm_consumes_the_draft(client, admin_headers):
    csv = _personnel_csv(f"Egyszeri Elek;{_sztsz()};Őrmester;31 TVZ;Aktív")
    preview = _upload(client, admin_headers, "personnel", csv).json()
    draft_id = preview["draftId"]

    first = client.post(f"/api/import/personnel/confirm/{draft_id}", headers=admin_headers)
    second = client.post(f"/api/import/personnel/confirm/{draft_id}", headers=admin_headers)

    assert first.status_code == 200
    assert second.status_code == 404, "a felhasznált draft nem alkalmazható újra"


# ── Napi KGIR-export: hiányzók és ismeretlen oszlopok ─────────────────────

def test_preview_lists_registered_people_missing_from_the_file(client, admin_headers):
    # Egy személy már a nyilvántartásban van; a következő fájlból hiányzik.
    known = _sztsz()
    first = _upload(client, admin_headers, "personnel", _personnel_csv(f"Maradó Elek;{known};Őrmester;31 TVZ;Aktív")).json()
    assert client.post(f"/api/import/personnel/confirm/{first['draftId']}", headers=admin_headers).status_code == 200

    second = _upload(client, admin_headers, "personnel", _personnel_csv(f"Új Béla;{_sztsz()};Tizedes;83 TVZ;Aktív")).json()

    assert second["missingCount"] >= 1
    assert any(person["sztsz"] == known for person in second["missing"])
    assert all(person["status"] != "Leszerelt" for person in second["missing"])


def test_preview_does_not_report_people_present_in_the_file(client, admin_headers):
    known = _sztsz()
    first = _upload(client, admin_headers, "personnel", _personnel_csv(f"Jelen Elek;{known};Őrmester;31 TVZ;Aktív")).json()
    assert client.post(f"/api/import/personnel/confirm/{first['draftId']}", headers=admin_headers).status_code == 200

    again = _upload(client, admin_headers, "personnel", _personnel_csv(f"Jelen Elek;{known};Őrmester;31 TVZ;Aktív")).json()

    assert again["updated"] == 1
    assert all(person["sztsz"] != known for person in again["missing"])


def test_preview_reports_unrecognised_columns(client, admin_headers):
    csv = (
        "nev;sztsz;rendfokozat;szervezet;statusz;anyja neve\n"
        f"Oszlop Elek;{_sztsz()};Őrmester;31 TVZ;Aktív;Kiss Mária\n"
    ).encode("utf-8")
    body = _upload(client, admin_headers, "personnel", csv).json()

    assert body["created"] == 1, "az ismeretlen oszlop nem akadályozza a sort"
    assert body["unknownColumns"] == ["anyja neve"]
    assert any("anyja neve" in issue["message"] for issue in body["issues"] if issue["line"] == 0)
