from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, TypeVar

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .constants import GOD_USERNAME, GOD_ROLE, MAX_FAILED_LOGINS, LOCKOUT_MINUTES
from .db import get_db
from .models import (
    ActivityLogModel, AnnouncementModel, BugReportModel, DutyModel, EquipmentModel,
    EventModel, ExerciseModel, LoginAttemptModel, PersonModel,
    SessionTokenModel, SupplyModel, TrainingModel, UserModel, VehicleModel,
)
from .schemas import (
    ActivityLogRead, AnnouncementRead, AuthUser, BugReportRead,
    DutyCreate, DutyRead, DutyUpdate,
    EquipmentCreate, EquipmentRead, EquipmentUpdate,
    EventCreate, EventRead, EventUpdate,
    ExerciseCreate, ExerciseRead, ExerciseUpdate,
    PersonCreate, PersonRead, PersonUpdate,
    SupplyCreate, SupplyRead, SupplyUpdate,
    TrainingCreate, TrainingRead, TrainingUpdate,
    UserRead, VehicleCreate, VehicleRead, VehicleUpdate,
)
from .security import fingerprint_token

ModelT = TypeVar("ModelT")

# ── Date / time ───────────────────────────────────────────────────────────

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _parse_iso_date(value: str) -> date | None:
    if not value:
        return None
    raw = value.strip()
    candidates = [raw, raw[:10]] if len(raw) >= 10 else [raw]
    if "T" in raw:
        candidates.append(raw.split("T", 1)[0])
    for candidate in candidates:
        try:
            return datetime.fromisoformat(candidate).date()
        except ValueError:
            try:
                return date.fromisoformat(candidate)
            except ValueError:
                continue
    return None


def _date_overlap(start_value: str, end_value: str, range_start: date, range_end: date) -> bool:
    start = _parse_iso_date(start_value)
    end = _parse_iso_date(end_value)
    if not start or not end:
        return False
    return start <= range_end and end >= range_start

# ── Login tracking ────────────────────────────────────────────────────────

def _get_login_attempt(db: Session, username: str) -> LoginAttemptModel:
    attempt = db.scalar(select(LoginAttemptModel).where(LoginAttemptModel.username == username))
    if not attempt:
        attempt = LoginAttemptModel(username=username, failed_count=0)
        db.add(attempt)
        db.flush()
    return attempt


def _is_login_locked(attempt: LoginAttemptModel) -> bool:
    return bool(attempt.locked_until and _as_utc(attempt.locked_until) > _utc_now())


def _register_failed_login(db: Session, username: str) -> None:
    attempt = _get_login_attempt(db, username)
    attempt.failed_count = int(attempt.failed_count or 0) + 1
    attempt.last_failed_at = _utc_now()
    if attempt.failed_count >= MAX_FAILED_LOGINS:
        attempt.failed_count = 0
        attempt.locked_until = _utc_now() + timedelta(minutes=LOCKOUT_MINUTES)
    db.commit()


def _reset_login_attempt(db: Session, username: str) -> None:
    attempt = db.scalar(select(LoginAttemptModel).where(LoginAttemptModel.username == username))
    if not attempt:
        return
    attempt.failed_count = 0
    attempt.locked_until = None
    db.commit()

# ── User serialization ────────────────────────────────────────────────────

def _user_to_auth_payload(user: UserModel, expiry: datetime) -> AuthUser:
    return AuthUser(
        username=user.username,
        displayName=user.display_name,
        role=user.role,
        expiry=int(expiry.timestamp() * 1000),
    )


def _to_user_read(user: UserModel) -> UserRead:
    return UserRead(
        username=user.username,
        display_name=user.display_name,
        role=user.role,
        active=user.active,
        last_login=user.last_login,
    )

# ── FastAPI auth dependencies ─────────────────────────────────────────────

def _get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> UserModel:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bejelentkezés szükséges")
    token_value = authorization.split(" ", 1)[1].strip()
    token_key = fingerprint_token(token_value)
    session_token = db.scalar(select(SessionTokenModel).where(SessionTokenModel.token == token_key))
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Érvénytelen munkamenet")
    if _as_utc(session_token.expires_at) < _utc_now():
        db.delete(session_token)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Lejárt munkamenet")
    user = db.get(UserModel, session_token.user_id)
    if not user or not user.active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="A felhasználó nem aktív")
    return user


def _require_editor(user: UserModel = Depends(_get_current_user)) -> UserModel:
    if user.role not in {"editor", "admin", "fejleszto"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nincs jogosultság a művelethez")
    return user


def _require_admin(user: UserModel = Depends(_get_current_user)) -> UserModel:
    if user.role not in {"admin", "fejleszto"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin jogosultság szükséges")
    return user


def _is_god_user(user: UserModel) -> bool:
    return user.username == GOD_USERNAME and user.role == GOD_ROLE and user.active


def _require_god_user(user: UserModel = Depends(_get_current_user)) -> UserModel:
    if not _is_god_user(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Csak a dev_master jogosult erre a művelethez")
    return user

# ── Generic model getter ──────────────────────────────────────────────────

def _require_model(db: Session, model_type: type[ModelT], item_id: str) -> ModelT:
    item = db.get(model_type, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Az erőforrás nem található")
    return item

# ── Personnel validation ──────────────────────────────────────────────────

def _normalize_sztsz(value: str) -> str:
    normalized = re.sub(r"\s+", "", (value or "").strip()).upper()
    if re.fullmatch(r"\d{8}", normalized):
        return normalized
    if re.fullmatch(r"[A-Z]{2}\d{6}", normalized):
        return normalized
    raise HTTPException(status_code=400, detail="Az SZTSz formátuma 8 számjegy vagy 2 betű + 6 számjegy lehet")


def _assert_unique_sztsz(db: Session, sztsz: str, exclude_id: str | None = None) -> None:
    existing = db.scalar(select(PersonModel).where(PersonModel.sztsz == sztsz))
    if existing and existing.id != exclude_id:
        raise HTTPException(status_code=409, detail="Ez az SZTSz már létezik")

# ── Serializers ───────────────────────────────────────────────────────────

def _serialize_person(item: PersonModel) -> PersonRead:
    return PersonRead(
        id=item.id,
        name=item.name,
        sztsz=item.sztsz,
        rank=item.rank,
        unit=item.unit,
        beosztas=item.beosztas or "",
        status=item.status,
        email=item.email,
        phone=item.phone,
        birthDate=item.birth_date,
        address=item.address,
        joinDate=item.join_date,
        notes=item.notes,
        qualifications=item.qualifications or [],
        completedOperations=item.completed_operations or [],
    )


def _serialize_exercise(item: ExerciseModel) -> ExerciseRead:
    return ExerciseRead(
        id=item.id,
        name=item.name,
        type=item.type,
        startDate=item.start_date,
        endDate=item.end_date,
        location=item.location,
        maxPersonnel=item.max_personnel,
        description=item.description,
        status=item.status,
        assigned=item.assigned or [],
    )


def _serialize_training(item: TrainingModel) -> TrainingRead:
    return TrainingRead(
        id=item.id,
        name=item.name,
        type=item.type,
        startDate=item.start_date,
        endDate=item.end_date,
        location=item.location,
        organizer=item.organizer or "",
        qualificationId=item.qualification_id or "",
        maxPersonnel=item.max_personnel,
        description=item.description,
        status=item.status,
        assigned=item.assigned or [],
    )


def _serialize_event(item: EventModel) -> EventRead:
    return EventRead(
        id=item.id,
        eventType=item.event_type,
        name=item.name,
        type=item.type,
        startDate=item.start_date,
        endDate=item.end_date,
        location=item.location,
        organizer=item.organizer or "",
        maxPersonnel=item.max_personnel,
        description=item.description,
        status=item.status,
        assigned=item.assigned or [],
        parentId=item.parent_id,
    )


def _serialize_equipment(item: EquipmentModel) -> EquipmentRead:
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


def _serialize_supply(item: SupplyModel) -> SupplyRead:
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


def _serialize_vehicle(item: VehicleModel) -> VehicleRead:
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


def _serialize_duty(item: DutyModel) -> DutyRead:
    return DutyRead(
        id=item.id,
        type=item.type,
        startDate=item.start_date,
        endDate=item.end_date,
        location=item.location,
        personId=item.person_id,
        personName=item.person_name,
        assigned=item.assigned or ([{"personId": item.person_id, "personName": item.person_name}] if item.person_id else []),
        notes=item.notes,
        status=item.status,
    )


def _serialize_announcement(item: AnnouncementModel) -> AnnouncementRead:
    return AnnouncementRead(
        id=item.id,
        title=item.title,
        category=item.category,
        content=item.content,
        author=item.author,
        date=item.date,
        pinned=item.pinned,
    )


def _serialize_log(item: ActivityLogModel) -> ActivityLogRead:
    return ActivityLogRead(
        id=item.id,
        timestamp=item.timestamp.isoformat(),
        userId=item.user_id,
        userName=item.user_name,
        action=item.action,
        module=item.module,
        recordName=item.record_name,
        payload=item.payload,
    )

# ── Appliers ──────────────────────────────────────────────────────────────

def _apply_person(target: PersonModel, payload: PersonCreate | PersonUpdate) -> None:
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


def _apply_exercise(target: ExerciseModel, payload: ExerciseCreate | ExerciseUpdate) -> None:
    target.name = payload.name
    target.type = payload.type
    target.start_date = payload.startDate
    target.end_date = payload.endDate
    target.location = payload.location
    target.max_personnel = payload.maxPersonnel
    target.description = payload.description
    target.status = payload.status
    target.assigned = [item.model_dump() for item in payload.assigned]


def _apply_training(target: TrainingModel, payload: TrainingCreate | TrainingUpdate) -> None:
    target.name = payload.name
    target.type = payload.type
    target.start_date = payload.startDate
    target.end_date = payload.endDate
    target.location = payload.location
    target.organizer = payload.organizer
    target.qualification_id = payload.qualificationId
    target.max_personnel = payload.maxPersonnel
    target.description = payload.description
    target.status = payload.status
    target.assigned = [item.model_dump() for item in payload.assigned]


def _apply_event(target: EventModel, payload: EventCreate | EventUpdate) -> None:
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
    target.assigned = payload.assigned
    target.parent_id = payload.parentId


def _apply_equipment(target: EquipmentModel, payload: EquipmentCreate | EquipmentUpdate) -> None:
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


def _apply_supply(target: SupplyModel, payload: SupplyCreate | SupplyUpdate) -> None:
    target.name = payload.name
    target.category = payload.category
    target.unit = payload.unit
    target.current_qty = payload.currentQty
    target.min_qty = payload.minQty
    target.description = payload.description
    target.movements = [item.model_dump() for item in payload.movements]


def _apply_vehicle(target: VehicleModel, payload: VehicleCreate | VehicleUpdate) -> None:
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


def _apply_duty(target: DutyModel, payload: DutyCreate | DutyUpdate) -> None:
    target.type = payload.type
    target.start_date = payload.startDate
    target.end_date = payload.endDate
    target.location = payload.location
    assigned = [item.model_dump() for item in payload.assigned]
    if not assigned and payload.personId:
        assigned = [{"personId": payload.personId, "personName": payload.personName}]
    target.assigned = assigned
    if assigned:
        target.person_id = assigned[0].get("personId", "")
        target.person_name = assigned[0].get("personName", "")
    else:
        target.person_id = ""
        target.person_name = ""
    target.notes = payload.notes
    target.status = payload.status




def _serialize_bug_report(item: BugReportModel) -> BugReportRead:
    return BugReportRead(
        id=item.id,
        title=item.title,
        description=item.description,
        page=item.page or "",
        severity=item.severity,
        status=item.status,
        reportedBy=item.reported_by,
        reportedByName=item.reported_by_name,
        createdAt=item.created_at.isoformat(),
        resolvedAt=item.resolved_at.isoformat() if item.resolved_at else None,
        resolvedBy=item.resolved_by,
        screenshotData=item.screenshot_data,
    )
