from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken


LEGACY_ITERATIONS = 120_000
SCRYPT_N = 2 ** 15
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 32
SCRYPT_MAXMEM = int(os.getenv("BACKEND_SCRYPT_MAXMEM", str(128 * 1024 * 1024)))
ENCRYPTED_PREFIX = "enc::"


def _pepper() -> bytes:
    return os.getenv("BACKEND_PASSWORD_PEPPER", "").encode("utf-8")


def assert_password_strength(password: str) -> None:
    if len(password) < 14:
        raise ValueError("A jelszónak legalább 14 karakter hosszúnak kell lennie")
    checks = {
        "kisbetű": any(ch.islower() for ch in password),
        "nagybetű": any(ch.isupper() for ch in password),
        "szám": any(ch.isdigit() for ch in password),
        "speciális karakter": any(not ch.isalnum() for ch in password),
    }
    missing = [label for label, ok in checks.items() if not ok]
    if missing:
        raise ValueError(f"A jelszóból hiányzik: {', '.join(missing)}")


def hash_password(password: str) -> str:
    assert_password_strength(password)
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password=(password.encode("utf-8") + _pepper()),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
        maxmem=SCRYPT_MAXMEM,
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def _verify_scrypt(password: str, stored_hash: str) -> bool:
    try:
        _, n_raw, r_raw, p_raw, salt_hex, digest_hex = stored_hash.split("$", 5)
        n = int(n_raw)
        r = int(r_raw)
        p = int(p_raw)
        salt = bytes.fromhex(salt_hex)
    except (ValueError, TypeError):
        return False

    computed = hashlib.scrypt(
        password=(password.encode("utf-8") + _pepper()),
        salt=salt,
        n=n,
        r=r,
        p=p,
        dklen=len(bytes.fromhex(digest_hex)),
        maxmem=SCRYPT_MAXMEM,
    )
    return hmac.compare_digest(computed.hex(), digest_hex)


def _verify_legacy_pbkdf2(password: str, stored_hash: str) -> bool:
    try:
        salt, digest = stored_hash.split("$", 1)
    except ValueError:
        return False
    computed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), LEGACY_ITERATIONS)
    return hmac.compare_digest(computed.hex(), digest)


def verify_password(password: str, stored_hash: str) -> bool:
    if stored_hash.startswith("scrypt$"):
        return _verify_scrypt(password, stored_hash)
    return _verify_legacy_pbkdf2(password, stored_hash)


def needs_rehash(stored_hash: str) -> bool:
    return not stored_hash.startswith("scrypt$")


def fingerprint_token(token: str) -> str:
    return hashlib.sha256((token + "::" + os.getenv("BACKEND_TOKEN_PEPPER", "")).encode("utf-8")).hexdigest()


def issue_token() -> str:
    return secrets.token_urlsafe(32)


def _data_key() -> str:
    return os.getenv("BACKEND_DATA_KEY", "").strip()


@lru_cache(maxsize=1)
def _data_cipher() -> Fernet | None:
    key = _data_key()
    if not key:
        return None
    try:
        return Fernet(key.encode("utf-8"))
    except Exception as exc:  # pragma: no cover - environment-dependent validation
        raise RuntimeError("A BACKEND_DATA_KEY ervenytelen. Fernet base64 kulcs szukseges.") from exc


def assert_data_key_configured(required: bool) -> None:
    if not required:
        return
    if not _data_key():
        raise RuntimeError("Production modban kotelezo a BACKEND_DATA_KEY beallitasa.")
    _data_cipher()


def is_encrypted_text(value: str) -> bool:
    return bool(value and value.startswith(ENCRYPTED_PREFIX))


def encrypt_text(value: str) -> str:
    raw = value or ""
    if not raw:
        return ""
    if is_encrypted_text(raw):
        return raw

    cipher = _data_cipher()
    if cipher is None:
        return raw

    token = cipher.encrypt(raw.encode("utf-8")).decode("utf-8")
    return f"{ENCRYPTED_PREFIX}{token}"


def decrypt_text(value: str) -> str:
    raw = value or ""
    if not raw:
        return ""
    if not is_encrypted_text(raw):
        return raw

    cipher = _data_cipher()
    if cipher is None:
        raise RuntimeError("A BACKEND_DATA_KEY hianyzik, az adat nem visszafejtheto.")

    token = raw[len(ENCRYPTED_PREFIX) :]
    try:
        return cipher.decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        raise RuntimeError("Serult vagy idegen kulccsal titkositott adat.") from exc
