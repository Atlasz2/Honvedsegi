"""Import végpontok (CSV/XLSX/PDF/DOCX -> személyzet vagy gyakorlat).

Ez a modul kizárólag HTTP-t fordít: kicsomagolja a kérést, és átadja a
services.imports rétegnek. Az üzleti logika (értelmezés, draft-kezelés,
alkalmazás) ott él — lásd a modul docstringjét.
"""
from __future__ import annotations


from fastapi import APIRouter, File, Response, UploadFile

from ..audit import record_activity
from ..core.scope import scope_units
from ..core.dependencies import DB, Editor
from ..constants import region_label
from ..import_export import build_dry_run_pdf
from ..schemas import ImportConfirmResult, ImportDraftUpdateRequest, ImportPreviewResult
from ..services.basic_training_import import confirm_basic_training, preview_basic_training
from ..services.imports import (
    confirm_import_draft,
    preview_import_data,
    update_import_draft_data,
)

router = APIRouter(prefix="/api/import", tags=["import"])



# ── Alapkiképzés-tábla (név/SZTSZ + modulonként egy oszlop) — a generikus
# /{entity}/… útvonalak ELŐTT kell állnia, különben azok nyelik el.

@router.post("/basic-training/preview")
def preview_basic_training_table(db: DB, _: Editor, file: UploadFile = File(...)):
    return preview_basic_training(file.filename or "", file.file.read(), db)


@router.post("/basic-training/confirm/{draft_id}")
def confirm_basic_training_table(draft_id: str, db: DB, user: Editor, create_missing_modules: bool = True):
    result = confirm_basic_training(draft_id, create_missing_modules, db)
    record_activity(db, user, mode="create", module="Import", record_name="Alapkiképzés-tábla", entity="import_basic_training", after=result)
    db.commit()
    return result


@router.post("/{entity}/preview", response_model=ImportPreviewResult)
def preview_import(entity: str, db: DB, user: Editor, file: UploadFile = File(...)) -> ImportPreviewResult:
    return preview_import_data(entity, file.filename or "", file.file.read(), db, scope_units(user))


@router.put("/{entity}/draft/{draft_id}", response_model=ImportPreviewResult)
def update_import_draft(
    entity: str, draft_id: str, payload: ImportDraftUpdateRequest, db: DB, user: Editor,
) -> ImportPreviewResult:
    return update_import_draft_data(entity, draft_id, payload, db, scope_units(user))


@router.get("/{entity}/draft/{draft_id}/export.pdf")
def export_import_dry_run(entity: str, draft_id: str, db: DB, user: Editor, filename: str = ""):
    """Próbaüzem-PDF: a változáslista elfogadás előtt, aláírható. A draft nem
    változik (üres frissítéssel értékeljük újra, hogy a jelenlegi állapotot adja)."""
    preview = update_import_draft_data(entity, draft_id, ImportDraftUpdateRequest(items=[]), db, scope_units(user))
    scope = region_label(user.region or "") if (user.region and user.role not in ("admin", "fejleszto")) else "Ezredtörzs — minden zászlóalj"
    content = build_dry_run_pdf(preview, filename=filename or entity, user_name=user.display_name, scope_label=scope)
    record_activity(db, user, mode="create", module="Import", record_name=f"próbaüzem-PDF ({entity})", entity=f"import_draft:{draft_id}",
                    after={"new": preview.diff.new, "changed": preview.diff.changed, "discharged": preview.diff.discharged})
    db.commit()
    return Response(content=content, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=import-probauzem-{draft_id[:8]}.pdf"})


@router.post("/{entity}/confirm/{draft_id}", response_model=ImportConfirmResult)
def confirm_import(entity: str, draft_id: str, db: DB, user: Editor) -> ImportConfirmResult:
    """Elfogadás előtt automatikus, ellenőrzött mentés: egy hibás tömeges import
    visszaállítható. Ha a mentés nem sikerül, az import nem fut le."""
    from fastapi import HTTPException

    from ..backup import create_backup

    backup = create_backup()
    if not backup["ok"]:
        raise HTTPException(status_code=503, detail="Az import előtti automatikus mentés nem sikerült — az import nem indult el. Szólj a rendszergazdának.")
    record_activity(db, user, mode="create", module="Mentés", record_name=f"automatikus mentés import előtt ({backup['file']})",
                    entity="backup", after={"file": backup["file"], "sizeBytes": backup["sizeBytes"]})
    db.commit()
    return confirm_import_draft(entity, draft_id, db, user)
