"""Parancs-műhely (I5): a parancs a részlegek fejezeteiből áll össze.

A mai fájdalom (1. betekintés): egy régi parancsot formálnak át, a fejezetek
e-mailben járnak körbe, nem látszik, ki mivel hol tart. Itt:

- a parancstípus adja a fejezeteket (melyik részlegé, kötelező-e, kiinduló
  szöveg helyőrzőkkel) és a záró aláírók szerepeit;
- a részlegek EGYMÁSTÓL FÜGGETLENÜL írják a saját fejezetüket a belső
  szerkesztőben; az áttekintő mutatja, kinél van még nyitott fejezet;
- ha minden kötelező fejezet kész, a parancs „Aláírásra vár"; a 2–3 illetékes
  parancsnok aláírása után „Kiadva";
- a dokumentum bármikor összeállítható és exportálható (DOCX/PDF).
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, select

from ..audit import record_activity
from ..constants import ORDER_DEFAULT_ISSUER, ORDER_RESPONSIBLES
from ..core.dependencies import DB, Editor, Reader
from ..core.time import utc_now
from ..models import OrderChapterModel, OrderModel, OrderTypeModel, PersonModel, new_id
from ..order_export import build_docx, build_pdf
from ..schemas import (
    OrderChapterRead,
    OrderChapterUpdate,
    OrderCreate,
    OrderOverview,
    OrderRead,
    OrderResponsibleSummary,
    OrderSignature,
    OrderSignaturesUpdate,
    OrderTypeCreate,
    OrderTypeRead,
    OrderTypeUpdate,
    OrderUpdate,
)

router = APIRouter(prefix="/api/orders", tags=["orders"])

MODULE = "Parancsok"
_OPEN_ORDER_STATUSES = ("Előkészítés", "Aláírásra vár")
_CHAPTER_DONE = ("Kész", "Nem szükséges")
_DOCX_MEDIA = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


# ── Parancstípusok ───────────────────────────────────────────────────────────

def _validate_chapters(chapters) -> list[dict]:
    if not chapters:
        raise HTTPException(status_code=400, detail="Legalább egy fejezet kell")
    cleaned = []
    for ch in chapters:
        name = ch.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="A fejezet neve nem lehet üres")
        if ch.responsible not in ORDER_RESPONSIBLES:
            raise HTTPException(status_code=400, detail=f"Ismeretlen felelős: {ch.responsible}")
        cleaned.append({"name": name, "responsible": ch.responsible, "required": ch.required, "template": ch.template})
    return cleaned


def _validate_signers(signers: list[str]) -> list[str]:
    """Üres is lehet: a parancson utólag is felvehető aláírás-hely."""
    return [s.strip() for s in signers if s.strip()]


def _order_counts(db) -> dict[str, int]:
    rows = db.execute(select(OrderModel.order_type_id, func.count()).group_by(OrderModel.order_type_id)).all()
    return {type_id: count for type_id, count in rows}


def _serialize_type(item: OrderTypeModel, order_count: int) -> OrderTypeRead:
    return OrderTypeRead(id=item.id, name=item.name, description=item.description,
                         chapters=item.chapters or [], signers=item.signers or [], orderCount=order_count)


@router.get("/types", response_model=list[OrderTypeRead])
def list_types(db: DB, _: Reader):
    counts = _order_counts(db)
    items = db.scalars(select(OrderTypeModel).order_by(OrderTypeModel.name)).all()
    return [_serialize_type(i, counts.get(i.id, 0)) for i in items]


@router.post("/types", response_model=OrderTypeRead, status_code=status.HTTP_201_CREATED)
def create_type(payload: OrderTypeCreate, db: DB, user: Editor):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="A név kötelező")
    if db.scalar(select(OrderTypeModel).where(OrderTypeModel.name == name)):
        raise HTTPException(status_code=409, detail="Már van ilyen nevű parancstípus")
    item = OrderTypeModel(id=new_id(), name=name, description=payload.description,
                          chapters=_validate_chapters(payload.chapters), signers=_validate_signers(payload.signers))
    db.add(item)
    record_activity(db, user, mode="create", module=MODULE, record_name=name, entity="order_type",
                    after={"id": item.id, "name": name, "chapters": len(item.chapters)})
    db.commit()
    db.refresh(item)
    return _serialize_type(item, 0)


@router.put("/types/{type_id}", response_model=OrderTypeRead)
def update_type(type_id: str, payload: OrderTypeUpdate, db: DB, user: Editor):
    item = db.get(OrderTypeModel, type_id)
    if not item:
        raise HTTPException(status_code=404, detail="A parancstípus nem található")
    name = payload.name.strip()
    clash = db.scalar(select(OrderTypeModel).where(OrderTypeModel.name == name, OrderTypeModel.id != type_id))
    if clash:
        raise HTTPException(status_code=409, detail="Már van ilyen nevű parancstípus")
    before = {"id": item.id, "name": item.name, "chapters": len(item.chapters or [])}
    item.name = name
    item.description = payload.description
    item.chapters = _validate_chapters(payload.chapters)
    item.signers = _validate_signers(payload.signers)
    record_activity(db, user, mode="update", module=MODULE, record_name=name, entity="order_type",
                    before=before, after={"id": item.id, "name": name, "chapters": len(item.chapters)})
    db.commit()
    db.refresh(item)
    return _serialize_type(item, _order_counts(db).get(item.id, 0))


@router.delete("/types/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_type(type_id: str, db: DB, user: Editor):
    item = db.get(OrderTypeModel, type_id)
    if not item:
        raise HTTPException(status_code=404, detail="A parancstípus nem található")
    if _order_counts(db).get(type_id, 0):
        raise HTTPException(status_code=409, detail="A típushoz tartoznak parancsok; előbb azokat kell törölni")
    record_activity(db, user, mode="delete", module=MODULE, record_name=item.name, entity="order_type",
                    before={"id": item.id, "name": item.name})
    db.delete(item)
    db.commit()


# ── Parancsok ────────────────────────────────────────────────────────────────

def _chapters_of(db, order_id: str) -> list[OrderChapterModel]:
    return db.scalars(
        select(OrderChapterModel).where(OrderChapterModel.order_id == order_id).order_by(OrderChapterModel.position)
    ).all()


def _chapters_by_order(db, order_ids: list[str]) -> dict[str, list[OrderChapterModel]]:
    grouped: dict[str, list[OrderChapterModel]] = {}
    if not order_ids:
        return grouped
    rows = db.scalars(
        select(OrderChapterModel).where(OrderChapterModel.order_id.in_(order_ids)).order_by(OrderChapterModel.position)
    ).all()
    for ch in rows:
        grouped.setdefault(ch.order_id, []).append(ch)
    return grouped


def _pending_responsibles(chapters: list[OrderChapterModel]) -> list[str]:
    """Részlegek, amelyeknek még van el nem készült kötelező fejezete (a
    dokumentum sorrendjében, ismétlés nélkül). A részlegek függetlenek."""
    seen: dict[str, None] = {}
    for ch in chapters:
        if ch.required and ch.status not in _CHAPTER_DONE:
            seen.setdefault(ch.responsible, None)
    return list(seen)


def _signatures(order: OrderModel) -> list[OrderSignature]:
    return [OrderSignature(**s) for s in (order.signatures or [])]


def _serialize_chapter(ch: OrderChapterModel) -> OrderChapterRead:
    return OrderChapterRead(
        id=ch.id, position=ch.position, name=ch.name, responsible=ch.responsible, required=ch.required,
        content=ch.content or "", status=ch.status, assignee=ch.assignee, dueDate=ch.due_date, note=ch.note,
        updatedBy=ch.updated_by, updatedAt=ch.updated_at,
    )


def _serialize_order(order: OrderModel, chapters: list[OrderChapterModel], today: str, with_chapters: bool) -> OrderRead:
    done = sum(1 for ch in chapters if ch.status in _CHAPTER_DONE)
    is_open = order.status in _OPEN_ORDER_STATUSES
    pending = _pending_responsibles(chapters) if is_open else []
    signatures = _signatures(order)
    return OrderRead(
        id=order.id, orderTypeId=order.order_type_id, typeName=order.type_name,
        number=order.number or "", issuer=order.issuer or "", subject=order.subject,
        personnelId=order.personnel_id, personName=order.person_name, status=order.status,
        dueDate=order.due_date, issuedDate=order.issued_date or "", notes=order.notes,
        createdBy=order.created_by, createdAt=order.created_at,
        doneChapters=done, totalChapters=len(chapters),
        pendingResponsibles=pending,
        readyToSign=bool(chapters) and not _pending_responsibles(chapters),
        signedCount=sum(1 for s in signatures if s.signed),
        isOverdue=bool(is_open and order.due_date and order.due_date < today),
        signatures=signatures,
        chapters=[_serialize_chapter(ch) for ch in chapters] if with_chapters else [],
    )


def _order_snapshot(order: OrderModel) -> dict:
    return {"id": order.id, "subject": order.subject, "status": order.status, "number": order.number,
            "dueDate": order.due_date, "issuedDate": order.issued_date, "notes": order.notes}


def _fill_template(template: str, values: dict[str, str]) -> str:
    text = template or ""
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", value)
    return text


def _placeholder_values(order: OrderModel, person: PersonModel | None) -> dict[str, str]:
    return {
        "név": person.name if person else "",
        "rendfokozat": person.rank if person else "",
        "sztsz": person.sztsz if person else "",
        "alegység": person.unit if person else "",
        "tárgy": order.subject,
        "dátum": date.today().isoformat(),
        "parancsszám": order.number or "",
    }


def _advance_status(order: OrderModel, chapters: list[OrderChapterModel]) -> None:
    """Automatikus lépések: minden kötelező fejezet kész → Aláírásra vár;
    minden aláírás megvan → Kiadva. Visszalépést nem csinál (az kézi döntés)."""
    if order.status == "Előkészítés" and chapters and not _pending_responsibles(chapters):
        order.status = "Aláírásra vár"
    signatures = order.signatures or []
    if order.status == "Aláírásra vár" and signatures and all(s.get("signed") for s in signatures):
        order.status = "Kiadva"
        order.issued_date = order.issued_date or date.today().isoformat()


@router.get("", response_model=list[OrderRead])
def list_orders(db: DB, _: Reader, status_filter: str = Query("", alias="status"), open_only: bool = False):
    query = select(OrderModel)
    if status_filter:
        query = query.where(OrderModel.status == status_filter)
    elif open_only:
        query = query.where(OrderModel.status.in_(_OPEN_ORDER_STATUSES))
    orders = db.scalars(query.order_by(OrderModel.created_at.desc())).all()
    chapters = _chapters_by_order(db, [o.id for o in orders])
    today = date.today().isoformat()
    return [_serialize_order(o, chapters.get(o.id, []), today, with_chapters=False) for o in orders]


@router.get("/overview", response_model=OrderOverview)
def overview(db: DB, _: Reader):
    """Részlegenként: hány nyitott fejezet, ebből hány lejárt, és hány parancs
    vár még rá. Egy képernyőn látszik, hol torlódik a munka."""
    today = date.today().isoformat()
    orders = db.scalars(select(OrderModel).where(OrderModel.status.in_(_OPEN_ORDER_STATUSES))).all()
    chapters = _chapters_by_order(db, [o.id for o in orders])

    summary = {r: {"open": 0, "overdue": 0, "blocking": 0} for r in ORDER_RESPONSIBLES}
    overdue_orders = 0
    for order in orders:
        order_chapters = chapters.get(order.id, [])
        if order.due_date and order.due_date < today:
            overdue_orders += 1
        for responsible in _pending_responsibles(order_chapters):
            summary.setdefault(responsible, {"open": 0, "overdue": 0, "blocking": 0})["blocking"] += 1
        for ch in order_chapters:
            if ch.status in _CHAPTER_DONE:
                continue
            bucket = summary.setdefault(ch.responsible, {"open": 0, "overdue": 0, "blocking": 0})
            bucket["open"] += 1
            if ch.due_date and ch.due_date < today:
                bucket["overdue"] += 1

    return OrderOverview(
        openOrders=len(orders), overdueOrders=overdue_orders,
        byResponsible=[
            OrderResponsibleSummary(responsible=r, openChapters=v["open"], overdueChapters=v["overdue"], blockingOrders=v["blocking"])
            for r, v in summary.items()
        ],
    )


@router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderCreate, db: DB, user: Editor):
    order_type = db.get(OrderTypeModel, payload.orderTypeId)
    if not order_type:
        raise HTTPException(status_code=404, detail="A parancstípus nem található")
    subject = payload.subject.strip()
    if not subject:
        raise HTTPException(status_code=400, detail="A tárgy kötelező")
    person = None
    if payload.personnelId:
        person = db.get(PersonModel, payload.personnelId)
        if not person:
            raise HTTPException(status_code=404, detail="A személy nem található")

    order = OrderModel(
        id=new_id(), order_type_id=order_type.id, type_name=order_type.name, subject=subject,
        number=payload.number.strip(), issuer=payload.issuer.strip() or ORDER_DEFAULT_ISSUER,
        personnel_id=payload.personnelId, person_name=person.name if person else "",
        due_date=payload.dueDate, notes=payload.notes, created_by=user.username,
        signatures=[{"role": role, "name": "", "signed": False, "signedAt": "", "signedBy": ""} for role in (order_type.signers or [])],
    )
    db.add(order)
    # Pillanatkép a típus fejezeteiről, a sablon-szöveg helyőrzői kitöltve.
    values = _placeholder_values(order, person)
    for position, ch in enumerate(order_type.chapters or []):
        db.add(OrderChapterModel(
            id=new_id(), order_id=order.id, position=position,
            name=ch["name"], responsible=ch["responsible"], required=bool(ch.get("required", True)),
            content=_fill_template(ch.get("template", ""), values),
        ))
    db.flush()
    record_activity(db, user, mode="create", module=MODULE, record_name=subject, entity="order",
                    after=_order_snapshot(order))
    db.commit()
    return _serialize_order(order, _chapters_of(db, order.id), date.today().isoformat(), with_chapters=True)


def _require_order(db, order_id: str) -> OrderModel:
    order = db.get(OrderModel, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="A parancs nem található")
    return order


@router.get("/{order_id}", response_model=OrderRead)
def get_order(order_id: str, db: DB, _: Reader):
    order = _require_order(db, order_id)
    return _serialize_order(order, _chapters_of(db, order_id), date.today().isoformat(), with_chapters=True)


@router.put("/{order_id}", response_model=OrderRead)
def update_order(order_id: str, payload: OrderUpdate, db: DB, user: Editor):
    order = _require_order(db, order_id)
    subject = payload.subject.strip()
    if not subject:
        raise HTTPException(status_code=400, detail="A tárgy kötelező")
    before = _order_snapshot(order)
    order.subject = subject
    order.status = payload.status
    order.number = payload.number.strip()
    order.issuer = payload.issuer.strip() or ORDER_DEFAULT_ISSUER
    order.due_date = payload.dueDate
    order.issued_date = payload.issuedDate
    order.notes = payload.notes
    record_activity(db, user, mode="update", module=MODULE, record_name=subject, entity="order",
                    before=before, after=_order_snapshot(order))
    db.commit()
    return _serialize_order(order, _chapters_of(db, order_id), date.today().isoformat(), with_chapters=True)


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(order_id: str, db: DB, user: Editor):
    order = _require_order(db, order_id)
    record_activity(db, user, mode="delete", module=MODULE, record_name=order.subject, entity="order",
                    before=_order_snapshot(order))
    for ch in _chapters_of(db, order_id):
        db.delete(ch)
    db.delete(order)
    db.commit()


@router.put("/{order_id}/chapters/{chapter_id}", response_model=OrderRead)
def update_chapter(order_id: str, chapter_id: str, payload: OrderChapterUpdate, db: DB, user: Editor):
    order = _require_order(db, order_id)
    chapter = db.get(OrderChapterModel, chapter_id)
    if not chapter or chapter.order_id != order_id:
        raise HTTPException(status_code=404, detail="A fejezet nem található")
    before = {"status": chapter.status, "assignee": chapter.assignee, "dueDate": chapter.due_date,
              "note": chapter.note, "contentLength": len(chapter.content or "")}
    chapter.status = payload.status
    chapter.content = payload.content
    chapter.assignee = payload.assignee.strip()
    chapter.due_date = payload.dueDate
    chapter.note = payload.note
    chapter.updated_by = user.username
    chapter.updated_at = utc_now()
    chapters = _chapters_of(db, order_id)
    _advance_status(order, chapters)
    record_activity(
        db, user, mode="update", module=MODULE, record_name=f"{order.subject} / {chapter.name}", entity="order_chapter",
        before=before, after={"status": chapter.status, "assignee": chapter.assignee, "dueDate": chapter.due_date,
                              "note": chapter.note, "contentLength": len(chapter.content or "")},
    )
    db.commit()
    return _serialize_order(order, chapters, date.today().isoformat(), with_chapters=True)


@router.put("/{order_id}/signatures", response_model=OrderRead)
def update_signatures(order_id: str, payload: OrderSignaturesUpdate, db: DB, user: Editor):
    """Az aláírók neve és az aláírás ténye. Az újonnan aláírt tételre a rendszer
    rögzíti, ki és mikor jelölte be — ez a nyoma annak, hogy ki adta ki."""
    order = _require_order(db, order_id)
    # Pozíció szerint párosítunk (a szerep átnevezhető, és ugyanaz a szerep többször is szerepelhet).
    previous = list(order.signatures or [])
    now = utc_now().isoformat(timespec="seconds")
    updated = []
    for index, sig in enumerate(payload.signatures):
        old = previous[index] if index < len(previous) else {}
        signed_at, signed_by = old.get("signedAt", ""), old.get("signedBy", "")
        if sig.signed and not old.get("signed"):
            signed_at, signed_by = now, user.username
        if not sig.signed:
            signed_at, signed_by = "", ""
        updated.append({"role": sig.role.strip(), "name": sig.name.strip(), "signed": sig.signed,
                        "signedAt": signed_at, "signedBy": signed_by})
    before = {"signed": sum(1 for s in (order.signatures or []) if s.get("signed"))}
    order.signatures = updated
    chapters = _chapters_of(db, order_id)
    _advance_status(order, chapters)
    record_activity(db, user, mode="update", module=MODULE, record_name=order.subject, entity="order_signatures",
                    before=before, after={"signed": sum(1 for s in updated if s["signed"]), "status": order.status})
    db.commit()
    return _serialize_order(order, chapters, date.today().isoformat(), with_chapters=True)


@router.get("/{order_id}/export.docx")
def export_docx(order_id: str, db: DB, _: Reader):
    order = _require_order(db, order_id)
    plan = _serialize_order(order, _chapters_of(db, order_id), date.today().isoformat(), with_chapters=True)
    return Response(
        content=build_docx(plan), media_type=_DOCX_MEDIA,
        headers={"Content-Disposition": f"attachment; filename=parancs-{order_id[:8]}.docx"},
    )


@router.get("/{order_id}/export.pdf")
def export_pdf(order_id: str, db: DB, _: Reader):
    order = _require_order(db, order_id)
    plan = _serialize_order(order, _chapters_of(db, order_id), date.today().isoformat(), with_chapters=True)
    return Response(
        content=build_pdf(plan), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=parancs-{order_id[:8]}.pdf"},
    )
