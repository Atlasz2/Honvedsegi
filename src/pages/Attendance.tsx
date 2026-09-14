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
import { CalendarPlus, ChevronDown, ChevronRight, Download, Lock, LockOpen, Save, Search, Users } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import Modal from '@/components/Modal';

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
  const [quickOpen, setQuickOpen] = useState(false);
  const [onlyExceptions, setOnlyExceptions] = useState(false);

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

  const selectedEvent = events.find(e => `${e.eventType}|${e.eventId}` === selectedEventKey) ?? null;

  // „Kit rakunk szolgálatba?" — a kiválasztott művelet résztvevőire szűrt névsor, itt lent, nem külön ablak.
  const [eventScope, setEventScope] = useState<{ key: string; name: string; ids: Set<string> } | null>(null);
  const showEventPeople = async () => {
    if (!selectedEvent) return;
    try {
      const ids = await store.eventParticipantIds(selectedEvent.eventType, selectedEvent.eventId);
      setEventScope({ key: `${selectedEvent.eventType}|${selectedEvent.eventId}`, name: selectedEvent.name, ids: new Set(ids) });
      setOnlyExceptions(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (day?.items ?? []).filter(entry => {
      if (eventScope && !eventScope.ids.has(entry.personnelId)) return false;
      if (unitFilter !== 'Összes' && entry.unit !== unitFilter) return false;
      if (needle && !entry.name.toLowerCase().includes(needle)) return false;
      if (onlyExceptions && (edits[entry.personnelId]?.status ?? entry.status) === 'Jelen') return false;
      return true;
    });
  }, [day, unitFilter, search, onlyExceptions, edits, eventScope]);

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

  const [confirmClose, setConfirmClose] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const closeDay = async () => {
    setConfirmClose(false);
    try {
      setDay(await store.closeDay(date));
      toast.success('A nap lezárva.');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const reopenDay = async () => {
    if (!reopenReason.trim()) { toast.error('A visszanyitáshoz indoklás kell.'); return; }
    try {
      setDay(await store.reopenDay(date, reopenReason.trim()));
      setReopenOpen(false);
      setReopenReason('');
      toast.success('A nap újra nyitva (naplózva).');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const save = async (reason = '') => {
    if (dirtyMarks.length === 0) {
      toast.info('Nincs mentendő változás.');
      return;
    }
    // Lezárt napot csak indoklással lehet módosítani — a rendszer rákérdez.
    if (day?.closedForMe && !reason) { setOverrideOpen(true); return; }
    setSaving(true);
    try {
      await store.setDay(date, dirtyMarks, reason);
      await logAction(user!.displayName, user!.username, 'módosítva', 'Létszám', `${date} (${dirtyMarks.length} módosítás)`);
      toast.success(`Mentve (${dirtyMarks.length} módosítás).`);
      setOverrideOpen(false);
      setOverrideReason('');
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
    const event = selectedEvent;
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
          {canEdit && !day?.closedForMe && (
            <button
              onClick={() => setConfirmClose(true)}
              disabled={dirtyMarks.length > 0}
              title={dirtyMarks.length > 0 ? 'Előbb mentsd a változásokat' : 'Napi zárás: pecsét a jelentésre, utána csak indoklással módosítható'}
              className="flex items-center gap-2 px-3 py-2 bg-secondary text-foreground text-sm font-rajdhani font-medium tracking-wide border border-border disabled:opacity-40"
              style={{ borderRadius: '2px' }}
            >
              <Lock className="w-4 h-4" /> Napi zárás
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => { void save(); }}
              disabled={saving || dirtyMarks.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-rajdhani font-semibold tracking-wide disabled:opacity-40 transition-opacity"
              style={{ borderRadius: '2px' }}
            >
              <Save className="w-4 h-4" /> Mentés{dirtyMarks.length > 0 ? ` (${dirtyMarks.length})` : ''}
            </button>
          )}
        </div>
      </div>

      {/* Zárás-pecsétek: kié van már lezárva (az ezredtörzs minden zászlóaljét látja) */}
      {(day?.closures.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2">
          {day!.closures.map((c) => (
            <span key={c.unit} className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-xs font-mono" style={{ borderRadius: '2px' }} title={c.note || undefined}>
              <Lock className="w-3.5 h-3.5" />
              {c.unitLabel}: lezárva — {c.closedByName}, {new Date(c.closedAt).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
            </span>
          ))}
          {canEdit && day?.closedForMe && (
            <button onClick={() => setReopenOpen(true)} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono text-muted-foreground hover:text-foreground hover:underline">
              <LockOpen className="w-3.5 h-3.5" /> visszanyitás indoklással
            </button>
          )}
        </div>
      )}

      {/* 1. Mikor és ki: dátum, egység, keresés — egy sorban, a számokkal együtt */}
      <div className="bg-card border border-border p-3" style={{ borderRadius: '2px' }}>
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
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none pb-2">
            <input type="checkbox" checked={includeReserve} onChange={e => setIncludeReserve(e.target.checked)} />
            Tartalékosok is
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none pb-2">
            <input type="checkbox" checked={onlyExceptions} onChange={e => setOnlyExceptions(e.target.checked)} />
            Csak az eltérések
          </label>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="px-3 py-1.5 bg-background border border-border text-sm font-rajdhani" style={{ borderRadius: '2px' }}>
            Létszám: <span className="font-bold text-foreground">{visible.length}</span>
          </span>
          <span className="px-3 py-1.5 bg-background border border-border text-sm font-rajdhani" style={{ borderRadius: '2px' }}>
            Jelen: <span className="font-bold text-emerald-400">{presentCount}</span>
          </span>
          {STATUS_OPTIONS.filter(s => s !== 'Jelen' && (summary[s] ?? 0) > 0).map(s => (
            <span key={s} className="px-3 py-1.5 bg-background border border-border text-sm font-rajdhani" style={{ borderRadius: '2px' }}>
              {s}: <span className={`font-bold ${statusColor[s]}`}>{summary[s]}</span>
            </span>
          ))}
          {dirtyMarks.length > 0 && (
            <span className="px-3 py-1.5 bg-amber-400/10 border border-amber-400/40 text-amber-400 text-sm font-mono" style={{ borderRadius: '2px' }}>
              {dirtyMarks.length} mentetlen változás
            </span>
          )}
        </div>
      </div>

      {/* 2. Gyors kitöltés — mindenki „Jelen”, csak a kivételeket kell jelölni. Két eszköz egy helyen. */}
      {canEdit && (
        <div className="bg-card border border-border" style={{ borderRadius: '2px' }}>
          <button onClick={() => setQuickOpen(v => !v)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs uppercase tracking-military font-mono text-primary hover:bg-secondary/40">
            {quickOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <CalendarPlus className="w-4 h-4" />
            Gyors kitöltés — akik gyakorlaton vannak, vagy egy egész egység ugyanabban az állapotban
          </button>
          {quickOpen && (
            <div className="px-3 pb-3 grid gap-3 md:grid-cols-2">
              <div className="border border-border p-3" style={{ borderRadius: '2px' }}>
                <p className="text-xs uppercase tracking-military text-muted-foreground mb-1">A) Mai művelet résztvevői</p>
                <p className="text-[11px] text-muted-foreground mb-2">A kiválasztott művelet beosztottjai egy gombbal a megadott állapotot kapják (pl. „Szolgálatban”).</p>
                {events.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-mono">Ma nincs művelet beosztott résztvevővel.</p>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={selectedEventKey}
                      onChange={e => setSelectedEventKey(e.target.value)}
                      className="bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary max-w-[240px]"
                      style={{ borderRadius: '2px' }}
                    >
                      {events.map(ev => (
                        <option key={`${ev.eventType}|${ev.eventId}`} value={`${ev.eventType}|${ev.eventId}`}>
                          {ev.recordedCount >= ev.participantCount ? '✓ ' : ev.recordedCount > 0 ? '◐ ' : ''}{ev.name} ({ev.participantCount} fő{ev.recordedCount > 0 ? `, ${ev.recordedCount} már rögzítve` : ''})
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
                    <button onClick={applyEventFill} disabled={filling} className="btn-mil-primary text-xs">Kitöltés</button>
                    <button onClick={() => { void showEventPeople(); }} disabled={!selectedEvent} className="btn-mil-secondary text-xs" title="A névsor lent csak ennek a műveletnek a résztvevőit mutatja">Kik ők? — mutasd lent</button>
                    {selectedEvent && (
                      <p className={`w-full text-[11px] font-mono ${selectedEvent.recordedCount >= selectedEvent.participantCount ? 'text-emerald-400' : selectedEvent.recordedCount > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                        {selectedEvent.recordedCount === 0
                          ? 'Ma még senki nincs rögzítve ebből a műveletből.'
                          : `Ma már rögzítve: ${selectedEvent.recordedCount}/${selectedEvent.participantCount} fő (${Object.entries(selectedEvent.recordedStatuses).map(([st, n]) => `${st}: ${n}`).join(', ')}). A kitöltés ezeket felülírja.`}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="border border-border p-3" style={{ borderRadius: '2px' }}>
                <p className="text-xs uppercase tracking-military text-muted-foreground mb-1">B) A szűrt lista egyben</p>
                <p className="text-[11px] text-muted-foreground mb-2">Szűrd le fent az egységet vagy a nevet, és a listában lévő mindenki ({visible.length} fő) ezt az állapotot kapja. Utána mentés.</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={bulkStatus}
                    onChange={e => setBulkStatus(e.target.value as AttendanceStatus)}
                    className="bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                    style={{ borderRadius: '2px' }}
                  >
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={applyBulk} className="btn-mil-secondary text-xs">Alkalmaz a listára ({visible.length})</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {eventScope && (
        <div className="flex items-center gap-3 px-3 py-2 border border-primary/40 bg-primary/5 text-sm" style={{ borderRadius: '2px' }}>
          <Users className="w-4 h-4 text-primary" />
          <span>Szűrve: <span className="font-medium">{eventScope.name}</span> résztvevői — {visible.length} fő a mai névsorban{eventScope.ids.size > visible.length ? ` (${eventScope.ids.size - visible.length} résztvevő nincs a mai listában, pl. tartalékos)` : ''}.</span>
          <button onClick={() => setEventScope(null)} className="ml-auto text-xs font-mono text-muted-foreground hover:text-foreground hover:underline">szűrő törlése</button>
        </div>
      )}

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
              <tr key={entry.personnelId} className={`border-b border-border/50 hover:bg-secondary/40 ${edits[entry.personnelId] ? 'bg-amber-400/5' : effectiveStatus(entry) !== 'Jelen' ? 'bg-secondary/20' : ''}`}>
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
    <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => { void closeDay(); }}
        confirmLabel="Lezárás"
        tone="primary"
        message={`Lezárod a(z) ${date} napi létszámjelentést? A pecsét a te neveddel és a mostani idővel kerül rá; utána csak indoklással módosítható (naplózva).`}
      />
      <Modal open={overrideOpen} onClose={() => setOverrideOpen(false)} title="Lezárt nap módosítása">
        <div className="space-y-3">
          <p className="text-sm">Ez a nap már le van zárva. A módosításhoz indoklás kell — bekerül a naplóba.</p>
          <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="pl. utólagos orvosi igazolás érkezett" className="w-full bg-input border border-border px-3 py-2 text-sm h-24" style={{ borderRadius: '2px' }} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setOverrideOpen(false)} className="btn-mil-secondary text-xs">Mégsem</button>
            <button onClick={() => { void save(overrideReason.trim()); }} disabled={!overrideReason.trim() || saving} className="btn-mil-primary text-xs">Mentés indoklással</button>
          </div>
        </div>
      </Modal>
      <Modal open={reopenOpen} onClose={() => setReopenOpen(false)} title="Napi zárás visszanyitása">
        <div className="space-y-3">
          <p className="text-sm">A zárás visszavonása naplózódik. Miért?</p>
          <textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} className="w-full bg-input border border-border px-3 py-2 text-sm h-24" style={{ borderRadius: '2px' }} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setReopenOpen(false)} className="btn-mil-secondary text-xs">Mégsem</button>
            <button onClick={() => { void reopenDay(); }} disabled={!reopenReason.trim()} className="btn-mil-primary text-xs">Visszanyitás</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
