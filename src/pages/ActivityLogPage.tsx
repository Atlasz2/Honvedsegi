import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight, History, Layers, List, User } from 'lucide-react';
import { activityLog, getErrorMessage } from '@/lib/store';
import { ActivityLogEntry } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import Modal from '@/components/Modal';
import DatePickerInput from '@/components/DatePickerInput';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';

const ACTIONS: ActivityLogEntry['action'][] = ['létrehozva', 'módosítva', 'törölve'];

const ROLE_LABEL: Record<string, string> = {
  reader: 'Olvasó', editor: 'Szerkesztő', admin: 'Admin', fejleszto: 'Alkotó',
};

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
  sztsz: 'SZTSz',
  email: 'E-mail',
  phone: 'Telefon',
  birthDate: 'Születési dátum',
  address: 'Lakcím',
  joinDate: 'Bevonulás',
  notes: 'Megjegyzés',
  maxPersonnel: 'Max létszám',
  description: 'Leírás',
  seriesId: 'Sorozat',
  level: 'Szint',
  subject: 'Tárgy',
  dueDate: 'Határidő',
  issuedDate: 'Kelt',
  number: 'Parancsszám',
  assignee: 'Dolgozik rajta',
  note: 'Megjegyzés',
  content: 'Szöveg',
  contentLength: 'Szöveg hossza',
  signed: 'Aláírva',
  created: 'Létrehozva',
  updated: 'Frissítve',
  skipped: 'Kihagyva',
  reason: 'Indok',
  chapters: 'Fejezetek',
  earnedDate: 'Megszerzés',
  expiryDate: 'Lejárat',
  qualTypeName: 'Képesítés',
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'nincs megadva';
  if (typeof value === 'boolean') return value ? 'igen' : 'nem';
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

/** Mező-szintű változások: módosításnál csak ami tényleg változott. */
function changedFields(payload?: Record<string, unknown> | null): string[] {
  if (!payload) return [];
  const mode = payload.mode as string | undefined;
  const before = (payload.before as Record<string, unknown> | null) ?? {};
  const after = (payload.after as Record<string, unknown> | null) ?? {};
  if (mode === 'create') return summarizeRecord(after);
  if (mode === 'delete') return summarizeRecord(before);
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return keys
    .filter((key) => !SKIP_KEYS.includes(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => `${FIELD_LABELS[key] || key}: ${formatValue(before[key])} → ${formatValue(after[key])}`);
}

function payloadChanges(payload?: Record<string, unknown> | null): string[] {
  const mode = (payload?.mode as string | undefined) ?? '';
  const lines = changedFields(payload);
  if (lines.length === 0) return [];
  if (mode === 'create') return ['Létrehozva az alábbi adatokkal:', ...lines];
  if (mode === 'delete') return ['A törölt rekord adatai:', ...lines];
  return lines;
}

const actionClass: Record<string, string> = { létrehozva: 'badge-ongoing', módosítva: 'badge-reserve', törölve: 'badge-cancelled' };
const actionVerb: Record<ActivityLogEntry['action'], string> = { létrehozva: 'létrehozta', módosítva: 'módosította', törölve: 'törölte' };

const time = (iso: string) => new Date(iso).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
const day = (iso: string) => iso.slice(0, 10);
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
// Alapból az utolsó két hét jön le; a napló idővel tízezres, a szűrés a szerveren van.
const DEFAULT_DAYS = 14;
const FETCH_LIMIT = 2000;
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

// Egy „munkamenet": ugyanaz a felhasználó, egymást követő bejegyzések, ennél
// rövidebb szünetekkel. Így 10 ember 8 órája nem 800 sor, hanem pár tucat blokk.
const SESSION_GAP_MS = 30 * 60 * 1000;

type Session = { key: string; userName: string; userRole: string; start: string; end: string; entries: ActivityLogEntry[]; modules: string[] };

function buildSessions(entries: ActivityLogEntry[]): Session[] {
  // A bejegyzések időben csökkenő sorrendben jönnek; a blokkokat is így tartjuk.
  const sessions: Session[] = [];
  for (const entry of entries) {
    const last = sessions[sessions.length - 1];
    const sameUser = last && last.userName === entry.userName && day(last.end) === day(entry.timestamp);
    const closeEnough = last && new Date(last.end).getTime() - new Date(entry.timestamp).getTime() <= SESSION_GAP_MS;
    if (sameUser && closeEnough) {
      last.entries.push(entry);
      last.end = entry.timestamp;
      if (!last.modules.includes(entry.module)) last.modules.push(entry.module);
    } else {
      sessions.push({ key: `${entry.userName}-${entry.timestamp}`, userName: entry.userName, userRole: entry.userRole ?? '', start: entry.timestamp, end: entry.timestamp, entries: [entry], modules: [entry.module] });
    }
  }
  return sessions;
}

type ViewMode = 'sessions' | 'records' | 'list';

export default function ActivityLogPage() {
  const { canEdit } = useAuth();
  const [data, setData] = useState<ActivityLogEntry[]>([]);
  const [view, setView] = useState<ViewMode>('sessions');
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(DEFAULT_DAYS));
  const [dateTo, setDateTo] = useState('');
  const [facets, setFacets] = useState<{ users: string[]; modules: string[] }>({ users: [], modules: [] });
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ActivityLogEntry | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<ActivityLogEntry | null>(null);

  // A dátum/felhasználó/modul szűrés a szerveren fut; a szabad szöveg itt is szűr
  // (a lekérdezés a rekord nevére megy, a kliens a felhasználóra/modulra is).
  const refresh = useCallback(async () => {
    try {
      setData(await activityLog.getAll({ dateFrom, dateTo, user: userFilter, module: moduleFilter, limit: FETCH_LIMIT }));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [dateFrom, dateTo, userFilter, moduleFilter]);

  useEffect(() => {
    activityLog.facets().then(setFacets).catch(() => setFacets({ users: [], modules: [] }));
  }, []);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => { void refresh(); }, 30000);
    return () => clearInterval(iv);
  }, [refresh]);

  const modules = facets.modules;
  const users = facets.users;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((item) => {
      if (q && ![item.userName, item.module, item.recordName].some((v) => v?.toLowerCase().includes(q))) return false;
      if (actionFilter && item.action !== actionFilter) return false;
      return true;
    });
  }, [data, search, actionFilter]);

  // Nap → munkamenetek
  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of buildSessions(filtered)) {
      const d = day(s.start);
      map.set(d, [...(map.get(d) ?? []), s]);
    }
    return [...map.entries()];
  }, [filtered]);

  // Rekord (modul + név) → változás-szál
  const byRecord = useMemo(() => {
    const map = new Map<string, ActivityLogEntry[]>();
    for (const e of filtered) {
      const key = `${e.module} · ${e.recordName}`;
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()].sort((a, b) => b[1][0].timestamp.localeCompare(a[1][0].timestamp));
  }, [filtered]);

  const toggle = (key: string) => setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const clearFilters = () => { setSearch(''); setModuleFilter(''); setUserFilter(''); setActionFilter(''); setDateFrom(isoDaysAgo(DEFAULT_DAYS)); setDateTo(''); };
  const hasFilter = search || moduleFilter || userFilter || actionFilter || dateFrom !== isoDaysAgo(DEFAULT_DAYS) || dateTo;

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

  /** Egy bejegyzés sora: idő, művelet, mit, és a változás röviden — nem kell megnyitni. */
  const EntryRow = ({ e, showUser }: { e: ActivityLogEntry; showUser: boolean }) => {
    const changes = changedFields(e.payload);
    return (
      <div className="grid grid-cols-[4rem_auto_1fr] gap-x-3 gap-y-0.5 items-start py-1.5 px-3 hover:bg-secondary/40 cursor-pointer border-t border-border/40" onClick={() => setDetail(e)}>
        <span className="font-mono text-xs text-primary pt-0.5">{time(e.timestamp)}</span>
        <span className={`px-2 py-0.5 text-[10px] uppercase tracking-military font-mono ${actionClass[e.action]}`} style={{ borderRadius: '2px' }}>{e.action}</span>
        <div className="min-w-0">
          <p className="text-sm">
            {showUser && <span className="text-brass">{e.userName} </span>}
            {showUser && <span className="text-muted-foreground">{actionVerb[e.action]}: </span>}
            <span className="text-muted-foreground text-xs mr-1">[{e.module}]</span>
            <button onClick={(ev) => { ev.stopPropagation(); setSearch(e.recordName); setView('records'); }} className="font-medium hover:underline text-left" title="Ennek a rekordnak a teljes szála">
              {e.recordName}
            </button>
          </p>
          {changes.length > 0 && (
            <p className="text-xs text-muted-foreground font-mono truncate" title={changes.join('\n')}>
              {changes.slice(0, 2).join(' · ')}{changes.length > 2 ? ` · +${changes.length - 2}` : ''}
            </p>
          )}
        </div>
      </div>
    );
  };

  const GroupHeader = ({ id, title, meta, count }: { id: string; title: React.ReactNode; meta?: React.ReactNode; count: number }) => (
    <button onClick={() => toggle(id)} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-secondary/40">
      {openGroups.has(id) ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      <span className="text-sm flex-1 min-w-0 truncate">{title}</span>
      {meta && <span className="text-xs font-mono text-muted-foreground hidden md:inline">{meta}</span>}
      <span className="text-xs font-mono px-2 py-0.5 bg-primary/15 text-primary" style={{ borderRadius: '2px' }}>{count}</span>
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Tevékenységnapló</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">Ki, mikor, mit — munkamenetekben, rekordonként vagy listában</p>
        </div>
        <div className="flex gap-1">
          {([['sessions', 'Munkamenetek', Layers], ['records', 'Rekord szerint', History], ['list', 'Lista', List]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setView(key)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs uppercase tracking-military font-mono ${view === key ? 'btn-mil-primary' : 'btn-mil-secondary'}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-end">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keresés: rekord neve (pl. Kiss Béla), modul, felhasználó…" className="bg-input border border-border px-3 py-2 text-sm w-80" style={{ borderRadius: '2px' }} />
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="bg-input border border-border px-3 py-2 text-xs" style={{ borderRadius: '2px' }}>
          <option value="">Minden felhasználó</option>
          {users.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
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
        {hasFilter && <button onClick={clearFilters} className="btn-mil-secondary text-xs">Szűrők törlése</button>}
        <span className="text-xs font-mono text-muted-foreground ml-auto">{filtered.length} bejegyzés{data.length >= FETCH_LIMIT ? ` (az első ${FETCH_LIMIT} — szűkítsd a dátumot)` : ''}</span>
      </div>

      {filtered.length === 0 && (
        <div className="bg-card border border-border p-8 text-center text-muted-foreground font-mono text-sm" style={{ borderRadius: '2px' }}>Nincs bejegyzés a szűrésre.</div>
      )}

      {/* Munkamenetek: nap → felhasználó összefüggő munkája */}
      {view === 'sessions' && byDay.map(([d, sessions]) => (
        <div key={d} className="mb-5">
          <h2 className="text-xs font-bold uppercase tracking-military text-primary font-mono mb-2">{dayLabel(d)} <span className="text-muted-foreground">· {sessions.reduce((n, s) => n + s.entries.length, 0)} bejegyzés · {new Set(sessions.map((s) => s.userName)).size} felhasználó</span></h2>
          <div className="bg-card border border-border divide-y divide-border" style={{ borderRadius: '2px' }}>
            {sessions.map((s) => (
              <div key={s.key}>
                <GroupHeader
                  id={s.key}
                  count={s.entries.length}
                  title={<><span className="text-brass font-medium">{s.userName}</span>{s.userRole && <span className="text-muted-foreground text-xs"> · {ROLE_LABEL[s.userRole] ?? s.userRole}</span>}<span className="font-mono text-xs text-muted-foreground"> · {time(s.end)}–{time(s.start)}</span></>}
                  meta={s.modules.join(', ')}
                />
                {openGroups.has(s.key) && s.entries.map((e) => <EntryRow key={e.id} e={e} showUser={false} />)}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Rekord szerint: egy személy / parancs / művelet teljes változás-szála */}
      {view === 'records' && filtered.length > 0 && (
        <div className="bg-card border border-border divide-y divide-border" style={{ borderRadius: '2px' }}>
          {byRecord.map(([key, entries]) => (
            <div key={key}>
              <GroupHeader
                id={`r:${key}`}
                count={entries.length}
                title={<><span className="text-muted-foreground text-xs">[{entries[0].module}] </span><span className="font-medium">{entries[0].recordName}</span></>}
                meta={`utoljára ${new Date(entries[0].timestamp).toLocaleString('hu-HU')} · ${entries[0].userName}`}
              />
              {openGroups.has(`r:${key}`) && entries.map((e) => (
                <div key={e.id} className="grid grid-cols-[9rem_1fr] gap-3 items-start">
                  <span className="font-mono text-xs text-muted-foreground pl-3 pt-2">{day(e.timestamp)}</span>
                  <EntryRow e={e} showUser />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Lista: a klasszikus sorfolyam */}
      {view === 'list' && filtered.length > 0 && (
        <div className="bg-card border border-border" style={{ borderRadius: '2px' }}>
          {filtered.map((e) => (
            <div key={e.id} className="grid grid-cols-[10rem_1fr] items-start">
              <span className="font-mono text-xs text-muted-foreground pl-3 pt-2 flex items-center gap-1"><User className="w-3 h-3" />{day(e.timestamp)}</span>
              <EntryRow e={e} showUser />
            </div>
          ))}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Naplóbejegyzés részletei">
        {detail && (
          <div className="space-y-3 text-sm">
            <div><span className="text-muted-foreground text-xs uppercase tracking-military">Időpont</span><p className="font-mono mt-1">{new Date(detail.timestamp).toLocaleString('hu-HU')}</p></div>
            <div><span className="text-muted-foreground text-xs uppercase tracking-military">Felhasználó</span><p className="mt-1">{detail.userName}{detail.userRole ? ` · ${ROLE_LABEL[detail.userRole] ?? detail.userRole}` : ''}</p></div>
            <div><span className="text-muted-foreground text-xs uppercase tracking-military">Művelet</span><p className="mt-1">{detail.action} · {detail.module}</p></div>
            <div><span className="text-muted-foreground text-xs uppercase tracking-military">Rekord</span><p className="mt-1">{detail.recordName}</p></div>

            {payloadChanges(detail.payload).length > 0 ? (
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-military">Változás</span>
                <div className="mt-1 p-2 bg-input border border-border text-[12px] space-y-1 font-mono" style={{ borderRadius: '2px' }}>
                  {payloadChanges(detail.payload).map((line) => <p key={line}>{line}</p>)}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Ehhez a bejegyzéshez nem áll rendelkezésre mezőszintű változás.</p>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <button onClick={() => { setSearch(detail.recordName); setView('records'); setDetail(null); }} className="btn-mil-secondary text-xs">A rekord teljes szála</button>
              <div className="flex gap-2">
                {canEdit && canRestore(detail) && <button onClick={() => setRestoreTarget(detail)} className="btn-mil-secondary text-xs">Visszaállítás</button>}
                <button onClick={() => setDetail(null)} className="btn-mil-secondary text-xs">Bezárás</button>
              </div>
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
