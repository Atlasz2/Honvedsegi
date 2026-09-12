from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ..appliers import apply_event
from ..audit import record_activity
from ..core.dependencies import DB, Reader, Editor
from ..models import AnnouncementModel, visible_events, EventModel, ParticipantModel, new_id
from ..participants import load_participants_by_event, sync_participants
from ..repository import require_model
from ..schemas import (
    EventCreate, EventRead, EventUpdate,
    ParticipantCreate, ParticipantRead, ParticipantUpdate,
)
from ..serializers import serialize_event

router = APIRouter(prefix="/api/events", tags=["events"])


MODULE = "Események"


def _snapshot(item: EventModel) -> dict:
    return {
        "name": item.name, "type": item.type, "startDate": item.start_date,
        "endDate": item.end_date, "location": item.location, "organizer": item.organizer or "",
        "maxPersonnel": item.max_personnel, "description": item.description, "status": item.status,
    }


@router.get("", response_model=list[EventRead])
def list_events(db: DB, _: Reader):
    items = db.scalars(visible_events().order_by(EventModel.start_date)).all()
    participants_by_event = load_participants_by_event(db, "event")
    return [serialize_event(db, i, participants_by_event.get(i.id, [])) for i in items]


@router.post("", response_model=EventRead, status_code=status.HTTP_201_CREATED)
def create_event(payload: EventCreate, db: DB, user: Editor):
    item = EventModel()
    apply_event(item, payload)
    db.add(item)
    db.flush()
    sync_participants(db, "event", item.id, payload.assigned)
    record_activity(db, user, mode="create", module=MODULE, record_name=item.name,
                    entity="event", after=_snapshot(item))
    db.commit()
    db.refresh(item)
    return serialize_event(db, item)


@router.put("/{item_id}", response_model=EventRead)
def update_event(item_id: str, payload: EventUpdate, db: DB, user: Editor):
    item = require_model(db, EventModel, item_id)
    before = _snapshot(item)
    apply_event(item, payload)
    sync_participants(db, "event", item_id, payload.assigned)
    after = _snapshot(item)
    record_activity(db, user, mode="update", module=MODULE, record_name=item.name,
                    entity="event", before=before, after=after)
    _announce_change(db, user, item, before, after)
    db.commit()
    db.refresh(item)
    return serialize_event(db, item)


def _fmt_when(value: str) -> str:
    """'2026-09-20T19:00' → '2026-09-20 19:00'; dátum önmagában marad."""
    return (value or "").replace("T", " ")[:16]


def _announce_change(db, user, item: EventModel, before: dict, after: dict) -> None:
    """Ha az időpont vagy a helyszín változik, MINDENKI tudjon róla: automatikus,
    kitűzött közlemény (pl. állománygyűlés 19:00 → 20:00). A Teendőim és az
    Áttekintés felül mutatja; ez az, amit ma szóban/Messengeren próbálnak elérni."""
    lines = []
    if before["startDate"] != after["startDate"] or before["endDate"] != after["endDate"]:
        lines.append(f"Új időpont: {_fmt_when(after['startDate'])} → {_fmt_when(after['endDate'])} (volt: {_fmt_when(before['startDate'])} → {_fmt_when(before['endDate'])})")
    if before["location"] != after["location"]:
        lines.append(f"Új helyszín: {after['location'] or '—'} (volt: {before['location'] or '—'})")
    if before["status"] != after["status"] and after["status"] in ("Törölve", "Lemondva"):
        lines.append("Az esemény LEMONDVA.")
    if not lines:
        return
    from datetime import date as _date
    db.add(AnnouncementModel(
        id=new_id(), title=f"Módosult: {item.name}", category="Változás",
        content="\n".join(lines), author=user.display_name or user.username,
        date=_date.today().isoformat(), pinned=True,
    ))


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(item_id: str, db: DB, user: Editor):
    item = require_model(db, EventModel, item_id)
    record_activity(db, user, mode="delete", module=MODULE, record_name=item.name,
                    entity="event", before=_snapshot(item))
    sync_participants(db, "event", item_id, [])
    db.delete(item)
    db.commit()


# ── Résztvevő-kezelés ─────────────────────────────────────────────────────────

@router.get("/{item_id}/participants", response_model=list[ParticipantRead])
def list_participants(item_id: str, db: DB, _: Reader):
    require_model(db, EventModel, item_id)
    rows = db.scalars(
        select(ParticipantModel)
        .where(ParticipantModel.event_type == "event", ParticipantModel.event_id == item_id)
        .order_by(ParticipantModel.person_name)
    ).all()
    return [ParticipantRead(
        id=p.id, personnelId=p.personnel_id, personName=p.person_name,
        rank=p.rank, rankShort=p.rank_short, sztsz=p.sztsz,
        role=p.role, status=p.status, qualificationApproved=p.qualification_approved, notes=p.notes,
    ) for p in rows]


@router.post("/{item_id}/participants", response_model=ParticipantRead, status_code=status.HTTP_201_CREATED)
def add_participant(item_id: str, body: ParticipantCreate, db: DB, _: Editor):
    require_model(db, EventModel, item_id)
    existing = db.execute(
        select(ParticipantModel).where(
            ParticipantModel.event_type == "event",
            ParticipantModel.event_id == item_id,
            ParticipantModel.personnel_id == body.personnelId,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Ez a személy már hozzá van rendelve")
    p = ParticipantModel(
        id=new_id(), event_type="event", event_id=item_id,
        personnel_id=body.personnelId, person_name=body.personName,
        rank=body.rank, rank_short=body.rankShort, sztsz=body.sztsz,
        role=body.role, status=body.status,
        qualification_approved=body.qualificationApproved, notes=body.notes,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return ParticipantRead(
        id=p.id, personnelId=p.personnel_id, personName=p.person_name,
        rank=p.rank, rankShort=p.rank_short, sztsz=p.sztsz,
        role=p.role, status=p.status, qualificationApproved=p.qualification_approved, notes=p.notes,
    )


@router.put("/{item_id}/participants/{participant_id}", response_model=ParticipantRead)
def update_participant(item_id: str, participant_id: str, body: ParticipantUpdate, db: DB, _: Editor):
    p = db.execute(
        select(ParticipantModel).where(
            ParticipantModel.id == participant_id,
            ParticipantModel.event_type == "event",
            ParticipantModel.event_id == item_id,
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    p.status = body.status
    p.role = body.role
    p.notes = body.notes
    db.commit()
    db.refresh(p)
    return ParticipantRead(
        id=p.id, personnelId=p.personnel_id, personName=p.person_name,
        rank=p.rank, rankShort=p.rank_short, sztsz=p.sztsz,
        role=p.role, status=p.status, qualificationApproved=p.qualification_approved, notes=p.notes,
    )


@router.delete("/{item_id}/participants/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_participant(item_id: str, participant_id: str, db: DB, _: Editor):
    p = db.execute(
        select(ParticipantModel).where(
            ParticipantModel.id == participant_id,
            ParticipantModel.event_type == "event",
            ParticipantModel.event_id == item_id,
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    db.delete(p)
    db.commit()
