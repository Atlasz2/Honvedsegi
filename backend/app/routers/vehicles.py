from __future__ import annotations
from fastapi import APIRouter
from sqlalchemy import select

from ..appliers import apply_vehicle
from ..core.dependencies import DB, Reader, Editor
from ..models import PersonModel, VehicleModel
from ..repository import require_model
from ..schemas import VehicleAssignRequest, VehicleCreate, VehicleRead, VehicleUpdate
from ..serializers import serialize_vehicle

router = APIRouter(prefix="/api/vehicles", tags=["vehicles"])


@router.get("", response_model=list[VehicleRead])
def list_vehicles(db: DB, _: Reader):
    return [serialize_vehicle(i) for i in db.scalars(select(VehicleModel).order_by(VehicleModel.plate_number)).all()]


@router.post("", response_model=VehicleRead)
def create_vehicle(payload: VehicleCreate, db: DB, _: Editor):
    item = VehicleModel()
    apply_vehicle(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize_vehicle(item)


@router.put("/{item_id}", response_model=VehicleRead)
def update_vehicle(item_id: str, payload: VehicleUpdate, db: DB, _: Editor):
    item = require_model(db, VehicleModel, item_id)
    apply_vehicle(item, payload)
    db.commit()
    db.refresh(item)
    return serialize_vehicle(item)


@router.post("/{item_id}/assign", response_model=VehicleRead)
def assign_vehicle(item_id: str, payload: VehicleAssignRequest, db: DB, _: Editor):
    item = require_model(db, VehicleModel, item_id)
    person = require_model(db, PersonModel, payload.personId)
    item.assigned_to = person.id
    item.assigned_to_name = person.name
    item.status = "Használatban"
    db.commit()
    db.refresh(item)
    return serialize_vehicle(item)


@router.post("/{item_id}/return", response_model=VehicleRead)
def return_vehicle(item_id: str, db: DB, _: Editor):
    item = require_model(db, VehicleModel, item_id)
    item.assigned_to = None
    item.assigned_to_name = None
    if item.status == "Használatban":
        item.status = "Elérhető"
    db.commit()
    db.refresh(item)
    return serialize_vehicle(item)


@router.delete("/{item_id}", status_code=204)
def delete_vehicle(item_id: str, db: DB, _: Editor):
    item = require_model(db, VehicleModel, item_id)
    db.delete(item)
    db.commit()
