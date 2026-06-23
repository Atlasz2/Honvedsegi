"""Demó személyzet feltöltése (alapból ~1500 fő, ~90% tartalékos).

Futtatás a backend/ könyvtárból:
    ../.venv/Scripts/python.exe populate_personnel.py [cél_összlétszám]

A megadott ÖSSZlétszámra tölt fel (alapból 1500). Ha már annyi vagy több van,
nem csinál semmit. A meglévő rekordokat nem törli. Az SZTSz egyedi marad.
"""
from __future__ import annotations

import random
import sys

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import PersonModel, new_id

DEFAULT_TARGET = 1500
RESERVE_RATIO = 0.90

_SURNAMES = [
    "Nagy", "Kovács", "Tóth", "Szabó", "Horváth", "Varga", "Kiss", "Molnár",
    "Németh", "Farkas", "Balogh", "Papp", "Takács", "Juhász", "Mészáros",
    "Simon", "Rácz", "Fekete", "Szilágyi", "Török", "Fehér", "Gál", "Szűcs",
    "Kocsis", "Pintér", "Fodor", "Sipos", "Lukács", "Király", "Jakab",
    "Gulyás", "Orosz", "Vincze", "Hegedűs", "Bognár", "Boros", "Pap", "Antal",
]
_MALE_NAMES = [
    "László", "István", "József", "János", "Zoltán", "Sándor", "Gábor",
    "Ferenc", "Attila", "Péter", "Tamás", "Tibor", "Csaba", "Zsolt", "András",
    "Lajos", "Mihály", "Béla", "György", "Dániel", "Máté", "Bence", "Ádám",
    "Levente", "Krisztián", "Norbert", "Róbert", "Gergő", "Márk", "Balázs",
]
_FEMALE_NAMES = [
    "Mária", "Katalin", "Éva", "Anna", "Zsuzsanna", "Judit", "Andrea",
    "Krisztina", "Ágnes", "Eszter", "Gabriella", "Tímea", "Viktória", "Réka",
    "Anita", "Nikolett", "Petra", "Dóra", "Fanni", "Boglárka",
]
# Tartalékos egységnél a legénységi és altiszti állomány a jellemző.
_RANKS = (
    ["honvéd"] * 10 + ["őrvezető"] * 8 + ["tizedes"] * 6 + ["szakaszvezető"] * 5
    + ["őrmester"] * 4 + ["törzsőrmester"] * 2 + ["főtörzsőrmester"] * 1
    + ["zászlós"] * 1 + ["hadnagy"] * 1 + ["főhadnagy"] * 1 + ["százados"] * 1
)
_UNITS = [
    "1. lövészszázad", "2. lövészszázad", "3. lövészszázad",
    "Törzsszázad", "Támogató század", "Logisztikai század",
]
_BEOSZTAS = [
    "lövész", "rajparancsnok", "szakaszparancsnok", "gépkocsivezető",
    "híradós", "egészségügyi katona", "lőszerkezelő", "szakács", "raktáros",
]


def _unique_sztsz(rng: random.Random, used: set[str]) -> str:
    while True:
        candidate = f"{rng.randint(10_000_000, 99_999_999)}"
        if candidate not in used:
            used.add(candidate)
            return candidate


def _make_person(rng: random.Random, used: set[str], status: str) -> PersonModel:
    if rng.random() < 0.12:
        given = rng.choice(_FEMALE_NAMES)
    else:
        given = rng.choice(_MALE_NAMES)
    name = f"{rng.choice(_SURNAMES)} {given}"
    birth_year = rng.randint(1975, 2004)
    join_year = rng.randint(2015, 2025)
    return PersonModel(
        id=new_id(),
        name=name,
        sztsz=_unique_sztsz(rng, used),
        rank=rng.choice(_RANKS),
        unit=rng.choice(_UNITS),
        beosztas=rng.choice(_BEOSZTAS),
        status=status,
        email="",
        phone="",
        birth_date=f"{birth_year}-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}",
        address="",
        join_date=f"{join_year}-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}",
        notes="",
        qualifications=[],
    )


def main() -> int:
    target = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TARGET
    rng = random.Random(20260617)

    with SessionLocal() as db:
        existing = db.scalar(select(func.count()).select_from(PersonModel)) or 0
        to_add = target - existing
        if to_add <= 0:
            print(f"Már {existing} fő van (cél: {target}) — nincs teendő.")
            return 0

        used = set(db.scalars(select(PersonModel.sztsz)).all())
        reserve_count = round(to_add * RESERVE_RATIO)
        statuses = (
            ["Tartalékos"] * reserve_count
            + ["Aktív"] * (to_add - reserve_count - (to_add // 20))
            + ["Szabadságon"] * (to_add // 20)
        )
        # Pótlás kerekítési maradékra, hogy pontosan to_add legyen.
        statuses += ["Aktív"] * (to_add - len(statuses))
        rng.shuffle(statuses)

        db.add_all([_make_person(rng, used, status) for status in statuses])
        db.commit()
        total = db.scalar(select(func.count()).select_from(PersonModel)) or 0

    print(f"Hozzáadva: {to_add} fő (ebből {reserve_count} tartalékos). Összlétszám: {total}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
