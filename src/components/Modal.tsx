import React from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}

export default function Modal({ open, onClose, title, children, wide }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 mil-modal-overlay flex items-center justify-center z-[90] p-4" onClick={onClose}>
      <div
        className={`mil-modal ${wide ? 'max-w-3xl' : 'max-w-lg'} w-full max-h-[90vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold font-rajdhani uppercase tracking-military text-foreground">{title}</h2>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
