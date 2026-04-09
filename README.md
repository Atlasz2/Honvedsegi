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
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Frontend indítása

```powershell
npm run dev
```

A frontend alapértelmezetten relatív API útvonalat használ:

```text
/api
```

Ha ettől eltérő backend címet akarsz használni, állítsd be a `VITE_API_URL` környezeti változót.

## Offline / intranet üzem (internet nélkül)

A rendszer internet nélkül is futtatható, ha a függőségeket előre letöltöd vagy belső tükörből szolgálod ki.

- Frontend csomagok:
  - használj belső npm registry-t vagy előre feltöltött npm cache-t
  - telepítés internet nélkül: `npm ci --offline`
- Backend csomagok:
  - készíts wheelhouse mappát internetes gépen: `pip download -r backend/requirements.txt -d backend/wheels`
  - telepítés intraneten: `pip install --no-index --find-links backend/wheels -r backend/requirements.txt`
- Frontend kiadás:
  - `npm run build`
  - a `dist/` kimenetet szolgáld ki intranetes webszerverről (IIS/Nginx)
- API kommunikáció:
  - javasolt, hogy ugyanazon host alatt menjen frontend + backend
  - frontend útvonal: `/api`
  - backend végpontok: `/api/...`
  - ha külön host/port kell, állítsd be a `VITE_API_URL` értékét

## Kötelező biztonsági változók

A backend indításához kötelezően be kell állítani:

- `BACKEND_ADMIN_PASSWORD`
- `BACKEND_DEV_MASTER_PASSWORD`
- `BACKEND_PASSWORD_PEPPER` (hosszú, random, csak szerveren tárolt titok)
- `BACKEND_TOKEN_PEPPER` (session token fingerprinthez használt külön titok)
- `BACKEND_DATA_KEY` (Fernet base64 kulcs a személyzeti adatok érzékeny mezőinek DB-szintű titkosításához; `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` paranccsal generálható)
- `BACKEND_READER_PASSWORD` (olvasó tesztfiók jelszava)
- `BACKEND_EDITOR_PASSWORD` (szerkesztő tesztfiók jelszava)

Éles (production) módban kötelező hálózati korlátozások:

- `BACKEND_ENV=production`
- `BACKEND_ALLOWED_ORIGINS`
  - példa: `http://192.168.1.50:8080`
- `BACKEND_ALLOWED_HOSTS`
  - példa: `192.168.1.50,localhost`

Fontos: production módban a backend API dokumentáció (`/docs`, `/redoc`, `/openapi.json`) le van tiltva.

A rendszerben csak a `dev_master` lehet fejlesztői (god-level) szerepben.
Más felhasználóhoz a `fejleszto` szerep API-n keresztül nem rendelhető.

## Szerepkörök (éles modell)

- **Olvasó (`reader`)**: csak olvasás, módosítás nélkül.
- **Szerkesztő (`editor`)**: olvasás + adatmódosítás.
- **Admin (`admin`)**: olvasás + adatmódosítás + beállítások (felhasználókezelés) az alkalmazáson belül.
- **Dev master (`fejleszto`, `dev_master` felhasználó)**: teljes jogosultság (god-level), kizárólag a fejlesztői csapatnak, más felhasználónak nem adható ki.

## Teszt belépések (jelenlegi)

A jelenlegi rendszerben a bejelentkezési adatok környezeti változókból jönnek.

- `olvaso` / `${BACKEND_READER_PASSWORD}`
- `szerkeszto` / `${BACKEND_EDITOR_PASSWORD}`
- `admin` / `${BACKEND_ADMIN_PASSWORD}`
- `dev_master` / `${BACKEND_DEV_MASTER_PASSWORD}`

Gyors helyi teszthez (csak teszt környezetben) használhatsz fix értékeket:

```powershell
$env:BACKEND_READER_PASSWORD = "OlvasoTeszt_2026!"
$env:BACKEND_EDITOR_PASSWORD = "SzerkesztoTeszt_2026!"
$env:BACKEND_ADMIN_PASSWORD = "AdminTeszt_2026!"
$env:BACKEND_DEV_MASTER_PASSWORD = "DevMasterTeszt_2026!"
$env:BACKEND_PASSWORD_PEPPER = "HOSSZU_RANDOM_PEPPER_CSERELD_LE_ELESBEN"
$env:BACKEND_TOKEN_PEPPER = "KULON_RANDOM_TOKEN_PEPPER_CSERELD_LE_ELESBEN"
$env:BACKEND_DATA_KEY = "<Fernet.generate_key() kimenetét add meg itt>"
```

Ezek után a teszt loginok:

- `olvaso` / `OlvasoTeszt_2026!`
- `szerkeszto` / `SzerkesztoTeszt_2026!`
- `admin` / `AdminTeszt_2026!`
- `dev_master` / `DevMasterTeszt_2026!`

## Éles intranet checklist (Windows)

1. Titkok kezelése
   - Állíts be egyedi, hosszú értékeket: `BACKEND_ADMIN_PASSWORD`, `BACKEND_DEV_MASTER_PASSWORD`, `BACKEND_PASSWORD_PEPPER`, `BACKEND_TOKEN_PEPPER`.
   - Ezek ne kerüljenek forráskódba, ticketbe vagy képernyőképre.

2. Hálózati korlátozás
   - `BACKEND_ENV=production`
   - `BACKEND_ALLOWED_ORIGINS` csak belső frontend cím(ek)re.
   - `BACKEND_ALLOWED_HOSTS` csak belső backend hostnév/IP.

3. Backend futtatás szolgáltatásként
   - A backendet dedikált Windows service accounttal futtasd.
   - Ne interaktív felhasználó alatt fusson.

4. Frontend kiadás
   - `npm run build` kimenetet szolgáld ki belső webszerverről (IIS/Nginx intraneten).
   - Dev szervert (`npm run dev`) ne használd élesben.

5. Tűzfal szabályok
   - Engedélyezd a backend portot csak belső tartományokból.
   - Külső/nyilvános interfészekről tiltsd.

6. Mentés és visszaállítás
   - Napi SQLite mentés kötelező (`.db` + WAL konzisztens mentés).
   - Rendszeresen végezz visszaállítás-próbát.

7. Naplózás és audit
   - Bekapcsolt Windows Event + alkalmazás logok.
   - Sikertelen belépések monitorozása.

8. Frissítési üzemrend
   - Biztonsági frissítés előtt backup, utána health check.
   - Verzióváltást csak karbantartási ablakban.

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


## Plusz beépített védelmek

- Brute-force védelem: 5 hibás login után 15 perc lockout felhasználónévre.
- Session token a DB-ben csak fingerprintként tárolódik (nem nyers token).
- Security headerek minden válaszban: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control`.
- Production módban HSTS header csak HTTPS kérésnél.


## Automatizált éles üzem (ops/windows)

A következő scriptek a `ops/windows` mappában találhatók:

- `set-guardduty-secrets.ps1`
- `install-guardduty-service.ps1`
- `new-guardduty-firewall-rules.ps1`
- `backup-guardduty-db.ps1`
- `install-guardduty-backup-task.ps1`
- `test-guardduty-health.ps1`

Ajánlott sorrend (rendszergazda PowerShell):

```powershell
cd <repo>\ops\windows

.\set-guardduty-secrets.ps1 `
  -AdminPassword "EROS_ADMIN_JELSZO" `
  -DevMasterPassword "EROS_DEVMASTER_JELSZO" `
  -ReaderPassword "EROS_OLVASO_JELSZO" `
  -EditorPassword "EROS_SZERKESZTO_JELSZO" `
  -PasswordPepper "NAGYON_HOSSZU_RANDOM_PEPPER" `
  -TokenPepper "KULON_HOSSZU_RANDOM_TOKEN_PEPPER" `
  -AllowedOrigins "http://192.168.1.50:8080" `
  -AllowedHosts "192.168.1.50,localhost"

.\new-guardduty-firewall-rules.ps1 -BackendPort 8000 -AllowedSubnet "192.168.1.0/24"
.\install-guardduty-service.ps1 -BackendHost "0.0.0.0" -BackendPort 8000
.\install-guardduty-backup-task.ps1 -DailyAt "02:00"
```

Szolgáltatás ellenőrzés:

```powershell
Get-Service GuardGuardDutyApi
```

Kézi mentés futtatása:

```powershell
.\backup-guardduty-db.ps1
```

Telephelyi elérés ellenőrzése (bármely kliens gépről):
```powershell
cd <repo>\ops\windows
.\test-guardduty-health.ps1 -BaseUrl "http://guardduty.intra.honved:8000"
```


## TODO

- Adatimport modul k?sz?t?se Excel, Word ?s PDF ?llom?nyok migr?l?s?hoz
