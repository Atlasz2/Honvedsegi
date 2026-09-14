"""Alapkiképzés: modulok → összesítő képesítés.

Modul = a BASIC_TRAINING_CATEGORY kategóriájú képesítés-típus. Akinek MINDEN
modulja megvan, az automatikusan megkapja az összesítő „Alapkiképzés"
képesítést (BASIC_TRAINING_QUALIFICATION), ami a követelményekben és a
riasztásokban egyetlen tételként hivatkozható. A kézi kiadás, az esemény-
jóváírás és az import ugyanezt a függvényt hívja, így a szabály egy helyen él.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from .constants import BASIC_TRAINING_CATEGORY, BASIC_TRAINING_QUALIFICATION
from .models import PersonnelQualificationModel, QualificationTypeModel, new_id


def module_types(db: Session) -> list[QualificationTypeModel]:
    return db.scalars(
        select(QualificationTypeModel)
        .where(QualificationTypeModel.category == BASIC_TRAINING_CATEGORY)
        .order_by(QualificationTypeModel.name)
    ).all()


def summary_type(db: Session, *, create: bool) -> QualificationTypeModel | None:
    item = db.scalar(select(QualificationTypeModel).where(QualificationTypeModel.name == BASIC_TRAINING_QUALIFICATION))
    if item is None and create:
        item = QualificationTypeModel(
            id=new_id(), name=BASIC_TRAINING_QUALIFICATION, category="Általános", validity_days=None,
            description="Automatikus: minden alapkiképzési modul teljesítve.",
        )
        db.add(item)
        db.flush()
    return item


def completion_map(db: Session, personnel_ids: Iterable[str] | None = None) -> tuple[list[QualificationTypeModel], dict[str, set[str]], set[str]]:
    """(modulok, személy → megszerzett modul-id-k, akiknek megvan az összesítő)."""
    modules = module_types(db)
    module_ids = {m.id for m in modules}
    summary = summary_type(db, create=False)
    wanted = module_ids | ({summary.id} if summary else set())
    if not wanted:
        return modules, {}, set()
    query = select(PersonnelQualificationModel.personnel_id, PersonnelQualificationModel.qual_type_id).where(
        PersonnelQualificationModel.qual_type_id.in_(wanted)
    )
    if personnel_ids is not None:
        ids = list(personnel_ids)
        if not ids:
            return modules, {}, set()
        query = query.where(PersonnelQualificationModel.personnel_id.in_(ids))
    held: dict[str, set[str]] = defaultdict(set)
    has_summary: set[str] = set()
    for personnel_id, qual_type_id in db.execute(query):
        if summary and qual_type_id == summary.id:
            has_summary.add(personnel_id)
        else:
            held[personnel_id].add(qual_type_id)
    return modules, held, has_summary


def grant_if_complete(db: Session, personnel_ids: Iterable[str]) -> int:
    """Akinek minden modulja megvan és még nincs összesítője, kap egyet. Idempotens."""
    ids = list(dict.fromkeys(personnel_ids))
    if not ids:
        return 0
    db.flush()  # a most hozzáadott modul-képesítések látszódjanak (autoflush=False)
    modules, held, has_summary = completion_map(db, ids)
    if not modules:
        return 0
    module_ids = {m.id for m in modules}
    granted = 0
    summary = None
    for personnel_id in ids:
        if personnel_id in has_summary or not module_ids <= held.get(personnel_id, set()):
            continue
        summary = summary or summary_type(db, create=True)
        db.add(PersonnelQualificationModel(
            id=new_id(), personnel_id=personnel_id, qual_type_id=summary.id,
            earned_date=date.today().isoformat(), expiry_date=None,
            notes="Automatikus: minden alapkiképzési modul teljesítve.",
        ))
        granted += 1
    return granted
