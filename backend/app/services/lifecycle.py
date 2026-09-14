from __future__ import annotations

import time
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.time import parse_iso_date
from ..models import EventModel, ExerciseModel

PLANNED = "Tervezett"
ONGOING = "Folyamatban"
DONE = "Befejezett"
CANCELLED = "Lemondva"


def derive_temporal_status(start_date: str, end_date: str, *, today: date | None = None) -> str:
    """A művelet időbeli állapota a dátumaiból. A felhasználó ezt nem állítja —
    csak lemondani tud (CANCELLED), azt ez a függvény nem írja felül."""
    today = today or date.today()
    start = parse_iso_date(start_date)
    end = parse_iso_date(end_date)
    if not start or not end:
        return PLANNED
    if end < today:
        return DONE
    if start <= today:
        return ONGOING
    return PLANNED


def apply_status(item: Any, requested: str) -> None:
    """Mentéskor: lemondás megmarad, minden más a dátumból számolódik."""
    item.status = CANCELLED if requested == CANCELLED else derive_temporal_status(item.start_date, item.end_date)


def _today_iso() -> date:
    return date.today()


def _sync_temporal_status(item: Any, *, today: date) -> bool:
    start = parse_iso_date(getattr(item, "start_date", ""))
    end = parse_iso_date(getattr(item, "end_date", ""))
    if not start or not end:
        return False

    current = getattr(item, "status", "")
    if current == PLANNED and start <= today:
        item.status = ONGOING
        return True
    if current == ONGOING and end < today:
        item.status = DONE
        return True
    return False


_last_sync_at: float = 0.0
_SYNC_INTERVAL_SECONDS = 600


def sync_temporal_statuses(db: Session, *, force: bool = False) -> int:
    """Az állapot csak napváltáskor változhat, ezért elég ritkán futtatni —
    minden listázásnál végigolvasni az összes műveletet 100 felhasználónál
    fölösleges terhelés lenne."""
    global _last_sync_at
    now = time.monotonic()
    if not force and now - _last_sync_at < _SYNC_INTERVAL_SECONDS:
        return 0
    _last_sync_at = now
    changed = 0
    today = _today_iso()

    for item in db.scalars(select(ExerciseModel)).all():
        if _sync_temporal_status(item, today=today):
            changed += 1

    for item in db.scalars(select(EventModel)).all():
        if _sync_temporal_status(item, today=today):
            changed += 1

    if changed:
        db.commit()
    return changed
