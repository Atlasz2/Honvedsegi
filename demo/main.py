"""
HonvéD – FastAPI backend fő belépési pont
Indítás: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import szemely, beosztas, eszkoz, auth

app = FastAPI(
    title="HonvéD API",
    description="Honvédségi Digitális Adminisztrációs Rendszer",
    version="1.0.0",
)

# CORS – csak a belső hálózatról érkező kérések
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://192.168.1.*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,      prefix="/api/auth",      tags=["Auth"])
app.include_router(szemely.router,   prefix="/api/szemelyek", tags=["Személyek"])
app.include_router(beosztas.router,  prefix="/api/beosztasok",tags=["Beosztások"])
app.include_router(eszkoz.router,    prefix="/api/eszkozok",  tags=["Eszközök"])


@app.get("/")
def root():
    return {"uzenet": "HonvéD API működik", "verzio": "1.0.0"}
