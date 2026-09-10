"""Import végpontok (CSV/XLSX/PDF/DOCX -> személyzet vagy gyakorlat).

Ez a modul kizárólag HTTP-t fordít: kicsomagolja a kérést, és átadja a
services.imports rétegnek. Az üzleti logika (értelmezés, draft-kezelés,
alkalmazás) ott él — lásd a modul docstringjét.
"""
from __future__ import annotations


from fastapi import APIRouter, File, UploadFile

from ..core.dependencies import DB, Editor
from ..schemas import ImportConfirmResult, ImportDraftUpdateRequest, ImportPreviewResult
from ..services.imports import (
    confirm_import_draft,
    preview_import_data,
    update_import_draft_data,
)

router = APIRouter(prefix="/api/import", tags=["import"])



@router.post("/{entity}/preview", response_model=ImportPreviewResult)
def preview_import(entity: str, db: DB, _: Editor, file: UploadFile = File(...)) -> ImportPreviewResult:
    return preview_import_data(entity, file.filename or "", file.file.read(), db)


@router.put("/{entity}/draft/{draft_id}", response_model=ImportPreviewResult)
def update_import_draft(
    entity: str, draft_id: str, payload: ImportDraftUpdateRequest, db: DB, _: Editor,
) -> ImportPreviewResult:
    return update_import_draft_data(entity, draft_id, payload, db)


@router.post("/{entity}/confirm/{draft_id}", response_model=ImportConfirmResult)
def confirm_import(entity: str, draft_id: str, db: DB, user: Editor) -> ImportConfirmResult:
    return confirm_import_draft(entity, draft_id, db, user)
