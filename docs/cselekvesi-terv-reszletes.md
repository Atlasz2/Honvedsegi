# Részletes cselekvési terv

Az [állapotfelmérés](allapotfelmeres-es-cselekvesi-terv.md) hiányosságainak konkrét
megoldási terve. Minden lépésnél: **mit**, **melyik fájlban**, **milyen clean code
szabály alapján**, és **hogyan ellenőrzöd**.

> **Két helyesbítés az állapotfelméréshez** (ellenőrzés után derült ki):
>
> 1. A `services/imports.py` és `services/reporting.py` **nem elhagyható duplikátum** —
>    ezek a *jobb* verziók: ékezetes hibaüzenetek, `dict[str, Any]` annotációk, publikus
>    nevek, HTTP-logika nélküli üzleti réteg. Nem törölni kell, hanem **bekötni**.
> 2. A `src/components/operations/` négy komponensét (466 sor) **semmi nem importálja**,
>    és nem létező típusokra hivatkoznak. Ugyanannak a félbehagyott „Műveletek v2"
>    funkciónak a frontend fele, mint a `services/operations.py`.

---

## 0. A szabályrendszer

Minden lépés ezekre hivatkozik. Ha egy javaslat és egy szabály ütközik, **a szabály nyer**.

| # | Szabály | Mit jelent itt |
|---|---|---|
| **CC1** | **Egy igazságforrás** | Egy üzleti szabály pontosan egy helyen van leírva. Nincs két `_evaluate_rows`. |
| **CC2** | **Nincs halott kód** | Ami nincs bekötve, az vagy bekötésre kerül, vagy törlődik. „Majd jó lesz" nem indok — a git megőrzi. |
| **CC3** | **Egy modul, egy felelősség** | A router HTTP-t fordít, a service üzleti szabályt tud, a serializer alakot vált. Nem keverednek. |
| **CC4** | **A név ne hazudjon** | `issue_token()` ne generáljon készletmozgás-azonosítót. `_privát` ne legyen 12 modulból importálva. |
| **CC5** | **A típus a szerződés** | Ha `as`-t kell írnod, a típus rossz. A cast elrejti a hibát, nem megoldja. |
| **CC6** | **A határon validálj** | A kliens adata (MIME-típus, fájlméret) gyanús, amíg nem ellenőrizted. |
| **CC7** | **Ne ismételd magad — de csak valódi duplikációnál** | Két egyforma *fogalom* vonandó össze. Két véletlenül hasonló kódrészlet nem. |
| **CC8** | **A teszt a viselkedést rögzíti** | Refaktor előtt legyen teszt arra, amit nem akarsz elrontani. |
| **CC9** | **Kis, visszafordítható lépések** | Minden lépés után zöld teszt és sikeres build. Egy commit egy gondolat. |

**Munkamódszer minden lépéshez:**

```powershell
# 1. ág
git checkout -b fazis-N-lepes-M

# 2. változtatás

# 3. ellenőrzés (a "zöld kapu")
cd backend; ..\.venv\Scripts\python.exe -m pytest -q; cd ..
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build

# 4. commit, ha minden zöld
```

---

# 1. FÁZIS — Takarítás

> **Miért ez az első?** Amíg 3600 sor halott kód van a repóban, minden keresés,
> minden refaktor és minden code review drágább. Ez a fázis nem javít funkciót —
> **láthatóvá teszi, mi van valójában**.

## 1.1 — Git-higiénia

**Szabály:** CC2.

**Probléma:** 283 követett fájlból 75 `.pyc`, három Python-verzió lenyomatával.

```powershell
# Kivezetés az indexből (a lemezen maradnak)
git rm -r --cached backend/app/__pycache__ backend/app/routers/__pycache__ `
                   backend/__pycache__ backend/tests/__pycache__ `
                   backend/.pytest_cache database/data.db dist
```

**`.gitignore` — cseréld le a útvonalankénti szabályokat globálisra:**

```diff
-backend/__pycache__/
-backend/app/__pycache__/
+# Python fordítási melléktermékek (bárhol)
+__pycache__/
+*.py[cod]
+.pytest_cache/

+# Régi, önálló demó adatbázis (lásd 1.2)
+database/
```

**Törlendő szemétfájlok:**

| Fájl | Mi ez |
|---|---|
| `'` (gyökér) | Elrontott shell-parancs maradványa, `Unable to initialize device PRN` tartalommal |
| `backend/.tmp_reseed_counts.py` | Egyszer használt seed-script |
| `venv` (57 bájtos **fájl**, nem könyvtár) | Félresikerült `python -m venv` nyoma |

**Ellenőrzés:** `git status` tiszta, `git ls-files | wc -l` ~205-re csökken.

---

## 1.2 — `backend/main.py` törlése

**Szabály:** CC2 + biztonság.

**Ellenőrizve:** semmi nem hivatkozik rá. Az `ops/windows/start-guardduty-backend.ps1`
az `app.main:app`-ot indítja, nem ezt.

```powershell
git rm backend/main.py
git rm -r --cached database        # a data.db-vel együtt
```

Ez az a fájl, ami `/szemelyek`-en **hitelesítés nélkül**, `0.0.0.0`-n adja ki minden
személy nevét, rendfokozatát és születési adatait. Egyetlen véletlen `python main.py`
elég hozzá, hogy éles legyen. A git megőrzi a történetét — nincs veszteség.

---

## 1.3 — Halott frontend: döntés fájlonként

**Szabály:** CC2. **Nem törlünk vakon** — előbb el kell dönteni, funkcionálisan
pótolva van-e.

| Fájl | Sor | Állapot | Döntés | Indok |
|---|---|---|---|---|
| `src/pages/Exercises.tsx` | 430 | nincs route | **törlés** | Az `Operations.tsx` (élő) lefedi a gyakorlatokat |
| `src/pages/Training.tsx` | 428 | nincs route | **törlés** | Az `Operations.tsx` lefedi a kiképzéseket |
| `src/pages/Index.tsx` | — | nincs route | **törlés** | A `Dashboard.tsx` a kezdőoldal |
| `src/pages/NotFound.tsx` | — | nincs route | **bekötés** | Lásd lent — most néma átirányítás van |
| `src/pages/RohamInformatikusPage.tsx` | 935 | nincs route, **nem is fordul** | **törlés** | Nem létező `bugReports` / `BugReport` exportokra hivatkozik |
| `src/components/operations/*` (4 db) | 466 | nincs import, **nem is fordul** | **törlés** | Nem létező típusokra hivatkoznak (lásd 1.4) |

**A `NotFound` bekötése** — jelenleg minden ismeretlen útvonal némán a főoldalra dob,
ami elrejti az elgépelést és a hibás linket:

```diff
  <Route path="/activity-log" element={<ActivityLogPage />} />
- <Route path="*" element={<Navigate to="/" replace />} />
+ <Route path="*" element={<NotFound />} />
```

**Nyereség:** ~2260 sor, és a 13 típushibából **4 azonnal megszűnik**.

---

## 1.4 — A „Műveletek v2" funkció sorsa — döntési pont

**Szabály:** CC2 + CC9.

Ez a terv **egyetlen olyan pontja, ahol termékdöntés kell**, nem technikai.

Egy teljes, félbehagyott funkció fekszik a repóban, mindkét oldalon:

```
backend/app/services/operations.py     523 sor   dokumentum-feltöltés, jelenléti rács,
backend/app/services/lifecycle.py      106 sor   anyagigény, művelet-fa
src/components/operations/OperationTree.tsx      137 sor
src/components/operations/AttendanceGrid.tsx     117 sor
src/components/operations/DocumentList.tsx       113 sor
src/components/operations/RequirementsList.tsx    99 sor
```

**Állapot:** a backend-oldal működőképesnek tűnik, de nincs router mögötte. A
frontend-oldal **nem is fordul**: az `OperationTreeNode`, `MaterialRequirement`,
`RequirementStatus`, `OperationDocument` típusok a kódbázisban **sehol nem léteznek** —
sosem lettek megírva.

Ráadásul a `backend/uploads/operations/` alatt már **három feltöltött `.docx` fájl** van
— vagyis a funkció valamikor futott.

**Két út, harmadik nincs:**

| | **A) Befejezés** | **B) Kivezetés** |
|---|---|---|
| Mikor | Ha a művelet-dokumentumok kellenek a felhasználónak | Ha most nem prioritás |
| Teendő | Új `routers/operations_v2.py`, a hiányzó típusok megírása, komponensek bekötése, tesztek | `git rm` mind a 6 fájlra + a `backend/uploads/` tartalmának archiválása |
| Ráfordítás | 2–3 nap | 20 perc |
| Kockázat | — | A git megőrzi; bármikor visszahozható |

**Javaslatom: B), most.** Indok: a `docs/funkcio-roadmap.md` szerint a következő
prioritások a D1 (kérelmek), B1 (behívó), F1 (szolgálat-tervező) — a művelet-
dokumentumkezelés nincs köztük. Egy félkész funkció a `main` ágon **folyamatos
karbantartási adó**: minden refaktornál kerülgetni kell, minden olvasó elbizonytalanodik
tőle, és a típushibái elrejtik a valódiakat.

Ha B)-t választod, a 2. fázis 2.3 lépése (feltöltés-biztonság) **tárgytalanná válik** —
ezt jelzem is ott.

---

## 1.5 — `bug_reports`: bekötés vagy kivezetés

**Szabály:** CC2.

`routers/bug_reports.py` + `services/bug_reports.py` létezik, a router **nincs
regisztrálva** a `main.py`-ban. A frontendje (`RohamInformatikusPage.tsx`) az 1.3-ban
törlésre jelölt, nem fordítható fájl.

- **Ha a hibabejelentő kell:** add a `main.py` router-listájához, írd meg a
  frontendjét tisztán, `bugReports` store-modullal együtt.
- **Ha nem:** `git rm` mindkettőre.

Ugyanaz a logika, mint 1.4-nél. A jelenlegi félállapot a rossz válasz.

---

# 2. FÁZIS — Rétegek helyretétele (a clean code magja)

> Ez a fázis nem töröl és nem ír új funkciót. **A meglévő, jó kódot teszi a helyére.**

## 2.1 — `services/` bekötése, routerek elvékonyítása

**Szabály:** CC1 (egy igazságforrás), CC3 (egy modul, egy felelősség).

**A jelenlegi állapot pontosan:**

```
routers/imports.py    292 sor  = HTTP + ÜZLETI LOGIKA   ← ez fut
services/imports.py   333 sor  = ÜZLETI LOGIKA          ← ez a jobb, de halott

routers/reports.py    474 sor  = HTTP + ÜZLETI LOGIKA   ← ez fut
services/reporting.py 666 sor  = ÜZLETI LOGIKA          ← ez a jobb, de halott
```

A `services` verziók bizonyíthatóan frissebbek. Konkrét bizonyíték a `diff`-ből:

```python
# routers/imports.py  (a futó verzió)
msgs.append(f"Hianyzik a kotelezo mezo: {label}")
key = payload.sztsz; name = payload.name          # két utasítás egy sorban
issues: list[dict] = []                           # hiányos annotáció

# services/imports.py  (a halott verzió)
msgs.append(f"Hiányzik a kötelező mező: {label}")  # ékezetes
key = payload.sztsz                                # egy sor, egy utasítás
name = payload.name
issues: list[dict[str, Any]] = []                  # teljes annotáció
SUPPORTED_IMPORT_ENTITIES = {"personnel", "exercises"}  # nevesített konstans
```

**Vagyis: a felhasználó ma a rosszabb hibaüzeneteket kapja**, mert a jobb verzió nincs bekötve.

### A lépés menete (importra; a reportsra ugyanez)

**Előbb teszt (CC8).** Az `imports` routernek jelenleg **nincs tesztje** — refaktor
teszt nélkül vakrepülés. Írj egy `backend/tests/test_imports.py`-t, ami a *mostani*
viselkedést rögzíti:

```python
def test_preview_personnel_csv(client, editor_headers):
    """Preview: 2 új sor, nincs hiba."""
    files = {"file": ("szemelyek.csv", CSV_TARTALOM.encode("utf-8"), "text/csv")}
    r = client.post("/api/import/personnel/preview", files=files, headers=editor_headers)
    assert r.status_code == 200
    assert r.json()["created"] == 2

def test_preview_rejects_unknown_entity(client, editor_headers): ...
def test_confirm_applies_draft(client, editor_headers): ...
def test_expired_draft_returns_410(client, editor_headers): ...
```

> **Figyelem:** a hibaüzenet-szövegre **ne** állíts assertet (`"Hianyzik..."`), mert a
> refaktor pont ezt fogja ékezetesre javítani. A **státuszkódra** és a **számokra**
> asserts, ezek a stabil szerződés.

**Utána a csere.** A router csak HTTP-t fordít:

```python
# routers/imports.py  — TELJES tartalma a refaktor után (~45 sor a 292 helyett)
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_editor
from ..models import UserModel
from ..schemas import ImportConfirmResult, ImportDraftUpdateRequest, ImportPreviewResult
from ..services.imports import (
    confirm_import_draft, preview_import_data, update_import_draft_data,
)

router = APIRouter(prefix="/api/import", tags=["import"])

DB = Annotated[Session, Depends(get_db)]
Editor = Annotated[UserModel, Depends(require_editor)]


@router.post("/{entity}/preview", response_model=ImportPreviewResult)
def preview_import(entity: str, db: DB, _: Editor, file: UploadFile = File(...)):
    return preview_import_data(entity, file.filename or "", file.file.read(), db)


@router.put("/{entity}/draft/{draft_id}", response_model=ImportPreviewResult)
def update_import_draft(entity: str, draft_id: str, payload: ImportDraftUpdateRequest, db: DB, _: Editor):
    return update_import_draft_data(entity, draft_id, payload, db)


@router.post("/{entity}/confirm/{draft_id}", response_model=ImportConfirmResult)
def confirm_import(entity: str, draft_id: str, db: DB, _: Editor):
    return confirm_import_draft(entity, draft_id, db)
```

**Törlendő a routerből:** `_save_draft`, `_store_draft`, `_get_draft`, `_pop_draft`,
`_normalize_mapping`, `_serialize_row`, `_ordered_missing`, `_extract_messages`,
`_fallback_identity`, `_evaluate_rows`, `_preview_response` — mind megvan a service-ben.

**Eredmény:** 292 → ~45 sor, és a duplikáció megszűnik (CC1).

**Ellenőrzés:** ugyanaz a teszt, amit előbb írtál, továbbra is zöld.

### Ugyanez a `reports`-ra

`routers/reports.py` (474) → ~60 sor, a `services/reporting.py` publikus függvényeire
(`build_report_data`, `build_excel_report_bytes`, `build_docx_report_bytes`,
`build_pdf_report_bytes`, `report_title`, `report_filename_base`) támaszkodva.
Előbb ide is teszt: 4 sablon × 3 formátum, státuszkódra és `Content-Type`-ra.

---

## 2.2 — `deps.py` szétbontása (670 sor → 6 modul)

**Szabály:** CC3, CC4.

A `deps.py` ma kilenc, egymáshoz nem tartozó felelősséget hordoz, és **minden router
ebből importál**. A meglévő szekció-kommentek (`# ── Serializers ──`) már megmutatják
a törésvonalakat — csak követni kell őket.

**Célszerkezet:**

```
app/core/time.py          # _utc_now, _as_utc, _parse_iso_date, _date_overlap   (36–70. sor)
app/core/auth.py          # dependency-k + login-tracking                       (71–172. sor)
app/validation.py         # SZTSZ-normalizálás, egyediség, résztvevő-ellenőrzés (181–257. sor)
app/serializers.py        # 9 entitás szerializálója                            (258–474. sor)
app/appliers.py           # 9 entitás applier-je                                (475–670. sor)
app/repository.py         # require_model (generikus getter)                    (173–180. sor)
```

**A sorrend számít (CC9).** Alulról felfelé, mert a `time.py`-nak nincs függősége:

1. `core/time.py` — mozgatás, majd `deps.py`-ban `from .core.time import *` átmeneti
   újraexport, hogy a routerek ne törjenek.
2. `validation.py`, `repository.py` — ugyanígy.
3. `core/auth.py` — ez importálja a `time`-ot.
4. `serializers.py`, `appliers.py` — a legnagyobb falat, ezek használják az összes fentit.
5. **Végül:** a routerek importjainak átírása a valódi modulokra, és a `deps.py`
   átmeneti újraexportjainak törlése. A `deps.py` ekkor eltűnik.

Minden lépés után `pytest`. Ha egy lépés piros, egyetlen mozgatást kell visszavonni,
nem az egészet.

---

## 2.3 — Névkonvenció: a `_` jelentse azt, amit jelent

**Szabály:** CC4.

Ma `_serialize_vehicle`, `_require_editor`, `_get_current_user`, `_apply_supply` — az
aláhúzás modulon belüli privátot jelöl, ezeket viszont **minden router importálja**.
A `documents.py` már meg is kerüli, ami pontosan mutatja a feszültséget:

```python
from ..deps import _get_current_user as require_reader, _require_editor as require_editor
```

**A 2.2 mozgatással egy menetben** nevezd át:

| Régi | Új |
|---|---|
| `_get_current_user` | `get_current_user` |
| `_require_editor` / `_require_admin` / `_require_god_user` | `require_editor` / `require_admin` / `require_god_user` |
| `_require_model` | `require_model` |
| `_serialize_*` | `serialize_*` |
| `_apply_*` | `apply_*` |
| `_utc_now`, `_as_utc`, `_parse_iso_date` | `utc_now`, `as_utc`, `parse_iso_date` |

**Ami marad `_`-sal:** ami tényleg csak a saját moduljában él — `_verify_scrypt`,
`_verify_legacy_pbkdf2`, `_pepper` a `security.py`-ban; `_enrich`, `_apply` a
`documents.py`-ban.

A `deps.py` alján lévő félkész kísérlet is eltűnhet:

```python
# ez a két sor pont a problémát ismeri be — a rendes átnevezéssel tárgytalan
require_reader = _get_current_user
require_editor = _require_editor
```

**Bónusz:** a `documents.py` alias-importja egysoros, tiszta importra egyszerűsödik.

---

## 2.4 — `Annotated` dependency-k egységesen

**Szabály:** CC7 (valódi duplikáció megszüntetése).

Ma két stílus él egymás mellett. A `documents.py` már a jó irányba ment el:

```python
# ROSSZ — 120 endpointon ismételve
def list_vehicles(db: Session = Depends(get_db), _: UserModel = Depends(_get_current_user)):

# JÓ — documents.py-ban már így van
DB = Annotated[Session, Depends(get_db)]
Reader = Annotated[UserModel, Depends(require_reader)]
Editor = Annotated[UserModel, Depends(require_editor)]

def list_vehicles(db: DB, _: Reader):
```

Tedd a három aliast **egy közös helyre** (`app/core/auth.py`), és importáld
routerenként — ne definiáld újra mind a 24-ben (az maga lenne a CC1-sértés).

---

## 2.5 — `issue_token()` nem azonosító-generátor

**Szabály:** CC4.

```diff
  # routers/supplies.py
- movement = {"id": issue_token(), ...}
+ movement = {"id": new_id(), ...}
```

Az `issue_token()` **session tokent** generál, a `security.py`-ban él. Üzleti
azonosítóra használva egy biztonsági primitívet kever üzleti kódba: megnehezíti a
`security.py` auditálását, és félrevezeti az olvasót. A `models.new_id()` a helyes eszköz.

Keresd meg a többi előfordulást is: `grep -rn "issue_token" backend/app --include=*.py`
— csak az `auth.py`-ban szabad maradnia.

---

## 2.6 — Domain-konstansok egy igazságforrásból

**Szabály:** CC1.

Ma az egységlista **négy** helyen él, egymástól függetlenül:

```
src/pages/Personnel.tsx:14   ['31 TVZ', '83 TVZ', '19 TVZ', 'Ezredtörzs']
backend/app/seed.py:190      "31 TVZ": 400, ...
backend/app/seed.py:325      rng.choice(["31 TVZ", ...])
backend/.tmp_reseed_counts.py  (1.1-ben törlésre jelölve)
```

A 15 elemű rendfokozat-lista szintén hardkódolva a `Personnel.tsx`-ben. Ha átszervezik
az ezredet, több helyen kell javítani — és a frontend némán elcsúszhat a backendtől.

**Megoldás:**

1. `backend/app/constants.py` — itt már van precedens (`LEAVE_TO_ATTENDANCE_STATUS`):
   ```python
   UNITS: tuple[str, ...] = ("31 TVZ", "83 TVZ", "19 TVZ", "Ezredtörzs")
   RANKS: tuple[str, ...] = ("Közkatona", "Tizedes", ..., "Ezredes")
   PERSON_STATUSES: tuple[str, ...] = ("Aktív", "Tartalékos", "Szabadságon", "Leszerelt")
   ```
2. Új `routers/reference.py`: `GET /api/reference` → `{units, ranks, personStatuses}`.
   Olvasói jogosultság elég.
3. A `seed.py` ezekre hivatkozik, nem saját másolatra.
4. A `Personnel.tsx` a `store.ts`-en át kéri le. A `useEffect`-es betöltés helyett ez
   pont az a fajta ritkán változó adat, amire a **react-query** való (lásd 4.2).

---

# 3. FÁZIS — Típusbiztonság

## 3.1 — `typecheck` script

**Szabály:** CC5.

```diff
  "scripts": {
    "lint": "eslint .",
+   "typecheck": "tsc --noEmit -p tsconfig.app.json",
    "test": "vitest run",
```

A `vite build` **nem ellenőriz típust** (az SWC csak transzpilál) — ezért mehetett át
zölden 13 hibával. Ettől kezdve a `typecheck` a kapu.

## 3.2 — A maradék 9 hiba javítása

Az 1.3 törlései után 4 hiba magától megszűnik. A maradék:

### (a) `Layout.tsx:108` — `adminOnly` nem létezik

**Ellenőrizve: egyetlen nav-elemnek sincs `adminOnly` mezője.** Az ellenőrzés
elérhetetlen ág — halott kód (CC2):

```diff
  {navItems.map(item => {
-   if (item.adminOnly && !isAdmin) return null;
    if (item.editorOnly && !canEdit) return null;
```

Az így feleslegessé váló `isAdmin`-t is vedd ki a destrukturálásból.

> Alternatíva, ha az admin-only menüpont valós közeli terv: explicit `type NavItem`
> a tömbre, `adminOnly?: boolean` mezővel. **De YAGNI**: ne tarts fenn nem használt
> ágat feltételezett jövőbeli igényre.

### (b) `Operations.tsx:113,131` — a két `as` cast

**Ez a legtanulságosabb hiba a kódbázisban** (CC5): a cast nem javít semmit, csak
elhallgattatja a fordítót, és a következményét 1000 sorral lejjebb fizeted meg:

```typescript
// 113. és 131. sor — a cast
assigned: item.assigned as Array<Record<string, unknown>>,

// 1144. sor — a számla: String() kell, mert a típus elveszett
!detail.assigned.some((a) => String(a.personId) === p.id)
```

**A gyökérok:** az `OperationItem.assigned` típusa `Array<Record<string, unknown>>`,
ami *bármit* jelent, tehát semmit.

**Megoldás — közös ős a `types.ts`-ben.** Az `ExerciseAssignment` és a
`TrainingAssignment` már ma is osztozik öt mezőn:

```typescript
// src/lib/types.ts
export interface PersonAssignment {
  personId: string;
  personName: string;
  rank?: string;
  rankShort?: string;
  sztsz?: string;
  attendance?: string;
}

export interface ExerciseAssignment extends PersonAssignment {
  role: string;
}

export interface TrainingAssignment extends PersonAssignment {
  attendance: 'Tervezett' | 'Megjelent' | 'Hiányzott' | 'Beteg';
  qualificationApproved?: boolean;
}
```

```diff
  // src/pages/Operations.tsx
  type OperationItem = {
    ...
-   assigned: Array<Record<string, unknown>>;
+   assigned: PersonAssignment[];
  };

- assigned: item.assigned as Array<Record<string, unknown>>,
+ assigned: item.assigned,

- !detail.assigned.some((a) => String(a.personId) === p.id)
+ !detail.assigned.some((a) => a.personId === p.id)
```

Mindkét cast eltűnik, és a `String()` kerülőút is.

### (c) `Operations.tsx:110,128` — a `status` cast

Ugyanez kicsiben. A helyi `OperationStatus` **szó szerint azonos** az
`Exercise['status']`-szal — vagyis duplikált típusdefiníció (CC1):

```diff
- type OperationStatus = "Tervezett" | "Folyamatban" | "Befejezett" | "Törölve";
+ type OperationStatus = Exercise['status'];

- status: item.status as OperationStatus,
+ status: item.status,
```

## 3.3 — Típusok egy helyen

**Szabály:** CC1, CC3.

**A 13 hibából 6 gyökéroka ez:** az `AttendanceEntry`, `AttendanceStatus` típusok a
`store.ts`-ben vannak definiálva (689., 693. sor), miközben a komponensek a
`types.ts`-ből importálják őket.

**A szabály, amit ki kell mondani és tartani:**

> **A `types.ts` a domain típusokat tartalmazza. A `store.ts` API-hívásokat tartalmaz,
> és a `types.ts`-ből importál. Soha nem fordítva.**

Költöztetendő a `store.ts`-ből a `types.ts`-be: `AttendanceStatus`, `AttendanceEntry`,
`AttendanceDay`, `AttendanceMark`, `LeaveRequest`, `LeaveType`, `LeaveStatus`,
`Booking`, `PrerequisiteInfo`, `EligibilityPerson`, `ImportPreviewResult` és társai.

A `store.ts` 857 sorból ~600-ra fogy, és végre azt csinálja, amit a neve ígér.

## 3.4 — Fokozatos szigorítás

**Ne egyszerre.** Egy lépés, egy commit, végig zöld:

1. `"strictNullChecks": true` — **ez fogja a legtöbb valódi bugot** (a `undefined`-ra
   hivatkozásokat). Számíts sok hibára; fájlonként haladj.
2. `"noImplicitAny": true`
3. `"noUnusedLocals": true`, `"noUnusedParameters": true` — ezek halott kódot lepleznek le (CC2)
4. `"strict": true`

Fontos: a `tsconfig.json` **és** a `tsconfig.app.json` is felüldefiniálja ezeket —
mindkettőt állítani kell, különben csendben nem érvényesül.

---

# 4. FÁZIS — Biztonság és korrektség

## 4.1 — Feltöltés-biztonság

> **Ha az 1.4-nél B)-t választottad (kivezetés), ez a szakasz tárgytalan** — a
> `services/operations.py` törlésével a sebezhetőség is eltűnik. Ha A)-t, akkor
> kötelező, még a bekötés *előtt*.

**Szabály:** CC6 — a határon validálj.

### (a) Tárolt XSS: a kliens MIME-típusa

```python
# services/operations.py:455 — a hiba
mime_type = file.content_type or mimetypes.guess_type(original_name)[0] or "..."
```

A `file.content_type` **a kliensé**. Egy `.txt` feltölthető `Content-Type: text/html`
fejléccel; a `view` végpont inline szolgálja ki, a böngésző HTML-ként rendereli —
**azonos originről, ahol a session token a `localStorage`-ban van**.

```diff
- mime_type = file.content_type or mimetypes.guess_type(original_name)[0] or "application/octet-stream"
+ # A MIME a (már allowlist-elt) kiterjesztésből származik. A kliens content_type-ja
+ # nem megbízható: egy .txt "text/html"-ként inline renderelve XSS lenne.
+ mime_type = mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
```

### (b) Fejléc-injektálás

```python
headers={"Content-Disposition": f'inline; filename="{item.original_name}"'}
```

Az `original_name` a felhasználóé, escapelés nélkül interpolálva. Idézőjelet vagy
sortörést tartalmazó név megtöri a fejlécet.

```diff
+ from urllib.parse import quote
- headers={"Content-Disposition": f"inline; filename=\"{item.original_name}\""}
+ headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(item.original_name)}"}
```

**Szigorúbb változat:** inline megjelenítést csak PDF-re engedj, fix típussal —
minden más `attachment`:

```python
INLINE_TYPES = {"application/pdf"}
disposition = "inline" if mime_type in INLINE_TYPES else "attachment"
```

### (c) Memóriába olvasás a limit ellenőrzése előtt

```python
content = await file.read()          # előbb beolvas MINDENT
if len(content) > MAX_UPLOAD_SIZE:   # utána panaszkodik
```

Egy 2 GB-os feltöltés teljesen memóriába kerül, mielőtt elutasítanád — 100 felhasználós
központi gépen ez elég egy véletlen kiütéshez.

```python
async def _read_limited(file: UploadFile, limit: int) -> bytes:
    """Chunkonként olvas, és a limit átlépésekor azonnal megszakít."""
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(1 << 20):   # 1 MB
        total += len(chunk)
        if total > limit:
            raise HTTPException(status_code=413, detail="A fájl túl nagy (max 20 MB)")
        chunks.append(chunk)
    if not total:
        raise HTTPException(status_code=400, detail="Üres fájl")
    return b"".join(chunks)
```

A `413 Payload Too Large` a helyes státusz a mostani `400` helyett.

---

## 4.2 — Az audit kiterjesztése

**Szabály:** CC1 — a „minden változás naplózva van" szabály **egy** helyen valósuljon meg.

**Mai állapot: 24 routerből 3** használja (`personnel`, `exercises`, `trainings`).
A felhasználó a „Tevékenységnapló" oldalt látva joggal hiszi, hogy minden követve van —
közben egy szabadság-jóváhagyás vagy egy okmány-módosítás nyomtalanul eltűnik.

**Sorrend (adatérzékenység szerint):**

| Prioritás | Router | Miért |
|---|---|---|
| 1 | `users` | Jogosultság-változás — a legérzékenyebb |
| 2 | `leave` | Jóváhagyási döntés, jogkövetkezménnyel |
| 3 | `documents` | Okmány, alkalmasság |
| 4 | `qualifications` | Képesítés-megadás/visszavonás |
| 5 | `duties`, `attendance` | Szolgálat, létszám |
| 6 | `equipment`, `vehicles`, `supplies`, `announcements` | Eszközkezelés |

**A minta** (a `record_activity` a hívó commitjához fűz, ezért a `commit()` **elé** kerül):

```python
@router.post("/{item_id}/decision", response_model=LeaveRead)
def decide_leave(item_id: str, payload: LeaveDecision, db: DB, user: Editor):
    item = require_model(db, LeaveRequestModel, item_id)
    before = serialize_leave(item).model_dump()

    apply_leave_decision(item, payload, user)

    record_activity(
        db, user,
        mode="update",
        module="Szabadság",
        record_name=item.person_name,
        entity="leave",
        before=before,
        after=serialize_leave(item).model_dump(),
    )
    db.commit()
    db.refresh(item)
    return serialize_leave(item)
```

**Csábítás, amibe ne ess bele:** ne írj generikus „audit middleware"-t, ami minden
mutációt automatikusan naplóz. Nem tudná, mi a `module` és a `record_name` embernek
olvasható értéke, és a naplód használhatatlan zajjá válna. A CC7 pont erről szól:
a hasonlóság még nem duplikáció.

**Tesztet routerenként** (CC8) — a `test_audit.py` már ad mintát.

---

## 4.3 — Session-kezelés

**Szabály:** CC4 — a név (és a válasz) ne hazudjon.

### (a) A `/me` hamis lejáratot ad

```python
@router.get("/me")
def me(user: UserModel = Depends(_get_current_user)) -> AuthUser:
    expiry = _utc_now() + timedelta(hours=SESSION_HOURS)   # ← NEM a tényleges lejárat
```

Ez egy frissen számolt érték, nem a `SessionTokenModel.expires_at`. Ma nem okoz bajot,
mert a frontend nem hívja — **de aki legközelebb ránéz, elhiszi és épít rá.**

Megoldás: a `get_current_user` adja vissza a `SessionTokenModel`-t is (vagy egy
`AuthContext`-et), és a `/me` a valódi `expires_at`-et használja.

### (b) Lejárt tokenek takarítása

Ma csak használatkor törlődnek — a tábla korlátlanul nő. Egy sor a `lifespan`-be:

```python
db.execute(delete(SessionTokenModel).where(SessionTokenModel.expires_at < _utc_now()))
```

### (c) Csúszó munkamenet (mérlegelendő)

8 óra után némán kilépteti az ügyintézőt munka közben. Aktivitásra hosszabbítás
(pl. ha < 1 óra van hátra, tolódjon +8 órára) sokat javítana a napi használhatóságon.
**Termékdöntés** — a biztonsági kompromisszumot te ismered.

---

## 4.4 — Felhasználói szövegek

**Szabály:** CC4.

### (a) Kódolási sérülés

```typescript
// src/lib/store.ts:164 — ezt látja a felhasználó minden nem kezelt API-hibánál
throw new Error(detail || `A k?r?s sikertelen volt (${response.status})`);
```

```diff
- throw new Error(detail || `A k?r?s sikertelen volt (${response.status})`);
+ throw new Error(detail || `A kérés sikertelen volt (${response.status})`);
```

Ellenőrizd, hogy a fájl UTF-8-ban van mentve, BOM nélkül.

### (b) Ékezethiányos backend-üzenetek

20+ előfordulás: `"Ervenytelen datumtartomany"`, `"A mennyisegnek pozitivnak kell
lennie"`, `"Nem tamogatott riportminta"`.

**Jó hír:** a 2.1-es service-bekötés az `imports` üzeneteit **automatikusan** javítja —
a `services/imports.py` már ékezetes. Marad kézzel: `reports.py`/`reporting.py`,
`supplies.py`, `operations.py`.

Kereső parancs (ékezet nélküli `detail=` sztringek):

```bash
grep -rn 'detail="[^"]*"' backend/app --include=*.py | grep -Ev '[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]'
```

---

# 5. FÁZIS — Védőháló

## 5.1 — CI

**Szabály:** CC8 — ami nem fut automatikusan, az idővel elromlik.

Ma **nincs `.github/`**: a 68 teszt, a lint, a build és a typecheck csak akkor fut,
ha valaki kézzel elindítja.

`.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]

jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck      # a 3.1-ben létrehozott script
      - run: npm test
      - run: npm run build

  backend:
    runs-on: ubuntu-latest
    defaults:
      run: { working-directory: backend }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.13' }
      - run: pip install -r requirements-dev.txt
      - run: pytest -q
```

> **Sorrendi feltétel:** a `typecheck` lépés csak a 3.2 után kerülhet be, különben az
> első futás azonnal piros. Addig hagyd ki, vagy tedd `continue-on-error: true`-ra.

## 5.2 — Coverage

```diff
  # backend/requirements-dev.txt
  pytest>=8.0,<9.0
+ pytest-cov>=5.0,<7.0
  httpx>=0.27,<1.0
```

Először **csak mérj**, ne állíts küszöböt — a küszöb visszaüt, ha a valós lefedettséget
nem ismered. Egy hét adat után dönts.

## 5.3 — Backend tesztek a fehér foltokra

Teszt nélküli routerek: `announcements`, `conflicts`, `equipment`, `imports`,
`reports`, `supplies`, `vehicles` (+ `bug_reports`, ha marad).

Az `imports` és a `reports` az **1.4-ben már megíródik**, mert a refaktor előfeltétele
(CC8). A maradék öt CRUD-router hasonló szerkezetű — egy jó paraméterezett teszt
mindet lefedi, de **ne told túl**: ha az assertek olvashatatlanná válnak, írj öt külön
tesztet (CC7).

## 5.4 — Frontend tesztek

A jelenlegi egyetlen teszt:

```typescript
describe("example", () => { it("should pass", () => { expect(true).toBe(true); }); });
```

Ez nem teszt, hanem placeholder — **törlendő**, mert hamis biztonságérzetet ad
(a CI zöld lesz tőle).

**Kezdd a tiszta, könnyen tesztelhető logikával**, ahol az érték/ráfordítás arány a
legjobb:

| Cél | Miért ez |
|---|---|
| `normalizeHungarianPhone` (`Personnel.tsx`) | Tiszta függvény, sok élhelyzet (`06`, `+36`, `36`, csonka input) |
| `lib/rank.ts`, `lib/qualifications.ts` | Tiszta domain-logika, DOM nélkül |
| `store.ts` → `request()` hibakezelés | A 401 → `clearToken()` ág biztonsági viselkedés |
| `getSession()` lejárat-kezelés | Sérült `localStorage`-tartalom és lejárt token |

> **Előfeltétel:** a `normalizeHungarianPhone` ma a `Personnel.tsx`-ben él, tehát nem
> importálható tesztből. Emeld ki `src/lib/phone.ts`-be — ez a CC3 amúgy is megkívánja:
> egy oldal-komponens ne hordozzon újrahasznosítható formázó logikát.

## 5.5 — E2E

A Playwright be van állítva, E2E teszt nélkül. Egy „smoke" folyam bőven elég a kezdéshez:

```
bejelentkezés → személy létrehozása → napi létszám rögzítése → kijelentkezés
```

---

# 6. FÁZIS — Kényelem és dokumentáció

## 6.1 — react-query: döntés

**Szabály:** CC2.

A `QueryClientProvider` be van kötve az `App.tsx`-ben, a csomag a `dependencies`-ben —
**`useQuery`/`useMutation` előfordulás: 0**. Helyette 22 oldal kézzel `useEffect` +
`fetch`-el tölt: nincs cache, nincs kérés-deduplikáció, minden navigációnál újratölt
mindent, és nincs `AbortController` — gyors oldalváltásnál versenyhelyzet.

**Javaslatom: használd.** Egy oldallal kezdj (`Personnel`), alakíts ki egy mintát, és
onnan terjeszd. A 2.6-os `/api/reference` végpont a tökéletes első jelölt: ritkán
változó adat, aminek a cache-elése azonnal látszik.

Ha viszont nem éri meg a ráfordítást, **vedd ki** a `package.json`-ból és az
`App.tsx`-ből. A mostani „ott van, de nem használjuk" a legrosszabb változat: minden
olvasó azt hiszi, van cache-elés.

## 6.2 — Route-szintű `lazy()`

676 kB egyetlen chunkban. Az 1.3 törlései ezt már részben javítják.

```typescript
const Operations = lazy(() => import("@/pages/Operations"));   // 1285 sor
const SettingsPage = lazy(() => import("@/pages/SettingsPage")); // 843 sor
```

`Suspense` fallbackkel a `Layout`-on belül. A `Dashboard`-ot **ne** tedd lazy-vá — az
a kezdőoldal, ott az extra körút csak lassít.

## 6.3 — README

A könyvtárstruktúra-fejezet még a `routers/` és `services/` előtti állapotot mutatja,
és hiányzik belőle az `ops/`, a `prod.env`, a backup/visszaállítás, a dev vs. prod
indítás. A `docs/funkcio-roadmap.md` viszont példásan naprakész — a README-t érdemes
a szintjére hozni.

---

# 7. Végrehajtási sorrend

A fázisok **nem** cserélhetők fel: mindegyik az előzőre épül.

| Sorrend | Lépés | Ráfordítás | Kockázat | Blokkolja |
|---|---|---|---|---|
| 1 | 1.1 Git-higiénia | 15 p | nincs | — |
| 2 | 1.2 `backend/main.py` törlése | 5 p | nincs | — |
| 3 | 1.3 Halott frontend | 30 p | nincs | 3.2 |
| 4 | **1.4 Műveletek v2 — DÖNTÉS** | — | — | 4.1 |
| 5 | 1.5 `bug_reports` — döntés | 15 p | nincs | — |
| 6 | 2.1 `services/` bekötése (+ tesztek) | 1 nap | **közepes** | 4.4 |
| 7 | 3.1 `typecheck` script | 5 p | nincs | 5.1 |
| 8 | 3.2–3.3 Típushibák + típusok egy helyre | 4 óra | alacsony | 5.1 |
| 9 | 5.1 CI | 1 óra | nincs | — |
| 10 | 4.1 Feltöltés-biztonság *(ha 1.4 = A)* | 2 óra | alacsony | — |
| 11 | 4.4 Szövegek | 30 p | nincs | — |
| 12 | 4.2 Audit kiterjesztése | 4 óra | alacsony | — |
| 13 | 4.3 Session-kezelés | 2 óra | alacsony | — |
| 14 | 2.2–2.4 `deps.py` szétbontása | 1–2 nap | **közepes** | — |
| 15 | 2.5–2.6 Nevek, konstansok | 3 óra | alacsony | — |
| 16 | 3.4 `strict` fokozatosan | 1 nap | alacsony | — |
| 17 | 5.2–5.5 Tesztek | folyamatos | nincs | — |
| 18 | 6.1–6.3 react-query, lazy, README | 1 nap | alacsony | — |

**Az 1–9. lépés kb. két munkanap**, és ezután:

- a repóban csak futó kód van (CC2),
- minden üzleti szabály egy helyen (CC1),
- a fordító újra véd (CC5),
- és a CI minden push-nál elkapja, ha valami elromlik (CC8).

**Ez az a pont, ahonnan a `funkcio-roadmap.md` következő funkciói (D1, B1, F1) már
biztonságosan építhetők.**

---

## Amit szándékosan NEM javaslok

Clean code ürügyén könnyű túlmérnökölni. Ezeket **hagyd békén**:

| Amit ne | Miért |
|---|---|
| Repository-réteg SQLAlchemy fölé | A SQLAlchemy Session már az. Egy réteg indirekció haszon nélkül. |
| Generikus `BaseCRUDRouter` a 9 CRUD-routerre | Első pillantásra DRY, de minden entitás egyedivé válik (a `supplies` mozgásokat kezel, a `vehicles` kiadást), és a generikus alap absztrakciós szivárgássá torzul. **CC7.** |
| SQLite → PostgreSQL | ~100 user / ~2000 katona mellett a SQLite WAL-lal bőven elég, és offline intranetre az egyfájlos DB **előny** (mentés = fájlmásolás). |
| Alembic bevezetése | A `migrate.py` + `startup.py` páros működik, tesztelt. Ha később bonyolódik, akkor térj vissza rá. |
| Teljes frontend-újraírás react-queryre egy menetben | 22 oldal egyszerre = nem review-zható PR. Oldalanként, a 6.1 szerint. |
| Data-at-rest titkosítás | Egyeztetés szerint ez a **legutolsó** lépés, minden más után. |

---

# Végrehajtási napló

## ✅ Elkészült (2026-09-10)

Ág: `takaritas-es-retegek`. Minden lépés után zöld teszt + build.

| Lépés | Állapot | Eredmény |
|---|---|---|
| 1.1 Git-higiénia | ✅ | Követett fájlok 283 → 205, 0 db `.pyc` |
| 1.2 `backend/main.py` | ✅ | Törölve a hitelesítés nélküli adat-API |
| 1.3 Halott frontend | ✅ | 4 oldal törölve, `NotFound` bekötve és átírva |
| 1.4 Műveletek v2 | ⏸️ | Döntés: **befejezzük** — külön menetben (lásd lent) |
| 1.5 Hibabejelentő | ✅ | Törölve (a `BugReportModel` sosem létezett) |
| 2.1 `services/` bekötése | ✅ | `imports` 292→44, `reports` 474→79 sor |
| 2.2 `deps.py` szétbontása | ✅ | 670 sor → 7 modul |
| 2.3 Publikus nevek | ✅ | Aláhúzás csak a valóban privátokon |
| 2.4 Dependency-aliasok | ✅ | `core/dependencies.py`, ~120 import megszűnt |
| 2.5 `issue_token()` | ✅ | Csak az `auth.py`-ban maradt |
| 2.6 Törzsadatok | ✅ | `/api/reference` + migráció + őr-tesztek |
| 3.1 `typecheck` script | ✅ | Bekötve, hibaszám 13 → 6 |

**Tesztek: 68 → 103.** Új: `test_imports.py` (10), `test_reports.py` (20),
`test_reference.py` (4).

## A refaktor közben felszínre került, addig rejtett hibák

1. **A `role` mező modellezési hibája** (`Operations.tsx`). A cast eltávolítása
   után derült ki, hogy a kód minden beosztásnál kiolvasta a `role`-t, ami csak
   gyakorlaton létezik. Futásidőben véletlenül jó volt; diszkriminált unióval
   javítva.
2. **A felhasználó a rosszabb hibaüzeneteket kapta.** A `services/imports.py`
   ékezetes üzenetei két hónapja készen álltak, csak nem voltak bekötve.
3. **Élő rendfokozat-elcsúszás.** A seed a zászlóalj-állomány 26%-át "Honvéd"
   fokozatúra generálta, amit a frontend létrája nem ismert — 0 rendezési súly,
   rövidítés nélkül. Három különböző szókincs volt forgalomban.
4. **Hiányzó `date` import** az `appliers.py`-ban, amit a képesítés-jóváírás
   tesztje azonnal elkapott.
5. **A hibabejelentő importálni sem volt képes** — a `BugReportModel` soha nem
   került be a `models.py`-ba.

## ⏭️ Következő: a Műveletek v2 befejezése (1.4)

A döntés **A) Befejezés**. A felmérés óta pontosodott a kép: ez nem „bekötés",
hanem **feature-építés**, mert az alapok is hiányoznak.

**Ami már megvan:** `services/operations.py` (523 sor) és `services/lifecycle.py`
(106 sor) üzleti logikája, valamint a négy frontend komponens váza (466 sor).

**Ami hiányzik — meg kell írni:**

| Réteg | Hiányzik |
|---|---|
| `models.py` | `MaterialRequirementModel`, `OperationDocumentModel` (az `AttendanceModel` megvan) |
| `schemas.py` | `OperationTreeNode`, `AttendanceEntryRead`, `AttendanceEntryUpdate`, `AttendanceBatchUpdateRequest`, `MaterialRequirementBase/Read/Update`, `OperationDocumentRead` |
| router | Új `routers/operations_v2.py`, ~15 endpoint, regisztrálva a `main.py`-ban |
| `types.ts` | `OperationTreeNode`, `OperationDocument`, `MaterialRequirement`, `RequirementStatus` (az `AttendanceEntry`/`AttendanceStatus` a `store.ts`-ben van, oda költözik) |
| `store.ts` | `operationsV2` modul a fenti endpointokhoz |
| `Operations.tsx` | A négy komponens bekötése |
| tesztek | Fa, jelenlét, anyagigény, dokumentum-feltöltés |

**Ezért a 4.1-es feltöltés-biztonsági munka (MIME a kiterjesztésből, escapelt
`Content-Disposition`, chunkolt olvasás) NEM tárgytalan — a bekötés előtt
kötelező.** Amíg a router nincs regisztrálva, a sebezhetőség nem elérhető.

A `services/operations.py` jelenleg **nem importálható** (`MaterialRequirementModel`
hiányzik), ezért a 3.2-es 6 maradék típushiba és ez a két service marad az
egyetlen ismert „nem futó" kód a repóban — tudatosan, a befejezésig.
