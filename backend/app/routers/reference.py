"""Törzsadatok (egységek, rendfokozatok, státuszok) a kliens számára.

Ezek korábban a frontendben voltak hardkódolva, a backend seedtől függetlenül —
így a kettő elcsúszhatott (és el is csúszott). Innentől a backend a forrás.
"""
from __future__ import annotations


from fastapi import APIRouter

from ..constants import PERSON_STATUSES, RANKS, SERVICE_TYPES, UNITS
from ..core.dependencies import Reader

router = APIRouter(prefix="/api/reference", tags=["reference"])



@router.get("")
def get_reference_data(_: Reader) -> dict[str, object]:
    return {
        "units": list(UNITS),
        "personStatuses": list(PERSON_STATUSES),
        "serviceTypes": {k: list(v) for k, v in SERVICE_TYPES.items()},
        "ranks": [{"name": name, "short": short} for name, short in RANKS],
    }
