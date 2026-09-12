"""Adatbázis-mentés és visszaállítás-próba.

A mentés a SQLite online backup API-val készül (nem fájlmásolás): WAL mód
mellett is konzisztens pillanatkép, futó szerver alatt is. Minden mentés után
visszaállítás-próba: a másolatot megnyitjuk, integritás-ellenőrzés és a fő
táblák darabszáma — egy mentés csak akkor „jó", ha vissza is tölthető.

Ugyanezt hívja a „Mentés most" gomb (Alkotó), az ütemezett feladat
(`python -m app.backup`) és a PowerShell script.
"""
from __future__ import annotations

import sqlite3
import sys
from datetime import datetime
from pathlib import Path

from .db import DB_PATH

BACKUP_DIR = DB_PATH.parent / "backups"
KEEP_LAST = 30
_CHECK_TABLES = ("personnel", "exercises", "participants", "personnel_qualifications", "orders", "activity_logs")


def _verify(path: Path) -> dict[str, object]:
    """Visszaállítás-próba: megnyitható, ép, és megvannak a fő táblák."""
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        counts = {}
        for table in _CHECK_TABLES:
            try:
                counts[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            except sqlite3.OperationalError:
                counts[table] = None
        return {"ok": integrity == "ok" and counts.get("personnel") is not None, "integrity": integrity, "counts": counts}
    finally:
        conn.close()


def _prune() -> int:
    backups = sorted(BACKUP_DIR.glob("guard_*.db"))
    removed = 0
    for old in backups[:-KEEP_LAST] if len(backups) > KEEP_LAST else []:
        old.unlink(missing_ok=True)
        removed += 1
    return removed


def create_backup() -> dict[str, object]:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target = BACKUP_DIR / f"guard_{stamp}.db"
    source = sqlite3.connect(str(DB_PATH))
    dest = sqlite3.connect(str(target))
    try:
        source.backup(dest)
        # Egy fájl legyen a mentés (ne WAL + shm mellékfájlokkal).
        dest.execute("PRAGMA journal_mode=DELETE")
    finally:
        dest.close()
        source.close()
    verification = _verify(target)
    if not verification["ok"]:
        target.rename(target.with_suffix(".db.SERULT"))
        return {"ok": False, "file": None, "verification": verification, "removedOld": 0}
    return {
        "ok": True,
        "file": target.name,
        "sizeBytes": target.stat().st_size,
        "createdAt": datetime.now().astimezone().isoformat(),
        "verification": verification,
        "removedOld": _prune(),
    }


def list_backups() -> list[dict[str, object]]:
    if not BACKUP_DIR.exists():
        return []
    items = []
    for path in sorted(BACKUP_DIR.glob("guard_*.db"), reverse=True):
        stat = path.stat()
        items.append({"name": path.name, "sizeBytes": stat.st_size,
                      "createdAt": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat()})
    return items


def main() -> int:
    result = create_backup()
    if result["ok"]:
        counts = result["verification"]["counts"]
        print(f"Mentés kész: {result['file']} ({result['sizeBytes'] // 1024} KB), ellenőrizve: személyek={counts.get('personnel')}, régi törölve={result['removedOld']}")
        return 0
    print(f"HIBA: a mentés nem állt át az ellenőrzésen: {result['verification']}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
