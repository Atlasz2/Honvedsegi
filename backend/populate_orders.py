"""Demó parancstípusok és néhány folyamatban lévő parancs a Parancsok oldalhoz.

Futtatás a backend/ könyvtárból:
    ../.venv/Scripts/python.exe populate_orders.py

Idempotens: a már létező típusneveket nem hozza létre újra, és csak akkor
gyárt demo-parancsokat, ha még egy sincs. A fejezet-sorrend az 1. betekintésen
leírt folyamat (ügyvitel → jog → kiképzés/személyügy → személyügy → pénzügy →
jog → ellenjegyzés); a valós típusokat a C/3-4 kérdések válaszai adják.
"""
from __future__ import annotations

import random
from datetime import date, timedelta

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import OrderChapterModel, OrderModel, OrderTypeModel, PersonModel, new_id

TYPES = {
    "Leszerelési parancs": [
        ("Bevezető rész", "Ügyvitel", True),
        ("Jogi megalapozás", "Jog", True),
        ("Kiképzési záradék", "Kiképzés", False),
        ("Személyügyi rész", "Személyügy", True),
        ("Pénzügyi elszámolás", "Pénzügy", True),
        ("Jogi ellenőrzés", "Jog", True),
        ("Ellenjegyzés", "Ellenjegyzés", True),
    ],
    "Vezénylési parancs": [
        ("Bevezető rész", "Ügyvitel", True),
        ("Jogi megalapozás", "Jog", True),
        ("Kiképzési rész", "Kiképzés", True),
        ("Személyügyi rész", "Személyügy", True),
        ("Ellenjegyzés", "Ellenjegyzés", True),
    ],
    "Behívóparancs": [
        ("Bevezető rész", "Ügyvitel", True),
        ("Kiképzési rész", "Kiképzés", True),
        ("Személyügyi rész", "Személyügy", True),
        ("Pénzügyi rész", "Pénzügy", True),
        ("Ellenjegyzés", "Ellenjegyzés", True),
    ],
}


def main() -> int:
    rng = random.Random(20260911)
    today = date.today()
    with SessionLocal() as db:
        existing = {t.name: t for t in db.scalars(select(OrderTypeModel)).all()}
        for name, chapters in TYPES.items():
            if name in existing:
                continue
            item = OrderTypeModel(
                id=new_id(), name=name,
                chapters=[{"name": n, "responsible": r, "required": q} for n, r, q in chapters],
            )
            db.add(item)
            existing[name] = item
        db.flush()

        if db.scalar(select(func.count()).select_from(OrderModel)):
            db.commit()
            print("Parancstípusok rendben; demo-parancs már van, nem hozok létre újat.")
            return 0

        persons = db.scalars(select(PersonModel).where(PersonModel.status != "Leszerelt").limit(200)).all()
        rng.shuffle(persons)
        scenarios = [
            ("Leszerelési parancs", "leszerelése", 3),   # 3 fejezet kész → a Személyügynél áll
            ("Leszerelési parancs", "leszerelése", 1),   # a Jognál áll, lejárt határidővel
            ("Vezénylési parancs", "vezénylése", 4),     # csak az Ellenjegyzés van hátra
            ("Behívóparancs", "behívása", 0),            # most indult
            ("Vezénylési parancs", "vezénylése", 2),
        ]
        for index, (type_name, verb, done) in enumerate(scenarios):
            order_type = existing[type_name]
            person = persons[index] if index < len(persons) else None
            due = today + timedelta(days=rng.choice([-5, 3, 10, 21]))
            order = OrderModel(
                id=new_id(), order_type_id=order_type.id, type_name=type_name,
                subject=f"{person.name} {verb}" if person else f"{type_name} minta {index + 1}",
                personnel_id=person.id if person else "", person_name=person.name if person else "",
                due_date=due.isoformat(), created_by="demo",
            )
            db.add(order)
            for position, ch in enumerate(order_type.chapters):
                status = "Kész" if position < done else ("Folyamatban" if position == done else "Nincs elkezdve")
                db.add(OrderChapterModel(
                    id=new_id(), order_id=order.id, position=position,
                    name=ch["name"], responsible=ch["responsible"], required=ch["required"],
                    status=status,
                    assignee="Kovácsné" if status != "Nincs elkezdve" else "",
                    due_date=(today + timedelta(days=position * 3 - 4)).isoformat() if status != "Kész" else "",
                ))
        db.commit()
        print(f"Parancstípusok: {len(existing)}, demo-parancs: {len(scenarios)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
