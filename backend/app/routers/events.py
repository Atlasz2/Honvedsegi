from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ..appliers import apply_event
from ..core.dependencies import DB, Reader, Editor
from ..models import EventModel, ParticipantModel, new_id
from ..participants import load_participants_by_event, sync_participants
from ..repository import require_model
from ..schemas import (
    EventCreate, EventRead, EventUpdate,
    ParticipantCreate, ParticipantRead, ParticipantUpdate,
)
from ..serializers import serialize_event

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=list[EventRead])
def list_events(db: DB, _: Reader):
    items = db.scalars(select(EventModel).order_by(EventModel.start_date)).all()
    participants_by_event = load_participants_by_event(db, "event")
    return [serialize_event(db, i, participants_by_event.get(i.id, [])) for i in items]


@router.post("", response_model=EventRead, status_code=status.HTTP_201_CREATED)
def create_event(payload: EventCreate, db: DB, _: Editor):
    item = EventModel()
    apply_event(item, payload)
    db.add(item)
    db.flush()
    sync_participants(db, "event", item.id, payload.assigned)
    db.commit()
    db.refresh(item)
    return serialize_event(db, item)


@router.put("/{item_id}", response_model=EventRead)
def update_event(item_id: str, payload: EventUpdate, db: DB, _: Editor):
    item = require_model(db, EventModel, item_id)
    apply_event(item, payload)
    sync_participants(db, "event", item_id, payload.assigned)
    db.commit()
    db.refresh(item)
    return serialize_event(db, item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(item_id: str, db: DB, _: Editor):
    item = require_model(db, EventModel, item_id)
    sync_participants(db, "event", item_id, [])
    db.delete(item)
    db.commit()


# ── Résztvevő-kezelés ─────────────────────────────────────────────────────────

@router.get("/{item_id}/participants", response_model=list[ParticipantRead])
def list_participants(item_id: str, db: DB, _: Reader):
    require_model(db, EventModel, item_id)
    rows = db.scalars(
        select(ParticipantModel)
        .where(ParticipantModel.event_type == "event", ParticipantModel.event_id == item_id)
        .order_by(ParticipantModel.person_name)
    ).all()
    return [ParticipantRead(
        id=p.id, personnelId=p.personnel_id, personName=p.person_name,
        rank=p.rank, rankShort=p.rank_short, sztsz=p.sztsz,
        role=p.role, status=p.status, qualificationApproved=p.qualification_approved, notes=p.notes,
    ) for p in rows]


@router.post("/{item_id}/participants", response_model=ParticipantRead, status_code=status.HTTP_201_CREATED)
def add_participant(item_id: str, body: ParticipantCreate, db: DB, _: Editor):
    require_model(db, EventModel, item_id)
    existing = db.execute(
        select(ParticipantModel).where(
            ParticipantModel.event_type == "event",
            ParticipantModel.event_id == item_id,
            ParticipantModel.personnel_id == body.personnelId,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Ez a személy már hozzá van rendelve")
    p = ParticipantModel(
        id=new_id(), event_type="event", event_id=item_id,
        personnel_id=body.personnelId, person_name=body.personName,
        rank=body.rank, rank_short=body.rankShort, sztsz=body.sztsz,
        role=body.role, status=body.status,
        qualification_approved=body.qualificationApproved, notes=body.notes,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return ParticipantRead(
        id=p.id, personnelId=p.personnel_id, personName=p.person_name,
        rank=p.rank, rankShort=p.rank_short, sztsz=p.sztsz,
        role=p.role, status=p.status, qualificationApproved=p.qualification_approved, notes=p.notes,
    )


@router.put("/{item_id}/participants/{participant_id}", response_model=ParticipantRead)
def update_participant(item_id: str, participant_id: str, body: ParticipantUpdate, db: DB, _: Editor):
    p = db.execute(
        select(ParticipantModel).where(
            ParticipantModel.id == participant_id,
            ParticipantModel.event_type == "event",
            ParticipantModel.event_id == item_id,
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    p.status = body.status
    p.role = body.role
    p.notes = body.notes
    db.commit()
    db.refresh(p)
    return ParticipantRead(
        id=p.id, personnelId=p.personnel_id, personName=p.person_name,
        rank=p.rank, rankShort=p.rank_short, sztsz=p.sztsz,
        role=p.role, status=p.status, qualificationApproved=p.qualification_approved, notes=p.notes,
    )


@router.delete("/{item_id}/participants/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_participant(item_id: str, participant_id: str, db: DB, _: Editor):
    p = db.execute(
        select(ParticipantModel).where(
            ParticipantModel.id == participant_id,
            ParticipantModel.event_type == "event",
            ParticipantModel.event_id == item_id,
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    db.delete(p)
    db.commit()
