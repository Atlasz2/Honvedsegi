"""Részletes tevékenység-naplózás (mező-szintű before/after).

Megbízhatóbb, mint a frontend-vezérelt logolás: a mutáció helyén, szerveroldalon
keletkezik, a hitelesített felhasználó adataival — így pontosan visszakövethető,
ki mit változtatott. A payload formátuma kompatibilis a napló visszaállítással
(entity/mode/before/after), plusz egy ember által olvasható `changes` listával.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from .models import ActivityLogModel, UserModel

_MODE_ACTION = {"create": "létrehozva", "update": "módosítva", "delete": "törölve"}


def field_diff(before: dict[str, Any] | None, after: dict[str, Any] | None) -> list[dict[str, Any]]:
    """A megváltozott mezők listája: [{field, from, to}, ...]."""
    before = before or {}
    after = after or {}
    changes: list[dict[str, Any]] = []
    for field in sorted(set(before) | set(after)):
        old = before.get(field)
        new = after.get(field)
        if old != new:
            changes.append({"field": field, "from": old, "to": new})
    return changes


def record_activity(
    db: Session,
    user: UserModel,
    *,
    mode: str,                       # "create" | "update" | "delete"
    module: str,
    record_name: str,
    entity: str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    """Naplóbejegyzést fűz a sessionhöz (a hívó commitol). Módosításnál, ha nincs
    tényleges változás, nem naplóz (nincs zaj)."""
    changes = field_diff(before, after) if mode == "update" else None
    if mode == "update" and not changes:
        return

    payload: dict[str, Any] = {"entity": entity, "mode": mode}
    if before is not None:
        payload["before"] = before
    if after is not None:
        payload["after"] = after
    if changes is not None:
        payload["changes"] = changes

    db.add(ActivityLogModel(
        user_id=user.username,
        user_name=user.display_name,
        user_role=user.role,
        action=_MODE_ACTION.get(mode, "módosítva"),
        module=module,
        record_name=record_name,
        payload=payload,
    ))
