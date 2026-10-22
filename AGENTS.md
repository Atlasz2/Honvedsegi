# Útmutató AI-asszisztenseknek (és új fejlesztőknek)

Tartalékos katonai egység ügyintézői munkaszervező rendszere: FastAPI + SQLite
backend (`backend/`), React/Vite frontend (`src/`). Offline intranet, egy központi
gép. **A KGIR-be soha nem írunk vissza**, csak olvasunk belőle (import).

Mielőtt funkcióba kezdesz, olvasd el:

- `docs/funkcio-roadmap.md` — kész és tervezett funkciók (élő lista).
- `docs/2-betekintes-varpalota-toborzo.md` — valós folyamatok és **mit vetettünk el és miért** (mit építettünk: típusos okmányok, beléptetés/átjelentő, leszerelési jegyzőkönyv; mit nem: behívóparancs, átadás-elbocsátási ív).
- `docs/emberi-kerdesek.md` — nyitott, emberi döntésre váró kérdések.
- `docs/uzemeltetesi-kartya.md` — üzemeltetés.

Szabályok: tiszta kód kötelező; adat-titkosítás a legutolsó lépés; ne commitolj
kérés nélkül; tesztek: `cd backend && python -m pytest`.
