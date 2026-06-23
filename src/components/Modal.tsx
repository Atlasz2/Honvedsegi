import React, { useEffect, useRef } from 'react';
import { toast } from 'sonner';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  // Visszafelé kompatibilitásért megtartva; ha true, a védelem kézzel is kérhető.
  preventCloseWhenDirty?: boolean;
  isDirty?: boolean;
}

export default function Modal({ open, onClose, title, children, wide, isDirty = false }: ModalProps) {
  const armedRef = useRef(false);
  // Csak akkor véd, ha a felhasználó TÉNYLEGESEN módosított valamit (nem elég, ha
  // a mezőkben van érték — pl. megtekintésnél). Így csak akkor kell dupla katt,
  // ha elkezdtél kitölteni/szerkeszteni; puszta megtekintést egy katt zár.
  const touchedRef = useRef(false);

  const attemptClose = () => {
    const dirty = isDirty || touchedRef.current;
    if (!dirty || armedRef.current) {
      armedRef.current = false;
      onClose();
      return;
    }
    armedRef.current = true;
    toast.info('Megkezdett szerkesztés — kattints (vagy Esc) még egyszer a bezáráshoz.');
  };

  const attemptCloseRef = useRef(attemptClose);
  attemptCloseRef.current = attemptClose;

  useEffect(() => {
    if (!open) return;
    armedRef.current = false;
    touchedRef.current = false;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') attemptCloseRef.current(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 mil-modal-overlay flex items-center justify-center z-[90] p-4" onClick={attemptClose}>
      <div
        className={`mil-modal ${wide ? 'max-w-6xl' : 'max-w-lg'} w-full max-h-[90vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
        onChangeCapture={() => { touchedRef.current = true; }}
        onInput={() => { touchedRef.current = true; }}
        onMouseDownCapture={() => { armedRef.current = false; }}
        onKeyDownCapture={e => { if (e.key !== 'Escape') armedRef.current = false; }}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-bold font-rajdhani uppercase tracking-military text-foreground">{title}</h2>
          {/* Az X gomb szándékos bezárás — közvetlenül zár. */}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none ml-4" aria-label="Bezárás">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
