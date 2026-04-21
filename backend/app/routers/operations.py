from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import _get_current_user, _require_admin, _require_editor
from ..models import UserModel
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
    upsert_attendance_batch_data,
    upload_document_data,
    view_document_response,
)

router = APIRouter(prefix="/api/operations", tags=["operations"])


@router.get("", response_model=list[OperationRead])
def list_operations(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    return list_operations_data(db)


@router.get("/summary")
def operations_summary(base_date: str | None = None, db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    return operations_summary_data(base_date, db)


@router.get("/tree", response_model=list[OperationTreeNode])
def get_operations_tree(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[OperationTreeNode]:
    return get_operations_tree_data(db)


@router.post("/nodes", response_model=EventRead)
def create_operation_node(payload: EventCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> EventRead:
    return create_operation_node_data(payload, db)


@router.put("/nodes/{node_id}", response_model=EventRead)
def update_operation_node(node_id: str, payload: EventUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> EventRead:
    return update_operation_node_data(node_id, payload, db)


@router.delete("/nodes/{node_id}", status_code=204)
def delete_operation_node(node_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_admin)):
    delete_operation_node_data(node_id, db)


@router.get("/{operation_id}/attendance", response_model=list[AttendanceEntryRead])
def get_attendance(operation_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[AttendanceEntryRead]:
    return get_attendance_data(operation_id, db)


@router.post("/{operation_id}/attendance/batch", response_model=list[AttendanceEntryRead])
def upsert_attendance_batch(operation_id: str, payload: AttendanceBatchUpdateRequest, db: Session = Depends(get_db), current_user: UserModel = Depends(_require_editor)) -> list[AttendanceEntryRead]:
    return upsert_attendance_batch_data(operation_id, payload, db, current_user)


@router.patch("/{operation_id}/attendance/{person_id}", response_model=AttendanceEntryRead)
def patch_attendance(operation_id: str, person_id: str, payload: AttendanceEntryUpdate, db: Session = Depends(get_db), current_user: UserModel = Depends(_require_editor)) -> AttendanceEntryRead:
    return patch_attendance_data(operation_id, person_id, payload, db, current_user)


@router.get("/{operation_id}/requirements", response_model=list[MaterialRequirementRead])
def get_requirements(operation_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[MaterialRequirementRead]:
    return get_requirements_data(operation_id, db)


@router.post("/{operation_id}/requirements", response_model=MaterialRequirementRead)
def create_requirement(operation_id: str, payload: MaterialRequirementBase, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> MaterialRequirementRead:
    return create_requirement_data(operation_id, payload, db)


@router.patch("/{operation_id}/requirements/{req_id}", response_model=MaterialRequirementRead)
def patch_requirement(operation_id: str, req_id: str, payload: MaterialRequirementUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)) -> MaterialRequirementRead:
    return patch_requirement_data(operation_id, req_id, payload, db)


@router.delete("/{operation_id}/requirements/{req_id}", status_code=204)
def delete_requirement(operation_id: str, req_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    delete_requirement_data(operation_id, req_id, db)


@router.post("/{operation_id}/documents", response_model=OperationDocumentRead)
async def upload_document(operation_id: str, file: UploadFile = File(...), title: str = Form(default=""), uploaded_by: str | None = Form(default=None), db: Session = Depends(get_db), current_user: UserModel = Depends(_require_editor)) -> OperationDocumentRead:
    return await upload_document_data(operation_id, file, title, uploaded_by, db, current_user)


@router.get("/{operation_id}/documents", response_model=list[OperationDocumentRead])
def get_documents(operation_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> list[OperationDocumentRead]:
    return get_documents_data(operation_id, db)


@router.delete("/{operation_id}/documents/{doc_id}", status_code=204)
def delete_document(operation_id: str, doc_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_admin)):
    delete_document_data(operation_id, doc_id, db)


@router.get("/{operation_id}/documents/{doc_id}/download")
def download_document(operation_id: str, doc_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> FileResponse:
    return download_document_response(operation_id, doc_id, db)


@router.get("/{operation_id}/documents/{doc_id}/view")
def view_document(operation_id: str, doc_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)) -> FileResponse:
    return view_document_response(operation_id, doc_id, db)
