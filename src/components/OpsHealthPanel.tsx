import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HardDrive, ShieldCheck, ShieldAlert } from 'lucide-react';
import { opsHealth, getErrorMessage, maintenance, type OpsHealth } from '@/lib/store';

/**
 * Üzemeltetési állapot az adminnak: mikor volt az utolsó jó mentés, van-e
 * tükör másik gépen, mennyi a szabad hely, mekkora a napló és mikor volt
 * archiválva. A „2 napja nincs mentés” itt derül ki, nem a fejlesztőnél.
 */
const gb = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`;
const mb = (b: number) => `${(b / 1024 ** 2).toFixed(1)} MB`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function OpsHealthPanel({ isDev }: { isDev: boolean }) {
  const [health, setHealth] = useState<OpsHealth | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setHealth(await opsHealth()); } catch (error) { toast.error(getErrorMessage(error)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const backupNow = async () => {
    setBusy(true);
    try {
      const r = await maintenance.backupNow();
      toast.success(`Mentés kész: ${r.file}`);
      await load();
    } catch (error) { toast.error(getErrorMessage(error)); } finally { setBusy(false); }
  };
  const archiveNow = async () => {
    setBusy(true);
    try {
      const r = await maintenance.archiveLogs();
      toast.success(`Archiválva: ${r.archived} naplósor`);
      await load();
    } catch (error) { toast.error(getErrorMessage(error)); } finally { setBusy(false); }
  };

  if (!health) return null;
  const b = health.backup;
  const ok = b.warnings.length === 0;
  return (
    <div className={`mt-8 bg-card border p-4 ${ok ? 'border-border' : 'border-amber-500/60'}`} style={{ borderRadius: '2px' }}>
      <div className="flex items-center gap-2">
        {ok ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <ShieldAlert className="w-4 h-4 text-amber-400" />}
        <h2 className="text-sm uppercase tracking-military text-primary font-mono">Mentés és üzemeltetés</h2>
      </div>
      {b.warnings.length > 0 && (
        <ul className="mt-2 text-sm text-amber-400 list-disc pl-5">
          {b.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
      <div className="mt-3 grid gap-3 md:grid-cols-4 text-sm">
        <div className="border border-border p-3" style={{ borderRadius: '2px' }}>
          <p className="text-[11px] uppercase tracking-military text-muted-foreground">Utolsó mentés</p>
          <p className={`font-rajdhani font-bold text-lg ${b.ageHours !== null && b.ageHours > b.staleAfterHours ? 'text-amber-400' : ''}`}>{b.latest ? when(b.latest.createdAt) : 'nincs'}</p>
          <p className="text-[11px] font-mono text-muted-foreground">{b.ageHours !== null ? `${b.ageHours} órája` : ''}{b.latest ? ` · ${mb(b.latest.sizeBytes)} · ${b.count} db` : ''}</p>
        </div>
        <div className="border border-border p-3" style={{ borderRadius: '2px' }}>
          <p className="text-[11px] uppercase tracking-military text-muted-foreground">Tükör (másik gép)</p>
          <p className={`font-rajdhani font-bold text-lg ${b.mirror.configured && b.mirror.reachable ? '' : 'text-amber-400'}`}>{!b.mirror.configured ? 'nincs beállítva' : b.mirror.reachable ? 'elérhető' : 'nem elérhető'}</p>
          <p className="text-[11px] font-mono text-muted-foreground truncate" title={b.mirror.path}>{b.mirror.path || 'BACKEND_BACKUP_MIRROR'}{b.mirror.latest ? ` · ${when(b.mirror.latest)}` : ''}</p>
        </div>
        <div className="border border-border p-3" style={{ borderRadius: '2px' }}>
          <p className="text-[11px] uppercase tracking-military text-muted-foreground flex items-center gap-1"><HardDrive className="w-3 h-3" />Szabad hely</p>
          <p className={`font-rajdhani font-bold text-lg ${b.disk.freeBytes < 2 * 1024 ** 3 ? 'text-destructive' : ''}`}>{gb(b.disk.freeBytes)}</p>
          <p className="text-[11px] font-mono text-muted-foreground">összesen {gb(b.disk.totalBytes)} · adatbázis {mb(b.database.sizeBytes)}{b.database.walBytes ? ` (+${mb(b.database.walBytes)} WAL)` : ''}</p>
        </div>
        <div className="border border-border p-3" style={{ borderRadius: '2px' }}>
          <p className="text-[11px] uppercase tracking-military text-muted-foreground">Napló</p>
          <p className="font-rajdhani font-bold text-lg">{health.archive.logRows.toLocaleString('hu-HU')} sor</p>
          <p className="text-[11px] font-mono text-muted-foreground">archiválva: {health.archive.lastRun ?? 'még nem'} · {health.archive.archiveFiles.length} fájl · {health.archive.keepMonths} hónap marad</p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">Az import elfogadása előtt a rendszer automatikusan ment. A napló 12 hónapnál régebbi sorai 30 naponta külön fájlba kerülnek (data/archive).</p>
      {isDev && (
        <div className="flex gap-2 mt-3">
          <button onClick={() => { void backupNow(); }} disabled={busy} className="btn-mil-primary text-xs">Mentés most</button>
          <button onClick={() => { void archiveNow(); }} disabled={busy} className="btn-mil-secondary text-xs">Napló-archiválás most</button>
        </div>
      )}
    </div>
  );
}
