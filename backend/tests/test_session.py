"""Munkamenet-kezelés: valódi lejárat, csúszó hosszabbítás, takarítás."""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select

from app.constants import SESSION_HOURS, SESSION_SLIDE_BELOW_HOURS
from app.core.auth import purge_expired_sessions
from app.core.time import as_utc, utc_now
from app.db import SessionLocal
from app.models import SessionTokenModel
from app.security import fingerprint_token


def _login(client) -> str:
    response = client.post("/api/auth/login", json={"username": "admin", "password": "AdminTeszt_2026!"})
    assert response.status_code == 200, response.text
    return response.json()["token"]


def _stored(token: str) -> SessionTokenModel | None:
    with SessionLocal() as db:
        return db.scalar(select(SessionTokenModel).where(SessionTokenModel.token == fingerprint_token(token)))


def test_me_returns_the_stored_expiry_not_a_freshly_computed_one(client):
    """Korábban a /me mindig 'most + 8 óra'-t adott vissza, függetlenül a tárolt
    lejárattól — vagyis a kliens hamis időpontra alapozott volna."""
    token = _login(client)
    headers = {"Authorization": f"Bearer {token}"}

    # A tárolt lejáratot hátrébb húzzuk, de még érvényes tartományba.
    shifted = utc_now() + timedelta(hours=SESSION_SLIDE_BELOW_HOURS + 2)
    with SessionLocal() as db:
        row = db.scalar(select(SessionTokenModel).where(SessionTokenModel.token == fingerprint_token(token)))
        row.expires_at = shifted
        db.commit()

    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200, response.text

    reported = response.json()["expiry"] / 1000
    assert abs(reported - shifted.timestamp()) < 5, "a /me a tárolt lejáratot adja vissza"


def test_session_slides_when_close_to_expiry(client):
    token = _login(client)
    headers = {"Authorization": f"Bearer {token}"}

    almost_over = utc_now() + timedelta(minutes=5)
    with SessionLocal() as db:
        row = db.scalar(select(SessionTokenModel).where(SessionTokenModel.token == fingerprint_token(token)))
        row.expires_at = almost_over
        db.commit()

    assert client.get("/api/auth/me", headers=headers).status_code == 200

    refreshed = as_utc(_stored(token).expires_at)
    assert refreshed > almost_over + timedelta(hours=1), "aktivitásra meghosszabbodik"
    assert refreshed <= utc_now() + timedelta(hours=SESSION_HOURS, minutes=1)


def test_session_does_not_slide_while_plenty_of_time_remains(client):
    """Nem írunk adatbázist minden kérésnél — csak amikor tényleg fogytán az idő."""
    token = _login(client)
    headers = {"Authorization": f"Bearer {token}"}

    before = as_utc(_stored(token).expires_at)
    assert client.get("/api/auth/me", headers=headers).status_code == 200

    assert as_utc(_stored(token).expires_at) == before


def test_expired_session_is_rejected_and_removed(client):
    token = _login(client)
    headers = {"Authorization": f"Bearer {token}"}

    with SessionLocal() as db:
        row = db.scalar(select(SessionTokenModel).where(SessionTokenModel.token == fingerprint_token(token)))
        row.expires_at = utc_now() - timedelta(minutes=1)
        db.commit()

    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert _stored(token) is None


def test_purge_removes_only_expired_tokens(client):
    live_token = _login(client)
    dead_token = _login(client)

    with SessionLocal() as db:
        row = db.scalar(select(SessionTokenModel).where(SessionTokenModel.token == fingerprint_token(dead_token)))
        row.expires_at = utc_now() - timedelta(hours=1)
        db.commit()

        removed = purge_expired_sessions(db)

    assert removed >= 1
    assert _stored(dead_token) is None
    assert _stored(live_token) is not None
