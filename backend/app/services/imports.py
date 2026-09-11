from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..constants import IMPORT_DRAFT_TTL_MINUTES, IMPORT_MISSING_LIST_LIMIT
from ..appliers import apply_exercise, apply_person
from ..audit import record_activity
from ..core.time import utc_now
from ..validation import normalize_sztsz
from ..importers import ENTITY_CONFIG, ImportRow, parse_import
from ..models import ExerciseModel, PersonModel, UserModel
from ..schemas import ExerciseCreate, ImportConfirmResult, ImportDraftUpdateRequest, ImportPreviewResult, PersonCreate

IMPORT_DRAFTS: dict[str, dict[str, Any]] = {}
SUPPORTED_IMPORT_ENTITIES = {"personnel", "exercises"}
ENTITY_LABELS = {"personnel": "Személyzet", "exercises": "Gyakorlatok"}


def _save_draft(draft_id: str, entity: str, rows, operations, created, updated, skipped) -> str:
    IMPORT_DRAFTS[draft_id] = {
        "entity": entity,
        "rows": rows,
        "operations": operations,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "expires_at": utc_now() + timedelta(minutes=IMPORT_DRAFT_TTL_MINUTES),
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
    if draft["expires_at"] < utc_now():
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


def serialize_row(row: ImportRow | dict) -> dict[str, Any]:
    if isinstance(row, ImportRow):
        return {
            "line": row.source_line,
            "enabled": row.enabled,
            "data": _normalize_mapping(row.data),
            "rawData": _normalize_mapping(row.raw_data),
            "unknownData": _normalize_mapping(row.unknown_data),
        }
    return {
        "line": int(row.get("line", 0)),
        "enabled": bool(row.get("enabled", True)),
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
                msgs.append(f"Hiányzik a kötelező mező: {label}")
            elif t == "literal_error":
                expected = str(e.get("ctx", {}).get("expected") or "")
                val = e.get("input")
                msgs.append(
                    f"{label}: érvénytelen érték ({val}). Engedélyezett: {expected}"
                    if expected
                    else f"{label}: érvénytelen érték ({val})"
                )
            else:
                msgs.append(f"{label}: {e.get('msg') or 'Ervenytelen ertek'}")
        seen: set[str] = set()
        return [m for m in msgs if not (m in seen or seen.add(m))]
    text = str(exc).strip()
    return [text] if text else ["Érvénytelen sor"]


def _fallback_identity(entity: str, line: int, data: dict, raw: dict) -> tuple[str, str]:
    if entity == "personnel":
        key = data.get("sztsz") or raw.get("sztsz") or raw.get("azonosito") or f"sor-{line}"
        name = data.get("name") or raw.get("nev") or raw.get("name") or "-"
        return key, name
    key = data.get("name") or raw.get("nev") or raw.get("name") or f"sor-{line}"
    return key, key


def _collect_unknown_columns(rows: list[dict[str, Any]]) -> list[str]:
    """A fel nem ismert fejlécek, első előfordulás sorrendjében."""
    seen: dict[str, None] = {}
    for row in rows:
        for header in row["unknownData"]:
            seen.setdefault(header, None)
    return list(seen)


def _find_missing_personnel(db: Session, operations: list[dict[str, Any]]) -> tuple[int, list[dict[str, str]]]:
    """Akik a nyilvántartásban vannak, de az érvényes sorok között nem szerepelnek.

    A leszerelteket nem számoljuk: ők jogosan hiányoznak egy aktuális exportból."""
    present = {op["payload"]["sztsz"] for op in operations if op["entity"] == "personnel"}
    stmt = (
        select(PersonModel.id, PersonModel.name, PersonModel.sztsz, PersonModel.unit, PersonModel.status)
        .where(PersonModel.status != "Leszerelt")
        .order_by(PersonModel.name)
    )
    missing = [
        {"id": pid, "name": name, "sztsz": sztsz, "unit": unit, "status": status}
        for pid, name, sztsz, unit, status in db.execute(stmt)
        if sztsz not in present
    ]
    return len(missing), missing[:IMPORT_MISSING_LIST_LIMIT]


def _evaluate_rows(entity: str, source_rows: list, db: Session) -> dict[str, Any]:
    created = updated = skipped = 0
    issues: list[dict[str, Any]] = []
    items: list[dict[str, Any]] = []
    operations: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []

    for source in source_rows:
        row = serialize_row(source)
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
            item_issues.append("Felhasználó által kihagyva")
        else:
            missing = _ordered_missing(entity, prev_data)
            if missing:
                item_issues.append(f"Hiányzik: {', '.join(missing)}")
            else:
                try:
                    if entity == "personnel":
                        payload = PersonCreate(**prev_data)
                        payload.sztsz = normalize_sztsz(payload.sztsz)
                        existing = db.scalar(select(PersonModel).where(PersonModel.sztsz == payload.sztsz))
                        action = "update" if existing else "create"
                        key = payload.sztsz
                        name = payload.name
                    else:
                        payload = ExerciseCreate(**prev_data)
                        existing = db.scalar(
                            select(ExerciseModel).where(
                                ExerciseModel.name == payload.name,
                                ExerciseModel.start_date == payload.startDate,
                                ExerciseModel.type == payload.type,
                            )
                        )
                        action = "update" if existing else "create"
                        key = f"{payload.name}::{payload.startDate}::{payload.type}"
                        name = payload.name

                    if action == "create":
                        created += 1
                    else:
                        updated += 1
                    operations.append({"entity": entity, "action": action, "payload": payload.model_dump()})
                except Exception as exc:
                    item_issues.extend(_extract_messages(exc))

        if item_issues or not enabled:
            skipped += 1
            action = "skip"
            for msg in item_issues:
                issues.append({"line": line, "message": msg})

        items.append(
            {
                "line": line,
                "action": action,
                "key": key,
                "name": name,
                "enabled": enabled,
                "data": prev_data,
                "rawData": prev_raw,
                "unknownData": prev_unk,
                "issues": item_issues,
            }
        )

    if not rows:
        issues.append({"line": 0, "message": "Nem sikerült értelmezhető sort kiolvasni a fájlból."})

    unknown_columns = _collect_unknown_columns(rows)
    if unknown_columns:
        issues.append({
            "line": 0,
            "message": "Nem felismert oszlop(ok), az adatuk kimarad: " + ", ".join(unknown_columns),
        })

    missing_count, missing = (0, [])
    if entity == "personnel" and operations:
        missing_count, missing = _find_missing_personnel(db, operations)

    return {
        "entity": entity,
        "totalRows": len(rows),
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "issues": issues,
        "items": items,
        "operations": operations,
        "rows": rows,
        "unknownColumns": unknown_columns,
        "missingCount": missing_count,
        "missing": missing,
    }


def _preview_response(payload: dict[str, Any], draft_id: str) -> ImportPreviewResult:
    return ImportPreviewResult(
        draftId=draft_id,
        entity=payload["entity"],
        totalRows=payload["totalRows"],
        created=payload["created"],
        updated=payload["updated"],
        skipped=payload["skipped"],
        issues=payload["issues"],
        items=payload["items"],
        unknownColumns=payload["unknownColumns"],
        missingCount=payload["missingCount"],
        missing=payload["missing"],
    )


def preview_import_data(entity: str, filename: str, content: bytes, db: Session) -> ImportPreviewResult:
    if entity not in SUPPORTED_IMPORT_ENTITIES:
        raise HTTPException(status_code=400, detail="Nem támogatott import cél")
    if not content:
        raise HTTPException(status_code=400, detail="Üres fájl")

    try:
        source_rows = parse_import(entity, filename or "", content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    preview = _evaluate_rows(entity, source_rows, db)
    valid = preview["created"] + preview["updated"]
    if source_rows and valid == 0:
        alt = "exercises" if entity == "personnel" else "personnel"
        try:
            alt_rows = parse_import(alt, filename or "", content)
            alt_preview = _evaluate_rows(alt, alt_rows, db)
            if alt_preview["created"] + alt_preview["updated"] > 0:
                alt_preview["issues"].insert(0, {"line": 0, "message": "Automatikus átváltás a másik import célra."})
                preview = alt_preview
                entity = alt
        except Exception:
            pass

    draft_id = _store_draft(
        entity,
        preview["rows"],
        preview["operations"],
        preview["created"],
        preview["updated"],
        preview["skipped"],
    )
    return _preview_response(preview, draft_id)


def update_import_draft_data(entity: str, draft_id: str, payload: ImportDraftUpdateRequest, db: Session) -> ImportPreviewResult:
    if entity not in SUPPORTED_IMPORT_ENTITIES:
        raise HTTPException(status_code=400, detail="Nem támogatott import cél")

    draft = _get_draft(entity, draft_id)
    updates = {item.line: item for item in payload.items}
    source_rows: list[dict[str, Any]] = []

    for row in draft.get("rows", []):
        updated_row = dict(row)
        upd = updates.get(int(updated_row.get("line", 0)))
        if upd is not None:
            updated_row["enabled"] = upd.enabled
            updated_row["data"] = _normalize_mapping(upd.data)
        source_rows.append(updated_row)

    preview = _evaluate_rows(entity, source_rows, db)
    _save_draft(
        draft_id,
        entity,
        preview["rows"],
        preview["operations"],
        preview["created"],
        preview["updated"],
        preview["skipped"],
    )
    return _preview_response(preview, draft_id)


def confirm_import_draft(entity: str, draft_id: str, db: Session, current_user: UserModel) -> ImportConfirmResult:
    if entity not in SUPPORTED_IMPORT_ENTITIES:
        raise HTTPException(status_code=400, detail="Nem támogatott import cél")

    draft = _pop_draft(entity, draft_id)
    for op in draft["operations"]:
        p = op["payload"]
        if entity == "personnel":
            dto = PersonCreate(**p)
            dto.sztsz = normalize_sztsz(dto.sztsz)
            existing = db.scalar(select(PersonModel).where(PersonModel.sztsz == dto.sztsz))
            if existing:
                apply_person(existing, dto)
            else:
                item = PersonModel()
                apply_person(item, dto)
                db.add(item)
        else:
            dto = ExerciseCreate(**p)
            existing = db.scalar(
                select(ExerciseModel).where(
                    ExerciseModel.name == dto.name,
                    ExerciseModel.start_date == dto.startDate,
                    ExerciseModel.type == dto.type,
                )
            )
            if existing:
                apply_exercise(existing, dto)
            else:
                item = ExerciseModel()
                apply_exercise(item, dto)
                db.add(item)

    # Összesítő bejegyzés, nem soronkénti: egy import több száz rekordot érinthet,
    # és a napló csak akkor használható, ha nem fullad zajba. A tételes tartalom
    # a preview-ban látszik, a hatás itt.
    record_activity(
        db, current_user,
        mode="create",
        module="Import",
        record_name=ENTITY_LABELS.get(entity, entity),
        entity=f"import_{entity}",
        after={
            "entity": entity,
            "created": draft["created"],
            "updated": draft["updated"],
            "skipped": draft["skipped"],
        },
    )
    db.commit()
    return ImportConfirmResult(
        draftId=draft_id,
        entity=entity,
        applied=True,
        created=draft["created"],
        updated=draft["updated"],
        skipped=draft["skipped"],
    )
