"""Adminisztrátor által állítható beállítások (kulcs → érték), pl. a riasztási
küszöbök. Kód-alapértékek a constants-ban; ami itt el van mentve, felülírja.

Miért nem constants: a küszöbök (hány nappal előre szóljon a rendszer) nem
fejlesztői döntések, az ügyintézők tudják, mi a vészes — ők állítják.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
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
        {"key": key, "label": label, "value": get_int(db, key), "default": default, "min": lo, "max": hi, "help": help_text}
        for key, (label, default, lo, hi, help_text) in ALERT_SETTINGS.items()
    ]


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
