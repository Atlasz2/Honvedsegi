import React from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  message?: string;
}

export default function ConfirmDialog({ open, onClose, onConfirm, message }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 mil-modal-overlay flex items-center justify-center z-[100]">
      <div className="mil-modal p-6 max-w-sm w-full">
        <p className="text-foreground mb-6">{message || 'Biztosan törlöd?'}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-mil-secondary text-xs">Mégsem</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="btn-mil-danger text-xs">Törlés</button>
        </div>
      </div>
    </div>
  );
}
