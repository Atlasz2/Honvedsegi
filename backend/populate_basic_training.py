"""Demó alapkiképzés: a 11 modul mint képesítés-típus, és részleges teljesítés
a tartalékosoknál — hogy az „Alapkiképzés-határidő" riasztásnak legyen adata.

Futtatás a backend/ könyvtárból:
    ../.venv/Scripts/python.exe populate_basic_training.py

Idempotens: a meglévő modul-típusokat és kiadott képesítéseket nem duplikálja.
Csak olyan tartalékosnak ad, akinek még nincs egyetlen modulja sem. Ahol
hiányzik a jogviszony kezdete, az elmúlt ~2 évből sorsol egyet, hogy a
határidő számolható legyen.
"""
from __future__ import annotations

import random
from datetime import date, timedelta

from sqlalchemy import select

from app.constants import BASIC_TRAINING_CATEGORY
from app.models import PersonModel, PersonnelQualificationModel, QualificationTypeModel
from app.db import SessionLocal

MODULES = [
    "Alapkiképzés 01 – Alaki",
    "Alapkiképzés 02 – Általános lőkiképzés",
    "Alapkiképzés 03 – Harcászat",
    "Alapkiképzés 04 – Műszaki",
    "Alapkiképzés 05 – Egészségügyi",
    "Alapkiképzés 06 – ABV védelem",
    "Alapkiképzés 07 – Térképészet",
    "Alapkiképzés 08 – Híradó",
    "Alapkiképzés 09 – Szolgálati szabályzat",
    "Alapkiképzés 10 – Fizikai felkészítés",
    "Alapkiképzés 11 – Záróvizsga",
]


def _ensure_modules(db) -> list[QualificationTypeModel]:
    existing = {t.name: t for t in db.scalars(select(QualificationTypeModel)).all()}
    modules = []
    for name in MODULES:
        item = existing.get(name)
        if item is None:
            item = QualificationTypeModel(name=name, category=BASIC_TRAINING_CATEGORY, validity_days=None)
            db.add(item)
        modules.append(item)
    db.flush()
    return modules


def main() -> int:
    rng = random.Random(20260911)
    today = date.today()
    with SessionLocal() as db:
        modules = _ensure_modules(db)
        module_ids = {m.id for m in modules}
        already = {
            pid for (pid,) in db.execute(
                select(PersonnelQualificationModel.personnel_id)
                .where(PersonnelQualificationModel.qual_type_id.in_(module_ids))
            )
        }
        reservists = db.scalars(select(PersonModel).where(PersonModel.status == "Tartalékos")).all()

        granted = 0
        for person in reservists:
            if person.id in already:
                continue
            if not person.join_date:
                person.join_date = (today - timedelta(days=rng.randint(30, 730))).isoformat()
            join = date.fromisoformat(person.join_date[:10])
            # ~60% teljes, ~25% részleges, ~15% semmi — így lesz lejárt és sürgős is.
            roll = rng.random()
            done = 11 if roll < 0.6 else rng.randint(1, 10) if roll < 0.85 else 0
            for module in modules[:done]:
                earned = join + timedelta(days=rng.randint(7, 300))
                db.add(PersonnelQualificationModel(
                    personnel_id=person.id, qual_type_id=module.id,
                    earned_date=min(earned, today).isoformat(), expiry_date=None,
                ))
                granted += 1
        db.commit()
        print(f"Modulok: {len(modules)}, tartalékos: {len(reservists)}, új kiadott képesítés: {granted}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
