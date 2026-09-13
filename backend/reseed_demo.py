r"""Demó-adatbázis újratöltése a tervezett felépítéssel (3 zászlóalj + ezredtörzs).
MINDENT töröl és újratölt — csak fejlesztői/demó gépen!

Futtatás (a backend mappából):
    $env:BACKEND_ADMIN_PASSWORD='Admin123'; $env:BACKEND_DEV_MASTER_PASSWORD='Malnas123'
    ..\.venv\Scripts\python.exe reseed_demo.py
"""
from __future__ import annotations

import os
import shutil
from datetime import datetime

from app.db import DB_PATH, Base, SessionLocal, engine
from app.migrate import run_all
from app.seed_demo import reseed_demo_database
from app.startup import _ensure_extended_schema, _ensure_personnel_sztsz_schema

os.environ.setdefault("BACKEND_ADMIN_PASSWORD", "Admin123")
os.environ.setdefault("BACKEND_DEV_MASTER_PASSWORD", "Malnas123")


def main() -> None:
    if DB_PATH.exists():
        backup = DB_PATH.with_name(f"{DB_PATH.stem}.pre-demo-{datetime.now():%Y%m%d-%H%M%S}.bak")
        shutil.copy2(DB_PATH, backup)
        print(f"Mentés: {backup}")
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        _ensure_personnel_sztsz_schema(db)
        _ensure_extended_schema(db)
        run_all(db)
        counts = reseed_demo_database(db)
    print("Demó-adatbázis kész:", counts)
    print("Belépés: admin/Admin123 · ficzay/Ficzay1234 · toth/Toth1234 · rogel/Rogel1234 (31. TVZ) · kiss/Kiss1234 (83. TVZ) · csore/Csore1234 (19. TVZ)")


if __name__ == "__main__":
    main()
