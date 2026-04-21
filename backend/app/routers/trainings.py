from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..db import get_db
from ..deps import _apply_training, _get_current_user, _require_editor, _require_model, _serialize_training
from ..models import TrainingModel, UserModel
from ..services.lifecycle import apply_training_completion_effects, sync_temporal_statuses
from ..schemas import TrainingCreate, TrainingRead, TrainingUpdate

router = APIRouter(prefix="/api/trainings", tags=["trainings"])


@router.get("", response_model=list[TrainingRead])
def list_trainings(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    sync_temporal_statuses(db)
    items = db.scalars(select(TrainingModel).order_by(TrainingModel.start_date)).all()
    for item in items:
        apply_training_completion_effects(db, item)
    items = db.scalars(select(TrainingModel).order_by(TrainingModel.start_date)).all()
    return [_serialize_training(i) for i in items]


@router.post("", response_model=TrainingRead)
def create_training(payload: TrainingCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = TrainingModel()
    _apply_training(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    apply_training_completion_effects(db, item)
    db.refresh(item)
    return _serialize_training(item)


@router.put("/{item_id}", response_model=TrainingRead)
def update_training(item_id: str, payload: TrainingUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, TrainingModel, item_id)
    _apply_training(item, payload)
    db.commit()
    db.refresh(item)
    apply_training_completion_effects(db, item)
    db.refresh(item)
    return _serialize_training(item)


@router.delete("/{item_id}", status_code=204)
def delete_training(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, TrainingModel, item_id)
    db.delete(item)
    db.commit()
