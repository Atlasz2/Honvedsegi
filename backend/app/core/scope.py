"""Területi hatókör: a felhasználó melyik zászlóalj adatát látja.

Három megye, mindegyiknek saját zászlóalja; az ezredtörzs Győrben van és
mindent lát. A zászlóalj ügyintézője csak a sajátját:

- személyes adat (Személyek, Létszám, Szabadság, kereső): a saját zászlóalj
  állománya;
- művelet, esemény, parancs, közlemény: aminek a `unit` mezője a saját
  zászlóalj, PLUSZ az ezredszintű (üres `unit` vagy "Ezredtörzs") — az
  ezredszintű gyakorlaton minden zászlóalj részt vesz, azt látnia kell;
- amit a zászlóalj ügyintézője létrehoz, az automatikusan az ő zászlóaljáé.

Üres `region` = teljes hatókör (ezredtörzs, admin, alkotó). Nyitott kérdés
(„Nyitott kérdések.md"): kell-e a két zászlóaljnak látnia egymás gyakorlatát.
"""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import Select, or_

from ..constants import EZREDTORZS_UNIT, REGIONS
from ..models import PersonModel, UserModel

#: Ezredszintű elem: üres unit vagy az ezredtörzs — mindenki látja.
REGIMENT_LEVEL: tuple[str, ...] = ("", EZREDTORZS_UNIT)


def scope_units(user: UserModel) -> tuple[str, ...] | None:
    """A felhasználó által látható alegységek; None = minden."""
    region = (user.region or "").strip()
    if not region or user.role in ("admin", "fejleszto"):
        return None
    units = REGIONS.get(region)
    return tuple(units) if units else None


def own_unit(user: UserModel) -> str:
    """A zászlóalj ügyintézőjének saját alegysége; "" = ezredtörzs / minden."""
    units = scope_units(user)
    return units[0] if units else ""


# ── Személyek ───────────────────────────────────────────────────────────────

def scoped_persons(query: Select, user: UserModel) -> Select:
    units = scope_units(user)
    if units is None:
        return query
    return query.where(PersonModel.unit.in_(units))


def person_in_scope(user: UserModel, person: PersonModel) -> bool:
    units = scope_units(user)
    return units is None or (person.unit or "") in units


def assert_person_in_scope(user: UserModel, person: PersonModel) -> None:
    """Más terület személye: 404 — nem áruljuk el, hogy létezik."""
    if not person_in_scope(user, person):
        raise HTTPException(status_code=404, detail="A személy nem található")


# ── Zászlóaljhoz tartozó rekordok (unit oszlop) ─────────────────────────────

def scoped_owned(query: Select, model, user: UserModel) -> Select:
    """Művelet/esemény/parancs/közlemény lekérdezés a hatókörre: saját zászlóalj
    + ezredszintű."""
    units = scope_units(user)
    if units is None:
        return query
    col = model.unit
    return query.where(or_(col.in_(units), col.in_(REGIMENT_LEVEL), col.is_(None)))


def owned_in_scope(user: UserModel, unit: str | None) -> bool:
    units = scope_units(user)
    value = unit or ""
    return units is None or value in units or value in REGIMENT_LEVEL


def assert_owned_in_scope(user: UserModel, item, label: str = "A rekord") -> None:
    if not owned_in_scope(user, getattr(item, "unit", "")):
        raise HTTPException(status_code=404, detail=f"{label} nem található")


def unit_for_write(user: UserModel, requested: str | None) -> str:
    """Létrehozáskor/módosításkor melyik zászlóaljé lesz a rekord.

    Zászlóalj-ügyintéző: mindig a sajátja (nem adhat át másnak, és nem tehet
    ezredszintűvé). Ezredtörzs: amit kér ("" = ezredszintű), csak ismert
    alegység lehet."""
    from ..constants import UNITS

    mine = own_unit(user)
    if mine:
        return mine
    value = (requested or "").strip()
    if value and value not in UNITS:
        raise HTTPException(status_code=400, detail=f"Ismeretlen alegység: {value}")
    return value
