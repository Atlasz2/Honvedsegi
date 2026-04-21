import React, { useState } from 'react';
import { bugReports, getErrorMessage } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import Modal from '@/components/Modal';

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('A képernyőkép beolvasása sikertelen'));
    reader.readAsDataURL(file);
  });
}

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [page, setPage] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);

  const submitBug = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error('A cím és a leírás kötelező');
      return;
    }

    try {
      setSubmitting(true);
      const screenshotData = screenshot ? await toDataUrl(screenshot) : undefined;
      await bugReports.create({
        title: title.trim(),
        description: description.trim(),
        page: page.trim(),
        screenshotData,
      });
      toast.success('A hibabejelentés elküldve');
      setOpen(false);
      setTitle('');
      setDescription('');
      setPage('');
      setScreenshot(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Beállítások</h1>
        {isAdmin && (
          <button onClick={() => navigate('/settings/rohaminformatikus')} className="btn-mil-secondary text-xs">
            Rohaminformatikus
          </button>
        )}
      </div>

      <div className="bg-card border border-border p-4" style={{ borderRadius: '2px' }}>
        <h2 className="text-sm uppercase tracking-military text-primary font-mono">Hibabejelentés</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ha hibát találsz, küldd be itt. A súlyosságot az admin később állítja be.
        </p>
        <div className="mt-4">
          <button onClick={() => setOpen(true)} className="btn-mil-primary text-xs">Hibabejelentés küldése</button>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Hibabejelentés">
        <div className="space-y-3">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Rövid cím"
            className="w-full bg-input border border-border px-3 py-2 text-sm"
            style={{ borderRadius: '2px' }}
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={5}
            placeholder="Írd le a hibát és hogyan reprodukálható"
            className="w-full bg-input border border-border px-3 py-2 text-sm"
            style={{ borderRadius: '2px' }}
          />
          <input
            value={page}
            onChange={e => setPage(e.target.value)}
            placeholder="Érintett oldal (opcionális)"
            className="w-full bg-input border border-border px-3 py-2 text-sm"
            style={{ borderRadius: '2px' }}
          />
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Képernyőkép (opcionális)</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={e => setScreenshot(e.target.files?.[0] || null)}
              className="w-full bg-input border border-border px-3 py-2 text-sm"
              style={{ borderRadius: '2px' }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setOpen(false)} className="btn-mil-secondary text-xs">Mégsem</button>
            <button onClick={() => { void submitBug(); }} disabled={submitting} className="btn-mil-primary text-xs">
              {submitting ? 'Küldés...' : 'Küldés'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
