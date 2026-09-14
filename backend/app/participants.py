"""Esemény-résztvevők olvasása és szinkronizálása."""
from __future__ import annotations

from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import ParticipantModel, new_id


def get_participants(db: Session, event_type: str, event_id: str) -> list[ParticipantModel]:
    return db.scalars(
        select(ParticipantModel)
        .where(ParticipantModel.event_type == event_type, ParticipantModel.event_id == event_id)
        .order_by(ParticipantModel.person_name)
    ).all()


def load_participants_by_event(db: Session, event_type: str) -> dict[str, list[ParticipantModel]]:
    """All participants of one event type, grouped by event id, in a single query.

    Pass the per-event list into the _serialize_* functions from list endpoints
    to avoid one participant query per event (N+1)."""
    rows = db.scalars(
        select(ParticipantModel)
        .where(ParticipantModel.event_type == event_type)
        .order_by(ParticipantModel.person_name)
    ).all()
    by_event: dict[str, list[ParticipantModel]] = {}
    for participant in rows:
        by_event.setdefault(participant.event_id, []).append(participant)
    return by_event


def sync_participants(db: Session, event_type: str, event_id: str, assignments: list[Any]) -> None:
    db.execute(
        delete(ParticipantModel).where(
            ParticipantModel.event_type == event_type,
            ParticipantModel.event_id == event_id,
        )
    )
    for item in assignments:
        if isinstance(item, dict):
            pid       = item.get("personId") or item.get("personnelId", "")
            pname     = item.get("personName", "")
            role      = item.get("role", "")
            st        = item.get("attendance") or item.get("status", "Tervezett")
            rank      = item.get("rank", "")
            rank_s    = item.get("rankShort", "")
            sztsz     = item.get("sztsz", "")
            qual_app  = bool(item.get("qualificationApproved", False))
            notes     = str(item.get("notes") or "")
        else:
            pid       = getattr(item, "personId", "")
            pname     = getattr(item, "personName", "")
            role      = getattr(item, "role", "")
            st        = getattr(item, "attendance", None) or getattr(item, "status", "Tervezett")
            rank      = getattr(item, "rank", "") or ""
            rank_s    = getattr(item, "rankShort", "") or ""
            sztsz     = getattr(item, "sztsz", "") or ""
            qual_app  = bool(getattr(item, "qualificationApproved", False))
            notes     = str(getattr(item, "notes", "") or "")
        if not pid:
            continue
        db.add(ParticipantModel(
            id=new_id(), event_type=event_type, event_id=event_id,
            personnel_id=pid, person_name=pname, rank=rank, rank_short=rank_s,
            sztsz=sztsz, role=role, status=st, qualification_approved=qual_app, notes=notes,
        ))
