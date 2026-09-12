import { useState } from 'react';
import { toast } from 'sonner';
import { basicTrainingImport, getErrorMessage, type BasicTrainingImportPreview } from '@/lib/store';

/**
 * A hadműveleti tiszt alapkiképzés-táblája (név/SZTSZ + modulonként egy oszlop
 * a teljesítés dátumával) egy gombbal képesítés-kiadás: a modul-oszlop a
 * képesítés-típus, a cella a megszerzés dátuma. Aki mindet megkapja, az
 * összesítő „Alapkiképzés”-t is.
 */
export default function BasicTrainingImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BasicTrainingImportPreview | null>(null);
  const [createMissing, setCreateMissing] = useState(true);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    try {
      setPreview(await basicTrainingImport.preview(file));
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await basicTrainingImport.confirm(preview.draftId, createMissing);
      const extras = [
        result.summariesGranted ? `${result.summariesGranted} fő megkapta az összesítő Alapkiképzést` : '',
        result.createdModules.length ? `${result.createdModules.length} új modul-típus` : '',
      ].filter(Boolean);
      toast.success(`${result.granted} modul-teljesítés rögzítve${extras.length ? ` — ${extras.join(', ')}` : ''}.`);
      setPreview(null);
      setFile(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 bg-card border border-border p-4" style={{ borderRadius: '2px' }}>
      <h2 className="text-sm uppercase tracking-military text-primary font-mono">Alapkiképzés-tábla importja</h2>
      <p className="text-xs text-muted-foreground mt-1">
        Excel/CSV: az első sorban „Név” és/vagy „SZTSZ”, mellette modulonként egy oszlop; a cellában a teljesítés dátuma (vagy „x”).
        A modul-oszlop neve az „Alapkiképzés” kategóriájú képesítés-típus neve — ha nincs ilyen, létrehozzuk.
      </p>
      <div className="grid gap-3 md:grid-cols-[1fr_auto] mt-4">
        <input
          type="file"
          accept=".xlsx,.xlsm,.csv"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }}
          className="w-full bg-input border border-border px-3 py-2 text-sm file:mr-3 file:rounded-sm file:border file:border-primary/40 file:bg-primary/20 file:px-3 file:py-1.5 file:text-xs file:font-mono file:text-primary hover:file:bg-primary/30"
          style={{ borderRadius: '2px' }}
        />
        <button onClick={() => { void run(); }} disabled={!file || busy} className="btn-mil-primary text-xs">{busy ? 'Elemzés…' : 'Előnézet'}</button>
      </div>

      {preview && (
        <div className="mt-4 space-y-3 text-xs">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Sorok" value={preview.totalRows} />
            <Stat label="Azonosított személy" value={preview.matchedPersons} tone="primary" />
            <Stat label="Új modul-teljesítés" value={preview.newGrants} tone="primary" />
            <Stat label="Már megvolt" value={preview.alreadyHeld} />
          </div>
          <div className="flex flex-wrap gap-2">
            {preview.modules.map((m) => (
              <span key={m.header} className={`px-2 py-0.5 font-mono ${m.known ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`} style={{ borderRadius: '2px' }}>
                {m.header}{m.known ? '' : ' (új)'}
              </span>
            ))}
          </div>
          {preview.unknownModules.length > 0 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
              Az ismeretlen modul-oszlopokból új „Alapkiképzés” képesítés-típus legyen ({preview.unknownModules.length} db) — kikapcsolva ezek az oszlopok kimaradnak
            </label>
          )}
          {preview.unmatched.length > 0 && (
            <div className="border border-warning/40 bg-warning/5 p-2" style={{ borderRadius: '2px' }}>
              <p className="font-mono uppercase tracking-military text-warning">Nem azonosított sorok ({preview.unmatched.length}) — ezek kimaradnak</p>
              <ul className="mt-1 font-mono text-muted-foreground max-h-32 overflow-auto">
                {preview.unmatched.map((u) => <li key={u.line}>{u.line}. sor: {u.name || u.sztsz} — {u.problem}</li>)}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setPreview(null)} className="btn-mil-secondary text-xs">Mégsem</button>
            <button onClick={() => { void confirm(); }} disabled={busy || preview.newGrants === 0} className="btn-mil-primary text-xs">
              {busy ? 'Alkalmazás…' : `Rendben, ${preview.newGrants} teljesítés rögzítése`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'primary' }) {
  return (
    <div className={`border p-3 ${tone === 'primary' ? 'border-primary/20 bg-primary/10' : 'border-border bg-background/60'}`} style={{ borderRadius: '2px' }}>
      <p className={`text-[11px] uppercase tracking-military ${tone === 'primary' ? 'text-primary' : 'text-muted-foreground'}`}>{label}</p>
      <p className={`mt-1 text-2xl font-rajdhani ${tone === 'primary' ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
