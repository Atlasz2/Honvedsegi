"""Karbantartási és diagnosztikai műveletek — kizárólag a god-szint hívja.

Ez a god-fiók extra jogosultságainak üzleti rétege: rendszerállapot, munkamenet-
és zárolás-kezelés. Az adminnak ezek nem elérhetők (a router GodUser őrrel gátol).
Offline, egygépes üzemre szabva: minden adat a helyi adatbázisból és a mentés-
könyvtárból jön, külső hívás nincs.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..core.auth import purge_expired_sessions
from ..core.time import PROCESS_STARTED_AT, as_utc, utc_now
from ..backup import list_backups
from ..db import DB_PATH
from ..models import LoginAttemptModel, SessionTokenModel, UserModel


def _db_file_bytes() -> int:
    total = 0
    for suffix in ("", "-wal", "-shm"):
        path = Path(str(DB_PATH) + suffix)
        if path.exists():
            total += path.stat().st_size
    return total


def _last_backup() -> dict[str, object] | None:
    backup_dir = DB_PATH.parent / "backups"
    if not backup_dir.exists():
        return None
    backups = sorted(backup_dir.glob("guard_*.db"))
    if not backups:
        return None
    newest = backups[-1]
    stat = newest.stat()
    return {
        "name": newest.name,
        "sizeBytes": stat.st_size,
        "modifiedAt": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(),
        "count": len(backups),
    }


def system_status(db: Session) -> dict[str, object]:
    """Egyszerű, laikusnak is olvasható rendszerkép a god-fiók számára."""
    now = utc_now()
    role_counts = dict(
        db.execute(select(UserModel.role, func.count()).group_by(UserModel.role)).all()
    )
    active_sessions = db.scalar(
        select(func.count()).select_from(SessionTokenModel).where(SessionTokenModel.expires_at >= now)
    ) or 0
    expired_sessions = db.scalar(
        select(func.count()).select_from(SessionTokenModel).where(SessionTokenModel.expires_at < now)
    ) or 0
    locked_accounts = db.scalar(
        select(func.count()).select_from(LoginAttemptModel).where(LoginAttemptModel.locked_until > now)
    ) or 0

    # Aktív felhasználó: akinek van élő munkamenete (több gépről is egynek számít).
    active_users = db.scalar(
        select(func.count(func.distinct(SessionTokenModel.user_id))).where(SessionTokenModel.expires_at >= now)
    ) or 0
    uptime_seconds = int((now - PROCESS_STARTED_AT).total_seconds())
    return {
        "time": now.isoformat(),
        "startedAt": PROCESS_STARTED_AT.isoformat(),
        "uptimeSeconds": uptime_seconds,
        "database": {"path": str(DB_PATH), "sizeBytes": _db_file_bytes()},
        "lastBackup": _last_backup(),
        "backups": list_backups()[:10],
        "sessions": {"active": int(active_sessions), "expired": int(expired_sessions), "activeUsers": int(active_users)},
        "users": {"byRole": {role: int(count) for role, count in role_counts.items()}},
        "lockedAccounts": int(locked_accounts),
    }


def purge_expired_sessions_now(db: Session) -> dict[str, int]:
    return {"removed": purge_expired_sessions(db)}


def force_logout_user(db: Session, username: str) -> dict[str, int]:
    """Egy felhasználó összes munkamenetének azonnali megszüntetése."""
    user = db.scalar(select(UserModel).where(UserModel.username == username))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Felhasználó nem található")
    result = db.execute(delete(SessionTokenModel).where(SessionTokenModel.user_id == user.id))
    db.commit()
    return {"revoked": result.rowcount or 0}


def unlock_account(db: Session, username: str) -> dict[str, str]:
    """Egy bejelentkezési zárolás feloldása (5 hibás próbálkozás után lép életbe)."""
    attempt = db.scalar(select(LoginAttemptModel).where(LoginAttemptModel.username == username))
    if attempt is None or not attempt.locked_until or as_utc(attempt.locked_until) <= utc_now():
        return {"status": "nem volt zárolva"}
    attempt.failed_count = 0
    attempt.locked_until = None
    db.commit()
    return {"status": "feloldva"}
