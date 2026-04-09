from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..db import get_db
from ..deps import _apply_equipment, _get_current_user, _require_editor, _require_model, _serialize_equipment, _utc_now
from ..models import EquipmentModel, PersonModel, UserModel
from ..schemas import EquipmentCheckoutRequest, EquipmentCreate, EquipmentRead, EquipmentUpdate

router = APIRouter(prefix="/api/equipment", tags=["equipment"])


@router.get("", response_model=list[EquipmentRead])
def list_equipment(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    return [_serialize_equipment(i) for i in db.scalars(select(EquipmentModel).order_by(EquipmentModel.name, EquipmentModel.serial_number)).all()]


@router.post("", response_model=EquipmentRead)
def create_equipment(payload: EquipmentCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = EquipmentModel()
    _apply_equipment(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_equipment(item)


@router.put("/{item_id}", response_model=EquipmentRead)
def update_equipment(item_id: str, payload: EquipmentUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, EquipmentModel, item_id)
    _apply_equipment(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_equipment(item)


@router.post("/{item_id}/checkout", response_model=EquipmentRead)
def checkout_equipment(item_id: str, payload: EquipmentCheckoutRequest, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, EquipmentModel, item_id)
    person = _require_model(db, PersonModel, payload.personId)
    today = _utc_now().date().isoformat()
    history = list(item.checkout_history or [])
    history.append({"personId": person.id, "personName": person.name, "checkedOutDate": today, "note": payload.note, "returnedDate": None})
    item.checked_out_to = person.id
    item.checked_out_to_name = person.name
    item.checked_out_date = today
    item.checkout_history = history
    db.commit()
    db.refresh(item)
    return _serialize_equipment(item)


@router.post("/{item_id}/return", response_model=EquipmentRead)
def return_equipment(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, EquipmentModel, item_id)
    history = list(item.checkout_history or [])
    if history:
        history[-1]["returnedDate"] = _utc_now().date().isoformat()
    item.checked_out_to = None
    item.checked_out_to_name = None
    item.checked_out_date = None
    item.checkout_history = history
    db.commit()
    db.refresh(item)
    return _serialize_equipment(item)


@router.delete("/{item_id}", status_code=204)
def delete_equipment(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, EquipmentModel, item_id)
    db.delete(item)
    db.commit()
