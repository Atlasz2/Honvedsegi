from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import _require_editor
from ..models import UserModel
from ..schemas import ImportConfirmResult, ImportDraftUpdateRequest, ImportPreviewResult
from ..services.imports import confirm_import_draft, preview_import_data, update_import_draft_data

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/{entity}/preview", response_model=ImportPreviewResult)
def preview_import(
    entity: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: UserModel = Depends(_require_editor),
) -> ImportPreviewResult:
    filename = file.filename or ""
    content = file.file.read()
    return preview_import_data(entity, filename, content, db)


@router.put("/{entity}/draft/{draft_id}", response_model=ImportPreviewResult)
def update_import_draft(
    entity: str,
    draft_id: str,
    payload: ImportDraftUpdateRequest,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_require_editor),
) -> ImportPreviewResult:
    return update_import_draft_data(entity, draft_id, payload, db)


@router.post("/{entity}/confirm/{draft_id}", response_model=ImportConfirmResult)
def confirm_import(
    entity: str,
    draft_id: str,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_require_editor),
) -> ImportConfirmResult:
    return confirm_import_draft(entity, draft_id, db)
