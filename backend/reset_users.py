"""Teszt-fiókok újraépítése: kisöpri az összes felhasználót, és a négy
alapfiókot hozza létre a fejlesztés közbeni egyszerű jelszavakkal.

Futtatás a backend/ könyvtárból:
    ../.venv/Scripts/python.exe reset_users.py

    admin       / Admin123        (admin)
    olvaso      / olvaso123       (olvasó)
    szerkeszto  / szerkeszto123   (szerkesztő)
    devmaster   / Malnas123       (alkotó — az admin nem látja)

Kiadás előtt ezeket törölni kell, mindenki saját fiókot kap. A munkameneteket
is törli, hogy senki ne maradjon bejelentkezve régi fiókkal.
"""
from __future__ import annotations

from sqlalchemy import delete

from app.core.privileged import god_username
from app.db import SessionLocal
from app.models import SessionTokenModel, UserModel
from app.security import hash_password

ACCOUNTS = [
    ("admin", "Admin123", "Rendszer Admin", "admin", False),
    ("olvaso", "olvaso123", "Teszt Olvasó", "reader", False),
    ("szerkeszto", "szerkeszto123", "Teszt Szerkesztő", "editor", False),
    (god_username(), "Malnas123", "Alkotó", "fejleszto", True),
]


def main() -> int:
    with SessionLocal() as db:
        db.execute(delete(SessionTokenModel))
        removed = db.execute(delete(UserModel)).rowcount
        for username, password, display_name, role, protected in ACCOUNTS:
            db.add(UserModel(username=username, password_hash=hash_password(password),
                             display_name=display_name, role=role, active=True, protected=protected))
        db.commit()
    print(f"Törölve: {removed} fiók. Létrehozva: {', '.join(a[0] for a in ACCOUNTS)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
