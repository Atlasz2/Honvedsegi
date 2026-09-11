"""Demó parancstípusok (fejezet-sablonokkal és aláírókkal) és néhány folyamatban
lévő parancs a Parancsok oldalhoz.

Futtatás a backend/ könyvtárból:
    ../.venv/Scripts/python.exe populate_orders.py [--reset]

Idempotens: a már létező típusneveket nem hozza létre újra, és csak akkor
gyárt demo-parancsokat, ha még egy sincs. `--reset`: törli az összes parancsot
és típust, és újraépíti (a régi, „Ellenjegyzés" fejezetes demóhoz).

A sablon-szövegek ÁLTALÁNOS minták — a valós szövegezést a C/3-4 kérdésekre
kapott anonimizált minták adják.
"""
from __future__ import annotations

import random
import sys
from datetime import date, timedelta

from sqlalchemy import delete, func, select

from app.db import SessionLocal
from app.models import OrderChapterModel, OrderModel, OrderTypeModel, PersonModel, new_id
from app.constants import ORDER_DEFAULT_ISSUER

SIGNERS = ["Parancsnok", "Törzsfőnök", "Személyügyi főnök"]

TYPES = {
    "Leszerelési parancs": [
        ("Bevezető rész", "Ügyvitel", True,
         "{{rendfokozat}} {{név}} ({{sztsz}}) {{alegység}} állományú tartalékos katona szolgálati viszonyának megszüntetése tárgyában az alábbi parancsot adom ki."),
        ("Jogi megalapozás", "Jog", True,
         "A szolgálati viszony megszűnésének jogalapja: a honvédek jogállásáról szóló törvény vonatkozó rendelkezései. [A jogi hivatkozásokat a Jog tölti ki.]"),
        ("Kiképzési záradék", "Kiképzés", False,
         "A leszerelő katona kiképzési nyilvántartását le kell zárni; a megszerzett képesítéseket az akta tartalmazza."),
        ("Személyügyi rendelkezések", "Személyügy", True,
         "{{rendfokozat}} {{név}} szolgálati viszonya {{dátum}} napjával megszűnik. A személyi okmányokat, felszerelést a leszerelés napjáig le kell adni."),
        ("Pénzügyi elszámolás", "Pénzügy", True,
         "Az illetmény- és költségtérítési elszámolást a Pénzügy a leszerelés napjáig végrehajtja. [Összegek, jogcímek.]"),
    ],
    "Vezénylési parancs": [
        ("Bevezető rész", "Ügyvitel", True,
         "{{rendfokozat}} {{név}} ({{sztsz}}) vezénylése tárgyában az alábbi parancsot adom ki."),
        ("Jogi megalapozás", "Jog", True, "[A vezénylés jogalapja.]"),
        ("Kiképzési rész", "Kiképzés", True, "[A vezénylés célja, a kiképzési feladat, helyszín, időtartam.]"),
        ("Személyügyi rendelkezések", "Személyügy", True,
         "{{rendfokozat}} {{név}} a vezénylés idejére állományviszonyát megtartja. [Kezdő és záró nap.]"),
    ],
    "Behívóparancs": [
        ("Bevezető rész", "Ügyvitel", True,
         "{{rendfokozat}} {{név}} ({{sztsz}}) önkéntes tartalékos katonát tényleges szolgálatra behívom."),
        ("Kiképzési rész", "Kiképzés", True, "[A gyakorlat megnevezése, helyszíne, kezdete és vége; a bevonulás helye és ideje.]"),
        ("Személyügyi rendelkezések", "Személyügy", True, "[Állományviszony, beosztás a szolgálat idejére.]"),
        ("Pénzügyi rész", "Pénzügy", True, "[Illetmény, utazási költségtérítés.]"),
    ],
}


def _reset(db) -> None:
    db.execute(delete(OrderChapterModel))
    db.execute(delete(OrderModel))
    db.execute(delete(OrderTypeModel))
    db.commit()


def main() -> int:
    rng = random.Random(20260911)
    today = date.today()
    with SessionLocal() as db:
        if "--reset" in sys.argv:
            _reset(db)
        existing = {t.name: t for t in db.scalars(select(OrderTypeModel)).all()}
        for name, chapters in TYPES.items():
            if name in existing:
                continue
            item = OrderTypeModel(
                id=new_id(), name=name, signers=SIGNERS,
                chapters=[{"name": n, "responsible": r, "required": q, "template": t} for n, r, q, t in chapters],
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
        # (típus, ige, kész fejezetek indexei, aláírt db)
        scenarios = [
            ("Leszerelési parancs", "leszerelése", {0, 3}, 0),      # a Jog és a Pénzügy tartja fel
            ("Leszerelési parancs", "leszerelése", {0}, 0),         # lejárt határidő
            ("Vezénylési parancs", "vezénylése", {0, 1, 2, 3}, 1),  # minden kész, 1/3 aláírva
            ("Behívóparancs", "behívása", set(), 0),                # most indult
            ("Vezénylési parancs", "vezénylése", {1, 2}, 0),
        ]
        for index, (type_name, verb, done, signed) in enumerate(scenarios):
            order_type = existing[type_name]
            person = persons[index] if index < len(persons) else None
            due = today + timedelta(days=rng.choice([-5, 3, 10, 21]))
            order = OrderModel(
                id=new_id(), order_type_id=order_type.id, type_name=type_name,
                number=f"{index + 12}/{today.year}", issuer=ORDER_DEFAULT_ISSUER,
                subject=f"{person.name} {verb}" if person else f"{type_name} minta {index + 1}",
                personnel_id=person.id if person else "", person_name=person.name if person else "",
                due_date=due.isoformat(), created_by="demo",
                signatures=[{"role": role, "name": "", "signed": i < signed, "signedAt": today.isoformat() if i < signed else "",
                             "signedBy": "demo" if i < signed else ""} for i, role in enumerate(SIGNERS)],
            )
            all_required_done = all(i in done or not ch["required"] for i, ch in enumerate(order_type.chapters))
            if all_required_done:
                order.status = "Aláírásra vár"
            db.add(order)
            values = {
                "név": person.name if person else "", "rendfokozat": person.rank if person else "",
                "sztsz": person.sztsz if person else "", "alegység": person.unit if person else "",
                "tárgy": order.subject, "dátum": today.isoformat(), "parancsszám": order.number,
            }
            for position, ch in enumerate(order_type.chapters):
                content = ch["template"]
                for key, value in values.items():
                    content = content.replace("{{" + key + "}}", value)
                is_done = position in done
                db.add(OrderChapterModel(
                    id=new_id(), order_id=order.id, position=position,
                    name=ch["name"], responsible=ch["responsible"], required=ch["required"],
                    content=content if is_done else (content if rng.random() < 0.5 else ""),
                    status="Kész" if is_done else rng.choice(["Nincs elkezdve", "Folyamatban"]),
                    assignee="Kovácsné" if is_done else "",
                    due_date=(today + timedelta(days=position * 3 - 4)).isoformat() if not is_done else "",
                ))
        db.commit()
        print(f"Parancstípusok: {len(existing)}, demo-parancs: {len(scenarios)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
