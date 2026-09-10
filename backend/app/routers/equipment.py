from __future__ import annotations
from fastapi import APIRouter
from sqlalchemy import select

from ..appliers import apply_equipment
from ..core.dependencies import DB, Reader, Editor
from ..core.time import utc_now
from ..models import EquipmentModel, PersonModel
from ..repository import require_model
from ..schemas import EquipmentCheckoutRequest, EquipmentCreate, EquipmentRead, EquipmentUpdate
from ..serializers import serialize_equipment

router = APIRouter(prefix="/api/equipment", tags=["equipment"])


@router.get("", response_model=list[EquipmentRead])
def list_equipment(db: DB, _: Reader):
    return [serialize_equipment(i) for i in db.scalars(select(EquipmentModel).order_by(EquipmentModel.name, EquipmentModel.serial_number)).all()]


@router.post("", response_model=EquipmentRead)
def create_equipment(payload: EquipmentCreate, db: DB, _: Editor):
    item = EquipmentModel()
    apply_equipment(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize_equipment(item)


@router.put("/{item_id}", response_model=EquipmentRead)
def update_equipment(item_id: str, payload: EquipmentUpdate, db: DB, _: Editor):
    item = require_model(db, EquipmentModel, item_id)
    apply_equipment(item, payload)
    db.commit()
    db.refresh(item)
    return serialize_equipment(item)


@router.post("/{item_id}/checkout", response_model=EquipmentRead)
def checkout_equipment(item_id: str, payload: EquipmentCheckoutRequest, db: DB, _: Editor):
    item = require_model(db, EquipmentModel, item_id)
    person = require_model(db, PersonModel, payload.personId)
    today = utc_now().date().isoformat()
    history = list(item.checkout_history or [])
    history.append({"personId": person.id, "personName": person.name, "checkedOutDate": today, "note": payload.note, "returnedDate": None})
    item.checked_out_to = person.id
    item.checked_out_to_name = person.name
    item.checked_out_date = today
    item.checkout_history = history
    db.commit()
    db.refresh(item)
    return serialize_equipment(item)


@router.post("/{item_id}/return", response_model=EquipmentRead)
def return_equipment(item_id: str, db: DB, _: Editor):
    item = require_model(db, EquipmentModel, item_id)
    history = list(item.checkout_history or [])
    if history:
        history[-1]["returnedDate"] = utc_now().date().isoformat()
    item.checked_out_to = None
    item.checked_out_to_name = None
    item.checked_out_date = None
    item.checkout_history = history
    db.commit()
    db.refresh(item)
    return serialize_equipment(item)


@router.delete("/{item_id}", status_code=204)
def delete_equipment(item_id: str, db: DB, _: Editor):
    item = require_model(db, EquipmentModel, item_id)
    db.delete(item)
    db.commit()
