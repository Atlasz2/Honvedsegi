from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .models import (
    ActivityLogModel,
    AnnouncementModel,
    DutyModel,
    EquipmentModel,
    ExerciseModel,
    PersonModel,
    SupplyModel,
    TrainingModel,
    UserModel,
    VehicleModel,
)
from .security import hash_password


def seed_database(db: Session) -> None:
    if db.query(UserModel).first():
        return

    users = [
        UserModel(username="admin", password_hash=hash_password("admin123"), display_name="Szabó Anna", role="admin", active=True),
        UserModel(username="kovacs", password_hash=hash_password("admin123"), display_name="Kovács János", role="reader", active=True),
        UserModel(username="nagy", password_hash=hash_password("admin123"), display_name="Nagy Péter", role="reader", active=True),
        UserModel(username="dev", password_hash=hash_password("dev123"), display_name="Fejlesztő", role="fejleszto", active=True),
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
