"""A riport-végpontok jellemzés-tesztjei (előnézet + XLSX/DOCX/PDF export).

A meglévő viselkedést rögzítik, hogy a réteg-refaktor
(routers/reports.py -> services/reporting.py) ne változtassa meg.

A generált dokumentumok belsejét nem elemezzük: a stabil szerződés a
státuszkód, a MIME-típus, a fájlnév és a "nem üres tartalom".
"""
from __future__ import annotations

import pytest

TEMPLATES = ["overview", "operations", "events"]

FORMATS = [
    ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ("pdf", "application/pdf"),
]


# ── Előnézet ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("template", TEMPLATES)
def test_preview_returns_summary_and_sections(client, admin_headers, template):
    response = client.get(
        f"/api/reports/operations/preview?template={template}",
        headers=admin_headers,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["title"]
    assert set(body["summary"]) == {"exercises", "trainings", "events"}
    assert body["interval"]["dateFrom"]
    assert body["interval"]["dateTo"]


def test_preview_rejects_unknown_template(client, admin_headers):
    response = client.get(
        "/api/reports/operations/preview?template=nincsilyen",
        headers=admin_headers,
    )
    assert response.status_code == 400


def test_preview_rejects_unknown_focus_type(client, admin_headers):
    response = client.get(
        "/api/reports/operations/preview?template=focus&focus_type=urhajo&focus_id=x",
        headers=admin_headers,
    )
    assert response.status_code == 400


def test_preview_rejects_reversed_date_range(client, admin_headers):
    response = client.get(
        "/api/reports/operations/preview?date_from=2026-05-01&date_to=2026-04-01",
        headers=admin_headers,
    )
    assert response.status_code == 400


def test_preview_honours_the_requested_interval(client, admin_headers):
    response = client.get(
        "/api/reports/operations/preview?date_from=2026-04-01&date_to=2026-04-30",
        headers=admin_headers,
    )

    assert response.status_code == 200, response.text
    interval = response.json()["interval"]
    assert interval["dateFrom"] == "2026-04-01"
    assert interval["dateTo"] == "2026-04-30"


def test_preview_requires_authentication(client):
    response = client.get("/api/reports/operations/preview")
    assert response.status_code == 401


# ── Exportok ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("extension,media_type", FORMATS)
def test_export_returns_a_non_empty_document(client, admin_headers, extension, media_type):
    response = client.get(
        f"/api/reports/operations.{extension}?template=overview",
        headers=admin_headers,
    )

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith(media_type)
    assert "attachment" in response.headers["content-disposition"]
    assert len(response.content) > 0


@pytest.mark.parametrize("extension,_media_type", FORMATS)
def test_export_rejects_unknown_template(client, admin_headers, extension, _media_type):
    response = client.get(
        f"/api/reports/operations.{extension}?template=nincsilyen",
        headers=admin_headers,
    )
    assert response.status_code == 400


@pytest.mark.parametrize("extension,_media_type", FORMATS)
def test_export_requires_authentication(client, extension, _media_type):
    response = client.get(f"/api/reports/operations.{extension}")
    assert response.status_code == 401


def test_focus_report_requires_type_and_id(client, admin_headers):
    response = client.get(
        "/api/reports/operations/preview?template=focus",
        headers=admin_headers,
    )
    assert response.status_code == 400


def test_focus_report_rejects_unknown_record(client, admin_headers):
    response = client.get(
        "/api/reports/operations/preview?template=focus&focus_type=exercise&focus_id=nincs-ilyen",
        headers=admin_headers,
    )
    assert response.status_code == 404


def test_generic_table_export_returns_xlsx(client, admin_headers):
    r = client.post("/api/reports/table.xlsx", json={
        "title": "Teszt lista", "headers": ["Név", "Alegység"], "rows": [["Kiss Béla", "1. század"], ["Nagy Lajos", "törzs"]],
    }, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.content[:2] == b"PK"


def test_duty_templates_are_gone(client, admin_headers):
    """A szolgálatok a Műveletekbe olvadtak: nincs külön szolgálati riport/fókusz."""
    assert client.get("/api/reports/operations/preview?template=duties", headers=admin_headers).status_code == 400
    assert client.get("/api/duties", headers=admin_headers).status_code == 404
