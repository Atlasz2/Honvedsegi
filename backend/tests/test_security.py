"""A jelszókezelés tesztjei (a #5 hiányosság: jelszóerősség visszakapcsolása)."""
from __future__ import annotations

import pytest

from app.security import assert_password_strength, hash_password, verify_password


def test_dev_policy_rejects_too_short_or_letters_only():
    # Fejlesztés közben: 8 karakter, betű + szám.
    with pytest.raises(ValueError):
        assert_password_strength("Rov1d")
    with pytest.raises(ValueError):
        assert_password_strength("csakbetuk")


def test_dev_policy_accepts_simple_test_passwords():
    assert_password_strength("olvaso123")
    assert_password_strength("Admin123")


def test_production_policy_is_strict(monkeypatch):
    import app.constants as constants
    monkeypatch.setattr(constants, "IS_PRODUCTION", True)
    with pytest.raises(ValueError):
        assert_password_strength("Rovid_1!")
    with pytest.raises(ValueError):
        assert_password_strength("csakiskisbetu123")  # nincs nagybetű, speciális
    assert_password_strength("ErosJelszo_2026!")  # nem dobhat hibát


def test_hash_and_verify_roundtrip():
    stored = hash_password("ErosJelszo_2026!")
    assert verify_password("ErosJelszo_2026!", stored)
    assert not verify_password("rosszJelszo_2026!", stored)
