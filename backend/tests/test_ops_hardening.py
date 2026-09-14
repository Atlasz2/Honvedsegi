"""Üzemeltetési biztonság: mentés-állapot, import előtti automatikus mentés, napló-archiválás."""
from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db import SessionLocal
from app.models import ActivityLogModel


def test_backup_status_and_auto_backup_before_import(client, admin_headers):
    before = client.get("/api/settings/health", headers=admin_headers).json()
    assert "backup" in before and "archive" in before and isinstance(before["backup"]["warnings"], list)
    from openpyxl import Workbook
    wb = Workbook(); ws = wb.active
    ws.append(["Név", "SZTSZ", "Rendfokozat", "Alegység", "Státusz"])
    ws.append(["Mentés Miki", "99100001", "honvéd", "31 TVZ", "Aktív"])
    buf = io.BytesIO(); wb.save(buf)
    preview = client.post("/api/import/personnel/preview", files={"file": ("kgir.xlsx", buf.getvalue(), "application/octet-stream")}, headers=admin_headers).json()
    assert client.post(f"/api/import/personnel/confirm/{preview['draftId']}", headers=admin_headers).status_code == 200
    after = client.get("/api/settings/health", headers=admin_headers).json()["backup"]
    assert after["count"] >= 1 and after["latest"] is not None and after["ageHours"] is not None and after["ageHours"] < 1
    assert not any("Még nem készült mentés" in w for w in after["warnings"])
    assert after["disk"]["freeBytes"] > 0 and after["database"]["sizeBytes"] > 0
    # az olvasó nem látja
    reader = client.post("/api/auth/login", json={"username": "olvaso", "password": "olvaso123"}).json()["token"]
    assert client.get("/api/settings/health", headers={"Authorization": f"Bearer {reader}"}).status_code == 403


def test_activity_log_archiving_moves_old_rows(client, admin_headers):
    from app.archive import ARCHIVE_DIR, archive_old_logs, archive_status
    old_ts = datetime.now(timezone.utc) - timedelta(days=500)
    with SessionLocal() as db:
        db.add(ActivityLogModel(id="arch-old-1", timestamp=old_ts, user_id="admin", user_name="A", action="létrehozva", module="Teszt", record_name="régi"))
        db.add(ActivityLogModel(id="arch-new-1", timestamp=datetime.now(timezone.utc), user_id="admin", user_name="A", action="létrehozva", module="Teszt", record_name="új"))
        db.commit()
        result = archive_old_logs(db)
        assert result["archived"] >= 1 and result["files"]
        ids = set(db.scalars(select(ActivityLogModel.id)).all())
        assert "arch-old-1" not in ids and "arch-new-1" in ids
        status = archive_status(db)
        assert status["lastRun"] and status["archiveFiles"]
        # az archív fájl olvasható és tartalmazza a régi sort
        import sqlite3
        path = ARCHIVE_DIR / result["files"][0]
        conn = sqlite3.connect(path)
        assert conn.execute("SELECT COUNT(*) FROM activity_logs WHERE id='arch-old-1'").fetchone()[0] == 1
        conn.close()
        # másodszor nincs mit archiválni
        assert archive_old_logs(db)["archived"] == 0
