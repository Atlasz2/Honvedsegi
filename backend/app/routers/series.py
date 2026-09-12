"""Felkészítés-sorozatok (szülő „kártyák") — pl. „7×20 Tartalékos szakfelkészítés".

Egy sorozat alá tartoznak a gyakorlatok/kiképzések (a `series_id` mezővel). A
frontend a sorozat-kártyára lépve hozza létre és listázza a sorozat elemeit.
"""
from __future__ import annotations


from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..core.dependencies import DB, Reader, Editor
from ..models import ExerciseModel, ParticipantModel, SeriesModel, new_id

_LEVEL_ORDER = {"Alap": 0, "Haladó": 1, "Emelt": 2, "": 9}
from ..schemas import SeriesCreate, SeriesRead, SeriesUpdate

router = APIRouter(prefix="/api/series", tags=["series"])



def _item_counts(db: Session) -> dict[str, int]:
    """Sorozatonkénti elemszám (gyakorlat + kiképzés együtt)."""
    counts: dict[str, int] = {}
    for model in (ExerciseModel,):
        rows = db.execute(
            select(model.series_id, func.count()).where(model.series_id != "").group_by(model.series_id)
        ).all()
        for series_id, count in rows:
            counts[series_id] = counts.get(series_id, 0) + count
    return counts


def _serialize(series: SeriesModel, item_count: int) -> SeriesRead:
    return SeriesRead(id=series.id, name=series.name, description=series.description, itemCount=item_count)


@router.get("", response_model=list[SeriesRead])
def list_series(db: DB, _: Reader):
    counts = _item_counts(db)
    items = db.scalars(select(SeriesModel).order_by(SeriesModel.name)).all()
    return [_serialize(s, counts.get(s.id, 0)) for s in items]


@router.post("", response_model=SeriesRead, status_code=status.HTTP_201_CREATED)
def create_series(payload: SeriesCreate, db: DB, _: Editor):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="A sorozat neve kötelező")
    series = SeriesModel(id=new_id(), name=payload.name.strip(), description=payload.description)
    db.add(series)
    db.commit()
    db.refresh(series)
    return _serialize(series, 0)


@router.put("/{series_id}", response_model=SeriesRead)
def update_series(series_id: str, payload: SeriesUpdate, db: DB, _: Editor):
    series = db.get(SeriesModel, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="A sorozat nem található")
    series.name = payload.name.strip()
    series.description = payload.description
    db.commit()
    db.refresh(series)
    return _serialize(series, _item_counts(db).get(series.id, 0))


@router.get("/{series_id}/matrix")
def series_matrix(series_id: str, db: DB, _: Reader):
    """Haladási mátrix: ki (résztvevő) melyik modult/szintet teljesítette a
    sorozatban. Teljesítés = 'Megjelent' résztvevő az adott elemen."""
    series = db.get(SeriesModel, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="A sorozat nem található")

    operations: list[dict] = []
    for source, model in (("exercise", ExerciseModel),):
        for item in db.scalars(select(model).where(model.series_id == series_id)).all():
            operations.append({
                "id": item.id, "name": item.name, "level": item.level or "",
                "source": source, "startDate": item.start_date,
            })
    operations.sort(key=lambda o: (_LEVEL_ORDER.get(o["level"], 9), o["startDate"], o["name"]))

    op_ids = [o["id"] for o in operations]
    rows_by_person: dict[str, dict] = {}
    if op_ids:
        parts = db.scalars(
            select(ParticipantModel).where(
                ParticipantModel.event_id.in_(op_ids),
                ParticipantModel.status == "Megjelent",
            )
        ).all()
        for p in parts:
            entry = rows_by_person.setdefault(
                p.personnel_id,
                {"personnelId": p.personnel_id, "name": p.person_name, "completed": []},
            )
            entry["completed"].append(p.event_id)

    rows = sorted(rows_by_person.values(), key=lambda r: (r["name"] or "").lower())
    return {"operations": operations, "rows": rows}


@router.delete("/{series_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_series(series_id: str, db: DB, _: Editor):
    series = db.get(SeriesModel, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="A sorozat nem található")
    # A gyermek műveletek nem törlődnek, csak önállóvá válnak.
    db.execute(update(ExerciseModel).where(ExerciseModel.series_id == series_id).values(series_id=""))
    db.delete(series)
    db.commit()
