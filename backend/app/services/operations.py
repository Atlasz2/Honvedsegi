from __future__ import annotations

import mimetypes
import secrets
from urllib.parse import quote
from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..appliers import apply_event
from ..constants import DUTY_EXERCISE_TYPES
from ..core.time import parse_iso_date, utc_now
from ..participants import load_participants_by_event
from ..serializers import serialize_event, serialize_exercise, serialize_training
from ..models import (
    EventModel,
    ExerciseModel,
    MaterialRequirementModel,
    OperationAttendanceModel,
    OperationDocumentModel,
    TrainingModel,
    UserModel,
)
from ..schemas import (
    AttendanceBatchUpdateRequest,
    AttendanceEntryRead,
    AttendanceEntryUpdate,
    EventCreate,
    EventRead,
    EventUpdate,
    MaterialRequirementBase,
    MaterialRequirementRead,
    MaterialRequirementUpdate,
    OperationDocumentRead,
    OperationRead,
    OperationTreeNode,
)
from .lifecycle import sync_temporal_statuses

UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads" / "operations"
MAX_UPLOAD_SIZE = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".xlsx", ".xls", ".docx", ".doc", ".txt"}
ALLOWED_ATTENDANCE = {"Present", "Excused", "Absent", "Pending"}
ALLOWED_REQUIREMENT = {"Requested", "Approved", "Fulfilled"}
INLINE_MEDIA_TYPES = {"application/pdf"}
_UPLOAD_CHUNK_SIZE = 1 << 20  # 1 MB


def _content_disposition_filename(original_name: str) -> str:
    """RFC 5987 szerinti, escapelt fájlnév.

    A nyers interpoláció fejléc-injektálásra adna módot egy idézőjelet vagy
    sortörést tartalmazó fájlnévvel."""
    return f"filename*=UTF-8''{quote(original_name)}"


def _build_shadow_event(operation_id: str, source: ExerciseModel | TrainingModel, source_kind: str) -> EventModel:
    organizer = "" if source_kind == "exercise" else (source.organizer or "")
    return EventModel(
        id=operation_id,
        event_type="esemeny",
        name=source.name,
        type=source.type,
        start_date=source.start_date,
        end_date=source.end_date,
        location=source.location,
        organizer=organizer,
        max_personnel=source.max_personnel,
        description=source.description,
        status=source.status,
        assigned=source.assigned,
        parent_id=None,
    )


def require_event(db: Session, operation_id: str) -> EventModel:
    item = db.get(EventModel, operation_id)
    if item:
        return item

    shadow: EventModel | None = None
    exercise = db.get(ExerciseModel, operation_id)
    if exercise:
        shadow = _build_shadow_event(operation_id, exercise, "exercise")

    if shadow is None:
        training = db.get(TrainingModel, operation_id)
        if training:
            shadow = _build_shadow_event(operation_id, training, "training")

    if shadow is None:
        raise HTTPException(status_code=404, detail="A művelet nem található")

    db.add(shadow)
    try:
        db.commit()
        db.refresh(shadow)
        return shadow
    except IntegrityError:
        db.rollback()
        existing = db.get(EventModel, operation_id)
        if existing:
            return existing
        raise


def _event_to_tree_node(item: EventModel) -> OperationTreeNode:
    return OperationTreeNode(
        id=item.id,
        eventType="esemeny",
        parentId=item.parent_id,
        name=item.name,
        type=item.type,
        startDate=item.start_date,
        endDate=item.end_date,
        location=item.location,
        organizer=item.organizer or "",
        maxPersonnel=item.max_personnel,
        description=item.description,
        status=item.status,
        assigned=item.assigned or [],
        children=[],
    )


def _attendance_to_read(item: OperationAttendanceModel) -> AttendanceEntryRead:
    updated_at = item.updated_at.isoformat() if item.updated_at else utc_now().isoformat()
    return AttendanceEntryRead(
        personId=item.person_id,
        personName=item.person_name,
        status=item.status,
        note=item.note or "",
        updatedAt=updated_at,
        updatedBy=item.updated_by or "",
    )


def _requirement_to_read(item: MaterialRequirementModel) -> MaterialRequirementRead:
    return MaterialRequirementRead(
        id=item.id,
        operationId=item.operation_id,
        itemName=item.item_name,
        quantity=item.quantity,
        unit=item.unit or "",
        note=item.note or "",
        status=item.status,
    )


def _document_to_read(item: OperationDocumentModel) -> OperationDocumentRead:
    uploaded_at = item.uploaded_at.isoformat() if item.uploaded_at else utc_now().isoformat()
    return OperationDocumentRead(
        id=item.id,
        operationId=item.operation_id,
        filename=item.filename,
        originalName=item.original_name,
        mimeType=item.mime_type,
        fileSize=item.file_size,
        uploadedBy=item.uploaded_by or "",
        uploadedAt=uploaded_at,
        title=item.title or "",
    )


def _validate_attendance_status(value: str) -> str:
    status = (value or "").strip()
    if status not in ALLOWED_ATTENDANCE:
        raise HTTPException(status_code=400, detail="Érvénytelen jelenléti státusz")
    return status


def _validate_requirement_status(value: str) -> str:
    status = (value or "").strip()
    if status not in ALLOWED_REQUIREMENT:
        raise HTTPException(status_code=400, detail="Érvénytelen anyagigény státusz")
    return status


def _safe_document_name(original_name: str) -> str:
    ext = Path(original_name or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Nem támogatott fájlformátum")
    token = secrets.token_hex(12)
    return f"{token}{ext}"


async def _read_within_limit(file: UploadFile) -> bytes:
    """Chunkonként olvas, és a limit átlépésekor azonnal megszakít.

    A teljes fájl memóriába olvasása a méret ellenőrzése előtt azt jelentené,
    hogy egy 2 GB-os feltöltés is bekerül a memóriába, mielőtt elutasítjuk."""
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(_UPLOAD_CHUNK_SIZE):
        total += len(chunk)
        if total > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="A fájl túl nagy (max 20 MB)")
        chunks.append(chunk)
    if not total:
        raise HTTPException(status_code=400, detail="Üres fájl")
    return b"".join(chunks)


def _operation_upload_dir(operation_id: str) -> Path:
    target = UPLOAD_ROOT / operation_id
    target.mkdir(parents=True, exist_ok=True)
    return target


def list_operations_data(db: Session) -> list[OperationRead]:
    """Gyakorlatok és kiképzések egy listában, művelet-nézethez.

    A beosztás a participants táblából jön (a migráció óta az az igazságforrás,
    nem a régi JSON-oszlop), eseménytípusonként EGY lekérdezéssel — így a lista
    nem indít résztvevő-lekérdezést elemenként."""
    sync_temporal_statuses(db)

    exercises = db.scalars(select(ExerciseModel).order_by(ExerciseModel.start_date)).all()
    trainings = db.scalars(select(TrainingModel).order_by(TrainingModel.start_date)).all()
    participants_by_exercise = load_participants_by_event(db, "exercise")
    participants_by_training = load_participants_by_event(db, "training")

    ops: list[OperationRead] = []
    for ex in exercises:
        serialized = serialize_exercise(db, ex, participants_by_exercise.get(ex.id, []))
        ops.append(OperationRead(
            id=ex.id, name=ex.name, type=ex.type, operationType="exercise",
            startDate=ex.start_date, endDate=ex.end_date, location=ex.location,
            organizer=None, maxPersonnel=ex.max_personnel, description=ex.description,
            status=ex.status, assigned=[a.model_dump() for a in serialized.assigned],
        ))
    for tr in trainings:
        serialized = serialize_training(db, tr, participants_by_training.get(tr.id, []))
        ops.append(OperationRead(
            id=tr.id, name=tr.name, type=tr.type, operationType="training",
            startDate=tr.start_date, endDate=tr.end_date, location=tr.location,
            organizer=tr.organizer or "", maxPersonnel=tr.max_personnel,
            description=tr.description, status=tr.status,
            assigned=[a.model_dump() for a in serialized.assigned],
        ))
    ops.sort(key=lambda x: x.startDate)
    return ops


def operations_summary_data(base_date: str | None, db: Session) -> dict:
    if base_date:
        parsed = parse_iso_date(base_date)
        if not parsed:
            raise HTTPException(status_code=400, detail="Ervenytelen base_date formatum")
        base = parsed
    else:
        base = utc_now().date()

    next_week_end = base + timedelta(days=7)
    plus14_day = base + timedelta(days=14)

    exercises = db.scalars(select(ExerciseModel).where(ExerciseModel.status.in_(["Tervezett", "Folyamatban"]))).all()
    # A szolgálat is gyakorlat (DUTY_EXERCISE_TYPES), csak a típusa mondja meg.
    duties = [item for item in exercises if item.type in DUTY_EXERCISE_TYPES]

    shooting_kw = ["lőtér", "loter"]
    next_week_shooting = []
    for item in exercises:
        start = parse_iso_date(item.start_date)
        end = parse_iso_date(item.end_date)
        if not start or not end or end < base or start > next_week_end:
            continue
        if not any(kw in (item.location or "").lower() for kw in shooting_kw):
            continue
        next_week_shooting.append({
            "id": item.id, "name": item.name, "startDate": item.start_date,
            "endDate": item.end_date, "location": item.location, "status": item.status,
            "assignedCount": len(item.assigned or []), "maxPersonnel": item.max_personnel,
        })

    plus14_duties = []
    for item in duties:
        start = parse_iso_date(item.start_date)
        end = parse_iso_date(item.end_date)
        if not start or not end:
            continue
        if start <= plus14_day <= end:
            plus14_duties.append({
                "id": item.id, "name": item.name, "type": item.type, "startDate": item.start_date,
                "endDate": item.end_date, "location": item.location, "status": item.status,
                "assignedCount": len(item.assigned or []),
            })

    return {
        "baseDate": base.isoformat(),
        "nextWeekEnd": next_week_end.isoformat(),
        "plus14Date": plus14_day.isoformat(),
        "nextWeekShooting": {"count": len(next_week_shooting), "items": sorted(next_week_shooting, key=lambda x: x["startDate"])} ,
        "plus14Duties": {"count": len(plus14_duties), "items": sorted(plus14_duties, key=lambda x: x["startDate"])} ,
    }


def get_operations_tree_data(db: Session) -> list[OperationTreeNode]:
    events = db.scalars(select(EventModel).order_by(EventModel.start_date, EventModel.name)).all()
    node_map = {item.id: _event_to_tree_node(item) for item in events}

    roots: list[OperationTreeNode] = []
    for item in events:
        node = node_map[item.id]
        if item.parent_id and item.parent_id in node_map:
            node_map[item.parent_id].children.append(node)
        else:
            roots.append(node)

    roots.sort(key=lambda x: (x.startDate, x.name.lower()))
    for root in roots:
        root.children.sort(key=lambda x: (x.startDate, x.name.lower()))
    return roots


def create_operation_node_data(payload: EventCreate, db: Session) -> EventRead:
    item = EventModel()
    apply_event(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize_event(db, item)


def update_operation_node_data(node_id: str, payload: EventUpdate, db: Session) -> EventRead:
    item = require_event(db, node_id)
    apply_event(item, payload)
    db.commit()
    db.refresh(item)
    return serialize_event(db, item)


def delete_operation_node_data(node_id: str, db: Session) -> None:
    item = require_event(db, node_id)

    for att in db.scalars(select(OperationAttendanceModel).where(OperationAttendanceModel.sub_operation_id == node_id)).all():
        db.delete(att)
    for req in db.scalars(select(MaterialRequirementModel).where(MaterialRequirementModel.operation_id == node_id)).all():
        db.delete(req)
    for doc in db.scalars(select(OperationDocumentModel).where(OperationDocumentModel.operation_id == node_id)).all():
        doc_path = Path(doc.storage_path)
        if doc_path.exists() and doc_path.is_file():
            doc_path.unlink(missing_ok=True)
        db.delete(doc)

    for child in db.scalars(select(EventModel).where(EventModel.parent_id == node_id)).all():
        child.parent_id = None

    db.delete(item)
    db.commit()


def get_attendance_data(operation_id: str, db: Session) -> list[AttendanceEntryRead]:
    require_event(db, operation_id)
    items = db.scalars(
        select(OperationAttendanceModel)
        .where(OperationAttendanceModel.sub_operation_id == operation_id)
        .order_by(OperationAttendanceModel.person_name, OperationAttendanceModel.person_id)
    ).all()
    return [_attendance_to_read(item) for item in items]


def upsert_attendance_batch_data(operation_id: str, payload: AttendanceBatchUpdateRequest, db: Session, current_user: UserModel) -> list[AttendanceEntryRead]:
    require_event(db, operation_id)

    existing = db.scalars(select(OperationAttendanceModel).where(OperationAttendanceModel.sub_operation_id == operation_id)).all()
    existing_map = {item.person_id: item for item in existing}

    for entry in payload.entries:
        person_id = entry.personId.strip()
        if not person_id:
            raise HTTPException(status_code=400, detail="A personId kötelező")
        status = _validate_attendance_status(entry.status)
        item = existing_map.get(person_id)
        if not item:
            item = OperationAttendanceModel(sub_operation_id=operation_id, person_id=person_id)
            db.add(item)
            existing_map[person_id] = item

        item.person_name = (entry.personName or "").strip()
        item.status = status
        item.note = (entry.note or "").strip()
        item.updated_by = current_user.username
        item.updated_at = utc_now()

    db.commit()
    refreshed = db.scalars(
        select(OperationAttendanceModel)
        .where(OperationAttendanceModel.sub_operation_id == operation_id)
        .order_by(OperationAttendanceModel.person_name, OperationAttendanceModel.person_id)
    ).all()
    return [_attendance_to_read(item) for item in refreshed]


def patch_attendance_data(operation_id: str, person_id: str, payload: AttendanceEntryUpdate, db: Session, current_user: UserModel) -> AttendanceEntryRead:
    require_event(db, operation_id)
    item = db.scalar(select(OperationAttendanceModel).where(OperationAttendanceModel.sub_operation_id == operation_id, OperationAttendanceModel.person_id == person_id))
    if not item:
        raise HTTPException(status_code=404, detail="Jelenléti rekord nem található")

    if payload.personName is not None:
        item.person_name = payload.personName.strip()
    if payload.status is not None:
        item.status = _validate_attendance_status(payload.status)
    if payload.note is not None:
        item.note = payload.note.strip()

    item.updated_by = current_user.username
    item.updated_at = utc_now()
    db.commit()
    db.refresh(item)
    return _attendance_to_read(item)


def get_requirements_data(operation_id: str, db: Session) -> list[MaterialRequirementRead]:
    require_event(db, operation_id)
    items = db.scalars(
        select(MaterialRequirementModel).where(MaterialRequirementModel.operation_id == operation_id).order_by(MaterialRequirementModel.item_name)
    ).all()
    return [_requirement_to_read(item) for item in items]


def create_requirement_data(operation_id: str, payload: MaterialRequirementBase, db: Session) -> MaterialRequirementRead:
    require_event(db, operation_id)
    item_name = payload.itemName.strip()
    if not item_name:
        raise HTTPException(status_code=400, detail="Az anyag neve kötelező")

    item = MaterialRequirementModel(
        operation_id=operation_id,
        item_name=item_name,
        quantity=max(0, int(payload.quantity)),
        unit=payload.unit.strip(),
        note=payload.note.strip(),
        status=_validate_requirement_status(payload.status),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _requirement_to_read(item)


def patch_requirement_data(operation_id: str, req_id: str, payload: MaterialRequirementUpdate, db: Session) -> MaterialRequirementRead:
    require_event(db, operation_id)
    item = db.get(MaterialRequirementModel, req_id)
    if not item or item.operation_id != operation_id:
        raise HTTPException(status_code=404, detail="Anyagigény rekord nem található")

    if payload.itemName is not None:
        item_name = payload.itemName.strip()
        if not item_name:
            raise HTTPException(status_code=400, detail="Az anyag neve nem lehet üres")
        item.item_name = item_name
    if payload.quantity is not None:
        item.quantity = max(0, int(payload.quantity))
    if payload.unit is not None:
        item.unit = payload.unit.strip()
    if payload.note is not None:
        item.note = payload.note.strip()
    if payload.status is not None:
        item.status = _validate_requirement_status(payload.status)

    db.commit()
    db.refresh(item)
    return _requirement_to_read(item)


def delete_requirement_data(operation_id: str, req_id: str, db: Session) -> None:
    require_event(db, operation_id)
    item = db.get(MaterialRequirementModel, req_id)
    if not item or item.operation_id != operation_id:
        raise HTTPException(status_code=404, detail="Anyagigény rekord nem található")
    db.delete(item)
    db.commit()


async def upload_document_data(operation_id: str, file: UploadFile, title: str, uploaded_by: str | None, db: Session, current_user: UserModel) -> OperationDocumentRead:
    require_event(db, operation_id)
    original_name = (file.filename or "").strip()
    if not original_name:
        raise HTTPException(status_code=400, detail="Hiányzó fájlnév")

    safe_name = _safe_document_name(original_name)
    target_dir = _operation_upload_dir(operation_id)
    target_path = target_dir / safe_name

    content = await _read_within_limit(file)
    target_path.write_bytes(content)

    # A MIME a MÁR allowlist-elt kiterjesztésből származik, nem a kliens
    # content_type fejlécéből: egy .txt "text/html"-ként, inline kiszolgálva
    # tárolt XSS lenne — azonos originről, ahol a munkamenet-token él.
    mime_type = mimetypes.guess_type(safe_name)[0] or "application/octet-stream"

    item = OperationDocumentModel(
        operation_id=operation_id,
        filename=safe_name,
        original_name=original_name,
        mime_type=mime_type,
        file_size=len(content),
        storage_path=str(target_path),
        uploaded_by=(uploaded_by or current_user.username).strip() or current_user.username,
        uploaded_at=utc_now(),
        title=title.strip() or None,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _document_to_read(item)


def get_documents_data(operation_id: str, db: Session) -> list[OperationDocumentRead]:
    require_event(db, operation_id)
    items = db.scalars(
        select(OperationDocumentModel).where(OperationDocumentModel.operation_id == operation_id).order_by(OperationDocumentModel.uploaded_at.desc())
    ).all()
    return [_document_to_read(item) for item in items]


def delete_document_data(operation_id: str, doc_id: str, db: Session) -> None:
    require_event(db, operation_id)
    item = db.get(OperationDocumentModel, doc_id)
    if not item or item.operation_id != operation_id:
        raise HTTPException(status_code=404, detail="Dokumentum nem található")

    doc_path = Path(item.storage_path)
    if doc_path.exists() and doc_path.is_file():
        doc_path.unlink()

    db.delete(item)
    db.commit()


def download_document_response(operation_id: str, doc_id: str, db: Session) -> FileResponse:
    require_event(db, operation_id)
    item = db.get(OperationDocumentModel, doc_id)
    if not item or item.operation_id != operation_id:
        raise HTTPException(status_code=404, detail="Dokumentum nem található")

    path = Path(item.storage_path)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="A dokumentumfájl nem található a tárhelyen")

    return FileResponse(path=str(path), media_type=item.mime_type or "application/octet-stream", filename=item.original_name)


def view_document_response(operation_id: str, doc_id: str, db: Session) -> FileResponse:
    require_event(db, operation_id)
    item = db.get(OperationDocumentModel, doc_id)
    if not item or item.operation_id != operation_id:
        raise HTTPException(status_code=404, detail="Dokumentum nem található")

    path = Path(item.storage_path)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="A dokumentumfájl nem található a tárhelyen")

    # Inline megjelenítést csak PDF-re engedünk, fix típussal. Minden más
    # letöltésként megy, hogy a böngésző semmiképp ne rendereljen felhasználói
    # tartalmat ezen az originen.
    media_type = item.mime_type or "application/octet-stream"
    disposition = "inline" if media_type in INLINE_MEDIA_TYPES else "attachment"
    return FileResponse(
        path=str(path),
        media_type=media_type,
        headers={"Content-Disposition": f"{disposition}; {_content_disposition_filename(item.original_name)}"},
    )
