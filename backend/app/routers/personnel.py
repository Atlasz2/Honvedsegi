from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..db import get_db
from ..deps import (
    _apply_person, _assert_unique_sztsz, _get_current_user,
    _normalize_sztsz, _require_editor, _require_model, _serialize_person,
)
from ..models import PersonModel, UserModel
from ..schemas import PersonCreate, PersonRead, PersonUpdate

router = APIRouter(prefix="/api/personnel", tags=["personnel"])


@router.get("", response_model=list[PersonRead])
def list_personnel(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):
    items = [_serialize_person(i) for i in db.scalars(select(PersonModel)).all()]
    items.sort(key=lambda i: ((i.name or "").strip().lower(), (i.sztsz or "").strip().lower()))
    return items


@router.get("/paged")
def list_personnel_paged(
    page: int = 1, page_size: int = 25, q: str = "", unit: str = "",
    status_filter: str = "", sort_by: str = "name", sort_dir: str = "asc",
    db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user),
):
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    filters = []
    if unit.strip():
        filters.append(PersonModel.unit == unit.strip())
    if status_filter.strip() and status_filter.strip() != "Osszes":
        filters.append(PersonModel.status == status_filter.strip())
    base_query = select(PersonModel)
    for cond in filters:
        base_query = base_query.where(cond)
    rank_order = {
        "honved": 1, "kozkatona": 1, "kozlegeny": 1, "tizedes": 2,
        "szakaszvezeto": 3, "ormester": 4, "torzsormester": 5,
        "fotorzsormester": 6, "szaszlos": 7, "torszszaszlos": 8,
        "fotoszszaszlos": 9, "hadnagy": 10, "fohadnagy": 11,
        "szazados": 12, "ornagy": 13, "alezredes": 14, "ezredes": 15,
    }
    def _n(v): return (v or "").strip().lower()
    def _rank(item): return rank_order.get(_n(item.rank))
    sort_keys = {
        "name":     lambda i: (_n(i.name), _n(i.sztsz)),
        "sztsz":    lambda i: (_n(i.sztsz), _n(i.name)),
        "unit":     lambda i: (_n(i.unit), _n(i.name)),
        "status":   lambda i: (_n(i.status), _n(i.name)),
        "joinDate": lambda i: (_n(i.joinDate), _n(i.name)),
    }
    all_items = [_serialize_person(i) for i in db.scalars(base_query).all()]
    qt = q.strip().lower()
    if qt:
        all_items = [i for i in all_items
                     if qt in _n(i.name) or qt in _n(i.sztsz)
                     or qt in _n(i.rank) or qt in _n(i.unit)]
    rev = sort_dir.lower() == "desc"
    if sort_by == "rank":
        if rev:
            all_items.sort(key=lambda i: (_rank(i) is None, -(_rank(i) or 0), _n(i.name)))
        else:
            all_items.sort(key=lambda i: (_rank(i) is None, _rank(i) or 999, _n(i.name)))
    else:
        all_items.sort(key=sort_keys.get(sort_by, sort_keys["name"]), reverse=rev)
    total = len(all_items)
    total_pages = max(1, (total + page_size - 1) // page_size)
    page = min(page, total_pages)
    offset = (page - 1) * page_size
    return {"items": [i.model_dump() for i in all_items[offset:offset + page_size]],
            "page": page, "pageSize": page_size, "total": total, "totalPages": total_pages}


@router.post("", response_model=PersonRead)
def create_person(payload: PersonCreate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    normalized = _normalize_sztsz(payload.sztsz)
    _assert_unique_sztsz(db, normalized)
    item = PersonModel()
    payload.sztsz = normalized
    _apply_person(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_person(item)


@router.put("/{item_id}", response_model=PersonRead)
def update_person(item_id: str, payload: PersonUpdate, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, PersonModel, item_id)
    normalized = _normalize_sztsz(payload.sztsz)
    _assert_unique_sztsz(db, normalized, exclude_id=item_id)
    payload.sztsz = normalized
    _apply_person(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_person(item)


@router.delete("/{item_id}", status_code=204)
def delete_person(item_id: str, db: Session = Depends(get_db), _: UserModel = Depends(_require_editor)):
    item = _require_model(db, PersonModel, item_id)
    db.delete(item)
    db.commit()
