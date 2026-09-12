from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ..basic_training import grant_if_complete
from ..audit import record_activity
from ..core.dependencies import DB, Reader, Editor
from ..settings_store import is_enabled
from ..models import (
    PersonModel,
    PersonnelQualificationModel,
    QualificationTypeModel,
    new_id,
)
from ..schemas import (
    PersonnelQualificationCreate,
    PersonnelQualificationRead,
    PersonnelQualificationUpdate,
    QualificationAlert,
    QualificationTypeCreate,
    QualificationTypeRead,
    QualificationTypeUpdate,
)

router = APIRouter(prefix="/api/qualifications", tags=["qualifications"])




# ── segédfüggvények ────────────────────────────────────────────────────────────

def _enrich(pq: PersonnelQualificationModel, qt: QualificationTypeModel) -> PersonnelQualificationRead:
    today = date.today()
    expiry = date.fromisoformat(pq.expiry_date) if pq.expiry_date else None
    is_expired = bool(expiry and expiry < today)
    days_until: int | None = None
    if expiry:
        days_until = (expiry - today).days

    return PersonnelQualificationRead(
        id=pq.id,
        personnelId=pq.personnel_id,
        qualTypeId=pq.qual_type_id,
        qualTypeName=qt.name,
        qualTypeCategory=qt.category,
        validityDays=qt.validity_days,
        earnedDate=pq.earned_date,
        expiryDate=pq.expiry_date,
        sourceEventId=pq.source_event_id,
        sourceEventType=pq.source_event_type,
        notes=pq.notes,
        isExpired=is_expired,
        daysUntilExpiry=days_until,
    )


def _compute_expiry(earned_date: str, validity_days: int | None) -> str | None:
    if not validity_days:
        return None
    return (date.fromisoformat(earned_date) + timedelta(days=validity_days)).isoformat()


# ── képesítés-típus CRUD ───────────────────────────────────────────────────────

@router.get("/types", response_model=list[QualificationTypeRead])
def list_types(db: DB, _: Reader):
    rows = db.execute(select(QualificationTypeModel).order_by(QualificationTypeModel.category, QualificationTypeModel.name)).scalars().all()
    return [QualificationTypeRead.model_validate(r) for r in rows]


@router.post("/types", response_model=QualificationTypeRead, status_code=status.HTTP_201_CREATED)
def create_type(body: QualificationTypeCreate, db: DB, _: Editor):
    existing = db.execute(select(QualificationTypeModel).where(QualificationTypeModel.name == body.name)).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Ilyen nevű képesítés-típus már létezik")
    qt = QualificationTypeModel(
        id=new_id(),
        name=body.name,
        category=body.category,
        validity_days=body.validityDays,
        description=body.description,
    )
    db.add(qt)
    db.commit()
    db.refresh(qt)
    return QualificationTypeRead.model_validate(qt)


@router.put("/types/{type_id}", response_model=QualificationTypeRead)
def update_type(type_id: str, body: QualificationTypeUpdate, db: DB, _: Editor):
    qt = db.get(QualificationTypeModel, type_id)
    if not qt:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    qt.name = body.name
    qt.category = body.category
    qt.validity_days = body.validityDays
    qt.description = body.description
    db.commit()
    db.refresh(qt)
    return QualificationTypeRead.model_validate(qt)


@router.delete("/types/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_type(type_id: str, db: DB, _: Editor):
    qt = db.get(QualificationTypeModel, type_id)
    if not qt:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    in_use = db.execute(
        select(PersonnelQualificationModel).where(PersonnelQualificationModel.qual_type_id == type_id).limit(1)
    ).scalar_one_or_none()
    if in_use:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Ez a képesítés-típus már hozzá van rendelve személyhez")
    db.delete(qt)
    db.commit()


# ── személyi képesítések ───────────────────────────────────────────────────────

@router.get("/personnel/{person_id}", response_model=list[PersonnelQualificationRead])
def list_person_qualifications(person_id: str, db: DB, _: Reader):
    rows = db.execute(
        select(PersonnelQualificationModel)
        .where(PersonnelQualificationModel.personnel_id == person_id)
        .order_by(PersonnelQualificationModel.earned_date.desc())
    ).scalars().all()

    result = []
    for pq in rows:
        qt = db.get(QualificationTypeModel, pq.qual_type_id)
        if not qt:
            continue
        result.append(_enrich(pq, qt))
    return result


MODULE = "Képesítések"


def _qual_snapshot(pq: PersonnelQualificationModel, type_name: str) -> dict:
    return {
        "personnelId": pq.personnel_id,
        "qualType": type_name,
        "earnedDate": pq.earned_date,
        "expiryDate": pq.expiry_date,
        "sourceEventId": pq.source_event_id,
        "sourceEventType": pq.source_event_type,
        "notes": pq.notes,
    }


@router.post("/personnel/{person_id}", response_model=PersonnelQualificationRead, status_code=status.HTTP_201_CREATED)
def add_qualification(person_id: str, body: PersonnelQualificationCreate, db: DB, user: Editor):
    person = db.get(PersonModel, person_id)
    if not person:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Személy nem található")
    qt = db.get(QualificationTypeModel, body.qualTypeId)
    if not qt:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Képesítés-típus nem található")

    expiry = body.expiryDate or _compute_expiry(body.earnedDate, qt.validity_days)
    pq = PersonnelQualificationModel(
        id=new_id(),
        personnel_id=person_id,
        qual_type_id=body.qualTypeId,
        earned_date=body.earnedDate,
        expiry_date=expiry,
        source_event_id=body.sourceEventId,
        source_event_type=body.sourceEventType,
        notes=body.notes,
    )
    db.add(pq)
    db.flush()
    grant_if_complete(db, [person_id])  # 11/11 alapkiképzési modul → összesítő „Alapkiképzés"
    record_activity(db, user, mode="create", module=MODULE, record_name=person.name,
                    entity="personnel_qualification", after=_qual_snapshot(pq, qt.name))
    db.commit()
    db.refresh(pq)
    return _enrich(pq, qt)


@router.put("/personnel/{person_id}/{qual_id}", response_model=PersonnelQualificationRead)
def update_qualification(person_id: str, qual_id: str, body: PersonnelQualificationUpdate, db: DB, user: Editor):
    pq = db.execute(
        select(PersonnelQualificationModel)
        .where(PersonnelQualificationModel.id == qual_id, PersonnelQualificationModel.personnel_id == person_id)
    ).scalar_one_or_none()
    if not pq:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    qt = db.get(QualificationTypeModel, pq.qual_type_id)
    if not qt:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    before = _qual_snapshot(pq, qt.name)
    pq.earned_date = body.earnedDate
    pq.expiry_date = body.expiryDate or _compute_expiry(body.earnedDate, qt.validity_days)
    pq.source_event_id = body.sourceEventId
    pq.source_event_type = body.sourceEventType
    pq.notes = body.notes
    person = db.get(PersonModel, person_id)
    record_activity(db, user, mode="update", module=MODULE,
                    record_name=person.name if person else person_id,
                    entity="personnel_qualification", before=before, after=_qual_snapshot(pq, qt.name))
    db.commit()
    db.refresh(pq)
    return _enrich(pq, qt)


@router.delete("/personnel/{person_id}/{qual_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_qualification(person_id: str, qual_id: str, db: DB, user: Editor):
    pq = db.execute(
        select(PersonnelQualificationModel)
        .where(PersonnelQualificationModel.id == qual_id, PersonnelQualificationModel.personnel_id == person_id)
    ).scalar_one_or_none()
    if not pq:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    qt = db.get(QualificationTypeModel, pq.qual_type_id)
    person = db.get(PersonModel, person_id)
    record_activity(db, user, mode="delete", module=MODULE,
                    record_name=person.name if person else person_id,
                    entity="personnel_qualification",
                    before=_qual_snapshot(pq, qt.name if qt else pq.qual_type_id))
    db.delete(pq)
    db.commit()


# ── figyelmeztetések ──────────────────────────────────────────────────────────

@router.get("/alerts", response_model=list[QualificationAlert])
def get_alerts(db: DB, _: Reader, days_ahead: int = 60):
    """
    Visszaadja azokat a képesítéseket, amelyek `days_ahead` napon belül lejárnak,
    vagy már lejártak (daysUntilExpiry negatív).
    """
    if not is_enabled(db, "qualification_warn_days"):
        return []
    today = date.today()
    cutoff = (today + timedelta(days=days_ahead)).isoformat()

    rows = db.execute(
        select(PersonnelQualificationModel)
        .where(
            PersonnelQualificationModel.expiry_date.isnot(None),
            PersonnelQualificationModel.expiry_date <= cutoff,
        )
        .order_by(PersonnelQualificationModel.expiry_date)
    ).scalars().all()

    result = []
    for pq in rows:
        qt = db.get(QualificationTypeModel, pq.qual_type_id)
        person = db.get(PersonModel, pq.personnel_id)
        if not qt or not person:
            continue
        expiry = date.fromisoformat(pq.expiry_date)  # type: ignore[arg-type]
        days_left = (expiry - today).days
        result.append(QualificationAlert(
            personnelId=person.id,
            personnelName=person.name,
            rank=person.rank,
            unit=person.unit,
            qualificationId=pq.id,
            qualTypeName=qt.name,
            qualTypeCategory=qt.category,
            earnedDate=pq.earned_date,
            expiryDate=pq.expiry_date,
            daysUntilExpiry=days_left,
            isExpired=days_left < 0,
        ))
    return result


@router.get("/stats", response_model=list[dict])
def get_stats(db: DB, _: Reader):
    """Összesítés: hány személynek van meg (érvényesen) az egyes képesítés-típusok."""
    today = date.today().isoformat()
    types = db.execute(select(QualificationTypeModel).order_by(QualificationTypeModel.category, QualificationTypeModel.name)).scalars().all()

    from sqlalchemy import func
    total_personnel = db.execute(select(func.count()).select_from(PersonModel)).scalar() or 0

    result = []
    for qt in types:
        all_count = db.execute(
            select(func.count())
            .select_from(PersonnelQualificationModel)
            .where(PersonnelQualificationModel.qual_type_id == qt.id)
        ).scalar() or 0

        valid_count = db.execute(
            select(func.count())
            .select_from(PersonnelQualificationModel)
            .where(
                PersonnelQualificationModel.qual_type_id == qt.id,
                (PersonnelQualificationModel.expiry_date.is_(None)) |
                (PersonnelQualificationModel.expiry_date > today),
            )
        ).scalar() or 0

        result.append({
            "id": qt.id,
            "name": qt.name,
            "category": qt.category,
            "validityDays": qt.validity_days,
            "totalPersonnel": total_personnel,
            "holdersAll": all_count,
            "holdersValid": valid_count,
        })
    return result
