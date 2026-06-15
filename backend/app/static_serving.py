from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope


# The Vite build output (`npm run build`) lives at <repo_root>/dist, one level
# above the backend package. Overridable so the central machine can keep the
# frontend wherever it likes without code changes.
def _frontend_dir() -> Path:
    override = os.getenv("BACKEND_FRONTEND_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return Path(__file__).resolve().parents[2] / "dist"


# Vite fingerprints everything under /assets with a content hash, so those URLs
# never point at changed content and can be cached forever. index.html and the
# other root files (favicon, logo, ...) are not fingerprinted and must always be
# revalidated, otherwise clients would keep loading a stale build after a deploy.
_IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
_REVALIDATE_CACHE = "no-cache"

# Paths that must never silently fall back to index.html: a missing API route
# should return a real 404 (not the SPA shell), and a missing fingerprinted
# asset signals a broken build that we want to surface rather than mask.
_NO_FALLBACK_PREFIXES = ("api/", "assets/")


def _as_url_path(fs_path: str) -> str:
    """StaticFiles normalises the request path with os.sep, which is a backslash
    on Windows (e.g. ``assets\\app.js``). Compare prefixes against a forward-slash
    URL path so the routing logic behaves the same on Windows and POSIX."""
    return fs_path.replace("\\", "/")


class SPAStaticFiles(StaticFiles):
    """Serve the built single-page app.

    Unknown client-side routes (e.g. /personnel) have no matching file on disk,
    so they fall back to index.html and let react-router resolve them. Caching
    headers are set per resource type — see the module-level constants.
    """

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await self._response_with_spa_fallback(path, scope)
        self._apply_cache_policy(path, response)
        return response

    async def _response_with_spa_fallback(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or _as_url_path(path).startswith(_NO_FALLBACK_PREFIXES):
                raise
            return await super().get_response("index.html", scope)

    @staticmethod
    def _apply_cache_policy(path: str, response: Response) -> None:
        is_fingerprinted = _as_url_path(path).startswith("assets/") and response.status_code == 200
        response.headers["Cache-Control"] = _IMMUTABLE_CACHE if is_fingerprinted else _REVALIDATE_CACHE


def mount_frontend(app: FastAPI) -> None:
    """Serve the built frontend from the same origin as the API.

    Mounted at "/" as a catch-all, so it must be called after every API router
    is registered. No-op when the build is missing (e.g. backend-only work with
    the Vite dev server), keeping the API usable without a dist/ folder.
    """
    frontend_dir = _frontend_dir()
    if not (frontend_dir / "index.html").is_file():
        return
    app.mount("/", SPAStaticFiles(directory=frontend_dir, html=True), name="frontend")
