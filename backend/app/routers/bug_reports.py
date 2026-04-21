from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import _get_current_user, _require_admin
from ..models import BugReportModel, UserModel
from ..schemas import BugReportCreate, BugReportRead, BugReportUpdate
from ..services.bug_reports import (
    create_bug_report as create_bug_report_service,
    get_bug_summary as get_bug_summary_service,
    list_bug_reports as list_bug_reports_service,
    update_bug_report as update_bug_report_service,
)

router = APIRouter(prefix="/api/bug-reports", tags=["bug-reports"])


@router.get("", response_model=list[BugReportRead])
def list_bug_reports(db: Session = Depends(get_db), _: UserModel = Depends(_require_admin)):
    return list_bug_reports_service(db)


@router.get("/summary")
def get_bug_summary(db: Session = Depends(get_db), _: UserModel = Depends(_require_admin)):
    return get_bug_summary_service(db)


@router.post("", response_model=BugReportRead)
def create_bug_report(payload: BugReportCreate, db: Session = Depends(get_db), current_user: UserModel = Depends(_get_current_user)):
    return create_bug_report_service(payload, db, current_user)


@router.patch("/{item_id}", response_model=BugReportRead)
def update_bug_report(item_id: str, payload: BugReportUpdate, db: Session = Depends(get_db), current_user: UserModel = Depends(_require_admin)):
    item = db.get(BugReportModel, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Hibabejelentés nem található")
    return update_bug_report_service(item, payload, db, current_user)
