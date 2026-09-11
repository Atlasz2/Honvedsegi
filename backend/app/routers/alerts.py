"""Kiterjesztett riasztások meglévő adatból (a képesítés-lejáratokon túl).

- Igazolatlan távollétek (a napi létszámból), az elmúlt N napból.
- Készenléti rés: aktív állomány érvényes képesítés nélkül.
- Szabadság-minimum: aktív állomány, aki idén nem érte el a kötelező napszámot.
- Alapkiképzés-határidő: tartalékos, akinek a szerződéstől számított egy éven
  belül nem lett meg minden modul.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import select

from ..constants import BASIC_TRAINING_CATEGORY, BASIC_TRAINING_DEADLINE_DAYS, LEAVE_MINIMUM_DAYS
from ..core.dependencies import DB, Reader
from ..models import (
    AttendanceModel,
    LeaveRequestModel,
    PersonModel,
    PersonnelQualificationModel,
    QualificationTypeModel,
)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


_ACTIVE_STATUS = "Aktív"
_RESERVE_STATUS = "Tartalékos"
_LEAVE_TYPE = "Szabadság"
_APPROVED = "Jóváhagyva"


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


def _workdays_between(start: date, end: date) -> int:
    """Hétfő–péntek napok száma a zárt [start, end] intervallumban (ünnepnap nélkül)."""
    if end < start:
        return 0
    full_weeks, remainder = divmod((end - start).days + 1, 7)
    days = full_weeks * 5
    for offset in range(remainder):
        if (start + timedelta(days=offset)).weekday() < 5:
            days += 1
    return days


@router.get("/leave-minimum")
def leave_minimum(
    db: DB,
    _: Reader,
    year: int | None = Query(None, ge=2000, le=2100),
    min_days: int = Query(LEAVE_MINIMUM_DAYS, ge=1, le=366),
):
    """Aktív állomány, aki az adott évben még nem vett ki `min_days` munkanap
    jóváhagyott szabadságot. A 0 napos is szerepel — pont ők a lényeg."""
    year = year or date.today().year
    year_start, year_end = date(year, 1, 1), date(year, 12, 31)

    taken: dict[str, int] = defaultdict(int)
    leaves = db.scalars(
        select(LeaveRequestModel).where(
            LeaveRequestModel.type == _LEAVE_TYPE,
            LeaveRequestModel.status == _APPROVED,
            LeaveRequestModel.start_date <= year_end.isoformat(),
            LeaveRequestModel.end_date >= year_start.isoformat(),
        )
    ).all()
    for leave in leaves:
        start = max(date.fromisoformat(leave.start_date), year_start)
        end = min(date.fromisoformat(leave.end_date), year_end)
        taken[leave.personnel_id] += _workdays_between(start, end)

    persons = db.scalars(select(PersonModel).where(PersonModel.status == _ACTIVE_STATUS)).all()
    result = [
        {
            "personnelId": p.id, "name": p.name, "rank": p.rank, "unit": p.unit,
            "takenDays": taken[p.id], "missingDays": min_days - taken[p.id],
        }
        for p in persons if taken[p.id] < min_days
    ]
    result.sort(key=lambda x: (x["takenDays"], x["unit"], x["name"].lower()))
    return {"year": year, "minDays": min_days, "items": result}


@router.get("/basic-training")
def basic_training_deadline(
    db: DB,
    _: Reader,
    deadline_days: int = Query(BASIC_TRAINING_DEADLINE_DAYS, ge=1, le=3650),
):
    """Tartalékosok, akiknek nincs meg minden alapkiképzési modul. A határidő a
    jogviszony kezdete (join_date) + `deadline_days`; lejárt határidő = leszerelendő.

    Modul = a BASIC_TRAINING_CATEGORY kategóriájú képesítés-típus; a teljesítés a
    személy megszerzett képesítése (lejárat nem számít, az alapkiképzés nem évül)."""
    modules = db.scalars(
        select(QualificationTypeModel)
        .where(QualificationTypeModel.category == BASIC_TRAINING_CATEGORY)
        .order_by(QualificationTypeModel.name)
    ).all()
    module_ids = [m.id for m in modules]
    module_names = {m.id: m.name for m in modules}
    if not module_ids:
        return {"modules": [], "deadlineDays": deadline_days, "items": []}

    completed: dict[str, set[str]] = defaultdict(set)
    rows = db.execute(
        select(PersonnelQualificationModel.personnel_id, PersonnelQualificationModel.qual_type_id)
        .where(PersonnelQualificationModel.qual_type_id.in_(module_ids))
    ).all()
    for personnel_id, qual_type_id in rows:
        completed[personnel_id].add(qual_type_id)

    today = date.today()
    items = []
    for p in db.scalars(select(PersonModel).where(PersonModel.status == _RESERVE_STATUS)).all():
        done = completed[p.id]
        if len(done) >= len(module_ids):
            continue
        deadline = days_left = None
        if p.join_date:
            deadline = date.fromisoformat(p.join_date[:10]) + timedelta(days=deadline_days)
            days_left = (deadline - today).days
        items.append({
            "personnelId": p.id, "name": p.name, "rank": p.rank, "unit": p.unit,
            "joinDate": p.join_date,
            "deadline": deadline.isoformat() if deadline else None,
            "daysLeft": days_left,
            "completedModules": len(done),
            "totalModules": len(module_ids),
            "missingModules": [module_names[m] for m in module_ids if m not in done],
        })
    # Lejárt és sürgős elöl; akinél nincs jogviszony-kezdet, a végén (nem számolható).
    items.sort(key=lambda x: (x["daysLeft"] is None, x["daysLeft"] if x["daysLeft"] is not None else 0, x["name"].lower()))
    return {
        "modules": [{"id": m.id, "name": m.name} for m in modules],
        "deadlineDays": deadline_days,
        "items": items,
    }
