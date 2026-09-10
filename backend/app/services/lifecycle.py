from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.time import parse_iso_date
from ..models import EventModel, ExerciseModel, PersonModel, TrainingModel

PLANNED = "Tervezett"
ONGOING = "Folyamatban"
DONE = "Befejezett"


def _today_iso() -> date:
    return date.today()


def _sync_temporal_status(item: Any, *, today: date) -> bool:
    start = parse_iso_date(getattr(item, "start_date", ""))
    end = parse_iso_date(getattr(item, "end_date", ""))
    if not start or not end:
        return False

    current = getattr(item, "status", "")
    if current == PLANNED and start <= today:
        item.status = ONGOING
        return True
    if current == ONGOING and end < today:
        item.status = DONE
        return True
    return False


def sync_temporal_statuses(db: Session) -> int:
    changed = 0
    today = _today_iso()

    for item in db.scalars(select(ExerciseModel)).all():
        if _sync_temporal_status(item, today=today):
            changed += 1

    for item in db.scalars(select(TrainingModel)).all():
        if _sync_temporal_status(item, today=today):
            changed += 1

    for item in db.scalars(select(EventModel)).all():
        if _sync_temporal_status(item, today=today):
            changed += 1

    if changed:
        db.commit()
    return changed


def _is_main_operation(db: Session, operation_id: str) -> bool:
    event = db.get(EventModel, operation_id)
    if not event:
        return True
    return event.parent_id is None


def apply_training_completion_effects(db: Session, training: TrainingModel) -> int:
    if training.status != DONE:
        return 0
    if not training.qualification_id:
        return 0
    if not _is_main_operation(db, training.id):
        return 0

    awarded = 0
    for assignment in training.assigned or []:
        person_id = str(assignment.get("personId", "")).strip()
        if not person_id:
            continue
        person = db.get(PersonModel, person_id)
        if not person:
            continue

        quals = list(person.qualifications or [])
        success = assignment.get("attendance") == "Megjelent" and bool(assignment.get("qualificationApproved"))

        completed_ops = list((getattr(person, "completed_operations", None) or []))
        existing = next((entry for entry in completed_ops if str(entry.get("operationId", "")) == training.id), None)
        entry = {
            "operationId": training.id,
            "operationName": training.name,
            "success": bool(success),
            "qualificationId": training.qualification_id,
            "date": training.end_date,
        }
        if existing is None:
            completed_ops.append(entry)
        else:
            existing.update(entry)

        if success and training.qualification_id not in quals:
            quals.append(training.qualification_id)
            awarded += 1

        person.qualifications = quals
        person.completed_operations = completed_ops

    db.commit()
    return awarded