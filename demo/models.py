"""
SQLAlchemy modellek – tükrözik a MySQL sémát
"""

from sqlalchemy import Column, Integer, String, Date, DateTime, Text, Boolean, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


class SzemelySatusz(str, enum.Enum):
    aktiv        = "aktív"
    tartalekos   = "tartalékos"
    leszerelt    = "leszerelt"
    szabadsagon  = "szabadságon"


class Szerepkor(str, enum.Enum):
    parancsnok      = "parancsnok"
    adminisztrator  = "adminisztrator"
    felhasznalo     = "felhasznalo"


class BeosztasTipus(str, enum.Enum):
    kiképzés   = "kiképzés"
    gyakorlat  = "gyakorlat"
    szolgálat  = "szolgálat"
    rendezvény = "rendezvény"
    egyéb      = "egyéb"


class EszkozAllapot(str, enum.Enum):
    jo           = "jó"
    javitando    = "javítandó"
    selejtezendo = "selejtezendő"


class Szemely(Base):
    __tablename__ = "szemely"

    id                 = Column(Integer, primary_key=True, index=True)
    nev                = Column(String(100), nullable=False)
    rendfokozat        = Column(String(50),  nullable=False)
    alakulat           = Column(String(100), nullable=False)
    statusz            = Column(Enum(SzemelySatusz), default=SzemelySatusz.aktiv)
    email              = Column(String(150))
    telefon            = Column(String(30))
    szolgalat_kezdete  = Column(Date)
    megjegyzes         = Column(Text)
    letrehozva         = Column(DateTime, server_default=func.now())
    modositva          = Column(DateTime, server_default=func.now(), onupdate=func.now())

    felhasznalo        = relationship("Felhasznalo", back_populates="szemely", uselist=False)
    beosztasok         = relationship("BeosztasSzemely", back_populates="szemely")
    eszkoz_kiadasok    = relationship("EszkozKiadasa", back_populates="szemely")


class Felhasznalo(Base):
    __tablename__ = "felhasznalo"

    id              = Column(Integer, primary_key=True, index=True)
    szemely_id      = Column(Integer, ForeignKey("szemely.id", ondelete="CASCADE"), nullable=False)
    felhasznalonev  = Column(String(80), nullable=False, unique=True)
    jelszo_hash     = Column(String(255), nullable=False)
    szerepkor       = Column(Enum(Szerepkor), default=Szerepkor.felhasznalo)
    aktiv           = Column(Boolean, default=True)
    utolso_belepes  = Column(DateTime)

    szemely         = relationship("Szemely", back_populates="felhasznalo")


class Beosztas(Base):
    __tablename__ = "beosztas"

    id          = Column(Integer, primary_key=True, index=True)
    nev         = Column(String(150), nullable=False)
    tipus       = Column(Enum(BeosztasTipus), nullable=False)
    kezdete     = Column(Date, nullable=False)
    vege        = Column(Date, nullable=False)
    helyszin    = Column(String(200))
    leiras      = Column(Text)
    letrehozva  = Column(DateTime, server_default=func.now())

    szemelyek   = relationship("BeosztasSzemely", back_populates="beosztas")


class BeosztasSzemely(Base):
    __tablename__ = "beosztas_szemely"
    __table_args__ = (UniqueConstraint("beosztas_id", "szemely_id"),)

    id                  = Column(Integer, primary_key=True, index=True)
    beosztas_id         = Column(Integer, ForeignKey("beosztas.id", ondelete="CASCADE"))
    szemely_id          = Column(Integer, ForeignKey("szemely.id",  ondelete="CASCADE"))
    szerep              = Column(String(80), default="résztvevő")
    jelenleti_allapot   = Column(String(20), default="tervezett")

    beosztas  = relationship("Beosztas", back_populates="szemelyek")
    szemely   = relationship("Szemely",  back_populates="beosztasok")


class Eszkoz(Base):
    __tablename__ = "eszkoz"

    id           = Column(Integer, primary_key=True, index=True)
    nev          = Column(String(150), nullable=False)
    kategoria    = Column(String(80))
    sorozatszam  = Column(String(100), unique=True)
    allapot      = Column(Enum(EszkozAllapot), default=EszkozAllapot.jo)
    qr_kod       = Column(String(100), unique=True)
    leiras       = Column(Text)
    letrehozva   = Column(DateTime, server_default=func.now())

    kiadasok     = relationship("EszkozKiadasa", back_populates="eszkoz")


class EszkozKiadasa(Base):
    __tablename__ = "eszkoz_kiadasa"

    id              = Column(Integer, primary_key=True, index=True)
    eszkoz_id       = Column(Integer, ForeignKey("eszkoz.id"),   nullable=False)
    szemely_id      = Column(Integer, ForeignKey("szemely.id"),  nullable=False)
    kiadva          = Column(DateTime, server_default=func.now())
    visszaveve      = Column(DateTime)
    kiadta_felh_id  = Column(Integer, ForeignKey("felhasznalo.id"), nullable=True)
    megjegyzes      = Column(Text)

    eszkoz   = relationship("Eszkoz",  back_populates="kiadasok")
    szemely  = relationship("Szemely", back_populates="eszkoz_kiadasok")
