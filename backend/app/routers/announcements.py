from __future__ import annotations
from fastapi import APIRouter
from sqlalchemy import select

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


@router.post("", response_model=AnnouncementRead)
def create_announcement(payload: AnnouncementCreate, db: DB, user: Editor):
    item = AnnouncementModel(
        title=payload.title, category=payload.category, content=payload.content,
        author=user.display_name, date=utc_now().date().isoformat(), pinned=payload.pinned,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize_announcement(item)


@router.put("/{item_id}", response_model=AnnouncementRead)
def update_announcement(item_id: str, payload: AnnouncementUpdate, db: DB, _: Editor):
    item = require_model(db, AnnouncementModel, item_id)
    item.title = payload.title
    item.category = payload.category
    item.content = payload.content
    item.pinned = payload.pinned
    db.commit()
    db.refresh(item)
    return serialize_announcement(item)


@router.delete("/{item_id}", status_code=204)
def delete_announcement(item_id: str, db: DB, _: Editor):
    item = require_model(db, AnnouncementModel, item_id)
    db.delete(item)
    db.commit()
