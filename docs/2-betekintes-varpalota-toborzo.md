# 2. betekintés — Várpalota ügyintézője és a Toborzó iroda (2026-10-22)

Döntésnapló: mit láttunk, mit vetettünk el. Aki (ember vagy AI) a rendszert
bővíti, ezt olvassa el, mielőtt okmány-, leszerelés- vagy behívó-funkcióba kezd.

## Amit láttunk

**Várpalota** — nincs KGIR-gép. Rita (ügyintéző) Wordben/Excelben dolgozik és
egy nagy könyvet vezet. Teendői: 5 nappal a feladat előtt beléptetés a
laktanyába + élelmezési átjelentő (emailben a laktanya illetékesének). Nincs
egyetlen aktuális tábla, amiben mindenki benne van. Szolgálati igazolvány
(rajta rendfokozat, lejárat) és sárga kártya (vezetés, lejárat) kellene.
Leszerelés: időpont-egyeztetés → a leszerelő behozza a felszerelést →
jegyzőkönyv → papír a veszprémi személyügyre és az ellátónak; hiányért a katona fizet.

**Toborzó** — Ricsi KGIR-gépen dolgozik. Ő exportálja az **átadás-elbocsátási
listát**: ez *jelenléti ív jellegű papír* egy gyakorlathoz (ki jelent meg).
Kiküldik Ritának, a katonák aláírják; a szkennelt példány a KGIR-be kerül, az
eredeti Veszprémbe, a gyűjtőbe. **Nem leszerelési lista!** (Ezt egyszer
félreértettük; az ebből épített leszerelés-import törölve lett.) A személyügy a
kampánytervet KGIR-ben készíti, emailben küldi Ricsinek. A behívóparancs
teljesen KGIR.

## Tanulságok (tények, nem döntések)

- Várpalotán a mi rendszer lehet az **egyetlen élő tábla**; a „KGIR a hiteles
  forrás" feltevés ott nem igaz. Az importnak a kézzel vezetett Excelt is jól
  kell kezelnie.
- A legnagyobb fájdalom: nincs egy aktuális, mindenkit tartalmazó tábla.
- A szolgálati igazolvány (rendfokozat + lejárat) és a sárga kártya (lejárat)
  jelenleg sehol nincs nyilvántartva; a `PersonDocumentModel` szabad szöveges.
- Fix határidők: beléptetés és élelmezési átjelentő a feladat előtt 5 nappal.
- A KGIR csak a Toborzóban van; a behívóparancs és a kampányterv ott készül.
- Az átadás-elbocsátási ív jelenléti ív jellegű, Ricsi exportálja a KGIR-ből;
  a rendszerünknek nem kell vele foglalkoznia.

## Döntések

Megépítve (2026-10-22, az „ezek mehetnek" = indulhatnak):

- **Típusos okmányok (I9):** az okmány `name`-je rögzített típus (`constants.DOCUMENT_TYPES`:
  Szolgálati igazolvány, Vezetői engedély/sárga kártya) vagy „Egyéb" szabad szöveg;
  `PersonDocumentModel.rank_on_card` a kártyán lévő rendfokozat. Ha eltér a mostanitól
  (`documents._rank_mismatch`), „új kártya kell" jelzés a személy okmány-fülén, az
  Okmányok oldalon és a Figyelmeztetéseken.
- **Okmány-lista (I10):** `/okmanyok` oldal + `GET /api/documents` és `/export.xlsx`
  (típus / N napon belül lejáró / rendfokozat-eltérés szűrővel) — Rita „aktuális táblázata".
- **Beléptetés és élelmezési átjelentő (I11):** `routers/entry.py`, a Műveletek részletében
  (CampaignPanel) két gomb. Határidő = kezdés − `ENTRY_LEAD_DAYS` (5) nap, a
  Figyelmeztetéseken is (`/api/entry/deadlines`). Csak gyakorlat-típusú műveletre
  (shortcut: az EventModel-alapú csomópontokra nincs).
- **Leszerelési jegyzőkönyv (I12):** Felszerelés oldal → „Leszerelési jegyzőkönyv";
  soronként visszaadva/hiányzik + fizetendő összeg, DOCX két példányban (veszprémi
  személyügy, ellátó). A „Leszerelés lezárása" a nyilvántartásba is beírja: visszavétel,
  a hiány megtérítendőként a katonánál marad, a státusz Leszerelt.

Nem épül:

- **Behívóparancs** (KGIR-ben él) és az **átadás-elbocsátási ív** (Ricsi exportálja a
  KGIR-ből, a rendszernek nem kell vele foglalkoznia).

Nyitott:

- **Az élelmezési átjelentő oszlopai** Rita visszajelzésére várnak; most név/rendfokozat/SZTSZ
  + naponként egy oszlop („x") + összesítő sor.
- Várpalotán nincs KGIR-export: ott Rita kézi Excelje lehet az egyetlen forrás. Az
  importnak ezt is jól kell kezelnie; a forrás-hitelesség kérdését meg kell beszélni.
