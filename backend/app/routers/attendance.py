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
from ..core.scope import scoped_owned, scoped_persons
from ..core.scope import own_unit, scope_units
from ..audit import record_activity
from ..core.dependencies import DB, Reader, Editor
from ..core.time import utc_now
from ..models import (
    visible_events,
    AttendanceClosureModel,
    AttendanceModel,
    EventModel,
    ExerciseModel,
    LeaveRequestModel,
    ParticipantModel,
    PersonModel,
    new_id,
)
from ..schemas import AttendanceCloseRequest, AttendanceClosure, AttendanceDayRead, AttendanceEntry, AttendanceFill, AttendanceUpdate

# A napi létszámba behúzható események forrásai és a foglalást nem jelentő státuszok.
_EVENT_SOURCES = [
    ("exercise", ExerciseModel),
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


def _closures_for(db: Session, day: str, user) -> list[AttendanceClosure]:
    from ..constants import unit_label
    rows = db.scalars(select(AttendanceClosureModel).where(AttendanceClosureModel.date == day).order_by(AttendanceClosureModel.closed_at)).all()
    units = scope_units(user) if user is not None else None
    out = []
    for r in rows:
        if units is not None and r.unit and r.unit not in units:
            continue
        out.append(AttendanceClosure(unit=r.unit, unitLabel=unit_label(r.unit) if r.unit else "Ezredszint", closedBy=r.closed_by,
                                     closedByName=r.closed_by_name, closedAt=r.closed_at, note=r.note or ""))
    return out


def _closed_for(db: Session, day: str, user) -> AttendanceClosureModel | None:
    """A kérő zászlóaljának (vagy ezredszinten) lezárása, ha van."""
    mine = own_unit(user) if user is not None else ""
    return db.scalar(select(AttendanceClosureModel).where(AttendanceClosureModel.date == day, AttendanceClosureModel.unit == mine))


def _build_day(db: Session, day: str, unit: str, include_reserve: bool = False, user=None) -> AttendanceDayRead:
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
    if user is not None:
        person_query = scoped_persons(person_query, user)   # csak a saját terület állománya
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

    return AttendanceDayRead(date=day, total=len(entries), summary=summary, items=entries, closures=_closures_for(db, day, user), closedForMe=_closed_for(db, day, user) is not None)


@router.get("", response_model=AttendanceDayRead)
def get_attendance(db: DB, user: Reader, date: str = Query(..., description="ÉÉÉÉ-HH-NN"), unit: str = "", include_reserve: bool = False):
    return _build_day(db, _parse_day(date), unit, include_reserve, user)


@router.get("/export.xlsx")
def export_attendance_xlsx(db: DB, user: Reader, date: str = Query(...), unit: str = "", include_reserve: bool = False):
    day = _build_day(db, _parse_day(date), unit, include_reserve, user)
    content = build_xlsx(day, unit.strip() or "Összes")
    return Response(
        content=content, media_type=_XLSX_MEDIA,
        headers={"Content-Disposition": f"attachment; filename=letszamjelentes-{day.date}.xlsx"},
    )


@router.get("/export.pdf")
def export_attendance_pdf(db: DB, user: Reader, date: str = Query(...), unit: str = "", include_reserve: bool = False):
    day = _build_day(db, _parse_day(date), unit, include_reserve, user)
    content = build_pdf(day, unit.strip() or "Összes")
    return Response(
        content=content, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=letszamjelentes-{day.date}.pdf"},
    )


@router.get("/events")
def events_on_day(db: DB, user: Reader, date: str = Query(..., description="ÉÉÉÉ-HH-NN")):
    """Az adott napot lefedő, résztvevővel rendelkező aktív események — a napi
    létszám esemény-alapú kitöltéséhez (G2)."""
    day = _parse_day(date)
    result: list[dict] = []
    for event_type, model in _EVENT_SOURCES:
        for item in db.scalars(scoped_owned(visible_events() if model is EventModel else select(model), model, user)).all():
            if not (item.start_date[:10] <= day <= item.end_date[:10]):
                continue
            if getattr(item, "status", "") in _INACTIVE_EVENT_STATUSES:
                continue
            participant_ids = list(db.scalars(
                select(ParticipantModel.personnel_id).where(
                    ParticipantModel.event_type == event_type,
                    ParticipantModel.event_id == item.id,
                )
            ).all())
            if not participant_ids:
                continue
            # Hányuknak van már MA létszám-rekordja (és milyen állapottal)? Így
            # látszik, hogy egy másik ügyintéző már rögzítette-e őket.
            recorded = db.execute(
                select(AttendanceModel.status, func.count()).where(
                    AttendanceModel.date == day, AttendanceModel.personnel_id.in_(participant_ids),
                ).group_by(AttendanceModel.status)
            ).all()
            recorded_count = sum(n for _, n in recorded)
            result.append({
                "eventType": event_type,
                "eventId": item.id,
                "name": _event_name(item),
                "participantCount": len(participant_ids),
                "recordedCount": recorded_count,
                "recordedStatuses": {status: n for status, n in recorded},
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
    return _build_day(db, day, "", user=user)


@router.put("", response_model=AttendanceDayRead)
def set_attendance(payload: AttendanceUpdate, db: DB, user: Editor):
    day = _parse_day(payload.date)
    closure = _closed_for(db, day, user)
    if closure is not None and not payload.overrideReason.strip():
        raise HTTPException(status_code=409, detail=f"A nap le van zárva ({closure.closed_by_name}, {closure.closed_at:%H:%M}). Módosítás csak indoklással.")
    if closure is not None:
        record_activity(db, user, mode="update", module="Létszám", record_name=f"{day} — lezárt nap módosítása",
                        entity=f"attendance_closure:{closure.id}", before={"closed": True}, after={"closed": True, "overrideReason": payload.overrideReason.strip()})

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
    return _build_day(db, day, "", user=user)


@router.post("/close", response_model=AttendanceDayRead)
def close_day(payload: AttendanceCloseRequest, db: DB, user: Editor):
    """Napi zárás: „Lezárva: Kiss őrm., 08:12". A zászlóalj ügyintézője a saját
    zászlóalját zárja; az ezredtörzs bármelyiket (vagy ezredszinten)."""
    from ..constants import UNITS
    day = _parse_day(payload.date)
    mine = own_unit(user)
    unit = mine or (payload.unit or "").strip()
    if unit and unit not in UNITS:
        raise HTTPException(status_code=400, detail=f"Ismeretlen alegység: {unit}")
    if db.scalar(select(AttendanceClosureModel).where(AttendanceClosureModel.date == day, AttendanceClosureModel.unit == unit)):
        raise HTTPException(status_code=409, detail="Ez a nap már le van zárva")
    closure = AttendanceClosureModel(id=new_id(), date=day, unit=unit, closed_by=user.username, closed_by_name=user.display_name, note=payload.note.strip())
    db.add(closure)
    record_activity(db, user, mode="create", module="Létszám", record_name=f"{day} lezárva ({unit or 'ezredszint'})",
                    entity=f"attendance_closure:{closure.id}", after={"date": day, "unit": unit, "note": closure.note})
    db.commit()
    return _build_day(db, day, "", user=user)


@router.delete("/close", response_model=AttendanceDayRead)
def reopen_day(db: DB, user: Editor, date: str = Query(...), unit: str = "", reason: str = Query("", max_length=500)):
    """Lezárás visszavonása — indoklással, naplózva."""
    day = _parse_day(date)
    mine = own_unit(user)
    target_unit = mine or unit.strip()
    if not reason.strip():
        raise HTTPException(status_code=400, detail="A visszanyitáshoz indoklás kell")
    closure = db.scalar(select(AttendanceClosureModel).where(AttendanceClosureModel.date == day, AttendanceClosureModel.unit == target_unit))
    if closure is None:
        raise HTTPException(status_code=404, detail="Nincs lezárás ezen a napon")
    record_activity(db, user, mode="delete", module="Létszám", record_name=f"{day} lezárás visszavonva ({target_unit or 'ezredszint'})",
                    entity=f"attendance_closure:{closure.id}", before={"closedBy": closure.closed_by_name, "reason": reason.strip()})
    db.delete(closure)
    db.commit()
    return _build_day(db, day, "", user=user)
