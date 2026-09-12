import { useEffect, useRef } from 'react';
import { changes } from '@/lib/store';

/**
 * Frissítés csak akkor, ha érdemes: az oldal látható, ÉS a szerver szerint
 * változott valami a legutóbbi frissítés óta. A vak 30 másodperces
 * újratöltés helyett egy pár bájtos verzió-kérdés megy, a nagy lista csak
 * változáskor. Az ablakra visszaváltáskor azonnal ellenőriz.
 *
 * Ez a 100 egyidejű felhasználó terhelésének utolsó nagy tétele: a szerver
 * felé az alapjárati forgalom listánként ~200 bájt/30 mp, nem tíz-száz KB.
 */
export function useAutoRefresh(refresh: () => void | Promise<void>, intervalMs = 30000): void {
  const seenVersion = useRef<number | null>(null);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    let alive = true;

    const check = async (force = false) => {
      if (!alive || document.visibilityState !== 'visible') return;
      try {
        const { version } = await changes.version();
        if (!alive) return;
        const changed = seenVersion.current !== null && version !== seenVersion.current;
        seenVersion.current = version;
        if (changed || force) await refreshRef.current();
      } catch {
        // hálózati hiba: a következő körben újra próbáljuk, nem zavarjuk a felhasználót
      }
    };

    void check();
    const iv = setInterval(() => { void check(); }, intervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [intervalMs]);
}
