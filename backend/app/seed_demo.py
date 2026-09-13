"""Demó-adatbázis a tervezett felépítéssel: három zászlóalj (31. TVZ – Veszprém,
83. TVZ – Vas, 19. TVZ – Győr-Moson-Sopron) + ezredtörzs (Győr), zászlóaljanként
saját állomány, műveletek, szolgálatok, események, parancsok, közlemények,
létszám, szabadság, képesítések — a MAI naphoz igazítva, hogy minden nézet
mutasson valamit.

Felhasználók (fejlesztői jelszavak, csak demóra):
  admin/Admin123 (rendszer), ficzay/Ficzay1234 (admin, ezredtörzs),
  toth/Toth1234 (admin, ezredtörzs), rogel/Rogel1234 (31. TVZ – Veszprém),
  kiss/Kiss1234 (83. TVZ – Vas), csore/Csore1234 (19. TVZ – Győr-M-S),
  olvaso/olvaso123, szerkeszto/szerkeszto123, devmaster (env).

Futtatás: backend/reseed_demo.py — MINDENT töröl és újratölt.
"""
from __future__ import annotations

import random
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.orm import Session

from .constants import DUTY_EXERCISE_TYPES, ORDER_DEFAULT_ISSUER
from .core.privileged import god_username
from .models import (
    ActivityLogModel, AnnouncementModel, AppSettingModel, AttendanceClosureModel, AttendanceModel, DutyModel,
    EquipmentModel, EventModel, EventPrerequisiteModel, ExerciseModel, LeaveRequestModel, LoginAttemptModel,
    OrderChapterModel, OrderModel, OrderTypeModel, ParticipantModel, PersonDocumentModel, PersonModel,
    PersonnelQualificationModel, QualificationTypeModel, SeriesModel, SessionTokenModel, SupplyModel,
    UserModel, VehicleModel, new_id,
)
from .participants import sync_participants
from .security import hash_password
from .seed import BATTALION_RANK_WEIGHTS, STAFF_RANK_WEIGHTS, _optional_secret_for_nonprod, _require_secret
from .shortrank import short_rank

BATTALIONS = {"31 TVZ": "Veszprém", "83 TVZ": "Szombathely", "19 TVZ": "Győr"}
EZRED = "Ezredtörzs"

MALE = ["Ádám", "Bence", "Csaba", "Dávid", "Erik", "Ferenc", "Gábor", "Hunor", "István", "János", "Kristóf", "Levente",
        "Márk", "Norbert", "Olivér", "Péter", "Richárd", "Sándor", "Tamás", "Viktor", "Zoltán", "Máté", "Balázs", "Attila"]
FEMALE = ["Anita", "Beáta", "Csilla", "Dóra", "Erika", "Fanni", "Gabriella", "Hanna", "Judit", "Katalin", "Lilla",
          "Nóra", "Orsolya", "Petra", "Réka", "Szilvia", "Tímea", "Virág", "Zsófia", "Eszter", "Noémi", "Anna"]
LAST = ["Kovács", "Szabó", "Nagy", "Tóth", "Varga", "Kiss", "Molnár", "Németh", "Farkas", "Horváth", "Balogh", "Papp",
        "Lakatos", "Takács", "Juhász", "Mészáros", "Oláh", "Simon", "Rácz", "Fekete", "Bíró", "Boros", "Kelemen", "Lukács",
        "Gulyás", "Sipos", "Veres", "Bodnár", "Király", "Szalai", "Pintér", "Fodor", "Vincze", "Hegedűs", "Orbán"]
STREETS = ["Kossuth Lajos utca", "Petőfi Sándor utca", "Rákóczi út", "Ady Endre utca", "József Attila utca", "Dózsa György út", "Fő utca", "Béke utca"]
TOWNS = {
    "31 TVZ": ["Veszprém", "Pápa", "Tapolca", "Ajka", "Balatonfüred", "Várpalota"],
    "83 TVZ": ["Szombathely", "Kőszeg", "Sárvár", "Körmend", "Celldömölk", "Szentgotthárd"],
    "19 TVZ": ["Győr", "Mosonmagyaróvár", "Sopron", "Csorna", "Kapuvár", "Tét"],
    EZRED: ["Győr", "Győrújbarát", "Abda"],
}
LOCATIONS = {
    "31 TVZ": ["Veszprém, Jutasi laktanya", "Hajmáskér, lőtér", "Várpalota, gyakorlótér"],
    "83 TVZ": ["Szombathely, laktanya", "Kőszeg, lőtér", "Sárvár, gyakorlótér"],
    "19 TVZ": ["Győr, laktanya", "Győr, ezred lőtér", "Mosonmagyaróvár, gyakorlótér"],
    EZRED: ["Győr, ezredtörzs", "Győr, ezred lőtér", "Hajmáskér, lőtér"],
}
EXERCISE_TYPES = ["Lőgyakorlat", "Terepgyakorlat", "Törzsgyakorlat", "Menetgyakorlat", "Objektumvédelmi gyakorlat", "Kiképzés"]
EXERCISE_NAMES = ["Acél Pajzs", "Vihar", "Őrszem", "Turul", "Hajnal", "Kard", "Bakony", "Rába", "Duna", "Fertő"]
TRAINING_NAMES = ["Alapkiképzés 1. modul", "Alapkiképzés 2. modul", "Alapkiképzés 3. modul", "Lövészeti felkészítés", "Elsősegély tanfolyam", "Híradó felkészítés", "Gépjárművezetői felkészítés"]
EVENT_TYPES = ["Állománygyűlés", "Ünnepség", "Tájékoztató", "Családi nap", "Parancsnoki értekezlet"]


def _slug(v: str) -> str:
    return (v.lower().replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ö", "o")
            .replace("ő", "o").replace("ú", "u").replace("ü", "u").replace("ű", "u").replace(" ", ""))


def _wipe(db: Session) -> None:
    for model in (SessionTokenModel, LoginAttemptModel, ActivityLogModel, AnnouncementModel, AttendanceClosureModel, AttendanceModel,
                  LeaveRequestModel, OrderChapterModel, OrderModel, OrderTypeModel, ParticipantModel, EventPrerequisiteModel,
                  PersonnelQualificationModel, QualificationTypeModel, PersonDocumentModel, SeriesModel, DutyModel, EquipmentModel,
                  EventModel, ExerciseModel, SupplyModel, VehicleModel, PersonModel, UserModel):
        db.execute(delete(model))
    db.execute(delete(AppSettingModel).where(AppSettingModel.key.notlike("%.enabled")))
    db.commit()


def reseed_demo_database(db: Session, random_seed: int = 7, today: date | None = None) -> dict[str, int]:
    rng = random.Random(random_seed)
    today = today or date.today()
    iso = lambda d: d.isoformat()  # noqa: E731
    _wipe(db)

    # ── Felhasználók ────────────────────────────────────────────────────────
    admin_pwd = _require_secret("BACKEND_ADMIN_PASSWORD")
    dev_pwd = _require_secret("BACKEND_DEV_MASTER_PASSWORD")
    users = [
        UserModel(username="admin", password_hash=hash_password(admin_pwd), display_name="Rendszer Admin", role="admin", active=True, region="", department=""),
        UserModel(username="ficzay", password_hash=hash_password("Ficzay1234"), display_name="Ficzay A.", role="admin", active=True, region="", department="Hadművelet"),
        UserModel(username="toth", password_hash=hash_password("Toth1234"), display_name="Tóth Rafael", role="admin", active=True, region="", department="Kiképzés"),
        UserModel(username="rogel", password_hash=hash_password("Rogel1234"), display_name="Rogel-Závodszki K.", role="editor", active=True, region="Veszprém", department="Személyügy"),
        UserModel(username="kiss", password_hash=hash_password("Kiss1234"), display_name="Kiss Félix", role="editor", active=True, region="Vas", department="Kiképzés"),
        UserModel(username="csore", password_hash=hash_password("Csore1234"), display_name="Csóré Jenő", role="editor", active=True, region="Győr-Moson-Sopron", department="Ügyvitel"),
        UserModel(username="olvaso", password_hash=hash_password(_optional_secret_for_nonprod("BACKEND_READER_PASSWORD", "olvaso123")), display_name="Teszt Olvasó", role="reader", active=True, region="Veszprém"),
        UserModel(username="szerkeszto", password_hash=hash_password(_optional_secret_for_nonprod("BACKEND_EDITOR_PASSWORD", "szerkeszto123")), display_name="Teszt Szerkesztő", role="editor", active=True, region="", department="Ügyvitel"),
        UserModel(username=god_username(), password_hash=hash_password(dev_pwd), display_name="Alkotó", role="fejleszto", active=True, protected=True),
    ]
    db.add_all(users)

    # ── Állomány ────────────────────────────────────────────────────────────
    plan = {"31 TVZ": 140, "83 TVZ": 130, "19 TVZ": 135, EZRED: 36}
    persons: list[PersonModel] = []
    by_unit: dict[str, list[PersonModel]] = {u: [] for u in plan}
    sztsz = 30000001
    for unit, count in plan.items():
        weights = STAFF_RANK_WEIGHTS if unit == EZRED else BATTALION_RANK_WEIGHTS
        for _ in range(count):
            female = rng.random() < 0.2
            first = rng.choice(FEMALE if female else MALE)
            last = rng.choice(LAST)
            if unit == EZRED:
                status = rng.choices(["Aktív", "Szabadságon"], weights=[92, 8])[0]
            else:
                status = rng.choices(["Aktív", "Tartalékos", "Szabadságon", "Leszerelt"], weights=[38, 52, 6, 4])[0]
            if status in ("Aktív", "Szabadságon"):
                service_type = rng.choices(["Hivatásos", "Szerződéses"], weights=[45, 55])[0]
            elif status == "Tartalékos":
                service_type = rng.choices(["Önkéntes tartalékos", "Állandó behívásos"], weights=[70, 30])[0]
            else:
                service_type = ""
            join = today - timedelta(days=rng.randint(40, 4000))
            if status == "Tartalékos" and rng.random() < 0.25:
                join = today - timedelta(days=rng.randint(200, 340))   # alapkiképzés-határidő közel
            town = rng.choice(TOWNS[unit])
            p = PersonModel(
                id=new_id(), name=f"{last} {first}", sztsz=str(sztsz),
                rank=rng.choices([n for n, _ in weights], weights=[w for _, w in weights])[0],
                unit=unit, beosztas=rng.choice(["lövész", "rajparancsnok", "híradó", "gépjárművezető", "egészségügyi", "szakaszparancsnok", "ügyviteli"] if unit != EZRED else ["törzstiszt", "ügyviteli", "személyügyi", "kiképzési", "logisztikai", "hadműveleti"]),
                status=status, service_type=service_type,
                email=f"{_slug(last)}.{_slug(first)}@honved.local", phone=f"+36 {rng.choice([20, 30, 70])} {rng.randint(100, 999)} {rng.randint(1000, 9999)}",
                birth_date=iso(date(rng.randint(1975, 2004), rng.randint(1, 12), rng.randint(1, 28))),
                address=f"{town}, {rng.choice(STREETS)} {rng.randint(1, 120)}.", join_date=iso(join), notes="",
                extra={"Orvosi alkalmassági": iso(today - timedelta(days=rng.randint(30, 400)))} if rng.random() < 0.7 else {},
            )
            persons.append(p)
            by_unit[unit].append(p)
            sztsz += 1
    db.add_all(persons)
    db.flush()
    names = {p.id: p for p in persons}

    def active(unit: str) -> list[PersonModel]:
        return [p for p in by_unit[unit] if p.status in ("Aktív", "Tartalékos")]

    # ── Képesítés-típusok + kiadott képesítések ─────────────────────────────
    qual_types = [
        QualificationTypeModel(id=new_id(), name="Alapkiképzés 1. modul", category="Alapkiképzés", validity_days=None, description="Alaki, szabályzatismeret"),
        QualificationTypeModel(id=new_id(), name="Alapkiképzés 2. modul", category="Alapkiképzés", validity_days=None, description="Lőkiképzés alap"),
        QualificationTypeModel(id=new_id(), name="Alapkiképzés 3. modul", category="Alapkiképzés", validity_days=None, description="Harcászat alap"),
        QualificationTypeModel(id=new_id(), name="Alapkiképzés", category="Összesített", validity_days=None, description="Mind a három modul teljesítve"),
        QualificationTypeModel(id=new_id(), name="Lövész alap", category="Lövészet", validity_days=365, description=""),
        QualificationTypeModel(id=new_id(), name="Elsősegély", category="Egészségügy", validity_days=730, description=""),
        QualificationTypeModel(id=new_id(), name="Gépjárművezető B", category="Vezetés", validity_days=None, description=""),
        QualificationTypeModel(id=new_id(), name="Híradó kezelő", category="Híradás", validity_days=1095, description=""),
        QualificationTypeModel(id=new_id(), name="ABV alap", category="ABV", validity_days=730, description=""),
    ]
    db.add_all(qual_types)
    db.flush()
    qt = {q.name: q for q in qual_types}
    modules = [qt["Alapkiképzés 1. modul"], qt["Alapkiképzés 2. modul"], qt["Alapkiképzés 3. modul"]]
    quals: list[PersonnelQualificationModel] = []
    for p in persons:
        if p.status == "Leszerelt":
            continue
        done_modules = 3 if p.status != "Tartalékos" or rng.random() < 0.65 else rng.randint(0, 2)
        for m in modules[:done_modules]:
            quals.append(PersonnelQualificationModel(id=new_id(), personnel_id=p.id, qual_type_id=m.id, earned_date=iso(today - timedelta(days=rng.randint(60, 900))), expiry_date=None, notes=""))
        if done_modules == 3:
            quals.append(PersonnelQualificationModel(id=new_id(), personnel_id=p.id, qual_type_id=qt["Alapkiképzés"].id, earned_date=iso(today - timedelta(days=rng.randint(60, 900))), expiry_date=None, notes=""))
        for name in ("Lövész alap", "Elsősegély", "Gépjárművezető B", "Híradó kezelő", "ABV alap"):
            if rng.random() < {"Lövész alap": 0.6, "Elsősegély": 0.4, "Gépjárművezető B": 0.3, "Híradó kezelő": 0.15, "ABV alap": 0.2}[name]:
                q = qt[name]
                earned = today - timedelta(days=rng.randint(10, (q.validity_days or 1000) + 60))
                expiry = iso(earned + timedelta(days=q.validity_days)) if q.validity_days else None
                quals.append(PersonnelQualificationModel(id=new_id(), personnel_id=p.id, qual_type_id=q.id, earned_date=iso(earned), expiry_date=expiry, notes=""))
    db.add_all(quals)

    # ── Sorozatok, műveletek, szolgálatok, események ───────────────────────
    exercises: list[tuple[ExerciseModel, list[dict]]] = []
    events: list[tuple[EventModel, list[dict]]] = []

    def assignment(p: PersonModel, role: str, attendance: str) -> dict:
        return {"personId": p.id, "personName": p.name, "role": role, "attendance": attendance, "rank": p.rank, "rankShort": short_rank(p.rank), "sztsz": p.sztsz}

    def make_exercise(unit: str, name: str, etype: str, start: date, days: int, people: list[PersonModel], organizer: str = "", series_id: str = "", level: str = "", qual_id: str = "", location: str | None = None, cancelled: bool = False) -> ExerciseModel:
        end = start + timedelta(days=days)
        if cancelled:
            status = "Lemondva"
        elif end < today:
            status = "Befejezett"
        elif start <= today:
            status = "Folyamatban"
        else:
            status = "Tervezett"
        ex = ExerciseModel(id=new_id(), name=name, type=etype, start_date=iso(start), end_date=iso(end),
                           location=location or rng.choice(LOCATIONS[unit]), organizer=organizer, unit=unit if unit != EZRED else "",
                           max_personnel=max(len(people) + rng.randint(0, 6), 1), description="", status=status,
                           qualification_id=qual_id, series_id=series_id, level=level, assigned=[])
        attendance = "Megjelent" if status == "Befejezett" else "Tervezett"
        assigned = [assignment(p, rng.choice(["résztvevő", "résztvevő", "rajparancsnok", "biztosító"]), attendance) for p in people]
        if status == "Befejezett" and assigned:
            for a in rng.sample(assigned, k=min(len(assigned), rng.randint(0, 2))):
                a["attendance"] = rng.choice(["Hiányzott", "Beteg"])
        exercises.append((ex, assigned))
        return ex

    for unit in BATTALIONS:
        pool = active(unit)
        series = SeriesModel(id=new_id(), name=f"7×20 Tartalékos szakfelkészítés – {unit}", description="Évi hét alkalom, húsz fő")
        db.add(series)
        db.flush()
        reservists = [p for p in pool if p.status == "Tartalékos"]
        for idx, (level, offset) in enumerate((("Alap", -70), ("Haladó", -21), ("Emelt", 24))):
            make_exercise(unit, "7×20 szakfelkészítés", "Kiképzés", today + timedelta(days=offset), 2, rng.sample(reservists, min(20, len(reservists))),
                          organizer="Kiképzési részleg", series_id=series.id, level=level, qual_id=qt["Lövész alap"].id if idx == 0 else "")
        # múltbeli és jövőbeli gyakorlatok
        for i in range(14):
            offset = rng.randint(-95, 95)
            days = rng.randint(1, 5)
            k = rng.randint(8, 30)
            make_exercise(unit, f"{rng.choice(EXERCISE_NAMES)} {today.year % 100}/{i + 1:02d}", rng.choice(EXERCISE_TYPES[:5]),
                          today + timedelta(days=offset), days, rng.sample(pool, min(k, len(pool))), cancelled=rng.random() < 0.08)
        # egy ma is zajló gyakorlat
        make_exercise(unit, f"Készenléti gyakorlat {unit}", "Terepgyakorlat", today - timedelta(days=1), 2, rng.sample(pool, 12))
        # kiképzések (modulok) — alapkiképzés-modult ad
        for i, m in enumerate(modules):
            make_exercise(unit, m.name, "Kiképzés", today + timedelta(days=-40 + i * 30), 4, rng.sample(reservists, min(15, len(reservists))),
                          organizer="Kiképzési részleg", qual_id=m.id)
        make_exercise(unit, "Elsősegély tanfolyam", "Kiképzés", today + timedelta(days=9), 2, rng.sample(pool, 12), organizer="Egészségügyi részleg", qual_id=qt["Elsősegély"].id)
        # szolgálatok: napi őrszolgálat és ügyelet ±14 nap
        duty_pool = [p for p in pool if p.status == "Aktív"]
        for d in range(-14, 15):
            day = today + timedelta(days=d)
            for dtype, loc in (("Őrszolgálat", "laktanya főkapu"), ("Ügyeleti szolgálat", "ügyeletes tiszti szoba")):
                p = rng.choice(duty_pool)
                start = datetime(day.year, day.month, day.day, 8 if dtype == "Őrszolgálat" else 7)
                ex = ExerciseModel(id=new_id(), name=f"{dtype} – {loc}", type=dtype, start_date=start.strftime("%Y-%m-%dT%H:%M"),
                                   end_date=(start + timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M"), location=f"{TOWNS[unit][0]}, {loc}",
                                   organizer="", unit=unit, max_personnel=1, description="", status="Befejezett" if day < today else ("Folyamatban" if day == today else "Tervezett"),
                                   qualification_id="", series_id="", level="", assigned=[])
                if day < today:
                    ex.handover = {"handedOverBy": rng.choice(duty_pool).name, "handedOverAt": (start + timedelta(hours=24)).isoformat(timespec="minutes"),
                                   "takenOverBy": p.name, "takenOverAt": (start + timedelta(hours=24, minutes=5)).isoformat(timespec="minutes"), "note": "Rendkívüli esemény nem történt."}
                exercises.append((ex, [assignment(p, "szolgálat", "Megjelent" if day <= today else "Tervezett")]))
        # események
        for i in range(4):
            offset = rng.randint(-30, 40)
            start = today + timedelta(days=offset)
            ppl = rng.sample(pool, rng.randint(20, 60))
            ev = EventModel(id=new_id(), event_type="esemeny", name=f"{rng.choice(EVENT_TYPES)} – {unit}", type=rng.choice(EVENT_TYPES), unit=unit,
                            start_date=iso(start), end_date=iso(start), location=rng.choice(LOCATIONS[unit]), organizer=unit, max_personnel=len(ppl) + 10,
                            description="", status="Befejezett" if start < today else ("Folyamatban" if start == today else "Tervezett"), assigned=[])
            events.append((ev, [assignment(p, "résztvevő", "Megjelent" if start < today else "Tervezett") for p in ppl]))

    # ezredszintű műveletek: minden zászlóaljból résztvevők
    everyone = [p for u in BATTALIONS for p in active(u)]
    for i, (name, offset, days) in enumerate((("Ezred lőgyakorlat", -12, 3), ("Bakony 26 ezredgyakorlat", 18, 5), ("Ezred törzsgyakorlat", 40, 2), ("Ezred menetgyakorlat", -50, 2))):
        make_exercise(EZRED, name, "Lőgyakorlat" if "lő" in name else "Törzsgyakorlat", today + timedelta(days=offset), days,
                      rng.sample(everyone, 45) + rng.sample(active(EZRED), 6), organizer="Ezredtörzs hadműveleti részleg", location=rng.choice(LOCATIONS[EZRED]))
    for name, offset in (("Ezred állománygyűlés", 6), ("Csapatzászló-ünnepség", 33), ("Parancsnoki értekezlet", 0)):
        ppl = rng.sample(everyone, 40) + active(EZRED)[:10]
        start = today + timedelta(days=offset)
        ev = EventModel(id=new_id(), event_type="esemeny", name=name, type="Ünnepség" if "ünnep" in name else "Parancsnoki", unit="",
                        start_date=iso(start) + ("T09:00" if offset == 0 else ""), end_date=iso(start) + ("T11:00" if offset == 0 else ""), location="Győr, ezredtörzs", organizer="Ezredtörzs",
                        max_personnel=len(ppl) + 20, description="", status="Folyamatban" if offset == 0 else "Tervezett", assigned=[])
        events.append((ev, [assignment(p, "résztvevő", "Tervezett") for p in ppl]))

    db.add_all([ex for ex, _ in exercises] + [ev for ev, _ in events])
    db.flush()
    for ex, assigned in exercises:
        sync_participants(db, "exercise", ex.id, assigned)
    for ev, assigned in events:
        sync_participants(db, "event", ev.id, assigned)

    # ── Létszám: elmúlt 7 nap + ma; lezárás két zászlóaljnál ────────────────
    duty_today = {a["personId"] for ex, assigned in exercises if ex.type in DUTY_EXERCISE_TYPES and ex.start_date[:10] <= iso(today) <= ex.end_date[:10] for a in assigned}
    for d in range(-7, 1):
        day = today + timedelta(days=d)
        for unit in list(BATTALIONS) + [EZRED]:
            if d == 0 and unit == "19 TVZ":
                continue   # a győri zászlóalj ma még nem rögzített — a Teendőimben „még nincs lezárva"
            for p in by_unit[unit]:
                if p.status in ("Leszerelt", "Tartalékos"):
                    continue
                r = rng.random()
                if p.id in duty_today and d == 0:
                    status, note = "Szolgálatban", ""
                elif p.status == "Szabadságon":
                    status, note = "Szabadság", "éves szabadság"
                elif r < 0.04:
                    status, note = "Betegállomány", "táppapír"
                elif r < 0.06:
                    status, note = "Kiküldetés", rng.choice(["Budapest, HM", "tanfolyam"])
                elif r < 0.065:
                    status, note = "Igazolatlan távollét", ""
                else:
                    continue   # Jelen = nincs rekord
                db.add(AttendanceModel(id=new_id(), date=iso(day), personnel_id=p.id, status=status, note=note, recorded_by="rogel" if unit == "31 TVZ" else "kiss" if unit == "83 TVZ" else "csore"))
            if d < 0 or unit in ("31 TVZ", "83 TVZ"):
                closer = {"31 TVZ": ("rogel", "Rogel-Závodszki K."), "83 TVZ": ("kiss", "Kiss Félix"), "19 TVZ": ("csore", "Csóré Jenő"), EZRED: ("ficzay", "Ficzay A.")}[unit]
                db.add(AttendanceClosureModel(id=new_id(), date=iso(day), unit=unit if unit != EZRED else "", closed_by=closer[0], closed_by_name=closer[1],
                                              closed_at=datetime(day.year, day.month, day.day, 8, rng.randint(5, 40), tzinfo=timezone.utc), note=""))

    # ── Szabadság-kérelmek ──────────────────────────────────────────────────
    for unit in BATTALIONS:
        act = [p for p in by_unit[unit] if p.status == "Aktív"]
        for p in rng.sample(act, 6):
            start = today + timedelta(days=rng.randint(-20, 30))
            length = rng.randint(1, 9)
            past = start + timedelta(days=length) < today
            db.add(LeaveRequestModel(id=new_id(), personnel_id=p.id, type="Szabadság", start_date=iso(start), end_date=iso(start + timedelta(days=length)),
                                     reason=rng.choice(["családi ok", "pihenő", "költözés", ""]), status="Jóváhagyva" if past or rng.random() < 0.5 else "Beadva",
                                     requested_by="rogel", decided_by="ficzay" if past else ""))
        for p in [x for x in by_unit[unit] if x.service_type == "Állandó behívásos"][:2]:
            start = today + timedelta(days=rng.randint(2, 20))
            db.add(LeaveRequestModel(id=new_id(), personnel_id=p.id, type="Szolgálatmentesség", start_date=iso(start), end_date=iso(start + timedelta(days=3)), reason="", status="Beadva", requested_by="kiss"))

    # ── Parancsok ───────────────────────────────────────────────────────────
    types = [
        OrderTypeModel(id=new_id(), name="Leszerelési parancs", description="Tartalékos leszerelése", chapters=[
            {"name": "Bevezető rendelkezés", "responsible": "Ügyvitel", "required": True, "template": "{{name}} ({{rank}}, SZTSZ {{sztsz}}) leszereléséről."},
            {"name": "Jogi megalapozás", "responsible": "Jog", "required": True, "template": "A Hjt. vonatkozó rendelkezései alapján."},
            {"name": "Személyügyi rendelkezés", "responsible": "Személyügy", "required": True, "template": ""},
            {"name": "Pénzügyi rendelkezés", "responsible": "Pénzügy", "required": True, "template": ""},
        ], signers=["Ezredparancsnok", "Törzsfőnök"]),
        OrderTypeModel(id=new_id(), name="Behívó parancs", description="Tartalékos behívása kiképzésre", chapters=[
            {"name": "Behívás", "responsible": "Személyügy", "required": True, "template": "{{name}} behívása {{subject}} kiképzésre."},
            {"name": "Kiképzési rendelkezés", "responsible": "Kiképzés", "required": True, "template": ""},
            {"name": "Pénzügyi rendelkezés", "responsible": "Pénzügy", "required": False, "template": ""},
        ], signers=["Zászlóaljparancsnok"]),
        OrderTypeModel(id=new_id(), name="Kiküldetési parancs", description="", chapters=[
            {"name": "Kiküldetés", "responsible": "Ügyvitel", "required": True, "template": ""},
            {"name": "Pénzügyi rendelkezés", "responsible": "Pénzügy", "required": True, "template": ""},
        ], signers=["Zászlóaljparancsnok"]),
    ]
    db.add_all(types)
    db.flush()
    order_no = 1
    for unit in list(BATTALIONS) + [EZRED]:
        pool = active(unit) if unit != EZRED else everyone
        for k in range(5 if unit != EZRED else 3):
            ot = rng.choice(types)
            person = rng.choice(pool)
            state = rng.choice(["Előkészítés", "Előkészítés", "Aláírásra vár", "Kiadva", "Kiadva"])
            created = today - timedelta(days=rng.randint(1, 45))
            due = created + timedelta(days=rng.randint(5, 30))
            signed = state == "Kiadva"
            order = OrderModel(id=new_id(), order_type_id=ot.id, type_name=ot.name, number=f"{order_no}/{today.year}", issuer=ORDER_DEFAULT_ISSUER,
                               subject=f"{ot.name.replace(' parancs', '')} – {person.name}", unit=unit if unit != EZRED else "", personnel_id=person.id, person_name=person.name,
                               status=state, due_date=iso(due), issued_date=iso(created + timedelta(days=rng.randint(3, 12))) if signed else "",
                               notes="", created_by="csore", created_at=datetime(created.year, created.month, created.day, 9, tzinfo=timezone.utc),
                               signatures=[{"role": r, "name": rng.choice(["Nagy ezredes", "Kiss alezredes", "Szabó őrnagy"]), "signed": signed, "signedAt": iso(created + timedelta(days=4)) if signed else "", "signedBy": "ficzay" if signed else ""} for r in ot.signers])
            db.add(order)
            order_no += 1
            values = {"{{name}}": person.name, "{{rank}}": person.rank, "{{sztsz}}": person.sztsz, "{{subject}}": order.subject}
            for pos, ch in enumerate(ot.chapters):
                content = ch.get("template", "")
                for a, b in values.items():
                    content = content.replace(a, b)
                if state == "Előkészítés":
                    st = rng.choice(["Nincs elkezdve", "Folyamatban", "Kész"])
                else:
                    st = "Kész" if ch.get("required", True) else rng.choice(["Kész", "Nem szükséges"])
                if st != "Nincs elkezdve" and not content:
                    content = f"{ch['name']}: a(z) {ot.name.lower()} végrehajtásához szükséges rendelkezések."
                db.add(OrderChapterModel(id=new_id(), order_id=order.id, position=pos, name=ch["name"], responsible=ch["responsible"], required=bool(ch.get("required", True)),
                                         content=content, status=st, assignee="", due_date=iso(due - timedelta(days=3)) if state == "Előkészítés" and rng.random() < 0.6 else "", note=""))

    # ── Közlemények ─────────────────────────────────────────────────────────
    ann = [
        AnnouncementModel(id=new_id(), title="Bakony 26 ezredgyakorlat — előkészítés", category="Fontos", unit="", pinned=True, author="Ficzay A.", date=iso(today),
                          content="A gyakorlat kezdete előtt két héttel minden zászlóalj leadja a résztvevők névsorát. Felszerelés-ellenőrzés a gyakorlat előtti pénteken."),
        AnnouncementModel(id=new_id(), title="Ezred lőtér: karbantartás miatt zárva", category="Sürgős", unit="", pinned=True, author="Ficzay A.", date=iso(today - timedelta(days=1)),
                          content="A győri ezred lőtér a jövő héten hétfőtől szerdáig zárva. A foglalásokat át kell tenni Hajmáskérre."),
        AnnouncementModel(id=new_id(), title="Tartalékos szolgálati minimum — év végi egyeztetés", category="Általános", unit="", pinned=False, author="Tóth Rafael", date=iso(today - timedelta(days=4)),
                          content="A Figyelmeztetések oldalon látszik, kinek nincs meg az évi 7 nap. Novemberig be kell tervezni a pótlást."),
        AnnouncementModel(id=new_id(), title="Új felszerelés-kiadási rend", category="Adminisztráció", unit="", pinned=False, author="Rendszer Admin", date=iso(today - timedelta(days=12)), content="A raktár keddenként és csütörtökönként ad ki."),
        AnnouncementModel(id=new_id(), title="Veszprém: hajmáskéri lőgyakorlat névsor", category="Gyakorlat", unit="31 TVZ", pinned=False, author="Rogel-Závodszki K.", date=iso(today - timedelta(days=2)), content="A névsort a kampánytervből vesszük, jelentkezni a Személyügynél."),
        AnnouncementModel(id=new_id(), title="Vas: 7×20 haladó modul időpontja", category="Fontos", unit="83 TVZ", pinned=True, author="Kiss Félix", date=iso(today), content="A haladó modul két héttel előrébb kerül. A résztvevők értesítése folyamatban."),
        AnnouncementModel(id=new_id(), title="Győr: családi nap szervezői", category="Általános", unit="19 TVZ", pinned=False, author="Csóré Jenő", date=iso(today - timedelta(days=6)), content="Szervezőnek jelentkezni az ügyviteli irodán."),
    ]
    db.add_all(ann)

    # ── Logisztika (kis minta) ──────────────────────────────────────────────
    for unit in BATTALIONS:
        for i in range(6):
            db.add(EquipmentModel(id=new_id(), name=rng.choice(["Rohamsisak M92", "Golyóálló mellény", "Éjjellátó NVG-7", "Rádiókészlet"]), category=rng.choice(["Védőfelszerelés", "Optika", "Kommunikáció"]),
                                  serial_number=f"{unit[:2]}-{i + 1:04d}", qr_code="", condition=rng.choice(["Jó", "Jó", "Javítandó"]), description=unit, checkout_history=[]))
        for i, (n, c, u) in enumerate((("5.56 lőszer", "Lőszer", "db"), ("Dízel", "Üzemanyag", "liter"), ("Kötszer csomag", "Egészségügy", "db"))):
            db.add(SupplyModel(id=new_id(), name=f"{n} – {unit}", category=c, unit=u, current_qty=rng.randint(0, 900), min_qty=rng.randint(50, 300), description="", movements=[]))
        for i in range(3):
            db.add(VehicleModel(id=new_id(), plate_number=f"HK-{unit[:2]}{i + 1}", type=rng.choice(["Terepjáró", "Tehergépjármű"]), make_model=rng.choice(["Toyota Hilux", "MAN TGS", "Land Rover Defender"]),
                                year=rng.randint(2010, 2024), km=rng.randint(20000, 200000), next_service=iso(today + timedelta(days=rng.randint(-10, 120))),
                                next_inspection=iso(today + timedelta(days=rng.randint(10, 300))), status=rng.choice(["Elérhető", "Használatban", "Szervizben"]), service_log=[]))

    db.commit()
    return {"users": len(users), "persons": len(persons), "exercises": len(exercises), "events": len(events), "orders": order_no - 1, "announcements": len(ann)}
