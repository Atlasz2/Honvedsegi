"""Személy törlése a hozzá tartozó rekordokkal együtt.

Az adatbázisban nincs idegen kulcs (a táblák SQLite-ban, ALTER nélkül nőttek),
ezért a személyhez kötött sorokat itt, egy helyen tartjuk számon. Ami a
személy nélkül értelmetlen (okmány, szabadság, napi létszám, képesítés,
részvétel), az vele együtt megy. A kiadott parancs hivatalos irat, a nevet
magában hordozza, ezért marad.

Előzményes személyt csak admin törölhet véglegesen; az ügyintézőnek a
„Leszerelt" státusz az archívum (a riasztások, a létszám és a kampányterv
már most kihagyja).
"""
from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..models import (
    AttendanceModel,
    EquipmentModel,
    LeaveRequestModel,
    OperationAttendanceModel,
    ParticipantModel,
    PersonDocumentModel,
    PersonModel,
    PersonnelQualificationModel,
    VehicleModel,
)

#: (címke, modell, a személyre mutató oszlop)
DEPENDENTS = (
    ("okmány", PersonDocumentModel, PersonDocumentModel.personnel_id),
    ("képesítés", PersonnelQualificationModel, PersonnelQualificationModel.personnel_id),
    ("részvétel", ParticipantModel, ParticipantModel.personnel_id),
    ("műveleti jelenlét", OperationAttendanceModel, OperationAttendanceModel.person_id),
    ("szabadság", LeaveRequestModel, LeaveRequestModel.personnel_id),
    ("napi létszám", AttendanceModel, AttendanceModel.personnel_id),
)


def history_counts(db: Session, person_id: str) -> dict[str, int]:
    """A személyhez kötött rekordok száma típusonként (csak a nem nullák)."""
    counts: dict[str, int] = {}
    for label, model, column in DEPENDENTS:
        n = db.scalar(select(func.count()).select_from(model).where(column == person_id)) or 0
        if n:
            counts[label] = n
    return counts


def held_items(db: Session, person_id: str) -> list[str]:
    """A személynél lévő felszerelés és jármű — ezeket törlés előtt vissza kell venni."""
    equipment = db.scalars(select(EquipmentModel.name).where(EquipmentModel.checked_out_to == person_id)).all()
    vehicles = db.scalars(select(VehicleModel.plate_number).where(VehicleModel.assigned_to == person_id)).all()
    return [*equipment, *vehicles]


def delete_dependents(db: Session, person_id: str) -> None:
    for _label, model, column in DEPENDENTS:
        db.execute(delete(model).where(column == person_id))


def remove_orphans(db: Session) -> dict[str, int]:
    """Törli azokat a sorokat, amelyek már nem létező személyre mutatnak.

    A felszerelést és a járművet nem érinti: ha egy törölt személynél maradt
    valami, az valóban nincs visszavéve, a név ott a helyes nyom."""
    existing = select(PersonModel.id)
    removed: dict[str, int] = {}
    for label, model, column in DEPENDENTS:
        result = db.execute(delete(model).where(column.not_in(existing)))
        if result.rowcount:
            removed[label] = result.rowcount
    return removed


def describe(counts: dict[str, int]) -> str:
    return ", ".join(f"{n} {label}" for label, n in counts.items())
