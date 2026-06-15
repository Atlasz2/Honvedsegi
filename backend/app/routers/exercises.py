from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import (
    _apply_exercise, _get_current_user, _require_editor,
    _require_model, _serialize_exercise, _sync_participants,
)
from ..models import ExerciseModel, ParticipantModel, UserModel, new_id
from ..schemas import (
    ExerciseCreate, ExerciseRead, ExerciseUpdate,
    ParticipantCreate, ParticipantRead, ParticipantUpdate,
)

router = APIRouter(prefix="/api/exercises", tags=["exercises"])


@router.get("", response_model=list[ExerciseRead])
def list_exercises(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    items = db.scalars(select(ExerciseModel).order_by(ExerciseModel.start_date)).all()
    return [_serialize_exercise(db, i) for i in items]


@router.post("", response_model=ExerciseRead, status_code=status.HTTP_201_CREATED)
def create_exercise(payload: ExerciseCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = ExerciseModel()
    _apply_exercise(item, payload)
    db.add(item)
    db.flush()
    _sync_participants(db, "exercise", item.id, payload.assigned)
    db.commit()
    db.refresh(item)
    return _serialize_exercise(db, item)


@router.put("/{item_id}", response_model=ExerciseRead)
def update_exercise(item_id: str, payload: ExerciseUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, ExerciseModel, item_id)
    _apply_exercise(item, payload)
    _sync_participants(db, "exercise", item_id, payload.assigned)
    db.commit()
    db.refresh(item)
    return _serialize_exercise(db, item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exercise(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, ExerciseModel, item_id)
    db.execute(
        select(ParticipantModel).where(ParticipantModel.event_type == "exercise", ParticipantModel.event_id == item_id)
    )
    _sync_participants(db, "exercise", item_id, [])
    db.delete(item)
    db.commit()


# ── Résztvevő-kezelés ─────────────────────────────────────────────────────────

@router.get("/{item_id}/participants", response_model=list[ParticipantRead])
def list_participants(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    _require_model(db, ExerciseModel, item_id)
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
def add_participant(item_id: str, body: ParticipantCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    _require_model(db, ExerciseModel, item_id)
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
def update_participant(item_id: str, participant_id: str, body: ParticipantUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
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
def remove_participant(item_id: str, participant_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
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
