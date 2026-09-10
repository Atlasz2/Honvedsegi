"""Szabadság- és távollét-kezelés, jóváhagyási folyamattal.

A jóváhagyott kérelmek automatikusan megjelennek a napi létszámjelentésben (A1):
a lefedett napokon a katona alapból a kérelem típusának megfelelő állapotú lesz,
hacsak az ügyintéző felül nem írja az adott napra.
"""
from __future__ import annotations

from datetime import date as date_cls

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from ..audit import record_activity
from ..core.dependencies import DB, Reader, Editor
from ..core.time import utc_now
from ..models import LeaveRequestModel, PersonModel, new_id
from ..schemas import LeaveDecision, LeaveRequestCreate, LeaveRequestRead

router = APIRouter(prefix="/api/leave", tags=["leave"])

MODULE = "Szabadság"


def _snapshot(leave: LeaveRequestModel) -> dict:
    return {
        "personnelId": leave.personnel_id,
        "type": leave.type,
        "startDate": leave.start_date,
        "endDate": leave.end_date,
        "reason": leave.reason,
        "status": leave.status,
        "decidedBy": leave.decided_by or "",
    }



def _parse_day(value: str) -> str:
    try:
        return date_cls.fromisoformat(value).isoformat()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="A dátum formátuma: ÉÉÉÉ-HH-NN")


def _day_count(start: str, end: str) -> int:
    return (date_cls.fromisoformat(end) - date_cls.fromisoformat(start)).days + 1


def _serialize(leave: LeaveRequestModel, person_name: str) -> LeaveRequestRead:
    return LeaveRequestRead(
        id=leave.id,
        personnelId=leave.personnel_id,
        personName=person_name,
        type=leave.type,
        startDate=leave.start_date,
        endDate=leave.end_date,
        days=_day_count(leave.start_date, leave.end_date),
        reason=leave.reason,
        status=leave.status,
        requestedBy=leave.requested_by,
        decidedBy=leave.decided_by,
        decidedAt=leave.decided_at,
        createdAt=leave.created_at,
    )


@router.get("", response_model=list[LeaveRequestRead])
def list_leave(db: DB, _: Reader, status_filter: str = Query("", alias="status"), personnel_id: str = ""):
    query = select(LeaveRequestModel)
    if status_filter.strip():
        query = query.where(LeaveRequestModel.status == status_filter.strip())
    if personnel_id.strip():
        query = query.where(LeaveRequestModel.personnel_id == personnel_id.strip())
    leaves = db.scalars(query.order_by(LeaveRequestModel.created_at.desc())).all()

    # Nevek egyetlen lekérdezéssel (nincs N+1).
    names = dict(db.execute(select(PersonModel.id, PersonModel.name)).all())
    return [_serialize(leave, names.get(leave.personnel_id, "")) for leave in leaves]


@router.post("", response_model=LeaveRequestRead, status_code=status.HTTP_201_CREATED)
def create_leave(payload: LeaveRequestCreate, db: DB, user: Editor):
    person = db.get(PersonModel, payload.personnelId)
    if not person:
        raise HTTPException(status_code=400, detail="Ismeretlen személy")
    start = _parse_day(payload.startDate)
    end = _parse_day(payload.endDate)
    if end < start:
        raise HTTPException(status_code=400, detail="A távollét vége nem lehet korábban a kezdeténél")

    leave = LeaveRequestModel(
        id=new_id(), personnel_id=person.id, type=payload.type,
        start_date=start, end_date=end, reason=payload.reason,
        status="Beadva", requested_by=user.username,
    )
    db.add(leave)
    db.flush()
    record_activity(db, user, mode="create", module=MODULE, record_name=person.name,
                    entity="leave", after=_snapshot(leave))
    db.commit()
    db.refresh(leave)
    return _serialize(leave, person.name)


@router.post("/{leave_id}/decision", response_model=LeaveRequestRead)
def decide_leave(leave_id: str, payload: LeaveDecision, db: DB, user: Editor):
    leave = db.get(LeaveRequestModel, leave_id)
    if not leave:
        raise HTTPException(status_code=404, detail="A kérelem nem található")
    before = _snapshot(leave)
    leave.status = "Jóváhagyva" if payload.approve else "Elutasítva"
    leave.decided_by = user.username
    leave.decided_at = utc_now()

    person = db.get(PersonModel, leave.personnel_id)
    record_activity(db, user, mode="update", module=MODULE,
                    record_name=person.name if person else leave.personnel_id,
                    entity="leave", before=before, after=_snapshot(leave))
    db.commit()
    db.refresh(leave)
    return _serialize(leave, person.name if person else "")


@router.delete("/{leave_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_leave(leave_id: str, db: DB, user: Editor):
    leave = db.get(LeaveRequestModel, leave_id)
    if not leave:
        raise HTTPException(status_code=404, detail="A kérelem nem található")
    person = db.get(PersonModel, leave.personnel_id)
    record_activity(db, user, mode="delete", module=MODULE,
                    record_name=person.name if person else leave.personnel_id,
                    entity="leave", before=_snapshot(leave))
    db.delete(leave)
    db.commit()
