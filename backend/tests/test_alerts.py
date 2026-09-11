"""Kiterjesztett riasztások: igazolatlan távollét + készenléti rés."""
from __future__ import annotations

from datetime import date, timedelta


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


# ── Szabadság-minimum ─────────────────────────────────────────────────────

def _approved_leave(client, headers, pid, start, end):
    created = client.post(
        "/api/leave",
        json={"personnelId": pid, "type": "Szabadság", "startDate": start, "endDate": end},
        headers=headers,
    ).json()
    r = client.post(f"/api/leave/{created['id']}/decision", json={"approve": True}, headers=headers)
    assert r.status_code == 200, r.text


def test_leave_minimum_lists_active_below_threshold(client, admin_headers):
    year = date.today().year
    none_taken = _person(client, admin_headers, "Nulla Nándor", "14600010")
    some_taken = _person(client, admin_headers, "Kevés Kálmán", "14600011")
    enough = _person(client, admin_headers, "Elég Elemér", "14600012")
    # Március első hétfője → péntek = 5 munkanap; → a rákövetkező péntek = 10.
    monday = next(date(year, 3, d) for d in range(1, 8) if date(year, 3, d).weekday() == 0)
    one_week, two_weeks = monday + timedelta(days=4), monday + timedelta(days=11)
    _approved_leave(client, admin_headers, some_taken, monday.isoformat(), one_week.isoformat())
    _approved_leave(client, admin_headers, enough, monday.isoformat(), two_weeks.isoformat())

    body = client.get(f"/api/alerts/leave-minimum?year={year}", headers=admin_headers).json()
    by_id = {i["personnelId"]: i for i in body["items"]}

    assert body["minDays"] == 10
    assert by_id[none_taken]["takenDays"] == 0 and by_id[none_taken]["missingDays"] == 10
    assert by_id[some_taken]["takenDays"] == 5 and by_id[some_taken]["missingDays"] == 5
    assert enough not in by_id


def test_leave_minimum_counts_only_workdays_inside_the_year(client, admin_headers):
    year = date.today().year
    pid = _person(client, admin_headers, "Évforduló Ede", "14600013")
    # Átlóg az előző évből: csak az idei rész számít (jan 1-től).
    _approved_leave(client, admin_headers, pid, f"{year - 1}-12-29", f"{year}-01-04")

    body = client.get(f"/api/alerts/leave-minimum?year={year}", headers=admin_headers).json()
    item = next(i for i in body["items"] if i["personnelId"] == pid)
    expected = sum(1 for d in range(1, 5) if date(year, 1, d).weekday() < 5)
    assert item["takenDays"] == expected


# ── Alapkiképzés-határidő ─────────────────────────────────────────────────

def _reservist(client, headers, name, sztsz, join_date):
    r = client.post(
        "/api/personnel",
        json={"name": name, "sztsz": sztsz, "rank": "honvéd", "unit": "1. század",
              "status": "Tartalékos", "joinDate": join_date},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _module(client, headers, name):
    r = client.post("/api/qualifications/types", json={"name": name, "category": "Alapkiképzés"}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _grant(client, headers, pid, qual_id):
    r = client.post(
        f"/api/qualifications/personnel/{pid}",
        json={"personnelId": pid, "qualTypeId": qual_id, "earnedDate": "2026-05-01"},
        headers=headers,
    )
    assert r.status_code == 201, r.text


def test_basic_training_deadline_flags_incomplete_reservists(client, admin_headers):
    m1 = _module(client, admin_headers, "Alapkiképzés – teszt 1. modul")
    m2 = _module(client, admin_headers, "Alapkiképzés – teszt 2. modul")
    today = date.today()
    overdue = _reservist(client, admin_headers, "Csúszó Csaba", "14600020", (today - timedelta(days=400)).isoformat())
    on_track = _reservist(client, admin_headers, "Halad Hanna", "14600021", (today - timedelta(days=100)).isoformat())
    complete = _reservist(client, admin_headers, "Kész Kázmér", "14600022", (today - timedelta(days=500)).isoformat())
    no_date = _reservist(client, admin_headers, "Dátum Dénes", "14600023", "")
    _grant(client, admin_headers, on_track, m1)
    _grant(client, admin_headers, complete, m1)
    _grant(client, admin_headers, complete, m2)

    body = client.get("/api/alerts/basic-training", headers=admin_headers).json()
    by_id = {i["personnelId"]: i for i in body["items"]}

    assert {m["id"] for m in body["modules"]} >= {m1, m2}
    assert by_id[overdue]["daysLeft"] < 0
    assert by_id[on_track]["daysLeft"] > 0
    assert by_id[on_track]["completedModules"] == 1
    assert "Alapkiképzés – teszt 2. modul" in by_id[on_track]["missingModules"]
    assert by_id[no_date]["daysLeft"] is None
    assert complete not in by_id, "aki minden modult teljesített, nem riasztás"
    # Sorrend: lejárt elöl, dátum nélküli a végén.
    ids = [i["personnelId"] for i in body["items"]]
    assert ids.index(overdue) < ids.index(on_track) < ids.index(no_date)


# ── Évi 7 nap szolgálat ──────────────────────────────────────────────────

def _exercise_with(client, headers, name, start, end, participants, status="Tervezett"):
    r = client.post("/api/exercises", json={
        "name": name, "type": "Gyakorlat", "startDate": start, "endDate": end, "location": "Bázis",
        "maxPersonnel": 50, "description": "", "status": status, "qualificationId": "",
        "assigned": [{"personId": pid, "personName": n, "role": "résztvevő", "attendance": att} for pid, n, att in participants],
    }, headers=headers)
    assert r.status_code == 201, r.text


def test_service_minimum_counts_present_days_of_non_cancelled_events(client, admin_headers):
    year = date.today().year
    served = _reservist(client, admin_headers, "Szolgált Szilárd", "14600030", f"{year}-01-10")
    partial = _reservist(client, admin_headers, "Részben Rezső", "14600031", f"{year}-01-10")
    absent = _reservist(client, admin_headers, "Hiányzó Hugó", "14600032", f"{year}-01-10")
    cancelled_only = _reservist(client, admin_headers, "Lemondott Lóránt", "14600033", f"{year}-01-10")

    # 7 nap → teljesíti; 3 nap → részleges; hiányzott → 0; lemondott esemény → 0
    _exercise_with(client, admin_headers, "Hét napos", f"{year}-03-01", f"{year}-03-07",
                   [(served, "Szolgált Szilárd", "Megjelent"), (absent, "Hiányzó Hugó", "Hiányzott")])
    _exercise_with(client, admin_headers, "Három napos", f"{year}-04-01", f"{year}-04-03",
                   [(partial, "Részben Rezső", "Megjelent")])
    _exercise_with(client, admin_headers, "Lefújt", f"{year}-05-01", f"{year}-05-10",
                   [(cancelled_only, "Lemondott Lóránt", "Megjelent")], status="Lemondva")

    body = client.get(f"/api/alerts/service-minimum?year={year}", headers=admin_headers).json()
    by_id = {i["personnelId"]: i for i in body["items"]}

    assert body["minDays"] == 7 and body["deadline"] == f"{year}-12-31"
    assert served not in by_id
    assert by_id[partial]["servedDays"] == 3 and by_id[partial]["missingDays"] == 4
    assert by_id[absent]["servedDays"] == 0
    assert by_id[cancelled_only]["servedDays"] == 0


def test_service_minimum_clips_events_to_the_year(client, admin_headers):
    year = date.today().year
    pid = _reservist(client, admin_headers, "Évátlógó Ervin", "14600034", f"{year - 1}-06-01")
    _exercise_with(client, admin_headers, "Szilveszteri", f"{year - 1}-12-30", f"{year}-01-02",
                   [(pid, "Évátlógó Ervin", "Megjelent")])
    body = client.get(f"/api/alerts/service-minimum?year={year}", headers=admin_headers).json()
    item = next(i for i in body["items"] if i["personnelId"] == pid)
    assert item["servedDays"] == 2


# ── 11/11 modul → összesítő „Alapkiképzés" ────────────────────────────────

def test_all_modules_grant_the_summary_qualification(client, admin_headers):
    """Az alapkiképzési modulok (kategória) mind megvannak → automatikusan jár az
    összesítő „Alapkiképzés" képesítés, és az illető kikerül a határidő-riasztásból."""
    types = client.get("/api/qualifications/types", headers=admin_headers).json()
    module_ids = [t["id"] for t in types if t["category"] == "Alapkiképzés"]
    assert module_ids, "a korábbi teszt már létrehozott modulokat"
    pid = _reservist(client, admin_headers, "Teljes Tódor", "14600040", (date.today() - timedelta(days=10)).isoformat())

    for qual_id in module_ids:
        _grant(client, admin_headers, pid, qual_id)

    quals = client.get(f"/api/qualifications/personnel/{pid}", headers=admin_headers).json()
    assert any(q["qualTypeName"] == "Alapkiképzés" for q in quals)
    alerts = client.get("/api/alerts/basic-training", headers=admin_headers).json()
    assert pid not in {i["personnelId"] for i in alerts["items"]}


def test_basic_training_alert_flags_due_soon(client, admin_headers):
    soon = _reservist(client, admin_headers, "Sürgős Soma", "14600041", (date.today() - timedelta(days=350)).isoformat())
    body = client.get("/api/alerts/basic-training", headers=admin_headers).json()
    item = next(i for i in body["items"] if i["personnelId"] == soon)
    assert item["isDueSoon"] is True and item["isOverdue"] is False
    assert body["warnDays"] == 30
