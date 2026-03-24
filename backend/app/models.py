from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Integer, String, Text
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
    status: Mapped[str] = mapped_column(String, index=True)
    email: Mapped[str] = mapped_column(String, default="")
    phone: Mapped[str] = mapped_column(String, default="")
    birth_date: Mapped[str] = mapped_column(String, default="")
    address: Mapped[str] = mapped_column(Text, default="")
    join_date: Mapped[str] = mapped_column(String, default="")
    notes: Mapped[str] = mapped_column(Text, default="")


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


class TrainingModel(Base):
    __tablename__ = "trainings"

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
    notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, index=True)


class AnnouncementModel(Base):
    __tablename__ = "announcements"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String, index=True)
    category: Mapped[str] = mapped_column(String, index=True)
    content: Mapped[str] = mapped_column(Text)
    author: Mapped[str] = mapped_column(String)
    date: Mapped[str] = mapped_column(String, index=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)


class ActivityLogModel(Base):
    __tablename__ = "activity_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, index=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    user_name: Mapped[str] = mapped_column(String)
    action: Mapped[str] = mapped_column(String)
    module: Mapped[str] = mapped_column(String)
    record_name: Mapped[str] = mapped_column(String)

