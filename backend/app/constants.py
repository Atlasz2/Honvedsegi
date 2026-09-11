from __future__ import annotations
import os

SESSION_HOURS = 8
# Ennyi hátralévő idő alatt a munkamenet aktivitásra meghosszabbodik.
SESSION_SLIDE_BELOW_HOURS = 1
MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 15
# A god-fiók felhasználóneve NEM itt él: környezetből jön (privileged.god_username),
# hogy éles telepítésen ne szerepeljen a forráskódban. A szerep azonosítója stabil.
GOD_ROLE = "fejleszto"
BACKEND_ENV = os.getenv("BACKEND_ENV", "development").strip().lower()
IS_PRODUCTION = BACKEND_ENV == "production"
IMPORT_DRAFT_TTL_MINUTES = 30
# Ennyi hiányzó személyt sorolunk fel az import-előnézetben (a darabszám teljes).
IMPORT_MISSING_LIST_LIMIT = 200

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

# Tartalékos-specifikus riasztások (1. betekintés, 2026-09-11).
# Az alapkiképzés moduljai = az ebbe a kategóriába tartozó képesítés-típusok.
BASIC_TRAINING_CATEGORY = "Alapkiképzés"
# A szerződéskötéstől (join_date) ennyi napon belül kell az alapkiképzést elvégezni.
BASIC_TRAINING_DEADLINE_DAYS = 365
# Az összesítő képesítés neve, amit minden modul teljesítésekor automatikusan kap a személy.
BASIC_TRAINING_QUALIFICATION = "Alapkiképzés"
# Az aktív állománynak évente legalább ennyi munkanap szabadságot ki kell vennie.
LEAVE_MINIMUM_DAYS = 10
# Jogszabály: a tartalékosnak évente legalább ennyi napot szolgálnia kell.
SERVICE_MINIMUM_DAYS = 7
# Ennyi nappal a határidő előtt jelezzük előre a riasztásokat.
ALERT_WARN_DAYS = 30

# Parancs-műhely: a fejezetekért felelős szervezeti egységek (a felhasználó
# által leírt sorrendben) és az állapotok.
ORDER_RESPONSIBLES: tuple[str, ...] = ("Ügyvitel", "Jog", "Kiképzés", "Személyügy", "Pénzügy", "Ellenjegyzés")
ORDER_STATUSES: tuple[str, ...] = ("Előkészítés", "Aláírásra vár", "Kiadva", "Visszavonva")
ORDER_CHAPTER_STATUSES: tuple[str, ...] = ("Nincs elkezdve", "Folyamatban", "Kész", "Nem szükséges")
