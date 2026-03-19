# HonvéD – Technikai Dokumentáció

**Verzió:** 1.0.0  
**Stack:** Python · FastAPI · MySQL · React · Vite  
**Licencek:** Minden komponens ingyenes, nyílt forráskódú

---

## 1. Rendszer áttekintése

A HonvéD (Honvédségi Digitális Adminisztrációs Rendszer) egy offline, belső hálózaton futó webalkalmazás, amely három fő modult tartalmaz:

- **HR modul** – személyi állomány nyilvántartása
- **Beosztás modul** – kiképzések, gyakorlatok, szolgálatok kezelése
- **Eszköz modul** – felszerelések kiadása, visszavétele, állapotkövetése

A rendszer szerepköralapú hozzáférés-kezeléssel (RBAC) rendelkezik:

| Szerepkör | Jogosultságok |
|---|---|
| `parancsnok` | Teljes hozzáférés, törlés |
| `adminisztrator` | Létrehozás, szerkesztés, olvasás |
| `felhasznalo` | Csak olvasás |

---

## 2. Mappastruktúra

```
honved/
├── backend/
│   ├── main.py              # FastAPI belépési pont
│   ├── database.py          # MySQL kapcsolat (SQLAlchemy)
│   ├── models.py            # Adatbázis modellek
│   ├── schema.sql           # MySQL séma és tesztadatok
│   ├── requirements.txt     # Python csomagok
│   └── routers/
│       ├── auth.py          # JWT bejelentkezés
│       ├── szemely.py       # Személyek CRUD
│       ├── beosztas.py      # Beosztások CRUD
│       └── eszkoz.py        # Eszközök CRUD + kiadás/visszavétel
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        └── App.jsx          # Teljes frontend (bejelentkezés, navigáció, oldalak)
```

---

## 3. Telepítés – lépésről lépésre

### 3.1 Előfeltételek (mindkettő ingyenes)

- **Python 3.11+** – https://python.org
- **Node.js 20+** – https://nodejs.org
- **MySQL 8.0 Community** – https://dev.mysql.com/downloads/

### 3.2 Adatbázis létrehozása

```sql
-- MySQL-ben futtatni (root felhasználóval):
SOURCE backend/schema.sql;

-- Felhasználó létrehozása a rendszernek:
CREATE USER 'honved_user'@'localhost' IDENTIFIED BY 'valtozd_meg';
GRANT ALL PRIVILEGES ON honved.* TO 'honved_user'@'localhost';
FLUSH PRIVILEGES;
```

### 3.3 Backend indítása

```bash
cd backend

# Virtuális környezet létrehozása (csak egyszer)
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Csomagok telepítése
pip install -r requirements.txt

# Környezeti változók beállítása
export DB_PASSWORD="valtozd_meg"
export SECRET_KEY="valami-titkos-kulcs-amit-kizarlag-ti-tudtok"

# Szerver indítása
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Az API dokumentáció elérhető: http://localhost:8000/docs

### 3.4 Frontend indítása

```bash
cd frontend
npm install
npm run dev
```

A felület elérhető: http://localhost:5173  
Belső hálózaton más gépekről: http://[szerver-IP]:5173

### 3.5 Első felhasználó létrehozása

A jelszó hashelése bcrypt-tel (csak egyszer, parancssorból):

```python
from passlib.context import CryptContext
pwd = CryptContext(schemes=["bcrypt"])
print(pwd.hash("valaszd_meg_a_jelszot"))
```

A kimenetet másold be az adatbázisba:

```sql
UPDATE felhasznalo SET jelszo_hash = '$2b$12$...' WHERE id = 1;
```

---

## 4. API végpontok összefoglalása

### Auth
| Metódus | Végpont | Leírás |
|---|---|---|
| POST | `/api/auth/belepes` | JWT token igénylés |
| GET | `/api/auth/en` | Saját adatok |

### Személyek
| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/api/szemelyek` | Összes személy (szűrhető) |
| GET | `/api/szemelyek/{id}` | Egy személy részletei |
| POST | `/api/szemelyek` | Új személy (admin+) |
| PUT | `/api/szemelyek/{id}` | Frissítés (admin+) |
| DELETE | `/api/szemelyek/{id}` | Törlés (csak parancsnok) |

### Beosztások
| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/api/beosztasok` | Aktív/jövőbeli beosztások |
| POST | `/api/beosztasok` | Új beosztás (admin+) |
| POST | `/api/beosztasok/{id}/szemelyek` | Személy hozzáadása (ütközésellenőrzéssel) |
| GET | `/api/beosztasok/{id}/szemelyek` | Beosztott személyek |

### Eszközök
| Metódus | Végpont | Leírás |
|---|---|---|
| GET | `/api/eszkozok` | Eszközlista (szűrhető: szabad=true/false) |
| GET | `/api/eszkozok/qr/{kod}` | QR-kód alapján keresés |
| POST | `/api/eszkozok` | Új eszköz (admin+) |
| POST | `/api/eszkozok/{id}/kiad` | Eszköz kiadása személynek |
| POST | `/api/eszkozok/{id}/visszavesz` | Eszköz visszavétele |
| GET | `/api/eszkozok/{id}/naplo` | Kiadási napló |

---

## 5. Biztonsági megfontolások

- A `SECRET_KEY` értékét változtasd meg, és ne tárold a kódban — használj `.env` fájlt
- A MySQL jelszót szintén `.env`-ben tárold
- A JWT token 8 óra után lejár (módosítható a `TOKEN_LEJARAT` konstanssal)
- HTTPS-t állíts be, ha belső hálózaton kívülről is elérhetővé válik (nginx reverse proxy)
- Az adatbázist rendszeresen mentsd (mysqldump + cron)

```bash
# Napi biztonsági mentés példa (crontab):
0 2 * * * mysqldump -u honved_user -p honved > /backup/honved_$(date +%Y%m%d).sql
```

---

## 6. Fejlesztési ütemterv (javasolt)

| Fázis | Feladat | Becsült idő |
|---|---|---|
| 1. | Adatbázis + backend alapok | 1–2 hét |
| 2. | Frontend alapnézetek (lista, részletek) | 1–2 hét |
| 3. | Beosztás naptárnézet (FullCalendar.js) | 1 hét |
| 4. | QR-kód generálás + szkennelés | 3–5 nap |
| 5. | Jelenléti ív PDF export | 3–5 nap |
| 6. | Excel import meglévő adatokhoz | 3–5 nap |
| 7. | Tesztelés, finomhangolás | 1 hét |

---

## 7. Jövőbeli bővítési lehetőségek

- **Excel/CSV import** – meglévő adatok beolvasása (`openpyxl` könyvtárral)
- **PDF jelenléti ív** – automatikus generálás (`reportlab` vagy `weasyprint`)
- **QR-kód szkennelés** – mobilon `html5-qrcode` JS könyvtárral
- **Naptárnézet** – `FullCalendar.js` (ingyenes, MIT licenc)
- **Értesítések** – közelgő gyakorlatokról email vagy belső üzenet
