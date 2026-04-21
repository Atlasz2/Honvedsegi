from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import _get_current_user
from ..models import UserModel
from ..services.reporting import (
    build_docx_report_bytes,
    build_excel_report_bytes,
    build_pdf_report_bytes,
    build_report_data,
)

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/operations/preview")
def operations_report_preview(
    date_from: str | None = None,
    date_to: str | None = None,
    template: str = "overview",
    focus_type: str | None = None,
    focus_id: str | None = None,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_get_current_user),
):
    return build_report_data(db, date_from, date_to, template, focus_type, focus_id)


@router.get("/operations.xlsx")
def operations_excel_report(
    date_from: str | None = None,
    date_to: str | None = None,
    template: str = "overview",
    focus_type: str | None = None,
    focus_id: str | None = None,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_get_current_user),
):
    data = build_report_data(db, date_from, date_to, template, focus_type, focus_id)
    payload, filename = build_excel_report_bytes(data, template, focus_type)
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/operations.docx")
def operations_word_report(
    date_from: str | None = None,
    date_to: str | None = None,
    template: str = "overview",
    focus_type: str | None = None,
    focus_id: str | None = None,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_get_current_user),
):
    data = build_report_data(db, date_from, date_to, template, focus_type, focus_id)
    payload, filename = build_docx_report_bytes(data, template, focus_type)
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/operations.pdf")
def operations_pdf_report(
    date_from: str | None = None,
    date_to: str | None = None,
    template: str = "overview",
    focus_type: str | None = None,
    focus_id: str | None = None,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_get_current_user),
):
    data = build_report_data(db, date_from, date_to, template, focus_type, focus_id)
    payload, filename = build_pdf_report_bytes(data, template, focus_type)
    return Response(
        content=payload,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
