from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import (
    _apply_duty,
    _apply_event,
    _apply_exercise,
    _apply_person,
    _apply_training,
    _get_current_user,
    _require_editor,
    _serialize_log,
)
from ..models import ActivityLogModel, DutyModel, EventModel, ExerciseModel, PersonModel, TrainingModel, UserModel
from ..schemas import (
    ActivityLogCreate,
    ActivityLogRead,
    DutyUpdate,
    EventUpdate,
    ExerciseUpdate,
    PersonUpdate,
    TrainingUpdate,
)

router = APIRouter(prefix="/api/activity-log", tags=["activity-log"])


def _entity_model(entity: str):
    mapping = {
        "personnel": PersonModel,
        "exercise": ExerciseModel,
        "training": TrainingModel,
        "event": EventModel,
        "duty": DutyModel,
    }
    return mapping.get(entity)


def _apply_entity_payload(entity: str, item, data: dict) -> None:
    try:
        if entity == "personnel":
            _apply_person(item, PersonUpdate(**data))
        elif entity == "exercise":
            _apply_exercise(item, ExerciseUpdate(**data))
        elif entity == "training":
            _apply_training(item, TrainingUpdate(**data))
        elif entity == "event":
            _apply_event(item, EventUpdate(**data))
        elif entity == "duty":
            _apply_duty(item, DutyUpdate(**data))
        else:
            raise HTTPException(status_code=400, detail="Ismeretlen entitás")
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail="Érvénytelen visszaállítási adatok") from exc


@router.get("", response_model=list[ActivityLogRead])
def list_activity_logs(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    return [_serialize_log(i) for i in db.scalars(select(ActivityLogModel).order_by(ActivityLogModel.timestamp.desc())).all()]


@router.post("", response_model=ActivityLogRead)
def create_activity_log(payload: ActivityLogCreate, db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    item = ActivityLogModel(
        user_id=payload.userId,
        user_name=payload.userName,
        action=payload.action,
        module=payload.module,
        record_name=payload.recordName,
        payload=payload.payload,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_log(item)


@router.post("/{item_id}/restore", response_model=ActivityLogRead)
def restore_activity(item_id: str, db: Session = Depends(get_db), user: UserModel = Depends(_require_editor)):
    log_item = db.get(ActivityLogModel, item_id)
    if not log_item:
        raise HTTPException(status_code=404, detail="Naplóbejegyzés nem található")

    payload = log_item.payload or {}
    entity = payload.get("entity")
    mode = payload.get("mode")
    before = payload.get("before")
    after = payload.get("after")

    model = _entity_model(entity)
    if not model or mode not in {"create", "update", "delete"}:
        raise HTTPException(status_code=400, detail="A bejegyzés nem visszaállítható")

    if mode == "create":
        target_id = (after or {}).get("id")
        if not target_id:
            raise HTTPException(status_code=400, detail="Hiányzó azonosító")
        item = db.get(model, target_id)
        if item:
            db.delete(item)

    elif mode == "delete":
        source = before or {}
        target_id = source.get("id")
        if not target_id:
            raise HTTPException(status_code=400, detail="Hiányzó azonosító")
        item = db.get(model, target_id)
        if item is None:
            item = model(id=target_id)
            db.add(item)
        data = {k: v for k, v in source.items() if k != "id"}
        _apply_entity_payload(entity, item, data)

    else:
        source = before or {}
        target_id = source.get("id")
        if not target_id:
            raise HTTPException(status_code=400, detail="Hiányzó azonosító")
        item = db.get(model, target_id)
        if not item:
            raise HTTPException(status_code=404, detail="A visszaállítandó rekord nem található")
        data = {k: v for k, v in source.items() if k != "id"}
        _apply_entity_payload(entity, item, data)

    restore_log = ActivityLogModel(
        user_id=user.username,
        user_name=user.display_name,
        action="módosítva",
        module="Tevékenységnapló",
        record_name=f"Visszaállítás: {log_item.record_name}",
        payload={"restoreOf": log_item.id, "entity": entity},
    )
    db.add(restore_log)
    db.commit()
    db.refresh(restore_log)
    return _serialize_log(restore_log)




