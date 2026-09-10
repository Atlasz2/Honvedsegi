from __future__ import annotations
from fastapi import APIRouter
from sqlalchemy import select

from ..audit import record_activity
from ..core.dependencies import DB, Reader, Editor
from ..core.time import utc_now
from ..models import AnnouncementModel
from ..repository import require_model
from ..schemas import AnnouncementCreate, AnnouncementRead, AnnouncementUpdate
from ..serializers import serialize_announcement

router = APIRouter(prefix="/api/announcements", tags=["announcements"])


@router.get("", response_model=list[AnnouncementRead])
def list_announcements(db: DB, _: Reader):
    return [serialize_announcement(i) for i in db.scalars(
        select(AnnouncementModel).order_by(AnnouncementModel.pinned.desc(), AnnouncementModel.date.desc())
    ).all()]


MODULE = "Hirdetmények"


def _snapshot(item: AnnouncementModel) -> dict:
    return {
        "title": item.title, "category": item.category, "content": item.content,
        "pinned": item.pinned,
    }


@router.post("", response_model=AnnouncementRead)
def create_announcement(payload: AnnouncementCreate, db: DB, user: Editor):
    item = AnnouncementModel(
        title=payload.title, category=payload.category, content=payload.content,
        author=user.display_name, date=utc_now().date().isoformat(), pinned=payload.pinned,
    )
    db.add(item)
    db.flush()
    record_activity(db, user, mode="create", module=MODULE, record_name=item.title,
                    entity="announcement", after=_snapshot(item))
    db.commit()
    db.refresh(item)
    return serialize_announcement(item)


@router.put("/{item_id}", response_model=AnnouncementRead)
def update_announcement(item_id: str, payload: AnnouncementUpdate, db: DB, user: Editor):
    item = require_model(db, AnnouncementModel, item_id)
    before = _snapshot(item)
    item.title = payload.title
    item.category = payload.category
    item.content = payload.content
    item.pinned = payload.pinned
    record_activity(db, user, mode="update", module=MODULE, record_name=item.title,
                    entity="announcement", before=before, after=_snapshot(item))
    db.commit()
    db.refresh(item)
    return serialize_announcement(item)


@router.delete("/{item_id}", status_code=204)
def delete_announcement(item_id: str, db: DB, user: Editor):
    item = require_model(db, AnnouncementModel, item_id)
    record_activity(db, user, mode="delete", module=MODULE, record_name=item.title,
                    entity="announcement", before=_snapshot(item))
    db.delete(item)
    db.commit()
