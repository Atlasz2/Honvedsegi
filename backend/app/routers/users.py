from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..audit import record_activity
from ..constants import ORDER_RESPONSIBLES
from ..core.auth import to_user_read
from ..core.dependencies import DB, Admin
from ..core.privileged import assert_role_assignable, assert_user_manageable, filter_visible_users
from ..core.time import utc_now
from ..models import SessionTokenModel, UserModel
from ..schemas import UserCreate, UserRead, UserUpdate
from ..security import WeakPasswordError, assert_password_strength, hash_password

router = APIRouter(prefix="/api/users", tags=["users"])

MODULE = "Felhasználók"


def _user_snapshot(user: UserModel) -> dict:
    """A napló soha nem tartalmaz jelszót vagy hasht — csak a jogosultsági állapotot."""
    return {
        "username": user.username,
        "displayName": user.display_name,
        "department": user.department or "",
        "role": user.role,
        "active": user.active,
    }


@router.get("", response_model=list[UserRead])
def list_users(db: DB, current_user: Admin) -> list[UserRead]:
    items = db.scalars(select(UserModel).order_by(UserModel.username)).all()
    visible = filter_visible_users(items, current_user)
    return [to_user_read(item) for item in visible]


def _check_department(department: str) -> str:
    """Csak ismert részleg (vagy üres) — elgépelt részleghez nem tartozna teendő."""
    value = (department or "").strip()
    if value and value not in ORDER_RESPONSIBLES:
        raise HTTPException(status_code=400, detail=f"Ismeretlen részleg: {value}. Választható: {', '.join(ORDER_RESPONSIBLES)}")
    return value


def _check_password(password: str) -> None:
    """A gyenge jelszó a felhasználó hibája (400), nem a szerveré (500)."""
    try:
        assert_password_strength(password)
    except WeakPasswordError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("", response_model=UserRead)
def create_user(payload: UserCreate, db: DB, current_user: Admin) -> UserRead:
    # A god-fiók az induláskor mindig létezik, ezért a nevével való létrehozás
    # magától „foglalt" ütközésbe fut — nem kell külön kezelni, és nem is szivárog.
    if db.scalar(select(UserModel).where(UserModel.username == payload.username)):
        raise HTTPException(status_code=409, detail="Ez a felhasználónév már foglalt")
    assert_role_assignable(current_user, payload.role)
    _check_password(payload.password)
    user = UserModel(
        username=payload.username,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        role=payload.role,
        active=payload.active,
        department=_check_department(payload.department),
    )
    db.add(user)
    db.flush()
    record_activity(db, current_user, mode="create", module=MODULE, record_name=user.username,
                    entity="user", after=_user_snapshot(user))
    db.commit()
    db.refresh(user)
    return to_user_read(user)


@router.put("/{username}", response_model=UserRead)
def update_user(username: str, payload: UserUpdate, db: DB, current_user: Admin) -> UserRead:
    user = db.scalar(select(UserModel).where(UserModel.username == username))
    if not user:
        raise HTTPException(status_code=404, detail="Felhasználó nem található")
    assert_user_manageable(current_user, user)
    assert_role_assignable(current_user, payload.role)

    before = _user_snapshot(user)
    user.display_name = payload.display_name
    user.role = payload.role
    user.active = payload.active
    user.department = _check_department(payload.department)
    password_changed = bool(payload.password)
    if password_changed:
        _check_password(payload.password)
        user.password_hash = hash_password(payload.password)

    after = _user_snapshot(user)
    if password_changed:
        # A jelszó tartalma nem naplózható, de a tény igen — ez auditnyom.
        before["passwordChangedAt"] = ""
        after["passwordChangedAt"] = utc_now().isoformat()
    record_activity(db, current_user, mode="update", module=MODULE, record_name=user.username,
                    entity="user", before=before, after=after)
    db.commit()
    db.refresh(user)
    return to_user_read(user)


@router.delete("/{username}", status_code=204)
def delete_user(username: str, db: DB, current_user: Admin):
    user = db.scalar(select(UserModel).where(UserModel.username == username))
    if not user:
        raise HTTPException(status_code=404, detail="Felhasználó nem található")
    if user.id == current_user.id:
        raise HTTPException(status_code=403, detail="A saját fiók nem törölhető")
    assert_user_manageable(current_user, user)
    record_activity(db, current_user, mode="delete", module=MODULE, record_name=user.username,
                    entity="user", before=_user_snapshot(user))
    db.query(SessionTokenModel).filter(SessionTokenModel.user_id == user.id).delete()
    db.delete(user)
    db.commit()
