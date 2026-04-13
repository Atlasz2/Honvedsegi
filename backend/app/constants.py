from __future__ import annotations
import os

SESSION_HOURS = 8
MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 15
GOD_USERNAME = "dev_master"
GOD_ROLE = "fejleszto"
BACKEND_ENV = os.getenv("BACKEND_ENV", "development").strip().lower()
IS_PRODUCTION = BACKEND_ENV == "production"
IMPORT_DRAFT_TTL_MINUTES = 30


def optional_secret_for_nonprod(name: str, default_value: str) -> str:
    """Visszaadja a titkos értéket env-ből, vagy productionban hibát dob, fejlesztésen az alapértéket."""
    value = os.getenv(name, "").strip()
    if value:
        if IS_PRODUCTION:
            from .security import assert_password_strength
            assert_password_strength(value)
        return value
    if IS_PRODUCTION:
        raise RuntimeError(f"Production módban kötelező megadni: {name}")
    return default_value