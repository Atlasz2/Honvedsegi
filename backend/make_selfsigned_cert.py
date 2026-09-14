"""Önaláírt HTTPS-tanúsítvány a központi gépre (intranet, internet nélkül).

Eredmény: backend/certs/server.crt + server.key (PEM). A start-prod.ps1 ezeket
látva HTTPS-en indul. A tanúsítvány 5 évig érvényes, a gép nevére és IP-jére szól.

Futtatás a backend mappából:  ..\.venv\Scripts\python.exe make_selfsigned_cert.py [gepnev] [ip]
Függőség: cryptography (requirements.txt-ben van).

A kliens gépeken a server.crt-t „Megbízható legfelső szintű hitelesítésszolgáltatók"
közé telepítve a böngésző nem figyelmeztet.
"""
from __future__ import annotations

import datetime as dt
import ipaddress
import socket
import sys
from pathlib import Path

try:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
except ImportError:
    print("Hiányzik a 'cryptography' csomag: pip install cryptography", file=sys.stderr)
    raise SystemExit(1)

CERT_DIR = Path(__file__).resolve().parent / "certs"


def main() -> int:
    host = sys.argv[1] if len(sys.argv) > 1 else socket.gethostname()
    ip = sys.argv[2] if len(sys.argv) > 2 else ""
    CERT_DIR.mkdir(exist_ok=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, host), x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Honvedsegi nyilvantarto")])
    sans = [x509.DNSName(host), x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]
    if ip:
        sans.append(x509.IPAddress(ipaddress.ip_address(ip)))
    now = dt.datetime.now(dt.timezone.utc)
    cert = (
        x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
        .serial_number(x509.random_serial_number()).not_valid_before(now - dt.timedelta(days=1))
        .not_valid_after(now + dt.timedelta(days=5 * 365))
        .add_extension(x509.SubjectAlternativeName(sans), critical=False)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    (CERT_DIR / "server.key").write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()))
    (CERT_DIR / "server.crt").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    print(f"Kész: {CERT_DIR / 'server.crt'} és server.key — {host}{' / ' + ip if ip else ''}, 5 évig érvényes.")
    print("A start-prod.ps1 innentől HTTPS-en indít. A server.crt-t a kliens gépekre telepítve nincs figyelmeztetés.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
