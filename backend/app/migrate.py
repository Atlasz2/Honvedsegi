"""
Adatmodell-migráció: JSON tömbök → relációs táblák.

Futtatás: automatikusan, az alkalmazás indulásakor (startup.py hívja).
Idempotens – biztonságos többször is futtatni.
"""
from __future__ import annotations

import json
import uuid
import logging
from datetime import date, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from .models import new_id

log = logging.getLogger(__name__)

# ── segédfüggvények ────────────────────────────────────────────────────────────

def _table_exists(db: Session, name: str) -> bool:
    row = db.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:n"),
        {"n": name},
    ).fetchone()
    return row is not None


def _column_exists(db: Session, table: str, column: str) -> bool:
    rows = db.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return any(r[1] == column for r in rows)


def _migration_done(db: Session, key: str) -> bool:
    if not _table_exists(db, "db_migrations"):
        return False
    row = db.execute(
        text("SELECT 1 FROM db_migrations WHERE key=:k"), {"k": key}
    ).fetchone()
    return row is not None


def _mark_done(db: Session, key: str) -> None:
    db.execute(
        text("INSERT OR IGNORE INTO db_migrations (key) VALUES (:k)"), {"k": key}
    )
    db.commit()


# ── migration 0: meta tábla ────────────────────────────────────────────────────

def _ensure_migrations_table(db: Session) -> None:
    db.execute(text(
        "CREATE TABLE IF NOT EXISTS db_migrations "
        "(key TEXT PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')))"
    ))
    db.commit()


# ── migration 1: participants tábla feltöltése ─────────────────────────────────

def _migrate_participants(db: Session) -> None:
    key = "v1_participants_from_json"
    if _migration_done(db, key):
        return

    log.info("Migráció: JSON assigned → participants tábla")
    count = 0

    for event_type, table in [("exercise", "exercises"), ("training", "trainings"), ("event", "events")]:
        if not _table_exists(db, table):
            continue
        if not _column_exists(db, table, "assigned"):
            continue

        rows = db.execute(text(f"SELECT id, assigned FROM {table}")).fetchall()
        for row in rows:
            event_id, assigned_json = row[0], row[1]
            if not assigned_json:
                continue
            try:
                assigned = json.loads(assigned_json) if isinstance(assigned_json, str) else assigned_json
            except (json.JSONDecodeError, TypeError):
                continue
            if not isinstance(assigned, list):
                continue

            for item in assigned:
                if not isinstance(item, dict):
                    continue
                personnel_id = item.get("personId") or item.get("personnel_id", "")
                if not personnel_id:
                    continue
                # Már létezik-e?
                existing = db.execute(
                    text("SELECT id FROM participants WHERE event_type=:et AND event_id=:eid AND personnel_id=:pid"),
                    {"et": event_type, "eid": event_id, "pid": personnel_id},
                ).fetchone()
                if existing:
                    continue
                db.execute(text(
                    "INSERT INTO participants "
                    "(id, event_type, event_id, personnel_id, person_name, rank, rank_short, sztsz, role, status, qualification_approved, notes) "
                    "VALUES (:id,:et,:eid,:pid,:pn,:rk,:rks,:sz,:rl,:st,:qa,:no)"
                ), {
                    "id": new_id(),
                    "et": event_type,
                    "eid": event_id,
                    "pid": personnel_id,
                    "pn": item.get("personName") or item.get("person_name", ""),
                    "rk": item.get("rank", ""),
                    "rks": item.get("rankShort", ""),
                    "sz": item.get("sztsz", ""),
                    "rl": item.get("role", ""),
                    "st": item.get("attendance") or item.get("status", "Tervezett"),
                    "qa": 1 if item.get("qualificationApproved") else 0,
                    "no": item.get("notes", ""),
                })
                count += 1

    # duties
    if _table_exists(db, "duties") and _column_exists(db, "duties", "assigned"):
        rows = db.execute(text("SELECT id, assigned FROM duties")).fetchall()
        for row in rows:
            event_id, assigned_json = row[0], row[1]
            if not assigned_json:
                continue
            try:
                assigned = json.loads(assigned_json) if isinstance(assigned_json, str) else assigned_json
            except (json.JSONDecodeError, TypeError):
                continue
            if not isinstance(assigned, list):
                continue
            for item in assigned:
                if not isinstance(item, dict):
                    continue
                personnel_id = item.get("personId", "")
                if not personnel_id:
                    continue
                existing = db.execute(
                    text("SELECT id FROM participants WHERE event_type='duty' AND event_id=:eid AND personnel_id=:pid"),
                    {"eid": event_id, "pid": personnel_id},
                ).fetchone()
                if existing:
                    continue
                db.execute(text(
                    "INSERT INTO participants "
                    "(id, event_type, event_id, personnel_id, person_name, rank, rank_short, sztsz, role, status, qualification_approved, notes) "
                    "VALUES (:id,'duty',:eid,:pid,:pn,:rk,:rks,:sz,'',:st,0,'')"
                ), {
                    "id": new_id(),
                    "eid": event_id,
                    "pid": personnel_id,
                    "pn": item.get("personName", ""),
                    "rk": item.get("rank", ""),
                    "rks": item.get("rankShort", ""),
                    "sz": item.get("sztsz", ""),
                    "st": item.get("status", "Tervezett"),
                })
                count += 1

    db.commit()
    _mark_done(db, key)
    log.info("Participants migráció kész: %d bejegyzés", count)


# ── migration 2: personnel képesítések ────────────────────────────────────────

def _migrate_qualifications(db: Session) -> None:
    key = "v1_qualifications_from_json"
    if _migration_done(db, key):
        return

    if not _table_exists(db, "personnel") or not _column_exists(db, "personnel", "qualifications"):
        _mark_done(db, key)
        return

    log.info("Migráció: JSON qualifications → qualification_types + personnel_qualifications")

    rows = db.execute(text("SELECT id, qualifications FROM personnel")).fetchall()
    count = 0

    for person_id, qual_json in rows:
        if not qual_json:
            continue
        try:
            quals = json.loads(qual_json) if isinstance(qual_json, str) else qual_json
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(quals, list):
            continue

        for q in quals:
            name = str(q).strip() if q else ""
            if not name:
                continue

            # Típus létezik már?
            existing_type = db.execute(
                text("SELECT id FROM qualification_types WHERE name=:n"), {"n": name}
            ).fetchone()
            if existing_type:
                type_id = existing_type[0]
            else:
                type_id = new_id()
                db.execute(text(
                    "INSERT INTO qualification_types (id, name, category, validity_days, description) "
                    "VALUES (:id,:name,'Általános',NULL,'')"
                ), {"id": type_id, "name": name})

            # Személynek már megvan?
            existing_pq = db.execute(
                text("SELECT id FROM personnel_qualifications WHERE personnel_id=:pid AND qual_type_id=:qid"),
                {"pid": person_id, "qid": type_id},
            ).fetchone()
            if existing_pq:
                continue

            db.execute(text(
                "INSERT INTO personnel_qualifications "
                "(id, personnel_id, qual_type_id, earned_date, expiry_date, source_event_id, source_event_type, notes) "
                "VALUES (:id,:pid,:qid,:ed,NULL,NULL,NULL,'Migrált adat – kérjük ellenőrizd a dátumot')"
            ), {
                "id": new_id(),
                "pid": person_id,
                "qid": type_id,
                "ed": date.today().isoformat(),
            })
            count += 1

    db.commit()
    _mark_done(db, key)
    log.info("Qualifications migráció kész: %d bejegyzés (dátumok ellenőrzést igényelnek)", count)


# ── migration 3: alap képesítés-típusok ───────────────────────────────────────

_DEFAULT_QUAL_TYPES = [
    {"id": "alapkikepzes",  "name": "Alapkiképzés",           "category": "Kiképzés",     "validity_days": None},
    {"id": "elsosegely",    "name": "Elsősegély",              "category": "Egészségügyi", "validity_days": 3 * 365},
    {"id": "loveszeti",     "name": "Lövészeti",               "category": "Harcászati",   "validity_days": 365},
    {"id": "szakmai",       "name": "Szakmai kiképzés",        "category": "Kiképzés",     "validity_days": None},
    {"id": "parancsnoki",   "name": "Parancsnoki tanfolyam",   "category": "Parancsnoki",  "validity_days": None},
    {"id": "loter_bm",      "name": "Békeműveleti lőgyakorlat","category": "Harcászati",   "validity_days": 90},
    {"id": "nbc",           "name": "NBC védelmi kiképzés",    "category": "Különleges",   "validity_days": 2 * 365},
    {"id": "jarmuvezeto",   "name": "Katonai gépjárjogosítvány","category": "Logisztika",  "validity_days": None},
]


def _seed_default_qual_types(db: Session) -> None:
    key = "v1_seed_default_qual_types"
    if _migration_done(db, key):
        return
    for qt in _DEFAULT_QUAL_TYPES:
        existing = db.execute(
            text("SELECT id FROM qualification_types WHERE id=:i"), {"i": qt["id"]}
        ).fetchone()
        if existing:
            continue
        db.execute(text(
            "INSERT INTO qualification_types (id, name, category, validity_days, description) "
            "VALUES (:id,:name,:cat,:vd,'')"
        ), {"id": qt["id"], "name": qt["name"], "cat": qt["category"], "vd": qt["validity_days"]})
    db.commit()
    _mark_done(db, key)


# ── migration 4: képesítések a befejezett kiképzésekből ────────────────────────

def _migrate_qualifications_from_trainings(db: Session) -> None:
    key = "v1_qualifications_from_trainings"
    if _migration_done(db, key):
        return
    if not _table_exists(db, "trainings") or not _column_exists(db, "trainings", "assigned"):
        _mark_done(db, key)
        return

    log.info("Migráció: befejezett kiképzések → personnel_qualifications")
    count = 0

    rows = db.execute(
        text("SELECT id, qualification_id, end_date, assigned FROM trainings WHERE status='Befejezett'")
    ).fetchall()

    for training_id, qual_id, end_date, assigned_json in rows:
        if not qual_id or not qual_id.strip():
            continue
        qt_row = db.execute(
            text("SELECT id, validity_days FROM qualification_types WHERE id=:i"), {"i": qual_id}
        ).fetchone()
        if not qt_row:
            continue
        qt_id, validity_days = qt_row
        earned = end_date or date.today().isoformat()
        try:
            earned_date = date.fromisoformat(earned[:10])
        except ValueError:
            earned_date = date.today()
        expiry: str | None = None
        if validity_days:
            expiry = (earned_date + timedelta(days=validity_days)).isoformat()

        try:
            assigned = json.loads(assigned_json) if isinstance(assigned_json, str) else assigned_json
        except (json.JSONDecodeError, TypeError):
            assigned = []
        if not isinstance(assigned, list):
            continue

        for item in assigned:
            if not isinstance(item, dict):
                continue
            if item.get("attendance") != "Megjelent":
                continue
            if not item.get("qualificationApproved"):
                continue
            person_id = item.get("personId", "")
            if not person_id:
                continue
            existing = db.execute(
                text("SELECT id FROM personnel_qualifications WHERE personnel_id=:pid AND qual_type_id=:qid AND source_event_id=:eid"),
                {"pid": person_id, "qid": qt_id, "eid": training_id},
            ).fetchone()
            if existing:
                continue
            db.execute(text(
                "INSERT INTO personnel_qualifications "
                "(id, personnel_id, qual_type_id, earned_date, expiry_date, source_event_id, source_event_type, notes) "
                "VALUES (:id,:pid,:qid,:ed,:exp,:eid,'training','')"
            ), {
                "id": new_id(), "pid": person_id, "qid": qt_id,
                "ed": earned_date.isoformat(), "exp": expiry, "eid": training_id,
            })
            count += 1

    db.commit()
    _mark_done(db, key)
    log.info("Képesítés-migráció kiképzésekből: %d bejegyzés", count)


# ── migration: rendfokozat-nevek egységesítése ────────────────────────────────

# A rendfokozatok korábban három helyen, egymástól függetlenül éltek, ezért
# elcsúsztak: a seed fix demó-személyei "Közkatona"-t kaptak, a generált
# állomány "Honvéd"-et, a frontend legördülője pedig csak az előbbit ismerte.
# A hivatalos létra (constants.RANKS) a "Honvéd"-et használja; ez a migráció a
# meglévő adatbázisokat is arra igazítja, hogy ne maradjon ismeretlen fokozat.
_RANK_RENAMES = {"Közkatona": "Honvéd"}


def _migrate_rank_names(db: Session) -> None:
    key = "v2_rank_names_official"
    if _migration_done(db, key):
        return

    for old_name, new_name in _RANK_RENAMES.items():
        result = db.execute(
            text("UPDATE personnel SET rank = :new WHERE rank = :old"),
            {"new": new_name, "old": old_name},
        )
        if result.rowcount:
            log.info("Rendfokozat átnevezve: %s -> %s (%d fő)", old_name, new_name, result.rowcount)

    db.commit()
    _mark_done(db, key)


def _migrate_cancelled_status(db: Session) -> None:
    """A gyakorlat „Törölve" státusza „Lemondva" lett (a kiképzés is kapta)."""
    key = "v3_cancelled_status_lemondva"
    if _migration_done(db, key):
        return
    for table in ("exercises", "trainings"):
        if not _table_exists(db, table):
            continue
        result = db.execute(text(f"UPDATE {table} SET status = 'Lemondva' WHERE status = 'Törölve'"))
        if result.rowcount:
            log.info("%s: %d Törölve → Lemondva", table, result.rowcount)
    db.commit()
    _mark_done(db, key)


def _migrate_duties_into_exercises(db: Session) -> None:
    """A szolgálatok a Műveletekbe olvadnak (döntés: 2026-09-12). Minden szolgálat
    gyakorlat lesz a szolgálat típusával, a beosztottak résztvevők; az azonosító
    megmarad. A duties tábla üresen marad, a kód nem használja többé."""
    key = "v4_duties_into_exercises"
    if _migration_done(db, key) or not _table_exists(db, "duties"):
        _mark_done(db, key) if not _migration_done(db, key) else None
        return
    from .services.lifecycle import derive_temporal_status

    rows = db.execute(text(
        "SELECT id, type, start_date, end_date, location, person_id, person_name, assigned, notes, status FROM duties"
    )).fetchall()
    moved = 0
    for (duty_id, dtype, start, end, location, person_id, person_name, assigned_json, notes, dstatus) in rows:
        if db.execute(text("SELECT 1 FROM exercises WHERE id=:id"), {"id": duty_id}).first():
            continue
        assigned = json.loads(assigned_json) if isinstance(assigned_json, str) and assigned_json else (assigned_json or [])
        people = [{"personId": person_id, "personName": person_name}] if person_id else []
        people += [a for a in assigned if isinstance(a, dict) and a.get("personId")]
        status = "Lemondva" if dstatus == "Lemondva" else derive_temporal_status(start or "", end or "")
        db.execute(text(
            "INSERT INTO exercises (id, name, type, start_date, end_date, location, organizer, max_personnel, description, status, qualification_id, series_id, level, assigned) "
            "VALUES (:id, :name, :type, :start, :end, :location, '', :maxp, :desc, :status, '', '', '', '[]')"
        ), {
            "id": duty_id, "name": f"{dtype} – {location}".strip(" –") if location else dtype, "type": dtype,
            "start": start or "", "end": end or start or "", "location": location or "",
            "maxp": max(1, len(people)), "desc": notes or "", "status": status,
        })
        participant_status = "Megjelent" if dstatus == "Teljesített" else "Tervezett"
        seen: set[str] = set()
        for person in people:
            pid = str(person.get("personId", ""))
            if not pid or pid in seen:
                continue
            seen.add(pid)
            db.execute(text(
                "INSERT INTO participants (id, event_type, event_id, personnel_id, person_name, rank, rank_short, sztsz, role, status, qualification_approved, notes) "
                "VALUES (:id, 'exercise', :eid, :pid, :pname, '', '', '', 'szolgálat', :status, 0, '')"
            ), {"id": uuid.uuid4().hex, "eid": duty_id, "pid": pid, "pname": person.get("personName", ""), "status": participant_status})
        # a korábban duty-ként rögzített résztvevők is átkerülnek
        db.execute(text("UPDATE participants SET event_type='exercise' WHERE event_type='duty' AND event_id=:eid"), {"eid": duty_id})
        moved += 1
    db.execute(text("DELETE FROM duties"))
    if moved:
        log.info("Szolgálatok átvezetve a Műveletekbe: %d", moved)
    db.commit()
    _mark_done(db, key)


def _mark_shadow_events(db: Session) -> None:
    """A gyakorlat/kiképzés azonosítójával létrejött event-sorok árnyékok, nem
    események — eddig duplán látszottak a naptárban és a foglaltságban."""
    key = "v5_mark_shadow_events"
    if _migration_done(db, key):
        return
    from .constants import SHADOW_EVENT_TYPE
    sources = [t for t in ("exercises", "trainings") if _table_exists(db, t)]
    if not sources:
        _mark_done(db, key)
        return
    subquery = " OR ".join(f"id IN (SELECT id FROM {t})" for t in sources)
    result = db.execute(text(f"UPDATE events SET event_type = :t WHERE {subquery}"), {"t": SHADOW_EVENT_TYPE})
    if result.rowcount:
        log.info("Árnyék-esemény megjelölve: %d", result.rowcount)
    db.commit()
    _mark_done(db, key)


def _migrate_trainings_into_exercises(db: Session) -> None:
    """A kiképzés is művelet (döntés: 2026-09-13). Minden trainings-sor gyakorlat
    lesz ugyanazzal az azonosítóval (a szervező mező átmegy), a résztvevők,
    követelmények és képesítés-források event_type-ja 'exercise' lesz."""
    key = "v6_trainings_into_exercises"
    if _migration_done(db, key):
        return
    if not _table_exists(db, "trainings"):
        _mark_done(db, key)
        return
    ex_cols = {r[1] for r in db.execute(text("PRAGMA table_info(exercises)")).fetchall()}
    if "organizer" not in ex_cols:
        db.execute(text("ALTER TABLE exercises ADD COLUMN organizer TEXT DEFAULT ''"))
    tr_cols = {r[1] for r in db.execute(text("PRAGMA table_info(trainings)")).fetchall()}
    def col(name, default="''"):
        return name if name in tr_cols else default
    moved = db.execute(text(
        "INSERT INTO exercises (id, name, type, start_date, end_date, location, organizer, max_personnel, description, status, qualification_id, series_id, level, assigned) "
        f"SELECT id, name, type, start_date, end_date, COALESCE(location,''), COALESCE({col('organizer')},''), COALESCE(max_personnel,0), COALESCE(description,''), "
        f"CASE WHEN status='Törölve' THEN 'Lemondva' ELSE COALESCE(status,'Tervezett') END, COALESCE({col('qualification_id')},''), COALESCE({col('series_id')},''), COALESCE({col('level')},''), COALESCE(assigned,'[]') "
        "FROM trainings WHERE id NOT IN (SELECT id FROM exercises)"
    )).rowcount
    db.execute(text("UPDATE participants SET event_type='exercise' WHERE event_type='training'"))
    if _table_exists(db, "event_prerequisites"):
        db.execute(text("UPDATE event_prerequisites SET event_type='exercise' WHERE event_type='training'"))
    if _table_exists(db, "personnel_qualifications"):
        db.execute(text("UPDATE personnel_qualifications SET source_event_type='exercise' WHERE source_event_type='training'"))
    db.execute(text("DELETE FROM trainings"))
    if moved:
        log.info("Kiképzések átvezetve a Műveletekbe: %d", moved)
    db.commit()
    _mark_done(db, key)


# ── belépési pont ──────────────────────────────────────────────────────────────

def run_all(db: Session) -> None:
    _ensure_migrations_table(db)
    _seed_default_qual_types(db)
    _migrate_participants(db)
    _migrate_qualifications(db)
    _migrate_qualifications_from_trainings(db)
    _migrate_rank_names(db)
    _migrate_cancelled_status(db)
    _migrate_duties_into_exercises(db)
    _mark_shadow_events(db)
    _migrate_trainings_into_exercises(db)
