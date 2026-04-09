from __future__ import annotations
from datetime import timedelta
from typing import Any
from uuid import uuid4
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..constants import IMPORT_DRAFT_TTL_MINUTES
from ..db import get_db
from ..deps import (
    _apply_exercise, _apply_person, _get_current_user, _normalize_sztsz,
    _require_editor, _utc_now,
)
from ..importers import ENTITY_CONFIG, ImportRow, parse_import
from ..models import ExerciseModel, PersonModel, UserModel
from ..schemas import ExerciseCreate, ImportConfirmResult, ImportDraftUpdateRequest, ImportPreviewResult, PersonCreate

router = APIRouter(prefix="/api/import", tags=["import"])

IMPORT_DRAFTS: dict[str, dict[str, Any]] = {}


# ── Draft helpers ─────────────────────────────────────────────────────────

def _save_draft(draft_id: str, entity: str, rows, operations, created, updated, skipped) -> str:
    IMPORT_DRAFTS[draft_id] = {
        "entity": entity, "rows": rows, "operations": operations,
        "created": created, "updated": updated, "skipped": skipped,
        "expires_at": _utc_now() + timedelta(minutes=IMPORT_DRAFT_TTL_MINUTES),
    }
    return draft_id


def _store_draft(entity, rows, operations, created, updated, skipped) -> str:
    return _save_draft(uuid4().hex, entity, rows, operations, created, updated, skipped)


def _get_draft(entity: str, draft_id: str) -> dict[str, Any]:
    draft = IMPORT_DRAFTS.get(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Import draft nem talalhato")
    if draft["entity"] != entity:
        raise HTTPException(status_code=400, detail="A draft mas entitashoz tartozik")
    if draft["expires_at"] < _utc_now():
        IMPORT_DRAFTS.pop(draft_id, None)
        raise HTTPException(status_code=410, detail="Import draft lejart")
    return draft


def _pop_draft(entity: str, draft_id: str) -> dict[str, Any]:
    _get_draft(entity, draft_id)
    return IMPORT_DRAFTS.pop(draft_id)


def _normalize_mapping(data: dict[str, Any] | None) -> dict[str, str]:
    if not data:
        return {}
    return {str(k).strip(): ("" if v is None else str(v).strip()) for k, v in data.items() if str(k).strip()}


def _serialize_row(row: ImportRow | dict) -> dict[str, Any]:
    if isinstance(row, ImportRow):
        return {
            "line": row.source_line, "enabled": row.enabled,
            "data": _normalize_mapping(row.data), "rawData": _normalize_mapping(row.raw_data),
            "unknownData": _normalize_mapping(row.unknown_data),
        }
    return {
        "line": int(row.get("line", 0)), "enabled": bool(row.get("enabled", True)),
        "data": _normalize_mapping(row.get("data")),
        "rawData": _normalize_mapping(row.get("rawData") or row.get("raw_data")),
        "unknownData": _normalize_mapping(row.get("unknownData") or row.get("unknown_data")),
    }


def _ordered_missing(entity: str, data: dict) -> list[str]:
    required = ENTITY_CONFIG[entity]["required"]
    column_order = ENTITY_CONFIG[entity]["column_order"]
    missing = [f for f in column_order if f in required and not data.get(f)]
    for f in required:
        if f not in missing and not data.get(f):
            missing.append(f)
    return missing


def _extract_messages(exc: Exception) -> list[str]:
    if hasattr(exc, "errors"):
        msgs: list[str] = []
        for e in exc.errors():
            loc = ".".join(str(p) for p in e.get("loc", []) if p is not None)
            label = loc or "sor"
            t = str(e.get("type") or "")
            if t == "missing":
                msgs.append(f"Hianyzik a kotelezo mezo: {label}")
            elif t == "literal_error":
                expected = str(e.get("ctx", {}).get("expected") or "")
                val = e.get("input")
                msgs.append(f"{label}: ervenytelen ertek ({val}). Engedelyezett: {expected}" if expected else f"{label}: ervenytelen ertek ({val})")
            else:
                msgs.append(f"{label}: {e.get('msg') or 'Ervenytelen ertek'}")
        seen: set[str] = set()
        return [m for m in msgs if not (m in seen or seen.add(m))]
    text = str(exc).strip()
    return [text] if text else ["Ervenytelen sor"]


def _fallback_identity(entity: str, line: int, data: dict, raw: dict) -> tuple[str, str]:
    if entity == "personnel":
        key = data.get("sztsz") or raw.get("sztsz") or raw.get("azonosito") or f"sor-{line}"
        name = data.get("name") or raw.get("nev") or raw.get("name") or "-"
        return key, name
    key = data.get("name") or raw.get("nev") or raw.get("name") or f"sor-{line}"
    return key, key


def _evaluate_rows(entity: str, source_rows: list, db: Session) -> dict[str, Any]:
    created = updated = skipped = 0
    issues: list[dict] = []
    items: list[dict] = []
    operations: list[dict] = []
    rows: list[dict] = []

    for source in source_rows:
        row = _serialize_row(source)
        rows.append(row)
        line, enabled = row["line"], row["enabled"]
        data, raw_data = row["data"], row["rawData"]
        prev_data = {k: v for k, v in data.items() if v is not None and str(v).strip()}
        prev_raw = {k: v for k, v in raw_data.items() if v is not None and str(v).strip()}
        prev_unk = {k: v for k, v in row["unknownData"].items() if v is not None and str(v).strip()}
        key, name = _fallback_identity(entity, line, prev_data, prev_raw)
        item_issues: list[str] = []
        action = "skip"

        if not enabled:
            item_issues.append("Felhasznalo altal kihagyva")
        else:
            missing = _ordered_missing(entity, prev_data)
            if missing:
                item_issues.append(f"Hianyzik: {', '.join(missing)}")
            else:
                try:
                    if entity == "personnel":
                        payload = PersonCreate(**prev_data)
                        payload.sztsz = _normalize_sztsz(payload.sztsz)
                        existing = db.scalar(select(PersonModel).where(PersonModel.sztsz == payload.sztsz))
                        action = "update" if existing else "create"
                        key = payload.sztsz; name = payload.name
                    else:
                        payload = ExerciseCreate(**prev_data)
                        existing = db.scalar(select(ExerciseModel).where(
                            ExerciseModel.name == payload.name,
                            ExerciseModel.start_date == payload.startDate,
                            ExerciseModel.type == payload.type,
                        ))
                        action = "update" if existing else "create"
                        key = f"{payload.name}::{payload.startDate}::{payload.type}"; name = payload.name

                    if action == "create":
                        created += 1
                    else:
                        updated += 1
                    operations.append({"entity": entity, "action": action, "payload": payload.model_dump()})
                except Exception as exc:
                    item_issues.extend(_extract_messages(exc))

        if item_issues or not enabled:
            skipped += 1; action = "skip"
            for msg in item_issues:
                issues.append({"line": line, "message": msg})

        items.append({
            "line": line, "action": action, "key": key, "name": name,
            "enabled": enabled, "data": prev_data, "rawData": prev_raw,
            "unknownData": prev_unk, "issues": item_issues,
        })

    if not rows:
        issues.append({"line": 0, "message": "Nem sikerult ertelmezheto sort kiolvasni a fajlbol."})

    return {
        "entity": entity, "totalRows": len(rows), "created": created,
        "updated": updated, "skipped": skipped, "issues": issues,
        "items": items, "operations": operations, "rows": rows,
    }


def _preview_response(payload: dict, draft_id: str) -> ImportPreviewResult:
    return ImportPreviewResult(
        draftId=draft_id, entity=payload["entity"], totalRows=payload["totalRows"],
        created=payload["created"], updated=payload["updated"], skipped=payload["skipped"],
        issues=payload["issues"], items=payload["items"],
    )


# ── Routes ────────────────────────────────────────────────────────────────

@router.post("/{entity}/preview", response_model=ImportPreviewResult)
def preview_import(
    entity: str, file: UploadFile = File(...),
    db: Session = Depends(get_db), _: UserModel = Depends(_require_editor),
) -> ImportPreviewResult:
    if entity not in {"personnel", "exercises"}:
        raise HTTPException(status_code=400, detail="Nem tamogatott import cel")
    filename = file.filename or ""
    content = file.file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Ures fajl")
    try:
        source_rows = parse_import(entity, filename, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    preview = _evaluate_rows(entity, source_rows, db)
    valid = preview["created"] + preview["updated"]
    if source_rows and valid == 0:
        alt = "exercises" if entity == "personnel" else "personnel"
        try:
            alt_rows = parse_import(alt, filename, content)
            alt_preview = _evaluate_rows(alt, alt_rows, db)
            if alt_preview["created"] + alt_preview["updated"] > 0:
                alt_preview["issues"].insert(0, {"line": 0, "message": "Automatikus atvaltas a masik import celra."})
                preview = alt_preview; entity = alt
        except Exception:
            pass

    draft_id = _store_draft(entity, preview["rows"], preview["operations"],
                             preview["created"], preview["updated"], preview["skipped"])
    return _preview_response(preview, draft_id)


@router.put("/{entity}/draft/{draft_id}", response_model=ImportPreviewResult)
def update_import_draft(
    entity: str, draft_id: str, payload: ImportDraftUpdateRequest,
    db: Session = Depends(get_db), _: UserModel = Depends(_require_editor),
) -> ImportPreviewResult:
    if entity not in {"personnel", "exercises"}:
        raise HTTPException(status_code=400, detail="Nem tamogatott import cel")
    draft = _get_draft(entity, draft_id)
    updates = {item.line: item for item in payload.items}
    source_rows: list[dict] = []
    for row in draft.get("rows", []):
        updated_row = dict(row)
        upd = updates.get(int(updated_row.get("line", 0)))
        if upd is not None:
            updated_row["enabled"] = upd.enabled
            updated_row["data"] = _normalize_mapping(upd.data)
        source_rows.append(updated_row)
    preview = _evaluate_rows(entity, source_rows, db)
    _save_draft(draft_id, entity, preview["rows"], preview["operations"],
                preview["created"], preview["updated"], preview["skipped"])
    return _preview_response(preview, draft_id)


@router.post("/{entity}/confirm/{draft_id}", response_model=ImportConfirmResult)
def confirm_import(
    entity: str, draft_id: str,
    db: Session = Depends(get_db), _: UserModel = Depends(_require_editor),
) -> ImportConfirmResult:
    if entity not in {"personnel", "exercises"}:
        raise HTTPException(status_code=400, detail="Nem tamogatott import cel")
    draft = _pop_draft(entity, draft_id)
    for op in draft["operations"]:
        p = op["payload"]
        if entity == "personnel":
            dto = PersonCreate(**p)
            dto.sztsz = _normalize_sztsz(dto.sztsz)
            existing = db.scalar(select(PersonModel).where(PersonModel.sztsz == dto.sztsz))
            if existing:
                _apply_person(existing, dto)
            else:
                item = PersonModel()
                _apply_person(item, dto)
                db.add(item)
        else:
            dto = ExerciseCreate(**p)
            existing = db.scalar(select(ExerciseModel).where(
                ExerciseModel.name == dto.name,
                ExerciseModel.start_date == dto.startDate,
                ExerciseModel.type == dto.type,
            ))
            if existing:
                _apply_exercise(existing, dto)
            else:
                item = ExerciseModel()
                _apply_exercise(item, dto)
                db.add(item)
    db.commit()
    return ImportConfirmResult(
        draftId=draft_id, entity=entity, applied=True,
        created=draft["created"], updated=draft["updated"], skipped=draft["skipped"],
    )
