from __future__ import annotations

import unicodedata

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from ..audit import record_activity
from ..core.dependencies import DB, Editor, Reader
from ..models import EventModel, ExerciseModel, visible_events

router = APIRouter(prefix="/api/conflicts", tags=["conflicts"])


def _norm(v: str) -> str:
    """Normalize to lowercase ASCII for fuzzy location matching."""
    raw = (v or "").strip().lower()
    return "".join(ch for ch in unicodedata.normalize("NFD", raw) if unicodedata.category(ch) != "Mn")


def _dates_overlap(s1: str, e1: str, s2: str, e2: str) -> bool:
    """True when [s1,e1] and [s2,e2] overlap (inclusive on date portion)."""
    return s1[:10] <= e2[:10] and s2[:10] <= e1[:10]


@router.get("")
def check_conflicts(
    db: DB,
    _: Reader,
    location: str = "",
    start_date: str = "",
    end_date: str = "",
    exclude_type: str = "",
    exclude_id: str = "",
):
    """
    Return all events at the given location whose date range overlaps [start_date, end_date].
    exclude_type + exclude_id can be used to omit the item being edited.
    An empty or whitespace-only location returns an empty list (no point checking).
    """
    loc = location.strip()
    if not loc or not start_date or not end_date:
        return []

    loc_norm = _norm(loc)
    conflicts: list[dict] = []

    def _add(event_type: str, items):
        for item in items:
            item_loc = _norm(getattr(item, "location", "") or "")
            if item_loc != loc_norm:
                continue
            if not _dates_overlap(start_date, end_date, item.start_date, item.end_date):
                continue
            if exclude_type == event_type and exclude_id == item.id:
                continue
            status = getattr(item, "status", "")
            if status in ("Törölve", "Lemondva", "Befejezett"):
                continue
            name = getattr(item, "name", None) or f"{item.type} - {getattr(item, 'person_name', item.id)}"
            conflicts.append({
                "eventType": event_type,
                "eventId": item.id,
                "eventName": name,
                "startDate": item.start_date,
                "endDate": item.end_date,
                "status": status,
            })

    _add("exercise", db.scalars(select(ExerciseModel)).all())
    _add("event", db.scalars(visible_events()).all())

    return conflicts


@router.get("/person")
def person_conflicts(
    db: DB,
    _: Reader,
    personnel_id: str,
    start_date: str,
    end_date: str,
    exclude_type: str = "",
    exclude_id: str = "",
):
    """Ugyanaz a személy egy másik, időben átfedő (nem lemondott) műveletbe is
    be van-e osztva? A beosztás ilyenkor megáll, és az ügyintéző dönt: marad az
    eredetiben / átkerül ide / parancsnoki engedéllyel mindkettő."""
    from ..models import ParticipantModel

    if not personnel_id or not start_date or not end_date:
        return []
    models = {"exercise": ExerciseModel, "event": EventModel}
    parts = db.scalars(
        select(ParticipantModel).where(
            ParticipantModel.personnel_id == personnel_id,
            ParticipantModel.status.notin_(("Lemondva", "Visszamondta", "Hiányzott")),
        )
    ).all()
    result = []
    for part in parts:
        if part.event_type == exclude_type and part.event_id == exclude_id:
            continue
        model = models.get(part.event_type)
        item = db.get(model, part.event_id) if model else None
        if not item or item.status in ("Lemondva", "Törölve"):
            continue
        if _dates_overlap(item.start_date, item.end_date, start_date, end_date):
            result.append({
                "eventType": part.event_type, "eventId": item.id, "eventName": item.name,
                "startDate": item.start_date, "endDate": item.end_date, "status": item.status,
                "participantStatus": part.status,
            })
    result.sort(key=lambda x: x["startDate"])
    return result


class MoveRequest(BaseModel):
    personnelId: str
    fromEvents: list[dict]     # [{eventType, eventId}] — ahonnan elkerül
    targetName: str = ""       # ahová átkerül (csak a megjegyzésbe)


@router.post("/person/move")
def move_person(payload: MoveRequest, db: DB, user: Editor):
    """„Átkerül ide": az ütköző műveletekben a részvétel „Visszamondta" lesz egy
    megjegyzéssel — a régi beosztás nyoma megmarad, de az ütközésből kiesik.
    A célműveletbe a hívó ezután a szokásos módon veszi fel a személyt."""
    from ..models import ParticipantModel

    if not payload.personnelId.strip():
        raise HTTPException(status_code=400, detail="Hiányzó személy")
    models = {"exercise": ExerciseModel, "event": EventModel}
    changed: list[dict] = []
    for ref in payload.fromEvents:
        event_type = str(ref.get("eventType") or "")
        event_id = str(ref.get("eventId") or "")
        model = models.get(event_type)
        if model is None or not event_id:
            raise HTTPException(status_code=400, detail=f"Ismeretlen eseménytípus: {event_type or '(üres)'}")
        item = db.get(model, event_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Az ütköző művelet nem található")
        part = db.scalar(select(ParticipantModel).where(
            ParticipantModel.event_type == event_type, ParticipantModel.event_id == event_id,
            ParticipantModel.personnel_id == payload.personnelId,
        ))
        if part is None or part.status in ("Visszamondta", "Lemondva"):
            continue
        before = {"status": part.status, "notes": part.notes or ""}
        part.status = "Visszamondta"
        note = f"Átkerült ide: {payload.targetName}".strip(": ") if payload.targetName else "Átosztva másik műveletbe"
        part.notes = f"{part.notes}; {note}".strip("; ") if part.notes else note
        record_activity(
            db, user, mode="update", module="Műveletek", record_name=f"{item.name} — {part.person_name}",
            entity=f"participant:{part.id}", before=before, after={"status": part.status, "notes": part.notes},
        )
        changed.append({"eventType": event_type, "eventId": event_id, "eventName": item.name})
    db.commit()
    return {"moved": changed}
