from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..db import get_db
from ..deps import _apply_event, _get_current_user, _require_editor, _require_model, _serialize_event
from ..models import EventModel, UserModel
from ..schemas import EventCreate, EventRead, EventUpdate

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=list[EventRead])
def list_events(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    return [_serialize_event(i) for i in db.scalars(select(EventModel).order_by(EventModel.start_date)).all()]


@router.post("", response_model=EventRead)
def create_event(payload: EventCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = EventModel()
    _apply_event(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_event(item)


@router.put("/{item_id}", response_model=EventRead)
def update_event(item_id: str, payload: EventUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, EventModel, item_id)
    _apply_event(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_event(item)


@router.delete("/{item_id}", status_code=204)
def delete_event(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, EventModel, item_id)
    db.delete(item)
    db.commit()
