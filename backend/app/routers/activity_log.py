from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError
from sqlalchemy import select

from ..appliers import apply_duty, apply_event, apply_exercise, apply_person, apply_training
from ..core.dependencies import DB, Reader, Editor
from ..models import ActivityLogModel, DutyModel, EventModel, ExerciseModel, PersonModel, TrainingModel
from ..schemas import (
    ActivityLogCreate,
    ActivityLogRead,
    DutyUpdate,
    EventUpdate,
    ExerciseUpdate,
    PersonUpdate,
    TrainingUpdate,
)
from ..serializers import serialize_log

router = APIRouter(prefix="/api/activity-log", tags=["activity-log"])

# Szerepkör-szintek: mindenki a sajátját és az AZ ALATTI szinteket látja
# (admin látja az olvasó/szerkesztő tetteit, fordítva nem). A régi, szerepkör
# nélküli bejegyzések a legalacsonyabb szintre esnek, így mindenki látja őket.
_ROLE_LEVEL = {"reader": 1, "editor": 2, "admin": 3, "fejleszto": 4}


def _entity_model(entity: str):
    mapping = {
        "personnel": PersonModel,
        "exercise": ExerciseModel,
        "training": TrainingModel,
        "event": EventModel,
        "duty": DutyModel,
    }
    return mapping.get(entity)


def apply_entity_payload(entity: str, item, data: dict) -> None:
    try:
        if entity == "personnel":
            apply_person(item, PersonUpdate(**data))
        elif entity == "exercise":
            apply_exercise(item, ExerciseUpdate(**data))
        elif entity == "training":
            apply_training(item, TrainingUpdate(**data))
        elif entity == "event":
            apply_event(item, EventUpdate(**data))
        elif entity == "duty":
            apply_duty(item, DutyUpdate(**data))
        else:
            raise HTTPException(status_code=400, detail="Ismeretlen entitás")
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail="Érvénytelen visszaállítási adatok") from exc


@router.get("", response_model=list[ActivityLogRead])
def list_activity_logs(db: DB, current_user: Reader):
    viewer_level = _ROLE_LEVEL.get(current_user.role, 1)
    entries = db.scalars(select(ActivityLogModel).order_by(ActivityLogModel.timestamp.desc())).all()
    visible = [e for e in entries if _ROLE_LEVEL.get(e.user_role or "reader", 1) <= viewer_level]
    return [serialize_log(i) for i in visible]


@router.post("", response_model=ActivityLogRead)
def create_activity_log(payload: ActivityLogCreate, db: DB, current_user: Reader):
    item = ActivityLogModel(
        user_id=payload.userId,
        user_name=payload.userName,
        user_role=current_user.role,
        action=payload.action,
        module=payload.module,
        record_name=payload.recordName,
        payload=payload.payload,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize_log(item)


@router.post("/{item_id}/restore", response_model=ActivityLogRead)
def restore_activity(item_id: str, db: DB, user: Editor):
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
        apply_entity_payload(entity, item, data)

    else:
        source = before or {}
        target_id = source.get("id")
        if not target_id:
            raise HTTPException(status_code=400, detail="Hiányzó azonosító")
        item = db.get(model, target_id)
        if not item:
            raise HTTPException(status_code=404, detail="A visszaállítandó rekord nem található")
        data = {k: v for k, v in source.items() if k != "id"}
        apply_entity_payload(entity, item, data)

    restore_log = ActivityLogModel(
        user_id=user.username,
        user_name=user.display_name,
        user_role=user.role,
        action="módosítva",
        module="Tevékenységnapló",
        record_name=f"Visszaállítás: {log_item.record_name}",
        payload={"restoreOf": log_item.id, "entity": entity},
    )
    db.add(restore_log)
    db.commit()
    db.refresh(restore_log)
    return serialize_log(restore_log)




