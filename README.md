# Guard Guard Duty

Ez a projekt most már két részből áll:

- Vite + React frontend, a meglévő kinézet megtartásával
- FastAPI + SQLite backend, valódi adatbázissal és REST API-val

A cél az volt, hogy a korábbi localStorage-alapú demó helyett olyan rendszer legyen mögötte, ami intranetes környezetben is használható, több egyidejű felhasználóval, külön adatbázissal és API-réteggel.

## Fő változások

- A teljes frontend megmaradt vizuálisan, de az üzleti adatok már nem a böngészőben élnek.
- Bejelentkezés FastAPI backendhez kapcsolódik.
- Az összes fő modul API-n kommunikál:
  - személyek
  - gyakorlatok
  - kiképzések
  - felszerelés
  - készletek
  - járművek
  - szolgálatok
  - közlemények
  - felhasználók
  - tevékenységnapló
- A backend SQLite adatbázist használ, seed adatokkal.
- A referencia célként megadott FastAPI irányt beépítettem a projekt saját backendjébe, hogy a frontend közvetlenül ehhez a rendszerhez tudjon kapcsolódni.

## Technológia

### Frontend

- React 18
- TypeScript
- Vite
- Tailwind / meglévő UI komponensek

### Backend

- FastAPI
- SQLAlchemy
- SQLite
- Pydantic

## Könyvtárstruktúra

```text
guard-guard-duty/
  backend/
    app/
      db.py
      main.py
      models.py
      schemas.py
      security.py
      seed.py
    requirements.txt
  src/
    components/
    lib/
    pages/
```

## Indítás fejlesztéshez

### 1. Frontend függőségek

```powershell
npm install
```

### 2. Backend függőségek

```powershell
pip install -r backend/requirements.txt
```

### 3. Backend indítása

```powershell
cd backend
uvicorn app.main:app --reload --port 8000
```

### 4. Frontend indítása

```powershell
npm run dev
```

A frontend alapértelmezetten a következő API címet használja:

```text
http://127.0.0.1:8000/api
```

Ha ettől eltérő backend címet akarsz használni, állítsd be a `VITE_API_URL` környezeti változót.

## Demo belépések

- admin / admin123
- kovacs / admin123
- dev / dev123

## Miért jó ez az irány az alapkövetelményre

A kiinduló igény az volt, hogy az Excel és Word fájlok helyett legyen egy központi rendszer, amiből gyorsan megállapítható például:

- jövő héten lesz-e lőtéri foglalkozás
- két hét múlva ki van behívás vagy szolgálat alatt
- van-e ütközés szolgálat, kiképzés és gyakorlat között
- milyen készlet vagy felszerelés áll rendelkezésre

Ez a verzió már erre alkalmasabb, mert:

- a böngészőnként eltérő helyi adat helyett központi adatbázist használ
- több gépről ugyanazokat az adatokat látják a felhasználók
- a frontend API-n keresztül kommunikál, így később könnyebb jogosultságot, riportot vagy importot építeni rá
- intranetes környezetben is egyszerűen telepíthető

## További ésszerű következő lépések

- Excel import modul készítése a meglévő állományok migrálásához
- részletesebb jogosultsági modell
- audit napló automatikus szerveroldali bővítése minden módosításra
- ütközésellenőrzés szerveroldali validációval
- rendszeres mentés az SQLite adatbázisról

## Követelményhez célzott API lekérdezés

A következő operatív kérdésekhez készült egy dedikált összesítő végpont:

- jövő héten lesz-e lőtéri foglalkozás
- két hét múlva kik vannak szolgálat/behívás alatt

Végpont:

```text
GET /api/operations/summary
```

Opcionális paraméter:

```text
base_date=YYYY-MM-DD
```

Ha nincs megadva, az aktuális napból számol.

## Skálázás intranetre (SQLite)

A backend SQLite konfigurációja konkurens használatra lett hangolva:

- WAL mód (`journal_mode=WAL`)
- `busy_timeout` beállítva
- `check_same_thread=False`
- indexelt keresés a személyeknél, beleértve az SZTSz mezőt

Ez a terhelési szint (kb. 10 egyidejű szerkesztő + 40 olvasó, ~1000 fő adat) intranetes környezetben reális.
