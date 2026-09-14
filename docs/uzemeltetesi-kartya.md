# Üzemeltetési kártya — egy oldal, ha a fejlesztő nincs kéznél

*A központi gépen minden a projekt mappájában van (`Honvedsegi\`). Egyetlen Python-folyamat fut, egyetlen adatbázis-fájl: `backend\data\guard_guard_duty.db`.*

## Indítás / leállítás
- **Indítás**: dupla katt `start-prod.bat` (vagy az autostart-feladat indítja bejelentkezéskor: `ops\windows\install-guardduty-autostart-task.ps1`).
- **Leállítás**: a fekete ablak bezárása, vagy a Feladatkezelőben a `python.exe` (uvicorn) leállítása. Leállítás közben nem vész el adat (WAL).
- **Ellenőrzés, fut-e**: böngészőben `http(s)://<gép>:8000/api/health` → `{"status":"ok"}`. Vagy `ops\windows\test-guardduty-health.ps1`.
- **Nem indul?** Nézd a fekete ablak utolsó sorait. Leggyakoribb: hiányzó `backend\prod.env` (első indításnál kell), foglalt 8000-es port, hiányzó `dist\index.html` (frontend build — internetes gépen `npm run build`, a `dist` mappát átmásolni).

## Mentés
- Automatikus: az ütemezett feladat (`ops\windows\install-guardduty-backup-task.ps1`) naponta futtatja a `backup-guardduty-db.ps1`-t → `backend\data\backups\guard_ÉÉÉÉHHNN_HHMMSS.db` (30 marad) + tömörítve `C:\ProgramData\GuardGuardDuty\backups`.
- **Tükör másik gépre**: `backend\prod.env` → `BACKEND_BACKUP_MIRROR=\\masikgep\honved-mentes`. Enélkül a Beállítások sárgával figyelmeztet.
- **Import előtt** a rendszer magától ment.
- **Kézzel**: Beállítások → „Mentés és üzemeltetés” (admin látja az állapotot; a fejlesztői fiók tud „Mentés most”-ot), vagy `cd backend ; ..\.venv\Scripts\python.exe -m app.backup`.
- Minden mentés visszaállítás-próbán megy át (integritás + táblák) — csak a jó mentés marad meg.

## Visszaállítás (adatvesztés / sérült adatbázis)
1. Rendszer leállítása.
2. `backend\data\guard_guard_duty.db`, `-wal`, `-shm` fájlok átnevezése (pl. `.rossz`).
3. A választott mentés (`backups\guard_….db` vagy a tükörből) bemásolása `guard_guard_duty.db` néven.
4. Indítás. A rendszer az indításkor lefuttatja a hiányzó séma-lépéseket; a napló mutatja, mikori állapot jött vissza.
5. Ami a mentés óta történt, azt kézzel kell pótolni (a napló-archívum és a próbaüzem-PDF-ek segítenek).

## Jelszó-visszaállítás
- Admin a Beállítások → Felhasználók alatt ad új jelszót (a „szem” ikonnal látható, lediktálható).
- Ha az admin jelszava veszett el: fejlesztői fiók (`prod.env`-ben megadott név/jelszó) → Beállítások → Felhasználók.
- Zárolt fiók (5 rossz jelszó): 15 perc után magától old; a fejlesztői fiók azonnal tudja oldani.

## Helyszűke / lassulás
- Beállítások → „Mentés és üzemeltetés”: szabad hely, adatbázis-méret, napló-sorok.
- A napló 12 hónapnál régebbi sorai 30 naponta külön fájlba mennek (`backend\data\archive\`), ezek elvihetők másik gépre.
- Feltöltött fájlok: `backend\uploads\`. Régi műveletek dokumentumai törölhetők a felületen.

## HTTPS
- `cd backend ; ..\.venv\Scripts\python.exe make_selfsigned_cert.py <gepnev> <ip>` → `backend\certs\server.crt + server.key`; a `start-prod.bat` innentől HTTPS-en indít.
- A kliens gépekre a `server.crt`-t telepítve (Megbízható gyökér) nincs böngésző-figyelmeztetés.

## Amit SOHA
- Ne futtasd élesben a `backend\reseed_demo.py`-t (MINDENT töröl és demóval tölt fel).
- Ne állítsd a `start-prod.ps1`-ben a worker-számot 1-nél többre.
- Ne másold a `.db` fájlt futó rendszer alatt kézzel (WAL) — a mentőt használd.
- Ne változtasd a `prod.env`-ben a `BACKEND_DEV_MASTER_USERNAME` / pepper értékeket telepítés után.

## Kapcsolat / források
- Erőforrás-igény, kockázatok: `docs\eroforras-kalkulacio.md`
- Nyitott döntések: `..\Nyitott kérdések.md`
- Telepítés részletesen: `README.md`, `ops\windows\`
