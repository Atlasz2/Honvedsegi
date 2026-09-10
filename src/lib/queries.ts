/**
 * React Query hookok.
 *
 * A projekt eddig kézzel, useEffect + fetch párossal töltött minden oldalon:
 * nem volt gyorsítótár, minden navigáció újratöltött mindent, és nem volt
 * megszakítás sem — gyors oldalváltásnál versenyhelyzet állhatott elő.
 *
 * A minta itt indul; a törzsadat a legjobb első jelölt, mert ritkán változik,
 * és több oldal is kéri.
 */
import { useQuery } from '@tanstack/react-query';
import { reference, type ReferenceData } from './store';

/** Egy helyen a kulcsok, hogy ne szóródjanak szét sztringként. */
export const queryKeys = {
  reference: ['reference'] as const,
};

/**
 * Tartalék, ha a törzsadat nem érhető el — így az űrlapok nem üres
 * legördülőkkel jelennek meg. A hivatalos forrás a backend constants.RANKS;
 * ez csak az első betöltés / hiba esetére szolgáló másolat.
 */
const FALLBACK: ReferenceData = {
  units: ['31 TVZ', '83 TVZ', '19 TVZ', 'Ezredtörzs'],
  personStatuses: ['Aktív', 'Tartalékos', 'Szabadságon', 'Leszerelt'],
  ranks: [
    { name: 'Honvéd', short: 'Hv' },
    { name: 'Őrvezető', short: 'Örv' },
    { name: 'Tizedes', short: 'Tiz' },
    { name: 'Szakaszvezető', short: 'Szkv' },
    { name: 'Őrmester', short: 'Őrm' },
    { name: 'Törzsőrmester', short: 'Törm' },
    { name: 'Főtörzsőrmester', short: 'Ftörm' },
    { name: 'Zászlós', short: 'Zls' },
    { name: 'Törzszászlós', short: 'Tzls' },
    { name: 'Főtörzszászlós', short: 'Ftzls' },
    { name: 'Hadnagy', short: 'Hdgy' },
    { name: 'Főhadnagy', short: 'Fhdgy' },
    { name: 'Százados', short: 'Szd' },
    { name: 'Őrnagy', short: 'Őrgy' },
    { name: 'Alezredes', short: 'Alez' },
    { name: 'Ezredes', short: 'Ezds' },
  ],
};

/**
 * Egységek, rendfokozatok és státuszok a backendből.
 *
 * A törzsadat egy telepítésen belül gyakorlatilag állandó, ezért hosszú a
 * frissesség: fölösleges minden oldalváltásnál újrakérni. Hiba esetén a
 * tartalék-lista megy, hogy az űrlapok ne üres legördülőkkel jelenjenek meg.
 */
export function useReferenceData() {
  const query = useQuery({
    queryKey: queryKeys.reference,
    queryFn: () => reference.get(),
    staleTime: 60 * 60 * 1000,   // 1 óra
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  return {
    data: query.data ?? FALLBACK,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
