"""Beléptetés, élelmezési átjelentő és leszerelési jegyzőkönyv (2. betekintés, Várpalota).

- Beléptetés: a feladat előtt ENTRY_LEAD_DAYS nappal kell leadni a laktanyának a
  résztvevők névsorát igazolványszámmal és lejárattal (Excel).
- Élelmezési átjelentő: létszám naponként (Excel). Az oszlopok pontos alakja Rita
  visszajelzésére vár — addig név/rendfokozat/SZTSZ + naponként egy oszlop.
- Határidő-riasztás: a közelgő feladatok beléptetési határideje.
- Leszerelési jegyzőkönyv: a katonánál lévő felszerelésről (DOCX, két példány).
"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import select

from ..audit import record_activity
from ..constants import ENTRY_LEAD_DAYS, ID_CARD_TYPE
from ..core.dependencies import DB, Editor, Reader
from ..core.scope import assert_owned_in_scope, assert_person_in_scope, scoped_owned
from ..models import EquipmentModel, ExerciseModel, PersonDocumentModel, PersonModel
from ..participants import get_participants
from ..protocol_export import ProtocolLine, build_protocol_docx
from ..table_export import build_table_xlsx

router = APIRouter(prefix="/api/entry", tags=["entry"])

_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_NOT_GOING = ("Visszamondta", "Jelentkezett")  # a jelentkező még nem beosztott


def _load(db, exercise_id: str, user) -> ExerciseModel:
    item = db.get(ExerciseModel, exercise_id)
    if item is None:
        raise HTTPException(status_code=404, detail="A művelet nem található")
    assert_owned_in_scope(user, item, "A művelet")
    return item


def _going(db, exercise: ExerciseModel):
    return [p for p in get_participants(db, "exercise", exercise.id) if p.status not in _NOT_GOING]


def _days(exercise: ExerciseModel) -> list[str]:
    try:
        start, end = date.fromisoformat(exercise.start_date[:10]), date.fromisoformat(exercise.end_date[:10])
    except ValueError:
        return []
    return [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]


def _deadline(exercise: ExerciseModel) -> str:
    try:
        return (date.fromisoformat(exercise.start_date[:10]) - timedelta(days=ENTRY_LEAD_DAYS)).isoformat()
    except ValueError:
        return ""


def _xlsx_response(content: bytes, filename: str) -> Response:
    return Response(content=content, media_type=_XLSX, headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/deadlines")
def entry_deadlines(db: DB, user: Reader, ahead: int = Query(7, ge=0, le=60)):
    """Közelgő feladatok beléptetési határideje (kezdés előtt ENTRY_LEAD_DAYS nappal).
    Negatív `daysLeft` = a határidő már elmúlt, a feladat még nem kezdődött el."""
    today = date.today()
    result = []
    for ex in db.scalars(scoped_owned(select(ExerciseModel), ExerciseModel, user)).all():
        if ex.status == "Lemondva" or not _deadline(ex):
            continue
        start = date.fromisoformat(ex.start_date[:10])
        if start < today:
            continue
        days_left = (date.fromisoformat(_deadline(ex)) - today).days
        if days_left <= ahead:
            result.append({"exerciseId": ex.id, "name": ex.name, "startDate": ex.start_date, "deadline": _deadline(ex),
                           "daysLeft": days_left, "participants": len(_going(db, ex))})
    result.sort(key=lambda r: r["daysLeft"])
    return result


@router.get("/{exercise_id}/entry.xlsx")
def entry_xlsx(exercise_id: str, db: DB, user: Reader):
    ex = _load(db, exercise_id, user)
    people = _going(db, ex)
    cards = {}
    for doc in db.scalars(select(PersonDocumentModel).where(
        PersonDocumentModel.name == ID_CARD_TYPE, PersonDocumentModel.personnel_id.in_([p.personnel_id for p in people] or [""]),
    )):
        cards[doc.personnel_id] = doc
    ranks = {p.id: p.rank for p in db.scalars(select(PersonModel).where(PersonModel.id.in_([p.personnel_id for p in people] or [""])))}
    rows = []
    for p in people:
        card = cards.get(p.personnel_id)
        rows.append([p.person_name, ranks.get(p.personnel_id, p.rank), p.sztsz, card.identifier if card else "",
                     card.expiry_date if card and card.expiry_date else "", "" if card else "NINCS igazolvány rögzítve"])
    content = build_table_xlsx(
        f"Beléptetés — {ex.name}",
        [f"Helyszín: {ex.location}", f"Időszak: {ex.start_date} – {ex.end_date}", f"Leadási határidő: {_deadline(ex)}"],
        ["Név", "Rendfokozat", "SZTSZ", "Szolgálati igazolvány száma", "Igazolvány lejárata", "Megjegyzés"], rows, [28, 16, 14, 26, 18, 28],
    )
    return _xlsx_response(content, f"belepteres-{ex.start_date}.xlsx")


@router.get("/{exercise_id}/meals.xlsx")
def meals_xlsx(exercise_id: str, db: DB, user: Reader):
    ex = _load(db, exercise_id, user)
    people = _going(db, ex)
    days = _days(ex)
    rows = [[p.person_name, p.rank, p.sztsz, *["x"] * len(days)] for p in people]
    rows.append(["Összesen", "", f"{len(people)} fő", *[len(people)] * len(days)])
    content = build_table_xlsx(
        f"Élelmezési átjelentő — {ex.name}",
        [f"Helyszín: {ex.location}", f"Időszak: {ex.start_date} – {ex.end_date}", f"Létszám: {len(people)} fő"],
        ["Név", "Rendfokozat", "SZTSZ", *days], rows, [28, 16, 14, *[12] * len(days)],
    )
    return _xlsx_response(content, f"elelmezesi-atjelento-{ex.start_date}.xlsx")


class ProtocolItem(BaseModel):
    equipmentId: str
    returned: bool = True
    amount: float = 0
    note: str = ""


class ProtocolRequest(BaseModel):
    items: list[ProtocolItem]


@router.post("/protocol/{person_id}")
def discharge_protocol(person_id: str, body: ProtocolRequest, db: DB, user: Editor):
    person = db.get(PersonModel, person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="A személy nem található")
    assert_person_in_scope(user, person)
    lines = []
    for item in body.items:
        eq = db.get(EquipmentModel, item.equipmentId)
        if eq is None or eq.checked_out_to != person_id:
            raise HTTPException(status_code=400, detail="Csak a katonánál lévő felszerelés szerepelhet a jegyzőkönyvben")
        if item.amount < 0:
            raise HTTPException(status_code=400, detail="A fizetendő összeg nem lehet negatív")
        lines.append(ProtocolLine(name=eq.name, serialNumber=eq.serial_number, returned=item.returned, amount=item.amount, note=item.note))
    content = build_protocol_docx(person.name, person.rank, person.sztsz, person.unit, date.today().isoformat(), lines)
    missing = [line.name for line in lines if not line.returned]
    record_activity(db, user, mode="create", module="Felszerelés", record_name=f"Leszerelési jegyzőkönyv — {person.name}",
                    entity="discharge_protocol", after={"items": len(lines), "missing": missing, "amount": sum(l.amount for l in lines if not l.returned)})
    db.commit()
    return Response(content=content, media_type=_DOCX,
                    headers={"Content-Disposition": f"attachment; filename=leszerelesi-jegyzokonyv-{person.sztsz}.docx"})
