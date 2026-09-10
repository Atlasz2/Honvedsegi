"""Kiterjesztett riasztások: igazolatlan távollét + készenléti rés."""
from __future__ import annotations

from datetime import date


def _person(client, headers, name, sztsz):
    r = client.post(
        "/api/personnel",
        json={"name": name, "sztsz": sztsz, "rank": "honvéd", "unit": "1. század", "status": "Aktív"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_unexcused_absence_alert(client, admin_headers):
    pid = _person(client, admin_headers, "Igazolatlan Iván", "14600001")
    today = date.today().isoformat()
    client.put(
        "/api/attendance",
        json={"date": today, "items": [{"personnelId": pid, "status": "Igazolatlan távollét", "note": "nem jelent meg"}]},
        headers=admin_headers,
    )
    alerts = client.get("/api/alerts/unexcused", headers=admin_headers).json()
    match = next((a for a in alerts if a["personnelId"] == pid), None)
    assert match is not None
    assert match["date"] == today


def test_readiness_gap_lists_active_without_valid_qualification(client, admin_headers):
    pid = _person(client, admin_headers, "Rés Rezső", "14600002")
    gaps = client.get("/api/alerts/readiness-gaps", headers=admin_headers).json()
    assert any(g["personnelId"] == pid for g in gaps)  # nincs képesítése → rés


def test_alerts_require_auth(client):
    assert client.get("/api/alerts/unexcused").status_code == 401
    assert client.get("/api/alerts/readiness-gaps").status_code == 401
