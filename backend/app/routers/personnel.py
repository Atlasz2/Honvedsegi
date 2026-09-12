from __future__ import annotations

import unicodedata

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..appliers import apply_person
from ..audit import record_activity
from ..core.dependencies import DB, Reader, Editor
from ..models import EventModel, ExerciseModel, ParticipantModel, PersonModel
from ..repository import require_model
from ..schemas import PersonLite, PersonCreate, PersonRead, PersonUpdate
from ..serializers import load_qualification_ids_by_person, serialize_person_with_qual_table, serialize_person_with_quals
from ..validation import assert_unique_sztsz, normalize_sztsz

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
def list_personnel(db: DB, _: Reader):
    quals_by_person = load_qualification_ids_by_person(db)
    persons = _sort_persons(db.scalars(select(PersonModel)).all(), "name", "asc")
    return [serialize_person_with_quals(p, quals_by_person.get(p.id, [])) for p in persons]


@router.get("/lite", response_model=list[PersonLite])
def list_personnel_lite(db: DB, _: Reader):
    """Csak az azonosításhoz kellő mezők, egyetlen lekérdezésből — a beosztó
    felületek ezt töltik, nem a teljes aktát."""
    rows = db.execute(
        select(PersonModel.id, PersonModel.name, PersonModel.sztsz, PersonModel.rank, PersonModel.unit, PersonModel.status)
        .where(PersonModel.status != "Leszerelt")
        .order_by(PersonModel.name)
    ).all()
    return [PersonLite(id=i, name=n, sztsz=s, rank=r, unit=u, status=st) for i, n, s, r, u, st in rows]


@router.get("/paged")
def list_personnel_paged(
    db: DB,
    _: Reader,
    page: int = 1,
    page_size: int = 25,
    q: str = "",
    unit: str = "",
    status_filter: str = "",
    qualification: str = "",
    sort_by: str = "name",
    sort_dir: str = "asc",
):
    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    # Exact-match filters run in SQL on indexed columns.
    base_query = select(PersonModel)
    if unit.strip():
        base_query = base_query.where(PersonModel.unit == unit.strip())
    if status_filter.strip() and status_filter.strip() not in ("Osszes", "Összes"):
        base_query = base_query.where(PersonModel.status == status_filter.strip())
    persons = db.scalars(base_query).all()

    # All qualifications loaded once, keyed by person — no per-person query.
    quals_by_person = load_qualification_ids_by_person(db)

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
    items = [serialize_person_with_quals(p, quals_by_person.get(p.id, [])) for p in page_persons]
    return {
        "items": [i.model_dump() for i in items],
        "page": page,
        "pageSize": page_size,
        "total": total,
        "totalPages": total_pages,
    }


_EVENT_MODELS = {
    "exercise": ExerciseModel,
    "event":     EventModel,
}


@router.get("/{item_id}", response_model=PersonRead)
def get_person(item_id: str, db: DB, _: Reader):
    """Egy személy aktája — a gyorskereső és a más oldalról érkező megnyitás ezt használja."""
    return serialize_person_with_qual_table(db, require_model(db, PersonModel, item_id))


@router.get("/{item_id}/history")
def get_person_history(item_id: str, db: DB, _: Reader):
    """Egy személy teljes eseménytörténete névvel és dátumokkal."""
    require_model(db, PersonModel, item_id)
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


def _person_snapshot(item: PersonModel) -> dict:
    """A személy szerkeszthető mezőinek pillanatképe a naplóhoz/visszaállításhoz."""
    return {
        "name": item.name, "sztsz": item.sztsz, "rank": item.rank, "unit": item.unit,
        "beosztas": item.beosztas or "", "status": item.status, "serviceType": item.service_type or "", "email": item.email,
        "phone": item.phone, "birthDate": item.birth_date, "address": item.address,
        "joinDate": item.join_date, "notes": item.notes,
    }


@router.post("", response_model=PersonRead)
def create_person(payload: PersonCreate, db: DB, user: Editor):
    normalized = normalize_sztsz(payload.sztsz)
    assert_unique_sztsz(db, normalized)
    item = PersonModel()
    payload.sztsz = normalized
    apply_person(item, payload)
    db.add(item)
    db.flush()
    record_activity(db, user, mode="create", module="Személyek", record_name=item.name,
                    entity="personnel", after=_person_snapshot(item))
    db.commit()
    db.refresh(item)
    return serialize_person_with_qual_table(db, item)


@router.put("/{item_id}", response_model=PersonRead)
def update_person(item_id: str, payload: PersonUpdate, db: DB, user: Editor):
    item = require_model(db, PersonModel, item_id)
    before = _person_snapshot(item)
    normalized = normalize_sztsz(payload.sztsz)
    assert_unique_sztsz(db, normalized, exclude_id=item_id)
    payload.sztsz = normalized
    apply_person(item, payload)
    record_activity(db, user, mode="update", module="Személyek", record_name=item.name,
                    entity="personnel", before=before, after=_person_snapshot(item))
    db.commit()
    db.refresh(item)
    return serialize_person_with_qual_table(db, item)


@router.delete("/{item_id}", status_code=204)
def delete_person(item_id: str, db: DB, user: Editor):
    item = require_model(db, PersonModel, item_id)
    before = _person_snapshot(item)
    record_name = item.name
    db.delete(item)
    record_activity(db, user, mode="delete", module="Személyek", record_name=record_name,
                    entity="personnel", before=before)
    db.commit()


# ── Tömeges műveletek (G5): senki nem kattint 1500 sort ────────────────────────

from pydantic import BaseModel as _BaseModel  # noqa: E402

from ..basic_training import grant_if_complete  # noqa: E402
from ..models import PersonnelQualificationModel, QualificationTypeModel, new_id  # noqa: E402
from ..schemas import PersonStatus  # noqa: E402


class PersonnelBulkUpdate(_BaseModel):
    ids: list[str]
    status: PersonStatus | None = None
    unit: str | None = None


class PersonnelBulkGrant(_BaseModel):
    ids: list[str]
    qualTypeId: str
    earnedDate: str


def _bulk_targets(db, ids: list[str]) -> list[PersonModel]:
    if not ids or len(ids) > 2000:
        raise HTTPException(status_code=400, detail="1–2000 kijelölt személy kell")
    return db.scalars(select(PersonModel).where(PersonModel.id.in_(ids))).all()


@router.post("/bulk")
def bulk_update(payload: PersonnelBulkUpdate, db: DB, user: Editor):
    """Kijelölt személyek státusza és/vagy alegysége egy lépésben; személyenként naplózva."""
    if payload.status is None and (payload.unit is None or not payload.unit.strip()):
        raise HTTPException(status_code=400, detail="Add meg, mit állítunk át: státuszt vagy alegységet")
    changed = 0
    for person in _bulk_targets(db, payload.ids):
        before = _person_snapshot(person)
        if payload.status is not None:
            person.status = payload.status
        if payload.unit is not None and payload.unit.strip():
            person.unit = payload.unit.strip()
        after = _person_snapshot(person)
        if before != after:
            changed += 1
            record_activity(db, user, mode="update", module="Személyek", record_name=person.name,
                            entity="personnel", before={"id": person.id, **before}, after={"id": person.id, **after})
    db.commit()
    return {"changed": changed}


@router.post("/bulk-grant")
def bulk_grant(payload: PersonnelBulkGrant, db: DB, user: Editor):
    """Egy képesítés kiadása sok személynek egyszerre (akinek már megvan, kimarad)."""
    qual_type = db.get(QualificationTypeModel, payload.qualTypeId)
    if not qual_type:
        raise HTTPException(status_code=404, detail="Képesítés-típus nem található")
    targets = _bulk_targets(db, payload.ids)
    held = {pid for (pid,) in db.execute(
        select(PersonnelQualificationModel.personnel_id).where(
            PersonnelQualificationModel.qual_type_id == qual_type.id,
            PersonnelQualificationModel.personnel_id.in_([p.id for p in targets]),
        )
    )}
    expiry = None
    if qual_type.validity_days:
        from datetime import date as _date, timedelta as _timedelta
        expiry = (_date.fromisoformat(payload.earnedDate) + _timedelta(days=qual_type.validity_days)).isoformat()
    granted = []
    for person in targets:
        if person.id in held:
            continue
        db.add(PersonnelQualificationModel(
            id=new_id(), personnel_id=person.id, qual_type_id=qual_type.id,
            earned_date=payload.earnedDate, expiry_date=expiry, notes="Tömeges kiadás",
        ))
        granted.append(person.id)
    summaries = grant_if_complete(db, granted)
    record_activity(db, user, mode="create", module="Képesítések", record_name=qual_type.name,
                    entity="bulk_grant", after={"granted": len(granted), "skipped": len(targets) - len(granted), "earnedDate": payload.earnedDate})
    db.commit()
    return {"granted": len(granted), "skipped": len(targets) - len(granted), "summariesGranted": summaries}
