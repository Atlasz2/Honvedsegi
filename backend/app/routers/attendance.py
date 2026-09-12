"""Napi létszámjelentés / jelenléti ív.

GET: egy adott nap névsora a katonák napi állapotával és összesítővel. Alapból
csak az aktív állomány (a tartalékosok igény szerint, include_reserve=True). A
rögzítetlen, jelenlévő katonák alapból 'Jelen' — az ügyintéző csak a kivételeket
jelöli, akár tömegesen. PUT: a nap állapotainak (be)írása (upsert).
"""
from __future__ import annotations

from datetime import date as date_cls

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..attendance_export import build_pdf, build_xlsx
from ..constants import LEAVE_TO_ATTENDANCE_STATUS
from ..core.dependencies import DB, Reader, Editor
from ..core.time import utc_now
from ..models import (
    AttendanceModel,
    EventModel,
    ExerciseModel,
    LeaveRequestModel,
    ParticipantModel,
    PersonModel,
    TrainingModel,
    new_id,
)
from ..schemas import AttendanceDayRead, AttendanceEntry, AttendanceFill, AttendanceUpdate

# A napi létszámba behúzható események forrásai és a foglalást nem jelentő státuszok.
_EVENT_SOURCES = [
    ("exercise", ExerciseModel),
    ("training", TrainingModel),
    ("event", EventModel),
]
_INACTIVE_EVENT_STATUSES = {"Törölve", "Befejezett", "Lemondva"}


def _event_name(item) -> str:
    return getattr(item, "name", None) or f"{getattr(item, 'type', '')} – {getattr(item, 'person_name', '') or item.id}"

_XLSX_MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


DEFAULT_STATUS = "Jelen"
_DISCHARGED_STATUS = "Leszerelt"
_RESERVE_STATUS = "Tartalékos"


def _parse_day(value: str) -> str:
    try:
        return date_cls.fromisoformat(value).isoformat()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="A dátum formátuma: ÉÉÉÉ-HH-NN")


def _build_day(db: Session, day: str, unit: str, include_reserve: bool = False) -> AttendanceDayRead:
    """Roster + összesítő egy napra, N+1 nélkül. Az állapot prioritása:
    explicit rekord > jóváhagyott szabadság/távollét > alapból 'Jelen'.

    Alapból csak az aktív állomány szerepel — a ~90% tartalékos nincs bent a napi
    rutinban, így nem kell 1500 sort kattintgatni. Egy tartalékos akkor jelenik
    meg, ha van rá aznapi rekord vagy jóváhagyott szabadság, vagy ha
    include_reserve=True (pl. behíváskor)."""
    records = db.scalars(select(AttendanceModel).where(AttendanceModel.date == day)).all()
    record_by_person = {r.personnel_id: r for r in records}

    # A napot lefedő, jóváhagyott szabadságok adják a (felülírható) alapállapotot.
    leaves = db.scalars(
        select(LeaveRequestModel).where(
            LeaveRequestModel.status == "Jóváhagyva",
            LeaveRequestModel.start_date <= day,
            LeaveRequestModel.end_date >= day,
        )
    ).all()
    leave_status_by_person: dict[str, str] = {}
    for leave in leaves:
        leave_status_by_person.setdefault(
            leave.personnel_id,
            LEAVE_TO_ATTENDANCE_STATUS.get(leave.type, "Igazolt távollét"),
        )

    person_query = select(PersonModel).where(PersonModel.status != _DISCHARGED_STATUS)
    if not include_reserve:
        # Aktív állomány + az a tartalékos, akire aznap van rekord vagy szabadság.
        relevant_ids = set(record_by_person) | set(leave_status_by_person)
        scope = PersonModel.status != _RESERVE_STATUS
        if relevant_ids:
            scope = or_(scope, PersonModel.id.in_(relevant_ids))
        person_query = person_query.where(scope)
    if unit.strip():
        person_query = person_query.where(PersonModel.unit == unit.strip())
    persons = db.scalars(person_query).all()

    entries: list[AttendanceEntry] = []
    summary: dict[str, int] = {}
    for person in sorted(persons, key=lambda p: (p.name or "")):
        record = record_by_person.get(person.id)
        if record:
            current_status, note = record.status, record.note
        elif person.id in leave_status_by_person:
            current_status, note = leave_status_by_person[person.id], ""
        else:
            current_status, note = DEFAULT_STATUS, ""
        entries.append(AttendanceEntry(
            personnelId=person.id, name=person.name, rank=person.rank,
            unit=person.unit, status=current_status, note=note,
        ))
        summary[current_status] = summary.get(current_status, 0) + 1

    return AttendanceDayRead(date=day, total=len(entries), summary=summary, items=entries)


@router.get("", response_model=AttendanceDayRead)
def get_attendance(db: DB, _: Reader, date: str = Query(..., description="ÉÉÉÉ-HH-NN"), unit: str = "", include_reserve: bool = False):
    return _build_day(db, _parse_day(date), unit, include_reserve)


@router.get("/export.xlsx")
def export_attendance_xlsx(db: DB, _: Reader, date: str = Query(...), unit: str = "", include_reserve: bool = False):
    day = _build_day(db, _parse_day(date), unit, include_reserve)
    content = build_xlsx(day, unit.strip() or "Összes")
    return Response(
        content=content, media_type=_XLSX_MEDIA,
        headers={"Content-Disposition": f"attachment; filename=letszamjelentes-{day.date}.xlsx"},
    )


@router.get("/export.pdf")
def export_attendance_pdf(db: DB, _: Reader, date: str = Query(...), unit: str = "", include_reserve: bool = False):
    day = _build_day(db, _parse_day(date), unit, include_reserve)
    content = build_pdf(day, unit.strip() or "Összes")
    return Response(
        content=content, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=letszamjelentes-{day.date}.pdf"},
    )


@router.get("/events")
def events_on_day(db: DB, _: Reader, date: str = Query(..., description="ÉÉÉÉ-HH-NN")):
    """Az adott napot lefedő, résztvevővel rendelkező aktív események — a napi
    létszám esemény-alapú kitöltéséhez (G2)."""
    day = _parse_day(date)
    result: list[dict] = []
    for event_type, model in _EVENT_SOURCES:
        for item in db.scalars(select(model)).all():
            if not (item.start_date[:10] <= day <= item.end_date[:10]):
                continue
            if getattr(item, "status", "") in _INACTIVE_EVENT_STATUSES:
                continue
            count = db.scalar(
                select(func.count()).select_from(ParticipantModel).where(
                    ParticipantModel.event_type == event_type,
                    ParticipantModel.event_id == item.id,
                )
            ) or 0
            if count == 0:
                continue
            result.append({
                "eventType": event_type,
                "eventId": item.id,
                "name": _event_name(item),
                "participantCount": count,
            })
    result.sort(key=lambda e: e["name"].lower())
    return result


@router.post("/fill", response_model=AttendanceDayRead)
def fill_from_event(payload: AttendanceFill, db: DB, user: Editor):
    """Egy esemény beosztott résztvevőit egy mozdulattal a megadott napi
    állapotra állítja (pl. 'ma gyakorlaton' → Szolgálatban)."""
    day = _parse_day(payload.date)
    participant_ids = db.scalars(
        select(ParticipantModel.personnel_id).where(
            ParticipantModel.event_type == payload.eventType,
            ParticipantModel.event_id == payload.eventId,
        )
    ).all()
    if not participant_ids:
        raise HTTPException(status_code=400, detail="Az eseménynek nincs beosztott résztvevője")

    existing = {
        r.personnel_id: r
        for r in db.scalars(select(AttendanceModel).where(AttendanceModel.date == day)).all()
    }
    for personnel_id in participant_ids:
        record = existing.get(personnel_id)
        if record is None:
            record = AttendanceModel(id=new_id(), date=day, personnel_id=personnel_id)
            db.add(record)
            existing[personnel_id] = record
        record.status = payload.status
        record.recorded_by = user.username
        record.recorded_at = utc_now()

    db.commit()
    return _build_day(db, day, "")


@router.put("", response_model=AttendanceDayRead)
def set_attendance(payload: AttendanceUpdate, db: DB, user: Editor):
    day = _parse_day(payload.date)

    valid_ids = set(db.scalars(select(PersonModel.id)).all())
    unknown = [m.personnelId for m in payload.items if m.personnelId not in valid_ids]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Ismeretlen személy azonosító(k): {', '.join(unknown)}")

    existing = {
        r.personnel_id: r
        for r in db.scalars(select(AttendanceModel).where(AttendanceModel.date == day)).all()
    }
    for mark in payload.items:
        record = existing.get(mark.personnelId)
        if record is None:
            record = AttendanceModel(id=new_id(), date=day, personnel_id=mark.personnelId)
            db.add(record)
            existing[mark.personnelId] = record
        record.status = mark.status
        record.note = mark.note
        record.recorded_by = user.username
        record.recorded_at = utc_now()

    db.commit()
    return _build_day(db, day, "")
