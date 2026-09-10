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

# ── Törzsadatok ───────────────────────────────────────────────────────────
# Egy igazságforrás. Korábban az egységlista a Personnel.tsx-ben és a seed.py-ban
# is külön élt, a rendfokozat-létra pedig háromfelé csúszott szét: a seed olyan
# fokozatokat generált ("Honvéd", "Őrvezető"), amiket a frontend legördülője nem
# ismert. A /api/reference végpont ezt szolgálja ki a kliensnek.

UNITS: tuple[str, ...] = ("31 TVZ", "83 TVZ", "19 TVZ", "Ezredtörzs")

PERSON_STATUSES: tuple[str, ...] = ("Aktív", "Tartalékos", "Szabadságon", "Leszerelt")

# Növekvő rangsorban. A rövidítést a frontend a listákban használja.
RANKS: tuple[tuple[str, str], ...] = (
    ("Honvéd", "Hv"),
    ("Őrvezető", "Örv"),
    ("Tizedes", "Tiz"),
    ("Szakaszvezető", "Szkv"),
    ("Őrmester", "Őrm"),
    ("Törzsőrmester", "Törm"),
    ("Főtörzsőrmester", "Ftörm"),
    ("Zászlós", "Zls"),
    ("Törzszászlós", "Tzls"),
    ("Főtörzszászlós", "Ftzls"),
    ("Hadnagy", "Hdgy"),
    ("Főhadnagy", "Fhdgy"),
    ("Százados", "Szd"),
    ("Őrnagy", "Őrgy"),
    ("Alezredes", "Alez"),
    ("Ezredes", "Ezds"),
    ("Dandártábornok", "Ddtbk"),
    ("Vezérőrnagy", "Vőrgy"),
    ("Altábornagy", "Altbgy"),
    ("Vezérezredes", "Vezds"),
)

RANK_NAMES: tuple[str, ...] = tuple(name for name, _short in RANKS)


# Jóváhagyott szabadság/távollét → napi létszám (A1) alapértelmezett állapot.
LEAVE_TO_ATTENDANCE_STATUS = {
    "Szabadság": "Szabadság",
    "Betegszabadság": "Betegállomány",
    "Kiküldetés": "Kiküldetés",
    "Egyéb": "Igazolt távollét",
}
