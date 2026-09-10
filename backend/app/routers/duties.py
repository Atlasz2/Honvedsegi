from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ..appliers import apply_duty
from ..core.dependencies import DB, Reader, Editor
from ..models import DutyModel, ParticipantModel, new_id
from ..participants import load_participants_by_event, sync_participants
from ..repository import require_model
from ..schemas import DutyCreate, DutyRead, DutyUpdate, ParticipantCreate, ParticipantRead, ParticipantUpdate
from ..serializers import serialize_duty

router = APIRouter(prefix="/api/duties", tags=["duties"])


@router.get("", response_model=list[DutyRead])
def list_duties(db: DB, _: Reader):
    items = db.scalars(select(DutyModel).order_by(DutyModel.start_date)).all()
    participants_by_event = load_participants_by_event(db, "duty")
    return [serialize_duty(db, i, participants_by_event.get(i.id, [])) for i in items]


@router.post("", response_model=DutyRead, status_code=status.HTTP_201_CREATED)
def create_duty(payload: DutyCreate, db: DB, _: Editor):
    item = DutyModel()
    apply_duty(item, payload)
    db.add(item)
    db.flush()
    assigned = payload.assigned or ([{"personId": payload.personId, "personName": payload.personName}] if payload.personId else [])
    sync_participants(db, "duty", item.id, assigned)
    db.commit()
    db.refresh(item)
    return serialize_duty(db, item)


@router.put("/{item_id}", response_model=DutyRead)
def update_duty(item_id: str, payload: DutyUpdate, db: DB, _: Editor):
    item = require_model(db, DutyModel, item_id)
    apply_duty(item, payload)
    assigned = payload.assigned or ([{"personId": payload.personId, "personName": payload.personName}] if payload.personId else [])
    sync_participants(db, "duty", item_id, assigned)
    db.commit()
    db.refresh(item)
    return serialize_duty(db, item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_duty(item_id: str, db: DB, _: Editor):
    item = require_model(db, DutyModel, item_id)
    sync_participants(db, "duty", item_id, [])
    db.delete(item)
    db.commit()


# ── Résztvevő-kezelés ─────────────────────────────────────────────────────────

@router.get("/{item_id}/participants", response_model=list[ParticipantRead])
def list_participants(item_id: str, db: DB, _: Reader):
    require_model(db, DutyModel, item_id)
    rows = db.scalars(
        select(ParticipantModel)
        .where(ParticipantModel.event_type == "duty", ParticipantModel.event_id == item_id)
        .order_by(ParticipantModel.person_name)
    ).all()
    return [ParticipantRead(
        id=p.id, personnelId=p.personnel_id, personName=p.person_name,
        rank=p.rank, rankShort=p.rank_short, sztsz=p.sztsz,
        role=p.role, status=p.status, qualificationApproved=False, notes=p.notes,
    ) for p in rows]


@router.post("/{item_id}/participants", response_model=ParticipantRead, status_code=status.HTTP_201_CREATED)
def add_participant(item_id: str, body: ParticipantCreate, db: DB, _: Editor):
    duty = require_model(db, DutyModel, item_id)
    existing = db.execute(
        select(ParticipantModel).where(
            ParticipantModel.event_type == "duty",
            ParticipantModel.event_id == item_id,
            ParticipantModel.personnel_id == body.personnelId,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Ez a személy már hozzá van rendelve")
    p = ParticipantModel(
        id=new_id(), event_type="duty", event_id=item_id,
        personnel_id=body.personnelId, person_name=body.personName,
        rank=body.rank, rank_short=body.rankShort, sztsz=body.sztsz,
        role="", status=body.status, qualification_approved=False, notes=body.notes,
    )
    db.add(p)
    # Update primary person if duty has none
    if not duty.person_id:
        duty.person_id = body.personnelId
        duty.person_name = body.personName
    db.commit()
    db.refresh(p)
    return ParticipantRead(
        id=p.id, personnelId=p.personnel_id, personName=p.person_name,
        rank=p.rank, rankShort=p.rank_short, sztsz=p.sztsz,
        role=p.role, status=p.status, qualificationApproved=False, notes=p.notes,
    )


@router.put("/{item_id}/participants/{participant_id}", response_model=ParticipantRead)
def update_participant(item_id: str, participant_id: str, body: ParticipantUpdate, db: DB, _: Editor):
    p = db.execute(
        select(ParticipantModel).where(
            ParticipantModel.id == participant_id,
            ParticipantModel.event_type == "duty",
            ParticipantModel.event_id == item_id,
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    p.status = body.status
    p.notes = body.notes
    db.commit()
    db.refresh(p)
    return ParticipantRead(
        id=p.id, personnelId=p.personnel_id, personName=p.person_name,
        rank=p.rank, rankShort=p.rank_short, sztsz=p.sztsz,
        role=p.role, status=p.status, qualificationApproved=False, notes=p.notes,
    )


@router.delete("/{item_id}/participants/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_participant(item_id: str, participant_id: str, db: DB, _: Editor):
    p = db.execute(
        select(ParticipantModel).where(
            ParticipantModel.id == participant_id,
            ParticipantModel.event_type == "duty",
            ParticipantModel.event_id == item_id,
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    db.delete(p)
    db.commit()
