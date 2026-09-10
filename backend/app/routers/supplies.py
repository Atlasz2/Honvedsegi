from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..db import get_db
from ..deps import _apply_supply, _get_current_user, _require_editor, _require_model, _serialize_supply, _utc_now
from ..models import SupplyModel, UserModel, new_id
from ..schemas import SupplyCreate, SupplyMovementCreate, SupplyRead, SupplyUpdate

router = APIRouter(prefix="/api/supplies", tags=["supplies"])


@router.get("", response_model=list[SupplyRead])
def list_supplies(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    return [_serialize_supply(i) for i in db.scalars(select(SupplyModel).order_by(SupplyModel.name)).all()]


@router.post("", response_model=SupplyRead)
def create_supply(payload: SupplyCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = SupplyModel()
    _apply_supply(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_supply(item)


@router.put("/{item_id}", response_model=SupplyRead)
def update_supply(item_id: str, payload: SupplyUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, SupplyModel, item_id)
    _apply_supply(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_supply(item)


@router.post("/{item_id}/movements", response_model=SupplyRead)
def create_supply_movement(
    item_id: str,
    payload: SupplyMovementCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(_require_editor),
):
    item = _require_model(db, SupplyModel, item_id)
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
        "note": payload.note, "date": _utc_now().isoformat(),
        "userId": user.username, "userName": user.display_name,
    }
    item.current_qty = qty
    item.movements = [movement, *(item.movements or [])]
    db.commit()
    db.refresh(item)
    return _serialize_supply(item)


@router.delete("/{item_id}", status_code=204)
def delete_supply(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, SupplyModel, item_id)
    db.delete(item)
    db.commit()
