import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Calendar, MapPin, Plus, Search, Trash2, Users, Pencil } from 'lucide-react';
import { events, personnel as pStore, logAction, getErrorMessage } from '@/lib/store';
import type { AppEvent, BasicAssignment, PersonLite } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { rankWeight, shortRank } from '@/lib/rank';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import DatePickerInput from '@/components/DatePickerInput';
import { toast } from 'sonner';

type EventStatus = 'Tervezett' | 'Folyamatban' | 'Befejezett' | 'Törölve';
const STATUSES: EventStatus[] = ['Tervezett', 'Folyamatban', 'Befejezett', 'Törölve'];

const statusClass: Record<EventStatus, string> = {
  Tervezett: 'badge-planned',
  Folyamatban: 'badge-ongoing',
  Befejezett: 'badge-completed',
  Törölve: 'badge-cancelled',
};

const emptyForm: Omit<AppEvent, 'id'> = {
  eventType: 'esemeny',
  name: '',
  type: 'Általános',
  startDate: '',
  endDate: '',
  location: '',
  organizer: '',
  maxPersonnel: 20,
  description: '',
  status: 'Tervezett',
  assigned: [],
};

export default function Events() {
  const location = useLocation();
  const { canEdit, user } = useAuth();
  const [data, setData] = useState<AppEvent[]>([]);
  const [personnelData, setPersonnelData] = useState<PersonLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'Összes' | EventStatus>('Összes');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AppEvent | null>(null);
  const [detail, setDetail] = useState<AppEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppEvent | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addPersonId, setAddPersonId] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const detailRef = useRef<AppEvent | null>(null);
  detailRef.current = detail;

  const refresh = useCallback(async () => {
    try {
      const items = await events.getAll();
      const sorted = [...items].sort((a, b) => a.startDate.localeCompare(b.startDate));
      setData(sorted);
      if (detailRef.current) {
        const updated = sorted.find((x) => x.id === detailRef.current!.id) ?? null;
        setDetail(updated);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => void refresh(), 30000);
    return () => clearInterval(iv);
  }, [refresh]);

  // Az állomány egyszer, könnyű formában (nem a 30 mp-es frissítéssel együtt).
  useEffect(() => {
    pStore.getLite().then(setPersonnelData).catch((error) => toast.error(getErrorMessage(error)));
  }, []);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return data.filter((item) => {
      if (normalized && ![item.name, item.type, item.location, item.organizer, item.description].some((v) => v?.toLowerCase().includes(normalized))) return false;
      if (filter !== 'Összes' && item.status !== filter) return false;
      if (dateFrom && item.endDate.slice(0, 10) < dateFrom) return false;
      if (dateTo && item.startDate.slice(0, 10) > dateTo) return false;
      return true;
    });
  }, [data, search, filter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const statusCounts: Record<EventStatus, number> = { Tervezett: 0, Folyamatban: 0, Befejezett: 0, Törölve: 0 };
  data.forEach((item) => { statusCounts[item.status] += 1; });

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const navState = location.state as { openEventId?: string } | null;
    if (!navState?.openEventId || data.length === 0) return;
    const found = data.find((item) => item.id === navState.openEventId);
    if (found) setDetail(found);
  }, [location.state, data]);

  const activePpl = personnelData
    .filter(p => p.status === 'Aktív' || p.status === 'Tartalékos')
    .sort((a, b) => rankWeight(b.rank) - rankWeight(a.rank) || a.name.localeCompare(b.name, 'hu'));

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Kötelező';
    if (!form.startDate) next.startDate = 'Kötelező';
    if (!form.endDate) next.endDate = 'Kötelező';
    if (form.startDate && form.endDate && form.endDate < form.startDate) next.endDate = 'Vége >= Kezdete';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    const payload = { ...form, name: form.name.trim(), location: form.location.trim(), organizer: form.organizer.trim(), description: form.description.trim() };

    try {
      if (editing) {
        const before = editing;
        const updated = await events.update({ ...editing, ...payload });
        await logAction(user!.displayName, user!.username, 'módosítva', 'Események', updated.name, {
          entity: 'event',
          mode: 'update',
          before,
          after: updated,
        });
      } else {
        const created = await events.add(payload);
        await logAction(user!.displayName, user!.username, 'létrehozva', 'Események', created.name, {
          entity: 'event',
          mode: 'create',
          before: null,
          after: created,
        });
      }
      toast.success('Sikeresen mentve');
      setCreating(false);
      setEditing(null);
      setForm(emptyForm);
      setErrors({});
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDelete = async (target: AppEvent) => {
    try {
      await events.remove(target.id);
      await logAction(user!.displayName, user!.username, 'törölve', 'Események', target.name, {
        entity: 'event',
        mode: 'delete',
        before: target,
        after: null,
      });
      toast.success('Esemény törölve');
      if (detail?.id === target.id) setDetail(null);
      setDeleteTarget(null);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const addPerson = async () => {
    if (!detail || !addPersonId) return;
    const p = activePpl.find(x => x.id === addPersonId);
    if (!p) return;

    const assignment: BasicAssignment = { personId: p.id, personName: p.name, rank: p.rank, rankShort: shortRank(p.rank), sztsz: p.sztsz };
    const before = detail;
    const updated = { ...detail, assigned: [...detail.assigned, assignment] };

    try {
      await events.update(updated);
      await logAction(user!.displayName, user!.username, 'módosítva', 'Események', updated.name, {
        entity: 'event',
        mode: 'update',
        before,
        after: updated,
      });
      setDetail(updated);
      setAddPersonId('');
      setPersonSearch('');
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const removePerson = async (personId: string) => {
    if (!detail) return;
    const before = detail;
    const updated = { ...detail, assigned: detail.assigned.filter(a => a.personId !== personId) };
    try {
      await events.update(updated);
      await logAction(user!.displayName, user!.username, 'módosítva', 'Események', updated.name, {
        entity: 'event',
        mode: 'update',
        before,
        after: updated,
      });
      setDetail(updated);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const formatDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('hu-HU');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Események</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">Naptár, helyszín, létszám egy nézetben</p>
        </div>
        {canEdit && <button onClick={() => { setForm(emptyForm); setErrors({}); setEditing(null); setCreating(true); }} className="btn-mil-primary flex items-center gap-2 text-xs"><Plus className="w-4 h-4" />Új esemény</button>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stats-card"><div className="stats-number">{statusCounts.Tervezett}</div><div className="stats-label">Tervezett</div></div>
        <div className="stats-card"><div className="stats-number">{statusCounts.Folyamatban}</div><div className="stats-label">Folyamatban</div></div>
        <div className="stats-card"><div className="stats-number">{statusCounts.Befejezett}</div><div className="stats-label">Befejezett</div></div>
        <div className="stats-card"><div className="stats-number">{statusCounts.Törölve}</div><div className="stats-label">Törölve</div></div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap items-end">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Keresés név/típus/helyszín..."
            className="w-full bg-input border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
            style={{ borderRadius: '2px' }}
          />
        </div>
        {['Összes', ...STATUSES].map((s) => (
          <button key={s} onClick={() => { setFilter(s as 'Összes' | EventStatus); setPage(1); }} className={`px-3 py-1.5 text-xs uppercase tracking-military font-mono ${filter === s ? 'btn-mil-primary' : 'btn-mil-secondary'}`}>
            {s}
          </button>
        ))}
        <div>
          <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Intervallum eleje</label>
          <DatePickerInput value={dateFrom} onChange={setDateFrom} className="px-2 py-1.5 text-xs" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Intervallum vége</label>
          <DatePickerInput value={dateTo} onChange={setDateTo} className="px-2 py-1.5 text-xs" />
        </div>
        <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }} className="btn-mil-secondary text-xs">Szűrő törlése</button>
      </div>

      {loading ? (
        <div className="text-muted-foreground font-mono py-8">Betöltés...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pagedItems.length === 0 && <div className="col-span-3 text-center text-muted-foreground font-mono py-12">Nincs találat a jelenlegi szűrőkre</div>}
            {pagedItems.map((item) => (
              <div key={item.id} className="bg-card border border-border border-l-2 border-l-primary p-4 cursor-pointer hover:bg-secondary transition-colors" style={{ borderRadius: '2px' }} onClick={() => setDetail(item)}>
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold font-rajdhani text-lg">{item.name}</h3>
                  <span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${statusClass[item.status]}`} style={{ borderRadius: '2px' }}>
                    {item.status === 'Folyamatban' && <span className="pulse-dot" />}
                    {item.status}
                  </span>
                </div>
                <span className="mono-chip text-xs mb-3 inline-block">{item.type}</span>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /><span className="font-mono text-primary text-xs">{formatDate(item.startDate)} → {formatDate(item.endDate)}</span></div>
                  <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" />{item.location || 'Nincs megadva'}</div>
                  <div className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /><span className="font-mono text-primary">{item.assigned.length}</span>/{item.maxPersonnel} fő</div>
                  <div className="text-xs">Szervező: <span className="font-mono text-primary">{item.organizer?.trim() || 'Nincs megadva'}</span></div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-4 text-xs font-mono text-muted-foreground">
            <div>Találat: {filtered.length}</div>
            <div className="flex items-center gap-2">
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="bg-input border border-border px-2 py-1" style={{ borderRadius: '2px' }}>
                {[10, 20].map((size) => <option key={size} value={size}>{size}/oldal</option>)}
              </select>
              <button onClick={() => setPage((prev) => Math.max(1, prev - 1))} className="btn-mil-secondary text-xs" disabled={safePage <= 1}>Előző</button>
              <span>{safePage} / {totalPages}</span>
              <button onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} className="btn-mil-secondary text-xs" disabled={safePage >= totalPages}>Következő</button>
            </div>
          </div>
        </>
      )}

      <Modal open={!!detail && !editing && !creating} onClose={() => setDetail(null)} title={detail?.name || ''} wide>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Típus</span><p className="mono-chip mt-1">{detail.type}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Státusz</span><p className={`inline-flex items-center px-2 py-0.5 text-xs uppercase tracking-military font-mono mt-1 ${statusClass[detail.status]}`} style={{ borderRadius: '2px' }}>{detail.status}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Időszak</span><p className="font-mono text-primary text-sm mt-1">{formatDate(detail.startDate)} → {formatDate(detail.endDate)}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Helyszín</span><p className="mt-1">{detail.location || 'Nincs megadva'}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Szervező</span><p className="mt-1">{detail.organizer?.trim() || 'Nincs megadva'}</p></div>
            </div>
            {detail.description && <p className="text-sm text-muted-foreground">{detail.description}</p>}

            <div className="flex items-center gap-3 pt-2">
              <div className="h-px flex-1 bg-primary/30" />
              <span className="text-xs uppercase tracking-military text-primary font-mono">Résztvevők ({detail.assigned.length}/{detail.maxPersonnel})</span>
              <div className="h-px flex-1 bg-primary/30" />
            </div>

            <table className="w-full mil-table">
              <thead><tr><th>Név</th><th>Rendf. / SZTSZ</th>{canEdit && <th></th>}</tr></thead>
              <tbody>
                {detail.assigned.map(a => (
                  <tr key={a.personId}>
                    <td>{a.personName}</td>
                    <td className="font-mono text-xs text-primary">{a.rankShort || shortRank(a.rank)} / {a.sztsz || '-'}</td>
                    {canEdit && <td><button onClick={() => { void removePerson(a.personId); }} className="text-destructive text-xs hover:underline">Eltávolítás</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>

            {canEdit && (
              <div className="flex gap-2 items-end pt-2">
                <div className="flex-1">
                  <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Személy (keresés: név/rang/sztsz)</label>
                  <input placeholder="Szűrés..." value={personSearch} onChange={e => setPersonSearch(e.target.value)} className="w-full bg-input border border-border px-3 py-1.5 text-sm mb-1" style={{ borderRadius: '2px' }} />
                  <select value={addPersonId} onChange={e => setAddPersonId(e.target.value)} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>
                    <option value="">Válassz...</option>
                    {activePpl.filter(p => !detail.assigned.some(a => a.personId === p.id) && (personSearch === '' || p.name.toLowerCase().includes(personSearch.toLowerCase()) || p.rank.toLowerCase().includes(personSearch.toLowerCase()) || p.sztsz.includes(personSearch))).slice(0, 50).map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.rank}) – {p.sztsz}</option>
                    ))}
                  </select>
                </div>
                <button onClick={() => { void addPerson(); }} className="btn-mil-primary text-xs">Hozzáadás</button>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              {canEdit && <button onClick={() => { setForm({ ...detail }); setEditing(detail); }} className="btn-mil-secondary text-xs flex items-center gap-2"><Pencil className="w-3.5 h-3.5" />Szerkesztés</button>}
              <button onClick={() => setDetail(null)} className="btn-mil-secondary text-xs">Bezárás</button>
            </div>
            {canEdit && (
              <div className="flex justify-end pt-2">
                <button onClick={() => setDeleteTarget(detail)} className="btn-mil-danger text-xs flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" />Törlés</button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        title={editing ? 'Esemény szerkesztése' : 'Új esemény'}
        preventCloseWhenDirty
        isDirty={form.name !== '' || form.location !== '' || form.organizer !== '' || form.description !== '' || form.startDate !== '' || form.endDate !== ''}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Megnevezés *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
            {errors.name && <p className="text-destructive text-xs mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Típus</label>
            <input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Kezdete *</label>
              <DatePickerInput value={form.startDate} onChange={(value) => setForm({ ...form, startDate: value })} />
              {errors.startDate && <p className="text-destructive text-xs mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Vége *</label>
              <DatePickerInput value={form.endDate} onChange={(value) => setForm({ ...form, endDate: value })} />
              {errors.endDate && <p className="text-destructive text-xs mt-1">{errors.endDate}</p>}
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Helyszín</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Szervező</label>
            <input value={form.organizer} onChange={(e) => setForm({ ...form, organizer: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Max létszám</label>
            <input type="number" value={form.maxPersonnel} onChange={(e) => setForm({ ...form, maxPersonnel: Number(e.target.value) || 0 })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Státusz</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EventStatus })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Leírás</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm resize-none h-20" style={{ borderRadius: '2px' }} />
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <button onClick={() => { setCreating(false); setEditing(null); }} className="btn-mil-secondary text-xs">Mégsem</button>
            <button onClick={() => { void handleSave(); }} className="btn-mil-primary text-xs">Mentés</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) { void handleDelete(deleteTarget); } }}
      />
    </div>
  );
}
