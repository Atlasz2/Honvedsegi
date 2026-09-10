"""Kiterjesztett riasztások meglévő adatból (a képesítés-lejáratokon túl).

- Igazolatlan távollétek (a napi létszámból), az elmúlt N napból.
- Készenléti rés: aktív állomány érvényes képesítés nélkül.
"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import select

from ..core.dependencies import DB, Reader
from ..models import AttendanceModel, PersonModel, PersonnelQualificationModel

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


_ACTIVE_STATUS = "Aktív"


@router.get("/unexcused")
def unexcused_absences(db: DB, _: Reader, days: int = Query(30, ge=1, le=365)):
    """Igazolatlan távollétek az elmúlt N napból."""
    since = (date.today() - timedelta(days=days)).isoformat()
    records = db.scalars(
        select(AttendanceModel).where(
            AttendanceModel.status == "Igazolatlan távollét",
            AttendanceModel.date >= since,
        )
    ).all()
    persons = {p.id: p for p in db.scalars(select(PersonModel)).all()}

    result = []
    for record in records:
        person = persons.get(record.personnel_id)
        result.append({
            "personnelId": record.personnel_id,
            "name": person.name if person else record.personnel_id,
            "rank": person.rank if person else "",
            "unit": person.unit if person else "",
            "date": record.date,
            "note": record.note,
        })
    result.sort(key=lambda x: x["date"], reverse=True)
    return result


@router.get("/readiness-gaps")
def readiness_gaps(db: DB, _: Reader):
    """Aktív állomány, akinek NINCS érvényes (nem lejárt) képesítése."""
    today = date.today().isoformat()
    valid_holders: set[str] = set()
    rows = db.execute(
        select(PersonnelQualificationModel.personnel_id, PersonnelQualificationModel.expiry_date)
    ).all()
    for personnel_id, expiry in rows:
        if expiry and expiry[:10] < today:
            continue
        valid_holders.add(personnel_id)

    persons = db.scalars(select(PersonModel).where(PersonModel.status == _ACTIVE_STATUS)).all()
    gaps = [
        {"personnelId": p.id, "name": p.name, "rank": p.rank, "unit": p.unit}
        for p in persons if p.id not in valid_holders
    ]
    gaps.sort(key=lambda x: (x["unit"], x["name"].lower()))
    return gaps
