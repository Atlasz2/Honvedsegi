"""Hitelesítés: munkamenet-ellenőrzés, jogosultsági szintek, login-korlátozás."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..constants import (
    GOD_ROLE, GOD_USERNAME, LOCKOUT_MINUTES, MAX_FAILED_LOGINS,
    SESSION_HOURS, SESSION_SLIDE_BELOW_HOURS,
)
from ..db import get_db
from ..models import LoginAttemptModel, SessionTokenModel, UserModel
from ..schemas import AuthUser, UserRead
from ..security import fingerprint_token
from .time import as_utc, utc_now

def get_login_attempt(db: Session, username: str) -> LoginAttemptModel:
    attempt = db.scalar(select(LoginAttemptModel).where(LoginAttemptModel.username == username))
    if not attempt:
        attempt = LoginAttemptModel(username=username, failed_count=0)
        db.add(attempt)
        db.flush()
    return attempt


def is_login_locked(attempt: LoginAttemptModel) -> bool:
    return bool(attempt.locked_until and as_utc(attempt.locked_until) > utc_now())


def register_failed_login(db: Session, username: str) -> None:
    attempt = get_login_attempt(db, username)
    attempt.failed_count = int(attempt.failed_count or 0) + 1
    attempt.last_failed_at = utc_now()
    if attempt.failed_count >= MAX_FAILED_LOGINS:
        attempt.failed_count = 0
        attempt.locked_until = utc_now() + timedelta(minutes=LOCKOUT_MINUTES)
    db.commit()


def reset_login_attempt(db: Session, username: str) -> None:
    attempt = db.scalar(select(LoginAttemptModel).where(LoginAttemptModel.username == username))
    if not attempt:
        return
    attempt.failed_count = 0
    attempt.locked_until = None
    db.commit()

# ── User serialization ────────────────────────────────────────────────────

def user_to_auth_payload(user: UserModel, expiry: datetime) -> AuthUser:
    return AuthUser(
        username=user.username,
        displayName=user.display_name,
        role=user.role,
        expiry=int(expiry.timestamp() * 1000),
    )


def to_user_read(user: UserModel) -> UserRead:
    return UserRead(
        username=user.username,
        display_name=user.display_name,
        role=user.role,
        active=user.active,
        last_login=user.last_login,
    )

# ── FastAPI auth dependencies ─────────────────────────────────────────────

@dataclass(frozen=True)
class AuthenticatedSession:
    """A hitelesített felhasználó ÉS a munkamenet tényleges lejárata.

    A kettő együtt jár: a lejáratot korábban a /me frissen számolta ki, ami nem
    a tárolt értéket adta vissza — vagyis hazudott."""

    user: UserModel
    expires_at: datetime


def purge_expired_sessions(db: Session) -> int:
    """A lejárt munkamenet-tokenek eldobása.

    Enélkül csak használatkor törlődnének, így a tábla korlátlanul nőne."""
    result = db.execute(delete(SessionTokenModel).where(SessionTokenModel.expires_at < utc_now()))
    db.commit()
    return result.rowcount or 0


def get_current_session(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AuthenticatedSession:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bejelentkezés szükséges")
    token_value = authorization.split(" ", 1)[1].strip()
    token_key = fingerprint_token(token_value)
    session_token = db.scalar(select(SessionTokenModel).where(SessionTokenModel.token == token_key))
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Érvénytelen munkamenet")
    if as_utc(session_token.expires_at) < utc_now():
        db.delete(session_token)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Lejárt munkamenet")
    user = db.get(UserModel, session_token.user_id)
    if not user or not user.active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="A felhasználó nem aktív")

    # Csúszó munkamenet: aktív munka közben ne dobja ki az ügyintézőt. Csak akkor
    # írunk, ha tényleg fogytán az idő — így nem lesz DB-írás minden kérésből.
    remaining = as_utc(session_token.expires_at) - utc_now()
    if remaining < timedelta(hours=SESSION_SLIDE_BELOW_HOURS):
        session_token.expires_at = utc_now() + timedelta(hours=SESSION_HOURS)
        db.commit()
        db.refresh(session_token)

    return AuthenticatedSession(user=user, expires_at=as_utc(session_token.expires_at))


def get_current_user(session: AuthenticatedSession = Depends(get_current_session)) -> UserModel:
    return session.user


def require_editor(user: UserModel = Depends(get_current_user)) -> UserModel:
    if user.role not in {"editor", "admin", "fejleszto"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nincs jogosultság a művelethez")
    return user


def require_admin(user: UserModel = Depends(get_current_user)) -> UserModel:
    if user.role not in {"admin", "fejleszto"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin jogosultság szükséges")
    return user


def is_god_user(user: UserModel) -> bool:
    return user.username == GOD_USERNAME and user.role == GOD_ROLE and user.active


def require_god_user(user: UserModel = Depends(get_current_user)) -> UserModel:
    if not is_god_user(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Csak a dev_master jogosult erre a művelethez")
    return user


# Public aliases for Annotated-style dependencies
require_reader = get_current_user
require_editor = require_editor
