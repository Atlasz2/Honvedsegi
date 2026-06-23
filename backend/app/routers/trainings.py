from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import (
    _apply_training, _get_current_user, _load_participants_by_event, _require_editor,
    _require_model, _serialize_training, _sync_participants,
)
from ..models import (
    ParticipantModel, PersonnelQualificationModel,
    QualificationTypeModel, TrainingModel, UserModel, new_id,
)
from ..schemas import (
    ParticipantCreate, ParticipantRead, ParticipantUpdate,
    TrainingCreate, TrainingRead, TrainingUpdate,
)

router = APIRouter(prefix="/api/trainings", tags=["trainings"])


def _auto_grant_qualifications(db: Session, item: TrainingModel) -> None:
    """
    Ha egy kiképzés 'Befejezett' állapotba kerül és van qualificationId-ja,
    automatikusan létrehozza a személyi képesítés-bejegyzéseket az igazolt résztvevőknek.
    """
    if item.status != "Befejezett" or not item.qualification_id:
        return
    qt = db.get(QualificationTypeModel, item.qualification_id)
    if not qt:
        return
    db.flush()  # a frissen szinkronizált résztvevők látszódjanak (autoflush=False)
    earned = item.end_date or date.today().isoformat()
    expiry: str | None = None
    if qt.validity_days:
        expiry = (date.fromisoformat(earned) + timedelta(days=qt.validity_days)).isoformat()

    participants = db.scalars(
        select(ParticipantModel).where(
            ParticipantModel.event_type == "training",
            ParticipantModel.event_id == item.id,
            ParticipantModel.status == "Megjelent",
            ParticipantModel.qualification_approved == True,  # noqa: E712
        )
    ).all()

    for p in participants:
        already = db.execute(
            select(PersonnelQualificationModel).where(
                PersonnelQualificationModel.personnel_id == p.personnel_id,
                PersonnelQualificationModel.qual_type_id == qt.id,
                PersonnelQualificationModel.source_event_id == item.id,
            )
        ).scalar_one_or_none()
        if already:
            continue
        db.add(PersonnelQualificationModel(
            id=new_id(),
            personnel_id=p.personnel_id,
            qual_type_id=qt.id,
            earned_date=earned,
            expiry_date=expiry,
            source_event_id=item.id,
            source_event_type="training",
            notes="",
        ))


@router.get("", response_model=list[TrainingRead])
def list_trainings(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    items = db.scalars(select(TrainingModel).order_by(TrainingModel.start_date)).all()
    participants_by_event = _load_participants_by_event(db, "training")
    return [_serialize_training(db, i, participants_by_event.get(i.id, [])) for i in items]


@router.post("", response_model=TrainingRead, status_code=status.HTTP_201_CREATED)
def create_training(payload: TrainingCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = TrainingModel()
    _apply_training(item, payload)
    db.add(item)
    db.flush()
    _sync_participants(db, "training", item.id, payload.assigned)
    _auto_grant_qualifications(db, item)
    db.commit()
    db.refresh(item)
    return _serialize_training(db, item)


@router.put("/{item_id}", response_model=TrainingRead)
def update_training(item_id: str, payload: TrainingUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, TrainingModel, item_id)
    _apply_training(item, payload)
    _sync_participants(db, "training", item_id, payload.assigned)
    _auto_grant_qualifications(db, item)
    db.commit()
    db.refresh(item)
    return _serialize_training(db, item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_training(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, TrainingModel, item_id)
    _sync_participants(db, "training", item_id, [])
    db.delete(item)
    db.commit()


# ── Résztvevő-kezelés ─────────────────────────────────────────────────────────

@router.get("/{item_id}/participants", response_model=list[ParticipantRead])
def list_participants(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    _require_model(db, TrainingModel, item_id)
    rows = db.scalars(
        select(ParticipantModel)
        .where(ParticipantModel.event_type == "training", ParticipantModel.event_id == item_id)
        .order_by(ParticipantModel.person_name)
    ).all()
    return [ParticipantRead(
        id=p.id, personnelId=p.personnel_id, personName=p.person_name,
        rank=p.rank, rankShort=p.rank_short, sztsz=p.sztsz,
        role=p.role, status=p.status, qualificationApproved=p.qualification_approved, notes=p.notes,
    ) for p in rows]


@router.post("/{item_id}/participants", response_model=ParticipantRead, status_code=status.HTTP_201_CREATED)
def add_participant(item_id: str, body: ParticipantCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    _require_model(db, TrainingModel, item_id)
    existing = db.execute(
        select(ParticipantModel).where(
            ParticipantModel.event_type == "training",
            ParticipantModel.event_id == item_id,
            ParticipantModel.personnel_id == body.personnelId,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Ez a személy már hozzá van rendelve")
    p = ParticipantModel(
        id=new_id(), event_type="training", event_id=item_id,
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
            ParticipantModel.event_type == "training",
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
    # Ha a kiképzés befejezett és az ember megjelent + jóváhagyott, megpróbáljuk automatikusan megadni a képesítést
    training = db.get(TrainingModel, item_id)
    if training and training.status == "Befejezett":
        _auto_grant_qualifications(db, training)
        db.commit()
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
            ParticipantModel.event_type == "training",
            ParticipantModel.event_id == item_id,
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    db.delete(p)
    db.commit()
