"""Rendfokozat-rövidítés — a frontend `src/lib/rank.ts` szerveroldali párja.

Akkor kell, ha a szerver maga hoz létre résztvevőt (pl. beillesztett
jelentkező-lista), és ugyanazt a rövidítést akarjuk, mint a kézi beosztásnál.
"""
from __future__ import annotations

import re
import unicodedata

_RANK_SHORT = {
    "honved": "Hv",
    "kozkatona": "Hv",
    "orvezeto": "Örv",
    "tizedes": "Tiz",
    "szakaszvezeto": "Szkv",
    "ormester": "Őrm",
    "torzsormester": "Törm",
    "fotorzsormester": "Ftörm",
    "zaszlos": "Zls",
    "torzszaszlos": "Tzls",
    "fotorzszaszlos": "Ftzls",
    "hadnagy": "Hdgy",
    "fohadnagy": "Fhdgy",
    "szazados": "Szd",
    "ornagy": "Őrgy",
    "alezredes": "Alez",
    "ezredes": "Ezds",
    "dandartabornok": "Ddtbk",
    "vezerornagy": "Vőrgy",
    "altabornagy": "Altbgy",
    "vezerezredes": "Vezds",
}


def _normalize(rank: str) -> str:
    stripped = "".join(ch for ch in unicodedata.normalize("NFD", rank or "") if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", "", stripped.strip().lower())


def short_rank(rank: str | None) -> str:
    return _RANK_SHORT.get(_normalize(rank or ""), rank or "-")
