from __future__ import annotations

import os
from uuid import uuid4

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .constants import GOD_USERNAME, GOD_ROLE, optional_secret_for_nonprod
from .models import PersonModel, UserModel
from .security import hash_password


def _ensure_personnel_sztsz_schema(db: Session) -> None:
    columns = {row[1] for row in db.execute(text("PRAGMA table_info(personnel)")).fetchall()}
    if "sztsz" not in columns:
        db.execute(text("ALTER TABLE personnel ADD COLUMN sztsz TEXT"))

    rows = db.execute(text("SELECT id, sztsz FROM personnel ORDER BY id")).fetchall()
    used: set[str] = set()
    next_value = 10000000

    for person_id, sztsz in rows:
        normalized = str(sztsz).strip() if sztsz is not None else ""
        valid = len(normalized) == 8 and normalized.isdigit() and normalized not in used
        if valid:
            used.add(normalized)
            continue
        while True:
            candidate = f"{next_value:08d}"
            next_value += 1
            if candidate not in used:
                break
        used.add(candidate)
        db.execute(text("UPDATE personnel SET sztsz = :sztsz WHERE id = :id"), {"sztsz": candidate, "id": person_id})

    db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_personnel_sztsz ON personnel(sztsz)"))
    db.commit()


def _upsert_access_user(
    db: Session,
    *,
    username: str,
    display_name: str,
    role: str,
    password: str,
    protected: bool,
) -> None:
    user_exists = db.scalar(select(UserModel).where(UserModel.username == username)) is not None
    values = {
        "username": username,
        "display_name": display_name,
        "role": role,
        "password_hash": hash_password(password),
        "protected": 1 if protected else 0,
    }
    if not user_exists:
        db.execute(
            text(
                """
                INSERT INTO users (id, username, password_hash, display_name, role, active, protected, created_at)
                VALUES (:id, :username, :password_hash, :display_name, :role, 1, :protected, CURRENT_TIMESTAMP)
                """
            ),
            {"id": uuid4().hex, **values},
        )
        return

    db.execute(
        text(
            """
            UPDATE users
            SET password_hash = :password_hash,
                display_name = :display_name,
                role = :role,
                active = 1,
                protected = :protected
            WHERE username = :username
            """
        ),
        values,
    )


def _ensure_default_access_users(db: Session) -> None:
    admin_pwd = optional_secret_for_nonprod("BACKEND_ADMIN_PASSWORD", "AdminTeszt_2026_Aa@1")
    reader_pwd = optional_secret_for_nonprod("BACKEND_READER_PASSWORD", "OlvasoTeszt_2026_Aa@1")
    editor_pwd = optional_secret_for_nonprod("BACKEND_EDITOR_PASSWORD", "SzerkesztoTeszt_2026_Aa@1")

    _upsert_access_user(db, username="admin", display_name="Rendszer Admin", role="admin", password=admin_pwd, protected=False)
    _upsert_access_user(db, username="olvaso", display_name="Teszt Olvaso", role="reader", password=reader_pwd, protected=False)
    _upsert_access_user(db, username="szerkeszto", display_name="Teszt Szerkeszto", role="editor", password=editor_pwd, protected=False)
    db.commit()


def _enforce_single_god_user(db: Session) -> None:
    god_user = db.scalar(select(UserModel).where(UserModel.username == GOD_USERNAME))
    if not god_user:
        dev_pwd = os.getenv("BACKEND_DEV_MASTER_PASSWORD", "").strip()
        if not dev_pwd:
            raise RuntimeError("Hiányzó BACKEND_DEV_MASTER_PASSWORD a dev_master létrehozásához")
        db.execute(
            text(
                """
                INSERT INTO users (id, username, password_hash, display_name, role, active, protected, created_at)
                VALUES (:id, :username, :password_hash, :display_name, :role, 1, 1, CURRENT_TIMESTAMP)
                """
            ),
            {
                "id": uuid4().hex,
                "username": GOD_USERNAME,
                "password_hash": hash_password(dev_pwd),
                "display_name": "Fejlesztő Mester",
                "role": GOD_ROLE,
            },
        )

    db.execute(
        text(
            """
            UPDATE users
            SET display_name = 'Fejlesztő Mester',
                role = :role,
                active = 1,
                protected = 1
            WHERE username = :username
            """
        ),
        {"role": GOD_ROLE, "username": GOD_USERNAME},
    )

    db.execute(
        text(
            """
            UPDATE users
            SET role = 'admin',
                protected = 0
            WHERE role = :role
              AND username <> :username
            """
        ),
        {"role": GOD_ROLE, "username": GOD_USERNAME},
    )

    db.commit()


def _ensure_extended_schema(db: Session) -> None:
    personnel_cols = {row[1] for row in db.execute(text("PRAGMA table_info(personnel)")).fetchall()}
    if "qualifications" not in personnel_cols:
        db.execute(text("ALTER TABLE personnel ADD COLUMN qualifications JSON"))
    if "beosztas" not in personnel_cols:
        db.execute(text("ALTER TABLE personnel ADD COLUMN beosztas TEXT"))

    trainings_cols = {row[1] for row in db.execute(text("PRAGMA table_info(trainings)")).fetchall()}
    if "qualification_id" not in trainings_cols:
        db.execute(text("ALTER TABLE trainings ADD COLUMN qualification_id TEXT"))

    duties_cols = {row[1] for row in db.execute(text("PRAGMA table_info(duties)")).fetchall()}
    if "assigned" not in duties_cols:
        db.execute(text("ALTER TABLE duties ADD COLUMN assigned JSON"))

    log_cols = {row[1] for row in db.execute(text("PRAGMA table_info(activity_logs)")).fetchall()}
    if "payload" not in log_cols:
        db.execute(text("ALTER TABLE activity_logs ADD COLUMN payload JSON"))

    db.execute(text("UPDATE personnel SET qualifications = '[]' WHERE qualifications IS NULL"))
    db.execute(text("UPDATE personnel SET beosztas = '' WHERE beosztas IS NULL"))
    db.execute(text("UPDATE trainings SET qualification_id = '' WHERE qualification_id IS NULL"))
    db.execute(text("UPDATE duties SET assigned = '[]' WHERE assigned IS NULL"))
    db.commit()