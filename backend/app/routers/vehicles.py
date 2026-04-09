from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..db import get_db
from ..deps import _apply_vehicle, _get_current_user, _require_editor, _require_model, _serialize_vehicle
from ..models import PersonModel, UserModel, VehicleModel
from ..schemas import VehicleAssignRequest, VehicleCreate, VehicleRead, VehicleUpdate

router = APIRouter(prefix="/api/vehicles", tags=["vehicles"])


@router.get("", response_model=list[VehicleRead])
def list_vehicles(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    return [_serialize_vehicle(i) for i in db.scalars(select(VehicleModel).order_by(VehicleModel.plate_number)).all()]


@router.post("", response_model=VehicleRead)
def create_vehicle(payload: VehicleCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = VehicleModel()
    _apply_vehicle(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_vehicle(item)


@router.put("/{item_id}", response_model=VehicleRead)
def update_vehicle(item_id: str, payload: VehicleUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, VehicleModel, item_id)
    _apply_vehicle(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_vehicle(item)


@router.post("/{item_id}/assign", response_model=VehicleRead)
def assign_vehicle(item_id: str, payload: VehicleAssignRequest, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, VehicleModel, item_id)
    person = _require_model(db, PersonModel, payload.personId)
    item.assigned_to = person.id
    item.assigned_to_name = person.name
    item.status = "Használatban"
    db.commit()
    db.refresh(item)
    return _serialize_vehicle(item)


@router.post("/{item_id}/return", response_model=VehicleRead)
def return_vehicle(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, VehicleModel, item_id)
    item.assigned_to = None
    item.assigned_to_name = None
    if item.status == "Használatban":
        item.status = "Elérhető"
    db.commit()
    db.refresh(item)
    return _serialize_vehicle(item)


@router.delete("/{item_id}", status_code=204)
def delete_vehicle(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, VehicleModel, item_id)
    db.delete(item)
    db.commit()
