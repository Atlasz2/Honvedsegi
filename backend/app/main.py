from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from .constants import BACKEND_ENV, IS_PRODUCTION
from .core.auth import purge_expired_sessions
from .db import Base, SessionLocal, engine, get_db
from .core.time import utc_now
from .seed import seed_database
from .migrate import run_all as run_migrations
from .startup import _enforce_single_god_user, _ensure_personnel_sztsz_schema, _ensure_extended_schema
from .static_serving import mount_frontend

from .routers import (
    activity_log, alerts, announcements, attendance, auth, availability, campaign, conflicts, documents, equipment,
    events, exercises, imports, leave, maintenance, operations, orders, personnel, prerequisites,
    qualifications, reference, reports, search, series, settings, supplies, todos, users, vehicles,
)


def _required_env_csv(name: str) -> list[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        raise RuntimeError(f"Hiányzó kötelező környezeti változó: {name}")
    items = [item.strip() for item in raw.split(",") if item.strip()]
    if not items:
        raise RuntimeError(f"Üres kötelező környezeti változó: {name}")
    return items


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Indulás: táblák → HIÁNYZÓ OSZLOPOK pótlása → seed → migrációk.
    # A séma-kiegészítés a seed ELŐTT fut: a seed az ORM-en át olvas, ami már az
    # új oszlopokat kéri — régi adatbázison különben az első lekérdezésnél elhasal.
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        _ensure_personnel_sztsz_schema(db)
        _ensure_extended_schema(db)
        seed_database(db)
        _enforce_single_god_user(db)
        run_migrations(db)
        purge_expired_sessions(db)
    yield


app = FastAPI(
    title="Guard Guard Duty API",
    version="1.0.0",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
    lifespan=lifespan,
)

# ── Middleware ─────────────────────────────────────────────────────────────

if IS_PRODUCTION:
    ALLOWED_ORIGINS = _required_env_csv("BACKEND_ALLOWED_ORIGINS")
    ALLOWED_HOSTS   = _required_env_csv("BACKEND_ALLOWED_HOSTS")
else:
    _raw_origins = os.getenv(
        "BACKEND_ALLOWED_ORIGINS",
        "http://localhost:8080,http://127.0.0.1:8080,http://localhost:8081,http://127.0.0.1:8081",
    )
    ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]
    _raw_hosts = os.getenv("BACKEND_ALLOWED_HOSTS", "localhost,127.0.0.1")
    ALLOWED_HOSTS   = [h.strip() for h in _raw_hosts.split(",") if h.strip()]

app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)
# Tömörítés: a nagy listák (állomány, riasztások) a belső hálón is töredékére csökkennek.
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # API responses carry sensitive data and must never be cached. Static frontend
    # assets manage their own caching policy in SPAStaticFiles (see static_serving).
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response

# ── Routers ────────────────────────────────────────────────────────────────

for _router_module in (
    auth, users, personnel, attendance, leave, exercises, events,
    operations, equipment, supplies, vehicles,
    announcements, activity_log, qualifications, prerequisites, reference, reports, series, imports, conflicts, availability, alerts, documents, maintenance, campaign, orders, search, todos, settings,
):
    app.include_router(_router_module.router)

# ── Változás-jelzés ──────────────────────────────────────────────────────────

from .core.dependencies import Reader as _Reader  # noqa: E402
from .db import data_version  # noqa: E402


@app.get("/api/changes")
def changes(_: _Reader):
    """Az adat-verzió: a felület csak akkor tölt újra, ha ez nőtt."""
    return {"version": data_version()}


# ── Health ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Adatbázis nem elérhető: {exc}") from exc
    return {"status": "ok", "environment": BACKEND_ENV, "time": utc_now().isoformat()}

# ── Frontend ───────────────────────────────────────────────────────────────
# Mounted last so the API routes above take precedence over the SPA catch-all.

mount_frontend(app)
