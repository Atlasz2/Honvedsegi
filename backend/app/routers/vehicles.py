from __future__ import annotations
from fastapi import APIRouter
from sqlalchemy import select

from ..appliers import apply_vehicle
from ..audit import record_activity
from ..core.dependencies import DB, Reader, Editor
from ..models import PersonModel, VehicleModel
from ..repository import require_model
from ..schemas import VehicleAssignRequest, VehicleCreate, VehicleRead, VehicleUpdate
from ..serializers import serialize_vehicle

router = APIRouter(prefix="/api/vehicles", tags=["vehicles"])


MODULE = "Járművek"


def _snapshot(item: VehicleModel) -> dict:
    return {
        "plateNumber": item.plate_number, "type": item.type, "makeModel": item.make_model,
        "year": item.year, "km": item.km, "status": item.status,
        "nextService": item.next_service, "nextInspection": item.next_inspection,
        "assignedToName": item.assigned_to_name or "", "notes": item.notes,
    }


@router.get("", response_model=list[VehicleRead])
def list_vehicles(db: DB, _: Reader):
    return [serialize_vehicle(i) for i in db.scalars(select(VehicleModel).order_by(VehicleModel.plate_number)).all()]


@router.post("", response_model=VehicleRead)
def create_vehicle(payload: VehicleCreate, db: DB, user: Editor):
    item = VehicleModel()
    apply_vehicle(item, payload)
    db.add(item)
    db.flush()
    record_activity(db, user, mode="create", module=MODULE, record_name=item.plate_number,
                    entity="vehicle", after=_snapshot(item))
    db.commit()
    db.refresh(item)
    return serialize_vehicle(item)


@router.put("/{item_id}", response_model=VehicleRead)
def update_vehicle(item_id: str, payload: VehicleUpdate, db: DB, user: Editor):
    item = require_model(db, VehicleModel, item_id)
    before = _snapshot(item)
    apply_vehicle(item, payload)
    record_activity(db, user, mode="update", module=MODULE, record_name=item.plate_number,
                    entity="vehicle", before=before, after=_snapshot(item))
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
def delete_vehicle(item_id: str, db: DB, user: Editor):
    item = require_model(db, VehicleModel, item_id)
    record_activity(db, user, mode="delete", module=MODULE, record_name=item.plate_number,
                    entity="vehicle", before=_snapshot(item))
    db.delete(item)
    db.commit()
