"""Parancs-műhely (I5): parancstípusok fejezet-sablonnal, parancsok fejezetenkénti
állapottal, és a „ki tartja fel" áttekintő.

Szándékosan NEM generál parancs-szöveget. A mai fájdalom (1. betekintés): a
fejezetek e-mailben járnak körbe, nem látszik, ki mivel hol tart, és a
személyügy megcsinálja mások részét is. Itt minden fejezetnek van felelőse és
állapota, a parancs pedig megmutatja, kinél áll.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from ..audit import record_activity
from ..constants import ORDER_RESPONSIBLES
from ..core.dependencies import DB, Editor, Reader
from ..core.time import utc_now
from ..models import OrderChapterModel, OrderModel, OrderTypeModel, PersonModel, new_id
from ..schemas import (
    OrderChapterRead,
    OrderChapterUpdate,
    OrderCreate,
    OrderOverview,
    OrderRead,
    OrderResponsibleSummary,
    OrderTypeCreate,
    OrderTypeRead,
    OrderTypeUpdate,
    OrderUpdate,
)

router = APIRouter(prefix="/api/orders", tags=["orders"])

MODULE = "Parancsok"
_OPEN_ORDER_STATUSES = ("Előkészítés", "Aláírásra vár")
_CHAPTER_DONE = ("Kész", "Nem szükséges")


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
        cleaned.append({"name": name, "responsible": ch.responsible, "required": ch.required})
    return cleaned


def _order_counts(db) -> dict[str, int]:
    rows = db.execute(select(OrderModel.order_type_id, func.count()).group_by(OrderModel.order_type_id)).all()
    return {type_id: count for type_id, count in rows}


def _serialize_type(item: OrderTypeModel, order_count: int) -> OrderTypeRead:
    return OrderTypeRead(id=item.id, name=item.name, description=item.description,
                         chapters=item.chapters or [], orderCount=order_count)


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
                          chapters=_validate_chapters(payload.chapters))
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


def _blocked_by(chapters: list[OrderChapterModel]) -> str:
    """A sorrendben első, még nem kész kötelező fejezet felelőse."""
    for ch in chapters:
        if ch.required and ch.status not in _CHAPTER_DONE:
            return ch.responsible
    return ""


def _serialize_chapter(ch: OrderChapterModel) -> OrderChapterRead:
    return OrderChapterRead(
        id=ch.id, position=ch.position, name=ch.name, responsible=ch.responsible, required=ch.required,
        status=ch.status, assignee=ch.assignee, dueDate=ch.due_date, note=ch.note,
        updatedBy=ch.updated_by, updatedAt=ch.updated_at,
    )


def _serialize_order(order: OrderModel, chapters: list[OrderChapterModel], today: str, with_chapters: bool) -> OrderRead:
    done = sum(1 for ch in chapters if ch.status in _CHAPTER_DONE)
    is_open = order.status in _OPEN_ORDER_STATUSES
    return OrderRead(
        id=order.id, orderTypeId=order.order_type_id, typeName=order.type_name, subject=order.subject,
        personnelId=order.personnel_id, personName=order.person_name, status=order.status,
        dueDate=order.due_date, notes=order.notes, createdBy=order.created_by, createdAt=order.created_at,
        doneChapters=done, totalChapters=len(chapters),
        blockedBy=_blocked_by(chapters) if is_open else "",
        isOverdue=bool(is_open and order.due_date and order.due_date < today),
        chapters=[_serialize_chapter(ch) for ch in chapters] if with_chapters else [],
    )


def _order_snapshot(order: OrderModel) -> dict:
    return {"id": order.id, "subject": order.subject, "status": order.status,
            "dueDate": order.due_date, "notes": order.notes}


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
    """Felelősönként: hány nyitott fejezet, ebből hány lejárt, és hány parancsot
    tart fel éppen. A vezetőnek ez az egy képernyő mondja meg, hol torlódik."""
    today = date.today().isoformat()
    orders = db.scalars(select(OrderModel).where(OrderModel.status.in_(_OPEN_ORDER_STATUSES))).all()
    chapters = _chapters_by_order(db, [o.id for o in orders])

    summary = {r: {"open": 0, "overdue": 0, "blocking": 0} for r in ORDER_RESPONSIBLES}
    overdue_orders = 0
    for order in orders:
        order_chapters = chapters.get(order.id, [])
        if order.due_date and order.due_date < today:
            overdue_orders += 1
        blocker = _blocked_by(order_chapters)
        if blocker:
            summary.setdefault(blocker, {"open": 0, "overdue": 0, "blocking": 0})["blocking"] += 1
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
    person_name = ""
    if payload.personnelId:
        person = db.get(PersonModel, payload.personnelId)
        if not person:
            raise HTTPException(status_code=404, detail="A személy nem található")
        person_name = person.name

    order = OrderModel(
        id=new_id(), order_type_id=order_type.id, type_name=order_type.name, subject=subject,
        personnel_id=payload.personnelId, person_name=person_name,
        due_date=payload.dueDate, notes=payload.notes, created_by=user.username,
    )
    db.add(order)
    # Pillanatkép a típus fejezeteiről: a típus későbbi módosítása ezt nem érinti.
    for position, ch in enumerate(order_type.chapters or []):
        db.add(OrderChapterModel(
            id=new_id(), order_id=order.id, position=position,
            name=ch["name"], responsible=ch["responsible"], required=bool(ch.get("required", True)),
        ))
    db.flush()
    record_activity(db, user, mode="create", module=MODULE, record_name=subject, entity="order",
                    after=_order_snapshot(order))
    db.commit()
    return _serialize_order(order, _chapters_of(db, order.id), date.today().isoformat(), with_chapters=True)


@router.get("/{order_id}", response_model=OrderRead)
def get_order(order_id: str, db: DB, _: Reader):
    order = db.get(OrderModel, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="A parancs nem található")
    return _serialize_order(order, _chapters_of(db, order_id), date.today().isoformat(), with_chapters=True)


@router.put("/{order_id}", response_model=OrderRead)
def update_order(order_id: str, payload: OrderUpdate, db: DB, user: Editor):
    order = db.get(OrderModel, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="A parancs nem található")
    subject = payload.subject.strip()
    if not subject:
        raise HTTPException(status_code=400, detail="A tárgy kötelező")
    before = _order_snapshot(order)
    order.subject = subject
    order.status = payload.status
    order.due_date = payload.dueDate
    order.notes = payload.notes
    record_activity(db, user, mode="update", module=MODULE, record_name=subject, entity="order",
                    before=before, after=_order_snapshot(order))
    db.commit()
    return _serialize_order(order, _chapters_of(db, order_id), date.today().isoformat(), with_chapters=True)


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(order_id: str, db: DB, user: Editor):
    order = db.get(OrderModel, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="A parancs nem található")
    record_activity(db, user, mode="delete", module=MODULE, record_name=order.subject, entity="order",
                    before=_order_snapshot(order))
    for ch in _chapters_of(db, order_id):
        db.delete(ch)
    db.delete(order)
    db.commit()


@router.put("/{order_id}/chapters/{chapter_id}", response_model=OrderRead)
def update_chapter(order_id: str, chapter_id: str, payload: OrderChapterUpdate, db: DB, user: Editor):
    order = db.get(OrderModel, order_id)
    chapter = db.get(OrderChapterModel, chapter_id)
    if not order or not chapter or chapter.order_id != order_id:
        raise HTTPException(status_code=404, detail="A fejezet nem található")
    before = {"status": chapter.status, "assignee": chapter.assignee, "dueDate": chapter.due_date, "note": chapter.note}
    chapter.status = payload.status
    chapter.assignee = payload.assignee.strip()
    chapter.due_date = payload.dueDate
    chapter.note = payload.note
    chapter.updated_by = user.username
    chapter.updated_at = utc_now()
    record_activity(
        db, user, mode="update", module=MODULE, record_name=f"{order.subject} / {chapter.name}", entity="order_chapter",
        before=before, after={"status": chapter.status, "assignee": chapter.assignee, "dueDate": chapter.due_date, "note": chapter.note},
    )
    db.commit()
    return _serialize_order(order, _chapters_of(db, order_id), date.today().isoformat(), with_chapters=True)
