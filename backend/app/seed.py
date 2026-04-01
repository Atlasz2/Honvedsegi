from __future__ import annotations
import os

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .models import (
    ActivityLogModel,
    AnnouncementModel,
    DutyModel,
    EquipmentModel,
    EventModel,
    ExerciseModel,
    PersonModel,
    SessionTokenModel,
    SupplyModel,
    TrainingModel,
    UserModel,
    VehicleModel,
)
from .security import assert_password_strength, hash_password


def _require_secret(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(
            f"Hiányzó kötelező környezeti változó: {name}. "
            "Belső hálózati élesítéshez ne használj hardcode-olt jelszót."
        )
    assert_password_strength(value)
    return value


def _optional_secret_for_nonprod(name: str, default_value: str) -> str:
    backend_env = os.getenv("BACKEND_ENV", "development").strip().lower()
    value = os.getenv(name, "").strip()
    if value:
        assert_password_strength(value)
        return value
    if backend_env == "production":
        raise RuntimeError(f"Production módban kötelező megadni: {name}")
    assert_password_strength(default_value)
    return default_value


def seed_database(db: Session) -> None:
    if db.query(UserModel).first():
        return

    admin_pwd = _require_secret("BACKEND_ADMIN_PASSWORD")
    dev_pwd = _require_secret("BACKEND_DEV_MASTER_PASSWORD")
    reader_pwd = _optional_secret_for_nonprod("BACKEND_READER_PASSWORD", "OlvasoTeszt_2026!")
    editor_pwd = _optional_secret_for_nonprod("BACKEND_EDITOR_PASSWORD", "SzerkesztoTeszt_2026!")
    users = [
        UserModel(username="admin", password_hash=hash_password(admin_pwd), display_name="Rendszer Admin", role="admin", active=True, protected=False),
        UserModel(username="olvaso", password_hash=hash_password(reader_pwd), display_name="Teszt Olvasó", role="reader", active=True, protected=False),
        UserModel(username="szerkeszto", password_hash=hash_password(editor_pwd), display_name="Teszt Szerkesztő", role="editor", active=True, protected=False),
        UserModel(username="dev_master", password_hash=hash_password(dev_pwd), display_name="Fejlesztő Mester", role="fejleszto", active=True, protected=True),
    ]

    personnel = [
        PersonModel(id="p1", name="Szabó Anna", sztsz="10000001", rank="Hadnagy", unit="Törzs", status="Aktív", email="szabo.anna@honved.hu", phone="+36 20 111 2222", join_date="2018-03-15"),
        PersonModel(id="p2", name="Kovács János", sztsz="10000002", rank="Szakaszvezető", unit="1. szakasz", status="Aktív", email="kovacs.j@honved.hu", phone="+36 30 333 4444", join_date="2019-06-01"),
        PersonModel(id="p3", name="Nagy Péter", sztsz="10000003", rank="Tizedes", unit="1. szakasz", status="Tartalékos", email="nagy.peter@gmail.com", join_date="2020-09-10"),
        PersonModel(id="p4", name="Horváth Zoltán", sztsz="10000004", rank="Őrmester", unit="2. szakasz", status="Aktív", email="horvath.z@honved.hu", phone="+36 70 555 6666", join_date="2017-01-20"),
        PersonModel(id="p5", name="Kiss Erzsébet", sztsz="10000005", rank="Főhadnagy", unit="Törzs", status="Szabadságon", email="kiss.e@honved.hu", join_date="2015-07-04", notes="Szülési szabadság"),
        PersonModel(id="p6", name="Varga Gábor", sztsz="10000006", rank="Közkatona", unit="2. szakasz", status="Aktív", email="varga.g@gmail.com", phone="+36 20 777 8888", join_date="2023-02-14"),
        PersonModel(id="p9", name="Molnár Dóra", sztsz="10000009", rank="Hadnagy", unit="Törzs", status="Aktív", email="molnar.d@honved.hu", phone="+36 30 999 0000", join_date="2020-03-01"),
        PersonModel(id="p10", name="Simon Ádám", sztsz="10000010", rank="Közkatona", unit="3. szakasz", status="Aktív", email="simon.a@gmail.com", join_date="2024-01-08"),
        PersonModel(id="p11", name="Lukács Béla", sztsz="10000011", rank="Törzsőrmester", unit="2. szakasz", status="Aktív", email="lukacs.b@honved.hu", join_date="2014-08-22"),
        PersonModel(id="p12", name="Farkas Réka", sztsz="10000012", rank="Százados", unit="Törzs", status="Aktív", email="farkas.r@honved.hu", phone="+36 20 444 5555", join_date="2012-04-10"),
    ]

    exercises = [
        ExerciseModel(id="e1", name="Tavaszi lőgyakorlat", type="Lőgyakorlat", start_date="2026-03-24", end_date="2026-03-28", location="Esztergom, Lőtér", max_personnel=15, description="Század szintű lőfoglalkozás", status="Tervezett", assigned=[{"personId":"p2","personName":"Kovács János","role":"résztvevő"},{"personId":"p4","personName":"Horváth Zoltán","role":"rajparancsnok"},{"personId":"p6","personName":"Varga Gábor","role":"résztvevő"}]),
        ExerciseModel(id="e2", name="Törzsgyakorlat Alfa", type="Törzsgyakorlat", start_date="2026-03-17", end_date="2026-03-21", location="Budapest, Ludovika", max_personnel=8, status="Folyamatban", assigned=[{"personId":"p1","personName":"Szabó Anna","role":"parancsnok"},{"personId":"p9","personName":"Molnár Dóra","role":"vezérkari tiszt"}]),
        ExerciseModel(id="e3", name="Határ menti készenléti gyakorlat", type="Terepgyakorlat", start_date="2026-04-08", end_date="2026-04-18", location="Kiskunhalas", max_personnel=10, status="Tervezett", assigned=[{"personId":"p6","personName":"Varga Gábor","role":"járőrtag"},{"personId":"p10","personName":"Simon Ádám","role":"járőrtag"}]),
    ]

    trainings = [
        TrainingModel(id="t1", name="Elsősegély tanfolyam", type="Elsősegély", organizer="Egészségügyi Csoport", start_date="2026-03-10", end_date="2026-03-14", location="Budapest, Katonai Kórház", max_personnel=15, status="Befejezett", assigned=[{"personId":"p9","personName":"Molnár Dóra","attendance":"Megjelent"},{"personId":"p4","personName":"Horváth Zoltán","attendance":"Megjelent"}]),
        TrainingModel(id="t2", name="Lövészeti mesterkurzus", type="Lövészeti", organizer="Kiképzési Törzs", start_date="2026-04-22", end_date="2026-04-25", location="Esztergom, Lőtér", max_personnel=8, status="Tervezett", assigned=[{"personId":"p2","personName":"Kovács János","attendance":"Tervezett"},{"personId":"p11","personName":"Lukács Béla","attendance":"Tervezett"}]),
    ]

    equipment = [
        EquipmentModel(id="eq1", name="Rohamsisak M92", category="Védőfelszerelés", serial_number="SIS-001-A", condition="Jó", checkout_history=[]),
        EquipmentModel(id="eq2", name="Rohamsisak M92", category="Védőfelszerelés", serial_number="SIS-002-A", condition="Jó", checked_out_to="p2", checked_out_to_name="Kovács János", checked_out_date="2026-03-10", checkout_history=[{"personId":"p2","personName":"Kovács János","checkedOutDate":"2026-03-10","note":""}]),
        EquipmentModel(id="eq4", name="Golyóálló mellény", category="Védőfelszerelés", serial_number="MEL-001-B", condition="Jó", checked_out_to="p4", checked_out_to_name="Horváth Zoltán", checked_out_date="2026-03-12", checkout_history=[{"personId":"p4","personName":"Horváth Zoltán","checkedOutDate":"2026-03-12","note":""}]),
        EquipmentModel(id="eq7", name="Éjjellátó NVG-7", category="Optika", serial_number="NVG-001-C", condition="Jó", checked_out_to="p1", checked_out_to_name="Szabó Anna", checked_out_date="2026-03-20", checkout_history=[{"personId":"p1","personName":"Szabó Anna","checkedOutDate":"2026-03-20","note":""}]),
        EquipmentModel(id="eq19", name="Gázálarc", category="Védőfelszerelés", serial_number="GAZ-002-H", condition="Jó", checked_out_to="p11", checked_out_to_name="Lukács Béla", checked_out_date="2026-04-01", checkout_history=[{"personId":"p11","personName":"Lukács Béla","checkedOutDate":"2026-04-01","note":""}]),
    ]

    supplies = [
        SupplyModel(id="s1", name="9mm lőszer", category="Lőszer", unit="db", current_qty=2400, min_qty=500, movements=[]),
        SupplyModel(id="s2", name="5.56mm lőszer", category="Lőszer", unit="db", current_qty=8500, min_qty=2000, movements=[]),
        SupplyModel(id="s5", name="Benzin", category="Üzemanyag", unit="liter", current_qty=85, min_qty=150, movements=[]),
        SupplyModel(id="s7", name="Ivóvíz tartalék", category="Élelmiszer", unit="liter", current_qty=0, min_qty=200, movements=[]),
        SupplyModel(id="s8", name="Kötszer csomag", category="Gyógyszer", unit="db", current_qty=62, min_qty=30, movements=[]),
    ]

    vehicles = [
        VehicleModel(id="v1", plate_number="ABC-123", type="Terepjáró", make_model="Land Rover Defender", year=2019, km=42500, next_service="2026-06-15", next_inspection="2027-01-10", status="Elérhető", service_log=[]),
        VehicleModel(id="v2", plate_number="DEF-456", type="Terepjáró", make_model="Mercedes G-Osztály", year=2021, km=28300, next_service="2026-08-20", next_inspection="2027-03-15", status="Használatban", assigned_to="p2", assigned_to_name="Kovács János", service_log=[]),
        VehicleModel(id="v3", plate_number="GHI-789", type="Tehergépjármű", make_model="MAN TGS", year=2017, km=187600, next_service="2026-04-30", next_inspection="2026-05-12", status="Szervizben", service_log=[]),
    ]

    duties = [
        DutyModel(id="d1", type="Őrszolgálat", start_date="2026-03-21T08:00", end_date="2026-03-22T08:00", location="Laktanya főbejárat", person_id="p6", person_name="Varga Gábor", status="Tervezett"),
        DutyModel(id="d2", type="Ügyeleti szolgálat", start_date="2026-03-22T00:00", end_date="2026-03-23T00:00", location="Parancsnoki épület", person_id="p11", person_name="Lukács Béla", status="Tervezett"),
        DutyModel(id="d3", type="Készenléti szolgálat", start_date="2026-03-25T06:00", end_date="2026-03-26T06:00", location="Laktanya", person_id="p4", person_name="Horváth Zoltán", status="Tervezett"),
        DutyModel(id="d4", type="Rendezvénybiztosítás", start_date="2026-04-02T09:00", end_date="2026-04-02T18:00", location="Városháza tér", person_id="p2", person_name="Kovács János", status="Tervezett"),
    ]

    announcements = [
        AnnouncementModel(id="a1", title="Tavaszi lőgyakorlat előkészítése", category="Fontos", content="A jövő heti lőtéri foglalkozás előkészítése megkezdődött. Az érintett állomány felszerelés-ellenőrzése péntekig kötelező.", author="Szabó Anna", date="2026-03-18", pinned=True),
        AnnouncementModel(id="a2", title="Behívás alatti állomány egyeztetése", category="Sürgős", content="Kérjük a jövő hónapra tervezett behívások véglegesítését, hogy a szolgálat- és kiképzési ütközések időben láthatók legyenek.", author="Farkas Réka", date="2026-03-16", pinned=True),
        AnnouncementModel(id="a3", title="Új raktárhelyiség átadása", category="Általános", content="A B épület alagsorában lévő új raktárhelyiség már használható. A készletek átmozgatása a héten történik.", author="Szabó Anna", date="2026-03-12", pinned=False),
    ]

    logs = [
        ActivityLogModel(id="al1", timestamp=datetime(2026, 3, 18, 10, 30, tzinfo=timezone.utc), user_id="admin", user_name="Szabó Anna", action="létrehozva", module="Hírek", record_name="Tavaszi lőgyakorlat előkészítése"),
        ActivityLogModel(id="al2", timestamp=datetime(2026, 3, 17, 8, 15, tzinfo=timezone.utc), user_id="admin", user_name="Szabó Anna", action="módosítva", module="Felszerelés", record_name="Gázálarc (GAZ-002-H)"),
        ActivityLogModel(id="al3", timestamp=datetime(2026, 3, 15, 13, 0, tzinfo=timezone.utc), user_id="admin", user_name="Szabó Anna", action="létrehozva", module="Kiképzések", record_name="Lövészeti mesterkurzus"),
    ]

    db.add_all(users + personnel + exercises + trainings + equipment + supplies + vehicles + duties + announcements + logs)
    db.commit()



def reseed_large_test_database(db: Session, random_seed: int = 42) -> None:
    import random

    rng = random.Random(random_seed)

    for model in [
        SessionTokenModel,
        ActivityLogModel,
        AnnouncementModel,
        DutyModel,
        EquipmentModel,
        EventModel,
        ExerciseModel,
        TrainingModel,
        SupplyModel,
        VehicleModel,
        PersonModel,
        UserModel,
    ]:
        db.query(model).delete()
    db.commit()

    admin_pwd = _require_secret("BACKEND_ADMIN_PASSWORD")
    dev_pwd = _require_secret("BACKEND_DEV_MASTER_PASSWORD")
    reader_pwd = _optional_secret_for_nonprod("BACKEND_READER_PASSWORD", "OlvasoTeszt_2026!")
    editor_pwd = _optional_secret_for_nonprod("BACKEND_EDITOR_PASSWORD", "SzerkesztoTeszt_2026!")
    users = [
        UserModel(username="admin", password_hash=hash_password(admin_pwd), display_name="Rendszer Admin", role="admin", active=True, protected=False),
        UserModel(username="olvaso", password_hash=hash_password(reader_pwd), display_name="Teszt Olvasó", role="reader", active=True, protected=False),
        UserModel(username="szerkeszto", password_hash=hash_password(editor_pwd), display_name="Teszt Szerkesztő", role="editor", active=True, protected=False),
        UserModel(username="dev_master", password_hash=hash_password(dev_pwd), display_name="Fejlesztő Mester", role="fejleszto", active=True, protected=True),
    ]

    male_first_names = [
        "Ádám", "Bence", "Csaba", "Dávid", "Erik", "Ferenc", "Gábor", "Hunor", "István", "János", "Kristóf", "Levente",
        "Márk", "Norbert", "Olivér", "Péter", "Richárd", "Sándor", "Tamás", "Viktor", "Zoltán", "Máté", "Balázs", "Attila",
    ]
    female_first_names = [
        "Anita", "Beáta", "Csilla", "Dóra", "Erika", "Fanni", "Gabriella", "Hanna", "Ilona", "Judit", "Katalin", "Lilla",
        "Mária", "Nóra", "Orsolya", "Petra", "Réka", "Szilvia", "Tímea", "Virág", "Zsófia", "Eszter", "Noémi", "Anna",
    ]
    last_names = [
        "Kovács", "Szabó", "Nagy", "Tóth", "Varga", "Kiss", "Molnár", "Németh", "Farkas", "Horváth", "Balogh", "Papp",
        "Lakatos", "Takács", "Juhász", "Mészáros", "Oláh", "Simon", "Rácz", "Fekete", "Bíró", "Boros", "Kelemen", "Lukács",
        "Gulyás", "Sipos", "Veres", "Bodnár", "Király", "Szalai",
    ]
    battalion_rank_weights = [
        ("Honvéd", 26), ("Őrvezető", 18), ("Tizedes", 15), ("Szakaszvezető", 14), ("Őrmester", 10),
        ("Törzsőrmester", 7), ("Főtörzsőrmester", 4), ("Zászlós", 2), ("Hadnagy", 2), ("Főhadnagy", 1),
        ("Százados", 1),
    ]
    staff_rank_weights = [
        ("Szakaszvezető", 6), ("Őrmester", 8), ("Törzsőrmester", 10), ("Főtörzsőrmester", 10), ("Zászlós", 8),
        ("Törzszászlós", 6), ("Hadnagy", 11), ("Főhadnagy", 13), ("Százados", 13), ("Őrnagy", 8),
        ("Alezredes", 5), ("Ezredes", 2),
    ]
    unit_plan = {
        "31 TVZ": 400,
        "83 TVZ": 400,
        "19 TVZ": 400,
        "Ezredtörzs": 100,
    }

    locations_by_unit = {
        "31 TVZ": ["Budapest", "Szentendre", "Gödöllő", "Cegléd"],
        "83 TVZ": ["Kecskemét", "Szolnok", "Jászberény", "Tiszakécske"],
        "19 TVZ": ["Veszprém", "Pápa", "Tapolca", "Ajka"],
        "Ezredtörzs": ["Budapest", "Szentendre", "Veszprém"],
    }
    street_names = [
        "Kossuth Lajos utca", "Petőfi Sándor utca", "Rákóczi út", "Ady Endre utca", "József Attila utca",
        "Dózsa György út", "Szabadság tér", "Templom utca", "Fő utca", "Béke utca",
    ]

    def _pick_rank(unit_name: str) -> str:
        data = staff_rank_weights if unit_name == "Ezredtörzs" else battalion_rank_weights
        return rng.choices([name for name, _ in data], weights=[w for _, w in data], k=1)[0]

    def _slug(value: str) -> str:
        return (
            value.lower()
            .replace("á", "a").replace("é", "e").replace("í", "i")
            .replace("ó", "o").replace("ö", "o").replace("ő", "o")
            .replace("ú", "u").replace("ü", "u").replace("ű", "u")
        )

    personnel: list[PersonModel] = []
    person_names: dict[str, str] = {}
    person_ids: list[str] = []

    person_counter = 1
    sztsz_counter = 20000001

    for unit, count in unit_plan.items():
        for _ in range(count):
            person_id = f"p{person_counter}"
            first = rng.choice(female_first_names if rng.random() < 0.18 else male_first_names)
            last = rng.choice(last_names)
            full_name = f"{last} {first}"
            status = rng.choices(["Aktív", "Tartalékos", "Szabadságon", "Leszerelt"], weights=[76, 16, 6, 2], k=1)[0]

            join_year = rng.randint(2010, 2025)
            join_month = rng.randint(1, 12)
            join_day = rng.randint(1, 28)
            birth_year = rng.randint(1976, 2004)
            birth_month = rng.randint(1, 12)
            birth_day = rng.randint(1, 28)
            city = rng.choice(locations_by_unit[unit])
            house_number = rng.randint(1, 178)

            personnel.append(
                PersonModel(
                    id=person_id,
                    name=full_name,
                    sztsz=str(sztsz_counter),
                    rank=_pick_rank(unit),
                    unit=unit,
                    status=status,
                    email=f"{_slug(last)}.{_slug(first)}{rng.randint(1, 99)}@honved.local",
                    phone=f"+36 {rng.choice([20, 30, 70])} {rng.randint(100, 999)} {rng.randint(1000, 9999)}",
                    birth_date=f"{birth_year:04d}-{birth_month:02d}-{birth_day:02d}",
                    address=f"{city}, {rng.choice(street_names)} {house_number}.",
                    join_date=f"{join_year:04d}-{join_month:02d}-{join_day:02d}",
                    notes="",
                )
            )
            person_names[person_id] = full_name
            person_ids.append(person_id)
            person_counter += 1
            sztsz_counter += 1

    active_or_reserve = [p.id for p in personnel if p.status in {"Aktív", "Tartalékos"}]

    exercise_types = ["Lőgyakorlat", "Terepgyakorlat", "Törzsgyakorlat", "Mesterlövész", "NBC védelmi", "Válságkezelési"]
    exercise_name_prefixes = ["Acél Pajzs", "Vihar", "Őrszem", "Turul", "Hajnal", "Kard", "Fokozott Készenlét", "Zrínyi"]
    training_types = ["Alapkiképzés", "Szakmai kiképzés", "Parancsnoki tanfolyam", "Elsősegély", "Lövészeti", "Híradó"]
    training_name_prefixes = ["Törzsvezetési", "Rádióforgalmi", "Harcászati", "Lövészeti", "Logisztikai", "Egészségügyi"]
    duty_types = ["Őrszolgálat", "Ügyeleti szolgálat", "Készenléti szolgálat", "Rendezvénybiztosítás", "Egyéb"]

    base_date = datetime(2026, 1, 1)

    exercises: list[ExerciseModel] = []
    for index in range(1, 121):
        start = base_date + timedelta(days=rng.randint(0, 365))
        duration = rng.randint(1, 6)
        end = start + timedelta(days=duration)
        max_personnel = rng.randint(12, 60)
        assigned_count = rng.randint(5, min(max_personnel, 35))
        assigned_ids = rng.sample(active_or_reserve, assigned_count)
        assigned = [
            {"personId": pid, "personName": person_names[pid], "role": rng.choice(["résztvevő", "rajparancsnok", "megfigyelő", "biztosító"])}
            for pid in assigned_ids
        ]
        exercises.append(
            ExerciseModel(
                id=f"e{index}",
                name=f"{rng.choice(exercise_name_prefixes)} {rng.randint(1, 4)}/{(base_date.year % 100):02d}",
                type=rng.choice(exercise_types),
                start_date=start.strftime("%Y-%m-%d"),
                end_date=end.strftime("%Y-%m-%d"),
                location=rng.choice(["Esztergom, Lőtér", "Veszprém, Kiképzőbázis", "Budapest, Ludovika", "Kiskunhalas", "Táborfalva"]),
                max_personnel=max_personnel,
                description=rng.choice([
                    "Raj és szakasz szintű lő- és mozgásfoglalkozás.",
                    "Objektumvédelmi és reagálási eljárások gyakorlása.",
                    "Parancsnoki döntési ciklus és törzsmunka gyakorlása.",
                ]),
                status=rng.choice(["Tervezett", "Folyamatban", "Befejezett", "Törölve"]),
                assigned=assigned,
            )
        )

    trainings: list[TrainingModel] = []
    for index in range(1, 181):
        start = base_date + timedelta(days=rng.randint(0, 365))
        duration = rng.randint(1, 4)
        end = start + timedelta(days=duration)
        max_personnel = rng.randint(10, 50)
        assigned_count = rng.randint(4, min(max_personnel, 28))
        assigned_ids = rng.sample(active_or_reserve, assigned_count)
        assigned = [
            {"personId": pid, "personName": person_names[pid], "attendance": rng.choice(["Tervezett", "Megjelent", "Hiányzott", "Beteg"])}
            for pid in assigned_ids
        ]
        trainings.append(
            TrainingModel(
                id=f"t{index}",
                name=f"{rng.choice(training_name_prefixes)} felkészítés {index:03d}",
                type=rng.choice(training_types),
                start_date=start.strftime("%Y-%m-%d"),
                end_date=end.strftime("%Y-%m-%d"),
                location=rng.choice(["Budapest", "Kecskemét", "Szolnok", "Debrecen", "Esztergom"]),
                organizer=rng.choice(["31 TVZ", "83 TVZ", "19 TVZ", "Ezredtörzs"]),
                max_personnel=max_personnel,
                description=rng.choice([
                    "Beosztáshoz kötött éves felkészítés.",
                    "Minősítő és ismétlő foglalkozás.",
                    "Elméleti és gyakorlati modulok kombinált végrehajtása.",
                ]),
                status=rng.choice(["Tervezett", "Folyamatban", "Befejezett"]),
                assigned=assigned,
            )
        )

    events: list[EventModel] = []
    event_types = ["Általános", "Rendezvény", "Tájékoztató", "Ünnepség", "Parancsnoki", "Emléknap"]
    event_name_prefixes = ["Állománygyűlés", "Nyílt nap", "Helyőrségi fórum", "Emlékező ünnepség", "Családi nap", "Parancsnoki értekezlet"]
    for index in range(1, 141):
        start = base_date + timedelta(days=rng.randint(0, 365))
        duration = rng.randint(0, 2)
        end = start + timedelta(days=duration)
        max_personnel = rng.randint(40, 260)
        assigned_count = rng.randint(15, min(max_personnel, 120))
        assigned_ids = rng.sample(active_or_reserve, assigned_count)
        assigned = [
            {"personId": pid, "personName": person_names[pid], "role": rng.choice(["résztvevő", "biztosító", "szervező", "összekötő"])}
            for pid in assigned_ids
        ]
        events.append(
            EventModel(
                id=f"ev{index}",
                event_type="esemeny",
                name=f"{rng.choice(event_name_prefixes)} {index:03d}",
                type=rng.choice(event_types),
                start_date=start.strftime("%Y-%m-%d"),
                end_date=end.strftime("%Y-%m-%d"),
                location=rng.choice(["Budapest", "Szentendre", "Veszprém", "Kecskemét", "Szolnok", "Pápa"]),
                organizer=rng.choice(["31 TVZ", "83 TVZ", "19 TVZ", "Ezredtörzs"]),
                max_personnel=max_personnel,
                description=rng.choice([
                    "Helyőrségi szintű koordinációs és tájékoztató esemény.",
                    "Állományt érintő szervezési és adminisztratív feladatok egyeztetése.",
                    "A tartalékos állomány részvételével végrehajtott esemény.",
                ]),
                status=rng.choice(["Tervezett", "Folyamatban", "Befejezett", "Törölve"]),
                assigned=assigned,
            )
        )

    duties: list[DutyModel] = []
    for index in range(1, 361):
        start = base_date + timedelta(days=rng.randint(0, 365), hours=rng.choice([0, 6, 8, 12, 18]))
        duration_hours = rng.choice([8, 12, 24, 36])
        end = start + timedelta(hours=duration_hours)
        pid = rng.choice(active_or_reserve)
        duties.append(
            DutyModel(
                id=f"d{index}",
                type=rng.choice(duty_types),
                start_date=start.strftime("%Y-%m-%dT%H:%M"),
                end_date=end.strftime("%Y-%m-%dT%H:%M"),
                location=rng.choice(["Laktanya", "Főkapu", "Parancsnoki épület", "Lőtér", "Raktárbázis"]),
                person_id=pid,
                person_name=person_names[pid],
                notes=rng.choice([
                    "Váltás átadás-átvétel naplózva.",
                    "Szolgálati eligazítás megtartva.",
                    "Rendkívüli esemény nem történt.",
                    "Megerősített készültségi fokozat.",
                ]),
                status=rng.choice(["Tervezett", "Teljesített", "Lemondva"]),
            )
        )

    equipment: list[EquipmentModel] = []
    equipment_categories = ["Védőfelszerelés", "Optika", "Kommunikáció", "Fegyvertartozék"]
    for index in range(1, 321):
        assigned_to = rng.choice(active_or_reserve) if rng.random() < 0.32 else None
        equipment.append(
            EquipmentModel(
                id=f"eq{index}",
                name=rng.choice(["Rohamsisak M92", "Golyóálló mellény", "Éjjellátó NVG-7", "Távcső", "Rádiókészlet"]),
                category=rng.choice(equipment_categories),
                serial_number=f"HDF-{rng.randint(11, 99)}-{index:05d}",
                qr_code=f"EQ-{base_date.year}-{index:05d}",
                condition=rng.choice(["Jó", "Javítandó", "Selejtezendő"]),
                description=rng.choice([
                    "Éves felülvizsgálatra kötelezett eszköz.",
                    "Raktári nyilvántartás szerint kiadható.",
                    "Műszaki állapot ellenőrzése szükséges következő ciklusban.",
                ]),
                checked_out_to=assigned_to,
                checked_out_to_name=person_names[assigned_to] if assigned_to else None,
                checked_out_date="2026-03-01" if assigned_to else None,
                checkout_history=[],
            )
        )

    supplies: list[SupplyModel] = []
    supply_templates = [
        ("5.56x45 NATO lőszer", "Lőszer", "db"),
        ("7.62x39 lőszer", "Lőszer", "db"),
        ("9x19 pisztolylőszer", "Lőszer", "db"),
        ("Dízel üzemanyag", "Üzemanyag", "liter"),
        ("Benzin 95", "Üzemanyag", "liter"),
        ("Palackozott ivóvíz", "Élelmiszer", "liter"),
        ("MRE csomag", "Élelmiszer", "csomag"),
        ("Kötszer csomag", "Egészségügy", "db"),
        ("Fertőtlenítő oldat", "Egészségügy", "liter"),
        ("Akkumulátor 12V", "Műszaki", "db"),
    ]
    supply_units = ["db", "liter", "kg", "csomag"]
    for index in range(1, 81):
        min_qty = rng.randint(20, 300)
        current_qty = rng.randint(0, 1200)
        template_name, template_category, template_unit = rng.choice(supply_templates)
        supplies.append(
            SupplyModel(
                id=f"s{index}",
                name=f"{template_name} #{index:03d}",
                category=template_category,
                unit=template_unit if rng.random() < 0.85 else rng.choice(supply_units),
                current_qty=current_qty,
                min_qty=min_qty,
                description="Raktári készlettétel, rendszeres leltározással.",
                movements=[],
            )
        )

    vehicles: list[VehicleModel] = []
    vehicle_prefixes = ["HDF", "MH", "HK", "GKD"]
    for index in range(1, 121):
        assigned_to = rng.choice(active_or_reserve) if rng.random() < 0.2 else None
        vehicles.append(
            VehicleModel(
                id=f"v{index}",
                plate_number=f"{rng.choice(vehicle_prefixes)}-{index:03d}",
                type=rng.choice(["Terepjáró", "Tehergépjármű", "Személyautó", "Busz"]),
                make_model=rng.choice(["Mercedes G", "Land Rover Defender", "MAN TGS", "Toyota Hilux"]),
                year=rng.randint(2008, 2025),
                km=rng.randint(8_000, 280_000),
                next_service=(base_date + timedelta(days=rng.randint(1, 240))).strftime("%Y-%m-%d"),
                next_inspection=(base_date + timedelta(days=rng.randint(30, 360))).strftime("%Y-%m-%d"),
                status=rng.choice(["Elérhető", "Használatban", "Szervizben", "Meghibásodott", "Selejtezett"]),
                notes=rng.choice([
                    "Napi menetlevél lezárva.",
                    "Következő időszakos szerviz ütemezve.",
                    "Műszaki ellenőrzés rendben.",
                ]),
                assigned_to=assigned_to,
                assigned_to_name=person_names[assigned_to] if assigned_to else None,
                service_log=[],
            )
        )

    announcements: list[AnnouncementModel] = []
    announcement_titles = [
        "Heti szolgálati beosztás frissítve",
        "Lőtéri foglalkozás felszerelésellenőrzés",
        "Behívási névsor egyeztetés",
        "Raktári leltáridőpont módosítás",
        "Egészségügyi alkalmassági nap",
        "Járműpark karbantartási ütemterv",
    ]
    announcement_bodies = [
        "A kijelölt állomány részére a végrehajtási utasítás a törzs irodában átvehető.",
        "Az érintett alegységek részére a pontos kezdési időpont külön üzenetben kerül kiküldésre.",
        "Az adategyeztetés határideje péntek 12:00, hiány esetén visszajelzés kötelező.",
        "A végrehajtás során felmerült eltéréseket az ügyeleti naplóban rögzíteni kell.",
    ]
    for index in range(1, 41):
        day = base_date + timedelta(days=rng.randint(0, 365))
        announcements.append(
            AnnouncementModel(
                id=f"a{index}",
                title=rng.choice(announcement_titles),
                category=rng.choice(["Általános", "Fontos", "Sürgős", "Gyakorlat", "Adminisztráció"]),
                content=rng.choice(announcement_bodies),
                author=rng.choice(["Rendszer Admin", "Törzsfőnök", "Kiképzési tiszt", "Logisztikai tiszt"]),
                date=day.strftime("%Y-%m-%d"),
                pinned=rng.random() < 0.15,
            )
        )

    logs: list[ActivityLogModel] = []
    display_name_map = {"admin": "Rendszer Admin", "olvaso": "Teszt Olvasó", "szerkeszto": "Teszt Szerkesztő", "dev_master": "Fejlesztő Mester"}
    for index in range(1, 401):
        ts = base_date + timedelta(days=rng.randint(0, 365), hours=rng.randint(0, 23), minutes=rng.randint(0, 59))
        log_user_id = rng.choice(["admin", "olvaso", "szerkeszto", "dev_master"])
        logs.append(
            ActivityLogModel(
                id=f"al{index}",
                timestamp=ts.replace(tzinfo=timezone.utc),
                user_id=log_user_id,
                user_name=display_name_map.get(log_user_id, log_user_id),
                action=rng.choice(["létrehozva", "módosítva", "törölve"]),
                module=rng.choice(["Személyek", "Gyakorlatok", "Kiképzések", "Szolgálatok", "Felszerelés", "Készletek"]),
                record_name=rng.choice(["Heti beosztás", "Kiképzési terv", "Leltárjegyzék", "Szolgálati napló", "Készenléti jelentés"]),
            )
        )

    db.add_all(users)
    db.add_all(personnel)
    db.add_all(exercises)
    db.add_all(trainings)
    db.add_all(events)
    db.add_all(equipment)
    db.add_all(supplies)
    db.add_all(vehicles)
    db.add_all(duties)
    db.add_all(announcements)
    db.add_all(logs)
    db.commit()




