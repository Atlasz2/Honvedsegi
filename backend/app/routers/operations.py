from __future__ import annotations
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from ..db import get_db
from ..deps import _get_current_user, _parse_iso_date, _serialize_exercise, _serialize_training, _utc_now
from ..models import DutyModel, ExerciseModel, ParticipantModel, TrainingModel, UserModel
from ..schemas import OperationRead

router = APIRouter(prefix="/api/operations", tags=["operations"])


@router.get("", response_model=list[OperationRead])
def list_operations(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    exercises = db.scalars(select(ExerciseModel).order_by(ExerciseModel.start_date)).all()
    trainings = db.scalars(select(TrainingModel).order_by(TrainingModel.start_date)).all()
    ops = []
    for ex in exercises:
        ser = _serialize_exercise(db, ex)
        ops.append(OperationRead(
            id=ex.id, name=ex.name, type=ex.type, operationType="exercise",
            startDate=ex.start_date, endDate=ex.end_date, location=ex.location,
            organizer=None, maxPersonnel=ex.max_personnel, description=ex.description,
            status=ex.status, assigned=ser.assigned,
        ))
    for tr in trainings:
        ser = _serialize_training(db, tr)
        ops.append(OperationRead(
            id=tr.id, name=tr.name, type=tr.type, operationType="training",
            startDate=tr.start_date, endDate=tr.end_date, location=tr.location,
            organizer=tr.organizer or "", maxPersonnel=tr.max_personnel,
            description=tr.description, status=tr.status, assigned=ser.assigned,
        ))
    ops.sort(key=lambda x: x.startDate)
    return ops


@router.get("/summary")
def operations_summary(
    base_date: str | None = None,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_get_current_user),
):
    if base_date:
        parsed = _parse_iso_date(base_date)
        if not parsed:
            raise HTTPException(status_code=400, detail="Ervenytelen base_date formatum")
        base = parsed
    else:
        base = _utc_now().date()

    next_week_end = base + timedelta(days=7)
    plus14_day = base + timedelta(days=14)

    exercises = db.scalars(
        select(ExerciseModel).where(ExerciseModel.status.in_(["Tervezett", "Folyamatban"]))
    ).all()
    duties = db.scalars(
        select(DutyModel).where(DutyModel.status.in_(["Tervezett", "Teljesitett"]))
    ).all()

    shooting_kw = ["lőtér", "loter"]
    next_week_shooting = []
    for item in exercises:
        start = _parse_iso_date(item.start_date)
        end = _parse_iso_date(item.end_date)
        if not start or not end or end < base or start > next_week_end:
            continue
        if not any(kw in (item.location or "").lower() for kw in shooting_kw):
            continue
        participant_count = db.execute(
            select(func.count()).select_from(ParticipantModel).where(
                ParticipantModel.event_type == "exercise",
                ParticipantModel.event_id == item.id,
            )
        ).scalar() or 0
        next_week_shooting.append({
            "id": item.id, "name": item.name, "startDate": item.start_date,
            "endDate": item.end_date, "location": item.location, "status": item.status,
            "assignedCount": participant_count, "maxPersonnel": item.max_personnel,
        })

    plus14_duties = []
    for item in duties:
        start = _parse_iso_date(item.start_date)
        end = _parse_iso_date(item.end_date)
        if not start or not end:
            continue
        if start <= plus14_day <= end:
            plus14_duties.append({
                "id": item.id, "type": item.type, "startDate": item.start_date,
                "endDate": item.end_date, "location": item.location,
                "personId": item.person_id, "personName": item.person_name, "status": item.status,
            })

    return {
        "baseDate": base.isoformat(), "nextWeekEnd": next_week_end.isoformat(),
        "plus14Date": plus14_day.isoformat(),
        "nextWeekShooting": {"count": len(next_week_shooting), "items": sorted(next_week_shooting, key=lambda x: x["startDate"])},
        "plus14Duties": {"count": len(plus14_duties), "items": sorted(plus14_duties, key=lambda x: x["startDate"])},
    }
