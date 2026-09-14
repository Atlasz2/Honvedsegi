# Erőforrás-kalkuláció, optimalizálási lehetőségek, veszélyforrások

*2026-09-14. Mért adatok: a fejlesztői gépen (Ryzen 7 4800H, 32 GB) futó demó-adatbázis (441 fő, ~250 művelet, 18 parancs) és a 60 párhuzamos felhasználós terhelésteszt (`scratchpad/stress.py`: 1980 vegyes kérés, olvasás + írás).*

## 1. Mit csinál a rendszer valójában (mit kell kiszolgálni)

| Tétel | Tervezett méret | Mért / becsült |
|---|---|---|
| Ügyintéző (felhasználó) | ~100, ebből egyszerre dolgozó jellemzően 20–40 | — |
| Állomány | ~2000 fő | 441 fővel 4,3 MB az adatbázis → 2000 fővel, 1 év forgalommal **~30–60 MB** |
| Művelet + szolgálat + esemény / év | ~3 zászlóalj × (napi 2 szolgálat + heti 1–2 gyakorlat) ≈ **2500–3000 rekord/év** | egy rekord résztvevőkkel ~1–2 KB |
| Létszám-rekord | csak az eltérés kerül tárolásra (Jelen = nincs sor): ~5–10%/nap × 1000 aktív ≈ **50–100 sor/nap ≈ 30 000 sor/év** | ~150 B/sor → 5 MB/év |
| Napló (audit) | minden írás egy sor, előtte/utána JSON-nal: **~500–2000 sor/nap** | ~1 KB/sor → **0,5–2 MB/nap, 100–500 MB/év** — ez a leggyorsabban növő tábla |
| Fájlok (műveleti dokumentumok, okmányok) | felhasználófüggő | 1 MB–10 MB/db, a `uploads/` mappában, nem az adatbázisban |
| Egy felhasználó forgalma | oldalváltás: 20–450 KB (gzip előtt), háttérben 30 mp-enként **~200 B** (csak „változott-e?”) | napi ~5–15 MB/fő |

**Mért egyszeri költségek** (egy kérés, üres gépen): a legnagyobb lista (`/api/operations`, 245 művelet) 46 ms SQL + 70 ms JSON; a legtöbb végpont 5–40 ms. A karcsúsítás után a művelet-lista 426 KB → **122 KB** (a teljes beosztás csak a megnyitott művelethez töltődik).

**Mért terhelés**: 60 egyidejű felhasználó, mindegyik 11 kérést lő be egyszerre (ez a valóságban ~150–200 „kattintgató” embernek felel meg): 0 hiba, medián válasz ~1 s, 95% < 4 s, a szerverfolyamat memóriája **~115 MB**. A lassulás oka nem az adatbázis, hanem a Python egyprocesszes CPU-korlátja (GIL): a JSON-előállítás sorban áll.

## 2. Mire van szükség — a szerver

A rendszer **egyetlen Python-folyamat** (uvicorn, 1 worker, 64 szál) + SQLite-fájl + statikus frontend, ugyanabból a folyamatból kiszolgálva. Nincs adatbázis-szerver, nincs cache-szerver, nincs üzenetsor, nincs internet-függés.

| | Minimum (működik) | Ajánlott (kényelmes, 3–5 évre) |
|---|---|---|
| CPU | 2 mag (bármilyen 10 évnél fiatalabb x86) | 4 mag — a párhuzamos PDF/Excel-készítés és az import miatt |
| RAM | 2 GB (OS + 150–300 MB a rendszernek) | 4–8 GB |
| Tárhely | 10 GB SSD | 50–100 GB SSD (napló + feltöltött fájlok + napi mentések 3 évre) |
| Hálózat | 100 Mbit intranet | ugyanaz; a rendszer forgalma néhány Mbit csúcson |
| OS | Windows 10/11 vagy Windows Server (a jelenlegi indító szkriptek), Linux is menne | Windows Server, hogy szolgáltatásként fusson |
| Python | 3.11+ (3.13 tesztelt) | — |

Magyarul: **egy leselejtezett irodai PC vagy egy virtuális gép 2 vCPU / 4 GB RAM bőven elég** 100 ügyintézőre. A jelenlegi tesztgép (laptop) is túlméretezett hozzá.

## 3. Optimalizálási lehetőségek (sorrendben: hatás / munka)

Már megvan: WAL-mód, busy_timeout, gzip, kötegelt résztvevő-betöltés (nincs N+1), lapozott személylista szerver-oldali összesítéssel, változás-alapú frissítés (nem vak 30 mp-es újratöltés), karcsú művelet-lista, atomi létszám-mentés, 64 szál, státusz-szinkron 5 percenként (nem minden kérésnél).

Ha kell még:

1. **Napló-archiválás** (kicsi munka, nagy hatás a tárhelyre): a 12 hónapnál régebbi naplósorok havonta külön SQLite-fájlba / Excelbe, a fő adatbázisból törölve. Ez tartja 100 MB alatt az adatbázist évekig.
2. **Lista-válaszok cache-elése változás-számlálóval** (közepes munka): a szerver a „változott-e?” számlálót már ismeri — a művelet-, esemény-, személylista JSON-ját eltárolhatja és változásig ugyanazt adhatja vissza. A JSON-előállítás (a mért 70 ms) így 0 lesz; 100 felhasználónál ez a legnagyobb CPU-tétel.
3. **Riportok háttérben** (közepes): a nagy PDF/Excel-készítés ne a kérésben fusson, hanem egy háttérszálban, a kész fájl letölthető — a lassú riport nem lassít másokat.
4. **Frontend lapozás a művelet-rácsra szerver-oldalon** (közepes): ma a teljes karcsú listát tölti és a böngésző lapoz; 3000 művelet/év fölött érdemes szerver-oldalra vinni (a Személyeknél már így van).
5. **Több worker — NEM**: az import-tervezetek, a változás-számláló és a státusz-időzítő a folyamaton belül él; több worker esetén ezek szétesnek. Ha valaha kell, előbb ezeket kell közös tárba (SQLite-tábla) tenni. A `start-prod.ps1` ezt most kommentben is rögzíti.
6. **Adatbázis-váltás (PostgreSQL) — NEM most**: SQLite egy gépen, 100 felhasználóval, olvasás-túlsúlyos terheléssel ideális; a váltás csak új üzemeltetési terhet hozna (szolgáltatás, mentés, jelszavak).

## 4. Veszélyforrások és mi véd ellenük

| Veszély | Következmény | Mi véd ma | Mi hiányzik / teendő |
|---|---|---|---|
| **A központi gép leáll** (áram, hardver) | senki nem dolgozik, amíg vissza nem jön | autostart-feladat; a SQLite WAL áramszünetre is konzisztens marad | UPS a gépre; tartalék gép, amire a mappa + adatbázis átmásolható (10 perc) |
| **Lemez megtelik** (napló, feltöltések, mentések) | az írás hibázik → 503/„foglalt” üzenet | 503-as érthető hiba, nem adatvesztés | napló-archiválás (3.1), mentés-rotáció, szabad hely figyelése a Beállításokban |
| **Adatbázis-fájl sérül** | adatvesztés az utolsó mentésig | napi mentés (`backup.py`), WAL | mentés **másik gépre/hálózati mappára** is; a visszaállítás próbája negyedévente; „utolsó mentés kora” kijelzés |
| **Sok egyidejű írás** | „database is locked” | 10 s busy_timeout, atomi upsert, 503 + Retry | a felület automatikus újrapróbálása 503-ra (kicsi munka) |
| **Egy hibás import felülír 2000 rekordot** | rossz állomány-adat | tervezet + különbözet + próbaüzem-PDF, minden változás naplózva, visszaállítható | import előtti automatikus mentés (kicsi munka) |
| **Jogosulatlan hozzáférés az intraneten** | személyes adat kiszivárgása | bejelentkezés, szerep + zászlóalj-hatókör szerveroldalon, jelszó-erősség, session-lejárat, bejelentkezés-korlát | **HTTPS** (önaláírt tanúsítvánnyal is), a gép fizikai védelme, a `prod.env` jelszavak kezelése |
| **Adatbázis-fájl ellopása** (a gépről / mentésről) | teljes állomány kiolvasható | jelszavak scrypt-tel hash-elve | **data-at-rest titkosítás** (döntés: a legvégén) — addig a mentések titkosított/zárt helyen |
| **Fejlesztői fiók (devmaster) élesben** | teljes jog | protected, env-jelszó | élesben erős, egyedi jelszó; ne a demó-jelszavak |
| **Demó-jelszavak (Ficzay1234 stb.) élesben maradnak** | triviális belépés | — | éles telepítéskor a `reseed_demo.py` NEM futtatandó; a fiókokat a Beállításokban kell felvenni erős jelszóval |
| **Windows-frissítés újraindít** | leáll, amíg az autostart vissza nem hozza | autostart | frissítési ablak beállítása (éjszaka) |
| **Böngésző-kompatibilitás** régi gépeken | a felület nem nyílik | modern build (ES2020) | a KGIR-es gépeken Edge/Chrome legyen |
| **Egy fő tudja, hogyan működik** | a fejlesztő nélkül nincs üzemeltetés | README, indító szkriptek | üzemeltetési kártya: indítás, mentés, visszaállítás, jelszó-visszaállítás — 1 oldal |
| **Túl sok napló-sor** (2000/nap) | lassuló Napló oldal | lapozott napló | napló-archiválás (3.1) |

## 5. Amit a fenti alapján javaslok elsőnek

1. Mentés másik helyre + „utolsó mentés kora” kijelzés + import előtti automatikus mentés (adatbiztonság — kicsi munka).
2. Napló-archiválás (tárhely — kicsi munka).
3. HTTPS önaláírt tanúsítvánnyal (a jelszó ne menjen nyílt szövegben az intraneten — közepes).
4. Lista-cache a változás-számlálóval (CPU — közepes, csak ha a 100 felhasználónál tényleg lassul).
5. Egyoldalas üzemeltetési kártya (ember-függőség).
