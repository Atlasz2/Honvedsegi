"""Törzsadatok (egységek, rendfokozatok, státuszok) a kliens számára.

Ezek korábban a frontendben voltak hardkódolva, a backend seedtől függetlenül —
így a kettő elcsúszhatott (és el is csúszott). Innentől a backend a forrás.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from ..constants import PERSON_STATUSES, RANKS, UNITS
from ..deps import _get_current_user
from ..models import UserModel

router = APIRouter(prefix="/api/reference", tags=["reference"])

Reader = Annotated[UserModel, Depends(_get_current_user)]


@router.get("")
def get_reference_data(_: Reader) -> dict[str, object]:
    return {
        "units": list(UNITS),
        "personStatuses": list(PERSON_STATUSES),
        "ranks": [{"name": name, "short": short} for name, short in RANKS],
    }
