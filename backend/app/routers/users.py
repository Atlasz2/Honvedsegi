from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..constants import GOD_USERNAME, GOD_ROLE
from ..db import get_db
from ..deps import _is_god_user, _require_admin, _to_user_read
from ..models import SessionTokenModel, UserModel
from ..schemas import UserCreate, UserRead, UserUpdate
from ..security import assert_password_strength, hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(_require_admin),
) -> list[UserRead]:
    items = db.scalars(select(UserModel).order_by(UserModel.username)).all()
    if not _is_god_user(current_user):
        items = [u for u in items if u.username != GOD_USERNAME and u.role != GOD_ROLE]
    return [_to_user_read(item) for item in items]


@router.post("", response_model=UserRead)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(_require_admin),
) -> UserRead:
    if db.scalar(select(UserModel).where(UserModel.username == payload.username)):
        raise HTTPException(status_code=409, detail="Ez a felhasználónév már foglalt")
    if payload.username == GOD_USERNAME or payload.role == GOD_ROLE:
        raise HTTPException(status_code=403, detail="A dev_master szint kizárólagos és nem osztható ki")
    if current_user.role == "admin" and payload.role == GOD_ROLE:
        raise HTTPException(status_code=403, detail="Admin nem hozhat létre fejlesztő szintű felhasználót")
    assert_password_strength(payload.password)
    user = UserModel(
        username=payload.username,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        role=payload.role,
        active=payload.active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _to_user_read(user)


@router.put("/{username}", response_model=UserRead)
def update_user(
    username: str,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(_require_admin),
) -> UserRead:
    user = db.scalar(select(UserModel).where(UserModel.username == username))
    if not user:
        raise HTTPException(status_code=404, detail="Felhasználó nem található")
    if user.protected:
        raise HTTPException(status_code=403, detail="Védett felhasználó nem módosítható")
    if user.username == GOD_USERNAME or payload.role == GOD_ROLE:
        raise HTTPException(status_code=403, detail="A dev_master szint kizárólagos és nem módosítható")
    if current_user.role == "admin" and (user.role == GOD_ROLE or payload.role == GOD_ROLE):
        raise HTTPException(status_code=403, detail="Admin nem adhat fejlesztő szintet")
    user.display_name = payload.display_name
    user.role = payload.role
    user.active = payload.active
    if payload.password:
        assert_password_strength(payload.password)
        user.password_hash = hash_password(payload.password)
    db.commit()
    db.refresh(user)
    return _to_user_read(user)


@router.delete("/{username}", status_code=204)
def delete_user(
    username: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(_require_admin),
):
    user = db.scalar(select(UserModel).where(UserModel.username == username))
    if not user:
        raise HTTPException(status_code=404, detail="Felhasználó nem található")
    if user.protected or user.username == GOD_USERNAME or user.role == GOD_ROLE:
        raise HTTPException(status_code=403, detail="A dev_master felhasználó nem törölhető")
    if current_user.role == "admin" and user.role == GOD_ROLE:
        raise HTTPException(status_code=403, detail="Admin nem törölhet fejlesztő szintű felhasználót")
    db.query(SessionTokenModel).filter(SessionTokenModel.user_id == user.id).delete()
    db.delete(user)
    db.commit()
