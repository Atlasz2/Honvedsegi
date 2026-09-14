"""Adminisztrátor által állítható beállítások (kulcs → érték), pl. a riasztási
küszöbök. Kód-alapértékek a constants-ban; ami itt el van mentve, felülírja.

Miért nem constants: a küszöbök (hány nappal előre szóljon a rendszer) nem
fejlesztői döntések, az ügyintézők tudják, mi a vészes — ők állítják.
"""
from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy.orm import Session

from .constants import ALERT_WARN_DAYS, BASIC_TRAINING_DEADLINE_DAYS, LEAVE_MINIMUM_DAYS, SERVICE_MINIMUM_DAYS
from .models import AppSettingModel

# kulcs → (címke, alapérték, min, max, magyarázat)
ALERT_SETTINGS: dict[str, tuple[str, int, int, int, str]] = {
    "order_deadline_warn_days": ("Parancs-határidő előrejelzés (nap)", 7, 0, 365,
                                 "Ennyi nappal a fejezet/parancs határideje előtt kerül a figyelmeztetések közé. 30 nappal előtte gyakran még nem is tudnak róla — a 7 a vészes."),
    "basic_training_warn_days": ("Alapkiképzés-határidő előrejelzés (nap)", ALERT_WARN_DAYS, 0, 365,
                                 "Ennyi nappal a jogviszony-kezdet + 1 év előtt jelez „hamarosan lejár”-t."),
    "basic_training_deadline_days": ("Alapkiképzés határideje a szerződéstől (nap)", BASIC_TRAINING_DEADLINE_DAYS, 30, 3650,
                                     "A tartalékosnak ennyi napon belül kell minden modult teljesítenie, különben leszerelendő."),
    "year_end_warn_days": ("Éves kötelezettségek előrejelzése (nap)", ALERT_WARN_DAYS, 0, 365,
                           "Szabadság-minimum és szolgálati minimum: ennyi nappal december 31. előtt sárgul."),
    "leave_minimum_days": ("Kötelező szabadság minimum (munkanap/év)", LEAVE_MINIMUM_DAYS, 1, 366,
                           "Az aktív állománynak évente legalább ennyi munkanap szabadságot ki kell vennie."),
    "service_minimum_days": ("Tartalékos szolgálati minimum (nap/év)", SERVICE_MINIMUM_DAYS, 1, 366,
                             "Jogszabály: minden tartalékos évente legalább ennyi napot szolgál."),
    "qualification_warn_days": ("Képesítés/okmány lejárat előrejelzés (nap)", 60, 1, 365,
                                "Ennyi nappal a lejárat előtt kerülnek a figyelmeztetések közé (az oldalon 30/60/90 közül is választható)."),
}


# Amelyik küszöb egy figyelmeztetés-fajtát vezérel, az ki is kapcsolható; a
# többi (pl. „határidő a szerződéstől") csak paraméter, annak nincs kapcsolója.
TOGGLEABLE_KEYS: frozenset[str] = frozenset({
    "order_deadline_warn_days", "basic_training_warn_days", "leave_minimum_days",
    "service_minimum_days", "qualification_warn_days",
})

# Egyéni szabály: egy személy-dátummezőre épülő lejárat-figyelés.
# {id, label, field, validityDays, warnDays, enabled}
CUSTOM_RULES_KEY = "custom_alert_rules"
CUSTOM_FIELD_BASE: dict[str, str] = {"join_date": "Jogviszony kezdete", "birth_date": "Születési dátum"}
_ID_RE = re.compile(r"^[a-z0-9_-]{1,40}$")
MAX_CUSTOM_RULES = 30


def is_enabled(db: Session, key: str) -> bool:
    """Kikapcsolt küszöb → az adott figyelmeztetés-fajta nem jelenik meg sehol."""
    if key not in TOGGLEABLE_KEYS:
        return True
    row = db.get(AppSettingModel, f"{key}.enabled")
    return row is None or row.value != "0"


def set_enabled(db: Session, key: str, flag: bool) -> bool:
    """True, ha változott."""
    if key not in TOGGLEABLE_KEYS:
        raise ValueError(f"Ez a küszöb nem kapcsolható ki: {ALERT_SETTINGS.get(key, (key,))[0]}")
    old = is_enabled(db, key)
    if old == flag:
        return False
    row = db.get(AppSettingModel, f"{key}.enabled")
    if row is None:
        db.add(AppSettingModel(key=f"{key}.enabled", value="1" if flag else "0"))
    else:
        row.value = "1" if flag else "0"
    return True


def get_int(db: Session, key: str) -> int:
    spec = ALERT_SETTINGS[key]
    row = db.get(AppSettingModel, key)
    if row is None:
        return spec[1]
    try:
        value = int(row.value)
    except (TypeError, ValueError):
        return spec[1]
    return min(max(value, spec[2]), spec[3])


def get_all(db: Session) -> list[dict[str, Any]]:
    return [
        {"key": key, "label": label, "value": get_int(db, key), "default": default, "min": lo, "max": hi, "help": help_text,
         "toggleable": key in TOGGLEABLE_KEYS, "enabled": is_enabled(db, key)}
        for key, (label, default, lo, hi, help_text) in ALERT_SETTINGS.items()
    ]


# ── Egyéni szabályok ────────────────────────────────────────────────────────

def _normalize_rule(raw: dict[str, Any]) -> dict[str, Any]:
    rule_id = str(raw.get("id") or "").strip().lower()
    if not _ID_RE.match(rule_id):
        raise ValueError("A szabály azonosítója hiányzik vagy érvénytelen")
    label = str(raw.get("label") or "").strip()
    if not label:
        raise ValueError("A szabály neve kötelező")
    field = str(raw.get("field") or "").strip()
    if not field or len(field) > 80:
        raise ValueError(f"{label}: a dátummező kötelező")
    try:
        validity = int(raw.get("validityDays") or 0)
        warn = int(raw.get("warnDays") or 0)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label}: az érvényesség és az előrejelzés egész szám (nap)") from exc
    if not 0 <= validity <= 36500:
        raise ValueError(f"{label}: az érvényesség 0–36500 nap")
    if not 0 <= warn <= 365:
        raise ValueError(f"{label}: az előrejelzés 0–365 nap")
    return {"id": rule_id, "label": label[:120], "field": field, "validityDays": validity, "warnDays": warn,
            "enabled": bool(raw.get("enabled", True))}


def get_custom_rules(db: Session) -> list[dict[str, Any]]:
    row = db.get(AppSettingModel, CUSTOM_RULES_KEY)
    if row is None or not row.value:
        return []
    try:
        data = json.loads(row.value)
    except ValueError:
        return []
    rules = []
    for raw in data if isinstance(data, list) else []:
        try:
            rules.append(_normalize_rule(raw))
        except ValueError:
            continue   # sérült sor: kihagyjuk, nem dől el tőle a többi
    return rules


def set_custom_rules(db: Session, rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(rules) > MAX_CUSTOM_RULES:
        raise ValueError(f"Legfeljebb {MAX_CUSTOM_RULES} egyéni szabály lehet")
    normalized = [_normalize_rule(r) for r in rules]
    if len({r["id"] for r in normalized}) != len(normalized):
        raise ValueError("Két szabálynak ugyanaz az azonosítója")
    row = db.get(AppSettingModel, CUSTOM_RULES_KEY)
    value = json.dumps(normalized, ensure_ascii=False)
    if row is None:
        db.add(AppSettingModel(key=CUSTOM_RULES_KEY, value=value))
    else:
        row.value = value
    return normalized


def set_many(db: Session, values: dict[str, int]) -> dict[str, tuple[int, int]]:
    """Beállítja a megadott kulcsokat; visszaadja {kulcs: (régi, új)} a naplóhoz.
    Ismeretlen kulcs vagy tartományon kívüli érték → ValueError (a hívó 400-at ad)."""
    changed: dict[str, tuple[int, int]] = {}
    for key, raw in values.items():
        if key not in ALERT_SETTINGS:
            raise ValueError(f"Ismeretlen beállítás: {key}")
        _, _, lo, hi, _ = ALERT_SETTINGS[key]
        try:
            value = int(raw)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{ALERT_SETTINGS[key][0]}: egész szám kell") from exc
        if not lo <= value <= hi:
            raise ValueError(f"{ALERT_SETTINGS[key][0]}: {lo}–{hi} között kell lennie")
        old = get_int(db, key)
        if old == value and db.get(AppSettingModel, key) is not None:
            continue
        row = db.get(AppSettingModel, key)
        if row is None:
            db.add(AppSettingModel(key=key, value=str(value)))
        else:
            row.value = str(value)
        if old != value:
            changed[key] = (old, value)
    return changed
