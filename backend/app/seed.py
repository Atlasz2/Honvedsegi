from __future__ import annotations
import os

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .models import (
    ActivityLogModel,
    AnnouncementModel,
    DutyModel,
    EquipmentModel,
    ExerciseModel,
    PersonModel,
    SessionTokenModel,
    SupplyModel,
    TrainingModel,
    UserModel,
    VehicleModel,
)
from .security import hash_password


def seed_database(db: Session) -> None:
    if db.query(UserModel).first():
        return

    dev_pwd = os.getenv("BACKEND_DEV_MASTER_PASSWORD", "SecureDevInit2026")
    users = [
        UserModel(username="admin", password_hash=hash_password("admin123"), display_name="Szabó Anna", role="admin", active=True, protected=False),
        UserModel(username="kovacs", password_hash=hash_password("admin123"), display_name="Kovács János", role="reader", active=True, protected=False),
        UserModel(username="nagy", password_hash=hash_password("admin123"), display_name="Nagy Péter", role="reader", active=True, protected=False),
        UserModel(username="dev", password_hash=hash_password("dev123"), display_name="Fejlesztő", role="fejleszto", active=True, protected=False),
        UserModel(username="dev_master", password_hash=hash_password(dev_pwd), display_name="Fejlesztő Mester", role="fejleszto", active=True, protected=True),
    ]

    personnel = [
        PersonModel(id="p1", name="Szabó Anna", sztsz="10000001", rank="Hadnagy", unit="Törzs", status="Aktív", email="szabo.anna@honved.hu", phone="+36 20 111 2222", join_date="2018-03-15"),
        PersonModel(id="p2", name="Kovács János", sztsz="10000002", rank="Szakaszvezető", unit="1. szakasz", status="Aktív", email="kovacs.j@honved.hu", phone="+36 30 333 4444", join_date="2019-06-01"),
        PersonModel(id="p3", name="Nagy Péter", sztsz="10000003", rank="Tizedes", unit="1. szakasz", status="Tartalékos", email="nagy.peter@gmail.com", join_date="2020-09-10"),
        PersonModel(id="p4", name="Horváth Zoltán", sztsz="10000004", rank="Őrmester", unit="2. szakasz", status="Aktív", email="horvath.z@honved.hu", phone="+36 70 555 6666", join_date="2017-01-20"),
        PersonModel(id="p5", name="Kiss Erzsébet", sztsz="10000005", rank="Főhadnagy", unit="Törzs", status="Szabadságon", email="kiss.e@honved.hu", join_date="2015-07-04", notes="Szülési szabadság"),
        PersonModel(id="p6", name="Varga Gábor", sztsz="10000006", rank="Közlegény", unit="2. szakasz", status="Aktív", email="varga.g@gmail.com", phone="+36 20 777 8888", join_date="2023-02-14"),
        PersonModel(id="p9", name="Molnár Dóra", sztsz="10000009", rank="Hadnagy", unit="Törzs", status="Aktív", email="molnar.d@honved.hu", phone="+36 30 999 0000", join_date="2020-03-01"),
        PersonModel(id="p10", name="Simon Ádám", sztsz="10000010", rank="Közlegény", unit="3. szakasz", status="Aktív", email="simon.a@gmail.com", join_date="2024-01-08"),
        PersonModel(id="p11", name="Lukács Béla", sztsz="10000011", rank="Törzsőrmester", unit="2. szakasz", status="Aktív", email="lukacs.b@honved.hu", join_date="2014-08-22"),
        PersonModel(id="p12", name="Farkas Réka", sztsz="10000012", rank="Százados", unit="Törzs", status="Aktív", email="farkas.r@honved.hu", phone="+36 20 444 5555", join_date="2012-04-10"),
    ]

    exercises = [
        ExerciseModel(id="e1", name="Tavaszi lőgyakorlat", type="Lőgyakorlat", start_date="2026-03-24", end_date="2026-03-28", location="Esztergom, Lőtér", max_personnel=15, description="Század szintű lőfoglalkozás", status="Tervezett", assigned=[{"personId":"p2","personName":"Kovács János","role":"résztvevő"},{"personId":"p4","personName":"Horváth Zoltán","role":"rajparancsnok"},{"personId":"p6","personName":"Varga Gábor","role":"résztvevő"}]),
        ExerciseModel(id="e2", name="Törzsgyakorlat Alfa", type="Törzsgyakorlat", start_date="2026-03-17", end_date="2026-03-21", location="Budapest, Ludovika", max_personnel=8, status="Folyamatban", assigned=[{"personId":"p1","personName":"Szabó Anna","role":"parancsnok"},{"personId":"p9","personName":"Molnár Dóra","role":"vezérkari tiszt"}]),
        ExerciseModel(id="e3", name="Határ menti készenléti gyakorlat", type="Terepgyakorlat", start_date="2026-04-08", end_date="2026-04-18", location="Kiskunhalas", max_personnel=10, status="Tervezett", assigned=[{"personId":"p6","personName":"Varga Gábor","role":"járőrtag"},{"personId":"p10","personName":"Simon Ádám","role":"járőrtag"}]),
    ]

    trainings = [
        TrainingModel(id="t1", name="Elsősegély tanfolyam", type="Elsősegély", start_date="2026-03-10", end_date="2026-03-14", location="Budapest, Katonai Kórház", max_personnel=15, status="Befejezett", assigned=[{"personId":"p9","personName":"Molnár Dóra","attendance":"Megjelent"},{"personId":"p4","personName":"Horváth Zoltán","attendance":"Megjelent"}]),
        TrainingModel(id="t2", name="Lövészeti mesterkurzus", type="Lövészeti", start_date="2026-04-22", end_date="2026-04-25", location="Esztergom, Lőtér", max_personnel=8, status="Tervezett", assigned=[{"personId":"p2","personName":"Kovács János","attendance":"Tervezett"},{"personId":"p11","personName":"Lukács Béla","attendance":"Tervezett"}]),
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
        ExerciseModel,
        TrainingModel,
        SupplyModel,
        VehicleModel,
        PersonModel,
        UserModel,
    ]:
        db.query(model).delete()
    db.commit()

    dev_pwd = os.getenv("BACKEND_DEV_MASTER_PASSWORD", "SecureDevInit2026")
    users = [
        UserModel(username="admin", password_hash=hash_password("admin123"), display_name="Szabó Anna", role="admin", active=True, protected=False),
        UserModel(username="kovacs", password_hash=hash_password("admin123"), display_name="Kovács János", role="reader", active=True, protected=False),
        UserModel(username="nagy", password_hash=hash_password("admin123"), display_name="Nagy Péter", role="reader", active=True, protected=False),
        UserModel(username="dev", password_hash=hash_password("dev123"), display_name="Fejlesztő", role="fejleszto", active=True, protected=False),
        UserModel(username="dev_master", password_hash=hash_password(dev_pwd), display_name="Fejlesztő Mester", role="fejleszto", active=True, protected=True),
    ]

    first_names = [
        "Ádám", "Bence", "Csaba", "Dávid", "Erik", "Ferenc", "Gábor", "Hunor", "István", "János", "Kristóf", "Levente",
        "Márk", "Norbert", "Olivér", "Péter", "Richárd", "Sándor", "Tamás", "Viktor", "Zoltán", "Anita", "Beáta", "Csilla",
        "Dóra", "Erika", "Fanni", "Gabriella", "Hanna", "Ilona", "Judit", "Katalin", "Lilla", "Mária", "Nóra", "Orsolya",
        "Petra", "Réka", "Szilvia", "Tímea", "Virág", "Zsófia"
    ]
    last_names = [
        "Kovács", "Szabó", "Nagy", "Tóth", "Varga", "Kiss", "Molnár", "Németh", "Farkas", "Horváth", "Balogh", "Papp",
        "Lakatos", "Takács", "Juhász", "Mészáros", "Oláh", "Simon", "Rácz", "Fekete", "Bíró", "Boros", "Kelemen", "Lukács",
        "Gulyás", "Sipos", "Veres", "Bodnár", "Király", "Szalai"
    ]
    ranks = ["Közlegény", "Tizedes", "Szakaszvezető", "Őrmester", "Törzsőrmester", "Főtörzsőrmester", "Hadnagy", "Főhadnagy", "Százados", "Őrnagy"]

    unit_plan = {
        "31 TVZ": 300,
        "83 TVZ": 300,
        "19 TVZ": 300,
        "Ezredtörzs": 100,
    }

    personnel: list[PersonModel] = []
    person_names: dict[str, str] = {}
    person_ids: list[str] = []

    person_counter = 1
    sztsz_counter = 20000001

    for unit, count in unit_plan.items():
        for _ in range(count):
            person_id = f"p{person_counter}"
            first = rng.choice(first_names)
            last = rng.choice(last_names)
            full_name = f"{last} {first} {person_counter:03d}"
            status = rng.choices(["Aktív", "Tartalékos", "Szabadságon", "Leszerelt"], weights=[76, 16, 6, 2], k=1)[0]

            join_year = rng.randint(2010, 2025)
            join_month = rng.randint(1, 12)
            join_day = rng.randint(1, 28)

            personnel.append(
                PersonModel(
                    id=person_id,
                    name=full_name,
                    sztsz=str(sztsz_counter),
                    rank=rng.choice(ranks),
                    unit=unit,
                    status=status,
                    email=f"katona{person_counter}@honved.local",
                    phone=f"+36 {rng.choice([20,30,70])} {rng.randint(100,999)} {rng.randint(1000,9999)}",
                    join_date=f"{join_year:04d}-{join_month:02d}-{join_day:02d}",
                    notes="",
                )
            )
            person_names[person_id] = full_name
            person_ids.append(person_id)
            person_counter += 1
            sztsz_counter += 1

    active_or_reserve = [p.id for p in personnel if p.status in {"Aktív", "Tartalékos"}]

    exercise_types = ["Lőgyakorlat", "Terepgyakorlat", "Törzsgyakorlat", "Mesterlövész", "NBC védelmi", "Egyéb"]
    training_types = ["Alapkiképzés", "Szakmai kiképzés", "Parancsnoki tanfolyam", "Elsősegély", "Lövészeti", "Egyéb"]
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
        assigned = [{"personId": pid, "personName": person_names[pid], "role": rng.choice(["résztvevő", "rajparancsnok", "megfigyelő", "biztosító"])} for pid in assigned_ids]
        exercises.append(
            ExerciseModel(
                id=f"e{index}",
                name=f"Gyakorlat {index:03d}",
                type=rng.choice(exercise_types),
                start_date=start.strftime("%Y-%m-%d"),
                end_date=end.strftime("%Y-%m-%d"),
                location=rng.choice(["Esztergom, Lőtér", "Veszprém, Kiképzőbázis", "Budapest, Ludovika", "Kiskunhalas", "Táborfalva"]),
                max_personnel=max_personnel,
                description="Automatikusan generált próbagyakorlat.",
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
        assigned = [{"personId": pid, "personName": person_names[pid], "attendance": rng.choice(["Tervezett", "Megjelent", "Hiányzott", "Beteg"])} for pid in assigned_ids]
        trainings.append(
            TrainingModel(
                id=f"t{index}",
                name=f"Kiképzés {index:03d}",
                type=rng.choice(training_types),
                start_date=start.strftime("%Y-%m-%d"),
                end_date=end.strftime("%Y-%m-%d"),
                location=rng.choice(["Budapest", "Kecskemét", "Szolnok", "Debrecen", "Esztergom"]),
                organizer=rng.choice(["31 TVZ", "83 TVZ", "19 TVZ", "Ezredtörzs"]),
                max_personnel=max_personnel,
                description="Automatikusan generált próbakiképzés.",
                status=rng.choice(["Tervezett", "Folyamatban", "Befejezett"]),
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
                notes="Automatikusan generált próbaszolgálat.",
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
                serial_number=f"SER-{index:05d}",
                qr_code=f"QR-{index:05d}",
                condition=rng.choice(["Jó", "Javítandó", "Selejtezendő"]),
                description="Automatikusan generált eszköz.",
                checked_out_to=assigned_to,
                checked_out_to_name=person_names[assigned_to] if assigned_to else None,
                checked_out_date="2026-03-01" if assigned_to else None,
                checkout_history=[],
            )
        )

    supplies: list[SupplyModel] = []
    supply_units = ["db", "liter", "kg", "csomag"]
    for index in range(1, 81):
        min_qty = rng.randint(20, 300)
        current_qty = rng.randint(0, 1200)
        supplies.append(
            SupplyModel(
                id=f"s{index}",
                name=f"Készletanyag {index:03d}",
                category=rng.choice(["Lőszer", "Üzemanyag", "Élelmiszer", "Egészségügy", "Műszaki"]),
                unit=rng.choice(supply_units),
                current_qty=current_qty,
                min_qty=min_qty,
                description="Automatikusan generált készlettétel.",
                movements=[],
            )
        )

    vehicles: list[VehicleModel] = []
    for index in range(1, 121):
        assigned_to = rng.choice(active_or_reserve) if rng.random() < 0.2 else None
        vehicles.append(
            VehicleModel(
                id=f"v{index}",
                plate_number=f"TEST-{index:03d}",
                type=rng.choice(["Terepjáró", "Tehergépjármű", "Személyautó", "Busz"]),
                make_model=rng.choice(["Mercedes G", "Land Rover Defender", "MAN TGS", "Toyota Hilux"]),
                year=rng.randint(2008, 2025),
                km=rng.randint(8_000, 280_000),
                next_service=(base_date + timedelta(days=rng.randint(1, 240))).strftime("%Y-%m-%d"),
                next_inspection=(base_date + timedelta(days=rng.randint(30, 360))).strftime("%Y-%m-%d"),
                status=rng.choice(["Elérhető", "Használatban", "Szervizben", "Meghibásodott", "Selejtezett"]),
                notes="Automatikusan generált jármű.",
                assigned_to=assigned_to,
                assigned_to_name=person_names[assigned_to] if assigned_to else None,
                service_log=[],
            )
        )

    announcements: list[AnnouncementModel] = []
    for index in range(1, 41):
        day = base_date + timedelta(days=rng.randint(0, 365))
        announcements.append(
            AnnouncementModel(
                id=f"a{index}",
                title=f"Közlemény {index:03d}",
                category=rng.choice(["Általános", "Fontos", "Sürgős", "Gyakorlat", "Adminisztráció"]),
                content="Automatikusan generált próbaközlemény.",
                author=rng.choice(["Szabó Anna", "Kovács János", "Nagy Péter", "Fejlesztő"]),
                date=day.strftime("%Y-%m-%d"),
                pinned=rng.random() < 0.15,
            )
        )

    logs: list[ActivityLogModel] = []
    for index in range(1, 401):
        ts = base_date + timedelta(days=rng.randint(0, 365), hours=rng.randint(0, 23), minutes=rng.randint(0, 59))
        logs.append(
            ActivityLogModel(
                id=f"al{index}",
                timestamp=ts.replace(tzinfo=timezone.utc),
                user_id=rng.choice(["admin", "kovacs", "nagy", "dev"]),
                user_name=rng.choice(["Szabó Anna", "Kovács János", "Nagy Péter", "Fejlesztő"]),
                action=rng.choice(["létrehozva", "módosítva", "törölve"]),
                module=rng.choice(["Személyek", "Gyakorlatok", "Kiképzések", "Szolgálatok", "Felszerelés", "Készletek"]),
                record_name=f"Rekord {index:03d}",
            )
        )

    db.add_all(users)
    db.add_all(personnel)
    db.add_all(exercises)
    db.add_all(trainings)
    db.add_all(equipment)
    db.add_all(supplies)
    db.add_all(vehicles)
    db.add_all(duties)
    db.add_all(announcements)
    db.add_all(logs)
    db.commit()

