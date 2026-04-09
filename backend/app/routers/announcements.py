from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..db import get_db
from ..deps import _get_current_user, _require_editor, _require_model, _serialize_announcement, _utc_now
from ..models import AnnouncementModel, UserModel
from ..schemas import AnnouncementCreate, AnnouncementRead, AnnouncementUpdate

router = APIRouter(prefix="/api/announcements", tags=["announcements"])


@router.get("", response_model=list[AnnouncementRead])
def list_announcements(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    return [_serialize_announcement(i) for i in db.scalars(
        select(AnnouncementModel).order_by(AnnouncementModel.pinned.desc(), AnnouncementModel.date.desc())
    ).all()]


@router.post("", response_model=AnnouncementRead)
def create_announcement(payload: AnnouncementCreate, db: Session = Depends(get_db), user: UserModel = Depends(_require_editor)):
    item = AnnouncementModel(
        title=payload.title, category=payload.category, content=payload.content,
        author=user.display_name, date=_utc_now().date().isoformat(), pinned=payload.pinned,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_announcement(item)


@router.put("/{item_id}", response_model=AnnouncementRead)
def update_announcement(item_id: str, payload: AnnouncementUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, AnnouncementModel, item_id)
    item.title = payload.title
    item.category = payload.category
    item.content = payload.content
    item.pinned = payload.pinned
    db.commit()
    db.refresh(item)
    return _serialize_announcement(item)


@router.delete("/{item_id}", status_code=204)
def delete_announcement(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, AnnouncementModel, item_id)
    db.delete(item)
    db.commit()
