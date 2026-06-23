"""Erőforrás-/helyszín-foglaltság kereső.

„Szabad lesz-e a lőtér 2 hét múlva?" — részleges helyszínnévre és dátum-
tartományra keres a gyakorlatok/kiképzések/események/ügyeletek között. A pontos
egyezést igénylő szerkesztő-ellenőrzéshez a /api/conflicts való.
"""
from __future__ import annotations

import unicodedata
from datetime import date as date_cls
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import _get_current_user as require_reader
from ..models import DutyModel, EventModel, ExerciseModel, TrainingModel, UserModel

router = APIRouter(prefix="/api/availability", tags=["availability"])

DB = Annotated[Session, Depends(get_db)]
Reader = Annotated[UserModel, Depends(require_reader)]

_SOURCES = [
    ("exercise", ExerciseModel),
    ("training", TrainingModel),
    ("event", EventModel),
    ("duty", DutyModel),
]
# Ezek nem foglalják az erőforrást.
_INACTIVE_STATUSES = {"Törölve", "Befejezett", "Lemondva"}


def _norm(value: str) -> str:
    raw = (value or "").strip().lower()
    return "".join(ch for ch in unicodedata.normalize("NFD", raw) if unicodedata.category(ch) != "Mn")


def _parse_day(value: str) -> str:
    try:
        return date_cls.fromisoformat(value).isoformat()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="A dátum formátuma: ÉÉÉÉ-HH-NN")


def _overlaps(s1: str, e1: str, s2: str, e2: str) -> bool:
    """Igaz, ha [s1,e1] és [s2,e2] átfedik egymást (a dátum-rész alapján)."""
    return s1[:10] <= e2[:10] and s2[:10] <= e1[:10]


@router.get("/locations", response_model=list[str])
def list_locations(db: DB, _: Reader):
    """A nyilvántartott helyszínek (a kereső találati listájához/legördülőhöz)."""
    locations: set[str] = set()
    for _event_type, model in _SOURCES:
        for loc in db.scalars(select(model.location)).all():
            if loc and loc.strip():
                locations.add(loc.strip())
    return sorted(locations, key=lambda s: s.lower())


@router.get("")
def check_availability(
    db: DB, _: Reader,
    start_date: str = Query(..., description="ÉÉÉÉ-HH-NN"),
    end_date: str = "",
    q: str = "",
):
    """A megadott (rész)helyszínen az időszakot átfedő foglalások listája.
    Üres lista = szabad. Üres q esetén az időszak minden foglalása."""
    start = _parse_day(start_date)
    end = _parse_day(end_date) if end_date.strip() else start
    if end < start:
        raise HTTPException(status_code=400, detail="A vége nem lehet korábban a kezdetnél")

    needle = _norm(q)
    bookings: list[dict] = []
    for event_type, model in _SOURCES:
        for item in db.scalars(select(model)).all():
            location = (getattr(item, "location", "") or "").strip()
            if not location:
                continue
            if needle and needle not in _norm(location):
                continue
            if getattr(item, "status", "") in _INACTIVE_STATUSES:
                continue
            if not _overlaps(start, end, item.start_date, item.end_date):
                continue
            name = getattr(item, "name", None) or f"{item.type} – {getattr(item, 'person_name', '') or item.id}"
            bookings.append({
                "location": location,
                "eventType": event_type,
                "eventId": item.id,
                "eventName": name,
                "startDate": item.start_date,
                "endDate": item.end_date,
                "status": getattr(item, "status", ""),
            })

    bookings.sort(key=lambda b: (b["location"].lower(), b["startDate"]))
    return bookings
