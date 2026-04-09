from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..db import get_db
from ..deps import _apply_exercise, _get_current_user, _require_editor, _require_model, _serialize_exercise
from ..models import ExerciseModel, UserModel
from ..schemas import ExerciseCreate, ExerciseRead, ExerciseUpdate

router = APIRouter(prefix="/api/exercises", tags=["exercises"])


@router.get("", response_model=list[ExerciseRead])
def list_exercises(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    return [_serialize_exercise(i) for i in db.scalars(select(ExerciseModel).order_by(ExerciseModel.start_date)).all()]


@router.post("", response_model=ExerciseRead)
def create_exercise(payload: ExerciseCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = ExerciseModel()
    _apply_exercise(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_exercise(item)


@router.put("/{item_id}", response_model=ExerciseRead)
def update_exercise(item_id: str, payload: ExerciseUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, ExerciseModel, item_id)
    _apply_exercise(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_exercise(item)


@router.delete("/{item_id}", status_code=204)
def delete_exercise(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, ExerciseModel, item_id)
    db.delete(item)
    db.commit()
