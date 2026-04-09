from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..db import get_db
from ..deps import _get_current_user, _serialize_log
from ..models import ActivityLogModel, UserModel
from ..schemas import ActivityLogCreate, ActivityLogRead

router = APIRouter(prefix="/api/activity-log", tags=["activity-log"])


@router.get("", response_model=list[ActivityLogRead])
def list_activity_logs(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    return [_serialize_log(i) for i in db.scalars(select(ActivityLogModel).order_by(ActivityLogModel.timestamp.desc())).all()]


@router.post("", response_model=ActivityLogRead)
def create_activity_log(payload: ActivityLogCreate, db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    item = ActivityLogModel(
        user_id=payload.userId, user_name=payload.userName,
        action=payload.action, module=payload.module, record_name=payload.recordName,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_log(item)
