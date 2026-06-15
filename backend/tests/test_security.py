"""A jelszókezelés tesztjei (a #5 hiányosság: jelszóerősség visszakapcsolása)."""
from __future__ import annotations

import pytest

from app.security import assert_password_strength, hash_password, verify_password


def test_rejects_too_short_password():
    with pytest.raises(ValueError):
        assert_password_strength("Rovid_1!")


def test_rejects_missing_character_classes():
    # 16 karakter, de nincs benne nagybetű és speciális karakter.
    with pytest.raises(ValueError):
        assert_password_strength("csakiskisbetu123")


def test_accepts_strong_password():
    assert_password_strength("ErosJelszo_2026!")  # nem dobhat hibát


def test_hash_and_verify_roundtrip():
    stored = hash_password("ErosJelszo_2026!")
    assert verify_password("ErosJelszo_2026!", stored)
    assert not verify_password("rosszJelszo_2026!", stored)
