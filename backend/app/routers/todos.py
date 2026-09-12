"""Teendőim: a bejelentkezett felhasználó személyes kezdőoldala.

Nem új adat, hanem a meglévő szűrése a felhasználóra: a részlegem nyitott
parancs-fejezetei, a lejáró határidők, a jóváhagyásra váró szabadságok
(szerkesztőnek), a ma esedékes riasztások száma és a heti műveletek. Ettől
lesz személyes a rendszer, és a parancs-folyamat e-mail nélkül működik.
"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from .alerts import basic_training_deadline, order_deadlines
from ..constants import DEPARTMENT_DUTIES
from ..core.dependencies import DB, Reader
from ..models import AnnouncementModel, ExerciseModel, LeaveRequestModel, OrderChapterModel, OrderModel, PersonModel

router = APIRouter(prefix="/api/me", tags=["me"])

_OPEN_ORDER = ("Előkészítés", "Aláírásra vár")
_CHAPTER_DONE = ("Kész", "Nem szükséges")
_CAN_EDIT = {"editor", "admin", "fejleszto"}


def _days_left(due: str, today: date) -> int | None:
    """Hibás/üres dátumnál None — egy elgépelt határidő ne döntse le az oldalt."""
    try:
        return (date.fromisoformat((due or "")[:10]) - today).days if due else None
    except ValueError:
        return None


@router.get("/todos")
def my_todos(db: DB, user: Reader):
    today = date.today()
    today_iso = today.isoformat()
    department = (user.department or "").strip()
    # Mi tartozik hozzám: a részleg szerint; admin/alkotó mindent lát, részleg
    # nélküli szerkesztő csak az általánosat (heti műveletek).
    if user.role in ("admin", "fejleszto"):
        duties = {"chapters", "orders", "leave", "training", "operations"}
    else:
        duties = set(DEPARTMENT_DUTIES.get(department, ())) | {"operations"}

    # 1) A részlegem nyitott fejezetei (a legrégebbi határidő elöl, határidő nélküliek a végén).
    my_chapters: list[dict] = []
    if department:
        rows = db.execute(
            select(OrderChapterModel, OrderModel)
            .join(OrderModel, OrderModel.id == OrderChapterModel.order_id)
            .where(
                OrderChapterModel.responsible == department,
                OrderChapterModel.status.notin_(_CHAPTER_DONE),
                OrderModel.status.in_(_OPEN_ORDER),
            )
        ).all()
        for chapter, order in rows:
            days_left = _days_left(chapter.due_date, today)
            my_chapters.append({
                "orderId": order.id, "number": order.number or "", "subject": order.subject,
                "chapterId": chapter.id, "chapter": chapter.name, "status": chapter.status,
                "assignee": chapter.assignee, "dueDate": chapter.due_date[:10] if chapter.due_date else "",
                "daysLeft": days_left, "isOverdue": days_left is not None and days_left < 0,
                "hasText": bool((chapter.content or "").strip()),
            })
        my_chapters.sort(key=lambda c: (c["daysLeft"] is None, c["daysLeft"] if c["daysLeft"] is not None else 0, c["subject"].lower()))

    # 2) Aláírásra váró parancsok — mindenkinek látszik, aki parancsokkal dolgozik.
    waiting_signature = db.scalar(select(func.count()).select_from(OrderModel).where(OrderModel.status == "Aláírásra vár")) or 0

    # 3) Jóváhagyásra váró szabadságok (csak aki dönthet).
    pending_leave: list[dict] = []
    pending_leave_count = 0
    if user.role in _CAN_EDIT and "leave" in duties:
        leaves = db.scalars(
            select(LeaveRequestModel).where(LeaveRequestModel.status == "Beadva").order_by(LeaveRequestModel.start_date)
        ).all()
        pending_leave_count = len(leaves)
        names = {}
        if leaves:
            ids = list({lv.personnel_id for lv in leaves})
            names = {pid: name for pid, name in db.execute(select(PersonModel.id, PersonModel.name).where(PersonModel.id.in_(ids)))}
        pending_leave = [
            {"id": lv.id, "personName": names.get(lv.personnel_id, "?"), "type": lv.type,
             "startDate": lv.start_date, "endDate": lv.end_date}
            for lv in leaves[:8]
        ]

    # 4) Ma esedékes riasztások — csak számok, a részletek a Figyelmeztetéseken.
    # Parancs-határidő: a saját részleg fejezetei; az Ügyvitel (és admin) a parancs egészét is.
    deadlines = order_deadlines(db, user, None)["items"] if ("chapters" in duties or "orders" in duties) else []
    mine = [d for d in deadlines if (d["kind"] == "chapter" and (d["responsible"] == department or user.role in ("admin", "fejleszto")))
            or (d["kind"] == "order" and "orders" in duties)]
    basic = basic_training_deadline(db, user, None)["items"] if "training" in duties else []
    alerts = {
        "overdueOrderDeadlines": sum(1 for d in mine if d["isOverdue"]),
        "dueSoonOrderDeadlines": sum(1 for d in mine if d["isDueSoon"]),
        "basicTrainingOverdue": sum(1 for b in basic if b["isOverdue"]),
        "basicTrainingDueSoon": sum(1 for b in basic if b["isDueSoon"]),
    }

    # Friss változások (időpont/helyszín módosult) az elmúlt 7 napból — mindenkinek.
    since = (today - timedelta(days=7)).isoformat()
    changes = [
        {"id": a.id, "title": a.title, "content": a.content, "date": a.date, "author": a.author}
        for a in db.scalars(
            select(AnnouncementModel).where(AnnouncementModel.category == "Változás", AnnouncementModel.date >= since)
            .order_by(AnnouncementModel.date.desc()).limit(10)
        ).all()
    ]

    return {
        "department": department,
        "duties": sorted(duties),
        "changes": changes,
        "myChapters": my_chapters,
        "waitingSignature": int(waiting_signature),
        "pendingLeave": pending_leave,
        "pendingLeaveCount": pending_leave_count,
        "alerts": alerts,
    }
