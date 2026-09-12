"""Gyorskereső (Ctrl+K): név vagy SZTSZ → személy, parancs, művelet.

Egy kérés, három rövid lista; ékezet-érzéketlen részleges egyezés. A találat
csak annyi adatot visz, amennyi a megnyitáshoz kell — a részlet a saját oldalán
töltődik.
"""
from __future__ import annotations

import re
import unicodedata

from fastapi import APIRouter, Query
from sqlalchemy import or_, select

from ..core.dependencies import DB, Reader
from ..models import ExerciseModel, OrderModel, PersonModel, TrainingModel

router = APIRouter(prefix="/api/search", tags=["search"])

_LIMIT = 8


def _fold(value: str) -> str:
    stripped = "".join(ch for ch in unicodedata.normalize("NFD", value or "") if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", stripped).strip().lower()


def _like(column, needle: str):
    return column.ilike(f"%{needle}%")


@router.get("")
def quick_search(db: DB, _: Reader, q: str = Query("", min_length=0, max_length=80)):
    needle = q.strip()
    if len(needle) < 2:
        return {"persons": [], "orders": [], "operations": []}
    folded = _fold(needle)

    # Személyek: SZTSZ pontos/részleges, vagy név. Az ékezet-érzéketlenséghez a
    # SQL-szűrés bő, a Python-szűrés pontosít (az állomány ~2000 fő, ez olcsó).
    person_rows = db.execute(
        select(PersonModel.id, PersonModel.name, PersonModel.sztsz, PersonModel.rank, PersonModel.unit, PersonModel.status)
        .where(PersonModel.status != "Leszerelt")
        .order_by(PersonModel.name)
    ).all()
    persons = [
        {"id": i, "name": n, "sztsz": s, "rank": r, "unit": u, "status": st}
        for i, n, s, r, u, st in person_rows
        if folded in _fold(n) or needle.upper().replace(" ", "") in (s or "").upper()
    ][:_LIMIT]

    orders = [
        {"id": o.id, "number": o.number or "", "subject": o.subject, "typeName": o.type_name, "status": o.status}
        for o in db.scalars(
            select(OrderModel)
            .where(or_(_like(OrderModel.subject, needle), _like(OrderModel.number, needle), _like(OrderModel.person_name, needle)))
            .order_by(OrderModel.created_at.desc()).limit(_LIMIT)
        ).all()
    ]

    operations = []
    for source, model in (("exercise", ExerciseModel), ("training", TrainingModel)):
        for item in db.scalars(
            select(model).where(or_(_like(model.name, needle), _like(model.location, needle)))
            .order_by(model.start_date.desc()).limit(_LIMIT)
        ).all():
            operations.append({"id": item.id, "source": source, "name": item.name, "type": item.type,
                               "startDate": item.start_date, "status": item.status})
    operations.sort(key=lambda x: x["startDate"], reverse=True)
    return {"persons": persons, "orders": orders, "operations": operations[:_LIMIT]}
