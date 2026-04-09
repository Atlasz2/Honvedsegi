import React, { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  preventCloseWhenDirty?: boolean;
  isDirty?: boolean;
}

export default function Modal({ open, onClose, title, children, wide, preventCloseWhenDirty = false, isDirty = false }: ModalProps) {
  const requestClose = () => {
    if (preventCloseWhenDirty && isDirty) return;
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, requestClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 mil-modal-overlay flex items-center justify-center z-[90] p-4" onClick={requestClose}>
      <div
        className={`mil-modal ${wide ? 'max-w-6xl' : 'max-w-lg'} w-full max-h-[90vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
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
