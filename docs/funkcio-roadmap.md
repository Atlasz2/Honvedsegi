# Funkció-ötletek / bővítési terv

Egy **tartalékos katonai egység** ügyintézőjének napi munkája alapján. Cél: ne
feledjük el az ötleteket. A jelölés: státusz (⬜ tervezett / 🔧 folyamatban / ✅ kész),
hozzávetőleges méret (S/M/L), és hogy meglévő modult bővít-e vagy új.

> Kontextus: offline intranet, 1 központi gép, ~100 felhasználó, ~2000 katona, SQLite.
> A meglévő modulok: személyzet, gyakorlat/kiképzés/esemény/művelet/ügyelet,
> felszerelés/készlet/jármű, képesítések+riasztások, hirdetmények, napló, jelentések,
> import, ütközés-vizsgálat. (Folyamatban a csapatnál: hibabejelentő, fájlfeltöltés,
> műveletek, „roham informatikus" oldal.)

---

## A. Napi rutin és létszám

| # | Funkció | Méret | Alap | Leírás |
|---|---------|-------|------|--------|
| A1 | **Napi létszámjelentés / jelenléti ív** ✅ | M | bővít (személyzet) | Reggeli létszám + **export (PDF/Excel)**. **Kész**: `/letszam`, `/api/attendance` GET/PUT + export, `AttendanceModel`, tesztek. **Hatékonyság**: alapból csak az aktív állomány (tartalékos kapcsolóval), **tömeges állítás** a szűrt listára (nem kell 1500 sort kattintgatni). |
| A2 | **Szabadság- és távollét-kezelés** ✅ | L | új | Szabadság/betegszabadság/kiküldetés kérelmezése, jóváhagyási folyamat. Visszahat az A1-re. **Kész**: `/szabadsag` oldal, `/api/leave` (lista/létrehozás/döntés/törlés), `LeaveRequestModel`, A1-integráció (jóváhagyott szabadság → napi létszám alapállapot), tesztek. Hátra: szabadság-egyenleg, naptári ütközés-ellenőrzés. |
| A3 | **Napiparancs / parancskönyv** | M | bővít (hirdetmény) | Formális napi parancsok rögzítése, sorszámozás, kihirdetés, archívum, PDF-export. |
| A4 | **Admin teendőlista / emlékeztetők** | S | új | Az ügyintéző saját napi teendői, határidőkkel, követés. |

## B. Tartalékos-specifikus (kiemelten releváns)

| # | Funkció | Méret | Alap | Leírás |
|---|---------|-------|------|--------|
| B1 | **Behívó / mozgósítás kezelés** | L | új | Behívók kiállítása, kézbesítés-állapot, rendelkezésre állás és visszajelzés követése. Tartalékos egységnél kulcs. |
| B2 | **Szerződés- / jogviszony-kezelés** | M | bővít (személyzet) | Szerződés kezdete/vége, hosszabbítási emlékeztető, jogviszony-típus. |
| B3 | **Tömeges értesítés / kapcsolattartás** | M | új | Sablonos értesítés (behíváshoz is): nyomtatható/exportálható levél, ki és mikor lett értesítve. E-mail, ha van hálózat. |

## C. Okmányok és alkalmasság

| # | Funkció | Méret | Alap | Leírás |
|---|---------|-------|------|--------|
| C1 | **Személyi okmányok és engedélyek** | M | bővít (képesítés-riasztás minta) | Igazolvány, nemzetbiztonsági ellenőrzés, belépő — lejárati figyeléssel. |
| C2 | **Egészségügyi alkalmasság + fizikai felmérés** | M | bővít (képesítés) | Orvosi alkalmassági és fizikai állapotfelmérés eredménye, érvényesség, emlékeztető. |
| C3 | **Lőkiképzési jegyzék** | S | bővít (kiképzés) | Lőgyakorlat-eredmények, érvényesség. |

## D. Ügyintézés és iratkezelés

| # | Funkció | Méret | Alap | Leírás |
|---|---------|-------|------|--------|
| D1 | **Kérelmek / beadványok** | M | új (hibabejelentő mintára) | Katona beadványa (szabadság, áthelyezés, igazolás, felszerelés); állapot: beérkezett → elbírálás → jóváhagyva/elutasítva. |
| D2 | **Igazolások kiállítása** | M | bővít (jelentések) | Szolgálati / jövedelem- / munkáltatói igazolás generálása PDF/DOCX-ben, személyre. |
| D3 | **Iktatókönyv / iratkezelés** | M | új | Beérkező és kimenő iratok nyilvántartása (iktatószám, tárgy, ügyintéző, határidő). |

## E. Személyügyi akta-bővítések

| # | Funkció | Méret | Alap | Leírás |
|---|---------|-------|------|--------|
| E1 | **Elismerések és fegyelmi ügyek** | S | bővít (személyzet-történet) | Dicséret/kitüntetés és fegyelmi bejegyzések az aktában. |
| E2 | **Fegyverzet-napló / armory** | M | bővít (felszerelés) | Fegyverkiadás/-visszavét sorszám szerint, ki melyiket tartja most, armory-napló. |

## F. Tervezés és vezetői áttekintés

| # | Funkció | Méret | Alap | Leírás |
|---|---------|-------|------|--------|
| F1 | **Ügyeleti/szolgálati beosztás-tervező** | L | bővít (ügyelet) | Szolgálati rota, rotáció és terhelés-kiegyenlítés, ütközés-ellenőrzés. |
| F2 | **Éves kiképzési ütemterv** | M | bővít (kiképzés) | Kötelező, ismétlődő kiképzések éves terve beosztás/szerep szerint. |
| F3 | **Egységes értesítési központ** | M | bővít (riasztások) | Lejáró okmányok, közelgő szolgálatok, szerződés-végek, születésnapok egy helyen. |
| F4 | **Vezetői statisztikák / készenléti mutatók** | M | bővít (dashboard) | Készenlét %, képesítés-lefedettség, létszámtrendek. |

## G. Okos / proaktív funkciók (hatékonyság — „eddig nem gondolt")

> **Vezérelv**: az ügyintéző NE kattintgasson 1500 sort. Okos alapértelmezések,
> tömeges műveletek, proaktív riasztások. A rendszert **CSAK ügyintézők**
> használják (nincs katonai önkiszolgálás) — a távollétet is az ügyintéző
> rögzíti, a katona csak szól neki.

| # | Funkció | Méret | Leírás |
|---|---------|-------|--------|
| G1 | **Napi helyzetkép (vezetői összesítő)** ✅ | M | Egy képernyő: létszám-számok + CSAK az eltérések (ki nincs bent és miért), nem 1500 sor. **Kész**: `/helyzetkep` (aktív létszám, jelen, eltérések táblázat, függő szabadság). |
| G8 | **Foglaltság-kereső** ✅ | M | „Szabad-e a lőtér 2 hét múlva?" — részleges helyszínnév + dátumtartomány. **Kész**: `/foglaltsag`, `/api/availability` (+ `/locations`), ékezet-érzéketlen, törölt/befejezett nem foglal. |
| G2 | **Esemény-alapú jelenlét-kitöltés** ✅ | M | Egy gyakorlat/behívás beosztott névsorát egy gombbal a napi létszámba („ma gyakorlaton" → Szolgálatban). **Kész**: `/api/attendance/events` + `/fill`, esemény-kitöltő sor a `/letszam` oldalon. |
| G3 | **Behívási készenlét-szűrő** | M | „Ki hívható be most": érvényes alkalmasság + nincs szabadságon + adott képesítés/egység. A B1-hez. |
| G4 | **Proaktív riasztások egy helyen** | M | Lejáró okmány/alkalmasság/szerződés, igazolatlan távollét, rég nem képzett (készenléti rés). |
| G5 | **Tömeges műveletek mindenhol** | S | Kijelölés + csoportos állapot/áthelyezés/értesítés (a létszámban már kész). |
| G6 | **Gyors ugrás / command palette** | S | Bárhonnan keresés személyre vagy funkcióra. |
| G7 | **Értesítési napló (offline-barát)** | M | Behívók/értesítések sablonból, nyomtatható; ki/mikor kapta. |

---

## H. Képzési progresszió és követelmények

| # | Funkció | Méret | Leírás |
|---|---------|-------|--------|
| H1 | **Belépési követelmény / jogosultság** ✅ | M | Eseményhez szükséges képesítések; a rendszer megmondja, ki jogosult, kinek mi hiányzik. Progresszió (alap→haladó→emelt) és feltételek (pl. határszolgálat csak alapkiképzéssel). **Kész**: `/api/prerequisites` (+ `/eligibility`), `EventPrerequisiteModel`, lejárt képesítés nem számít. **Frissítés (06-18)**: a követelményt a művelet-űrlapon állítod; a `/kovetelmenyek` oldal **menüből kivéve** (route megmarad, jogosultság-áttekintő). |
| H5 | **Képesítés-kezelés a Személyek oldalon** ✅ | S | A személy-részlet „Képesítségek" fülén a név beírása → ha nincs ilyen típus, létrejön, és kiadja (dátum alapból ma). Ez az egyetlen hely képesítés-TÍPUS létrehozására is. |
| H2 | **Képesítés auto-jóváírása teljesítéskor** ✅ | M | „Befejezett" státusznál a megjelent résztvevők automatikusan megkapják a képzés/gyakorlat által adott képesítést (idempotens). **Kész**: gyakorlat is kapott `qualification_id`-t; `_grant_event_qualifications` (deps); új művelet létrehozásakor az Operations űrlapon állítható a **„mit ad"** és a **belépési követelmények** (keresővel). A kiképzések korábbi auto-jóváírásánál egy `autoflush=False` miatti latens hibát is javítottunk. |
| H3 | **Képzési sorozat + szintek** ✅ (1. fázis) | M | A művelethez `series` (pl. „7×20") + `level` (Alap/Haladó/Emelt) mező. A Műveletek listája **sorozat-szűrővel** (együtt, de külön), a kártyákon sorozat·szint jelölés; a create-űrlapon beállítható. A szint-feltétel a „mit ad" + „követelmény" láncon (Alap ad képesítést → Haladó azt követeli). **Hátra (2. fázis): haladási mátrix** — ki melyik modult/szintet teljesítette. |
| H4 | **Jogosultság-figyelmeztetés a beosztásnál** ✅ (1. fázis) | M | A művelet (Operations) beosztásánál a nem-jogosultak ⚠ jelölve a listában, és hozzáadáskor figyelmeztetés (hiányzó követelménnyel) — **gát nélkül** (a felhasználó döntése). Hátra (ha kérik): kemény kapu + parancsnoki engedély rögzítése (ki/mikor/indok) a `ParticipantModel`-en. |

---

## Javasolt sorrend (vita tárgya)

Kész: A1 ✅, A2 ✅, G1 ✅, G2 ✅, G8 ✅, felhasználó-törlés ✅, H1 ✅, H2 ✅, H4/1 ✅, H5 ✅ (képesítés-kiadás a Személyeknél), tevékenységnapló szerepkör-szűrés + naplózás ✅, modal dupla-katt védelem ✅, **napló mindenkinek (szerepkör-szűrt) ✅**, **szerkesztő import ✅**. Következő jelöltek:

1. **B1 – Behívó/mozgósítás** (+ G3 készenlét-szűrő) — tartalékos-specifikus.
2. **G4 – Proaktív riasztások egy helyen** — lejáró okmány/alkalmasság/szerződés (a H2-vel a képesítés-lejáratok mostantól valós adatból jönnek).
3. **H4 2. fázis / H3 haladási mátrix** — kemény kapu + parancsnoki engedély, ill. a „7×20" sorozat áttekintő mátrixa.

**UI-elv (felhasználói visszajelzés):** minden dátumválasztó az app saját, témázott `DatePickerInput` komponensét használja (ne natív date input — az nem illeszkedik a main layouthoz), és a kiválasztott dátum hónapján nyílik (`defaultMonth`), nem a mai napon.

> A lista élő dokumentum: új ötlet ide kerüljön. A részletes terv az egyes
> funkciók indításakor készül.
