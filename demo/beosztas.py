"""
Beosztások CRUD végpontok
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date

from database import get_db
from models import Beosztas, BeosztasSzemely, BeosztasTipus
from routers.auth import aktualis_felhasznalo

router = APIRouter()


class BeosztasLetrehozas(BaseModel):
    nev:       str
    tipus:     BeosztasTipus
    kezdete:   date
    vege:      date
    helyszin:  Optional[str] = None
    leiras:    Optional[str] = None


class BeosztasValasz(BeosztasLetrehozas):
    id: int
    class Config:
        from_attributes = True


class SzemelyHozzaadas(BaseModel):
    szemely_id: int
    szerep:     str = "résztvevő"


@router.get("/", response_model=List[BeosztasValasz])
def lista(
    jovoben: bool = True,
    db: Session = Depends(get_db),
    _=Depends(aktualis_felhasznalo)
):
    q = db.query(Beosztas)
    if jovoben:
        q = q.filter(Beosztas.vege >= date.today())
    return q.order_by(Beosztas.kezdete).all()


@router.get("/{beosztas_id}", response_model=BeosztasValasz)
def reszletek(
    beosztas_id: int,
    db: Session = Depends(get_db),
    _=Depends(aktualis_felhasznalo)
):
    b = db.query(Beosztas).filter(Beosztas.id == beosztas_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Beosztás nem található")
    return b


@router.post("/", response_model=BeosztasValasz, status_code=201)
def letrehozas(
    adat: BeosztasLetrehozas,
    db: Session = Depends(get_db),
    felh=Depends(aktualis_felhasznalo)
):
    if felh.szerepkor == "felhasznalo":
        raise HTTPException(status_code=403, detail="Nincs jogosultság")
    if adat.vege < adat.kezdete:
        raise HTTPException(status_code=400, detail="A vége dátum nem lehet korábbi a kezdetnél")
    uj = Beosztas(**adat.dict())
    db.add(uj)
    db.commit()
    db.refresh(uj)
    return uj


@router.post("/{beosztas_id}/szemelyek", status_code=201)
def szemely_hozzaad(
    beosztas_id: int,
    adat: SzemelyHozzaadas,
    db: Session = Depends(get_db),
    felh=Depends(aktualis_felhasznalo)
):
    if felh.szerepkor == "felhasznalo":
        raise HTTPException(status_code=403, detail="Nincs jogosultság")
    # Ütközésdetektálás: van-e már aktív beosztása ebben az időszakban?
    beosztas = db.query(Beosztas).filter(Beosztas.id == beosztas_id).first()
    if not beosztas:
        raise HTTPException(status_code=404, detail="Beosztás nem található")

    utkozik = db.query(BeosztasSzemely).join(Beosztas).filter(
        BeosztasSzemely.szemely_id == adat.szemely_id,
        Beosztas.kezdete <= beosztas.vege,
        Beosztas.vege    >= beosztas.kezdete,
        BeosztasSzemely.beosztas_id != beosztas_id,
    ).first()

    if utkozik:
        raise HTTPException(status_code=409, detail="A személy már be van osztva egy ütköző időszakra")

    kapcs = BeosztasSzemely(
        beosztas_id=beosztas_id,
        szemely_id=adat.szemely_id,
        szerep=adat.szerep
    )
    db.add(kapcs)
    db.commit()
    return {"uzenet": "Személy hozzáadva a beosztáshoz"}


@router.get("/{beosztas_id}/szemelyek")
def szemelyek_listaja(
    beosztas_id: int,
    db: Session = Depends(get_db),
    _=Depends(aktualis_felhasznalo)
):
    return db.query(BeosztasSzemely).filter(BeosztasSzemely.beosztas_id == beosztas_id).all()
