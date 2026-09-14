"""Adatbázis-mentés és visszaállítás-próba.

A mentés a SQLite online backup API-val készül (nem fájlmásolás): WAL mód
mellett is konzisztens pillanatkép, futó szerver alatt is. Minden mentés után
visszaállítás-próba: a másolatot megnyitjuk, integritás-ellenőrzés és a fő
táblák darabszáma — egy mentés csak akkor „jó", ha vissza is tölthető.

Ugyanezt hívja a „Mentés most" gomb (Alkotó), az ütemezett feladat
(`python -m app.backup`) és a PowerShell script.
"""
from __future__ import annotations

import os
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

from .db import DB_PATH

BACKUP_DIR = DB_PATH.parent / "backups"
KEEP_LAST = 30
# Második példány MÁSIK gépre/meghajtóra (hálózati mappa is lehet): ha a központi
# gép lemeze elmegy, ez marad. Üres = nincs tükör (a Beállítások figyelmeztet rá).
MIRROR_DIR = Path(os.getenv("BACKEND_BACKUP_MIRROR", "").strip()) if os.getenv("BACKEND_BACKUP_MIRROR", "").strip() else None
# Ennél régebbi utolsó mentés = figyelmeztetés a Beállításokban és a Teendőimben.
STALE_AFTER_HOURS = 36
LOW_DISK_BYTES = 2 * 1024 ** 3
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
        return {"ok": False, "file": None, "verification": verification, "removedOld": 0, "mirror": None}
    return {
        "ok": True,
        "file": target.name,
        "sizeBytes": target.stat().st_size,
        "createdAt": datetime.now().astimezone().isoformat(),
        "verification": verification,
        "removedOld": _prune(),
        "mirror": _mirror(target),
    }


def _mirror(target: Path) -> dict[str, object] | None:
    """A kész, ellenőrzött mentés másolata a tükör-mappába. A tükör hibája nem
    dönti el a fő mentést — de a státuszban látszik, hogy nem sikerült."""
    if MIRROR_DIR is None:
        return None
    try:
        MIRROR_DIR.mkdir(parents=True, exist_ok=True)
        copied = MIRROR_DIR / target.name
        shutil.copy2(target, copied)
        if not _verify(copied)["ok"]:
            copied.unlink(missing_ok=True)
            return {"ok": False, "path": str(MIRROR_DIR), "error": "a tükör-másolat nem ment át az ellenőrzésen"}
        old = sorted(MIRROR_DIR.glob("guard_*.db"))
        for stale in old[:-KEEP_LAST] if len(old) > KEEP_LAST else []:
            stale.unlink(missing_ok=True)
        return {"ok": True, "path": str(copied)}
    except OSError as exc:
        return {"ok": False, "path": str(MIRROR_DIR), "error": str(exc)}


def backup_status() -> dict[str, object]:
    """Az adminnak: mikor volt az utolsó jó mentés, van-e tükör, mennyi a szabad hely.
    Ebből lesz a „2 napja nincs mentés" figyelmeztetés."""
    backups = list_backups()
    latest = backups[0] if backups else None
    age_hours = None
    if latest:
        age_hours = round((datetime.now().astimezone() - datetime.fromisoformat(str(latest["createdAt"]))).total_seconds() / 3600, 1)
    mirror_latest = None
    if MIRROR_DIR is not None and MIRROR_DIR.exists():
        files = sorted(MIRROR_DIR.glob("guard_*.db"), reverse=True)
        if files:
            mirror_latest = datetime.fromtimestamp(files[0].stat().st_mtime).astimezone().isoformat()
    usage = shutil.disk_usage(DB_PATH.parent)
    wal = DB_PATH.with_name(DB_PATH.name + "-wal")
    warnings: list[str] = []
    if latest is None:
        warnings.append("Még nem készült mentés.")
    elif age_hours is not None and age_hours > STALE_AFTER_HOURS:
        warnings.append(f"Az utolsó mentés {age_hours:.0f} órája készült (több mint {STALE_AFTER_HOURS} óra).")
    if MIRROR_DIR is None:
        warnings.append("Nincs beállítva tükör-mappa másik gépre/meghajtóra (BACKEND_BACKUP_MIRROR).")
    elif not MIRROR_DIR.exists():
        warnings.append(f"A tükör-mappa nem érhető el: {MIRROR_DIR}")
    if usage.free < LOW_DISK_BYTES:
        warnings.append(f"Kevés a szabad hely: {usage.free / 1024 ** 3:.1f} GB.")
    return {
        "latest": latest, "ageHours": age_hours, "count": len(backups), "staleAfterHours": STALE_AFTER_HOURS,
        "mirror": {"configured": MIRROR_DIR is not None, "path": str(MIRROR_DIR) if MIRROR_DIR else "", "reachable": bool(MIRROR_DIR and MIRROR_DIR.exists()), "latest": mirror_latest},
        "disk": {"freeBytes": usage.free, "totalBytes": usage.total},
        "database": {"sizeBytes": DB_PATH.stat().st_size if DB_PATH.exists() else 0, "walBytes": wal.stat().st_size if wal.exists() else 0},
        "warnings": warnings,
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
