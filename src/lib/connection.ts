/**
 * Kapcsolat-állapot a központi géppel. A `request` jelzi, ha a hálózati hívás
 * el sem jutott a szerverig; a Layout ebből mutat egy sávot, és 5 másodpercenként
 * próbálkozik, amíg vissza nem jön. A hibaüzenetek sorozata helyett egy jelzés.
 */
import { useEffect, useState } from 'react';

type Listener = (online: boolean) => void;

let online = true;
const listeners = new Set<Listener>();

export function isOnline(): boolean {
  return online;
}

export function setOnline(next: boolean): void {
  if (online === next) return;
  online = next;
  listeners.forEach((fn) => fn(next));
}

export function useConnection(): boolean {
  const [state, setState] = useState(online);
  useEffect(() => {
    listeners.add(setState);
    return () => { listeners.delete(setState); };
  }, []);
  return state;
}

/** Igaz, ha a hiba hálózati (a szerver nem elérhető), nem a szerver válasza. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && error.name === 'AbortError');
}

export const OFFLINE_MESSAGE = 'Nincs kapcsolat a központi géppel. Ellenőrizd a hálózatot, vagy szólj az ügyeletesnek.';
