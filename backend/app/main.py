from __future__ import annotations

import os

from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, TypeVar

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import Response
from sqlalchemy import case, func, or_, select, text
from sqlalchemy.orm import Session

from .db import Base, SessionLocal, engine, get_db
from .models import (
    ActivityLogModel,
    AnnouncementModel,
    DutyModel,
    EventModel,
    EquipmentModel,
    ExerciseModel,
    LoginAttemptModel,
    PersonModel,
    SessionTokenModel,
    SupplyModel,
    TrainingModel,
    UserModel,
    VehicleModel,
)
from .schemas import (
    ActivityLogCreate,
    ActivityLogRead,
    AnnouncementCreate,
    AnnouncementRead,
    AnnouncementUpdate,
    AuthUser,
    DutyCreate,
    DutyRead,
    DutyUpdate,
    EquipmentCheckoutRequest,
    EquipmentCreate,
    EventCreate,
    EventRead,
    EventUpdate,
    EquipmentRead,
    EquipmentUpdate,
    ExerciseCreate,
    ExerciseRead,
    ExerciseUpdate,
    LoginRequest,
    LoginResponse,
    OperationRead,
    PersonCreate,
    PersonRead,
    PersonUpdate,
    SupplyCreate,
    SupplyMovementCreate,
    SupplyRead,
    SupplyUpdate,
    TrainingCreate,
    TrainingRead,
    TrainingUpdate,
    UserCreate,
    UserRead,
    UserUpdate,
    VehicleAssignRequest,
    VehicleCreate,
    VehicleRead,
    VehicleUpdate,
)
from .security import assert_password_strength, fingerprint_token, hash_password, issue_token, needs_rehash, verify_password
from .seed import seed_database


ModelT = TypeVar("ModelT")
SESSION_HOURS = 8
MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 15
GOD_USERNAME = "dev_master"
GOD_ROLE = "fejleszto"
BACKEND_ENV = os.getenv("BACKEND_ENV", "development").strip().lower()
IS_PRODUCTION = BACKEND_ENV == "production"


def _required_env_csv(name: str) -> list[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        raise RuntimeError(f"Hiányzó kötelező környezeti változó production módban: {name}")
    items = [item.strip() for item in raw.split(",") if item.strip()]
    if not items:
        raise RuntimeError(f"Üres környezeti változó production módban: {name}")
    return items

app = FastAPI(
    title="Guard Guard Duty API",
    version="1.0.0",
    description="FastAPI backend katonai adminisztrációs rendszerhez SQLite adatbázissal.",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

if IS_PRODUCTION:
    ALLOWED_ORIGINS = _required_env_csv("BACKEND_ALLOWED_ORIGINS")
    ALLOWED_HOSTS = _required_env_csv("BACKEND_ALLOWED_HOSTS")
else:
    _allowed_origins_raw = os.getenv("BACKEND_ALLOWED_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080")
    ALLOWED_ORIGINS = [origin.strip() for origin in _allowed_origins_raw.split(",") if origin.strip()]
    _allowed_hosts_raw = os.getenv("BACKEND_ALLOWED_HOSTS", "localhost,127.0.0.1")
    ALLOWED_HOSTS = [host.strip() for host in _allowed_hosts_raw.split(",") if host.strip()]

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=ALLOWED_HOSTS,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cache-Control"] = "no-store"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


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


def _date_overlap(start_value: str, end_value: str, range_start: date, range_end: date) -> bool:
    start = _parse_iso_date(start_value)
    end = _parse_iso_date(end_value)
    if not start or not end:
        return False
    return start <= range_end and end >= range_start


def _parse_iso_date(value: str) -> date | None:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None

    candidates = [raw]
    if len(raw) >= 10:
        candidates.append(raw[:10])
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


def _serialize_person(item: PersonModel) -> PersonRead:
    return PersonRead(
        id=item.id,
        name=item.name,
        sztsz=item.sztsz,
        rank=item.rank,
        unit=item.unit,
        status=item.status,
        email=item.email,
        phone=item.phone,
        birthDate=item.birth_date,
        address=item.address,
        joinDate=item.join_date,
        notes=item.notes,
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
        organizer=getattr(item, "organizer", "") or "",
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
    )


def _require_model(db: Session, model_type: type[ModelT], item_id: str) -> ModelT:
    item = db.get(model_type, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Az erőforrás nem található")
    return item


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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Csak a dev_master jogosult erre a műveletre")
    return user


def _enforce_single_god_user(db: Session) -> None:
    god_user = db.scalar(select(UserModel).where(UserModel.username == GOD_USERNAME))
    if not god_user:
        dev_pwd = os.getenv("BACKEND_DEV_MASTER_PASSWORD", "").strip()
        if not dev_pwd:
            raise RuntimeError("Hiányzó BACKEND_DEV_MASTER_PASSWORD a dev_master létrehozásához")
        god_user = UserModel(
            username=GOD_USERNAME,
            password_hash=hash_password(dev_pwd),
            display_name="Fejlesztő Mester",
            role=GOD_ROLE,
            active=True,
            protected=True,
        )
        db.add(god_user)

    god_user.role = GOD_ROLE
    god_user.active = True
    god_user.protected = True

    other_devs = db.scalars(
        select(UserModel).where(UserModel.role == GOD_ROLE, UserModel.username != GOD_USERNAME)
    ).all()
    for user in other_devs:
        user.role = "admin"
        user.protected = False

    db.commit()


def _normalize_sztsz(value: str) -> str:
    normalized = value.strip()
    if len(normalized) != 8 or not normalized.isdigit():
        raise HTTPException(status_code=400, detail="Az SZTSz pontosan 8 számjegy lehet")
    return normalized


def _assert_unique_sztsz(db: Session, sztsz: str, exclude_id: str | None = None) -> None:
    query = select(PersonModel).where(PersonModel.sztsz == sztsz)
    existing = db.scalar(query)
    if existing and existing.id != exclude_id:
        raise HTTPException(status_code=409, detail="Ez az SZTSz már létezik")


def _ensure_personnel_sztsz_schema(db: Session) -> None:
    columns = {row[1] for row in db.execute(text("PRAGMA table_info(personnel)")).fetchall()}
    if "sztsz" not in columns:
        db.execute(text("ALTER TABLE personnel ADD COLUMN sztsz TEXT"))

    rows = db.execute(text("SELECT id, sztsz FROM personnel ORDER BY id")).fetchall()
    used: set[str] = set()
    next_value = 10000000

    for person_id, sztsz in rows:
        normalized = str(sztsz).strip() if sztsz is not None else ""
        valid = len(normalized) == 8 and normalized.isdigit() and normalized not in used
        if valid:
            used.add(normalized)
            continue

        while True:
            candidate = f"{next_value:08d}"
            next_value += 1
            if candidate not in used:
                break

        used.add(candidate)
        db.execute(text("UPDATE personnel SET sztsz = :sztsz WHERE id = :id"), {"sztsz": candidate, "id": person_id})

    db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_personnel_sztsz ON personnel(sztsz)"))
    db.commit()


def _apply_person(target: PersonModel, payload: PersonCreate | PersonUpdate) -> None:
    target.name = payload.name
    target.sztsz = payload.sztsz
    target.rank = payload.rank
    target.unit = payload.unit
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
    if hasattr(target, "organizer"):
        target.organizer = payload.organizer
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
    target.person_id = payload.personId
    target.person_name = payload.personName
    target.notes = payload.notes
    target.status = payload.status


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_database(db)
        _ensure_personnel_sztsz_schema(db)
        _enforce_single_god_user(db)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/operations/summary")
def operations_summary(
    base_date: str | None = None,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_get_current_user),
):
    if base_date:
        parsed_base = _parse_iso_date(base_date)
        if not parsed_base:
            raise HTTPException(status_code=400, detail="Érvénytelen base_date formátum")
        base = parsed_base
    else:
        base = _utc_now().date()

    next_week_end = base + timedelta(days=7)
    plus14_day = base + timedelta(days=14)

    exercise_items = db.scalars(
        select(ExerciseModel).where(ExerciseModel.status.in_(["Tervezett", "Folyamatban"]))
    ).all()
    duty_items = db.scalars(
        select(DutyModel).where(DutyModel.status.in_(["Tervezett", "Teljesített"]))
    ).all()

    shooting_keywords = ["lőtér", "loter", "loter"]
    next_week_shooting = []
    for item in exercise_items:
        start = _parse_iso_date(item.start_date)
        end = _parse_iso_date(item.end_date)
        if not start or not end:
            continue
        if end < base or start > next_week_end:
            continue
        location_lower = (item.location or "").lower()
        if not any(keyword in location_lower for keyword in shooting_keywords):
            continue
        next_week_shooting.append(
            {
                "id": item.id,
                "name": item.name,
                "startDate": item.start_date,
                "endDate": item.end_date,
                "location": item.location,
                "status": item.status,
                "assignedCount": len(item.assigned or []),
                "maxPersonnel": item.max_personnel,
            }
        )

    plus14_duties = []
    for item in duty_items:
        start = _parse_iso_date(item.start_date)
        end = _parse_iso_date(item.end_date)
        if not start or not end:
            continue
        if start <= plus14_day <= end:
            plus14_duties.append(
                {
                    "id": item.id,
                    "type": item.type,
                    "startDate": item.start_date,
                    "endDate": item.end_date,
                    "location": item.location,
                    "personId": item.person_id,
                    "personName": item.person_name,
                    "status": item.status,
                }
            )

    return {
        "baseDate": base.isoformat(),
        "nextWeekEnd": next_week_end.isoformat(),
        "plus14Date": plus14_day.isoformat(),
        "nextWeekShooting": {
            "count": len(next_week_shooting),
            "items": sorted(next_week_shooting, key=lambda x: x["startDate"]),
        },
        "plus14Duties": {
            "count": len(plus14_duties),
            "items": sorted(plus14_duties, key=lambda x: x["startDate"]),
        },
    }


@app.get("/api/reports/operations.pdf")
def operations_pdf_report(
    date_from: str | None = None,
    date_to: str | None = None,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_get_current_user),
):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"PDF modul hiba: {exc}") from exc

    start_date = _parse_iso_date(date_from) if date_from else _utc_now().date()
    end_date = _parse_iso_date(date_to) if date_to else start_date + timedelta(days=30)

    if not start_date or not end_date:
        raise HTTPException(status_code=400, detail="Érvénytelen dátumtartomány")
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="A záró dátum nem lehet korábbi")

    exercise_items = [
        item for item in db.scalars(select(ExerciseModel).order_by(ExerciseModel.start_date)).all()
        if _date_overlap(item.start_date, item.end_date, start_date, end_date)
    ]
    training_items = [
        item for item in db.scalars(select(TrainingModel).order_by(TrainingModel.start_date)).all()
        if _date_overlap(item.start_date, item.end_date, start_date, end_date)
    ]
    duty_items = [
        item for item in db.scalars(select(DutyModel).order_by(DutyModel.start_date)).all()
        if _date_overlap(item.start_date, item.end_date, start_date, end_date)
    ]

    from io import BytesIO

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    y = height - 40

    def line(text_value: str):
        nonlocal y
        if y < 40:
            pdf.showPage()
            y = height - 40
        pdf.drawString(40, y, text_value)
        y -= 14

    pdf.setFont("Helvetica-Bold", 12)
    line("Hadmuveleti riport")
    pdf.setFont("Helvetica", 10)
    line(f"Intervallum: {start_date.isoformat()} - {end_date.isoformat()}")
    line("")

    pdf.setFont("Helvetica-Bold", 11)
    line(f"Gyakorlatok ({len(exercise_items)} db)")
    pdf.setFont("Helvetica", 9)
    for item in exercise_items[:300]:
        line(f"- {item.start_date} -> {item.end_date} | {item.name} | {item.location} | {item.status}")

    line("")
    pdf.setFont("Helvetica-Bold", 11)
    line(f"Kikepzesek ({len(training_items)} db)")
    pdf.setFont("Helvetica", 9)
    for item in training_items[:300]:
        line(f"- {item.start_date} -> {item.end_date} | {item.name} | {item.location} | {item.status}")

    line("")
    pdf.setFont("Helvetica-Bold", 11)
    line(f"Szolgalatok ({len(duty_items)} db)")
    pdf.setFont("Helvetica", 9)
    for item in duty_items[:400]:
        line(f"- {item.start_date} -> {item.end_date} | {item.type} | {item.person_name} | {item.location} | {item.status}")

    pdf.save()
    data = buffer.getvalue()
    buffer.close()

    return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=hadmuveleti-riport.pdf"})


@app.post("/api/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    attempt = _get_login_attempt(db, payload.username)
    if _is_login_locked(attempt):
        raise HTTPException(status_code=429, detail="Túl sok hibás próbálkozás. Próbáld újra később.")

    user = db.scalar(select(UserModel).where(UserModel.username == payload.username))
    if not user or not verify_password(payload.password, user.password_hash):
        _register_failed_login(db, payload.username)
        raise HTTPException(status_code=401, detail="Hibás felhasználónév vagy jelszó")
    if not user.active:
        raise HTTPException(status_code=403, detail="A felhasználó inaktív")

    if needs_rehash(user.password_hash):
        try:
            assert_password_strength(payload.password)
            user.password_hash = hash_password(payload.password)
        except ValueError:
            # Régi, gyenge jelszó esetén ne bukjon el a login; a rehash ilyenkor elmarad.
            pass

    _reset_login_attempt(db, payload.username)

    expiry = _utc_now() + timedelta(hours=SESSION_HOURS)
    user.last_login = _utc_now()
    token_value = issue_token()
    token_key = fingerprint_token(token_value)
    db.add(SessionTokenModel(token=token_key, user_id=user.id, expires_at=expiry))
    db.commit()
    db.refresh(user)
    return LoginResponse(token=token_value, user=_user_to_auth_payload(user, expiry))


@app.get("/api/auth/me", response_model=AuthUser)
def me(user: UserModel = Depends(_get_current_user)) -> AuthUser:
    expiry = _utc_now() + timedelta(hours=SESSION_HOURS)
    return _user_to_auth_payload(user, expiry)


@app.post("/api/auth/logout", status_code=204)
def logout(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
    _: UserModel = Depends(_get_current_user),
):
    token_value = authorization.split(" ", 1)[1].strip()
    token_key = fingerprint_token(token_value)
    session_token = db.scalar(select(SessionTokenModel).where(SessionTokenModel.token == token_key))
    if session_token:
        db.delete(session_token)
        db.commit()


@app.get("/api/users", response_model=list[UserRead])
def list_users(db: Session = Depends(get_db), current_user: UserModel = Depends(_require_admin)) -> list[UserRead]:
    items = db.scalars(select(UserModel).order_by(UserModel.username)).all()
    if not _is_god_user(current_user):
        items = [u for u in items if u.username != GOD_USERNAME and u.role != GOD_ROLE]
    return [_to_user_read(item) for item in items]


@app.post("/api/users", response_model=UserRead)
def create_user(payload: UserCreate, db: Session = Depends(get_db), current_user: UserModel = Depends(_require_admin)) -> UserRead:
    if db.scalar(select(UserModel).where(UserModel.username == payload.username)):
        raise HTTPException(status_code=409, detail="Ez a felhasználónév már foglalt")
    if payload.username == GOD_USERNAME or payload.role == GOD_ROLE:
        raise HTTPException(status_code=403, detail="A dev_master szint kizárólagos és nem osztható ki")
    if current_user.role == "admin" and payload.role == GOD_ROLE:
        raise HTTPException(status_code=403, detail="Admin nem hozhat létre fejlesztő szintű felhasználót")
    assert_password_strength(payload.password)
    user = UserModel(
        username=payload.username,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        role=payload.role,
        active=payload.active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _to_user_read(user)


@app.put("/api/users/{username}", response_model=UserRead)
def update_user(username: str, payload: UserUpdate, db: Session = Depends(get_db), current_user: UserModel = Depends(_require_admin)) -> UserRead:
    user = db.scalar(select(UserModel).where(UserModel.username == username))
    if not user:
        raise HTTPException(status_code=404, detail="Felhasználó nem található")
    if user.protected:
        raise HTTPException(status_code=403, detail="Vedett felhasznalo nem modositható")
    if user.username == GOD_USERNAME or payload.role == GOD_ROLE:
        raise HTTPException(status_code=403, detail="A dev_master szint kizárólagos és nem módosítható")
    if current_user.role == "admin" and (user.role == GOD_ROLE or payload.role == GOD_ROLE):
        raise HTTPException(status_code=403, detail="Admin nem adhat fejlesztő szintet")
    user.display_name = payload.display_name
    user.role = payload.role
    user.active = payload.active
    if payload.password:
        assert_password_strength(payload.password)
        user.password_hash = hash_password(payload.password)
    db.commit()
    db.refresh(user)
    return _to_user_read(user)




@app.delete("/api/users/{username}", status_code=204)
def delete_user(username: str, db: Session = Depends(get_db), current_user: UserModel = Depends(_require_admin)):
    user = db.scalar(select(UserModel).where(UserModel.username == username))
    if not user:
        raise HTTPException(status_code=404, detail="Felhasználó nem található")
    if user.protected or user.username == GOD_USERNAME or user.role == GOD_ROLE:
        raise HTTPException(status_code=403, detail="A dev_master felhasználó nem törölhető")
    if current_user.role == "admin" and user.role == GOD_ROLE:
        raise HTTPException(status_code=403, detail="Admin nem törölhet fejlesztő szintű felhasználót")
    
    # Logout all sessions for this user
    db.query(SessionTokenModel).filter(SessionTokenModel.user_id == user.id).delete()
    
    db.delete(user)
    db.commit()


@app.get("/api/personnel", response_model=list[PersonRead])
def list_personnel(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[PersonRead]:
    items = db.scalars(select(PersonModel).order_by(PersonModel.name)).all()
    return [_serialize_person(item) for item in items]


@app.get("/api/personnel/paged")
def list_personnel_paged(
    page: int = 1,
    page_size: int = 25,
    q: str = "",
    unit: str = "",
    status_filter: str = "",
    sort_by: str = "name",
    sort_dir: str = "asc",
    db: Session = Depends(get_db),
    _: UserModel = Depends(_get_current_user),
):
    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    filters = []
    if q.strip():
        pattern = f"%{q.strip()}%"
        filters.append(
            or_(
                PersonModel.name.ilike(pattern),
                PersonModel.sztsz.ilike(pattern),
                PersonModel.rank.ilike(pattern),
                PersonModel.unit.ilike(pattern),
            )
        )
    if unit.strip():
        filters.append(PersonModel.unit == unit.strip())
    if status_filter.strip() and status_filter.strip() != "Összes":
        filters.append(PersonModel.status == status_filter.strip())

    base_query = select(PersonModel)
    count_query = select(func.count(PersonModel.id))
    for condition in filters:
        base_query = base_query.where(condition)
        count_query = count_query.where(condition)

    rank_order = case(
        (PersonModel.rank == "Közlegény", 1),
        (PersonModel.rank == "Tizedes", 2),
        (PersonModel.rank == "Szakaszvezető", 3),
        (PersonModel.rank == "Őrmester", 4),
        (PersonModel.rank == "Törzsőrmester", 5),
        (PersonModel.rank == "Főtörzsőrmester", 6),
        (PersonModel.rank == "Zászlós", 7),
        (PersonModel.rank == "Törzszászlós", 8),
        (PersonModel.rank == "Főtörzszászlós", 9),
        (PersonModel.rank == "Hadnagy", 10),
        (PersonModel.rank == "Főhadnagy", 11),
        (PersonModel.rank == "Százados", 12),
        (PersonModel.rank == "Őrnagy", 13),
        (PersonModel.rank == "Alezredes", 14),
        (PersonModel.rank == "Ezredes", 15),
        else_=999,
    )
    sort_fields = {
        "name": PersonModel.name,
        "rank": rank_order,
        "sztsz": PersonModel.sztsz,
        "unit": PersonModel.unit,
        "status": PersonModel.status,
        "joinDate": PersonModel.join_date,
    }
    sort_column = sort_fields.get(sort_by, PersonModel.name)
    order_clause = sort_column.desc() if sort_dir.lower() == "desc" else sort_column.asc()

    total = db.scalar(count_query) or 0
    total_pages = max(1, (total + page_size - 1) // page_size)
    page = min(page, total_pages)
    offset = (page - 1) * page_size

    items = db.scalars(base_query.order_by(order_clause, PersonModel.name.asc()).offset(offset).limit(page_size)).all()

    return {
        "items": [_serialize_person(item).model_dump() for item in items],
        "page": page,
        "pageSize": page_size,
        "total": total,
        "totalPages": total_pages,
    }


@app.post("/api/personnel", response_model=PersonRead)
def create_person(payload: PersonCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> PersonRead:
    normalized_sztsz = _normalize_sztsz(payload.sztsz)
    _assert_unique_sztsz(db, normalized_sztsz)

    item = PersonModel()
    payload.sztsz = normalized_sztsz
    _apply_person(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_person(item)


@app.put("/api/personnel/{item_id}", response_model=PersonRead)
def update_person(item_id: str, payload: PersonUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> PersonRead:
    item = _require_model(db, PersonModel, item_id)
    normalized_sztsz = _normalize_sztsz(payload.sztsz)
    _assert_unique_sztsz(db, normalized_sztsz, exclude_id=item_id)

    payload.sztsz = normalized_sztsz
    _apply_person(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_person(item)


@app.delete("/api/personnel/{item_id}", status_code=204)
def delete_person(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, PersonModel, item_id)
    db.delete(item)
    db.commit()


@app.get("/api/exercises", response_model=list[ExerciseRead])
def list_exercises(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[ExerciseRead]:
    items = db.scalars(select(ExerciseModel).order_by(ExerciseModel.start_date)).all()
    return [_serialize_exercise(item) for item in items]


@app.post("/api/exercises", response_model=ExerciseRead)
def create_exercise(payload: ExerciseCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> ExerciseRead:
    item = ExerciseModel()
    _apply_exercise(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_exercise(item)


@app.put("/api/exercises/{item_id}", response_model=ExerciseRead)
def update_exercise(item_id: str, payload: ExerciseUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> ExerciseRead:
    item = _require_model(db, ExerciseModel, item_id)
    _apply_exercise(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_exercise(item)


@app.delete("/api/exercises/{item_id}", status_code=204)
def delete_exercise(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, ExerciseModel, item_id)
    db.delete(item)
    db.commit()


@app.get("/api/trainings", response_model=list[TrainingRead])
def list_trainings(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[TrainingRead]:
    items = db.scalars(select(TrainingModel).order_by(TrainingModel.start_date)).all()
    return [_serialize_training(item) for item in items]


@app.post("/api/trainings", response_model=TrainingRead)
def create_training(payload: TrainingCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> TrainingRead:
    item = TrainingModel()
    _apply_training(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_training(item)


@app.put("/api/trainings/{item_id}", response_model=TrainingRead)
def update_training(item_id: str, payload: TrainingUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> TrainingRead:
    item = _require_model(db, TrainingModel, item_id)
    _apply_training(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_training(item)


@app.delete("/api/trainings/{item_id}", status_code=204)
def delete_training(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, TrainingModel, item_id)
    db.delete(item)
    db.commit()


@app.get("/api/operations", response_model=list[OperationRead])
def list_operations(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[OperationRead]:
    exercises = db.scalars(select(ExerciseModel).order_by(ExerciseModel.start_date)).all()
    trainings = db.scalars(select(TrainingModel).order_by(TrainingModel.start_date)).all()
    
    operations = []
    
    for ex in exercises:
        operations.append(OperationRead(
            id=ex.id,
            name=ex.name,
            type=ex.type,
            operationType="exercise",
            startDate=ex.start_date,
            endDate=ex.end_date,
            location=ex.location,
            organizer=None,
            maxPersonnel=ex.max_personnel,
            description=ex.description,
            status=ex.status,
            assigned=ex.assigned or [],
        ))
    
    for tr in trainings:
        operations.append(OperationRead(
            id=tr.id,
            name=tr.name,
            type=tr.type,
            operationType="training",
            startDate=tr.start_date,
            endDate=tr.end_date,
            location=tr.location,
            organizer=getattr(tr, "organizer", "") or "",
            maxPersonnel=tr.max_personnel,
            description=tr.description,
            status=tr.status,
            assigned=tr.assigned or [],
        ))
    
    operations.sort(key=lambda x: x.startDate)
    return operations

@app.get("/api/events", response_model=list[EventRead])
def list_events(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[EventRead]:
    items = db.scalars(select(EventModel).order_by(EventModel.start_date)).all()
    return [_serialize_event(item) for item in items]


@app.post("/api/events", response_model=EventRead)
def create_event(payload: EventCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> EventRead:
    item = EventModel()
    _apply_event(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_event(item)


@app.put("/api/events/{item_id}", response_model=EventRead)
def update_event(item_id: str, payload: EventUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> EventRead:
    item = _require_model(db, EventModel, item_id)
    _apply_event(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_event(item)


@app.delete("/api/events/{item_id}", status_code=204)
def delete_event(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, EventModel, item_id)
    db.delete(item)
    db.commit()


@app.get("/api/equipment", response_model=list[EquipmentRead])
def list_equipment(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[EquipmentRead]:
    items = db.scalars(select(EquipmentModel).order_by(EquipmentModel.name, EquipmentModel.serial_number)).all()
    return [_serialize_equipment(item) for item in items]


@app.post("/api/equipment", response_model=EquipmentRead)
def create_equipment(payload: EquipmentCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> EquipmentRead:
    item = EquipmentModel()
    _apply_equipment(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_equipment(item)


@app.put("/api/equipment/{item_id}", response_model=EquipmentRead)
def update_equipment(item_id: str, payload: EquipmentUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> EquipmentRead:
    item = _require_model(db, EquipmentModel, item_id)
    _apply_equipment(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_equipment(item)


@app.post("/api/equipment/{item_id}/checkout", response_model=EquipmentRead)
def checkout_equipment(item_id: str, payload: EquipmentCheckoutRequest, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> EquipmentRead:
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


@app.post("/api/equipment/{item_id}/return", response_model=EquipmentRead)
def return_equipment(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> EquipmentRead:
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


@app.delete("/api/equipment/{item_id}", status_code=204)
def delete_equipment(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, EquipmentModel, item_id)
    db.delete(item)
    db.commit()


@app.get("/api/supplies", response_model=list[SupplyRead])
def list_supplies(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[SupplyRead]:
    items = db.scalars(select(SupplyModel).order_by(SupplyModel.name)).all()
    return [_serialize_supply(item) for item in items]


@app.post("/api/supplies", response_model=SupplyRead)
def create_supply(payload: SupplyCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> SupplyRead:
    item = SupplyModel()
    _apply_supply(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_supply(item)


@app.put("/api/supplies/{item_id}", response_model=SupplyRead)
def update_supply(item_id: str, payload: SupplyUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> SupplyRead:
    item = _require_model(db, SupplyModel, item_id)
    _apply_supply(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_supply(item)


@app.post("/api/supplies/{item_id}/movements", response_model=SupplyRead)
def create_supply_movement(item_id: str, payload: SupplyMovementCreate, db: Session = Depends(get_db), user: UserModel = Depends(_require_editor)) -> SupplyRead:
    item = _require_model(db, SupplyModel, item_id)
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="A mennyiségnek pozitívnak kell lennie")
    current_qty = item.current_qty
    if payload.type in {"Bevételezés", "Visszavétel"}:
        current_qty += payload.quantity
    elif payload.type in {"Kiadás", "Selejtezés"}:
        current_qty = max(0, current_qty - payload.quantity)
    else:
        current_qty = payload.quantity
    movement = {
        "id": issue_token(),
        "type": payload.type,
        "quantity": payload.quantity,
        "note": payload.note,
        "date": _utc_now().isoformat(),
        "userId": user.username,
        "userName": user.display_name,
    }
    item.current_qty = current_qty
    item.movements = [movement, *(item.movements or [])]
    db.commit()
    db.refresh(item)
    return _serialize_supply(item)


@app.delete("/api/supplies/{item_id}", status_code=204)
def delete_supply(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, SupplyModel, item_id)
    db.delete(item)
    db.commit()


@app.get("/api/vehicles", response_model=list[VehicleRead])
def list_vehicles(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[VehicleRead]:
    items = db.scalars(select(VehicleModel).order_by(VehicleModel.plate_number)).all()
    return [_serialize_vehicle(item) for item in items]


@app.post("/api/vehicles", response_model=VehicleRead)
def create_vehicle(payload: VehicleCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> VehicleRead:
    item = VehicleModel()
    _apply_vehicle(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_vehicle(item)


@app.put("/api/vehicles/{item_id}", response_model=VehicleRead)
def update_vehicle(item_id: str, payload: VehicleUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> VehicleRead:
    item = _require_model(db, VehicleModel, item_id)
    _apply_vehicle(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_vehicle(item)


@app.post("/api/vehicles/{item_id}/assign", response_model=VehicleRead)
def assign_vehicle(item_id: str, payload: VehicleAssignRequest, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> VehicleRead:
    item = _require_model(db, VehicleModel, item_id)
    person = _require_model(db, PersonModel, payload.personId)
    item.assigned_to = person.id
    item.assigned_to_name = person.name
    item.status = "Használatban"
    db.commit()
    db.refresh(item)
    return _serialize_vehicle(item)


@app.post("/api/vehicles/{item_id}/return", response_model=VehicleRead)
def return_vehicle(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> VehicleRead:
    item = _require_model(db, VehicleModel, item_id)
    item.assigned_to = None
    item.assigned_to_name = None
    if item.status == "Használatban":
        item.status = "Elérhető"
    db.commit()
    db.refresh(item)
    return _serialize_vehicle(item)


@app.delete("/api/vehicles/{item_id}", status_code=204)
def delete_vehicle(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, VehicleModel, item_id)
    db.delete(item)
    db.commit()


@app.get("/api/duties", response_model=list[DutyRead])
def list_duties(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[DutyRead]:
    items = db.scalars(select(DutyModel).order_by(DutyModel.start_date)).all()
    return [_serialize_duty(item) for item in items]


@app.post("/api/duties", response_model=DutyRead)
def create_duty(payload: DutyCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> DutyRead:
    item = DutyModel()
    _apply_duty(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_duty(item)


@app.put("/api/duties/{item_id}", response_model=DutyRead)
def update_duty(item_id: str, payload: DutyUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> DutyRead:
    item = _require_model(db, DutyModel, item_id)
    _apply_duty(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_duty(item)


@app.delete("/api/duties/{item_id}", status_code=204)
def delete_duty(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, DutyModel, item_id)
    db.delete(item)
    db.commit()


@app.get("/api/announcements", response_model=list[AnnouncementRead])
def list_announcements(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[AnnouncementRead]:
    items = db.scalars(select(AnnouncementModel).order_by(AnnouncementModel.pinned.desc(), AnnouncementModel.date.desc())).all()
    return [_serialize_announcement(item) for item in items]


@app.post("/api/announcements", response_model=AnnouncementRead)
def create_announcement(payload: AnnouncementCreate, db: Session = Depends(get_db), user: UserModel = Depends(_require_editor)) -> AnnouncementRead:
    item = AnnouncementModel(
        title=payload.title,
        category=payload.category,
        content=payload.content,
        author=user.display_name,
        date=_utc_now().date().isoformat(),
        pinned=payload.pinned,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_announcement(item)


@app.put("/api/announcements/{item_id}", response_model=AnnouncementRead)
def update_announcement(item_id: str, payload: AnnouncementUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> AnnouncementRead:
    item = _require_model(db, AnnouncementModel, item_id)
    item.title = payload.title
    item.category = payload.category
    item.content = payload.content
    item.pinned = payload.pinned
    db.commit()
    db.refresh(item)
    return _serialize_announcement(item)


@app.delete("/api/announcements/{item_id}", status_code=204)
def delete_announcement(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, AnnouncementModel, item_id)
    db.delete(item)
    db.commit()


@app.get("/api/activity-log", response_model=list[ActivityLogRead])
def list_activity_logs(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[ActivityLogRead]:
    items = db.scalars(select(ActivityLogModel).order_by(ActivityLogModel.timestamp.desc())).all()
    return [_serialize_log(item) for item in items]


@app.post("/api/activity-log", response_model=ActivityLogRead)
def create_activity_log(payload: ActivityLogCreate, db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> ActivityLogRead:
    item = ActivityLogModel(
        user_id=payload.userId,
        user_name=payload.userName,
        action=payload.action,
        module=payload.module,
        record_name=payload.recordName,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_log(item)





