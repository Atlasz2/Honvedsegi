from datetime import date, timedelta

from app.db import SessionLocal
from app.models import EventModel, ExerciseModel, TrainingModel

statuses = ["Tervezett", "Folyamatban", "Befejezett", "Törölve"]
exercise_types = ["field-exercise", "marksmanship", "tactical", "fitness"]
training_types = ["basic", "combat-training", "marksmanship", "tactical"]
event_types = ["Általános", "Rendezvény", "Tájékoztató", "Ünnepség"]

start_base = date(2026, 4, 1)

with SessionLocal() as db:
    db.query(ExerciseModel).delete()
    db.query(TrainingModel).delete()
    db.query(EventModel).delete()

    exercises = []
    trainings = []
    events = []

    for i in range(10):
        start = start_base + timedelta(days=i * 3)
        end = start + timedelta(days=1)
        exercises.append(
            ExerciseModel(
                id=f"ex{i+1}",
                name=f"Gyakorlat {i+1}",
                type=exercise_types[i % len(exercise_types)],
                start_date=start.isoformat(),
                end_date=end.isoformat(),
                location=f"Lőtér {i+1}",
                max_personnel=20 + i,
                description=f"Automatikusan generált gyakorlat #{i+1}",
                status=statuses[i % len(statuses)],
                assigned=[],
            )
        )

        t_start = start + timedelta(days=1)
        t_end = t_start + timedelta(days=1)
        trainings.append(
            TrainingModel(
                id=f"tr{i+1}",
                name=f"Kiképzés {i+1}",
                type=training_types[i % len(training_types)],
                start_date=t_start.isoformat(),
                end_date=t_end.isoformat(),
                location=f"Kiképzőbázis {i+1}",
                max_personnel=15 + i,
                description=f"Automatikusan generált kiképzés #{i+1}",
                status=statuses[i % len(statuses)],
                assigned=[],
            )
        )

        e_start = start + timedelta(days=2)
        e_end = e_start + timedelta(days=1)
        events.append(
            EventModel(
                id=f"ev{i+1}",
                event_type="esemeny",
                name=f"Esemény {i+1}",
                type=event_types[i % len(event_types)],
                start_date=e_start.isoformat(),
                end_date=e_end.isoformat(),
                location=f"Helyszín {i+1}",
                organizer="Rendszer",
                max_personnel=50,
                description=f"Automatikusan generált esemény #{i+1}",
                status=statuses[i % len(statuses)],
                assigned=[],
            )
        )

    db.add_all(exercises + trainings + events)
    db.commit()

    ex_count = db.query(ExerciseModel).count()
    tr_count = db.query(TrainingModel).count()
    ev_count = db.query(EventModel).count()

print(f"Kész. Gyakorlat: {ex_count}, Kiképzés: {tr_count}, Esemény: {ev_count}")
