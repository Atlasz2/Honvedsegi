"""Közös teszt-beállítások.

Az adatbázis-utat és a kötelező titkokat MÉG az app importja ELŐTT állítjuk be,
hogy a motor egy eldobható teszt-adatbázishoz kötődjön, a seeder pedig megkapja a
szükséges jelszavakat. Az éles adatbázis így soha nem sérül.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

_TEST_DB = Path(tempfile.gettempdir()) / "honved_test.db"
for _suffix in ("", "-wal", "-shm"):
    Path(str(_TEST_DB) + _suffix).unlink(missing_ok=True)

os.environ["BACKEND_DB_PATH"] = str(_TEST_DB)
os.environ.setdefault("BACKEND_ENV", "development")
os.environ.setdefault("BACKEND_ADMIN_PASSWORD", "AdminTeszt_2026!")
os.environ.setdefault("BACKEND_DEV_MASTER_PASSWORD", "DevMaster_2026!")

from fastapi.testclient import TestClient  # noqa: E402  (env beállítás után kell)

from app.main import app  # noqa: E402

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ["BACKEND_ADMIN_PASSWORD"]


@pytest.fixture(scope="session")
def client():
    # base_url=localhost: a TrustedHostMiddleware engedélyezett hosztja (a default
    # 'testserver' helyett). A context manager lefuttatja a startupot (séma + seed).
    with TestClient(app, base_url="http://localhost") as test_client:
        yield test_client


@pytest.fixture(scope="session")
def admin_headers(client):
    response = client.post(
        "/api/auth/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}
