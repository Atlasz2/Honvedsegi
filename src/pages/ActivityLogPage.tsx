import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { activityLog, getErrorMessage } from '@/lib/store';
import { ActivityLogEntry } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import Modal from '@/components/Modal';
import DatePickerInput from '@/components/DatePickerInput';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';

const ACTIONS: ActivityLogEntry['action'][] = ['létrehozva', 'módosítva', 'törölve'];

const FIELD_LABELS: Record<string, string> = {
  name: 'Név',
  personName: 'Személy neve',
  type: 'Típus',
  status: 'Státusz',
  location: 'Helyszín',
  startDate: 'Kezdési idő',
  endDate: 'Befejezési idő',
  organizer: 'Szervező',
  unit: 'Alegység',
  beosztas: 'Beosztás',
  rank: 'Rendfokozat',
  attendance: 'Jelenlét',
  assigned: 'Beosztott személyek',
  qualificationId: 'Kapcsolt képzettség',
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'nincs megadva';
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          const rec = item as Record<string, unknown>;
          return String(rec.personName || rec.name || JSON.stringify(item));
        }
        return String(item);
      })
      .join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const SKIP_KEYS = ['id', 'assigned', 'qualifications'];

function summarizeRecord(record: Record<string, unknown>): string[] {
  return Object.entries(record)
    .filter(([key, val]) => !SKIP_KEYS.includes(key) && val != null && val !== '')
    .map(([key, val]) => `${FIELD_LABELS[key] || key}: ${formatValue(val)}`);
}

function payloadChanges(payload?: Record<string, unknown> | null): string[] {
  if (!payload) return [];
  const mode = payload.mode as string | undefined;
  const before = (payload.before as Record<string, unknown> | null) ?? {};
  const after = (payload.after as Record<string, unknown> | null) ?? {};

  if (mode === 'create') {
    const lines = summarizeRecord(after);
    return lines.length > 0 ? ['Létrehozva az alábbi adatokkal:', ...lines] : [];
  }
  if (mode === 'delete') {
    const lines = summarizeRecord(before);
    return lines.length > 0 ? ['A törölt rekord adatai:', ...lines] : [];
  }

  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return keys
    .filter((key) => !SKIP_KEYS.includes(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => `${FIELD_LABELS[key] || key}: "${formatValue(before[key])}" -> "${formatValue(after[key])}"`);
}

function actionSummary(action: ActivityLogEntry['action']): string {
  if (action === 'létrehozva') return 'Rekord letrehozva';
  if (action === 'módosítva') return 'Rekord modositva';
  return 'Rekord torolve';
}

export default function ActivityLogPage() {
  const { canEdit } = useAuth();
  const [data, setData] = useState<ActivityLogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detail, setDetail] = useState<ActivityLogEntry | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<ActivityLogEntry | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await activityLog.getAll());
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => {
      void refresh();
    }, 30000);
    return () => clearInterval(iv);
  }, [refresh]);

  const actionClass: Record<string, string> = { létrehozva: 'badge-ongoing', módosítva: 'badge-reserve', törölve: 'badge-cancelled' };
  const actionLabel: Record<ActivityLogEntry['action'], string> = {
    létrehozva: 'létrehozta',
    módosítva: 'módosította',
    törölve: 'törölte',
  };

  const modules = useMemo(() => Array.from(new Set(data.map((d) => d.module))).sort((a, b) => a.localeCompare(b, 'hu')), [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((item) => {
      if (q && ![item.userName, item.module, item.recordName].some((v) => v?.toLowerCase().includes(q))) return false;
      if (moduleFilter && item.module !== moduleFilter) return false;
      if (actionFilter && item.action !== actionFilter) return false;
      const day = item.timestamp.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [data, search, moduleFilter, actionFilter, dateFrom, dateTo]);

  const canRestore = (entry: ActivityLogEntry | null) => {
    if (!entry?.payload) return false;
    const mode = (entry.payload as Record<string, unknown>).mode;
    const entity = (entry.payload as Record<string, unknown>).entity;
    return (mode === 'create' || mode === 'update' || mode === 'delete') && typeof entity === 'string';
  };

  const handleRestore = async (target: ActivityLogEntry) => {
    try {
      await activityLog.restore(target.id);
      toast.success('Visszaállítás rögzítve');
      setDetail(null);
      setRestoreTarget(null);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military mb-6">Tevékenységnapló</h1>

      <div className="flex gap-2 mb-4 flex-wrap items-end">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keresés felhasználó/modul/rekord..." className="bg-input border border-border px-3 py-2 text-sm w-72" style={{ borderRadius: '2px' }} />

        <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="bg-input border border-border px-3 py-2 text-xs" style={{ borderRadius: '2px' }}>
          <option value="">Minden modul</option>
          {modules.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="bg-input border border-border px-3 py-2 text-xs" style={{ borderRadius: '2px' }}>
          <option value="">Minden művelet</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>

        <div>
          <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Dátumtól</label>
          <DatePickerInput value={dateFrom} onChange={setDateFrom} className="px-2 py-2 text-xs" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Dátumig</label>
          <DatePickerInput value={dateTo} onChange={setDateTo} className="px-2 py-2 text-xs" />
        </div>

        <button onClick={() => { setSearch(''); setModuleFilter(''); setActionFilter(''); setDateFrom(''); setDateTo(''); }} className="btn-mil-secondary text-xs">Szűrők törlése</button>
      </div>

      <div className="bg-card border border-border overflow-hidden" style={{ borderRadius: '2px' }}>
        <table className="w-full mil-table">
          <thead><tr><th>Időpont</th><th>Felhasználó</th><th>Művelet</th><th>Modul</th><th>Részletek</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground font-mono py-8">Nincs adat</td></tr>}
            {filtered.map((l) => (
              <tr key={l.id} className="cursor-pointer" onClick={() => setDetail(l)}>
                <td className="font-mono text-primary text-xs">{new Date(l.timestamp).toLocaleString('hu-HU')}</td>
                <td className="text-brass">{l.userName}</td>
                <td><span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${actionClass[l.action]}`} style={{ borderRadius: '2px' }}>{l.action}</span></td>
                <td className="text-muted-foreground">{l.module}</td>
                <td>{`${l.userName} ${actionLabel[l.action]}: ${l.recordName}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Naplóbejegyzés részletei">
        {detail && (
          <div className="space-y-3 text-sm">
            <div><span className="text-muted-foreground text-xs uppercase tracking-military">Időpont</span><p className="font-mono mt-1">{new Date(detail.timestamp).toLocaleString('hu-HU')}</p></div>
            <div><span className="text-muted-foreground text-xs uppercase tracking-military">Felhasználó</span><p className="mt-1">{detail.userName}</p></div>
            <div><span className="text-muted-foreground text-xs uppercase tracking-military">Művelet</span><p className="mt-1">{detail.action}</p></div>
            <div><span className="text-muted-foreground text-xs uppercase tracking-military">Modul</span><p className="mt-1">{detail.module}</p></div>
            <div><span className="text-muted-foreground text-xs uppercase tracking-military">Rekord</span><p className="mt-1">{detail.recordName}</p></div>

            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-military">Mi tortent?</span>
              <div className="mt-1 p-2 bg-input border border-border text-[12px]" style={{ borderRadius: '2px' }}>
                <p>{actionSummary(detail.action)}</p>
              </div>
            </div>

            {payloadChanges(detail.payload).length > 0 ? (
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-military">Reszletek</span>
                <div className="mt-1 p-2 bg-input border border-border text-[12px] space-y-1" style={{ borderRadius: '2px' }}>
                  {payloadChanges(detail.payload).map((line) => <p key={line}>{line}</p>)}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Ehhez a bejegyzéshez nem áll rendelkezésre részletes mezőszintű változás.</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              {canEdit && canRestore(detail) && <button onClick={() => setRestoreTarget(detail)} className="btn-mil-secondary text-xs">Visszaállítás</button>}
              <button onClick={() => setDetail(null)} className="btn-mil-secondary text-xs">Bezárás</button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onConfirm={() => { if (restoreTarget) { void handleRestore(restoreTarget); } }}
        message="Biztosan visszaállítod ezt a módosítást?"
      />
    </div>
  );
}
