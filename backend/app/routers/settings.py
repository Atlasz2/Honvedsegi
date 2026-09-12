"""Admin-beállítások: riasztási küszöbök olvasása (mindenki) és írása (admin)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..audit import record_activity
from ..core.dependencies import DB, Admin, Reader
from ..settings_store import get_all, set_many

router = APIRouter(prefix="/api/settings", tags=["settings"])


class AlertSettingsUpdate(BaseModel):
    values: dict[str, int]


@router.get("/alerts")
def read_alert_settings(db: DB, _: Reader):
    return {"items": get_all(db)}


@router.put("/alerts")
def write_alert_settings(payload: AlertSettingsUpdate, db: DB, user: Admin):
    try:
        changed = set_many(db, payload.values)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if changed:
        record_activity(db, user, mode="update", module="Beállítások", record_name="Riasztási küszöbök", entity="app_settings",
                        before={k: v[0] for k, v in changed.items()}, after={k: v[1] for k, v in changed.items()})
    db.commit()
    return {"items": get_all(db), "changed": list(changed)}
