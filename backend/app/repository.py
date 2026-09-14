"""Generikus adatbázis-hozzáférés."""
from __future__ import annotations

from typing import TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import Session

ModelT = TypeVar("ModelT")


def require_model(db: Session, model_type: type[ModelT], item_id: str) -> ModelT:
    item = db.get(model_type, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Az erőforrás nem található")
    return item
