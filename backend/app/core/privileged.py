"""A legmagasabb jogosultsági szint (dev_master) központi szabályai.

Ez a rendszer egyetlen „god" szintje: az adminok fölött áll, az adminok nem
látják és nem módosíthatják, és az alkalmazáson keresztül nem törölhető vagy
fokozható le. Minden idevágó szabály itt, egy helyen él — nincs szétszórva a
routerekben.

Rejtés a forráskódban, obfuszkáció nélkül
-----------------------------------------
A tényleges fiók-azonosító a ``BACKEND_DEV_MASTER_USERNAME`` környezeti
változóból jön. Éles telepítésen ezt a telepítő állítja be egy csak általa
ismert értékre, így a valódi god-felhasználónév **nem szerepel a forráskódban**.
A lenti alapérték csak fejlesztéshez van. A rejtés tehát nem trükközés, hanem
külső konfiguráció — a kód olvasható marad.

Nem eltüntethető csendben
-------------------------
A védelmet a ``tests/test_privileged.py`` őrzi: ha ezt a modult vagy a rá épülő
őröket kiveszik, a tesztek elbuknak. A fiókot az indítás minden alkalommal
újra megerősíti (lásd ``startup._enforce_single_god_user``).
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Iterable

from fastapi import Depends, HTTPException, status

from ..constants import GOD_ROLE
from ..models import UserModel
from .auth import get_current_user

# Csak fejlesztői alapérték. Éles környezetben a BACKEND_DEV_MASTER_USERNAME
# felülírja, és a valódi név nem kerül a kódba.
_DEFAULT_GOD_USERNAME = "devmaster"


@lru_cache(maxsize=1)
def god_username() -> str:
    """A god-fiók felhasználóneve — környezetből, egyszer kiolvasva."""
    configured = os.getenv("BACKEND_DEV_MASTER_USERNAME", "").strip()
    return configured or _DEFAULT_GOD_USERNAME


def is_god_identity(username: str | None, role: str | None) -> bool:
    """Igaz, ha a (név, szerep) páros a god-fiókot azonosítja — akár inaktívan is.

    Szűréshez és őrökhöz: nemcsak a névre, a god-szerepre is illeszkedik, hogy
    egy tévesen god-szerepre állított fiók se essen ki a védelem alól."""
    return username == god_username() or role == GOD_ROLE


def is_god_user(user: UserModel) -> bool:
    """Igaz, ha a hitelesített felhasználó a valódi, aktív god."""
    return user.username == god_username() and user.role == GOD_ROLE and user.active


def require_god_user(user: UserModel = Depends(get_current_user)) -> UserModel:
    """Kizárólag a god férhet hozzá.

    A 403 szándékosan ugyanaz a semleges üzenet, mint bármely más jogosultsági
    hibánál — nem áruljuk el, hogy létezik-e magasabb szint."""
    if not is_god_user(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nincs jogosultság a művelethez")
    return user


def filter_visible_users(users: Iterable[UserModel], viewer: UserModel) -> list[UserModel]:
    """A listából kiszűri a god-fiókot, ha a néző nem maga a god.

    Így az admin a felhasználó-listában nem is látja, hogy létezik god szint."""
    if is_god_user(viewer):
        return list(users)
    return [u for u in users if not is_god_identity(u.username, u.role)]


def assert_user_manageable(actor: UserModel, target: UserModel) -> None:
    """Eldönti, kit módosíthat vagy törölhet a hívó.

    - A god-fiókot az alkalmazáson keresztül SENKI (még a god sem) nem
      módosíthatja — ez a „kiírhatatlan" garancia felülete.
    - A nem-god hívó számára a god-fiók *nem is létezik* (404), nem 403 — így a
      puszta létezése sem szivárog ki.
    - Admin csak olvasó/szerkesztő fiókot kezelhet; másik admint csak a god.

    A hibák szándékosan semlegesek, hogy ne fedjék fel a hierarchiát."""
    if is_god_identity(target.username, target.role):
        if not is_god_user(actor):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Felhasználó nem található")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Ez a fiók az alkalmazáson keresztül nem módosítható")
    if target.role == "admin" and not is_god_user(actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nincs jogosultság a művelethez")


def assert_role_assignable(actor: UserModel, role: str) -> None:
    """A god-szerep API-n keresztül sosem osztható ki; admin szintet csak a god adhat."""
    if role == GOD_ROLE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ez a szerep nem osztható ki")
    if role == "admin" and not is_god_user(actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nincs jogosultság a művelethez")
