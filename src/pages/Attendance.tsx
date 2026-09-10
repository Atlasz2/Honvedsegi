import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  attendance as store,
  getErrorMessage,
  logAction,
  AttendanceDay,
  AttendanceEntry,
  AttendanceStatus,
  AttendanceEventOption,
} from '@/lib/store';
import { useAuth } from '@/lib/auth';
import DatePickerInput from '@/components/DatePickerInput';
import { toast } from 'sonner';
import { CalendarPlus, Download, Save, Search, Users } from 'lucide-react';

const STATUS_OPTIONS: AttendanceStatus[] = [
  'Jelen', 'Szabadság', 'Betegállomány', 'Vezényelve',
  'Szolgálatban', 'Kiküldetés', 'Igazolt távollét', 'Igazolatlan távollét',
];

const statusColor: Record<AttendanceStatus, string> = {
  'Jelen': 'text-emerald-400',
  'Szabadság': 'text-amber-400',
  'Betegállomány': 'text-red-400',
  'Vezényelve': 'text-sky-400',
  'Szolgálatban': 'text-primary',
  'Kiküldetés': 'text-violet-400',
  'Igazolt távollét': 'text-muted-foreground',
  'Igazolatlan távollét': 'text-destructive',
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Edit = { status: AttendanceStatus; note: string };

export default function Attendance() {
  const { canEdit, user } = useAuth();
  const [date, setDate] = useState(today());
  const [unitFilter, setUnitFilter] = useState('Összes');
  const [search, setSearch] = useState('');
  const [day, setDay] = useState<AttendanceDay | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [includeReserve, setIncludeReserve] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<AttendanceStatus>('Szolgálatban');
  const [events, setEvents] = useState<AttendanceEventOption[]>([]);
  const [selectedEventKey, setSelectedEventKey] = useState('');
  const [fillStatus, setFillStatus] = useState<AttendanceStatus>('Szolgálatban');
  const [filling, setFilling] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [result, eventList] = await Promise.all([
        store.getDay(date, undefined, includeReserve),
        store.eventsOnDay(date),
      ]);
      setDay(result);
      setEvents(eventList);
      setSelectedEventKey(prev => {
        const stillThere = eventList.some(e => `${e.eventType}|${e.eventId}` === prev);
        return stillThere ? prev : (eventList[0] ? `${eventList[0].eventType}|${eventList[0].eventId}` : '');
      });
      setEdits({});
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [date, includeReserve]);

  useEffect(() => { void refresh(); }, [refresh]);

  const effectiveStatus = (entry: AttendanceEntry): AttendanceStatus => edits[entry.personnelId]?.status ?? entry.status;
  const effectiveNote = (entry: AttendanceEntry): string => edits[entry.personnelId]?.note ?? entry.note;

  const setStatus = (entry: AttendanceEntry, status: AttendanceStatus) => {
    setEdits(prev => ({ ...prev, [entry.personnelId]: { status, note: prev[entry.personnelId]?.note ?? entry.note } }));
  };
  const setNote = (entry: AttendanceEntry, note: string) => {
    setEdits(prev => ({ ...prev, [entry.personnelId]: { status: prev[entry.personnelId]?.status ?? entry.status, note } }));
  };

  const unitOptions = useMemo(() => {
    const units = new Set((day?.items ?? []).map(i => i.unit).filter(Boolean));
    return ['Összes', ...Array.from(units).sort((a, b) => a.localeCompare(b, 'hu'))];
  }, [day]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (day?.items ?? []).filter(entry => {
      if (unitFilter !== 'Összes' && entry.unit !== unitFilter) return false;
      if (needle && !entry.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [day, unitFilter, search]);

  // Summary of the currently visible scope, with unsaved edits applied live.
  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of visible) {
      const status = effectiveStatus(entry);
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, edits]);

  const dirtyMarks = useMemo(() => {
    const items: { personnelId: string; status: AttendanceStatus; note?: string }[] = [];
    for (const entry of day?.items ?? []) {
      const edit = edits[entry.personnelId];
      if (!edit) continue;
      if (edit.status !== entry.status || edit.note !== entry.note) {
        items.push({ personnelId: entry.personnelId, status: edit.status, note: edit.note });
      }
    }
    return items;
  }, [day, edits]);

  const save = async () => {
    if (dirtyMarks.length === 0) {
      toast.info('Nincs mentendő változás.');
      return;
    }
    setSaving(true);
    try {
      await store.setDay(date, dirtyMarks);
      await logAction(user!.displayName, user!.username, 'módosítva', 'Létszám', `${date} (${dirtyMarks.length} módosítás)`);
      toast.success(`Mentve (${dirtyMarks.length} módosítás).`);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const doExport = async (format: 'xlsx' | 'pdf') => {
    setExporting(true);
    try {
      if (format === 'xlsx') {
        await store.exportXlsx(date, unitFilter, includeReserve);
      } else {
        await store.exportPdf(date, unitFilter, includeReserve);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const applyBulk = () => {
    if (visible.length === 0) return;
    setEdits(prev => {
      const next = { ...prev };
      for (const entry of visible) {
        next[entry.personnelId] = { status: bulkStatus, note: prev[entry.personnelId]?.note ?? entry.note };
      }
      return next;
    });
    toast.info(`${visible.length} fő beállítva: ${bulkStatus} (mentés szükséges).`);
  };

  const applyEventFill = async () => {
    const event = events.find(e => `${e.eventType}|${e.eventId}` === selectedEventKey);
    if (!event) {
      toast.error('Válassz eseményt.');
      return;
    }
    setFilling(true);
    try {
      await store.fillFromEvent(date, event.eventType, event.eventId, fillStatus);
      await logAction(user!.displayName, user!.username, 'módosítva', 'Létszám', `${date} – ${event.name} → ${fillStatus}`);
      toast.success(`${event.participantCount} résztvevő beállítva: ${fillStatus}.`);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setFilling(false);
    }
  };

  const presentCount = summary['Jelen'] ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-rajdhani tracking-military-wide text-primary flex items-center gap-2">
            <Users className="w-6 h-6" /> Napi létszámjelentés
          </h1>
          <p className="text-xs text-muted-foreground tracking-military">
            Alapból az aktív állomány; a jelenlévők „Jelen". Csak a kivételeket kell jelölni (akár tömegesen).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => doExport('xlsx')}
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-2 bg-secondary text-foreground text-sm font-rajdhani font-medium tracking-wide border border-border disabled:opacity-40 transition-opacity"
            style={{ borderRadius: '2px' }}
          >
            <Download className="w-4 h-4" /> Excel
          </button>
          <button
            onClick={() => doExport('pdf')}
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-2 bg-secondary text-foreground text-sm font-rajdhani font-medium tracking-wide border border-border disabled:opacity-40 transition-opacity"
            style={{ borderRadius: '2px' }}
          >
            <Download className="w-4 h-4" /> PDF
          </button>
          {canEdit && (
            <button
              onClick={save}
              disabled={saving || dirtyMarks.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-rajdhani font-semibold tracking-wide disabled:opacity-40 transition-opacity"
              style={{ borderRadius: '2px' }}
            >
              <Save className="w-4 h-4" /> Mentés{dirtyMarks.length > 0 ? ` (${dirtyMarks.length})` : ''}
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-44">
          <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Dátum</label>
          <DatePickerInput value={date} onChange={setDate} />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Egység</label>
          <select
            value={unitFilter}
            onChange={e => setUnitFilter(e.target.value)}
            className="bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary"
            style={{ borderRadius: '2px' }}
          >
            {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Keresés (név)</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Név…"
              className="w-full bg-input border border-border pl-8 pr-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary"
              style={{ borderRadius: '2px' }}
            />
          </div>
        </div>
      </div>

      {/* Reserve toggle + tömeges állítás */}
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" checked={includeReserve} onChange={e => setIncludeReserve(e.target.checked)} />
          Tartalékosok mutatása
        </label>
        {canEdit && (
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-military text-muted-foreground">Tömeges állítás</span>
            <select
              value={bulkStatus}
              onChange={e => setBulkStatus(e.target.value as AttendanceStatus)}
              className="bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
              style={{ borderRadius: '2px' }}
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              onClick={applyBulk}
              className="px-3 py-1.5 text-sm border border-border text-foreground hover:bg-secondary transition-colors"
              style={{ borderRadius: '2px' }}
            >
              Alkalmaz a listára ({visible.length})
            </button>
          </div>
        )}
      </div>

      {/* Esemény-alapú kitöltés (G2) */}
      {canEdit && events.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-card border border-border px-3 py-2" style={{ borderRadius: '2px' }}>
          <span className="text-xs uppercase tracking-military text-muted-foreground flex items-center gap-1">
            <CalendarPlus className="w-4 h-4" /> Esemény-alapú kitöltés
          </span>
          <select
            value={selectedEventKey}
            onChange={e => setSelectedEventKey(e.target.value)}
            className="bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary max-w-[280px]"
            style={{ borderRadius: '2px' }}
          >
            {events.map(ev => (
              <option key={`${ev.eventType}|${ev.eventId}`} value={`${ev.eventType}|${ev.eventId}`}>
                {ev.name} ({ev.participantCount} fő)
              </option>
            ))}
          </select>
          <span className="text-muted-foreground text-sm">→</span>
          <select
            value={fillStatus}
            onChange={e => setFillStatus(e.target.value as AttendanceStatus)}
            className="bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
            style={{ borderRadius: '2px' }}
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={applyEventFill}
            disabled={filling}
            className="px-3 py-1.5 text-sm border border-border text-foreground hover:bg-secondary disabled:opacity-40 transition-colors"
            style={{ borderRadius: '2px' }}
          >
            Kitöltés
          </button>
        </div>
      )}

      {/* Summary */}
      <div className="flex flex-wrap gap-2">
        <span className="px-3 py-1.5 bg-card border border-border text-sm font-rajdhani" style={{ borderRadius: '2px' }}>
          Létszám: <span className="font-bold text-foreground">{visible.length}</span>
        </span>
        <span className="px-3 py-1.5 bg-card border border-border text-sm font-rajdhani" style={{ borderRadius: '2px' }}>
          Jelen: <span className="font-bold text-emerald-400">{presentCount}</span>
        </span>
        {STATUS_OPTIONS.filter(s => s !== 'Jelen' && (summary[s] ?? 0) > 0).map(s => (
          <span key={s} className="px-3 py-1.5 bg-card border border-border text-sm font-rajdhani" style={{ borderRadius: '2px' }}>
            {s}: <span className={`font-bold ${statusColor[s]}`}>{summary[s]}</span>
          </span>
        ))}
      </div>

      {/* Roster */}
      <div className="border border-border" style={{ borderRadius: '2px' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-military text-muted-foreground border-b border-border">
              <th className="px-3 py-2 font-medium">Név</th>
              <th className="px-3 py-2 font-medium">Rendfokozat</th>
              <th className="px-3 py-2 font-medium">Egység</th>
              <th className="px-3 py-2 font-medium">Állapot</th>
              <th className="px-3 py-2 font-medium">Megjegyzés</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Betöltés…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nincs találat.</td></tr>
            ) : visible.map(entry => (
              <tr key={entry.personnelId} className="border-b border-border/50 hover:bg-secondary/40">
                <td className="px-3 py-1.5 font-rajdhani text-foreground">{entry.name}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{entry.rank}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{entry.unit}</td>
                <td className="px-3 py-1.5">
                  {canEdit ? (
                    <select
                      value={effectiveStatus(entry)}
                      onChange={e => setStatus(entry, e.target.value as AttendanceStatus)}
                      className={`bg-input border border-border px-2 py-1 text-xs focus:outline-none focus:border-primary ${statusColor[effectiveStatus(entry)]}`}
                      style={{ borderRadius: '2px' }}
                    >
                      {STATUS_OPTIONS.map(s => <option key={s} value={s} className="text-foreground">{s}</option>)}
                    </select>
                  ) : (
                    <span className={statusColor[effectiveStatus(entry)]}>{effectiveStatus(entry)}</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {canEdit ? (
                    <input
                      value={effectiveNote(entry)}
                      onChange={e => setNote(entry, e.target.value)}
                      className="w-full bg-input border border-border px-2 py-1 text-xs focus:outline-none focus:border-primary"
                      style={{ borderRadius: '2px' }}
                    />
                  ) : (
                    <span className="text-muted-foreground">{entry.note}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
