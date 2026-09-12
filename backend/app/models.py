from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from .db import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid4().hex


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    display_name: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Részleg (Jog, Személyügy, …): a Teendőim oldal ebből tudja, mely
    # parancs-fejezetek az övéi. Üres = nincs részleg-specifikus teendő.
    department: Mapped[str] = mapped_column(String, default="")
    protected: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class SessionTokenModel(Base):
    __tablename__ = "session_tokens"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    token: Mapped[str] = mapped_column(String, unique=True, index=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class LoginAttemptModel(Base):
    __tablename__ = "login_attempts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PersonModel(Base):
    __tablename__ = "personnel"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String, index=True)
    sztsz: Mapped[str] = mapped_column(String, unique=True, index=True)
    rank: Mapped[str] = mapped_column(String)
    unit: Mapped[str] = mapped_column(String)
    beosztas: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, index=True)
    email: Mapped[str] = mapped_column(String, default="")
    phone: Mapped[str] = mapped_column(String, default="")
    birth_date: Mapped[str] = mapped_column(String, default="")
    address: Mapped[str] = mapped_column(Text, default="")
    join_date: Mapped[str] = mapped_column(String, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    qualifications: Mapped[list[str]] = mapped_column(JSON, default=list)
    # A KGIR-export olyan oszlopai, amiknek nincs saját mezőjük (pl. anyja neve).
    # Csak az import írja; a felületen olvasható. Döntés (2026-09-11): mindent átemelünk.
    extra: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)


class AttendanceModel(Base):
    """Egy katona napi létszám-állapota (jelenléti ív / létszámjelentés).

    Naponta és személyenként legfeljebb egy rekord; a rögzítetlen katonák
    alapból 'Jelen'-nek számítanak a napi összesítőben."""
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("date", "personnel_id", name="uq_attendance_date_person"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    date: Mapped[str] = mapped_column(String, index=True)  # ISO nap: ÉÉÉÉ-HH-NN
    personnel_id: Mapped[str] = mapped_column(String, index=True)
    status: Mapped[str] = mapped_column(String)
    note: Mapped[str] = mapped_column(Text, default="")
    recorded_by: Mapped[str] = mapped_column(String, default="")
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class LeaveRequestModel(Base):
    """Szabadság / távollét kérelem, jóváhagyási folyamattal.

    A dátumok ISO 'ÉÉÉÉ-HH-NN' formátumúak, így a sztring-összehasonlítás
    kronologikus (pl. lefedettség-vizsgálathoz a napi létszámban)."""
    __tablename__ = "leave_requests"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    personnel_id: Mapped[str] = mapped_column(String, index=True)
    type: Mapped[str] = mapped_column(String)
    start_date: Mapped[str] = mapped_column(String, index=True)
    end_date: Mapped[str] = mapped_column(String, index=True)
    reason: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, index=True, default="Beadva")
    requested_by: Mapped[str] = mapped_column(String, default="")
    decided_by: Mapped[str] = mapped_column(String, default="")
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class EventPrerequisiteModel(Base):
    """Egy eseményhez (gyakorlat/kiképzés/esemény/ügyelet) tartozó belépési
    követelmény: a részvételhez/jelentkezéshez szükséges képesítés-típus.

    Ezzel modellezhető a progresszió (alap → haladó → emelt): a haladó szintű
    kiképzés követelménye az alapszint képesítése, és így tovább."""
    __tablename__ = "event_prerequisites"
    __table_args__ = (
        UniqueConstraint("event_type", "event_id", "qual_type_id", name="uq_event_prereq"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    event_type: Mapped[str] = mapped_column(String, index=True)
    event_id: Mapped[str] = mapped_column(String, index=True)
    qual_type_id: Mapped[str] = mapped_column(String, index=True)


class EventModel(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    event_type: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String, index=True)
    type: Mapped[str] = mapped_column(String)
    start_date: Mapped[str] = mapped_column(String, index=True)
    end_date: Mapped[str] = mapped_column(String)
    location: Mapped[str] = mapped_column(String, default="")
    organizer: Mapped[str | None] = mapped_column(String, nullable=True, default="")
    max_personnel: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, index=True)
    assigned: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    # Szülő művelet a művelet-fában. NULL = gyökérszintű elem.
    parent_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)


class ExerciseModel(Base):
    __tablename__ = "exercises"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String, index=True)
    type: Mapped[str] = mapped_column(String)
    start_date: Mapped[str] = mapped_column(String, index=True)
    end_date: Mapped[str] = mapped_column(String)
    location: Mapped[str] = mapped_column(String, default="")
    max_personnel: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, index=True)
    assigned: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    qualification_id: Mapped[str | None] = mapped_column(String, nullable=True, default="")  # teljesítéskor ezt adja
    series_id: Mapped[str] = mapped_column(String, default="", index=True)  # szülő felkészítés-sorozat
    level: Mapped[str] = mapped_column(String, default="")  # Alap/Haladó/Emelt


class SeriesModel(Base):
    """Felkészítés-sorozat (szülő „kártya"), pl. „7×20 Tartalékos szakfelkészítés".
    A gyakorlatok/kiképzések a series_id mezővel hivatkoznak rá."""
    __tablename__ = "operation_series"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class TrainingModel(Base):
    __tablename__ = "trainings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String, index=True)
    type: Mapped[str] = mapped_column(String)
    start_date: Mapped[str] = mapped_column(String, index=True)
    end_date: Mapped[str] = mapped_column(String)
    location: Mapped[str] = mapped_column(String, default="")
    organizer: Mapped[str] = mapped_column(String, default="")
    qualification_id: Mapped[str] = mapped_column(String, default="")
    max_personnel: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, index=True)
    assigned: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    series_id: Mapped[str] = mapped_column(String, default="", index=True)  # szülő felkészítés-sorozat
    level: Mapped[str] = mapped_column(String, default="")  # Alap/Haladó/Emelt

class EquipmentModel(Base):
    __tablename__ = "equipment"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String, index=True)
    category: Mapped[str] = mapped_column(String, index=True)
    serial_number: Mapped[str] = mapped_column(String, default="", index=True)
    qr_code: Mapped[str] = mapped_column(String, default="")
    condition: Mapped[str] = mapped_column(String, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    checked_out_to: Mapped[str | None] = mapped_column(String, nullable=True)
    checked_out_to_name: Mapped[str | None] = mapped_column(String, nullable=True)
    checked_out_date: Mapped[str | None] = mapped_column(String, nullable=True)
    checkout_history: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)


class SupplyModel(Base):
    __tablename__ = "supplies"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String, index=True)
    category: Mapped[str] = mapped_column(String, index=True)
    unit: Mapped[str] = mapped_column(String)
    current_qty: Mapped[int] = mapped_column(Integer, default=0)
    min_qty: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(Text, default="")
    movements: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)


class VehicleModel(Base):
    __tablename__ = "vehicles"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    plate_number: Mapped[str] = mapped_column(String, unique=True, index=True)
    type: Mapped[str] = mapped_column(String)
    make_model: Mapped[str] = mapped_column(String, default="")
    year: Mapped[int] = mapped_column(Integer, default=0)
    km: Mapped[int] = mapped_column(Integer, default=0)
    next_service: Mapped[str] = mapped_column(String, default="")
    next_inspection: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, index=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    assigned_to: Mapped[str | None] = mapped_column(String, nullable=True)
    assigned_to_name: Mapped[str | None] = mapped_column(String, nullable=True)
    service_log: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)


class DutyModel(Base):
    __tablename__ = "duties"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    type: Mapped[str] = mapped_column(String, index=True)
    start_date: Mapped[str] = mapped_column(String, index=True)
    end_date: Mapped[str] = mapped_column(String)
    location: Mapped[str] = mapped_column(String, default="")
    person_id: Mapped[str] = mapped_column(String, index=True)
    person_name: Mapped[str] = mapped_column(String)
    assigned: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, index=True)


class QualificationTypeModel(Base):
    """Képesítés-típus katalógus (pl. 'Alapkiképzés', 'Békeműveleti lőgyakorlat')."""
    __tablename__ = "qualification_types"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String, unique=True, index=True)
    category: Mapped[str] = mapped_column(String, index=True)
    validity_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description: Mapped[str] = mapped_column(Text, default="")


class PersonnelQualificationModel(Base):
    """Egy személy által megszerzett képesítés, lejárattal és forrásesemény-hivatkozással."""
    __tablename__ = "personnel_qualifications"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    personnel_id: Mapped[str] = mapped_column(String, index=True)
    qual_type_id: Mapped[str] = mapped_column(String, index=True)
    earned_date: Mapped[str] = mapped_column(String, index=True)
    expiry_date: Mapped[str | None] = mapped_column(String, nullable=True)
    source_event_id: Mapped[str | None] = mapped_column(String, nullable=True)
    source_event_type: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")


class ParticipantModel(Base):
    """Egy személy részvétele egy eseményen (gyakorlat/kiképzés/esemény/ügyelet)."""
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    event_type: Mapped[str] = mapped_column(String, index=True)
    event_id: Mapped[str] = mapped_column(String, index=True)
    personnel_id: Mapped[str] = mapped_column(String, index=True)
    person_name: Mapped[str] = mapped_column(String)
    rank: Mapped[str] = mapped_column(String, default="")
    rank_short: Mapped[str] = mapped_column(String, default="")
    sztsz: Mapped[str] = mapped_column(String, default="")
    role: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="Tervezett")
    qualification_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")


class AnnouncementModel(Base):
    __tablename__ = "announcements"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String, index=True)
    category: Mapped[str] = mapped_column(String, index=True)
    content: Mapped[str] = mapped_column(Text)
    author: Mapped[str] = mapped_column(String)
    date: Mapped[str] = mapped_column(String, index=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)


class PersonDocumentModel(Base):
    """Személyi okmány / alkalmasság, lejárattal (igazolvány, nemzetbiztonsági
    ellenőrzés, belépő, orvosi vagy fizikai alkalmasság). Lejáráskor a riasztó
    rendszer jelzi."""
    __tablename__ = "person_documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    personnel_id: Mapped[str] = mapped_column(String, index=True)
    category: Mapped[str] = mapped_column(String, default="Okmány")  # Okmány / Alkalmasság / Egyéb
    name: Mapped[str] = mapped_column(String)
    identifier: Mapped[str] = mapped_column(String, default="")  # okmányszám (opcionális)
    issued_date: Mapped[str] = mapped_column(String, default="")
    expiry_date: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    notes: Mapped[str] = mapped_column(Text, default="")


class ActivityLogModel(Base):
    __tablename__ = "activity_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, index=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    user_name: Mapped[str] = mapped_column(String)
    user_role: Mapped[str] = mapped_column(String, default="", index=True)  # szerepkör-szintű láthatósághoz
    action: Mapped[str] = mapped_column(String)
    module: Mapped[str] = mapped_column(String)
    record_name: Mapped[str] = mapped_column(String)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)


# ── Műveletek: jelenlét, anyagigény, dokumentumok ─────────────────────────

class OperationAttendanceModel(Base):
    """Egy művelet(-részfeladat) jelenléti íve.

    NEM keverendő az AttendanceModel-lel: az a napi létszámjelentés (A1),
    naptári nap szerint. Ez itt eseményhez kötött, és a művelet lezárásáig
    szerkeszthető."""
    __tablename__ = "operation_attendance"
    __table_args__ = (
        UniqueConstraint("sub_operation_id", "person_id", name="uq_operation_attendance_person"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    sub_operation_id: Mapped[str] = mapped_column(String, index=True)
    person_id: Mapped[str] = mapped_column(String, index=True)
    person_name: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="Pending")
    note: Mapped[str] = mapped_column(Text, default="")
    updated_by: Mapped[str] = mapped_column(String, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class MaterialRequirementModel(Base):
    """Egy művelethez igényelt anyag/eszköz, igénylés -> jóváhagyás -> teljesítés."""
    __tablename__ = "material_requirements"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    operation_id: Mapped[str] = mapped_column(String, index=True)
    item_name: Mapped[str] = mapped_column(String, index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    unit: Mapped[str] = mapped_column(String, default="")
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, default="Requested", index=True)


class OperationDocumentModel(Base):
    """Művelethez csatolt dokumentum.

    A fájl a lemezen él (uploads/operations/<művelet>/), a sorban csak a
    hivatkozás. A `filename` a tárolt, véletlen név; az `original_name` a
    felhasználó által adott — utóbbi soha nem kerül a fájlrendszerbe."""
    __tablename__ = "operation_documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    operation_id: Mapped[str] = mapped_column(String, index=True)
    filename: Mapped[str] = mapped_column(String)
    original_name: Mapped[str] = mapped_column(String)
    mime_type: Mapped[str] = mapped_column(String, default="application/octet-stream")
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    storage_path: Mapped[str] = mapped_column(String)
    uploaded_by: Mapped[str] = mapped_column(String, default="")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    title: Mapped[str | None] = mapped_column(String, nullable=True)


# ── Parancs-műhely (I5) ───────────────────────────────────────────────────────

class OrderTypeModel(Base):
    """Parancstípus (pl. leszerelési, vezénylési, behívó) a fejezet-sablonjával.

    A `chapters` JSON-lista: [{name, responsible, required, template}] — a
    sorrend a dokumentumbeli sorrend; a részlegek egymástól FÜGGETLENÜL
    dolgoznak rajtuk. A `template` a fejezet kiinduló szövege, {{név}}-szerű
    helyőrzőkkel. A `signers` a záró aláírók szerepe (2–3 illetékes
    parancsnok). Egy parancs létrehozásakor mindebből PILLANATKÉP készül, így a
    típus későbbi módosítása nem írja át a folyamatban lévő parancsokat."""
    __tablename__ = "order_types"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String, unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    chapters: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    signers: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class OrderModel(Base):
    """Egy konkrét parancs (pl. „Kiss Béla leszerelése"): a fejezetek szövegéből
    áll össze a dokumentum, a végén az aláírásokkal. A `signatures` JSON-lista:
    [{role, name, signed, signedAt, signedBy}]."""
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    order_type_id: Mapped[str] = mapped_column(String, index=True)
    type_name: Mapped[str] = mapped_column(String, default="")
    number: Mapped[str] = mapped_column(String, default="")
    issuer: Mapped[str] = mapped_column(String, default="")
    subject: Mapped[str] = mapped_column(String, index=True)
    personnel_id: Mapped[str] = mapped_column(String, default="", index=True)
    person_name: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, index=True, default="Előkészítés")
    due_date: Mapped[str] = mapped_column(String, default="", index=True)
    issued_date: Mapped[str] = mapped_column(String, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    signatures: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_by: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class OrderChapterModel(Base):
    """A parancs egy fejezete: ki felel érte, hol tart, mikorra kell — és a szövege."""
    __tablename__ = "order_chapters"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    order_id: Mapped[str] = mapped_column(String, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String)
    responsible: Mapped[str] = mapped_column(String, index=True)
    required: Mapped[bool] = mapped_column(Boolean, default=True)
    content: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, index=True, default="Nincs elkezdve")
    assignee: Mapped[str] = mapped_column(String, default="")
    due_date: Mapped[str] = mapped_column(String, default="")
    note: Mapped[str] = mapped_column(Text, default="")
    updated_by: Mapped[str] = mapped_column(String, default="")
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
