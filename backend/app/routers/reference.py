"""Törzsadatok (egységek, rendfokozatok, státuszok) a kliens számára.

Ezek korábban a frontendben voltak hardkódolva, a backend seedtől függetlenül —
így a kettő elcsúszhatott (és el is csúszott). Innentől a backend a forrás.
"""
from __future__ import annotations


from fastapi import APIRouter

from ..constants import EZREDTORZS_UNIT, PERSON_STATUSES, RANKS, REGIONS, SERVICE_TYPES, UNITS, region_label, unit_label
from ..core.dependencies import Reader

router = APIRouter(prefix="/api/reference", tags=["reference"])



@router.get("")
def get_reference_data(_: Reader) -> dict[str, object]:
    return {
        "units": list(UNITS),
        "personStatuses": list(PERSON_STATUSES),
        "serviceTypes": {k: list(v) for k, v in SERVICE_TYPES.items()},
        "regions": {k: list(v) for k, v in REGIONS.items()},
        # Megjelenítéshez: kulcs → „31. TVZ – Veszprém"; üres → ezredtörzs.
        "regionLabels": {**{k: region_label(k) for k in REGIONS}, "": region_label("")},
        "unitLabels": {u: unit_label(u) for u in UNITS},
        "regimentUnit": EZREDTORZS_UNIT,
        "ranks": [{"name": name, "short": short} for name, short in RANKS],
    }
