from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..db import get_db
from ..deps import _apply_duty, _get_current_user, _require_editor, _require_model, _serialize_duty
from ..models import DutyModel, UserModel
from ..schemas import DutyCreate, DutyRead, DutyUpdate

router = APIRouter(prefix="/api/duties", tags=["duties"])


@router.get("", response_model=list[DutyRead])
def list_duties(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    return [_serialize_duty(i) for i in db.scalars(select(DutyModel).order_by(DutyModel.start_date)).all()]


@router.post("", response_model=DutyRead)
def create_duty(payload: DutyCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = DutyModel()
    _apply_duty(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_duty(item)


@router.put("/{item_id}", response_model=DutyRead)
def update_duty(item_id: str, payload: DutyUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, DutyModel, item_id)
    _apply_duty(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_duty(item)


@router.delete("/{item_id}", status_code=204)
def delete_duty(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, DutyModel, item_id)
    db.delete(item)
    db.commit()
