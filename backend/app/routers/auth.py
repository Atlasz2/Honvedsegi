from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..constants import SESSION_HOURS
from ..db import get_db
from ..deps import (
    _as_utc, _get_current_user, _get_login_attempt, _is_login_locked,
    _register_failed_login, _reset_login_attempt, _user_to_auth_payload, _utc_now,
)
from ..models import SessionTokenModel, UserModel
from ..schemas import AuthUser, LoginRequest, LoginResponse
from ..security import assert_password_strength, fingerprint_token, hash_password, issue_token, needs_rehash, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    normalized_username = (payload.username or "").strip()
    if not normalized_username:
        raise HTTPException(status_code=401, detail="Hibás felhasználónév vagy jelszó")

    attempt = _get_login_attempt(db, normalized_username)
    if _is_login_locked(attempt):
        raise HTTPException(status_code=429, detail="Túl sok hibás próbálkozás. Próbáld újra később.")

    user = db.scalar(select(UserModel).where(UserModel.username == normalized_username))
    if not user or not verify_password(payload.password, user.password_hash):
        _register_failed_login(db, normalized_username)
        raise HTTPException(status_code=401, detail="Hibás felhasználónév vagy jelszó")
    if not user.active:
        raise HTTPException(status_code=403, detail="A felhasználó inaktív")

    if needs_rehash(user.password_hash):
        try:
            assert_password_strength(payload.password)
            user.password_hash = hash_password(payload.password)
        except ValueError:
            pass

    _reset_login_attempt(db, normalized_username)
    expiry = _utc_now() + timedelta(hours=SESSION_HOURS)
    user.last_login = _utc_now()
    token_value = issue_token()
    token_key = fingerprint_token(token_value)
    db.add(SessionTokenModel(token=token_key, user_id=user.id, expires_at=expiry))
    db.commit()
    db.refresh(user)
    return LoginResponse(token=token_value, user=_user_to_auth_payload(user, expiry))


@router.get("/me", response_model=AuthUser)
def me(user: UserModel = Depends(_get_current_user)) -> AuthUser:
    expiry = _utc_now() + timedelta(hours=SESSION_HOURS)
    return _user_to_auth_payload(user, expiry)


@router.post("/logout", status_code=204)
def logout(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
    _: UserModel = Depends(_get_current_user),
):
    token_value = authorization.split(" ", 1)[1].strip()
    token_key = fingerprint_token(token_value)
    session_token = db.scalar(select(SessionTokenModel).where(SessionTokenModel.token == token_key))
    if session_token:
        db.delete(session_token)
        db.commit()
