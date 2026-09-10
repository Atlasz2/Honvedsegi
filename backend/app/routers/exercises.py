from __future__ import annotations


from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ..appliers import apply_exercise, auto_chain_prerequisites, grant_event_qualifications
from ..core.dependencies import DB, Reader, Editor
from ..participants import load_participants_by_event, sync_participants
from ..repository import require_model
from ..serializers import serialize_exercise
from ..audit import record_activity
from ..models import ExerciseModel, ParticipantModel, new_id


def _exercise_snapshot(item: ExerciseModel) -> dict:
    return {
        "id": item.id, "name": item.name, "type": item.type,
        "startDate": item.start_date, "endDate": item.end_date,
        "location": item.location, "maxPersonnel": item.max_personnel, "description": item.description,
        "status": item.status, "qualificationId": item.qualification_id or "",
        "seriesId": item.series_id or "", "level": item.level or "",
    }
from ..schemas import (
    ExerciseCreate, ExerciseRead, ExerciseUpdate,
    ParticipantCreate, ParticipantRead, ParticipantUpdate,
)

router = APIRouter(prefix="/api/exercises", tags=["exercises"])


@router.get("", response_model=list[ExerciseRead])
def list_exercises(db: DB, _: Reader):
    items = db.scalars(select(ExerciseModel).order_by(ExerciseModel.start_date)).all()
    participants_by_event = load_participants_by_event(db, "exercise")
    return [serialize_exercise(db, i, participants_by_event.get(i.id, [])) for i in items]


@router.post("", response_model=ExerciseRead, status_code=status.HTTP_201_CREATED)
def create_exercise(payload: ExerciseCreate, db: DB, user: Editor):
    item = ExerciseModel()
    apply_exercise(item, payload)
    db.add(item)
    db.flush()
    sync_participants(db, "exercise", item.id, payload.assigned)
    if item.status == "Befejezett":
        grant_event_qualifications(db, "exercise", item.id, item.qualification_id)
    auto_chain_prerequisites(db, "exercise", item.id, item.series_id, item.level, item.name)
    record_activity(db, user, mode="create", module="Műveletek", record_name=item.name,
                    entity="exercise", after=_exercise_snapshot(item))
    db.commit()
    db.refresh(item)
    return serialize_exercise(db, item)


@router.put("/{item_id}", response_model=ExerciseRead)
def update_exercise(item_id: str, payload: ExerciseUpdate, db: DB, user: Editor):
    item = require_model(db, ExerciseModel, item_id)
    before = _exercise_snapshot(item)
    apply_exercise(item, payload)
    sync_participants(db, "exercise", item_id, payload.assigned)
    if item.status == "Befejezett":
        grant_event_qualifications(db, "exercise", item_id, item.qualification_id)
    auto_chain_prerequisites(db, "exercise", item_id, item.series_id, item.level, item.name)
    record_activity(db, user, mode="update", module="Műveletek", record_name=item.name,
                    entity="exercise", before=before, after=_exercise_snapshot(item))
    db.commit()
    db.refresh(item)
    return serialize_exercise(db, item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exercise(item_id: str, db: DB, user: Editor):
    item = require_model(db, ExerciseModel, item_id)
    before = _exercise_snapshot(item)
    record_name = item.name
    sync_participants(db, "exercise", item_id, [])
    db.delete(item)
    record_activity(db, user, mode="delete", module="Műveletek", record_name=record_name,
                    entity="exercise", before=before)
    db.commit()


# ── Résztvevő-kezelés ─────────────────────────────────────────────────────────

@router.get("/{item_id}/participants", response_model=list[ParticipantRead])
def list_participants(item_id: str, db: DB, _: Reader):
    require_model(db, ExerciseModel, item_id)
    rows = db.scalars(
        select(ParticipantModel)
        .where(ParticipantModel.event_type == "exercise", ParticipantModel.event_id == item_id)
        .order_by(ParticipantModel.person_name)
    ).all()
    return [ParticipantRead(
        id=p.id, personnelId=p.personnel_id, personName=p.person_name,
        rank=p.rank, rankShort=p.rank_short, sztsz=p.sztsz,
        role=p.role, status=p.status, qualificationApproved=p.qualification_approved, notes=p.notes,
    ) for p in rows]


@router.post("/{item_id}/participants", response_model=ParticipantRead, status_code=status.HTTP_201_CREATED)
def add_participant(item_id: str, body: ParticipantCreate, db: DB, _: Editor):
    require_model(db, ExerciseModel, item_id)
    existing = db.execute(
        select(ParticipantModel).where(
            ParticipantModel.event_type == "exercise",
            ParticipantModel.event_id == item_id,
            ParticipantModel.personnel_id == body.personnelId,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Ez a személy már hozzá van rendelve")
    p = ParticipantModel(
        id=new_id(), event_type="exercise", event_id=item_id,
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
            ParticipantModel.event_type == "exercise",
            ParticipantModel.event_id == item_id,
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    p.status = body.status
    p.role = body.role
    p.qualification_approved = body.qualificationApproved
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
            ParticipantModel.event_type == "exercise",
            ParticipantModel.event_id == item_id,
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    db.delete(p)
    db.commit()
