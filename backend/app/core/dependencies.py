"""Közös FastAPI dependency-aliasok.

Korábban minden endpoint kiírta a teljes `Depends(...)` alakot, tizenegy router
pedig egyenként újradefiniálta ugyanezeket az aliasokat. Innentől egy helyen
élnek, és a routerek importálják őket.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import UserModel
from .auth import get_current_user, require_admin, require_editor, require_god_user

DB = Annotated[Session, Depends(get_db)]

#: Bármely bejelentkezett felhasználó (olvasás).
Reader = Annotated[UserModel, Depends(get_current_user)]

#: Szerkesztő, admin vagy fejlesztő (írás).
Editor = Annotated[UserModel, Depends(require_editor)]

#: Admin vagy fejlesztő.
Admin = Annotated[UserModel, Depends(require_admin)]

#: Kizárólag a dev_master felhasználó.
GodUser = Annotated[UserModel, Depends(require_god_user)]
