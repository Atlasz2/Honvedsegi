"""Napló-archiválás: a napló (activity_logs) a leggyorsabban növő tábla
(~0,5–2 MB/nap). A 12 hónapnál régebbi sorok havi bontásban külön SQLite-
fájlba kerülnek (data/archive/activity_logs_ÉÉÉÉ-HH.sqlite), a fő
adatbázisból törlődnek — így az évekig 100 MB alatt marad, a régi napló
pedig megmarad, olvasható (bármely SQLite-eszközzel).

Indulás után automatikusan, 30 naponta fut (app_settings: last_log_archive);
kézzel: `python -m app.archive`.
"""
from __future__ import annotations

import sqlite3
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from .db import DB_PATH
from .models import ActivityLogModel, AppSettingModel

ARCHIVE_DIR = DB_PATH.parent / "archive"
KEEP_MONTHS = 12
AUTO_EVERY_DAYS = 30
_LAST_KEY = "last_log_archive"

_DDL = """CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY, timestamp TEXT, user_id TEXT, user_name TEXT, user_role TEXT,
    action TEXT, module TEXT, record_name TEXT, payload TEXT)"""


def archive_old_logs(db: Session, keep_months: int = KEEP_MONTHS, today: date | None = None) -> dict[str, object]:
    today = today or date.today()
    cutoff = (today.replace(day=1) - timedelta(days=keep_months * 30)).replace(day=1)
    rows = db.execute(text(
        "SELECT id, timestamp, user_id, user_name, user_role, action, module, record_name, payload "
        "FROM activity_logs WHERE substr(timestamp,1,10) < :cutoff ORDER BY timestamp"
    ), {"cutoff": cutoff.isoformat()}).fetchall()
    if not rows:
        _mark(db, today)
        return {"archived": 0, "files": [], "cutoff": cutoff.isoformat()}
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    by_month: dict[str, list] = {}
    for r in rows:
        by_month.setdefault(str(r[1])[:7], []).append(tuple(str(v) if v is not None else None for v in r))
    files = []
    for month, chunk in sorted(by_month.items()):
        path = ARCHIVE_DIR / f"activity_logs_{month}.sqlite"
        conn = sqlite3.connect(path)
        try:
            conn.execute(_DDL)
            conn.executemany("INSERT OR REPLACE INTO activity_logs VALUES (?,?,?,?,?,?,?,?,?)", chunk)
            conn.commit()
        finally:
            conn.close()
        files.append(path.name)
    ids = [r[0] for r in rows]
    for i in range(0, len(ids), 500):
        db.execute(delete(ActivityLogModel).where(ActivityLogModel.id.in_(ids[i:i + 500])))
    _mark(db, today)
    db.commit()
    return {"archived": len(rows), "files": files, "cutoff": cutoff.isoformat()}


def _mark(db: Session, today: date) -> None:
    row = db.get(AppSettingModel, _LAST_KEY)
    if row is None:
        db.add(AppSettingModel(key=_LAST_KEY, value=today.isoformat()))
    else:
        row.value = today.isoformat()
    db.commit()


def archive_if_due(db: Session) -> dict[str, object] | None:
    """Induláskor: ha 30 napnál régebbi az utolsó archiválás (vagy nem volt), fut."""
    row = db.get(AppSettingModel, _LAST_KEY)
    if row is not None:
        try:
            if (date.today() - date.fromisoformat(row.value)).days < AUTO_EVERY_DAYS:
                return None
        except ValueError:
            pass
    return archive_old_logs(db)


def archive_status(db: Session) -> dict[str, object]:
    row = db.get(AppSettingModel, _LAST_KEY)
    total = db.scalar(select(func.count()).select_from(ActivityLogModel)) or 0
    files = sorted(p.name for p in ARCHIVE_DIR.glob("activity_logs_*.sqlite")) if ARCHIVE_DIR.exists() else []
    return {"lastRun": row.value if row else None, "logRows": int(total), "keepMonths": KEEP_MONTHS, "archiveFiles": files, "archiveDir": str(ARCHIVE_DIR)}


def main() -> int:
    from .db import SessionLocal
    with SessionLocal() as db:
        result = archive_old_logs(db)
    print(f"Archiválva: {result['archived']} naplósor → {', '.join(result['files']) or 'nincs új fájl'} (határ: {result['cutoff']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
