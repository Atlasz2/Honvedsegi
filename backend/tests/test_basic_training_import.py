"""Alapkiképzés-tábla import: modul-oszlopok → képesítés-kiadás, összesítő."""
from __future__ import annotations

import io
from datetime import date

from openpyxl import Workbook


def _person(client, headers, name, sztsz):
    r = client.post("/api/personnel", json={"name": name, "sztsz": sztsz, "rank": "honvéd", "unit": "1. század", "status": "Tartalékos", "joinDate": "2026-01-10"}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _xlsx(rows):
    wb = Workbook(); ws = wb.active
    for row in rows:
        ws.append(row)
    buf = io.BytesIO(); wb.save(buf)
    return buf.getvalue()


def _preview(client, headers, content, filename="alapkikepzes.xlsx"):
    return client.post("/api/import/basic-training/preview", files={"file": (filename, content, "application/octet-stream")}, headers=headers)


def test_module_columns_become_qualifications(client, admin_headers):
    # két modul: az egyik már létező típus, a másik új (létrejön a confirmnál)
    existing = client.post("/api/qualifications/types", json={"name": "BT-import 01 – Alaki", "category": "Alapkiképzés"}, headers=admin_headers).json()
    a = _person(client, admin_headers, "Modulos Márk", "18100001")
    _person(client, admin_headers, "Üres Ubul", "18100002")
    content = _xlsx([
        ["Név", "SZTSZ", "Rendfokozat", "BT-import 01 – Alaki", "BT-import 02 – Lövészet"],
        ["Modulos Márk", "18100001", "honvéd", date(2026, 3, 5), "x"],
        ["Üres Ubul", "18100002", "honvéd", None, ""],
        ["Nincs Nándor", "99999999", "honvéd", "2026.04.01.", None],
    ])
    preview = _preview(client, admin_headers, content).json()
    assert preview["matchedPersons"] == 2 and len(preview["unmatched"]) == 1
    assert preview["unknownModules"] == ["BT-import 02 – Lövészet"]
    assert preview["newGrants"] == 2

    result = client.post(f"/api/import/basic-training/confirm/{preview['draftId']}", headers=admin_headers).json()
    assert result["granted"] == 2 and result["createdModules"] == ["BT-import 02 – Lövészet"]

    quals = client.get(f"/api/qualifications/personnel/{a}", headers=admin_headers).json()
    by_name = {q["qualTypeName"]: q for q in quals}
    assert by_name[existing["name"]]["earnedDate"] == "2026-03-05"
    assert by_name["BT-import 02 – Lövészet"]["earnedDate"] == date.today().isoformat(), "jelölés dátum nélkül → ma"

    # újra ugyanaz a tábla: nincs új kiadás
    again = _preview(client, admin_headers, content).json()
    assert again["newGrants"] == 0 and again["alreadyHeld"] == 2


def test_csv_and_name_only_matching(client, admin_headers):
    _person(client, admin_headers, "Csakneves Csaba", "18100010")
    csv = "nev;BT-import 03 – Harcászat\nCsakneves Csaba;2026-05-01\n".encode("utf-8")
    preview = _preview(client, admin_headers, csv, filename="tabla.csv").json()
    assert preview["matchedPersons"] == 1 and preview["newGrants"] == 1


def test_rejects_table_without_person_column(client, admin_headers):
    r = _preview(client, admin_headers, _xlsx([["Modul A", "Modul B"], ["x", "x"]]))
    assert r.status_code == 400
