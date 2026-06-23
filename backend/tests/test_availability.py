"""A foglaltság-kereső (G/„szabad-e a lőtér") tesztjei."""
from __future__ import annotations

from app.db import SessionLocal
from app.models import ExerciseModel, new_id


def _add_exercise(*, name, location, start, end, status="Tervezett"):
    with SessionLocal() as db:
        db.add(ExerciseModel(
            id=new_id(), name=name, type="Éleslövészet",
            start_date=start, end_date=end, location=location, status=status,
        ))
        db.commit()


def test_availability_requires_auth(client):
    assert client.get("/api/availability?start_date=2026-12-01").status_code == 401


def test_locations_are_listed(client, admin_headers):
    _add_exercise(name="Lőgyakorlat", location="Központi lőtér", start="2026-12-01", end="2026-12-01")
    locations = client.get("/api/availability/locations", headers=admin_headers).json()
    assert "Központi lőtér" in locations


def test_partial_match_finds_booking_and_free_day_is_empty(client, admin_headers):
    _add_exercise(name="Éleslövészet", location="Központi lőtér", start="2026-12-10", end="2026-12-10")

    # Részleges, ékezet nélküli keresés a foglalt napon → megtalálja.
    booked = client.get("/api/availability?start_date=2026-12-10&q=loter", headers=admin_headers).json()
    assert any(b["location"] == "Központi lőtér" for b in booked)

    # Másik nap ugyanarra a helyszínre → szabad (üres lista).
    free = client.get("/api/availability?start_date=2026-12-20&q=loter", headers=admin_headers).json()
    assert free == []


def test_cancelled_event_does_not_block(client, admin_headers):
    _add_exercise(name="Törölt lövészet", location="Aknavető lőtér", start="2027-01-05", end="2027-01-05", status="Törölve")
    result = client.get("/api/availability?start_date=2027-01-05&q=aknaveto", headers=admin_headers).json()
    assert result == []
