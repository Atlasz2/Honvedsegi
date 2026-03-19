"""
Eszközök / felszerelés CRUD + kiadás-visszavétel végpontok
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from database import get_db
from models import Eszkoz, EszkozKiadasa, EszkozAllapot
from routers.auth import aktualis_felhasznalo

router = APIRouter()


class EszkozLetrehozas(BaseModel):
    nev:          str
    kategoria:    Optional[str] = None
    sorozatszam:  Optional[str] = None
    allapot:      EszkozAllapot = EszkozAllapot.jo
    qr_kod:       Optional[str] = None
    leiras:       Optional[str] = None


class EszkozValasz(EszkozLetrehozas):
    id: int
    class Config:
        from_attributes = True


class EszkozKiadasLetrehozas(BaseModel):
    szemely_id:  int
    megjegyzes:  Optional[str] = None


@router.get("/", response_model=List[EszkozValasz])
def lista(
    allapot: Optional[str] = None,
    szabad: Optional[bool] = None,
    db: Session = Depends(get_db),
    _=Depends(aktualis_felhasznalo)
):
    q = db.query(Eszkoz)
    if allapot:
        q = q.filter(Eszkoz.allapot == allapot)
    if szabad is True:
        kint = db.query(EszkozKiadasa.eszkoz_id).filter(EszkozKiadasa.visszaveve == None)
        q = q.filter(~Eszkoz.id.in_(kint))
    if szabad is False:
        kint = db.query(EszkozKiadasa.eszkoz_id).filter(EszkozKiadasa.visszaveve == None)
        q = q.filter(Eszkoz.id.in_(kint))
    return q.order_by(Eszkoz.nev).all()


@router.get("/qr/{qr_kod}", response_model=EszkozValasz)
def qr_kereses(
    qr_kod: str,
    db: Session = Depends(get_db),
    _=Depends(aktualis_felhasznalo)
):
    e = db.query(Eszkoz).filter(Eszkoz.qr_kod == qr_kod).first()
    if not e:
        raise HTTPException(status_code=404, detail="Ismeretlen QR kód")
    return e


@router.post("/", response_model=EszkozValasz, status_code=201)
def letrehozas(
    adat: EszkozLetrehozas,
    db: Session = Depends(get_db),
    felh=Depends(aktualis_felhasznalo)
):
    if felh.szerepkor == "felhasznalo":
        raise HTTPException(status_code=403, detail="Nincs jogosultság")
    uj = Eszkoz(**adat.dict())
    db.add(uj)
    db.commit()
    db.refresh(uj)
    return uj


@router.post("/{eszkoz_id}/kiad", status_code=201)
def eszkoz_kiad(
    eszkoz_id: int,
    adat: EszkozKiadasLetrehozas,
    db: Session = Depends(get_db),
    felh=Depends(aktualis_felhasznalo)
):
    # Szabad-e az eszköz?
    mar_kint = db.query(EszkozKiadasa).filter(
        EszkozKiadasa.eszkoz_id == eszkoz_id,
        EszkozKiadasa.visszaveve == None
    ).first()
    if mar_kint:
        raise HTTPException(status_code=409, detail="Az eszköz már ki van adva")

    kiadva = EszkozKiadasa(
        eszkoz_id=eszkoz_id,
        szemely_id=adat.szemely_id,
        kiadta_felh_id=felh.id,
        megjegyzes=adat.megjegyzes
    )
    db.add(kiadva)
    db.commit()
    return {"uzenet": "Eszköz kiadva"}


@router.post("/{eszkoz_id}/visszavesz")
def eszkoz_visszavesz(
    eszkoz_id: int,
    db: Session = Depends(get_db),
    _=Depends(aktualis_felhasznalo)
):
    kint = db.query(EszkozKiadasa).filter(
        EszkozKiadasa.eszkoz_id == eszkoz_id,
        EszkozKiadasa.visszaveve == None
    ).first()
    if not kint:
        raise HTTPException(status_code=404, detail="Az eszköz nincs kiadva")
    kint.visszaveve = datetime.utcnow()
    db.commit()
    return {"uzenet": "Eszköz visszavéve"}


@router.get("/{eszkoz_id}/naplo")
def kiadasi_naplo(
    eszkoz_id: int,
    db: Session = Depends(get_db),
    _=Depends(aktualis_felhasznalo)
):
    return db.query(EszkozKiadasa).filter(
        EszkozKiadasa.eszkoz_id == eszkoz_id
    ).order_by(EszkozKiadasa.kiadva.desc()).all()
