"""A napi létszámjelentés (jelenléti ív) végpont tesztjei."""
from __future__ import annotations

from app.db import SessionLocal
from app.models import ExerciseModel, ParticipantModel, new_id


def _create_person(client, headers, *, name, sztsz, unit="1. század"):
    payload = {"name": name, "sztsz": sztsz, "rank": "őrvezető", "unit": unit, "status": "Aktív"}
    response = client.post("/api/personnel", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _reader_headers(client):
    response = client.post(
        "/api/auth/login",
        json={"username": "olvaso", "password": "olvaso123"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_get_requires_auth(client):
    assert client.get("/api/attendance?date=2026-07-01").status_code == 401


def test_get_rejects_invalid_date(client, admin_headers):
    response = client.get("/api/attendance?date=nem-datum", headers=admin_headers)
    assert response.status_code == 400


def test_unrecorded_person_defaults_to_present(client, admin_headers):
    person_id = _create_person(client, admin_headers, name="Jelen Lajos", sztsz="17000001")
    body = client.get("/api/attendance?date=2026-07-01", headers=admin_headers).json()
    entry = next(i for i in body["items"] if i["personnelId"] == person_id)
    assert entry["status"] == "Jelen"
    assert body["summary"].get("Jelen", 0) >= 1
    assert body["total"] == len(body["items"])


def test_put_marks_attendance_and_updates_summary(client, admin_headers):
    person_id = _create_person(client, admin_headers, name="Szabadi Béla", sztsz="17000002")
    payload = {"date": "2026-07-02", "items": [{"personnelId": person_id, "status": "Szabadság", "note": "éves"}]}

    put = client.put("/api/attendance", json=payload, headers=admin_headers)
    assert put.status_code == 200, put.text

    body = client.get("/api/attendance?date=2026-07-02", headers=admin_headers).json()
    entry = next(i for i in body["items"] if i["personnelId"] == person_id)
    assert entry["status"] == "Szabadság"
    assert entry["note"] == "éves"
    assert body["summary"].get("Szabadság", 0) >= 1


def test_put_rejects_unknown_person(client, admin_headers):
    payload = {"date": "2026-07-03", "items": [{"personnelId": "nincs-ilyen-id", "status": "Jelen"}]}
    response = client.put("/api/attendance", json=payload, headers=admin_headers)
    assert response.status_code == 400


def test_put_requires_editor_role(client):
    payload = {"date": "2026-07-04", "items": []}
    response = client.put("/api/attendance", json=payload, headers=_reader_headers(client))
    assert response.status_code == 403


def test_export_xlsx_returns_spreadsheet(client, admin_headers):
    response = client.get("/api/attendance/export.xlsx?date=2026-07-01", headers=admin_headers)
    assert response.status_code == 200, response.text
    assert "spreadsheetml" in response.headers["content-type"]
    assert response.content[:2] == b"PK"  # az xlsx valójában zip


def test_export_pdf_returns_pdf(client, admin_headers):
    response = client.get("/api/attendance/export.pdf?date=2026-07-01", headers=admin_headers)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:4] == b"%PDF"


def _create_reservist(client, headers, *, name, sztsz):
    payload = {"name": name, "sztsz": sztsz, "rank": "honvéd", "unit": "Tartalék század", "status": "Tartalékos"}
    response = client.post("/api/personnel", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["id"]


def test_reservist_hidden_by_default_but_shown_on_request(client, admin_headers):
    pid = _create_reservist(client, admin_headers, name="Tartalék Tódor", sztsz="15000001")

    default_view = client.get("/api/attendance?date=2026-10-01", headers=admin_headers).json()
    assert all(i["personnelId"] != pid for i in default_view["items"])

    full_view = client.get("/api/attendance?date=2026-10-01&include_reserve=true", headers=admin_headers).json()
    assert any(i["personnelId"] == pid for i in full_view["items"])


def test_reservist_with_leave_appears_in_default_view(client, admin_headers):
    pid = _create_reservist(client, admin_headers, name="Tartalék Géza", sztsz="15000002")
    created = client.post(
        "/api/leave",
        json={"personnelId": pid, "type": "Kiküldetés", "startDate": "2026-10-05", "endDate": "2026-10-07"},
        headers=admin_headers,
    ).json()
    client.post(f"/api/leave/{created['id']}/decision", json={"approve": True}, headers=admin_headers)

    view = client.get("/api/attendance?date=2026-10-06", headers=admin_headers).json()
    entry = next((i for i in view["items"] if i["personnelId"] == pid), None)
    assert entry is not None
    assert entry["status"] == "Kiküldetés"


def _exercise_with_participant(client, headers, *, day, name, sztsz):
    person_id = _create_person(client, headers, name=name, sztsz=sztsz)
    exercise_id = new_id()
    with SessionLocal() as db:
        db.add(ExerciseModel(
            id=exercise_id, name="Harcászati gyakorlat", type="Gyakorlat",
            start_date=day, end_date=day, location="Gyakorlótér", status="Tervezett",
        ))
        db.add(ParticipantModel(
            id=new_id(), event_type="exercise", event_id=exercise_id,
            personnel_id=person_id, person_name=name,
        ))
        db.commit()
    return exercise_id, person_id


def test_events_on_day_lists_event_with_participants(client, admin_headers):
    exercise_id, _pid = _exercise_with_participant(client, admin_headers, day="2026-11-01", name="Gyak Géza", sztsz="14000001")
    events = client.get("/api/attendance/events?date=2026-11-01", headers=admin_headers).json()
    match = next((e for e in events if e["eventId"] == exercise_id), None)
    assert match is not None
    assert match["eventType"] == "exercise"
    assert match["participantCount"] >= 1


def test_fill_from_event_sets_status(client, admin_headers):
    exercise_id, pid = _exercise_with_participant(client, admin_headers, day="2026-11-02", name="Tölt Tibor", sztsz="14000002")
    response = client.post(
        "/api/attendance/fill",
        json={"date": "2026-11-02", "eventType": "exercise", "eventId": exercise_id, "status": "Szolgálatban"},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    entry = next(i for i in response.json()["items"] if i["personnelId"] == pid)
    assert entry["status"] == "Szolgálatban"


def test_fill_requires_editor_role(client):
    response = client.post(
        "/api/attendance/fill",
        json={"date": "2026-11-02", "eventType": "exercise", "eventId": "x", "status": "Szolgálatban"},
        headers=_reader_headers(client),
    )
    assert response.status_code == 403
