from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
from sqlalchemy import create_engine, text

# SQLite adatbázis (file vagy :memory:)
engine = create_engine("sqlite:///database/data.db", future=True)

app = FastAPI(
    title="Honvédségi személyek API",
    description="Egyszerű FastAPI felület a szemelyek táblához SQLite adatbázisból",
    version="1.0.0",
)


@app.get("/")
async def root():
    """Egyszerű root végpont, hogy a backend ne 404-et adjon gyökér URL-en."""
    return {
        "status": "ok",
        "message": "Backend fut.",
        "docs": "/docs",
        "szemelyek": "/szemelyek",
    }

class Szemely(BaseModel):
    nev: str
    rendfokozat: str
    azonosito: str
    szuletesi_hely: str
    szuletesi_ido: str


def _fetch_all_szemelyek() -> List[Szemely]:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT * FROM szemelyek"))
        rows = result.mappings().all()

    return [Szemely(**row) for row in rows]


def _fetch_szemely_by_azonosito(azonosito: str) -> Szemely | None:
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT * FROM szemelyek WHERE azonosito = :azonosito"),
            {"azonosito": azonosito},
        )
        row = result.mappings().first()

    return Szemely(**row) if row else None


@app.get("/szemelyek", response_model=List[Szemely])
async def get_szemelyek():
    """Visszaadja az összes személyt."""
    return _fetch_all_szemelyek()


@app.get("/szemelyek/{azonosito}", response_model=Szemely)
async def get_szemely(azonosito: str):
    """Visszaad egy személyt az azonosító alapján."""
    szemely = _fetch_szemely_by_azonosito(azonosito)
    if szemely is None:
        raise HTTPException(status_code=404, detail="Személy nem található")
    return szemely


if __name__ == "__main__":
    import uvicorn

    print("FastAPI szerver indítása: http://127.0.0.1:8000")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
