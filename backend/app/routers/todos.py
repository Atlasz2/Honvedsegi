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
from ..constants import ALERT_WARN_DAYS
from ..core.dependencies import DB, Reader
from ..models import ExerciseModel, LeaveRequestModel, OrderChapterModel, OrderModel, PersonModel, TrainingModel

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
    week_end = (today + timedelta(days=7)).isoformat()
    department = (user.department or "").strip()

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
    if user.role in _CAN_EDIT:
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
    deadlines = order_deadlines(db, user, ALERT_WARN_DAYS)["items"]
    basic = basic_training_deadline(db, user, 365)["items"]
    alerts = {
        "overdueOrderDeadlines": sum(1 for d in deadlines if d["isOverdue"]),
        "dueSoonOrderDeadlines": sum(1 for d in deadlines if d["isDueSoon"]),
        "basicTrainingOverdue": sum(1 for b in basic if b["isOverdue"]),
        "basicTrainingDueSoon": sum(1 for b in basic if b["isDueSoon"]),
    }

    # 5) A következő 7 nap műveletei.
    upcoming: list[dict] = []
    for source, model in (("exercise", ExerciseModel), ("training", TrainingModel)):
        for item in db.scalars(
            select(model).where(model.status != "Lemondva", model.start_date <= week_end, model.end_date >= today_iso)
            .order_by(model.start_date)
        ).all():
            upcoming.append({"id": item.id, "source": source, "name": item.name, "type": item.type,
                             "startDate": item.start_date[:10], "endDate": item.end_date[:10], "location": item.location or ""})
    upcoming.sort(key=lambda x: (x["startDate"], x["name"]))

    return {
        "department": department,
        "myChapters": my_chapters,
        "waitingSignature": int(waiting_signature),
        "pendingLeave": pending_leave,
        "pendingLeaveCount": pending_leave_count,
        "alerts": alerts,
        "upcoming": upcoming[:12],
        "upcomingCount": len(upcoming),
    }
