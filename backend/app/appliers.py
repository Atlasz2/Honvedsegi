"""API-kérés -> adatbázis-modell átalakítás, a hozzá tartozó mellékhatásokkal."""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .basic_training import grant_if_complete
from .services.lifecycle import apply_status
from .models import (
    DutyModel, EquipmentModel, EventModel, EventPrerequisiteModel, ExerciseModel,
    ParticipantModel, PersonModel, PersonnelQualificationModel, QualificationTypeModel,
    SupplyModel, TrainingModel, VehicleModel, new_id,
)
from .schemas import (
    DutyCreate, DutyUpdate, EquipmentCreate, EquipmentUpdate, EventCreate, EventUpdate,
    ExerciseCreate, ExerciseUpdate, PersonCreate, PersonUpdate, SupplyCreate, SupplyUpdate,
    TrainingCreate, TrainingUpdate, VehicleCreate, VehicleUpdate,
)


def apply_person(target: PersonModel, payload: PersonCreate | PersonUpdate) -> None:
    target.name = payload.name
    target.sztsz = payload.sztsz
    target.rank = payload.rank
    target.unit = payload.unit
    target.beosztas = payload.beosztas
    target.status = payload.status
    target.email = payload.email
    target.phone = payload.phone
    target.birth_date = payload.birthDate
    target.address = payload.address
    target.join_date = payload.joinDate
    target.notes = payload.notes


def apply_exercise(target: ExerciseModel, payload: ExerciseCreate | ExerciseUpdate) -> None:
    target.name = payload.name
    target.type = payload.type
    target.start_date = payload.startDate
    target.end_date = payload.endDate
    target.location = payload.location
    target.max_personnel = payload.maxPersonnel
    target.description = payload.description
    apply_status(target, payload.status)
    target.qualification_id = payload.qualificationId
    target.series_id = payload.seriesId
    target.level = payload.level
    # assigned is managed via participants table; caller must call sync_participants


def grant_event_qualifications(db: Session, event_type: str, event_id: str, qual_type_id: str | None) -> int:
    """A 'Megjelent' résztvevőknek jóváírja az esemény által adott képesítést (H2).
    Idempotens: forrásesemény szerint dedupál, így ismételt mentésnél nem duplikál."""
    if not qual_type_id:
        return 0
    qual_type = db.get(QualificationTypeModel, qual_type_id)
    if not qual_type:
        return 0
    db.flush()  # a frissen szinkronizált résztvevők látszódjanak (autoflush=False)
    earned = date.today()
    expiry = (earned + timedelta(days=qual_type.validity_days)).isoformat() if qual_type.validity_days else None
    granted = 0
    participants = db.scalars(
        select(ParticipantModel).where(
            ParticipantModel.event_type == event_type,
            ParticipantModel.event_id == event_id,
            ParticipantModel.status == "Megjelent",
        )
    ).all()
    for participant in participants:
        already = db.scalar(
            select(PersonnelQualificationModel).where(
                PersonnelQualificationModel.personnel_id == participant.personnel_id,
                PersonnelQualificationModel.qual_type_id == qual_type_id,
                PersonnelQualificationModel.source_event_id == event_id,
            )
        )
        if already:
            continue
        db.add(PersonnelQualificationModel(
            id=new_id(), personnel_id=participant.personnel_id, qual_type_id=qual_type_id,
            earned_date=earned.isoformat(), expiry_date=expiry,
            source_event_id=event_id, source_event_type=event_type,
            notes="Automatikus jóváírás (teljesített képzés)",
        ))
        granted += 1
    if granted:
        grant_if_complete(db, [p.personnel_id for p in participants])
    return granted


_LEVEL_PREV = {"Haladó": "Alap", "Emelt": "Haladó"}


def auto_chain_prerequisites(db: Session, event_type: str, event_id: str, series_id: str, level: str, module_name: str) -> None:
    """Sorozaton belüli szint-lánc: a Haladó/Emelt elem automatikusan megköveteli
    az azonos NEVŰ (modul) előző szintű elem által adott képesítést. Így a
    progresszió (Alap→Haladó→Emelt) kézi követelmény-beállítás nélkül összeáll."""
    if not series_id:
        return
    prev_level = _LEVEL_PREV.get(level)
    if not prev_level:
        return
    key = (module_name or "").strip().lower()
    qual_ids: set[str] = set()
    for model in (ExerciseModel, TrainingModel):
        for item in db.scalars(select(model).where(model.series_id == series_id, model.level == prev_level)).all():
            if (item.name or "").strip().lower() != key:
                continue
            if item.qualification_id:
                qual_ids.add(item.qualification_id)
    if not qual_ids:
        return
    existing = set(db.scalars(
        select(EventPrerequisiteModel.qual_type_id).where(
            EventPrerequisiteModel.event_type == event_type,
            EventPrerequisiteModel.event_id == event_id,
        )
    ).all())
    for qual_id in qual_ids:
        if qual_id not in existing:
            db.add(EventPrerequisiteModel(id=new_id(), event_type=event_type, event_id=event_id, qual_type_id=qual_id))


def apply_training(target: TrainingModel, payload: TrainingCreate | TrainingUpdate) -> None:
    target.name = payload.name
    target.type = payload.type
    target.start_date = payload.startDate
    target.end_date = payload.endDate
    target.location = payload.location
    target.organizer = payload.organizer
    target.qualification_id = payload.qualificationId
    target.max_personnel = payload.maxPersonnel
    target.description = payload.description
    apply_status(target, payload.status)
    target.series_id = payload.seriesId
    target.level = payload.level
    # assigned is managed via participants table; caller must call sync_participants


def apply_event(target: EventModel, payload: EventCreate | EventUpdate) -> None:
    target.event_type = payload.eventType
    target.name = payload.name
    target.type = payload.type
    target.start_date = payload.startDate
    target.end_date = payload.endDate
    target.location = payload.location
    target.organizer = payload.organizer
    target.max_personnel = payload.maxPersonnel
    target.description = payload.description
    target.status = payload.status
    target.parent_id = payload.parentId
    # assigned is managed via participants table; caller must call sync_participants


def apply_equipment(target: EquipmentModel, payload: EquipmentCreate | EquipmentUpdate) -> None:
    target.name = payload.name
    target.category = payload.category
    target.serial_number = payload.serialNumber
    target.qr_code = payload.qrCode
    target.condition = payload.condition
    target.description = payload.description
    target.checked_out_to = payload.checkedOutTo
    target.checked_out_to_name = payload.checkedOutToName
    target.checked_out_date = payload.checkedOutDate
    target.checkout_history = [item.model_dump() for item in payload.checkoutHistory]


def apply_supply(target: SupplyModel, payload: SupplyCreate | SupplyUpdate) -> None:
    target.name = payload.name
    target.category = payload.category
    target.unit = payload.unit
    target.current_qty = payload.currentQty
    target.min_qty = payload.minQty
    target.description = payload.description
    target.movements = [item.model_dump() for item in payload.movements]


def apply_vehicle(target: VehicleModel, payload: VehicleCreate | VehicleUpdate) -> None:
    target.plate_number = payload.plateNumber
    target.type = payload.type
    target.make_model = payload.makeModel
    target.year = payload.year
    target.km = payload.km
    target.next_service = payload.nextService
    target.next_inspection = payload.nextInspection
    target.status = payload.status
    target.notes = payload.notes
    target.assigned_to = payload.assignedTo
    target.assigned_to_name = payload.assignedToName
    target.service_log = [item.model_dump() for item in payload.serviceLog]


def apply_duty(target: DutyModel, payload: DutyCreate | DutyUpdate) -> None:
    target.type = payload.type
    target.start_date = payload.startDate
    target.end_date = payload.endDate
    target.location = payload.location
    # Keep primary person_id/person_name for quick lookups in operations_summary
    if payload.assigned:
        first = payload.assigned[0]
        target.person_id = first.personId
        target.person_name = first.personName
    elif payload.personId:
        target.person_id = payload.personId
        target.person_name = payload.personName
    else:
        target.person_id = ""
        target.person_name = ""
    target.notes = payload.notes
    target.status = payload.status
    # full assigned list is managed via participants table; caller must call sync_participants
