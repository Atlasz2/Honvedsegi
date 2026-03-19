"""
Autentikáció – JWT token alapú bejelentkezés
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import os

from database import get_db
from models import Felhasznalo

router = APIRouter()

SECRET_KEY      = os.getenv("SECRET_KEY", "honved-titkos-kulcs-változd-meg!")
ALGORITHM       = "HS256"
TOKEN_LEJARAT   = 480  # perc (8 óra)

pwd_context     = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme   = OAuth2PasswordBearer(tokenUrl="/api/auth/belepes")


def jelszo_ellenorzes(sima: str, hash: str) -> bool:
    return pwd_context.verify(sima, hash)


def jelszo_hashelese(jelszo: str) -> str:
    return pwd_context.hash(jelszo)


def token_keszites(adat: dict) -> str:
    adat["exp"] = datetime.utcnow() + timedelta(minutes=TOKEN_LEJARAT)
    return jwt.encode(adat, SECRET_KEY, algorithm=ALGORITHM)


async def aktualis_felhasznalo(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Felhasznalo:
    hiba = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Érvénytelen vagy lejárt token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        felh_id: int = payload.get("sub")
        if felh_id is None:
            raise hiba
    except JWTError:
        raise hiba

    felh = db.query(Felhasznalo).filter(Felhasznalo.id == felh_id, Felhasznalo.aktiv == True).first()
    if not felh:
        raise hiba

    # Utolsó belépés frissítése
    felh.utolso_belepes = datetime.utcnow()
    db.commit()
    return felh


@router.post("/belepes")
async def belepes(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    felh = db.query(Felhasznalo).filter(
        Felhasznalo.felhasznalonev == form.username,
        Felhasznalo.aktiv == True
    ).first()

    if not felh or not jelszo_ellenorzes(form.password, felh.jelszo_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Hibás felhasználónév vagy jelszó"
        )

    token = token_keszites({"sub": str(felh.id), "szerepkor": felh.szerepkor})
    return {
        "access_token": token,
        "token_type": "bearer",
        "szerepkor": felh.szerepkor,
        "nev": felh.szemely.nev
    }


@router.get("/en")
async def sajat_adatok(felh: Felhasznalo = Depends(aktualis_felhasznalo)):
    return {
        "id": felh.id,
        "felhasznalonev": felh.felhasznalonev,
        "szerepkor": felh.szerepkor,
        "nev": felh.szemely.nev,
    }
