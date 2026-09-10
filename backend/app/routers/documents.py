"""Személyi okmányok és alkalmasság (C1/C2), lejárat-figyeléssel.

Igazolvány, nemzetbiztonsági ellenőrzés, belépő, orvosi/fizikai alkalmasság —
lejárati dátummal. A lejáró/lejárt tételeket a Figyelmeztetések oldal jelzi.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from ..core.dependencies import DB, Reader, Editor
from ..models import PersonDocumentModel, PersonModel, new_id
from ..schemas import PersonDocumentCreate, PersonDocumentRead

router = APIRouter(prefix="/api/documents", tags=["documents"])



def _enrich(doc: PersonDocumentModel) -> PersonDocumentRead:
    today = date.today()
    expiry = None
    if doc.expiry_date:
        try:
            expiry = date.fromisoformat(doc.expiry_date[:10])
        except ValueError:
            expiry = None
    is_expired = bool(expiry and expiry < today)
    days = (expiry - today).days if expiry else None
    return PersonDocumentRead(
        id=doc.id, personnelId=doc.personnel_id, category=doc.category, name=doc.name,
        identifier=doc.identifier, issuedDate=doc.issued_date, expiryDate=doc.expiry_date,
        notes=doc.notes, isExpired=is_expired, daysUntilExpiry=days,
    )


def _apply(doc: PersonDocumentModel, body: PersonDocumentCreate) -> None:
    doc.category = body.category
    doc.name = body.name
    doc.identifier = body.identifier
    doc.issued_date = body.issuedDate
    doc.expiry_date = body.expiryDate
    doc.notes = body.notes


@router.get("/personnel/{person_id}", response_model=list[PersonDocumentRead])
def list_person_documents(person_id: str, db: DB, _: Reader):
    rows = db.scalars(
        select(PersonDocumentModel).where(PersonDocumentModel.personnel_id == person_id)
        .order_by(PersonDocumentModel.category, PersonDocumentModel.name)
    ).all()
    return [_enrich(d) for d in rows]


@router.post("/personnel/{person_id}", response_model=PersonDocumentRead, status_code=status.HTTP_201_CREATED)
def add_document(person_id: str, body: PersonDocumentCreate, db: DB, _: Editor):
    if not db.get(PersonModel, person_id):
        raise HTTPException(status_code=404, detail="A személy nem található")
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Az okmány neve kötelező")
    doc = PersonDocumentModel(id=new_id(), personnel_id=person_id)
    _apply(doc, body)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return _enrich(doc)


@router.put("/{doc_id}", response_model=PersonDocumentRead)
def update_document(doc_id: str, body: PersonDocumentCreate, db: DB, _: Editor):
    doc = db.get(PersonDocumentModel, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Az okmány nem található")
    _apply(doc, body)
    db.commit()
    db.refresh(doc)
    return _enrich(doc)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(doc_id: str, db: DB, _: Editor):
    doc = db.get(PersonDocumentModel, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Az okmány nem található")
    db.delete(doc)
    db.commit()


@router.get("/expiring")
def expiring_documents(db: DB, _: Reader, days: int = Query(60, ge=1, le=365)):
    """A most vagy hamarosan (N napon belül) lejáró okmányok/alkalmasságok."""
    today = date.today()
    docs = db.scalars(select(PersonDocumentModel).where(PersonDocumentModel.expiry_date.isnot(None))).all()
    persons = {p.id: p for p in db.scalars(select(PersonModel)).all()}

    result = []
    for doc in docs:
        try:
            expiry = date.fromisoformat((doc.expiry_date or "")[:10])
        except ValueError:
            continue
        days_left = (expiry - today).days
        if days_left > days:
            continue  # még messze van a lejárat
        person = persons.get(doc.personnel_id)
        result.append({
            "documentId": doc.id,
            "personnelId": doc.personnel_id,
            "name": person.name if person else doc.personnel_id,
            "rank": person.rank if person else "",
            "unit": person.unit if person else "",
            "category": doc.category,
            "documentName": doc.name,
            "expiryDate": doc.expiry_date,
            "isExpired": days_left < 0,
            "daysUntilExpiry": days_left,
        })
    result.sort(key=lambda x: x["daysUntilExpiry"])
    return result
