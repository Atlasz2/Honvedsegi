import React, { useState, useEffect, useCallback } from 'react';
import { activityLog, getErrorMessage } from '@/lib/store';
import { ActivityLogEntry } from '@/lib/types';
import { toast } from 'sonner';

export default function ActivityLogPage() {
  const [data, setData] = useState<ActivityLogEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      setData(await activityLog.getAll());
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => { void refresh(); }, 30000);
    return () => clearInterval(iv);
  }, [refresh]);

  const actionClass: Record<string, string> = { 'létrehozva': 'badge-ongoing', 'módosítva': 'badge-reserve', 'törölve': 'badge-cancelled' };

  return (
    <div>
      <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military mb-6">Tevékenységnapló</h1>
      <div className="bg-card border border-border overflow-hidden" style={{ borderRadius: '2px' }}>
        <table className="w-full mil-table">
          <thead><tr><th>Időpont</th><th>Felhasználó</th><th>Művelet</th><th>Modul</th><th>Rekord</th></tr></thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground font-mono py-8">Nincs adat</td></tr>}
            {data.map(l => (
              <tr key={l.id}>
                <td className="font-mono text-primary text-xs">{new Date(l.timestamp).toLocaleString('hu-HU')}</td>
                <td className="text-brass">{l.userName}</td>
                <td><span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${actionClass[l.action]}`} style={{ borderRadius: '2px' }}>{l.action}</span></td>
                <td className="text-muted-foreground">{l.module}</td>
                <td>{l.recordName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
