"""Művelet végpontok.

Két rétege van ugyanannak a modulnak:

- **Lista és összesítő**: a gyakorlatok és kiképzések egyesített nézete.
- **Művelet-fa**: eseményekből épített hierarchia, csomópontonként jelenléti
  ívvel, anyagigénnyel és csatolt dokumentumokkal.

A modul csak HTTP-t fordít; az üzleti logika a services.operations rétegben él.
"""
from __future__ import annotations

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import FileResponse

from ..core.dependencies import DB, Editor, Reader
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
from ..services.operations import (
    operations_now_data,
    create_operation_node_data,
    create_requirement_data,
    delete_document_data,
    delete_operation_node_data,
    delete_requirement_data,
    download_document_response,
    get_attendance_data,
    get_documents_data,
    get_operations_tree_data,
    get_requirements_data,
    list_operations_data,
    operations_summary_data,
    patch_attendance_data,
    patch_requirement_data,
    update_operation_node_data,
    upload_document_data,
    upsert_attendance_batch_data,
    view_document_response,
)

router = APIRouter(prefix="/api/operations", tags=["operations"])


# ── Lista és összesítő ────────────────────────────────────────────────────

@router.get("", response_model=list[OperationRead])
def list_operations(db: DB, _: Reader):
    return list_operations_data(db)


@router.get("/summary")
def operations_summary(db: DB, _: Reader, base_date: str | None = None):
    return operations_summary_data(base_date, db)


@router.get("/now")
def operations_now(db: DB, _: Reader):
    """Mi van most: futó műveletek, ki van feladatban (mikortól meddig), a mai
    események. Az Áttekintés ebből ad gyors képet — egy kérés, nem négy lista."""
    return operations_now_data(db)


# ── Művelet-fa ────────────────────────────────────────────────────────────
# A /tree a {operation_id} elé kerül, különben a catch-all útvonal nyelné el.

@router.get("/tree", response_model=list[OperationTreeNode])
def get_operations_tree(db: DB, _: Reader):
    return get_operations_tree_data(db)


@router.post("/tree", response_model=EventRead, status_code=201)
def create_operation_node(payload: EventCreate, db: DB, _: Editor):
    return create_operation_node_data(payload, db)


@router.put("/tree/{node_id}", response_model=EventRead)
def update_operation_node(node_id: str, payload: EventUpdate, db: DB, _: Editor):
    return update_operation_node_data(node_id, payload, db)


@router.delete("/tree/{node_id}", status_code=204)
def delete_operation_node(node_id: str, db: DB, _: Editor):
    delete_operation_node_data(node_id, db)


# ── Jelenléti ív ──────────────────────────────────────────────────────────

@router.get("/{operation_id}/attendance", response_model=list[AttendanceEntryRead])
def get_attendance(operation_id: str, db: DB, _: Reader):
    return get_attendance_data(operation_id, db)


@router.put("/{operation_id}/attendance", response_model=list[AttendanceEntryRead])
def upsert_attendance(operation_id: str, payload: AttendanceBatchUpdateRequest, db: DB, user: Editor):
    return upsert_attendance_batch_data(operation_id, payload, db, user)


@router.patch("/{operation_id}/attendance/{person_id}", response_model=AttendanceEntryRead)
def patch_attendance(operation_id: str, person_id: str, payload: AttendanceEntryUpdate, db: DB, user: Editor):
    return patch_attendance_data(operation_id, person_id, payload, db, user)


# ── Anyagigény ────────────────────────────────────────────────────────────

@router.get("/{operation_id}/requirements", response_model=list[MaterialRequirementRead])
def get_requirements(operation_id: str, db: DB, _: Reader):
    return get_requirements_data(operation_id, db)


@router.post("/{operation_id}/requirements", response_model=MaterialRequirementRead, status_code=201)
def create_requirement(operation_id: str, payload: MaterialRequirementBase, db: DB, _: Editor):
    return create_requirement_data(operation_id, payload, db)


@router.patch("/{operation_id}/requirements/{req_id}", response_model=MaterialRequirementRead)
def patch_requirement(operation_id: str, req_id: str, payload: MaterialRequirementUpdate, db: DB, _: Editor):
    return patch_requirement_data(operation_id, req_id, payload, db)


@router.delete("/{operation_id}/requirements/{req_id}", status_code=204)
def delete_requirement(operation_id: str, req_id: str, db: DB, _: Editor):
    delete_requirement_data(operation_id, req_id, db)


# ── Dokumentumok ──────────────────────────────────────────────────────────

@router.get("/{operation_id}/documents", response_model=list[OperationDocumentRead])
def get_documents(operation_id: str, db: DB, _: Reader):
    return get_documents_data(operation_id, db)


@router.post("/{operation_id}/documents", response_model=OperationDocumentRead, status_code=201)
async def upload_document(
    operation_id: str,
    db: DB,
    user: Editor,
    file: UploadFile = File(...),
    title: str = Form(""),
    uploaded_by: str | None = Form(None),
):
    return await upload_document_data(operation_id, file, title, uploaded_by, db, user)


@router.get("/{operation_id}/documents/{doc_id}/download")
def download_document(operation_id: str, doc_id: str, db: DB, _: Reader) -> FileResponse:
    return download_document_response(operation_id, doc_id, db)


@router.get("/{operation_id}/documents/{doc_id}/view")
def view_document(operation_id: str, doc_id: str, db: DB, _: Reader) -> FileResponse:
    return view_document_response(operation_id, doc_id, db)


@router.delete("/{operation_id}/documents/{doc_id}", status_code=204)
def delete_document(operation_id: str, doc_id: str, db: DB, _: Editor):
    delete_document_data(operation_id, doc_id, db)
