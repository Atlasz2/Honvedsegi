from __future__ import annotations
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..appliers import apply_supply
from ..audit import record_activity
from ..core.dependencies import DB, Reader, Editor
from ..core.time import utc_now
from ..models import SupplyModel, new_id
from ..repository import require_model
from ..schemas import SupplyCreate, SupplyMovementCreate, SupplyRead, SupplyUpdate
from ..serializers import serialize_supply

router = APIRouter(prefix="/api/supplies", tags=["supplies"])


MODULE = "Készletek"


def _snapshot(item: SupplyModel) -> dict:
    return {
        "name": item.name, "category": item.category, "unit": item.unit,
        "currentQty": item.current_qty, "minQty": item.min_qty, "description": item.description,
    }


@router.get("", response_model=list[SupplyRead])
def list_supplies(db: DB, _: Reader):
    return [serialize_supply(i) for i in db.scalars(select(SupplyModel).order_by(SupplyModel.name)).all()]


@router.post("", response_model=SupplyRead)
def create_supply(payload: SupplyCreate, db: DB, user: Editor):
    item = SupplyModel()
    apply_supply(item, payload)
    db.add(item)
    db.flush()
    record_activity(db, user, mode="create", module=MODULE, record_name=item.name,
                    entity="supply", after=_snapshot(item))
    db.commit()
    db.refresh(item)
    return serialize_supply(item)


@router.put("/{item_id}", response_model=SupplyRead)
def update_supply(item_id: str, payload: SupplyUpdate, db: DB, user: Editor):
    item = require_model(db, SupplyModel, item_id)
    before = _snapshot(item)
    apply_supply(item, payload)
    record_activity(db, user, mode="update", module=MODULE, record_name=item.name,
                    entity="supply", before=before, after=_snapshot(item))
    db.commit()
    db.refresh(item)
    return serialize_supply(item)


@router.post("/{item_id}/movements", response_model=SupplyRead)
def create_supply_movement(item_id: str, payload: SupplyMovementCreate, db: DB, user: Editor):
    item = require_model(db, SupplyModel, item_id)
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="A mennyisegnek pozitivnak kell lennie")
    qty = item.current_qty
    if payload.type in {"Bevételezés", "Visszavétel"}:
        qty += payload.quantity
    elif payload.type in {"Kiadás", "Selejtezés"}:
        qty = max(0, qty - payload.quantity)
    else:
        qty = payload.quantity
    movement = {
        "id": new_id(), "type": payload.type, "quantity": payload.quantity,
        "note": payload.note, "date": utc_now().isoformat(),
        "userId": user.username, "userName": user.display_name,
    }
    item.current_qty = qty
    item.movements = [movement, *(item.movements or [])]
    db.commit()
    db.refresh(item)
    return serialize_supply(item)


@router.delete("/{item_id}", status_code=204)
def delete_supply(item_id: str, db: DB, user: Editor):
    item = require_model(db, SupplyModel, item_id)
    record_activity(db, user, mode="delete", module=MODULE, record_name=item.name,
                    entity="supply", before=_snapshot(item))
    db.delete(item)
    db.commit()
