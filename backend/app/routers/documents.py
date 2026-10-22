"""Személyi okmányok és alkalmasság (C1/C2), lejárat-figyeléssel.

Igazolvány, nemzetbiztonsági ellenőrzés, belépő, orvosi/fizikai alkalmasság —
lejárati dátummal. A lejáró/lejárt tételeket a Figyelmeztetések oldal jelzi.
"""
from __future__ import annotations

import unicodedata
from datetime import date

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import record_activity
from ..core.scope import scoped_persons
from ..core.dependencies import DB, Editor, Reader
from ..constants import DOCUMENT_TYPES, ID_CARD_TYPE
from ..models import PersonDocumentModel, PersonModel, new_id
from ..schemas import PersonDocumentCreate, PersonDocumentRead
from ..table_export import build_table_xlsx

router = APIRouter(prefix="/api/documents", tags=["documents"])

MODULE = "Okmányok"


def _snapshot(doc: PersonDocumentModel) -> dict:
    return {
        "personnelId": doc.personnel_id,
        "category": doc.category,
        "name": doc.name,
        "identifier": doc.identifier,
        "issuedDate": doc.issued_date,
        "expiryDate": doc.expiry_date,
        "notes": doc.notes,
        "rankOnCard": doc.rank_on_card,
    }


def _fold(value: str) -> str:
    stripped = "".join(ch for ch in unicodedata.normalize("NFD", value or "") if unicodedata.category(ch) != "Mn")
    return stripped.strip().lower()


def _rank_mismatch(doc: PersonDocumentModel, person_rank: str) -> bool:
    """A szolgálati igazolványon más rendfokozat áll, mint a mostani → új kártya kell."""
    return doc.name == ID_CARD_TYPE and bool(doc.rank_on_card) and _fold(doc.rank_on_card) != _fold(person_rank)


def _person_label(db: Session, personnel_id: str) -> str:
    person = db.get(PersonModel, personnel_id)
    return person.name if person else personnel_id



def _enrich(doc: PersonDocumentModel, person_rank: str = "") -> PersonDocumentRead:
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
        rankOnCard=doc.rank_on_card, rankMismatch=_rank_mismatch(doc, person_rank),
    )


def _apply(doc: PersonDocumentModel, body: PersonDocumentCreate) -> None:
    doc.category = body.category
    doc.name = body.name
    doc.identifier = body.identifier
    doc.issued_date = body.issuedDate
    doc.expiry_date = body.expiryDate
    doc.notes = body.notes
    doc.rank_on_card = body.rankOnCard.strip()


def _rank_of(db: Session, person_id: str) -> str:
    person = db.get(PersonModel, person_id)
    return person.rank if person else ""


@router.get("/personnel/{person_id}", response_model=list[PersonDocumentRead])
def list_person_documents(person_id: str, db: DB, _: Reader):
    rows = db.scalars(
        select(PersonDocumentModel).where(PersonDocumentModel.personnel_id == person_id)
        .order_by(PersonDocumentModel.category, PersonDocumentModel.name)
    ).all()
    rank = _rank_of(db, person_id)
    return [_enrich(d, rank) for d in rows]


@router.post("/personnel/{person_id}", response_model=PersonDocumentRead, status_code=status.HTTP_201_CREATED)
def add_document(person_id: str, body: PersonDocumentCreate, db: DB, user: Editor):
    if not db.get(PersonModel, person_id):
        raise HTTPException(status_code=404, detail="A személy nem található")
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Az okmány neve kötelező")
    doc = PersonDocumentModel(id=new_id(), personnel_id=person_id)
    _apply(doc, body)
    db.add(doc)
    db.flush()
    record_activity(db, user, mode="create", module=MODULE, record_name=_person_label(db, person_id),
                    entity="document", after=_snapshot(doc))
    db.commit()
    db.refresh(doc)
    return _enrich(doc, _rank_of(db, doc.personnel_id))


@router.put("/{doc_id}", response_model=PersonDocumentRead)
def update_document(doc_id: str, body: PersonDocumentCreate, db: DB, user: Editor):
    doc = db.get(PersonDocumentModel, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Az okmány nem található")
    before = _snapshot(doc)
    _apply(doc, body)
    record_activity(db, user, mode="update", module=MODULE, record_name=_person_label(db, doc.personnel_id),
                    entity="document", before=before, after=_snapshot(doc))
    db.commit()
    db.refresh(doc)
    return _enrich(doc, _rank_of(db, doc.personnel_id))


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(doc_id: str, db: DB, user: Editor):
    doc = db.get(PersonDocumentModel, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Az okmány nem található")
    record_activity(db, user, mode="delete", module=MODULE, record_name=_person_label(db, doc.personnel_id),
                    entity="document", before=_snapshot(doc))
    db.delete(doc)
    db.commit()


@router.get("/expiring")
def expiring_documents(db: DB, user: Reader, days: int = Query(60, ge=1, le=365)):
    """A most vagy hamarosan (N napon belül) lejáró okmányok/alkalmasságok."""
    today = date.today()
    docs = db.scalars(select(PersonDocumentModel).where(PersonDocumentModel.expiry_date.isnot(None))).all()
    persons = {p.id: p for p in db.scalars(scoped_persons(select(PersonModel), user)).all()}

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
        if person is None:
            continue   # hatókörön kívül vagy törölt személy
        result.append({
            "documentId": doc.id,
            "personnelId": doc.personnel_id,
            "name": person.name,
            "sztsz": person.sztsz,
            "rank": person.rank,
            "unit": person.unit,
            "category": doc.category,
            "documentName": doc.name,
            "expiryDate": doc.expiry_date,
            "isExpired": days_left < 0,
            "daysUntilExpiry": days_left,
        })
    result.sort(key=lambda x: x["daysUntilExpiry"])
    return result


# ── Teljes lista + export (Rita „aktuális táblázata") ───────────────────────

def _list_rows(db: Session, user, name: str, days: int | None, mismatch: bool) -> list[dict]:
    """Az összes okmány a hatókörben, szűrhetően. `days` = N napon belül lejáró
    vagy már lejárt; `mismatch` = csak a rendfokozat-eltérések."""
    today = date.today()
    persons = {p.id: p for p in db.scalars(scoped_persons(select(PersonModel), user)).all()}
    query = select(PersonDocumentModel)
    if name:
        query = query.where(PersonDocumentModel.name == name)
    result = []
    for doc in db.scalars(query).all():
        person = persons.get(doc.personnel_id)
        if person is None:
            continue
        days_left = None
        if doc.expiry_date:
            try:
                days_left = (date.fromisoformat(doc.expiry_date[:10]) - today).days
            except ValueError:
                days_left = None
        if days is not None and (days_left is None or days_left > days):
            continue
        is_mismatch = _rank_mismatch(doc, person.rank)
        if mismatch and not is_mismatch:
            continue
        result.append({
            "documentId": doc.id, "personnelId": person.id, "name": person.name, "sztsz": person.sztsz,
            "rank": person.rank, "unit": person.unit, "documentName": doc.name, "category": doc.category,
            "identifier": doc.identifier, "issuedDate": doc.issued_date, "expiryDate": doc.expiry_date,
            "daysUntilExpiry": days_left, "isExpired": days_left is not None and days_left < 0,
            "rankOnCard": doc.rank_on_card, "rankMismatch": is_mismatch,
        })
    # lejárat szerint; a lejárat nélküliek a végére
    result.sort(key=lambda r: (r["daysUntilExpiry"] is None, r["daysUntilExpiry"] or 0, r["name"]))
    return result


@router.get("/types")
def document_types(_: Reader):
    return list(DOCUMENT_TYPES)


@router.get("")
def list_all_documents(
    db: DB, user: Reader, name: str = "", days: int | None = Query(None, ge=0, le=3650), mismatch: bool = False,
):
    return _list_rows(db, user, name, days, mismatch)


@router.get("/export.xlsx")
def export_documents(
    db: DB, user: Reader, name: str = "", days: int | None = Query(None, ge=0, le=3650), mismatch: bool = False,
):
    rows = _list_rows(db, user, name, days, mismatch)
    filters = f"Szűrő: {name or 'minden típus'}"
    if days is not None:
        filters += f", {days} napon belül lejáró"
    if mismatch:
        filters += ", csak rendfokozat-eltérés"
    content = build_table_xlsx(
        "Okmányok", [filters, f"Készült: {date.today().isoformat()} — {len(rows)} tétel"],
        ["Név", "SZTSZ", "Rendfokozat", "Egység", "Okmány", "Okmányszám", "Kártyán lévő rendfokozat", "Lejárat", "Hátralévő nap", "Megjegyzés"],
        [[r["name"], r["sztsz"], r["rank"], r["unit"], r["documentName"], r["identifier"], r["rankOnCard"], r["expiryDate"] or "",
          r["daysUntilExpiry"] if r["daysUntilExpiry"] is not None else "",
          "ÚJ KÁRTYA KELL (rendfokozat)" if r["rankMismatch"] else ("LEJÁRT" if r["isExpired"] else "")] for r in rows],
        [26, 14, 16, 12, 30, 16, 22, 12, 14, 28],
    )
    return Response(content=content, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename=okmanyok-{date.today().isoformat()}.xlsx"})
