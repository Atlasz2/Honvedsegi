from __future__ import annotations
import os

SESSION_HOURS = 8
MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 15
GOD_USERNAME = "dev"
GOD_ROLE = "fejleszto"
BACKEND_ENV = os.getenv("BACKEND_ENV", "development").strip().lower()
IS_PRODUCTION = BACKEND_ENV == "production"
IMPORT_DRAFT_TTL_MINUTES = 30

# Jóváhagyott szabadság/távollét → napi létszám (A1) alapértelmezett állapot.
LEAVE_TO_ATTENDANCE_STATUS = {
    "Szabadság": "Szabadság",
    "Betegszabadság": "Betegállomány",
    "Kiküldetés": "Kiküldetés",
    "Egyéb": "Igazolt távollét",
}
