"""Kiterjesztett riasztások meglévő adatból (a képesítés-lejáratokon túl).

- Igazolatlan távollétek (a napi létszámból), az elmúlt N napból.
- Készenléti rés: aktív állomány érvényes képesítés nélkül.
- Szabadság-minimum: aktív állomány, aki idén nem érte el a kötelező napszámot.
- Alapkiképzés-határidő: tartalékos, akinek a szerződéstől számított egy éven
  belül nem lett meg minden modul.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import select

from ..basic_training import completion_map
from ..constants import ALERT_WARN_DAYS, BASIC_TRAINING_DEADLINE_DAYS, LEAVE_MINIMUM_DAYS, SERVICE_MINIMUM_DAYS
from ..core.dependencies import DB, Reader
from ..models import (
    AttendanceModel,
    ExerciseModel,
    LeaveRequestModel,
    ParticipantModel,
    PersonModel,
    PersonnelQualificationModel,
    TrainingModel,
)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


_ACTIVE_STATUS = "Aktív"
_RESERVE_STATUS = "Tartalékos"
_LEAVE_TYPE = "Szabadság"
_APPROVED = "Jóváhagyva"


@router.get("/unexcused")
def unexcused_absences(db: DB, _: Reader, days: int = Query(30, ge=1, le=365)):
    """Igazolatlan távollétek az elmúlt N napból."""
    since = (date.today() - timedelta(days=days)).isoformat()
    records = db.scalars(
        select(AttendanceModel).where(
            AttendanceModel.status == "Igazolatlan távollét",
            AttendanceModel.date >= since,
        )
    ).all()
    persons = {p.id: p for p in db.scalars(select(PersonModel)).all()}

    result = []
    for record in records:
        person = persons.get(record.personnel_id)
        result.append({
            "personnelId": record.personnel_id,
            "name": person.name if person else record.personnel_id,
            "rank": person.rank if person else "",
            "unit": person.unit if person else "",
            "date": record.date,
            "note": record.note,
        })
    result.sort(key=lambda x: x["date"], reverse=True)
    return result


@router.get("/readiness-gaps")
def readiness_gaps(db: DB, _: Reader):
    """Aktív állomány, akinek NINCS érvényes (nem lejárt) képesítése."""
    today = date.today().isoformat()
    valid_holders: set[str] = set()
    rows = db.execute(
        select(PersonnelQualificationModel.personnel_id, PersonnelQualificationModel.expiry_date)
    ).all()
    for personnel_id, expiry in rows:
        if expiry and expiry[:10] < today:
            continue
        valid_holders.add(personnel_id)

    persons = db.scalars(select(PersonModel).where(PersonModel.status == _ACTIVE_STATUS)).all()
    gaps = [
        {"personnelId": p.id, "name": p.name, "rank": p.rank, "unit": p.unit}
        for p in persons if p.id not in valid_holders
    ]
    gaps.sort(key=lambda x: (x["unit"], x["name"].lower()))
    return gaps


def _workdays_between(start: date, end: date) -> int:
    """Hétfő–péntek napok száma a zárt [start, end] intervallumban (ünnepnap nélkül)."""
    if end < start:
        return 0
    full_weeks, remainder = divmod((end - start).days + 1, 7)
    days = full_weeks * 5
    for offset in range(remainder):
        if (start + timedelta(days=offset)).weekday() < 5:
            days += 1
    return days


@router.get("/leave-minimum")
def leave_minimum(
    db: DB,
    _: Reader,
    year: int | None = Query(None, ge=2000, le=2100),
    min_days: int = Query(LEAVE_MINIMUM_DAYS, ge=1, le=366),
):
    """Aktív állomány, aki az adott évben még nem vett ki `min_days` munkanap
    jóváhagyott szabadságot. A 0 napos is szerepel — pont ők a lényeg."""
    year = year or date.today().year
    year_start, year_end = date(year, 1, 1), date(year, 12, 31)

    taken: dict[str, int] = defaultdict(int)
    leaves = db.scalars(
        select(LeaveRequestModel).where(
            LeaveRequestModel.type == _LEAVE_TYPE,
            LeaveRequestModel.status == _APPROVED,
            LeaveRequestModel.start_date <= year_end.isoformat(),
            LeaveRequestModel.end_date >= year_start.isoformat(),
        )
    ).all()
    for leave in leaves:
        start = max(date.fromisoformat(leave.start_date), year_start)
        end = min(date.fromisoformat(leave.end_date), year_end)
        taken[leave.personnel_id] += _workdays_between(start, end)

    persons = db.scalars(select(PersonModel).where(PersonModel.status == _ACTIVE_STATUS)).all()
    result = [
        {
            "personnelId": p.id, "name": p.name, "rank": p.rank, "unit": p.unit,
            "takenDays": taken[p.id], "missingDays": min_days - taken[p.id],
        }
        for p in persons if taken[p.id] < min_days
    ]
    result.sort(key=lambda x: (x["takenDays"], x["unit"], x["name"].lower()))
    return {"year": year, "minDays": min_days, **_year_deadline(year), "items": result}


def _year_deadline(year: int) -> dict:
    """Az éves kötelezettségek határideje dec. 31.; előre jelzünk ALERT_WARN_DAYS nappal."""
    days_left = (date(year, 12, 31) - date.today()).days
    return {"deadline": date(year, 12, 31).isoformat(), "daysLeft": days_left,
            "warnDays": ALERT_WARN_DAYS, "isOverdue": days_left < 0, "isDueSoon": 0 <= days_left <= ALERT_WARN_DAYS}


def _overlap_days(start: str, end: str, year_start: date, year_end: date) -> int:
    try:
        s, e = date.fromisoformat(start[:10]), date.fromisoformat(end[:10])
    except ValueError:
        return 0
    s, e = max(s, year_start), min(e, year_end)
    return (e - s).days + 1 if e >= s else 0


@router.get("/service-minimum")
def service_minimum(
    db: DB,
    _: Reader,
    year: int | None = Query(None, ge=2000, le=2100),
    min_days: int = Query(SERVICE_MINIMUM_DAYS, ge=1, le=366),
):
    """Tartalékosok, akik az adott évben még nem szolgáltak `min_days` napot.
    Szolgált nap = gyakorlat/kiképzés napjai, ahol a résztvevő „Megjelent" vagy
    „Teljesített" és az esemény nincs lemondva; az évre vágva, naptári nap."""
    year = year or date.today().year
    year_start, year_end = date(year, 1, 1), date(year, 12, 31)

    events: dict[tuple[str, str], tuple[str, str]] = {}
    for event_type, model in (("exercise", ExerciseModel), ("training", TrainingModel)):
        rows = db.execute(
            select(model.id, model.start_date, model.end_date).where(
                model.status != "Lemondva",
                model.start_date <= year_end.isoformat(),
                model.end_date >= year_start.isoformat(),
            )
        ).all()
        for event_id, start, end in rows:
            events[(event_type, event_id)] = (start, end)

    served: dict[str, int] = defaultdict(int)
    if events:
        parts = db.execute(
            select(ParticipantModel.personnel_id, ParticipantModel.event_type, ParticipantModel.event_id).where(
                ParticipantModel.event_id.in_([eid for _, eid in events]),
                ParticipantModel.status.in_(("Megjelent", "Teljesített")),
            )
        ).all()
        for personnel_id, event_type, event_id in parts:
            span = events.get((event_type, event_id))
            if span:
                served[personnel_id] += _overlap_days(span[0], span[1], year_start, year_end)

    persons = db.scalars(select(PersonModel).where(PersonModel.status == _RESERVE_STATUS)).all()
    result = [
        {
            "personnelId": p.id, "name": p.name, "rank": p.rank, "unit": p.unit,
            "servedDays": served[p.id], "missingDays": min_days - served[p.id],
        }
        for p in persons if served[p.id] < min_days
    ]
    result.sort(key=lambda x: (x["servedDays"], x["unit"], x["name"].lower()))
    return {"year": year, "minDays": min_days, **_year_deadline(year), "items": result}


@router.get("/basic-training")
def basic_training_deadline(
    db: DB,
    _: Reader,
    deadline_days: int = Query(BASIC_TRAINING_DEADLINE_DAYS, ge=1, le=3650),
):
    """Tartalékosok, akiknek nincs meg az alapkiképzése. A határidő a jogviszony
    kezdete (join_date) + `deadline_days`; lejárt határidő = leszerelendő, a
    határidő előtti ALERT_WARN_DAYS napban „hamarosan lejár".

    Kész = megvan az összesítő „Alapkiképzés" képesítés VAGY minden modul
    (lejárat nem számít, az alapkiképzés nem évül)."""
    modules, completed, has_summary = completion_map(db)
    module_ids = [m.id for m in modules]
    module_names = {m.id: m.name for m in modules}
    if not module_ids:
        return {"modules": [], "deadlineDays": deadline_days, "warnDays": ALERT_WARN_DAYS, "items": []}

    today = date.today()
    items = []
    for p in db.scalars(select(PersonModel).where(PersonModel.status == _RESERVE_STATUS)).all():
        done = completed.get(p.id, set())
        if p.id in has_summary or len(done) >= len(module_ids):
            continue
        deadline = days_left = None
        if p.join_date:
            deadline = date.fromisoformat(p.join_date[:10]) + timedelta(days=deadline_days)
            days_left = (deadline - today).days
        items.append({
            "personnelId": p.id, "name": p.name, "rank": p.rank, "unit": p.unit,
            "joinDate": p.join_date,
            "deadline": deadline.isoformat() if deadline else None,
            "daysLeft": days_left,
            "isOverdue": days_left is not None and days_left < 0,
            "isDueSoon": days_left is not None and 0 <= days_left <= ALERT_WARN_DAYS,
            "completedModules": len(done),
            "totalModules": len(module_ids),
            "missingModules": [module_names[m] for m in module_ids if m not in done],
        })
    # Lejárt és sürgős elöl; akinél nincs jogviszony-kezdet, a végén (nem számolható).
    items.sort(key=lambda x: (x["daysLeft"] is None, x["daysLeft"] if x["daysLeft"] is not None else 0, x["name"].lower()))
    return {
        "modules": [{"id": m.id, "name": m.name} for m in modules],
        "deadlineDays": deadline_days,
        "warnDays": ALERT_WARN_DAYS,
        "items": items,
    }


@router.get("/order-deadlines")
def order_deadlines(db: DB, _: Reader, warn_days: int = Query(ALERT_WARN_DAYS, ge=0, le=365)):
    """Nyitott parancsok lejárt vagy hamarosan lejáró határidői: a parancs
    egésze és az el nem készült fejezetek, felelős részleggel. A vezető és a
    részleg is ebből látja, mi csúszik."""
    from ..models import OrderChapterModel, OrderModel  # itt, hogy az alerts ne függjön mindig a parancsoktól

    today = date.today()
    horizon = (today + timedelta(days=warn_days)).isoformat()
    open_orders = db.scalars(select(OrderModel).where(OrderModel.status.in_(("Előkészítés", "Aláírásra vár")))).all()
    by_id = {o.id: o for o in open_orders}
    items = []

    def add(order, kind, label, responsible, assignee, due):
        days_left = (date.fromisoformat(due[:10]) - today).days
        items.append({
            "orderId": order.id, "number": order.number or "", "subject": order.subject, "orderStatus": order.status,
            "kind": kind, "label": label, "responsible": responsible, "assignee": assignee,
            "dueDate": due[:10], "daysLeft": days_left, "isOverdue": days_left < 0, "isDueSoon": 0 <= days_left <= warn_days,
        })

    for order in open_orders:
        if order.due_date and order.due_date[:10] <= horizon:
            add(order, "order", "a parancs egésze", "", "", order.due_date)
    if by_id:
        chapters = db.scalars(select(OrderChapterModel).where(
            OrderChapterModel.order_id.in_(list(by_id)),
            OrderChapterModel.status.notin_(("Kész", "Nem szükséges")),
            OrderChapterModel.due_date != "",
            OrderChapterModel.due_date <= horizon,
        )).all()
        for ch in chapters:
            add(by_id[ch.order_id], "chapter", ch.name, ch.responsible, ch.assignee, ch.due_date)
    items.sort(key=lambda x: (x["daysLeft"], x["subject"].lower()))
    return {"warnDays": warn_days, "items": items}
