# Második feltárási kör és fejlesztési javaslatok

Készült: 2026-09-10, az 1–6. fázis befejezése után. Az első kör hiányosságai
(lásd [állapotfelmérés](allapotfelmeres-es-cselekvesi-terv.md)) megoldva; ez egy
**új vizsgálat** olyan területeken, amiket addig nem néztem.

Módszer: adatintegritás-próba futó adatbázison, teljesítménymérés 1300 fős
állományon, a visszaállítási és üzemeltetési út végigjárása.

---

## 1. Új hibák

### 🔴 H1. A napló-visszaállítás minden esetben elszáll

A Tevékenységnapló oldalon van „Visszaállítás" gomb, és a backend
`POST /api/activity-log/{id}/restore` végpontja is megvan. **Egyik sem működik.**

A visszaállítás a naplózott pillanatképből az `id` mezőt keresi:

```python
# routers/activity_log.py
target_id = (before or {}).get("id")
if not target_id:
    raise HTTPException(status_code=400, detail="Hiányzó azonosító")
```

A pillanatképet előállító függvény viszont **nem teszi bele az `id`-t**:

```python
# routers/personnel.py
def _person_snapshot(item: PersonModel) -> dict:
    return {"name": ..., "sztsz": ..., "rank": ...}   # id nincs
```

Élő próbán igazolva: minden visszaállítás `400 Hiányzó azonosító`. A felhasználó
látja a gombot, megnyomja, és hibát kap — pont akkor, amikor egy elrontott
módosítást akarna helyrehozni.

**Javítás:** az `id` bekerül minden pillanatképbe (`_person_snapshot` és társai),
plusz egy teszt, ami végigviszi a kört: módosítás → visszaállítás → az eredeti
érték visszaáll. A már meglévő naplóbejegyzések nem lesznek visszaállíthatók
(nincs bennük `id`) — ezt a felületnek jeleznie kell, nem hibaüzenettel.

### 🔴 H2. Nincs egyetlen idegen kulcs sem — a törlés árva rekordokat hagy

A `db.py` bekapcsolja a `PRAGMA foreign_keys=ON`-t, de a modellrétegben
**nulla `ForeignKey`** van, így nincs mit kikényszerítenie.

Élő próba: létrehoztam egy személyt okmánnyal, szabadságkérelemmel és napi
létszám-bejegyzéssel, majd töröltem:

```
törlés: 204
  árván maradt person_documents: 1
  árván maradt leave_requests:   1
  árván maradt attendance:       1
```

Ezek soha nem tűnnek el. Következmények: az adatbázis lassan tele lesz halott
sorokkal; a napi létszám-statisztika olyan személyeket számolhat, akik már
nincsenek; és egy jövőbeli `sztsz`-újrafelhasználásnál összekeveredhetnek.

Ugyanez a `checked_out_to` (felszerelés) és `assigned_to` (jármű) mezőkre: a
törölt személy továbbra is „nála van" eszközként jelenik meg.

**Javítás — két lépcső.** Előbb takarítás (egy migráció törli a meglévő árvákat),
utána megelőzés. A megelőzésre két út van, és ez **termékdöntés**:

| | Kaszkádolt törlés | Archiválás (soft delete) |
|---|---|---|
| Mit tesz | A személlyel együtt minden kapcsolódó rekord törlődik | A személy „Archivált" lesz, az adatai megmaradnak |
| Mellette | Egyszerű, tiszta adatbázis | Katonai nyilvántartásnál az előzmény érték; a napló és a jelentések visszamenőleg értelmezhetők maradnak |
| Ellene | Egy elgépelt törlés visszafordíthatatlanul visz mindent | Több szűrési logika (mindenhol ki kell hagyni az archiváltakat) |

**Javaslatom: archiválás.** Egy leszerelt katona aktája nem semmisítendő meg,
és a H1-es visszaállítás is csak akkor ér valamit, ha van mit visszaállítani.
A tényleges törlés maradjon meg adminnak, külön „végleges törlés" műveletként.

### 🟡 H3. Elveszett módosítás: két ügyintéző egymásra ír

Nincs verziómező, `updated_at`-alapú ellenőrzés vagy ETag egyetlen entitáson sem.
A `PUT` az összes mezőt felülírja.

Forgatókönyv ~100 felhasználós rendszerben: A és B megnyitja ugyanazt a személyt.
A átírja a telefonszámot és ment. B — aki a régi adatot látja — átírja a
beosztást és ment. **A telefonszám-módosítás némán elveszett**, és a naplóban két
egymásnak ellentmondó bejegyzés áll.

**Javítás:** minden szerkeszthető entitásra egy `version` egész, ami mentéskor nő.
A `PUT` megkapja a kliens által ismert verziót; ha nem egyezik, `409 Conflict`, és
a felület felkínálja: „valaki más módosította — nézd meg a különbséget".

### 🟡 H4. A személyzeti lista minden szűrésnél 396 kB-ot tölt le

```typescript
// Personnel.tsx — minden szűrés-, lapozás- és rendezésváltásnál lefut
const [result, allPeople] = await Promise.all([
  store.getPaged({ ... }),   //   7,7 kB — a látható 25 sor
  store.getAll(),            // 396,5 kB — MIND az 1300 fő
]);
```

A teljes lista egyetlen célt szolgál: négy státusz-számláló kiszámítását
(aktív / tartalékos / szabadságon / leszerelt). Mért érték 1300 fős állományon:
**396 kB és 36 ms szerveroldalon**, minden egyes billentyűleütés-szünet után.

**Javítás:** `GET /api/personnel/summary` végpont, ami a négy számot adja vissza
(`SELECT status, COUNT(*) ... GROUP BY status`), vagy a számlálók bekerülnek a
lapozott válaszba. Néhány száz bájt 396 kB helyett.

> A lapozás egyébként helyesen működik — a mérés szerint az egész rendszer
> jól bírja az 1300 főt: minden végpont 80 ms alatt válaszol. Ez nem
> méretezési, hanem fölösleges-munka probléma.

### 🟡 H5. Van mentés, de nincs visszaállítás

A `backup_db.py` szép (`VACUUM INTO`, retenció), és a Feladatütemezőbe is
beköthető. **Visszaállító script viszont nincs**, és a folyamat sincs leírva —
miközben a README maga írja elő: *„Rendszeresen végezz visszaállítás-próbát."*

Egy mentés, amiről nem tudod biztosan, hogy vissza tudod tölteni, nem mentés.
Élesben ez a legdrágább hiányosság: a visszaállítást akkor kell először
kipróbálni, amikor még nem sürgős.

**Javítás:** `ops/windows/restore-guardduty-db.ps1`, ami leállítja a
szolgáltatást, félreteszi a jelenlegi adatbázist (nem törli!), visszamásolja a
kiválasztott mentést, `PRAGMA integrity_check`-et futtat, és újraindít. Plusz egy
`--dry-run` mód, amivel a próba veszélytelenül elvégezhető.

### 🟡 H6. Gyakorlatilag nincs alkalmazás-naplózás

A teljes backendben egyetlen logger van (`migrate.py`), és sehol nincs
`logging.basicConfig` — vagyis az sem ír ki semmit. A szolgáltatás-indító script
nem irányítja fájlba a kimenetet.

Offline, egygépes rendszernél ez azt jelenti: **ha valami elromlik, nincs nyom**.
Nem tudod utólag megmondani, mikor és miért szállt el egy kérés, vagy hogy
lassult-e valami a héten.

**Javítás:** `RotatingFileHandler` a `logs/` alá (napi rotáció, 30 nap), a
kérések alapadataival (útvonal, státusz, időtartam, felhasználó — **személyes
adat és jelszó nélkül**), és a kezeletlen kivételek teljes stack trace-ével.

### 🟢 H7. A címkék nincsenek az űrlapmezőkhöz kötve

```tsx
<label className="block text-xs ...">{label}</label>
<input type={type} ... />     // nincs id, a labelnek nincs htmlFor
```

Következmény: a képernyőolvasó nem mondja be a mező nevét, és a címkére
kattintva nem ugrik a kurzor a mezőbe (ez utóbbi mindenkinek hiányzik, nem csak
akadálymentesítési kérdés). Az egész kódbázisban két `htmlFor`/`aria-label`
található.

### 🟢 H8. Nincs nyomtatási nézet

Nincs `@media print` szabály. A PDF/XLSX export sok esetben kiváltja, de egy
jelenléti ívet vagy névsort az ügyintéző gyakran a képernyőről nyomtatna —
jelenleg a menüsávval és a gombokkal együtt jönne ki.

---

## 2. Javaslatok

Ezek **nincsenek** a `funkcio-roadmap.md`-ben — azt nem ismétlem. Sorrend:
üzembiztonság → adatminőség → napi hatékonyság → hosszú táv.

### A. Üzembiztonság (offline, egygépes környezetre szabva)

**A1. Öndiagnosztika-oldal az adminnak.** Egy `/rendszerallapot` képernyő, ami
laikusnak is érthetően mutatja: mikor volt az utolsó sikeres mentés, mekkora a
szabad lemezterület, hány aktív munkamenet van, mekkora az adatbázis, futott-e
hiba az elmúlt 24 órában. Ma ehhez fájlokat kellene nézegetni a szerveren.
*Kicsi munka, nagy nyugalom — különösen, ha az üzemeltető nem informatikus.*

**A2. Adatbázis-integritás ellenőrzése a mentés részeként.** A `backup_db.py`
fusson `PRAGMA integrity_check`-et a másolaton, és bukjon el hangosan, ha
sérülést talál. Így egy csendben romló adatbázis nem másolódik át 30 napnyi
mentésbe.

**A3. Verziózott frissítési csomag.** Mivel nincs internet, a frissítés kézi
fájlmásolás. Egy `ops/windows/upgrade-guardduty.ps1`, ami: mentést készít →
leállít → fájlokat cserél → migrációt futtat → health checket futtat → hiba
esetén **automatikusan visszaáll**. Ez teszi biztonságossá a verzióváltást
karbantartási ablakban.

**A4. Naplórotáció és megőrzési szabály.** A H6 mellé: a tevékenységnapló is
korlátlanul nő. Éves archiválás (a régi bejegyzések külön fájlba exportálva,
az adatbázisból törölve) tartja karban a rendszert.

### B. Adatminőség

**B1. Adatminőségi jelentés.** Egy képernyő, ami megmutatja, hol hiányos az
állomány: kinek nincs SZTSz-e, érvényes okmánya, elérhetősége; kinek járt le a
szerződése; kinél ellentmondó az adat. Az ügyintéző így proaktívan javíthat,
nem akkor derül ki, amikor egy jelentést kellene leadni.

**B2. Visszavonható import.** Az import ma véglegesen ír. Ha valaki rossz fájlt
erősít meg, nincs mit tenni. Az import kapjon egy azonosítót, és legyen
„import visszavonása" művelet, ami az abban létrehozott/módosított rekordokat
visszaállítja. *A 4.2-ben már bekerült az összesítő naplózás — ez erre épülhet.*

**B3. Duplikátum-felismerés.** Az import ma SZTSz alapján egyeztet. Egy elgépelt
SZTSz új személyt hoz létre. Névre és születési dátumra épülő hasonlóság-
figyelmeztetés a preview-ban („ez a személy már szerepel, biztos új?").

**B4. Adatmegőrzési szabály.** Katonai személyes adatoknál kell egy kimondott
elv: a leszerelt katona adatai meddig maradnak, mi történik utána. Ez részben
jogi, részben technikai kérdés — a rendszernek támogatnia kell (archiválás,
anonimizálás), de a szabályt neked kell meghatároznod.

### C. Napi hatékonyság az ügyintézőnek

**C1. Visszavonás (undo) a destruktív műveletekre.** Törlés után a felugró
üzenetben egy „Visszavonás" gomb, ami 10 másodpercig él. Ez a leggyakoribb
felhasználói baleset elleni legolcsóbb védelem — sokkal barátibb, mint a
„Biztosan törlöd?" párbeszéd, amit mindenki reflexből nyom le.

**C2. Billentyűzetes létszám-rögzítés.** A napi létszám a leggyakoribb művelet.
Ha nyíllal lehet sorok között lépni és egy betűvel állítani az állapotot
(J = jelen, S = szabadság…), az ügyintéző reggeli munkája percekkel rövidül.
*A roadmap G5 tömeges műveletekről szól — ez a kiegészítő, egyesével gyors út.*

**C3. Mentett nézetek.** A gyakran használt szűrő-kombinációk (pl. „31 TVZ
aktív, lejáró okmánnyal") elmenthetők és egy kattintással előhívhatók.

**C4. „Mi változott, amíg nem voltam itt?"** A bejelentkezés utáni áttekintőn egy
sáv: az utolsó belépésem óta történt fontos változások (új szabadságkérelem,
lejárt okmány, státuszváltozás). Az ügyintéző nem lapozza végig a naplót.

### D. Biztonság és elszámoltathatóság

**D1. Aktív munkamenetek és távoli kijelentkeztetés.** Az admin lássa, ki van
bejelentkezve és honnan, és tudjon munkamenetet megszüntetni. Egy közös gépeket
használó egységnél ez alap. *A `SessionTokenModel` már megvan hozzá.*

**D2. Sikertelen belépések láthatósága.** A `LoginAttemptModel` gyűjti az
adatot, de senki nem látja. Egy admin-nézet a zárolásokról és a gyanús
próbálkozásokról.

**D3. Négy szem elve érzékeny műveletekre.** Tömeges törlés, jogosultság-emelés
vagy import véglegesítése kérjen második jóváhagyást egy másik admintól. Ez
katonai környezetben nem túlzás — és a naplóval együtt valódi elszámoltathatóság.

**D4. Napló-export.** A tevékenységnapló legyen kiexportálható (PDF/XLSX)
időszakra szűrve — ellenőrzéshez, jelentéshez.

### E. Amit szándékosan NEM javaslok

| Amit ne | Miért |
|---|---|
| Több-telephelyes/replikált üzem | Egy központi gép a kiindulás; a replikáció nagyságrenddel bonyolítja a mentést és a konfliktuskezelést |
| Valós idejű együttműködés (WebSocket, élő kurzorok) | A H3-as verziókezelés megoldja a valódi problémát töredék áron |
| Mobilalkalmazás | A reszponzív web elég; offline intraneten a telepítés és frissítés külön teher lenne |
| Mikroszolgáltatások | ~100 felhasználónál az egyprocesszes felállás előny, nem korlát |
| Jogosultságok finomhangolása mezőszintig | A négy szerepkör jelenleg elég; a mezőszintű jogosultság a legdrágábban karbantartható dolgok egyike |

---

## 3. Javasolt sorrend

| # | Tétel | Ráfordítás | Miért ott |
|---|---|---|---|
| 1 | **H1** napló-visszaállítás javítása | 2 óra | Létező, látható, mindig hibázó funkció |
| 2 | **H5** visszaállító script | fél nap | Ma nincs bizonyítottan működő visszaállítás |
| 3 | **H2** árva rekordok + archiválás | 1–2 nap | Adatintegritás; minél tovább vársz, annál több árva gyűlik |
| 4 | **H6** naplózás | fél nap | Enélkül minden későbbi hibakeresés vakrepülés |
| 5 | **H4** összesítő végpont | 2 óra | Olcsó, azonnal érezhető |
| 6 | **H3** verziókezelés | 1 nap | ~100 felhasználónál valós adatvesztés |
| 7 | **A1** öndiagnosztika-oldal | 1 nap | Az üzemeltetést laikus is végezheti |
| 8 | **C1** undo | fél nap | A leggyakoribb felhasználói baleset ellen |
| 9 | **H7** címkék bekötése | 2 óra | Akadálymentesítés + kényelem |
| 10 | **B1** adatminőségi jelentés | 1 nap | Proaktív hibajavítás |

Az első hat tétel kb. **négy munkanap**, és utána a rendszer nemcsak működik,
hanem **üzemeltethető és helyrehozható** is — ez a különbség egy jó projekt és
egy éles rendszer között.
