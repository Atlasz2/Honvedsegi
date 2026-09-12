from __future__ import annotations

import os

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .constants import GOD_ROLE
from .core.privileged import god_username
from .models import UserModel
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


def _enforce_single_god_user(db: Session) -> None:
    """Garantálja, hogy pontosan egy god-fiók létezzen, minden indításkor.

    Ez teszi „kiírhatatlanná" a szintet: ha törölnék vagy lefokoznák, a
    következő indulás újra létrehozza/megerősíti. A név környezetből jön
    (privileged.god_username), a jelszó a BACKEND_DEV_MASTER_PASSWORD-ból az
    első létrehozáskor. Minden más, tévedésből god-szerepre állított fiókot
    visszafokoz adminná — így a szint valóban kizárólagos."""
    username = god_username()
    god_user = db.scalar(select(UserModel).where(UserModel.username == username))
    if not god_user:
        dev_pwd = os.getenv("BACKEND_DEV_MASTER_PASSWORD", "").strip()
        if not dev_pwd:
            raise RuntimeError("Hiányzó BACKEND_DEV_MASTER_PASSWORD a god-fiók létrehozásához")
        god_user = UserModel(
            username=username,
            password_hash=hash_password(dev_pwd),
            display_name="Fejlesztő Mester",
            role=GOD_ROLE,
            active=True,
            protected=True,
        )
        db.add(god_user)

    god_user.role = GOD_ROLE
    god_user.active = True
    god_user.protected = True

    impostors = db.scalars(
        select(UserModel).where(UserModel.role == GOD_ROLE, UserModel.username != username)
    ).all()
    for user in impostors:
        user.role = "admin"
        user.protected = False

    db.commit()


def _ensure_extended_schema(db: Session) -> None:
    personnel_cols = {row[1] for row in db.execute(text("PRAGMA table_info(personnel)")).fetchall()}
    if "qualifications" not in personnel_cols:
        db.execute(text("ALTER TABLE personnel ADD COLUMN qualifications JSON"))
    if "beosztas" not in personnel_cols:
        db.execute(text("ALTER TABLE personnel ADD COLUMN beosztas TEXT"))
    if "service_type" not in personnel_cols:
        db.execute(text("ALTER TABLE personnel ADD COLUMN service_type TEXT DEFAULT ''"))
    if "extra" not in personnel_cols:
        db.execute(text("ALTER TABLE personnel ADD COLUMN extra JSON"))

    exercises_cols2 = {row[1] for row in db.execute(text("PRAGMA table_info(exercises)")).fetchall()}
    if exercises_cols2 and "organizer" not in exercises_cols2:
        db.execute(text("ALTER TABLE exercises ADD COLUMN organizer TEXT DEFAULT ''"))

    # Parancs-műhely 2. kör: fejezet-szöveg, aláírások, parancsszám.
    for table, columns in (
        ("order_types", {"signers": "JSON"}),
        ("orders", {"number": "TEXT DEFAULT ''", "issuer": "TEXT DEFAULT ''", "issued_date": "TEXT DEFAULT ''", "signatures": "JSON"}),
        ("order_chapters", {"content": "TEXT DEFAULT ''"}),
    ):
        existing = {row[1] for row in db.execute(text(f"PRAGMA table_info({table})")).fetchall()}
        if not existing:
            continue  # a táblát a create_all hozza létre a teljes sémával
        for column, ddl in columns.items():
            if column not in existing:
                db.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))

    # A trainings tábla csak régi adatbázisban van (a v6 migráció olvasztja be a
    # műveletekbe); addig a migráció által olvasott oszlopokat pótoljuk.
    trainings_cols = {row[1] for row in db.execute(text("PRAGMA table_info(trainings)")).fetchall()}
    if trainings_cols and "qualification_id" not in trainings_cols:
        db.execute(text("ALTER TABLE trainings ADD COLUMN qualification_id TEXT"))
    exercises_cols = {row[1] for row in db.execute(text("PRAGMA table_info(exercises)")).fetchall()}
    if "qualification_id" not in exercises_cols:
        db.execute(text("ALTER TABLE exercises ADD COLUMN qualification_id TEXT"))
    for col in ("series_id", "level"):
        if trainings_cols and col not in trainings_cols:
            db.execute(text(f"ALTER TABLE trainings ADD COLUMN {col} TEXT DEFAULT ''"))
        if col not in exercises_cols:
            db.execute(text(f"ALTER TABLE exercises ADD COLUMN {col} TEXT DEFAULT ''"))
    # Művelet-fa: szülő-hivatkozás a meglévő events táblán.
    events_cols = {row[1] for row in db.execute(text("PRAGMA table_info(events)")).fetchall()}
    if "parent_id" not in events_cols:
        db.execute(text("ALTER TABLE events ADD COLUMN parent_id TEXT"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_events_parent_id ON events(parent_id)"))

    duties_cols = {row[1] for row in db.execute(text("PRAGMA table_info(duties)")).fetchall()}
    if "assigned" not in duties_cols:
        db.execute(text("ALTER TABLE duties ADD COLUMN assigned JSON"))

    log_cols = {row[1] for row in db.execute(text("PRAGMA table_info(activity_logs)")).fetchall()}
    if "payload" not in log_cols:
        db.execute(text("ALTER TABLE activity_logs ADD COLUMN payload JSON"))
    if "user_role" not in log_cols:
        db.execute(text("ALTER TABLE activity_logs ADD COLUMN user_role TEXT DEFAULT ''"))
    user_cols = {row[1] for row in db.execute(text("PRAGMA table_info(users)")).fetchall()}
    if user_cols and "department" not in user_cols:
        db.execute(text("ALTER TABLE users ADD COLUMN department TEXT DEFAULT ''"))

    db.execute(text("UPDATE personnel SET qualifications = '[]' WHERE qualifications IS NULL"))
    db.execute(text("UPDATE personnel SET beosztas = '' WHERE beosztas IS NULL"))
    db.execute(text("UPDATE personnel SET service_type = '' WHERE service_type IS NULL"))
    if trainings_cols:
        db.execute(text("UPDATE trainings SET qualification_id = '' WHERE qualification_id IS NULL"))
    db.execute(text("UPDATE duties SET assigned = '[]' WHERE assigned IS NULL"))
    db.commit()
