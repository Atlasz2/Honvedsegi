from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..deps import _serialize_bug_report, _utc_now
from ..models import BugReportModel, UserModel
from ..schemas import BugReportCreate, BugReportUpdate


def list_bug_reports(db: Session):
    items = db.scalars(select(BugReportModel).order_by(BugReportModel.created_at.desc())).all()
    return [_serialize_bug_report(item) for item in items]


def get_bug_summary(db: Session) -> dict[str, int]:
    open_count = db.scalar(select(func.count()).select_from(BugReportModel).where(BugReportModel.status == "open")) or 0
    resolved_count = db.scalar(select(func.count()).select_from(BugReportModel).where(BugReportModel.status == "resolved")) or 0
    critical_open = db.scalar(select(func.count()).select_from(BugReportModel).where(BugReportModel.status == "open", BugReportModel.severity == "critical")) or 0
    return {"openCount": int(open_count), "resolvedCount": int(resolved_count), "criticalOpen": int(critical_open)}


def create_bug_report(payload: BugReportCreate, db: Session, current_user: UserModel):
    item = BugReportModel(
        title=payload.title.strip(),
        description=payload.description.strip(),
        page=(payload.page or "").strip(),
        severity=payload.severity,
        status="open",
        reported_by=current_user.username,
        reported_by_name=current_user.display_name,
        created_at=_utc_now(),
        screenshot_data=payload.screenshotData,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_bug_report(item)


def update_bug_report(item: BugReportModel, payload: BugReportUpdate, db: Session, current_user: UserModel):
    if payload.status is not None:
        item.status = payload.status
    if payload.severity is not None:
        item.severity = payload.severity

    if item.status == "resolved":
        item.resolved_at = _utc_now()
        item.resolved_by = current_user.username
    else:
        item.resolved_at = None
        item.resolved_by = None

    db.commit()
    db.refresh(item)
    return _serialize_bug_report(item)
