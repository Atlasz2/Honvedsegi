# Állapotfelmérés és cselekvési terv

Készült: 2026-09-10. Alapja a `main` ág + a jelenlegi munkafa (uncommitted változásokkal együtt).

Módszer: teljes fájlbejárás, `pytest` (68 teszt, mind zöld), `vite build` (sikeres),
`tsc --noEmit` (**13 hiba**), `eslint` (0 hiba, 8 warning).

---

## 1. Összkép

A projekt **lényegesen jobb állapotban van, mint egy tipikus egyetemi projekt**. Ami
kifejezetten erős:

| Terület | Értékelés |
|---|---|
| Backend architektúra | FastAPI + SQLAlchemy 2.0, routerekre bontva, tiszta `Base`/`Session` kezelés. |
| SQLite hangolás | `db.py` mintaszerű: WAL, `busy_timeout`, `foreign_keys=ON`, mmap, page cache. A ~100 user / ~2000 katona célra bőven elég. |
| Jelszókezelés | scrypt (N=2^15) + pepper + PBKDF2 legacy fallback + automatikus rehash bejelentkezéskor + jelszóerősség-ellenőrzés. Ez profi szint. |
| Bejelentkezés-védelem | Lockout 5 hibás próbálkozás után 15 percre, token hash-elve tárolva (`fingerprint_token`), nem plaintextben. |
| Biztonsági fejlécek | `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS, `/api/*`-ra `no-store`. Prodban a docs/openapi ki van kapcsolva. |
| Üzemeltetés | `ops/windows/` scriptek (szolgáltatás, tűzfal, backup task, healthcheck) + `backup_db.py` `VACUUM INTO`-val, retencióval. Ez a legtöbb projektből teljesen hiányzik. |
| Tesztek | 68 backend teszt, gyorsak (3,3 s), valódi TestClient-tel. |
| Dokumentáció | `docs/funkcio-roadmap.md` naprakész, státuszozott, kontextussal — kiváló. |
| Fájlfeltöltés | Random tárolt fájlnév, kiterjesztés-allowlist, 20 MB-os korlát, törléskor a fájl is törlődik. |

**Egy mondatban:** az alap szilárd, a probléma nem a minőség, hanem a **félbehagyott
átalakítások lerakódása** — több párhuzamos, be nem kötött kódréteg él egymás mellett.

---

## 2. Hiányosságok

### 🔴 Kritikus

#### K1. Kb. 3600 sor halott kód, ebből ~1000 sor duplikált üzleti logika

A `backend/app/services/` csomagból **egyetlen modult sem importál** az élő alkalmazás:

```
services/reporting.py  (666 sor) ← duplikátuma a routers/reports.py-nak
services/operations.py (523 sor) ← sosem lett bekötve (dokumentumok, jelenlét, anyagigény)
services/imports.py    (333 sor) ← duplikátuma a routers/imports.py-nak
services/lifecycle.py  (106 sor) ← senki nem hívja
services/bug_reports.py        ← csak routers/bug_reports.py hívja, ami…
routers/bug_reports.py         ← …nincs regisztrálva a main.py-ban
```

A `services/imports.py` és a `routers/imports.py` **függvényről függvényre azonos**
(`_save_draft`, `_store_draft`, `_get_draft`, `_evaluate_rows`, …). Ugyanez a
`reporting.py` ↔ `reports.py` párosra. Ez a legveszélyesebb hibatípus: ha az egyikben
javítasz egy bugot, a másik némán elavul, és nem tudod, melyik fut.

Frontend oldalon ugyanez:

```
src/pages/RohamInformatikusPage.tsx (935 sor) ← nincs route-olva az App.tsx-ben
src/pages/Exercises.tsx             (430 sor) ← nincs route-olva
src/pages/Training.tsx              (428 sor) ← nincs route-olva
src/pages/Index.tsx, NotFound.tsx             ← nincs route-olva
```

Ráadásul a `RohamInformatikusPage.tsx` olyan exportokat importál (`bugReports`,
`BugReport`), amik **nem léteznek** — vagyis ha ma bekötnéd, azonnal eltörne.

#### K2. A típusellenőrzés nem fut, és 13 hiba van benne

A `vite build` **átmegy**, mert az SWC nem ellenőriz típust — csak transzpilál. Közben:

```
Layout.tsx(108)              Property 'adminOnly' does not exist
AttendanceGrid.tsx(1)        '@/lib/types' has no exported member 'AttendanceEntry'
DocumentList.tsx(2)          '@/lib/types' has no exported member 'OperationDocument'
OperationTree.tsx(2)         '@/lib/types' has no exported member 'OperationTreeNode'
RequirementsList.tsx(2)      '@/lib/types' has no exported member 'MaterialRequirement'
Exercises.tsx(178, 397)      Type '"Folyamatban"' is not assignable to type '"Tervezett"'
Operations.tsx(113, 131)     unsafe cast to Record<string, unknown>[]
RohamInformatikusPage.tsx    'bugReports' / 'BugReport' nem létezik
```

Nincs `typecheck` script a `package.json`-ban, és a `tsconfig` ki van lazítva:
`strict: false`, `strictNullChecks: false`, `noImplicitAny: false`. Egy olyan
rendszernél, ami személyi adatokat és létszámjelentést kezel, ez a hálót veszi ki.

A gyökérok is látszik: az `AttendanceEntry`, `OperationDocument` stb. típusok a
`store.ts`-ben élnek, de a komponensek a `types.ts`-ből importálják őket. **A típusok
két helyre szóródtak szét, önkényesen.**

#### K3. `backend/main.py` — hitelesítés nélküli, elfelejtett API a személyi adatokon

```python
engine = create_engine("sqlite:///database/data.db")
@app.get("/szemelyek", response_model=List[Szemely])   # ← nincs auth
uvicorn.run("main:app", host="0.0.0.0", port=8000)     # ← minden interfészen
```

Ez egy régi, teljesen külön FastAPI app, ami a `database/data.db`-t szolgálja ki, és
**bárkinek kiadja az összes személy nevét, rendfokozatát, születési helyét és idejét,
bejelentkezés nélkül**, a hálózat összes interfészén. Nem fut jelenleg, de ott van a
repóban, kísértésesen `main.py` néven, közvetlenül az `app/main.py` mellett. Ha valaki
egyszer a rossz fájlt indítja el, kész az adatvédelmi incidens. Törlendő.

#### K4. Git-higiénia: a repó negyede fordítási szemét

283 követett fájlból **75 db `.pyc`** (`cpython-311`, `-313`, `-314` — három Python-verzió
lenyomata egymás mellett). Ezek minden futtatásnál módosulnak, felduzzasztják a
diffeket, és álkonfliktusokat okoznak. A `.gitignore` ki is zárja a `backend/app/__pycache__/`-t,
de a `backend/app/routers/__pycache__/`-t **nem** — ezért csúsztak be.

Ugyanitt: `database/data.db` és `dist/` is követve van, valamint egy `'` nevű
fantomfájl a gyökérben (`Unable to initialize device PRN` tartalommal — egy elrontott
shell-parancs maradványa), és `.tmp_reseed_counts.py` a backendben.

---

### 🟡 Fontos

#### F1. Az auditálás a 24 routerből 3-ban van bekötve

Az `audit.py` szép, mezőszintű before/after naplózást tud. Használja: `personnel`,
`exercises`, `trainings`. **Nem** használja: `documents`, `leave`, `duties`, `equipment`,
`vehicles`, `supplies`, `users`, `announcements`, `qualifications`, `attendance`…

Egy katonai nyilvántartásnál, aminek van „Tevékenységnapló" oldala, ez félrevezető:
a felhasználó azt hiszi, minden változás követve van, közben egy szabadság-jóváhagyás
vagy egy okmány-módosítás nyomtalanul eltűnik.

#### F2. Tárolt XSS-lehetőség a dokumentum-megtekintésben

```python
mime_type = file.content_type or ...      # ← a KLIENSTŐL jön
...
return FileResponse(media_type=item.mime_type, headers={
    "Content-Disposition": f'inline; filename="{item.original_name}"'   # ← escapelés nélkül
})
```

A `view` végpont **inline** szolgálja ki a fájlt, a kliens által küldött MIME-típussal.
Egy `.txt` feltölthető `Content-Type: text/html` fejléccel, és a böngésző HTML-ként
rendereli — **azonos originről**, ahol a session token a `localStorage`-ban van. A
kiterjesztés-allowlist (`.pdf .xlsx .xls .docx .doc .txt`) szűkíti, de nem zárja ki.
A `filename="..."` interpoláció ráadásul fejléc-injektálásra is nyitva áll idézőjelet
tartalmazó fájlnévvel.

Javítás: a MIME-t a **kiterjesztésből** származtasd (ne a klienstől), és a `view`
végponton kényszeríts `Content-Disposition: attachment`-et, vagy legalább escapelj.

#### F3. Feltöltéskor a teljes fájl memóriába olvasódik a méretellenőrzés előtt

```python
content = await file.read()          # ← előbb beolvas MINDENT
if len(content) > MAX_UPLOAD_SIZE:   # ← utána panaszkodik
```

Egy 2 GB-os feltöltés teljesen a memóriába kerül, mielőtt elutasítanád. Egy központi
gépen, ami egyszerre 100 usert szolgál ki, ez elég egy véletlen kiütéshez. Chunkonként
kell olvasni, futó összeggel.

#### F4. A react-query be van kötve, de nulla helyen használva

A `QueryClientProvider` ott van az `App.tsx`-ben, a `@tanstack/react-query` a
`dependencies`-ben — **`useQuery`/`useMutation` előfordulás: 0**. Helyette 22 oldal
kézzel `useEffect` + `fetch`-el tölt. Következmény: nincs cache, nincs kérés-deduplikáció,
minden navigációnál újratölt mindent, és nincs `AbortController` — gyors oldalváltásnál
versenyhelyzet.

Két tiszta út van: vagy tényleg használjuk, vagy kivesszük a függőséget. A jelenlegi
„be van kötve, de nem használjuk" a legrosszabb változat.

#### F5. Frontend teszt: 1 db, és az is `expect(true).toBe(true)`

```ts
describe("example", () => { it("should pass", () => { expect(true).toBe(true); }); });
```

A teljes vitest + Testing Library + Playwright infrastruktúra fel van állítva, és üresen
áll. 12 000 sor frontend kód mögött nulla valódi teszt. Ugyanakkor a `playwright.config.ts`
is ott van, E2E teszt nélkül.

#### F6. Nincs CI, és nincs coverage-mérés

Nincs `.github/` — semmi nem fut automatikusan. A 68 backend teszt, a lint, a build és a
(még nem létező) typecheck csak akkor fut, ha valaki kézzel elindítja. A `pytest-cov`
sincs telepítve, így a lefedettség ismeretlen.

Lefedettség-hiány endpoint szinten: 120 endpointból teszt nélküli routerek:
`announcements`, `bug_reports`, `conflicts`, `equipment`, `imports`, `reports`,
`supplies`, `vehicles`. Az `imports` és a `reports` a két legösszetettebb modul — pont
azok, ahol a legfájóbb.

---

### 🟢 Jó lenne

#### J1. `deps.py` — 670 soros gyűjtőmodul

Kilenc, egymáshoz nem tartozó felelősség egy fájlban: dátumkezelés, login-tracking,
FastAPI auth dependency-k, generikus model-getter, SZTSZ-validáció, résztvevő-kezelés,
9 entitás szerializálója (258–474. sor), 9 entitás „applier"-je (475–670. sor). Ez a
projekt központi „mindent tudó" modulja, és minden router ebből importál.

Bontásra érett: `time.py`, `auth.py`, `serializers/`, `appliers/`.

#### J2. A privát névkonvenció következetesen sérül

`_serialize_vehicle`, `_require_editor`, `_get_current_user`, `_apply_supply` — az
aláhúzás modulon belüli privátot jelöl, ezeket viszont **minden router importálja**.
Vagy a nevek rosszak, vagy a határok. A `documents.py` már érzi is a feszültséget:

```python
from ..deps import _get_current_user as require_reader, _require_editor as require_editor
```

Ez a helyes irány — érdemes végigvinni, és a `deps.py`-ban valódi publikus neveket adni.

#### J3. `issue_token()` azonosító-generálásra használva

```python
# supplies.py
movement = {"id": issue_token(), ...}
```

Az `issue_token()` a `security.py`-ban él, és **session tokent** generál. Egy készlet-
mozgás azonosítójához a `models.new_id()` való. Ahogy van, egy biztonsági primitívet
használunk üzleti azonosítóhoz — olvasáskor félrevezető, és megnehezíti a
security.py auditálását.

#### J4. Ékezethiányos és elromlott felhasználói szövegek

20+ backend hibaüzenet ékezet nélkül: `"Ervenytelen datumtartomany"`,
`"A mennyisegnek pozitivnak kell lennie"`, `"Nem tamogatott riportminta"` — miközben a
kód többi része szép magyar. A frontendben pedig valódi kódolási sérülés van:

```ts
// src/lib/store.ts:164
throw new Error(detail || `A k?r?s sikertelen volt (${response.status})`);
```

Ez így jelenik meg a felhasználónak minden nem kezelt API-hibánál.

#### J5. Domain-konstansok három helyre másolva

A `['31 TVZ', '83 TVZ', '19 TVZ', 'Ezredtörzs']` lista megvan a `Personnel.tsx`-ben,
a `seed.py`-ban (kétszer) és a `.tmp_reseed_counts.py`-ban. A rendfokozatok (15 elem)
szintén hardkódolva a `Personnel.tsx`-ben. Ha átszervezik az ezredet, több helyen kell
javítani, és a frontend-backend elcsúszhat. Ez API-ból (vagy egy közös konstans-
végpontból) jövő adat kellene legyen.

#### J6. `/api/auth/me` hamis lejáratot ad vissza

```python
@router.get("/me")
def me(user = Depends(_get_current_user)):
    expiry = _utc_now() + timedelta(hours=SESSION_HOURS)   # ← nem a tényleges lejárat
```

Ez **nem** az adatbázisban tárolt token lejárata, hanem egy frissen számolt érték. Jelenleg
nem okoz bajot, mert a frontend nem hívja a `/me`-t — de aki legközelebb ránéz, jó eséllyel
elhiszi, és épít rá. A `SessionTokenModel.expires_at`-et kell visszaadni.

Kapcsolódó: nincs session-hosszabbítás (8 óra után némán kiléptet munka közben), és a
lejárt tokenek csak használatkor törlődnek — a tábla korlátlanul nő.

#### J7. Bundle: 676 kB egyetlen chunkban

Nincs route-szintű `lazy()`, minden oldal az első betöltésbe kerül. Intraneten ez kevésbé
fáj, mint az interneten, de a 935 soros halott `RohamInformatikusPage` is benne van —
K1 megoldása ezt részben magától javítja.

#### J8. README elavult

A könyvtárstruktúra-fejezet még a `routers/` és `services/` előtti állapotot mutatja,
nincs benne az `ops/`, a telepítési folyamat, a backup, a `prod.env`. A `docs/funkcio-roadmap.md`
viszont példásan naprakész — a README-t érdemes a szintjére hozni.

---

## 3. Cselekvési terv

Sorrendbe téve: **előbb a takarítás, mert az minden további munkát olcsóbbá tesz**, aztán
a védőháló, aztán a valódi javítások, végül a funkciók.

### 0. fázis — Rendrakás (fél nap, kockázat nélkül)

> Cél: a repóban csak olyan kód maradjon, ami tényleg fut. Ez önmagában ~3600 sorral
> csökkenti a karbantartandó felületet.

1. **`.pyc`-k kivezetése.**
   `git rm -r --cached` az összes `__pycache__`-re, a `.gitignore`-ba `__pycache__/`
   és `*.pyc` globális szabály (a jelenlegi útvonalankénti helyett). Ugyanígy:
   `database/data.db`, `dist/`, `.pytest_cache/`.
2. **Szemétfájlok törlése:** a `'` nevű fantomfájl, `backend/.tmp_reseed_counts.py`.
3. **`backend/main.py` törlése** (K3) — és a `database/data.db` is, ha nem kell.
   Ellenőrizd előtte, hogy semmilyen start-script nem hivatkozik rá.
4. **Halott frontend oldalak:** `RohamInformatikusPage.tsx`, `Exercises.tsx`,
   `Training.tsx`, `Index.tsx` — döntés fájlonként: **bekötni vagy törölni**.
   A `NotFound.tsx`-et érdemes inkább *bekötni* a `path="*"` route-ra a mostani
   néma `Navigate to="/"` helyett.
5. **`services/` csomag rendezése** (a legfontosabb lépés):
   - `services/imports.py` és `services/reporting.py`: **törlés** (a routerben él a
     valódi példány) — vagy fordítva, ha a service-verzió a frissebb: akkor a router
     hívja őket, és a duplikáció tűnjön el a routerből. Egy `diff` megmondja, melyik
     az újabb. Ami nem maradhat: két példány.
   - `services/operations.py` + `services/lifecycle.py`: ezek **soha nem lettek bekötve**.
     Ha a művelet-modul (dokumentumok, jelenléti rács, anyagigény) él a terveidben —
     ez a 3. fázis egyik feladata. Ha nem: törlés.
   - `routers/bug_reports.py` + `services/bug_reports.py`: vagy regisztráld a
     `main.py`-ban, vagy töröld. Most a kettő közti félállapotban van.

**Ellenőrzés:** `pytest` (68 zöld) + `vite build` a fázis végén.

---

### 1. fázis — Védőháló (1 nap)

> Cél: ami egyszer elromlik, azonnal derüljön ki, ne három hét múlva.

6. **Típusellenőrzés bekapcsolása és zöldre hozása.**
   - `package.json`: `"typecheck": "tsc --noEmit -p tsconfig.app.json"`.
   - A 13 hiba javítása. A legtöbb egyetlen gyökérokra vezethető vissza: a
     `store.ts`-ben definiált típusok (`AttendanceEntry`, `OperationDocument`,
     `OperationTreeNode`, `MaterialRequirement`, `RequirementStatus`) **költöztetése a
     `types.ts`-be**. Szabály: *típus a `types.ts`-ben él, API-hívás a `store.ts`-ben.*
   - A `Layout.tsx` `adminOnly` hibája: adj explicit típust a nav-tömbnek.
   - Az `Exercises.tsx` státusz-hibája: a `status` mező típusa `ExerciseStatus` legyen,
     ne az első literál.
7. **Szigorítás lépésenként.** Ne egyszerre: először `strictNullChecks: true`
   (ez fogja a legtöbb valódi bugot), utána `noImplicitAny`, végül `strict`.
   Fájlonként is haladhatsz `// @ts-expect-error` ideiglenes jelöléssel.
8. **CI (`.github/workflows/ci.yml`).** Push és PR esetén:
   `npm ci` → `npm run lint` → `npm run typecheck` → `npm run build` → `npm test`,
   és külön job: `pip install -r backend/requirements-dev.txt` → `pytest`.
   Ez a legjobb ár/érték arányú lépés az egész listán.
9. **Coverage:** `pytest-cov` a `requirements-dev.txt`-be, `--cov=app` a `pytest.ini`-be.
   Először csak mérj, ne állíts küszöböt.

---

### 2. fázis — Biztonság és korrektség (1–2 nap)

10. **F2 — dokumentum-kiszolgálás megszigorítása.**
    - MIME a kiterjesztésből (`mimetypes.guess_type(safe_name)`), a kliens
      `content_type`-ja legfeljebb naplózva.
    - `view` végpont: `Content-Disposition: attachment`, vagy ha az inline megjelenítés
      funkcionálisan kell (PDF-előnézet), akkor **csak `.pdf`-re** engedd, `application/pdf`
      fix típussal.
    - A `filename="..."` fejléc escapelése (`urllib.parse.quote` + RFC 5987 `filename*`).
11. **F3 — chunkolt feltöltés.** `while chunk := await file.read(1 << 20)`, futó
    méret-számlálóval, a limit átlépésekor azonnali 413 és a féllemez-fájl törlése.
12. **F1 — audit kiterjesztése.** Kezdd a személyi adatokat érintőkkel:
    `documents`, `leave`, `users`, `qualifications`. Utána `duties`, `equipment`,
    `vehicles`, `supplies`, `announcements`. Minden mutációnál `record_activity(...)`
    a commit előtt. Írj hozzá egy tesztet routerenként — a `test_audit.py` már ad mintát.
13. **J6 — session-kezelés rendbe.** A `/me` a tényleges `expires_at`-et adja vissza;
    a bejelentkezéskor kapott lejárat legyen az egyetlen igazságforrás. Emellé:
    lejárt tokenek takarítása induláskor (egy `DELETE ... WHERE expires_at < now()`
    a `lifespan`-ben), és fontold meg a csúszó hosszabbítást (aktivitásra +8 óra),
    hogy ne dobja ki az ügyintézőt munka közben.
14. **J4 — szövegek javítása.** A `store.ts:164` mojibake javítása, és a ~20
    ékezethiányos backend hibaüzenet pótlása. Fél óra, de a felhasználó ezt látja.

---

### 3. fázis — Struktúra és clean code (2–3 nap)

> A memóriámban rögzített elv szerint a clean code kötelező, a titkosítás a legutolsó
> lépés — ez a fázis az előbbiről szól.

15. **J1 — `deps.py` szétbontása.** Javasolt felállás:
    ```
    app/core/time.py          # _utc_now, _as_utc, _parse_iso_date, _date_overlap
    app/core/auth.py          # dependency-k + login-tracking
    app/serializers/          # entitásonként egy modul
    app/appliers/             # entitásonként egy modul
    app/validation.py         # SZTSZ + résztvevő-ellenőrzések
    ```
    Egyszerre egy szeletet mozgass, a tesztek végig fussanak.
16. **J2 — publikus névhasználat.** A modulhatárokat átlépő függvényekről kerüljön le
    az aláhúzás (`require_editor`, `serialize_vehicle`, `get_current_user`), a valóban
    belsők maradjanak `_`-sal. A `documents.py` import-aliasza így megszűnhet.
17. **J3 — `new_id()` az azonosítókhoz**, `issue_token()` maradjon a session-tokeneknek.
18. **J5 — domain-konstansok egy helyre.** Egységek és rendfokozatok a backendből,
    egy `/api/reference/units` + `/api/reference/ranks` végpontról (vagy egy közös
    `constants.py`-ból generálva). A frontend hardkódolás megszűnik.
19. **F4 — react-query döntés.** Javaslatom: **használd**. Kezdd egy oldallal
    (`Personnel`), csinálj egy `useEntityQuery` mintát, és onnan terjeszd. Ha nem éri
    meg a ráfordítást, akkor viszont vedd ki a `package.json`-ból és az `App.tsx`-ből —
    de a mostani „ott van, de nem használjuk" állapot félrevezető minden olvasónak.
20. **J7 — route-szintű `lazy()`** az `App.tsx`-ben, `Suspense` fallbackkel.
21. **J8 — README frissítése:** aktuális könyvtárstruktúra, telepítés (`ops/windows/`),
    `prod.env` kitöltése, backup/visszaállítás, dev vs. prod indítás.

---

### 4. fázis — Tesztek (folyamatos)

22. **Backend:** a teszt nélküli routerek közül `imports` és `reports` az elsők
    (ezek a legösszetettebbek). Utána `equipment`, `supplies`, `vehicles`,
    `announcements`, `conflicts`.
23. **Frontend:** a placeholder teszt cseréje valódiakra. Kezdd a tiszta logikával,
    ami könnyen tesztelhető és fájna, ha elromlik:
    `normalizeHungarianPhone`, `lib/rank.ts`, `lib/qualifications.ts`,
    a `store.ts` `request()` hibakezelése (401 → `clearToken`).
24. **E2E:** a Playwright már be van állítva. Egy „smoke" folyam bőven elég a kezdéshez:
    bejelentkezés → személy létrehozása → napi létszám rögzítése → kijelentkezés.

---

### 5. fázis — Funkciók (a roadmap szerint)

A `docs/funkcio-roadmap.md` már jó sorrendet ad. A 0–2. fázis után érdemes rátérni;
a `services/operations.py` sorsa (10. és 5. pont) itt dől el véglegesen.

---

## 4. Összefoglaló prioritási sorrend

| # | Feladat | Ráfordítás | Haszon |
|---|---|---|---|
| 1 | `.pyc`/szemét kivezetése a gitből | 15 perc | 🔥🔥🔥 |
| 2 | `backend/main.py` törlése (auth nélküli adat-API) | 5 perc | 🔥🔥🔥 |
| 3 | `services/` duplikációk felszámolása | 2 óra | 🔥🔥🔥 |
| 4 | `typecheck` script + 13 hiba javítása | 3 óra | 🔥🔥🔥 |
| 5 | CI beállítása | 1 óra | 🔥🔥🔥 |
| 6 | Dokumentum-kiszolgálás MIME/inline javítása | 1 óra | 🔥🔥 |
| 7 | Audit kiterjesztése | 4 óra | 🔥🔥 |
| 8 | Halott frontend oldalak: bekötés vagy törlés | 1 óra | 🔥🔥 |
| 9 | Chunkolt feltöltés | 1 óra | 🔥 |
| 10 | `deps.py` szétbontása | 1 nap | 🔥 |

**Az első öt tétel összesen kb. egy munkanap, és a projekt karbantarthatóságának
nagyobb részét megoldja, mint az összes többi együtt.**
