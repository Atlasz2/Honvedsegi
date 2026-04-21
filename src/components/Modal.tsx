import React, { useEffect, useMemo, useState } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  preventCloseWhenDirty?: boolean;
  isDirty?: boolean;
  doubleOutsideClickWhenDirty?: boolean;
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  preventCloseWhenDirty = false,
  isDirty = false,
  doubleOutsideClickWhenDirty = false,
}: ModalProps) {
  const [outsideClickArmed, setOutsideClickArmed] = useState(false);

  const closeBlockedByDirty = useMemo(
    () => preventCloseWhenDirty && isDirty,
    [preventCloseWhenDirty, isDirty],
  );

  useEffect(() => {
    if (!open || !closeBlockedByDirty || !doubleOutsideClickWhenDirty) {
      setOutsideClickArmed(false);
    }
  }, [open, closeBlockedByDirty, doubleOutsideClickWhenDirty]);

  const requestClose = () => {
    if (closeBlockedByDirty) return;
    onClose();
  };

  const requestOverlayClose = () => {
    if (!closeBlockedByDirty) {
      onClose();
      return;
    }

    if (!doubleOutsideClickWhenDirty) {
      return;
    }

    if (!outsideClickArmed) {
      setOutsideClickArmed(true);
      return;
    }

    setOutsideClickArmed(false);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, closeBlockedByDirty]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 mil-modal-overlay flex items-center justify-center z-[90] p-4" onClick={requestOverlayClose}>
      <div
        className={`mil-modal ${wide ? 'max-w-6xl' : 'max-w-lg'} w-full max-h-[90vh] overflow-y-auto`}
        onClick={e => { e.stopPropagation(); if (outsideClickArmed) setOutsideClickArmed(false); }}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-bold font-rajdhani uppercase tracking-military text-foreground">{title}</h2>
          <button onClick={requestClose} className="text-muted-foreground hover:text-foreground text-xl leading-none ml-4" aria-label="Bezárás">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}