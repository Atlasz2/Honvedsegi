from __future__ import annotations

from fastapi import Query, APIRouter, HTTPException
from pydantic import ValidationError
from sqlalchemy import or_, select

from ..appliers import apply_event, apply_exercise, apply_person, apply_training
from ..core.dependencies import DB, Reader, Editor
from ..models import ActivityLogModel, EventModel, ExerciseModel, PersonModel, TrainingModel
from ..schemas import (
    ActivityLogCreate,
    ActivityLogRead,
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
        else:
            raise HTTPException(status_code=400, detail="Ismeretlen entitás")
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail="Érvénytelen visszaállítási adatok") from exc


@router.get("", response_model=list[ActivityLogRead])
def list_activity_logs(
    db: DB,
    current_user: Reader,
    date_from: str = Query("", description="ÉÉÉÉ-HH-NN"),
    date_to: str = Query("", description="ÉÉÉÉ-HH-NN"),
    user: str = "",
    module: str = "",
    q: str = Query("", description="rekord neve (részlet)"),
    limit: int = Query(2000, ge=1, le=10000),
):
    """A napló idővel tízezres lesz — a szűrés és a korlát a szerveren van,
    a láthatóság (szerepkör-szint) is SQL-ben, nem Pythonban."""
    # Ki mit lát: olvasó és szerkesztő CSAK a saját bejegyzéseit — senki ne
    # csekkolgassa a másikat, akihez semmi köze. Admin és alkotó az egészet
    # (az alkotó szintjét az admin nem látja).
    query = select(ActivityLogModel)
    if current_user.role in ("admin", "fejleszto"):
        viewer_level = _ROLE_LEVEL.get(current_user.role, 1)
        visible_roles = [role for role, level in _ROLE_LEVEL.items() if level <= viewer_level]
        query = query.where(
            or_(ActivityLogModel.user_role.in_(visible_roles), ActivityLogModel.user_role == "", ActivityLogModel.user_role.is_(None))
        )
    else:
        query = query.where(ActivityLogModel.user_id == current_user.username)
    if date_from:
        query = query.where(ActivityLogModel.timestamp >= f"{date_from}T00:00:00")
    if date_to:
        query = query.where(ActivityLogModel.timestamp <= f"{date_to}T23:59:59.999999")
    if user:
        query = query.where(ActivityLogModel.user_name == user)
    if module:
        query = query.where(ActivityLogModel.module == module)
    if q.strip():
        query = query.where(ActivityLogModel.record_name.ilike(f"%{q.strip()}%"))
    entries = db.scalars(query.order_by(ActivityLogModel.timestamp.desc()).limit(limit)).all()
    return [serialize_log(i) for i in entries]


@router.get("/facets")
def activity_log_facets(db: DB, _: Reader):
    """A szűrők listái (felhasználók, modulok) — nem a teljes napló letöltéséből."""
    base_users = select(ActivityLogModel.user_name).distinct().order_by(ActivityLogModel.user_name)
    base_modules = select(ActivityLogModel.module).distinct().order_by(ActivityLogModel.module)
    if _.role not in ("admin", "fejleszto"):
        base_users = base_users.where(ActivityLogModel.user_id == _.username)
        base_modules = base_modules.where(ActivityLogModel.user_id == _.username)
    users = [u for (u,) in db.execute(base_users)]
    modules = [m for (m,) in db.execute(base_modules)]
    return {"users": users, "modules": modules}


@router.post("", response_model=ActivityLogRead)
def create_activity_log(payload: ActivityLogCreate, db: DB, current_user: Reader):
    # A bejegyzés a HITELESÍTETT felhasználóé — a kliens által küldött név csak
    # tájékoztató; így a „saját bejegyzéseim" szűrés és a napló hiteles marad.
    item = ActivityLogModel(
        user_id=current_user.username,
        user_name=current_user.display_name or payload.userName,
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
        payload={"restoreOf": log_item.id, "entity": entity, "mode": "update",
                 "before": {"visszaállítás": "—"}, "after": {"visszaállítás": f"{log_item.record_name} ({log_item.timestamp:%Y-%m-%d %H:%M} állapotára)"}},
    )
    db.add(restore_log)
    db.commit()
    db.refresh(restore_log)
    return serialize_log(restore_log)




