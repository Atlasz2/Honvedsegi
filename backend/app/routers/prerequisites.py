"""Képzési belépési követelmények és jogosultság.

Egy eseményhez (gyakorlat/kiképzés/esemény/ügyelet) megadható, mely képesítések
szükségesek a részvételhez. Ebből a rendszer automatikusan megmondja, ki
jogosult — így a progresszió (alap → haladó → emelt) és a belépési feltételek
(pl. határszolgálat csak alapkiképzéssel) kézi ellenőrzés nélkül kezelhetők.
"""
from __future__ import annotations

from datetime import date as date_cls

from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..core.dependencies import DB, Reader, Editor
from ..models import (
    EventPrerequisiteModel,
    PersonModel,
    PersonnelQualificationModel,
    QualificationTypeModel,
    new_id,
)
from ..schemas import EligibilityPerson, PrerequisiteRead, PrerequisiteSet, QualTypeRef

router = APIRouter(prefix="/api/prerequisites", tags=["prerequisites"])


_VALID_EVENT_TYPES = {"exercise", "training", "event", "duty"}
_DISCHARGED_STATUS = "Leszerelt"
_RESERVE_STATUS = "Tartalékos"


def _check_event_type(event_type: str) -> None:
    if event_type not in _VALID_EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Ismeretlen esemény-típus")


def _prereq_ids(db: Session, event_type: str, event_id: str) -> list[str]:
    return list(db.scalars(
        select(EventPrerequisiteModel.qual_type_id).where(
            EventPrerequisiteModel.event_type == event_type,
            EventPrerequisiteModel.event_id == event_id,
        )
    ).all())


def serialize_prereq(db: Session, event_type: str, event_id: str) -> PrerequisiteRead:
    ids = _prereq_ids(db, event_type, event_id)
    name_by_id: dict[str, str] = {}
    if ids:
        name_by_id = {
            t.id: t.name
            for t in db.scalars(select(QualificationTypeModel).where(QualificationTypeModel.id.in_(ids))).all()
        }
    # Csak a még létező típusokat adjuk vissza, a tárolt sorrendben.
    refs = [QualTypeRef(id=i, name=name_by_id[i]) for i in ids if i in name_by_id]
    return PrerequisiteRead(qualTypeIds=[r.id for r in refs], qualTypes=refs)


@router.get("/{event_type}/{event_id}", response_model=PrerequisiteRead)
def get_prerequisites(event_type: str, event_id: str, db: DB, _: Reader):
    _check_event_type(event_type)
    return serialize_prereq(db, event_type, event_id)


@router.put("/{event_type}/{event_id}", response_model=PrerequisiteRead)
def set_prerequisites(event_type: str, event_id: str, payload: PrerequisiteSet, db: DB, _: Editor):
    _check_event_type(event_type)
    valid_ids = set(db.scalars(select(QualificationTypeModel.id)).all())
    unknown = [q for q in payload.qualTypeIds if q not in valid_ids]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Ismeretlen képesítés-típus: {', '.join(unknown)}")

    db.execute(delete(EventPrerequisiteModel).where(
        EventPrerequisiteModel.event_type == event_type,
        EventPrerequisiteModel.event_id == event_id,
    ))
    for qual_type_id in dict.fromkeys(payload.qualTypeIds):  # duplikátum-szűrés, sorrendtartón
        db.add(EventPrerequisiteModel(
            id=new_id(), event_type=event_type, event_id=event_id, qual_type_id=qual_type_id,
        ))
    db.commit()
    return serialize_prereq(db, event_type, event_id)


class RequirementCheck:
    """Egy esemény követelményei és az, ki tartja őket (érvényesen).

    Egyszer tölt (N+1 nélkül), utána bármely személyre olcsó a `missing`."""

    def __init__(self, db: Session, event_type: str, event_id: str) -> None:
        self.prereq_ids = _prereq_ids(db, event_type, event_id)
        self.name_by_id: dict[str, str] = {}
        self._held: dict[str, set[str]] = {}
        if not self.prereq_ids:
            return
        self.name_by_id = {
            t.id: t.name
            for t in db.scalars(select(QualificationTypeModel).where(QualificationTypeModel.id.in_(self.prereq_ids))).all()
        }
        today = date_cls.today().isoformat()
        rows = db.execute(
            select(
                PersonnelQualificationModel.personnel_id,
                PersonnelQualificationModel.qual_type_id,
                PersonnelQualificationModel.expiry_date,
            ).where(PersonnelQualificationModel.qual_type_id.in_(self.prereq_ids))
        ).all()
        for personnel_id, qual_type_id, expiry in rows:
            if expiry and expiry[:10] < today:
                continue  # lejárt képesítés nem számít
            self._held.setdefault(personnel_id, set()).add(qual_type_id)

    @property
    def requirement_names(self) -> list[str]:
        return [self.name_by_id.get(qid, qid) for qid in self.prereq_ids]

    def missing(self, personnel_id: str) -> list[str]:
        have = self._held.get(personnel_id, set())
        return [self.name_by_id.get(qid, qid) for qid in self.prereq_ids if qid not in have]


@router.get("/{event_type}/{event_id}/eligibility", response_model=list[EligibilityPerson])
def eligibility(event_type: str, event_id: str, db: DB, _: Reader, unit: str = "", include_reserve: bool = False):
    """Ki jogosult az eseményre (megvan minden, nem lejárt követelménye), és
    kinek mi hiányzik."""
    _check_event_type(event_type)
    check = RequirementCheck(db, event_type, event_id)

    person_query = select(PersonModel).where(PersonModel.status != _DISCHARGED_STATUS)
    if not include_reserve:
        person_query = person_query.where(PersonModel.status != _RESERVE_STATUS)
    if unit.strip():
        person_query = person_query.where(PersonModel.unit == unit.strip())
    persons = db.scalars(person_query).all()

    result: list[EligibilityPerson] = []
    for person in sorted(persons, key=lambda p: (p.name or "")):
        missing = check.missing(person.id)
        result.append(EligibilityPerson(
            personnelId=person.id, name=person.name, rank=person.rank,
            unit=person.unit, eligible=not missing, missing=missing,
        ))
    return result
