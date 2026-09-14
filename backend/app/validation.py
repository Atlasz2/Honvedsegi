"""Bemenet-ellenőrzés, ami több modulból is kell."""
from __future__ import annotations

import re

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import PersonModel


def normalize_sztsz(value: str) -> str:
    normalized = re.sub(r"\s+", "", (value or "").strip()).upper()
    if re.fullmatch(r"\d{8}", normalized):
        return normalized
    if re.fullmatch(r"[A-Z]{2}\d{6}", normalized):
        return normalized
    raise HTTPException(status_code=400, detail="Az SZTSz formátuma 8 számjegy vagy 2 betű + 6 számjegy lehet")


def assert_unique_sztsz(db: Session, sztsz: str, exclude_id: str | None = None) -> None:
    existing = db.scalar(select(PersonModel).where(PersonModel.sztsz == sztsz))
    if existing and existing.id != exclude_id:
        raise HTTPException(status_code=409, detail="Ez az SZTSz már létezik")
