from __future__ import annotations

import mimetypes
import secrets
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import _apply_event, _get_current_user, _parse_iso_date, _require_admin, _require_editor, _serialize_event, _utc_now
from ..models import (
    AttendanceModel,
    DutyModel,
    EventModel,
    ExerciseModel,
    MaterialRequirementModel,
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
    OperationRead,
    OperationDocumentRead,
    OperationTreeNode,
)

router = APIRouter(prefix="/api/operations", tags=["operations"])

UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads" / "operations"
MAX_UPLOAD_SIZE = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".xlsx", ".xls", ".docx", ".doc", ".txt"}
ALLOWED_ATTENDANCE = {"Present", "Excused", "Absent", "Pending"}
ALLOWED_REQUIREMENT = {"Requested", "Approved", "Fulfilled"}


# ---- Shared helpers -----------------------------------------------------


def _require_event(db: Session, operation_id: str) -> EventModel:
    item = db.get(EventModel, operation_id)
    if item:
        return item

    exercise = db.get(ExerciseModel, operation_id)
    if exercise:
        shadow = EventModel(
            id=operation_id,
            event_type="esemeny",
            name=exercise.name,
            type=exercise.type,
            start_date=exercise.start_date,
            end_date=exercise.end_date,
            location=exercise.location,
            organizer="",
            max_personnel=exercise.max_personnel,
            description=exercise.description,
            status=exercise.status,
            assigned=exercise.assigned,
            parent_id=None,
        )
        db.add(shadow)
        db.commit()
        db.refresh(shadow)
        return shadow

    training = db.get(TrainingModel, operation_id)
    if training:
        shadow = EventModel(
            id=operation_id,
            event_type="esemeny",
            name=training.name,
            type=training.type,
            start_date=training.start_date,
            end_date=training.end_date,
            location=training.location,
            organizer=training.organizer or "",
            max_personnel=training.max_personnel,
            description=training.description,
            status=training.status,
            assigned=training.assigned,
            parent_id=None,
        )
        db.add(shadow)
        db.commit()
        db.refresh(shadow)
        return shadow

    raise HTTPException(status_code=404, detail="A művelet nem található")


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


def _attendance_to_read(item: AttendanceModel) -> AttendanceEntryRead:
    updated_at = item.updated_at.isoformat() if item.updated_at else _utc_now().isoformat()
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
    uploaded_at = item.uploaded_at.isoformat() if item.uploaded_at else _utc_now().isoformat()
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


def _operation_upload_dir(operation_id: str) -> Path:
    target = UPLOAD_ROOT / operation_id
    target.mkdir(parents=True, exist_ok=True)
    return target


# ---- Existing endpoints -------------------------------------------------


@router.get("", response_model=list[OperationRead])
def list_operations(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    exercises = db.scalars(select(ExerciseModel).order_by(ExerciseModel.start_date)).all()
    trainings = db.scalars(select(TrainingModel).order_by(TrainingModel.start_date)).all()
    ops = []
    for ex in exercises:
        ops.append(OperationRead(
            id=ex.id, name=ex.name, type=ex.type, operationType="exercise",
            startDate=ex.start_date, endDate=ex.end_date, location=ex.location,
            organizer=None, maxPersonnel=ex.max_personnel, description=ex.description,
            status=ex.status, assigned=ex.assigned or [],
        ))
    for tr in trainings:
        ops.append(OperationRead(
            id=tr.id, name=tr.name, type=tr.type, operationType="training",
            startDate=tr.start_date, endDate=tr.end_date, location=tr.location,
            organizer=tr.organizer or "", maxPersonnel=tr.max_personnel,
            description=tr.description, status=tr.status, assigned=tr.assigned or [],
        ))
    ops.sort(key=lambda x: x.startDate)
    return ops


@router.get("/summary")
def operations_summary(
    base_date: str | None = None,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_get_current_user),
):
    if base_date:
        parsed = _parse_iso_date(base_date)
        if not parsed:
            raise HTTPException(status_code=400, detail="Ervenytelen base_date formatum")
        base = parsed
    else:
        base = _utc_now().date()

    next_week_end = base + timedelta(days=7)
    plus14_day = base + timedelta(days=14)

    exercises = db.scalars(
        select(ExerciseModel).where(ExerciseModel.status.in_(["Tervezett", "Folyamatban"]))
    ).all()
    duties = db.scalars(
        select(DutyModel).where(DutyModel.status.in_(["Tervezett", "Teljesített"]))
    ).all()

    shooting_kw = ["lőtér", "loter"]
    next_week_shooting = []
    for item in exercises:
        start = _parse_iso_date(item.start_date)
        end = _parse_iso_date(item.end_date)
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
        start = _parse_iso_date(item.start_date)
        end = _parse_iso_date(item.end_date)
        if not start or not end:
            continue
        if start <= plus14_day <= end:
            plus14_duties.append({
                "id": item.id, "type": item.type, "startDate": item.start_date,
                "endDate": item.end_date, "location": item.location,
                "personId": item.person_id, "personName": item.person_name, "status": item.status,
            })

    return {
        "baseDate": base.isoformat(), "nextWeekEnd": next_week_end.isoformat(),
        "plus14Date": plus14_day.isoformat(),
        "nextWeekShooting": {"count": len(next_week_shooting), "items": sorted(next_week_shooting, key=lambda x: x["startDate"])} ,
        "plus14Duties": {"count": len(plus14_duties), "items": sorted(plus14_duties, key=lambda x: x["startDate"])} ,
    }


# ---- Tree ---------------------------------------------------------------


@router.get("/tree", response_model=list[OperationTreeNode])
def get_operations_tree(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[OperationTreeNode]:
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


# ---- Node CRUD ----------------------------------------------------------


@router.post("/nodes", response_model=EventRead)
def create_operation_node(
    payload: EventCreate,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_require_editor),
) -> EventRead:
    item = EventModel()
    _apply_event(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_event(item)


@router.put("/nodes/{node_id}", response_model=EventRead)
def update_operation_node(
    node_id: str,
    payload: EventUpdate,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_require_editor),
) -> EventRead:
    item = _require_event(db, node_id)
    _apply_event(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_event(item)


@router.delete("/nodes/{node_id}", status_code=204)
def delete_operation_node(
    node_id: str,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_require_admin),
):
    item = _require_event(db, node_id)

    # Cascade-delete related records
    for att in db.scalars(select(AttendanceModel).where(AttendanceModel.sub_operation_id == node_id)).all():
        db.delete(att)
    for req in db.scalars(select(MaterialRequirementModel).where(MaterialRequirementModel.operation_id == node_id)).all():
        db.delete(req)
    for doc in db.scalars(select(OperationDocumentModel).where(OperationDocumentModel.operation_id == node_id)).all():
        doc_path = Path(doc.storage_path)
        if doc_path.exists() and doc_path.is_file():
            doc_path.unlink(missing_ok=True)
        db.delete(doc)

    # Detach children (make them root nodes)
    for child in db.scalars(select(EventModel).where(EventModel.parent_id == node_id)).all():
        child.parent_id = None

    db.delete(item)
    db.commit()


# ---- Attendance ---------------------------------------------------------


@router.get("/{operation_id}/attendance", response_model=list[AttendanceEntryRead])
def get_attendance(operation_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[AttendanceEntryRead]:
    _require_event(db, operation_id)
    items = db.scalars(
        select(AttendanceModel)
        .where(AttendanceModel.sub_operation_id == operation_id)
        .order_by(AttendanceModel.person_name, AttendanceModel.person_id)
    ).all()
    return [_attendance_to_read(item) for item in items]


@router.post("/{operation_id}/attendance/batch", response_model=list[AttendanceEntryRead])
def upsert_attendance_batch(
    operation_id: str,
    payload: AttendanceBatchUpdateRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(_require_editor),
) -> list[AttendanceEntryRead]:
    _require_event(db, operation_id)

    existing = db.scalars(select(AttendanceModel).where(AttendanceModel.sub_operation_id == operation_id)).all()
    existing_map = {item.person_id: item for item in existing}

    for entry in payload.entries:
        person_id = entry.personId.strip()
        if not person_id:
            raise HTTPException(status_code=400, detail="A personId kötelező")
        status = _validate_attendance_status(entry.status)
        item = existing_map.get(person_id)
        if not item:
            item = AttendanceModel(sub_operation_id=operation_id, person_id=person_id)
            db.add(item)
            existing_map[person_id] = item

        item.person_name = (entry.personName or "").strip()
        item.status = status
        item.note = (entry.note or "").strip()
        item.updated_by = current_user.username
        item.updated_at = _utc_now()

    db.commit()
    refreshed = db.scalars(
        select(AttendanceModel)
        .where(AttendanceModel.sub_operation_id == operation_id)
        .order_by(AttendanceModel.person_name, AttendanceModel.person_id)
    ).all()
    return [_attendance_to_read(item) for item in refreshed]


@router.patch("/{operation_id}/attendance/{person_id}", response_model=AttendanceEntryRead)
def patch_attendance(
    operation_id: str,
    person_id: str,
    payload: AttendanceEntryUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(_require_editor),
) -> AttendanceEntryRead:
    _require_event(db, operation_id)
    item = db.scalar(
        select(AttendanceModel).where(
            AttendanceModel.sub_operation_id == operation_id,
            AttendanceModel.person_id == person_id,
        )
    )
    if not item:
        raise HTTPException(status_code=404, detail="Jelenléti rekord nem található")

    if payload.personName is not None:
        item.person_name = payload.personName.strip()
    if payload.status is not None:
        item.status = _validate_attendance_status(payload.status)
    if payload.note is not None:
        item.note = payload.note.strip()

    item.updated_by = current_user.username
    item.updated_at = _utc_now()
    db.commit()
    db.refresh(item)
    return _attendance_to_read(item)


# ---- Material requirements ---------------------------------------------


@router.get("/{operation_id}/requirements", response_model=list[MaterialRequirementRead])
def get_requirements(operation_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[MaterialRequirementRead]:
    _require_event(db, operation_id)
    items = db.scalars(
        select(MaterialRequirementModel)
        .where(MaterialRequirementModel.operation_id == operation_id)
        .order_by(MaterialRequirementModel.item_name)
    ).all()
    return [_requirement_to_read(item) for item in items]


@router.post("/{operation_id}/requirements", response_model=MaterialRequirementRead)
def create_requirement(
    operation_id: str,
    payload: MaterialRequirementBase,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_require_editor),
) -> MaterialRequirementRead:
    _require_event(db, operation_id)
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


@router.patch("/{operation_id}/requirements/{req_id}", response_model=MaterialRequirementRead)
def patch_requirement(
    operation_id: str,
    req_id: str,
    payload: MaterialRequirementUpdate,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_require_editor),
) -> MaterialRequirementRead:
    _require_event(db, operation_id)
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


@router.delete("/{operation_id}/requirements/{req_id}", status_code=204)
def delete_requirement(
    operation_id: str,
    req_id: str,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_require_editor),
):
    _require_event(db, operation_id)
    item = db.get(MaterialRequirementModel, req_id)
    if not item or item.operation_id != operation_id:
        raise HTTPException(status_code=404, detail="Anyagigény rekord nem található")
    db.delete(item)
    db.commit()


# ---- Documents ----------------------------------------------------------


@router.post("/{operation_id}/documents", response_model=OperationDocumentRead)
async def upload_document(
    operation_id: str,
    file: UploadFile = File(...),
    title: str = Form(default=""),
    uploaded_by: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(_require_editor),
) -> OperationDocumentRead:
    _require_event(db, operation_id)
    original_name = (file.filename or "").strip()
    if not original_name:
        raise HTTPException(status_code=400, detail="Hiányzó fájlnév")

    safe_name = _safe_document_name(original_name)
    target_dir = _operation_upload_dir(operation_id)
    target_path = target_dir / safe_name

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Üres fájl")
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="A fájl túl nagy (max 20MB)")

    target_path.write_bytes(content)
    mime_type = file.content_type or mimetypes.guess_type(original_name)[0] or "application/octet-stream"

    item = OperationDocumentModel(
        operation_id=operation_id,
        filename=safe_name,
        original_name=original_name,
        mime_type=mime_type,
        file_size=len(content),
        storage_path=str(target_path),
        uploaded_by=(uploaded_by or current_user.username).strip() or current_user.username,
        uploaded_at=_utc_now(),
        title=title.strip() or None,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _document_to_read(item)


@router.get("/{operation_id}/documents", response_model=list[OperationDocumentRead])
def get_documents(operation_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[OperationDocumentRead]:
    _require_event(db, operation_id)
    items = db.scalars(
        select(OperationDocumentModel)
        .where(OperationDocumentModel.operation_id == operation_id)
        .order_by(OperationDocumentModel.uploaded_at.desc())
    ).all()
    return [_document_to_read(item) for item in items]


@router.delete("/{operation_id}/documents/{doc_id}", status_code=204)
def delete_document(
    operation_id: str,
    doc_id: str,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_require_admin),
):
    _require_event(db, operation_id)
    item = db.get(OperationDocumentModel, doc_id)
    if not item or item.operation_id != operation_id:
        raise HTTPException(status_code=404, detail="Dokumentum nem található")

    doc_path = Path(item.storage_path)
    if doc_path.exists() and doc_path.is_file():
        doc_path.unlink()

    db.delete(item)
    db.commit()


@router.get("/{operation_id}/documents/{doc_id}/download")
def download_document(
    operation_id: str,
    doc_id: str,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_get_current_user),
):
    _require_event(db, operation_id)
    item = db.get(OperationDocumentModel, doc_id)
    if not item or item.operation_id != operation_id:
        raise HTTPException(status_code=404, detail="Dokumentum nem található")

    path = Path(item.storage_path)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="A dokumentumfájl nem található a tárhelyen")

    return FileResponse(
        path=str(path),
        media_type=item.mime_type or "application/octet-stream",
        filename=item.original_name,
    )


@router.get("/{operation_id}/documents/{doc_id}/view")
def view_document(
    operation_id: str,
    doc_id: str,
    db: Session = Depends(get_db),
    _: UserModel = Depends(_get_current_user),
):
    _require_event(db, operation_id)
    item = db.get(OperationDocumentModel, doc_id)
    if not item or item.operation_id != operation_id:
        raise HTTPException(status_code=404, detail="Dokumentum nem található")

    path = Path(item.storage_path)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="A dokumentumfájl nem található a tárhelyen")

    return FileResponse(
        path=str(path),
        media_type=item.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f"inline; filename=\"{item.original_name}\""},
    )



