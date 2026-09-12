import { useEffect, useRef, useState } from 'react';

/**
 * A fejlesztők neve — csak a Beállítások alján, nem minden oldalon. Öt gyors
 * koppintásra egy apró meglepetés; a számláló ref, mert nem vezérel megjelenítést.
 */
export default function DevelopersFooter() {
  const devTapCountRef = useRef(0);
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const tapResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eggHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (tapResetRef.current) clearTimeout(tapResetRef.current);
    if (eggHideRef.current) clearTimeout(eggHideRef.current);
  }, []);

  const handleClick = () => {
    const next = devTapCountRef.current + 1;
    devTapCountRef.current = next;
    if (tapResetRef.current) clearTimeout(tapResetRef.current);
    tapResetRef.current = setTimeout(() => { devTapCountRef.current = 0; }, 3000);
    if (next >= 5) {
      devTapCountRef.current = 0;
      clearTimeout(tapResetRef.current);
      setShowEasterEgg(true);
      if (eggHideRef.current) clearTimeout(eggHideRef.current);
      eggHideRef.current = setTimeout(() => setShowEasterEgg(false), 2600);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="mt-8 w-full text-center text-[10px] tracking-military text-muted-foreground opacity-30 hover:opacity-60 transition-opacity select-none cursor-default"
      >
        Fejlesztők: Kovács Martin · Rédli Máté · Tóth Rafael
      </button>
      {showEasterEgg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] px-4 py-2 bg-card border border-primary text-primary text-xs font-mono shadow-md" style={{ borderRadius: '2px' }}>
          🍓 Málnás édesség unlocked!
        </div>
      )}
    </>
  );
}
