"""Adatbázis-modell -> API-válasz átalakítás."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    ActivityLogModel, AnnouncementModel, DutyModel, EquipmentModel, EventModel,
    ExerciseModel, ParticipantModel, PersonModel, PersonnelQualificationModel,
    QualificationTypeModel, SupplyModel, VehicleModel,
)
from .participants import get_participants
from .schemas import (
    ActivityLogRead, AnnouncementRead, DutyRead, EquipmentRead, EventRead,
    ExerciseRead, PersonRead, SupplyRead, VehicleRead,
)


def serialize_person(item: PersonModel) -> PersonRead:
    return PersonRead(
        id=item.id,
        name=item.name,
        sztsz=item.sztsz,
        rank=item.rank,
        unit=item.unit,
        beosztas=item.beosztas or "",
        status=item.status,
        serviceType=item.service_type or "",
        email=item.email,
        phone=item.phone,
        birthDate=item.birth_date,
        address=item.address,
        joinDate=item.join_date,
        notes=item.notes,
        qualifications=item.qualifications or [],
        extra=item.extra or {},
    )


def serialize_person_with_quals(item: PersonModel, qualification_ids: list[str]) -> PersonRead:
    """Serialize a person from a pre-loaded list of qualification type ids.

    Pair this with load_qualification_ids_by_person in list endpoints to avoid
    one query per qualification (N+1)."""
    return PersonRead(
        id=item.id,
        name=item.name,
        sztsz=item.sztsz,
        rank=item.rank,
        unit=item.unit,
        beosztas=item.beosztas or "",
        status=item.status,
        serviceType=item.service_type or "",
        email=item.email,
        phone=item.phone,
        birthDate=item.birth_date,
        address=item.address,
        joinDate=item.join_date,
        notes=item.notes,
        qualifications=qualification_ids,
        extra=item.extra or {},
    )


def load_qualification_ids_by_person(db: Session) -> dict[str, list[str]]:
    """Map every person id to their qualification type ids in a single query.

    The join to qualification_types drops qualifications whose type was deleted,
    matching serialize_person_with_qual_table's per-person behaviour."""
    rows = db.execute(
        select(PersonnelQualificationModel.personnel_id, QualificationTypeModel.id)
        .join(QualificationTypeModel, QualificationTypeModel.id == PersonnelQualificationModel.qual_type_id)
    ).all()
    quals_by_person: dict[str, list[str]] = {}
    for personnel_id, qual_type_id in rows:
        quals_by_person.setdefault(personnel_id, []).append(qual_type_id)
    return quals_by_person


def serialize_person_with_qual_table(db: Session, item: PersonModel) -> PersonRead:
    """Serialize a single person, reading their qualifications from the table.

    For lists prefer load_qualification_ids_by_person + serialize_person_with_quals,
    which avoids one query per qualification."""
    qual_rows = db.scalars(
        select(PersonnelQualificationModel).where(PersonnelQualificationModel.personnel_id == item.id)
    ).all()
    qual_ids = [
        qt.id for pq in qual_rows
        if (qt := db.get(QualificationTypeModel, pq.qual_type_id)) is not None
    ]
    return serialize_person_with_quals(item, qual_ids)


def serialize_exercise(db: Session, item: ExerciseModel, participants: list[ParticipantModel] | None = None) -> ExerciseRead:
    if participants is None:
        participants = get_participants(db, "exercise", item.id)
    assigned = [
        {"personId": p.personnel_id, "personName": p.person_name, "role": p.role,
         "attendance": p.status, "rank": p.rank, "rankShort": p.rank_short, "sztsz": p.sztsz, "notes": p.notes or ""}
        for p in participants
    ] if participants else (item.assigned or [])
    return ExerciseRead(
        id=item.id, name=item.name, type=item.type,
        startDate=item.start_date, endDate=item.end_date, location=item.location,
        organizer=item.organizer or "", maxPersonnel=item.max_personnel, description=item.description,
        status=item.status, qualificationId=item.qualification_id or "",
        seriesId=item.series_id or "", level=item.level or "", assigned=assigned,
    )


def serialize_event(db: Session, item: EventModel, participants: list[ParticipantModel] | None = None) -> EventRead:
    if participants is None:
        participants = get_participants(db, "event", item.id)
    assigned = [
        {"personId": p.personnel_id, "personName": p.person_name, "role": p.role,
         "attendance": p.status, "rank": p.rank, "rankShort": p.rank_short, "sztsz": p.sztsz, "notes": p.notes or ""}
        for p in participants
    ] if participants else (item.assigned or [])
    return EventRead(
        id=item.id, eventType=item.event_type, name=item.name, type=item.type,
        startDate=item.start_date, endDate=item.end_date, location=item.location,
        organizer=item.organizer or "", maxPersonnel=item.max_personnel,
        description=item.description, status=item.status, assigned=assigned,
    )


def serialize_equipment(item: EquipmentModel) -> EquipmentRead:
    return EquipmentRead(
        id=item.id,
        name=item.name,
        category=item.category,
        serialNumber=item.serial_number,
        qrCode=item.qr_code,
        condition=item.condition,
        description=item.description,
        checkedOutTo=item.checked_out_to,
        checkedOutToName=item.checked_out_to_name,
        checkedOutDate=item.checked_out_date,
        checkoutHistory=item.checkout_history or [],
    )


def serialize_supply(item: SupplyModel) -> SupplyRead:
    return SupplyRead(
        id=item.id,
        name=item.name,
        category=item.category,
        unit=item.unit,
        currentQty=item.current_qty,
        minQty=item.min_qty,
        description=item.description,
        movements=item.movements or [],
    )


def serialize_vehicle(item: VehicleModel) -> VehicleRead:
    return VehicleRead(
        id=item.id,
        plateNumber=item.plate_number,
        type=item.type,
        makeModel=item.make_model,
        year=item.year,
        km=item.km,
        nextService=item.next_service,
        nextInspection=item.next_inspection,
        status=item.status,
        notes=item.notes,
        assignedTo=item.assigned_to,
        assignedToName=item.assigned_to_name,
        serviceLog=item.service_log or [],
    )


def serialize_duty(db: Session, item: DutyModel, participants: list[ParticipantModel] | None = None) -> DutyRead:
    if participants is None:
        participants = get_participants(db, "duty", item.id)
    if participants:
        assigned = [{"personId": p.personnel_id, "personName": p.person_name,
                     "rank": p.rank, "rankShort": p.rank_short, "sztsz": p.sztsz}
                    for p in participants]
    elif item.assigned:
        assigned = item.assigned
    elif item.person_id:
        assigned = [{"personId": item.person_id, "personName": item.person_name}]
    else:
        assigned = []
    return DutyRead(
        id=item.id, type=item.type, startDate=item.start_date, endDate=item.end_date,
        location=item.location, personId=item.person_id, personName=item.person_name,
        assigned=assigned, notes=item.notes, status=item.status,
    )


def serialize_announcement(item: AnnouncementModel) -> AnnouncementRead:
    return AnnouncementRead(
        id=item.id,
        title=item.title,
        category=item.category,
        content=item.content,
        author=item.author,
        date=item.date,
        pinned=item.pinned,
    )


def serialize_log(item: ActivityLogModel) -> ActivityLogRead:
    return ActivityLogRead(
        id=item.id,
        timestamp=item.timestamp.isoformat(),
        userId=item.user_id,
        userName=item.user_name,
        userRole=item.user_role or "",
        action=item.action,
        module=item.module,
        recordName=item.record_name,
        payload=item.payload,
    )
