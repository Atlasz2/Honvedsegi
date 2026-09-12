import { useState } from 'react';
import { ClipboardPaste, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { campaign, getErrorMessage, type ApplicantPasteResult } from '@/lib/store';
import Modal from '@/components/Modal';

type Props = {
  source: 'exercise';
  eventId: string;
  eventName: string;
  canEdit: boolean;
  /** A jelentkezők rögzítése után a szülő újratölti a résztvevőket. */
  onChanged: () => Promise<void>;
};

/**
 * Kampányterv-eszközök egy gyakorlathoz: a Messengerből másolt jelentkező-lista
 * beillesztése (SZTSZ vagy név soronként), és a terv exportja Excel/PDF-be.
 * A jogosultság-jelölés a résztvevő-táblában van; ez a panel csak a be- és
 * kimenet.
 */
export default function CampaignPanel({ source, eventId, eventName, canEdit, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApplicantPasteResult | null>(null);

  const close = () => { setOpen(false); setText(''); setResult(null); };

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await campaign.pasteApplicants(source, eventId, text);
      setResult(res);
      await onChanged();
      toast.success(`${res.added.length} jelentkező rögzítve`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const download = async (format: 'xlsx' | 'pdf') => {
    try {
      await (format === 'xlsx' ? campaign.exportXlsx(source, eventId) : campaign.exportPdf(source, eventId));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <button onClick={() => setOpen(true)} className="btn-mil-secondary text-xs flex items-center gap-1.5">
            <ClipboardPaste className="w-3.5 h-3.5" />
            Jelentkezők beillesztése
          </button>
        )}
        <button onClick={() => { void download('xlsx'); }} className="btn-mil-secondary text-xs flex items-center gap-1.5">
          <FileDown className="w-3.5 h-3.5" />
          Kampányterv Excel
        </button>
        <button onClick={() => { void download('pdf'); }} className="btn-mil-secondary text-xs flex items-center gap-1.5">
          <FileDown className="w-3.5 h-3.5" />
          Kampányterv PDF
        </button>
      </div>

      <Modal open={open} onClose={close} title={`Jelentkezők — ${eventName}`}>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Soronként egy jelentkező: SZTSZ vagy név (a Messengerből másolva). Az SZTSZ az elsődleges kulcs,
            a név csak akkor, ha egyértelmű. A rögzítettek „Jelentkezett" állapotot kapnak; a jogosultságot a
            résztvevő-lista jelzi.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={'Kiss Béla\n12345678\nNagy Lajos; HU123456'}
            className="w-full bg-input border border-border px-3 py-2 text-sm font-mono"
            style={{ borderRadius: '2px' }}
          />

          {result && (
            <div className="space-y-2 text-xs">
              <p className="font-mono">
                <span className="text-primary">Rögzítve: {result.added.length}</span>
                {' · '}már szerepelt: {result.alreadyPresent.length}
                {' · '}<span className={result.unmatched.length ? 'text-warning' : ''}>nem található: {result.unmatched.length}</span>
                {' · '}<span className={result.ambiguous.length ? 'text-warning' : ''}>kétértelmű: {result.ambiguous.length}</span>
              </p>
              {result.unmatched.length > 0 && (
                <div className="border border-warning/40 bg-warning/5 p-2" style={{ borderRadius: '2px' }}>
                  <p className="font-mono uppercase tracking-military text-warning">Nem található a nyilvántartásban</p>
                  <ul className="mt-1 font-mono text-muted-foreground">
                    {result.unmatched.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </div>
              )}
              {result.ambiguous.length > 0 && (
                <div className="border border-warning/40 bg-warning/5 p-2" style={{ borderRadius: '2px' }}>
                  <p className="font-mono uppercase tracking-military text-warning">Több találat — add meg az SZTSZ-t</p>
                  <ul className="mt-1 font-mono text-muted-foreground">
                    {result.ambiguous.map((a) => (
                      <li key={a.line}>
                        {a.line}: {a.candidates.map((c) => `${c.name} (${c.sztsz})`).join(', ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={close} className="btn-mil-secondary text-xs">Bezárás</button>
            <button onClick={() => { void submit(); }} disabled={busy || !text.trim()} className="btn-mil-primary text-xs">
              {busy ? 'Feldolgozás...' : 'Rögzítés'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
