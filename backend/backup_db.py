"""SQLite biztonsági mentés.

WAL mód mellett is biztonságos: a 'VACUUM INTO' egy konzisztens, tömörített
másolatot készít a futó adatbázisról (a szervert nem kell leállítani).

Futtatás kézzel:
    python backup_db.py

Ütemezve (ajánlott): Windows Feladatütemező, napi indítással ugyanezzel a
paranccsal (a .venv Python-jával), pl. minden hajnalban.
"""
from __future__ import annotations

import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
DEFAULT_DB = ROOT_DIR / "data" / "guard_guard_duty.db"
KEEP_BACKUPS = 30  # ennyi legutóbbi mentést tartunk meg


def _db_path() -> Path:
    override = os.getenv("BACKEND_DB_PATH", "").strip()
    return Path(override).expanduser().resolve() if override else DEFAULT_DB


def _prune_old(backup_dir: Path) -> None:
    backups = sorted(backup_dir.glob("guard_*.db"))
    for old in backups[:-KEEP_BACKUPS]:
        old.unlink(missing_ok=True)


def main() -> int:
    db_path = _db_path()
    if not db_path.exists():
        print(f"Az adatbázis nem található: {db_path}", file=sys.stderr)
        return 1

    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    target = backup_dir / f"guard_{datetime.now():%Y%m%d_%H%M%S}.db"

    # A cél egy SQL-literál (nem köthető paraméter), ezért az aposztrófot escape-eljük.
    safe_target = str(target).replace("'", "''")
    with sqlite3.connect(db_path) as conn:
        conn.execute(f"VACUUM INTO '{safe_target}'")

    _prune_old(backup_dir)
    print(f"Mentés kész: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
