"""Felszerelés-visszavétel: a Felszerelés lista és a leszerelési jegyzőkönyv közös lépése."""
from __future__ import annotations

from ..core.time import utc_now
from ..models import EquipmentModel


def release_equipment(item: EquipmentModel) -> None:
    """Visszavétel: a kiadás lezárul a történetben, az eszköz újra kiadható."""
    history = list(item.checkout_history or [])
    if history:
        history[-1] = {**history[-1], "returnedDate": utc_now().date().isoformat()}
    item.checked_out_to = None
    item.checked_out_to_name = None
    item.checked_out_date = None
    item.checkout_history = history


def mark_missing(item: EquipmentModel, amount: float, note: str = "") -> None:
    """Hiány a leszereléskor: az eszköz a katonánál marad (nem jött vissza), a nyitott
    kiadás-bejegyzés megkapja a hiányt és a megtérítendő összeget."""
    history = list(item.checkout_history or [])
    if history:
        history[-1] = {**history[-1], "missing": True, "amount": amount, "missingNote": note,
                       "missingDate": utc_now().date().isoformat()}
    item.checkout_history = history
