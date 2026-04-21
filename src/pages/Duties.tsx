import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { duties as store, personnel as pStore, logAction, getErrorMessage } from '@/lib/store';
import { Duty, Person } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { rankWeight, shortRank } from '@/lib/rank';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, CalendarIcon, List } from 'lucide-react';
import DatePickerInput from '@/components/DatePickerInput';
import DateTimePickerInput from '@/components/DateTimePickerInput';

const TYPES = ['Őrszolgálat', 'Ügyeleti szolgálat', 'Készenléti szolgálat', 'Rendezvénybiztosítás', 'Egyéb'];
const STATUSES = ['Tervezett', 'Teljesített', 'Lemondva'] as const;
const statusClass: Record<string, string> = { Tervezett: 'badge-planned', Teljesített: 'badge-completed', Lemondva: 'badge-cancelled' };

type DutyForm = {
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  assigned: Duty['assigned'];
  notes: string;
  status: Duty['status'];
};

const emptyForm: DutyForm = {
  type: TYPES[0],
  startDate: '',
  endDate: '',
  location: '',
  assigned: [],
  notes: '',
  status: 'Tervezett',
};

export default function DutiesPage() {
  const location = useLocation();
  const { canEdit, user } = useAuth();
  const [data, setData] = useState<Duty[]>([]);
  const [personnelData, setPersonnelData] = useState<Person[]>([]);
  const [view, setView] = useState<'table' | 'calendar'>('table');
  const [filter, setFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dutySearch, setDutySearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [personSearch, setPersonSearch] = useState('');
  const [addPersonId, setAddPersonId] = useState('');
  const [addPersonRole, setAddPersonRole] = useState('szolgálattevő');
  const [editing, setEditing] = useState<Duty | null>(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Duty | null>(null);
  const [form, setForm] = useState<DutyForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Duty | null>(null);
  const [calMonth, setCalMonth] = useState(new Date());

  const refresh = useCallback(async () => {
    try {
      const [nextData, nextPersonnel] = await Promise.all([store.getAll(), pStore.getAll()]);
      setData(nextData);
      setPersonnelData(nextPersonnel);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => { void refresh(); }, 30000);
    return () => clearInterval(iv);
  }, [refresh]);

  useEffect(() => {
    const navState = location.state as { openDutyId?: string } | null;
    if (!navState?.openDutyId || data.length === 0) return;
    const found = data.find(item => item.id === navState.openDutyId);
    if (found) setDetail(found);
  }, [location.state, data]);

  const filtered = data.filter(d => {
    const q = dutySearch.trim().toLowerCase();
    if (q) {
      const people = (d.assigned || []).map(a => a.personName).join(' ').toLowerCase();
      const fallback = (d.personName || '').toLowerCase();
      if (!people.includes(q) && !fallback.includes(q) && !d.type.toLowerCase().includes(q) && !d.location.toLowerCase().includes(q)) return false;
    }
    if (filter && d.status !== filter) return false;
    const start = d.startDate.slice(0, 10);
    const end = d.endDate.slice(0, 10);
    if (dateFrom && end < dateFrom) return false;
    if (dateTo && start > dateTo) return false;
    return true;
  });

  const sortedFiltered = [...filtered].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / pageSize));
  const pagedRows = sortedFiltered.slice((page - 1) * pageSize, page * pageSize);

  const activePpl = personnelData
    .filter(p => p.status === 'Aktív' || p.status === 'Tartalékos')
    .sort((a, b) => rankWeight(b.rank) - rankWeight(a.rank) || a.name.localeCompare(b.name, 'hu'));

  const availableCandidates = activePpl
    .filter(p => !form.assigned.some(a => a.personId === p.id))
    .filter(p => personSearch.trim() === '' || p.name.toLowerCase().includes(personSearch.toLowerCase()) || p.rank.toLowerCase().includes(personSearch.toLowerCase()) || p.sztsz.includes(personSearch));

  const toAssigned = (ids: string[]): Duty['assigned'] => {
    return ids
      .map(id => activePpl.find(p => p.id === id))
      .filter((p): p is Person => !!p)
      .map(p => ({ personId: p.id, personName: p.name, rank: p.rank, rankShort: shortRank(p.rank), sztsz: p.sztsz }));
  };

  const handleSave = async () => {
    if (!form.startDate || !form.endDate || form.assigned.length === 0) {
      toast.error('Kötelező mezők kitöltése szükséges');
      return;
    }
    if (form.endDate < form.startDate) {
      toast.error('Vége >= Kezdete');
      return;
    }

    const assignedIds = new Set(form.assigned.map(a => a.personId));
    const conflicts = data.filter(d =>
      d.id !== editing?.id &&
      d.status !== 'Lemondva' &&
      d.startDate < form.endDate &&
      d.endDate > form.startDate &&
      (d.assigned || []).some(a => assignedIds.has(a.personId)),
    );
    if (conflicts.length > 0) {
      toast.warning('Figyelem: van átfedő beosztás a kiválasztott személyeknél.');
    }

    const payloadBase = {
      type: form.type,
      startDate: form.startDate,
      endDate: form.endDate,
      location: form.location,
      personId: form.assigned[0]?.personId || '',
      personName: form.assigned[0]?.personName || '',
      assigned: form.assigned,
      notes: form.notes,
      status: form.status,
    };

    try {
      if (editing) {
        const before = editing;
        const updated = await store.update({ ...editing, ...payloadBase });
        await logAction(user!.displayName, user!.username, 'módosítva', 'Szolgálatok', `${form.type}`, {
          entity: 'duty',
          mode: 'update',
          before,
          after: updated,
        });
      } else {
        const created = await store.add(payloadBase);
        await logAction(user!.displayName, user!.username, 'létrehozva', 'Szolgálatok', `${form.type}`, {
          entity: 'duty',
          mode: 'create',
          before: null,
          after: created,
        } as unknown as Record<string, unknown>);
      }
      toast.success('Sikeresen mentve');
      setEditing(null);
      setCreating(false);
      setForm(emptyForm);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const openCreate = () => {
    setForm(emptyForm);
    setPersonSearch('');
    setAddPersonId('');
    setAddPersonRole('szolgálattevő');
    setCreating(true);
  };

  const openEdit = (d: Duty) => {
    setForm({
      type: d.type,
      startDate: d.startDate,
      endDate: d.endDate,
      location: d.location,
      assigned: (d.assigned && d.assigned.length > 0) ? d.assigned : (d.personId ? [{ personId: d.personId, personName: d.personName }] : []),
      notes: d.notes,
      status: d.status,
    });
    setPersonSearch('');
    setAddPersonId('');
    setAddPersonRole('szolgálattevő');
    setEditing(d);
  };

  const addPerson = () => {
    if (!addPersonId) return;
    if (form.assigned.some(a => a.personId === addPersonId)) return;

    const mapped = toAssigned([addPersonId])[0];
    if (!mapped) return;

    setForm({
      ...form,
      assigned: [...form.assigned, { ...mapped, role: addPersonRole.trim() || 'szolgálattevő' }],
    });
    setAddPersonId('');
  };

  const removeAssigned = (personId: string) => {
    setForm({ ...form, assigned: form.assigned.filter(a => a.personId !== personId) });
  };

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calDays = Array.from({ length: 42 }, (_, i) => {
    const d = i - ((firstDay + 6) % 7) + 1;
    return d >= 1 && d <= daysInMonth ? d : null;
  });

  const getDutiesForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return filtered.filter(d => d.startDate.slice(0, 10) <= dateStr && d.endDate.slice(0, 10) >= dateStr);
  };

  useEffect(() => {
    setPage(1);
  }, [dutySearch, filter, dateFrom, dateTo, pageSize, view]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Szolgálatok</h1>
        <div className="flex gap-2">
          <button onClick={() => setView('table')} className={`p-2 ${view === 'table' ? 'text-primary' : 'text-muted-foreground'}`} title="Táblázat"><List className="w-4 h-4" /></button>
          <button onClick={() => setView('calendar')} className={`p-2 ${view === 'calendar' ? 'text-primary' : 'text-muted-foreground'}`} title="Naptár"><CalendarIcon className="w-4 h-4" /></button>
          {canEdit && <button onClick={openCreate} className="btn-mil-primary flex items-center gap-2 text-xs"><Plus className="w-4 h-4" />Új szolgálat</button>}
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap items-end">
        <input
          value={dutySearch}
          onChange={e => setDutySearch(e.target.value)}
          placeholder="Keresés személyre / típusra / helyszínre..."
          className="bg-input border border-border px-3 py-2 text-sm w-72"
          style={{ borderRadius: '2px' }}
        />
        {['', ...STATUSES].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 text-xs uppercase tracking-military font-mono ${filter === s ? 'btn-mil-primary' : 'btn-mil-secondary'}`}>{s || 'Összes'}</button>
        ))}
        <div>
          <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Intervallum eleje</label>
          <DatePickerInput value={dateFrom} onChange={setDateFrom} className="px-2 py-1.5 text-xs" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Intervallum vége</label>
          <DatePickerInput value={dateTo} onChange={setDateTo} className="px-2 py-1.5 text-xs" />
        </div>
        <button onClick={() => { setDateFrom(''); setDateTo(''); setDutySearch(''); }} className="btn-mil-secondary text-xs">Szűrő törlése</button>
      </div>

      {view === 'table' ? (
        <div className="space-y-3">
          <div className="bg-card border border-border overflow-hidden" style={{ borderRadius: '2px' }}>
            <table className="w-full mil-table">
              <thead><tr><th>Dátum</th><th>Típus</th><th>Helyszín</th><th>Személyek</th><th>Státusz</th>{canEdit && <th>Műveletek</th>}</tr></thead>
              <tbody>
                {sortedFiltered.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground font-mono py-8">Nincs adat</td></tr>}
                {pagedRows.map(d => (
                  <tr key={d.id} className="cursor-pointer" onClick={() => setDetail(d)}>
                    <td className="font-mono text-primary text-xs">{d.startDate.replace('T', ' ')} → {d.endDate.replace('T', ' ')}</td>
                    <td><span className="mono-chip">{d.type}</span></td>
                    <td>{d.location}</td>
                    <td className="text-brass">{(d.assigned || []).map(a => a.personName).join(', ') || d.personName}</td>
                    <td><span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${statusClass[d.status]}`} style={{ borderRadius: '2px' }}>{d.status}</span></td>
                    {canEdit && <td onClick={e => e.stopPropagation()}><div className="flex gap-1">
                      <button onClick={() => openEdit(d)} className="p-1.5 text-primary hover:bg-primary/10"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeleteTarget(d)} className="p-1.5 text-destructive hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <label className="uppercase tracking-military text-muted-foreground">Oldalméret</label>
              <select
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
                className="bg-input border border-border px-2 py-1.5 text-xs"
                style={{ borderRadius: '2px' }}
              >
                {[10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="btn-mil-secondary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Előző
              </button>
              <span className="text-xs font-mono text-muted-foreground">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="btn-mil-secondary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Következő
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCalMonth(new Date(year, month - 1))} className="btn-mil-secondary text-xs">◀</button>
            <h2 className="font-rajdhani font-bold text-lg uppercase tracking-military">{calMonth.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long' })}</h2>
            <button onClick={() => setCalMonth(new Date(year, month + 1))} className="btn-mil-secondary text-xs">▶</button>
          </div>
          <div className="grid grid-cols-7 gap-px bg-border">
            {['H', 'K', 'Sz', 'Cs', 'P', 'Sz', 'V'].map(d => <div key={d} className="bg-background p-2 text-center text-xs uppercase tracking-military text-muted-foreground">{d}</div>)}
            {calDays.map((d, i) => (
              <div key={i} className={`bg-card min-h-[80px] p-1 ${d ? '' : 'opacity-30'}`}>
                {d && <>
                  <span className="text-xs font-mono text-muted-foreground">{d}</span>
                  {getDutiesForDay(d).map(duty => (
                    <div key={duty.id} className={`text-[10px] px-1 py-0.5 mt-0.5 truncate ${statusClass[duty.status]} font-mono`} style={{ borderRadius: '2px' }} title={`${duty.type} — ${(duty.assigned || []).map(a => a.personName).join(', ')}`}>
                      {(duty.assigned || []).map(a => a.personName.split(' ')[1] || a.personName).join(', ')}
                    </div>
                  ))}
                </>}
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Szolgálat részletei">
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Típus</span><p className="mono-chip mt-1">{detail.type}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Státusz</span><p className={`inline-flex mt-1 px-2 py-0.5 text-xs uppercase tracking-military font-mono ${statusClass[detail.status]}`} style={{ borderRadius: '2px' }}>{detail.status}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Kezdete</span><p className="font-mono text-primary mt-1">{detail.startDate.replace('T', ' ')}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Vége</span><p className="font-mono text-primary mt-1">{detail.endDate.replace('T', ' ')}</p></div>
              <div className="col-span-2"><span className="text-muted-foreground text-xs uppercase tracking-military">Személyek</span><p className="mt-1">{(detail.assigned || []).map(a => a.personName).join(', ') || detail.personName}</p></div>
            </div>
            {detail.notes && <p className="text-muted-foreground">{detail.notes}</p>}
            <div className="flex justify-end gap-2 pt-2">
              {canEdit && <button onClick={() => { openEdit(detail); setDetail(null); }} className="btn-mil-secondary text-xs">Szerkesztés</button>}
              <button onClick={() => setDetail(null)} className="btn-mil-secondary text-xs">Bezárás</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        title={editing ? 'Szolgálat szerkesztése' : 'Új szolgálat'}
        preventCloseWhenDirty
        isDirty={form.startDate !== '' || form.endDate !== '' || form.location !== '' || form.assigned.length > 0 || form.notes !== ''}
        doubleOutsideClickWhenDirty
      >
        <div className="space-y-3">
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Típus</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Kezdete *</label><DateTimePickerInput value={form.startDate} onChange={(value) => setForm({ ...form, startDate: value })} /></div>
            <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Vége *</label><DateTimePickerInput value={form.endDate} onChange={(value) => setForm({ ...form, endDate: value })} /></div>
          </div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Helyszín</label><input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} /></div>

          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Személyek *</label>
            <input
              value={personSearch}
              onChange={e => setPersonSearch(e.target.value)}
              placeholder="Keresés név / rendfokozat / SZTSZ..."
              className="w-full bg-input border border-border px-3 py-2 text-sm mb-2"
              style={{ borderRadius: '2px' }}
            />            <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px_auto] gap-2 items-end">
              <select
                value={addPersonId}
                onChange={e => setAddPersonId(e.target.value)}
                className="w-full bg-input border border-border px-3 py-2 text-sm"
                style={{ borderRadius: '2px' }}
              >
                <option value="">Válassz személyt...</option>
                {availableCandidates.map(p => <option key={p.id} value={p.id}>{p.name} ({p.rank}) - {p.sztsz}</option>)}
              </select>
              <input
                value={addPersonRole}
                onChange={e => setAddPersonRole(e.target.value)}
                placeholder="Szerepkör"
                className="w-full bg-input border border-border px-3 py-2 text-sm"
                style={{ borderRadius: '2px' }}
              />
              <button type="button" onClick={addPerson} className="btn-mil-secondary text-xs h-[38px]">Hozzáadás</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {form.assigned.map(a => (
                <span key={a.personId} className="mono-chip text-xs flex items-center gap-1">
                  {a.personName}{a.role ? ` (${a.role})` : ''}
                  <button type="button" onClick={() => removeAssigned(a.personId)} className="text-destructive">×</button>
                </span>
              ))}
              {form.assigned.length === 0 && <span className="text-xs text-muted-foreground font-mono">Nincs hozzáadott személy</span>}
            </div>
          </div>

          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Státusz</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Duty['status'] })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Megjegyzés</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm resize-null h-16" style={{ borderRadius: '2px' }} /></div>
          <div className="flex gap-3 justify-end pt-4"><button onClick={() => { setCreating(false); setEditing(null); setForm(emptyForm); }} className="btn-mil-secondary text-xs">Mégsem</button><button onClick={() => { void handleSave(); }} className="btn-mil-primary text-xs">Mentés</button></div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            void (async () => {
              try {
                await store.remove(deleteTarget.id);
                await logAction(user!.displayName, user!.username, 'törölve', 'Szolgálatok', deleteTarget.type, {
                  entity: 'duty',
                  mode: 'delete',
                  before: deleteTarget,
                  after: null,
                });
                toast.success('Törölve');
                setDeleteTarget(null);
                await refresh();
              } catch (error) {
                toast.error(getErrorMessage(error));
              }
            })();
          }
        }}
      />
    </div>
  );
}
