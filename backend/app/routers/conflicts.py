from __future__ import annotations

import unicodedata

from fastapi import APIRouter
from sqlalchemy import select

from ..core.dependencies import DB, Reader
from ..models import EventModel, ExerciseModel, TrainingModel

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
    _add("training", db.scalars(select(TrainingModel)).all())
    _add("event", db.scalars(select(EventModel)).all())

    return conflicts
