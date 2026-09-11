from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..appliers import apply_training, auto_chain_prerequisites
from ..core.dependencies import DB, Reader, Editor
from ..participants import load_participants_by_event, sync_participants
from ..repository import require_model
from ..serializers import serialize_training
from ..audit import record_activity
from ..models import (
    ParticipantModel,
    PersonnelQualificationModel,
    QualificationTypeModel,
    TrainingModel,
    new_id,
)


def _training_snapshot(item: TrainingModel) -> dict:
    return {
        "id": item.id, "name": item.name, "type": item.type,
        "startDate": item.start_date, "endDate": item.end_date, "location": item.location,
        "organizer": item.organizer or "", "qualificationId": item.qualification_id or "",
        "maxPersonnel": item.max_personnel, "description": item.description, "status": item.status,
        "seriesId": item.series_id or "", "level": item.level or "",
    }
from ..schemas import (
    ParticipantCreate, ParticipantRead, ParticipantUpdate,
    TrainingCreate, TrainingRead, TrainingUpdate,
)

router = APIRouter(prefix="/api/trainings", tags=["trainings"])


def _auto_grant_qualifications(db: Session, item: TrainingModel) -> None:
    """
    Ha a kiképzésnek van qualificationId-ja és nincs lemondva, a „Megjelent" +
    jóváhagyott résztvevők automatikusan megkapják a képesítést (idempotens).
    A dátum-állapot nem számít: a megjelenés rögzítése a teljesítés.
    """
    if item.status == "Lemondva" or not item.qualification_id:
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
def list_trainings(db: DB, _: Reader):
    items = db.scalars(select(TrainingModel).order_by(TrainingModel.start_date)).all()
    participants_by_event = load_participants_by_event(db, "training")
    return [serialize_training(db, i, participants_by_event.get(i.id, [])) for i in items]


@router.post("", response_model=TrainingRead, status_code=status.HTTP_201_CREATED)
def create_training(payload: TrainingCreate, db: DB, user: Editor):
    item = TrainingModel()
    apply_training(item, payload)
    db.add(item)
    db.flush()
    sync_participants(db, "training", item.id, payload.assigned)
    _auto_grant_qualifications(db, item)
    auto_chain_prerequisites(db, "training", item.id, item.series_id, item.level, item.name)
    record_activity(db, user, mode="create", module="Műveletek", record_name=item.name,
                    entity="training", after=_training_snapshot(item))
    db.commit()
    db.refresh(item)
    return serialize_training(db, item)


@router.put("/{item_id}", response_model=TrainingRead)
def update_training(item_id: str, payload: TrainingUpdate, db: DB, user: Editor):
    item = require_model(db, TrainingModel, item_id)
    before = _training_snapshot(item)
    apply_training(item, payload)
    sync_participants(db, "training", item_id, payload.assigned)
    _auto_grant_qualifications(db, item)
    auto_chain_prerequisites(db, "training", item_id, item.series_id, item.level, item.name)
    record_activity(db, user, mode="update", module="Műveletek", record_name=item.name,
                    entity="training", before=before, after=_training_snapshot(item))
    db.commit()
    db.refresh(item)
    return serialize_training(db, item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_training(item_id: str, db: DB, user: Editor):
    item = require_model(db, TrainingModel, item_id)
    before = _training_snapshot(item)
    record_name = item.name
    sync_participants(db, "training", item_id, [])
    db.delete(item)
    record_activity(db, user, mode="delete", module="Műveletek", record_name=record_name,
                    entity="training", before=before)
    db.commit()


# ── Résztvevő-kezelés ─────────────────────────────────────────────────────────

@router.get("/{item_id}/participants", response_model=list[ParticipantRead])
def list_participants(item_id: str, db: DB, _: Reader):
    require_model(db, TrainingModel, item_id)
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
def add_participant(item_id: str, body: ParticipantCreate, db: DB, _: Editor):
    require_model(db, TrainingModel, item_id)
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
def update_participant(item_id: str, participant_id: str, body: ParticipantUpdate, db: DB, _: Editor):
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
    # Megjelent + jóváhagyott → képesítés (ha a kiképzés nincs lemondva)
    training = db.get(TrainingModel, item_id)
    if training:
        _auto_grant_qualifications(db, training)
        db.commit()
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
            ParticipantModel.event_type == "training",
            ParticipantModel.event_id == item_id,
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    db.delete(p)
    db.commit()
