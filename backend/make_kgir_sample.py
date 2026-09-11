"""Minta „KGIR-export" Excel a napi import kipróbálásához.

Futtatás a backend/ könyvtárból:
    ../.venv/Scripts/python.exe make_kgir_sample.py [cél_fájl]

Alapból az `../../Importálandók/kgir_export_minta.xlsx` fájlt írja. A dev
adatbázis első ~80 személyéből épül, hogy az SZTSZ-ek egyezzenek (frissítés),
plusz 3 új személy (létrehozás), és 2 meglévőt szándékosan kihagy (hogy a
„nyilvántartásban van, de a fájlban nincs" lista se legyen üres). Az oszlopok
a valós export elképzelt fejlécei — az igaziakat a B/1 kérdésre kapjuk; az
„Anyja neve" és a „Születési hely" szándékosan nem modellezett (→ extra).
"""
from __future__ import annotations

import random
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font
from sqlalchemy import select

from app.db import SessionLocal
from app.models import PersonModel

HEADERS = [
    "Név", "SZTSZ", "Rendfokozat", "Szervezeti egység", "Státusz", "Jogviszony kezdete",
    "Születési idő", "Születési hely", "Anyja neve", "Lakcím", "Telefonszám", "E-mail cím",
]
_TOWNS = ["Pápa", "Veszprém", "Győr", "Szombathely", "Tapolca", "Várpalota", "Ajka", "Zalaegerszeg"]
_MOTHERS = ["Kiss Mária", "Nagy Erzsébet", "Tóth Katalin", "Szabó Anna", "Horváth Ilona", "Varga Éva", "Kovács Judit"]
_NEW = [
    ("Újonc Ábel", "HU900001", "honvéd", "1. lövészszázad", "Tartalékos"),
    ("Friss Flóra", "HU900002", "őrvezető", "logisztikai század", "Tartalékos"),
    ("Kezdő Kende", "HU900003", "honvéd", "2. lövészszázad", "Aktív"),
]


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1].parent / "Importálandók" / "kgir_export_minta.xlsx"
    rng = random.Random(20260911)
    with SessionLocal() as db:
        persons = db.scalars(select(PersonModel).where(PersonModel.status != "Leszerelt").order_by(PersonModel.name).limit(80)).all()

    rows = []
    for person in persons[2:]:  # az első kettő szándékosan hiányzik a fájlból
        rows.append([
            person.name, person.sztsz, person.rank, person.unit, person.status, person.join_date,
            person.birth_date, rng.choice(_TOWNS), rng.choice(_MOTHERS), person.address, person.phone, person.email,
        ])
    for name, sztsz, rank, unit, status in _NEW:
        rows.append([name, sztsz, rank, unit, status, "2026-09-01", "2001-03-03", rng.choice(_TOWNS), rng.choice(_MOTHERS), "", "", ""])

    wb = Workbook()
    ws = wb.active
    ws.title = "Állomány"
    ws.append(HEADERS)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for row in rows:
        ws.append(row)
    for col, width in zip("ABCDEFGHIJKL", [24, 12, 18, 22, 12, 16, 14, 16, 18, 34, 18, 30]):
        ws.column_dimensions[col].width = width
    target.parent.mkdir(parents=True, exist_ok=True)
    wb.save(target)
    print(f"{target}: {len(rows)} sor ({len(persons) - 2} meglévő + {len(_NEW)} új; 2 kihagyva)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
