import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getErrorMessage, maintenance, type SystemStatus } from '@/lib/store';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${mb.toFixed(1)} MB`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('hu-HU');
}

/**
 * Rendszerállapot és karbantartás — kizárólag a god-szint (dev_master) látja.
 * A hívó szerep ellenőrzése a szülő oldalon történik (isDev); a backend
 * ettől függetlenül semleges 403-cal véd.
 */
export default function SystemStatusPanel() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await maintenance.status());
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const purge = async () => {
    setBusy(true);
    try {
      const { removed } = await maintenance.purgeSessions();
      toast.success(`Lejárt munkamenetek törölve: ${removed}`);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  const rows: [string, string][] = [
    ['Adatbázis mérete', formatBytes(status.database.sizeBytes)],
    ['Utolsó mentés', status.lastBackup
      ? `${formatWhen(status.lastBackup.modifiedAt)} (${status.lastBackup.count} db)`
      : 'nincs mentés'],
    ['Aktív munkamenetek', String(status.sessions.active)],
    ['Lejárt munkamenetek', String(status.sessions.expired)],
    ['Zárolt fiókok', String(status.lockedAccounts)],
    ['Felhasználók', Object.entries(status.users.byRole).map(([r, n]) => `${r}: ${n}`).join(' · ')],
  ];

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-px flex-1 bg-primary/30" />
        <span className="text-xs uppercase tracking-military text-primary font-mono">Rendszerállapot</span>
        <div className="h-px flex-1 bg-primary/30" />
      </div>

      <div className="border border-border" style={{ borderRadius: '2px' }}>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-muted-foreground text-xs uppercase tracking-military w-1/2">{label}</td>
                <td className="px-3 py-2 font-mono text-primary">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 mt-3">
        <button onClick={() => { void refresh(); }} className="btn-mil-secondary text-xs">Frissítés</button>
        <button onClick={() => { void purge(); }} disabled={busy} className="btn-mil-secondary text-xs disabled:opacity-50">
          Lejárt munkamenetek törlése
        </button>
      </div>
    </div>
  );
}
