from app.db import SessionLocal
from app.models import PersonModel, ExerciseModel, TrainingModel, EventModel

first_names = ["Adam", "Bence", "Csaba", "David", "Erik", "Ferenc", "Gabor", "Hunor", "Istvan", "Janos", "Kristof", "Levente", "Mark", "Norbert", "Oliver", "Peter", "Richard", "Sandor", "Tamas", "Viktor", "Zoltan", "Mate", "Balazs", "Attila", "Anna", "Dora", "Eszter", "Reka", "Noemi", "Lilla"]
last_names = ["Kovacs", "Szabo", "Nagy", "Toth", "Varga", "Kiss", "Molnar", "Nemeth", "Farkas", "Horvath", "Papp", "Lakatos", "Takacs", "Juhasz", "Meszaros", "Simon", "Racz", "Fekete", "Biro", "Kelemen"]
ranks = ["Kozkatona", "Tizedes", "Szakaszvezeto", "Ormester", "Torzsormester", "Hadnagy", "Fohadnagy", "Szazados"]
units = ["31 TVZ", "83 TVZ", "19 TVZ", "Ezredtorzs"]
statuses = ["Aktiv", "Tartalekos", "Szabadsagon"]

with SessionLocal() as db:
    db.query(EventModel).delete()
    db.query(TrainingModel).delete()
    db.query(ExerciseModel).delete()
    db.query(PersonModel).delete()

    people = []
    for i in range(1000):
        first = first_names[i % len(first_names)]
        last = last_names[(i * 7) % len(last_names)]
        full_name = f"{last} {first}"
        sztsz = f"{30000000 + i:08d}"
        people.append(
            PersonModel(
                id=f"p{i+1}",
                name=full_name,
                sztsz=sztsz,
                rank=ranks[i % len(ranks)],
                unit=units[i % len(units)],
                status=statuses[i % len(statuses)],
                email=f"{last.lower()}.{first.lower()}{i % 97}@honved.local",
                phone=f"+36 20 {100 + (i % 900)} {1000 + (i % 9000)}",
                birth_date=f"{1980 + (i % 25):04d}-{1 + (i % 12):02d}-{1 + (i % 28):02d}",
                address=f"Budapest, Fo utca {1 + (i % 220)}.",
                join_date=f"{2010 + (i % 15):04d}-{1 + (i % 12):02d}-{1 + (i % 28):02d}",
                notes="Teszt adat",
            )
        )
    db.add_all(people)

    db.add_all([
        ExerciseModel(id="e1", name="Tavaszi logyakorlat", type="Logyakorlat", start_date="2026-04-10", end_date="2026-04-12", location="Esztergom, Loter", max_personnel=50, description="Teszt gyakorlat 1", status="Tervezett", assigned=[]),
        ExerciseModel(id="e2", name="Torzsgyakorlat Bravo", type="Torzsgyakorlat", start_date="2026-05-05", end_date="2026-05-07", location="Budapest", max_personnel=40, description="Teszt gyakorlat 2", status="Tervezett", assigned=[]),
        ExerciseModel(id="e3", name="Keszenleti gyakorlat", type="Terepgyakorlat", start_date="2026-06-01", end_date="2026-06-03", location="Kiskunhalas", max_personnel=60, description="Teszt gyakorlat 3", status="Tervezett", assigned=[]),
    ])

    db.add_all([
        TrainingModel(id="t1", name="Elsosegely tanfolyam", type="Elsosegely", start_date="2026-04-15", end_date="2026-04-16", location="Budapest", organizer="Egeszsegugyi Csoport", max_personnel=30, description="Teszt kikepzes 1", status="Tervezett", assigned=[]),
        TrainingModel(id="t2", name="Loveszeti mesterkurzus", type="Loveszeti", start_date="2026-05-20", end_date="2026-05-22", location="Esztergom", organizer="Kikepzesi Torzs", max_personnel=25, description="Teszt kikepzes 2", status="Tervezett", assigned=[]),
    ])

    db.add_all([
        EventModel(id="ev1", event_type="esemeny", name="Allomanygyules", type="Altalanos", start_date="2026-04-08", end_date="2026-04-08", location="Budapest", organizer="Torzs", max_personnel=120, description="Teszt esemeny 1", status="Tervezett", assigned=[]),
        EventModel(id="ev2", event_type="esemeny", name="Rendezvenybiztositas", type="Rendezveny", start_date="2026-04-18", end_date="2026-04-18", location="Varoshaza ter", organizer="31 TVZ", max_personnel=80, description="Teszt esemeny 2", status="Tervezett", assigned=[]),
        EventModel(id="ev3", event_type="esemeny", name="Kikepzesi tajekoztato", type="Tajekoztato", start_date="2026-05-02", end_date="2026-05-02", location="Kecskemet", organizer="83 TVZ", max_personnel=100, description="Teszt esemeny 3", status="Tervezett", assigned=[]),
        EventModel(id="ev4", event_type="esemeny", name="Unnepseg", type="Unnepseg", start_date="2026-05-15", end_date="2026-05-15", location="Laktanya", organizer="19 TVZ", max_personnel=150, description="Teszt esemeny 4", status="Tervezett", assigned=[]),
        EventModel(id="ev5", event_type="esemeny", name="Parancsnoki forum", type="Altalanos", start_date="2026-06-05", end_date="2026-06-05", location="Budapest", organizer="Ezredtorzs", max_personnel=60, description="Teszt esemeny 5", status="Tervezett", assigned=[]),
    ])

    db.commit()
    print('PERSONNEL', db.query(PersonModel).count())
    print('EXERCISES', db.query(ExerciseModel).count())
    print('TRAININGS', db.query(TrainingModel).count())
    print('EVENTS', db.query(EventModel).count())
