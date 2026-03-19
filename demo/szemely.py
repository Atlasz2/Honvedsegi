"""
Személyek CRUD végpontok
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import date

from database import get_db
from models import Szemely, SzemelySatusz
from routers.auth import aktualis_felhasznalo

router = APIRouter()


class SzemelyLetrehozas(BaseModel):
    nev:               str
    rendfokozat:       str
    alakulat:          str
    statusz:           SzemelySatusz = SzemelySatusz.aktiv
    email:             Optional[str] = None
    telefon:           Optional[str] = None
    szolgalat_kezdete: Optional[date] = None
    megjegyzes:        Optional[str] = None


class SzemelyValasz(SzemelyLetrehozas):
    id: int
    class Config:
        from_attributes = True


@router.get("/", response_model=List[SzemelyValasz])
def lista(
    statusz: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(aktualis_felhasznalo)
):
    q = db.query(Szemely)
    if statusz:
        q = q.filter(Szemely.statusz == statusz)
    return q.order_by(Szemely.nev).all()


@router.get("/{szemely_id}", response_model=SzemelyValasz)
def reszletek(
    szemely_id: int,
    db: Session = Depends(get_db),
    _=Depends(aktualis_felhasznalo)
):
    sz = db.query(Szemely).filter(Szemely.id == szemely_id).first()
    if not sz:
        raise HTTPException(status_code=404, detail="Személy nem található")
    return sz


@router.post("/", response_model=SzemelyValasz, status_code=status.HTTP_201_CREATED)
def letrehozas(
    adat: SzemelyLetrehozas,
    db: Session = Depends(get_db),
    felh=Depends(aktualis_felhasznalo)
):
    if felh.szerepkor == "felhasznalo":
        raise HTTPException(status_code=403, detail="Nincs jogosultság")
    uj = Szemely(**adat.dict())
    db.add(uj)
    db.commit()
    db.refresh(uj)
    return uj


@router.put("/{szemely_id}", response_model=SzemelyValasz)
def frissites(
    szemely_id: int,
    adat: SzemelyLetrehozas,
    db: Session = Depends(get_db),
    felh=Depends(aktualis_felhasznalo)
):
    if felh.szerepkor == "felhasznalo":
        raise HTTPException(status_code=403, detail="Nincs jogosultság")
    sz = db.query(Szemely).filter(Szemely.id == szemely_id).first()
    if not sz:
        raise HTTPException(status_code=404, detail="Személy nem található")
    for k, v in adat.dict().items():
        setattr(sz, k, v)
    db.commit()
    db.refresh(sz)
    return sz


@router.delete("/{szemely_id}", status_code=status.HTTP_204_NO_CONTENT)
def torles(
    szemely_id: int,
    db: Session = Depends(get_db),
    felh=Depends(aktualis_felhasznalo)
):
    if felh.szerepkor != "parancsnok":
        raise HTTPException(status_code=403, detail="Csak parancsnok törölhet")
    sz = db.query(Szemely).filter(Szemely.id == szemely_id).first()
    if not sz:
        raise HTTPException(status_code=404, detail="Személy nem található")
    db.delete(sz)
    db.commit()
