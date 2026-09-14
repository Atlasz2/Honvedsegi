"""Felkészítés-sorozatok (szülő „kártyák") — pl. „7×20 Tartalékos szakfelkészítés".

Egy sorozat alá tartoznak a gyakorlatok/kiképzések (a `series_id` mezővel). A
frontend a sorozat-kártyára lépve hozza létre és listázza a sorozat elemeit.
"""
from __future__ import annotations


from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..core.dependencies import DB, Reader, Editor
from ..core.scope import assert_owned_in_scope, scoped_owned, unit_for_write
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


def _child_counts(db: Session) -> dict[str, int]:
    return {pid: n for pid, n in db.execute(select(SeriesModel.parent_id, func.count()).where(SeriesModel.parent_id != "").group_by(SeriesModel.parent_id)).all()}


def _serialize(series: SeriesModel, item_count: int, child_count: int = 0) -> SeriesRead:
    return SeriesRead(id=series.id, name=series.name, description=series.description, unit=series.unit or "",
                      parentId=series.parent_id or "", itemCount=item_count, childCount=child_count)


def _require_series(db: Session, series_id: str, user) -> SeriesModel:
    series = db.get(SeriesModel, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="A sorozat nem található")
    assert_owned_in_scope(user, series, "A sorozat")
    return series


def _descendant_ids(db: Session, root_id: str) -> list[str]:
    """A sorozat és minden alsorozata (a mátrix az egész fát nézi)."""
    ids = [root_id]
    frontier = [root_id]
    while frontier:
        children = list(db.scalars(select(SeriesModel.id).where(SeriesModel.parent_id.in_(frontier))).all())
        frontier = [c for c in children if c not in ids]
        ids.extend(frontier)
    return ids


@router.get("", response_model=list[SeriesRead])
def list_series(db: DB, user: Reader):
    """Csak a saját zászlóalj (+ ezredszintű) sorozatai — a másik zászlóalj a nevét sem látja."""
    counts = _item_counts(db)
    children = _child_counts(db)
    items = db.scalars(scoped_owned(select(SeriesModel), SeriesModel, user).order_by(SeriesModel.name)).all()
    return [_serialize(s, counts.get(s.id, 0), children.get(s.id, 0)) for s in items]


@router.post("", response_model=SeriesRead, status_code=status.HTTP_201_CREATED)
def create_series(payload: SeriesCreate, db: DB, user: Editor):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="A sorozat neve kötelező")
    parent_id = (payload.parentId or "").strip()
    unit = unit_for_write(user, payload.unit)
    if parent_id:
        parent = _require_series(db, parent_id, user)
        unit = parent.unit or ""   # az alsorozat a szülő zászlóaljáé
    series = SeriesModel(id=new_id(), name=payload.name.strip(), description=payload.description, unit=unit, parent_id=parent_id)
    db.add(series)
    db.commit()
    db.refresh(series)
    return _serialize(series, 0)


@router.put("/{series_id}", response_model=SeriesRead)
def update_series(series_id: str, payload: SeriesUpdate, db: DB, user: Editor):
    series = _require_series(db, series_id, user)
    parent_id = (payload.parentId or "").strip()
    if parent_id and (parent_id == series_id or parent_id in _descendant_ids(db, series_id)):
        raise HTTPException(status_code=400, detail="A sorozat nem lehet a saját alsorozata")
    if parent_id:
        _require_series(db, parent_id, user)
    series.name = payload.name.strip()
    series.description = payload.description
    series.parent_id = parent_id
    if not parent_id:
        series.unit = unit_for_write(user, payload.unit)
    db.commit()
    db.refresh(series)
    return _serialize(series, _item_counts(db).get(series.id, 0), _child_counts(db).get(series.id, 0))


@router.get("/{series_id}/matrix")
def series_matrix(series_id: str, db: DB, user: Reader):
    """Haladási mátrix: ki (résztvevő) melyik modult/szintet teljesítette a
    sorozatban ÉS az alsorozataiban. Teljesítés = 'Megjelent' résztvevő."""
    _require_series(db, series_id, user)
    tree_ids = _descendant_ids(db, series_id)
    names = {sid: name for sid, name in db.execute(select(SeriesModel.id, SeriesModel.name).where(SeriesModel.id.in_(tree_ids))).all()}

    operations: list[dict] = []
    for source, model in (("exercise", ExerciseModel),):
        for item in db.scalars(select(model).where(model.series_id.in_(tree_ids))).all():
            operations.append({
                "id": item.id, "name": item.name, "level": item.level or "",
                "source": source, "startDate": item.start_date,
                "seriesId": item.series_id, "seriesName": names.get(item.series_id, ""),
            })
    operations.sort(key=lambda o: (tree_ids.index(o["seriesId"]) if o["seriesId"] in tree_ids else 99, _LEVEL_ORDER.get(o["level"], 9), o["startDate"], o["name"]))

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
def delete_series(series_id: str, db: DB, user: Editor):
    series = _require_series(db, series_id, user)
    # A gyermek műveletek nem törlődnek, csak önállóvá válnak; az alsorozatok a szülő szintjére lépnek.
    db.execute(update(ExerciseModel).where(ExerciseModel.series_id == series_id).values(series_id=""))
    db.execute(update(SeriesModel).where(SeriesModel.parent_id == series_id).values(parent_id=series.parent_id or ""))
    db.delete(series)
    db.commit()
