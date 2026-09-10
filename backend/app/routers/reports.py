"""Riport végpontok (előnézet + XLSX/DOCX/PDF export).

Ez a modul kizárólag HTTP-t fordít: összegyűjti a szűrőket, meghívja a
services.reporting réteget, és a kapott bájtokat letöltésbe csomagolja.
A riport tartalmának összeállítása ott él.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Callable

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..core.dependencies import DB, Reader
from ..services.reporting import (
    build_docx_report_bytes,
    build_excel_report_bytes,
    build_pdf_report_bytes,
    build_report_data,
)

router = APIRouter(prefix="/api/reports", tags=["reports"])


XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PDF_MEDIA_TYPE = "application/pdf"

# A dokumentum-építők egységes szerződése: (adat, sablon, fókusz) -> (bájtok, fájlnév).
DocumentBuilder = Callable[[dict[str, Any], str, str | None], tuple[bytes, str]]


@dataclass
class ReportQuery:
    """A négy végpont közös szűrői — egy helyen, hogy ne ismétlődjenek."""

    date_from: str | None = None
    date_to: str | None = None
    template: str = "overview"
    focus_type: str | None = None
    focus_id: str | None = None


Query = Annotated[ReportQuery, Depends()]


def _export(builder: DocumentBuilder, query: ReportQuery, db: Session, media_type: str) -> Response:
    data = build_report_data(db, query.date_from, query.date_to, query.template, query.focus_type, query.focus_id)
    payload, filename = builder(data, query.template, query.focus_type)
    return Response(
        content=payload,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/operations/preview")
def operations_report_preview(query: Query, db: DB, _: Reader):
    return build_report_data(db, query.date_from, query.date_to, query.template, query.focus_type, query.focus_id)


@router.get("/operations.xlsx")
def operations_excel_report(query: Query, db: DB, _: Reader) -> Response:
    return _export(build_excel_report_bytes, query, db, XLSX_MEDIA_TYPE)


@router.get("/operations.docx")
def operations_word_report(query: Query, db: DB, _: Reader) -> Response:
    return _export(build_docx_report_bytes, query, db, DOCX_MEDIA_TYPE)


@router.get("/operations.pdf")
def operations_pdf_report(query: Query, db: DB, _: Reader) -> Response:
    return _export(build_pdf_report_bytes, query, db, PDF_MEDIA_TYPE)
