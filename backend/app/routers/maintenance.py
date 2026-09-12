"""Karbantartási végpontok — kizárólag a god-szint (dev_master) éri el.

Az admin sem látja a hatásukat, sem nem hívhatja őket: a GodUser őr a nem-god
kérésekre ugyanazt a semleges 403-at adja, mint bármely más jogosultsági hiba,
így az sem derül ki, hogy létezik magasabb szint.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..backup import create_backup

from ..core.dependencies import DB, GodUser
from ..services.maintenance import (
    force_logout_user,
    purge_expired_sessions_now,
    system_status,
    unlock_account,
)

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


@router.get("/status")
def get_system_status(db: DB, _: GodUser):
    return system_status(db)


@router.post("/backup")
def backup_now(_: GodUser):
    """Mentés most: konzisztens pillanatkép + visszaállítás-próba."""
    result = create_backup()
    if not result["ok"]:
        raise HTTPException(status_code=500, detail=f"A mentés nem állt át az ellenőrzésen: {result['verification']}")
    return result


@router.post("/sessions/purge")
def purge_sessions(db: DB, _: GodUser):
    return purge_expired_sessions_now(db)


@router.post("/users/{username}/logout")
def force_logout(username: str, db: DB, _: GodUser):
    return force_logout_user(db, username)


@router.post("/users/{username}/unlock")
def unlock(username: str, db: DB, _: GodUser):
    return unlock_account(db, username)
