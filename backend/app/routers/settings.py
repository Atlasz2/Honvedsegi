"""Admin-beállítások: riasztási küszöbök olvasása (mindenki) és írása (admin)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from sqlalchemy import select

from ..audit import record_activity
from ..core.dependencies import DB, Admin, Reader
from ..models import PersonModel
from ..settings_store import (
    CUSTOM_FIELD_BASE, get_all, get_custom_rules, is_enabled, set_custom_rules, set_enabled, set_many,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


class AlertSettingsUpdate(BaseModel):
    values: dict[str, int] = {}
    enabled: dict[str, bool] = {}


class CustomRulesUpdate(BaseModel):
    rules: list[dict]


@router.get("/alerts")
def read_alert_settings(db: DB, _: Reader):
    return {"items": get_all(db)}


@router.put("/alerts")
def write_alert_settings(payload: AlertSettingsUpdate, db: DB, user: Admin):
    try:
        changed = set_many(db, payload.values)
        toggled: dict[str, tuple[bool, bool]] = {}
        for key, flag in payload.enabled.items():
            before = is_enabled(db, key)
            if set_enabled(db, key, bool(flag)):
                toggled[key] = (before, bool(flag))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if changed or toggled:
        record_activity(
            db, user, mode="update", module="Beállítások", record_name="Riasztási küszöbök", entity="app_settings",
            before={**{k: v[0] for k, v in changed.items()}, **{f"{k}.enabled": v[0] for k, v in toggled.items()}},
            after={**{k: v[1] for k, v in changed.items()}, **{f"{k}.enabled": v[1] for k, v in toggled.items()}},
        )
    db.commit()
    return {"items": get_all(db), "changed": list(changed) + [f"{k}.enabled" for k in toggled]}


@router.get("/alerts/custom")
def read_custom_rules(db: DB, _: Reader):
    """Egyéni dátum-szabályok + a választható személy-mezők (alap + a KGIR-ből
    jött, egyébként nem használt oszlopok)."""
    fields = [{"key": k, "label": v} for k, v in CUSTOM_FIELD_BASE.items()]
    seen: set[str] = set()
    for extra in db.scalars(select(PersonModel.extra).where(PersonModel.status != "Leszerelt")).all():
        for key in (extra or {}):
            if key and key not in seen:
                seen.add(key)
    fields += [{"key": f"extra:{k}", "label": k} for k in sorted(seen, key=str.lower)]
    return {"rules": get_custom_rules(db), "fields": fields}


@router.put("/alerts/custom")
def write_custom_rules(payload: CustomRulesUpdate, db: DB, user: Admin):
    before = get_custom_rules(db)
    try:
        rules = set_custom_rules(db, payload.rules)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if before != rules:
        record_activity(db, user, mode="update", module="Beállítások", record_name="Egyéni riasztási szabályok", entity="app_settings",
                        before={"rules": before}, after={"rules": rules})
    db.commit()
    return {"rules": rules}
