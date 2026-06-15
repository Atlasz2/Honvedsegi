from __future__ import annotations

import unicodedata

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import (
    _apply_person,
    _assert_unique_sztsz,
    _get_current_user,
    _load_qualification_ids_by_person,
    _normalize_sztsz,
    _require_editor,
    _require_model,
    _serialize_person_with_qual_table,
    _serialize_person_with_quals,
)
from ..models import (
    DutyModel, EventModel, ExerciseModel,
    ParticipantModel, PersonModel, PersonnelQualificationModel,
    QualificationTypeModel, TrainingModel, UserModel,
)
from ..schemas import PersonCreate, PersonRead, PersonUpdate

router = APIRouter(prefix="/api/personnel", tags=["personnel"])


def _n(v: str) -> str:
    raw = (v or "").strip().lower()
    return "".join(ch for ch in unicodedata.normalize("NFD", raw) if unicodedata.category(ch) != "Mn")


_RANK_ORDER = {
    "honved": 1, "kozkatona": 1, "kozlegeny": 1, "orvezeto": 2, "tizedes": 3,
    "szakaszvezeto": 4, "ormester": 5, "torzsormester": 6, "fotorzsormester": 7,
    "zaszlos": 8, "torzszaszlos": 9, "fotorzszaszlos": 10, "hadnagy": 11,
    "fohadnagy": 12, "szazados": 13, "ornagy": 14, "alezredes": 15,
    "ezredes": 16, "dandartabornok": 17, "vezerornagy": 18,
    "altabornagy": 19, "vezerezredes": 20,
}


def _sort_persons(persons: list[PersonModel], sort_by: str, sort_dir: str) -> list[PersonModel]:
    """Sort people in Python so the ordering stays accent-insensitive and
    rank-aware (SQL ORDER BY cannot express either over the raw columns)."""
    reverse = sort_dir.lower() == "desc"

    if sort_by == "rank":
        def rank_value(p: PersonModel) -> int | None:
            return _RANK_ORDER.get(_n(p.rank))
        # Unknown ranks always sort last; ties broken by name.
        if reverse:
            return sorted(persons, key=lambda p: (rank_value(p) is None, -(rank_value(p) or 0), _n(p.name)))
        return sorted(persons, key=lambda p: (rank_value(p) is None, rank_value(p) or 999, _n(p.name)))

    sort_keys = {
        "name":     lambda p: (_n(p.name), _n(p.sztsz)),
        "sztsz":    lambda p: (_n(p.sztsz), _n(p.name)),
        "unit":     lambda p: (_n(p.unit), _n(p.name)),
        "status":   lambda p: (_n(p.status), _n(p.name)),
        "joinDate": lambda p: (_n(p.join_date), _n(p.name)),
    }
    return sorted(persons, key=sort_keys.get(sort_by, sort_keys["name"]), reverse=reverse)


@router.get("", response_model=list[PersonRead])
def list_personnel(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    quals_by_person = _load_qualification_ids_by_person(db)
    persons = _sort_persons(db.scalars(select(PersonModel)).all(), "name", "asc")
    return [_serialize_person_with_quals(p, quals_by_person.get(p.id, [])) for p in persons]


@router.get("/paged")
def list_personnel_paged(
    page: int = 1,
    page_size: int = 25,
    q: str = "",
    unit: str = "",
    status_filter: str = "",
    qualification: str = "",
    sort_by: str = "name",
    sort_dir: str = "asc",
    db: Session = Depends(get_db),
    _: UserModel = Depends(_get_current_user),
):
    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    # Exact-match filters run in SQL on indexed columns.
    base_query = select(PersonModel)
    if unit.strip():
        base_query = base_query.where(PersonModel.unit == unit.strip())
    if status_filter.strip() and status_filter.strip() != "Osszes":
        base_query = base_query.where(PersonModel.status == status_filter.strip())
    persons = db.scalars(base_query).all()

    # All qualifications loaded once, keyed by person — no per-person query.
    quals_by_person = _load_qualification_ids_by_person(db)

    qf = qualification.strip()
    if qf:
        persons = [p for p in persons if qf in quals_by_person.get(p.id, [])]

    # Free-text search stays in Python because it is accent-insensitive (see _n),
    # which SQLite's LIKE cannot do for Hungarian. Cheap over a few thousand rows.
    needle = _n(q)
    if needle:
        persons = [
            p for p in persons
            if needle in _n(p.name) or needle in _n(p.sztsz) or needle in _n(p.rank)
            or needle in _n(p.unit) or needle in _n(p.beosztas)
        ]

    persons = _sort_persons(persons, sort_by, sort_dir)

    total = len(persons)
    total_pages = max(1, (total + page_size - 1) // page_size)
    page = min(page, total_pages)
    offset = (page - 1) * page_size
    page_persons = persons[offset: offset + page_size]

    # Build response objects only for the current page, not the whole result set.
    items = [_serialize_person_with_quals(p, quals_by_person.get(p.id, [])) for p in page_persons]
    return {
        "items": [i.model_dump() for i in items],
        "page": page,
        "pageSize": page_size,
        "total": total,
        "totalPages": total_pages,
    }


_EVENT_MODELS = {
    "exercise": ExerciseModel,
    "training":  TrainingModel,
    "event":     EventModel,
    "duty":      DutyModel,
}


@router.get("/{item_id}/history")
def get_person_history(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    """Egy személy teljes eseménytörténete névvel és dátumokkal."""
    _require_model(db, PersonModel, item_id)
    rows = db.scalars(
        select(ParticipantModel)
        .where(ParticipantModel.personnel_id == item_id)
        .order_by(ParticipantModel.event_type)
    ).all()

    result = []
    for p in rows:
        model_cls = _EVENT_MODELS.get(p.event_type)
        ev = db.get(model_cls, p.event_id) if model_cls else None
        result.append({
            "eventType": p.event_type,
            "eventId": p.event_id,
            "eventName": getattr(ev, "name", p.event_id) if ev else p.event_id,
            "eventSubtype": getattr(ev, "type", "") if ev else "",
            "startDate": getattr(ev, "start_date", "") if ev else "",
            "endDate": getattr(ev, "end_date", "") if ev else "",
            "location": getattr(ev, "location", "") if ev else "",
            "status": p.status,
            "role": p.role,
            "qualificationApproved": p.qualification_approved,
            "notes": p.notes,
        })
    result.sort(key=lambda x: x.get("startDate", ""), reverse=True)
    return result


@router.post("", response_model=PersonRead)
def create_person(payload: PersonCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    normalized = _normalize_sztsz(payload.sztsz)
    _assert_unique_sztsz(db, normalized)
    item = PersonModel()
    payload.sztsz = normalized
    _apply_person(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_person_with_qual_table(db, item)


@router.put("/{item_id}", response_model=PersonRead)
def update_person(item_id: str, payload: PersonUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, PersonModel, item_id)
    normalized = _normalize_sztsz(payload.sztsz)
    _assert_unique_sztsz(db, normalized, exclude_id=item_id)
    payload.sztsz = normalized
    _apply_person(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_person_with_qual_table(db, item)


@router.delete("/{item_id}", status_code=204)
def delete_person(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, PersonModel, item_id)
    db.delete(item)
    db.commit()
