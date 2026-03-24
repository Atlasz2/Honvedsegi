import React, { useState, useEffect, useCallback } from 'react';
import { duties as store, personnel as pStore, logAction, getErrorMessage } from '@/lib/store';
import { Duty, Person } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, CalendarIcon, List } from 'lucide-react';
import DatePickerInput from '@/components/DatePickerInput';
import DateTimePickerInput from '@/components/DateTimePickerInput';

const TYPES = ['Őrszolgálat','Ügyeleti szolgálat','Készenléti szolgálat','Rendezvénybiztosítás','Egyéb'];
const STATUSES = ['Tervezett','Teljesített','Lemondva'] as const;
const statusClass: Record<string, string> = { 'Tervezett': 'badge-planned', 'Teljesített': 'badge-completed', 'Lemondva': 'badge-cancelled' };

export default function DutiesPage() {
  const { canEdit, user } = useAuth();
  const [data, setData] = useState<Duty[]>([]);
  const [personnelData, setPersonnelData] = useState<Person[]>([]);
  const [view, setView] = useState<'table' | 'calendar'>('table');
  const [filter, setFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editing, setEditing] = useState<Duty | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ type: TYPES[0], startDate: '', endDate: '', location: '', personId: '', personName: '', notes: '', status: 'Tervezett' as Duty['status'] });
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

  const filtered = data.filter(d => {
    if (filter && d.status !== filter) return false;
    const start = d.startDate.slice(0, 10);
    const end = d.endDate.slice(0, 10);
    if (dateFrom && end < dateFrom) return false;
    if (dateTo && start > dateTo) return false;
    return true;
  });
  const activePpl = personnelData.filter(p => p.status === 'Aktív' || p.status === 'Tartalékos');

  const handleSave = async () => {
    if (!form.startDate || !form.endDate || !form.personId) { toast.error('Kötelező mezők kitöltése szükséges'); return; }
    if (form.endDate < form.startDate) { toast.error('Vége >= Kezdete'); return; }
    const conflicts = data.filter(d => d.id !== editing?.id && d.personId === form.personId && d.status !== 'Lemondva' && d.startDate < form.endDate && d.endDate > form.startDate);
    if (conflicts.length > 0) toast.warning(`Figyelem: ${form.personName} már beosztva ebben az időszakban!`);
    try {
      if (editing) {
        await store.update({ ...editing, ...form });
        await logAction(user!.displayName, user!.username, 'módosítva', 'Szolgálatok', `${form.type} — ${form.personName}`);
      } else {
        await store.add(form);
        await logAction(user!.displayName, user!.username, 'létrehozva', 'Szolgálatok', `${form.type} — ${form.personName}`);
      }
      toast.success('Sikeresen mentve');
      setEditing(null);
      setCreating(false);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const openCreate = () => { setForm({ type: TYPES[0], startDate: '', endDate: '', location: '', personId: '', personName: '', notes: '', status: 'Tervezett' }); setCreating(true); };

  const year = calMonth.getFullYear(), month = calMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calDays = Array.from({ length: 42 }, (_, i) => { const d = i - ((firstDay + 6) % 7) + 1; return d >= 1 && d <= daysInMonth ? d : null; });

  const getDutiesForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return filtered.filter(d => d.startDate.slice(0, 10) <= dateStr && d.endDate.slice(0, 10) >= dateStr);
  };

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
        <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="btn-mil-secondary text-xs">Szűrő törlése</button>
      </div>

      {view === 'table' ? (
        <div className="bg-card border border-border overflow-hidden" style={{ borderRadius: '2px' }}>
          <table className="w-full mil-table">
            <thead><tr><th>Dátum</th><th>Típus</th><th>Helyszín</th><th>Személy</th><th>Státusz</th>{canEdit && <th>Műveletek</th>}</tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground font-mono py-8">Nincs adat</td></tr>}
              {filtered.sort((a, b) => a.startDate.localeCompare(b.startDate)).map(d => (
                <tr key={d.id}>
                  <td className="font-mono text-primary text-xs">{d.startDate.replace('T', ' ')} → {d.endDate.replace('T', ' ')}</td>
                  <td><span className="mono-chip">{d.type}</span></td>
                  <td>{d.location}</td>
                  <td className="text-brass">{d.personName}</td>
                  <td><span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${statusClass[d.status]}`} style={{ borderRadius: '2px' }}>{d.status}</span></td>
                  {canEdit && <td><div className="flex gap-1">
                    <button onClick={() => { setForm({ type: d.type, startDate: d.startDate, endDate: d.endDate, location: d.location, personId: d.personId, personName: d.personName, notes: d.notes, status: d.status }); setEditing(d); }} className="p-1.5 text-primary hover:bg-primary/10"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setDeleteTarget(d)} className="p-1.5 text-destructive hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCalMonth(new Date(year, month - 1))} className="btn-mil-secondary text-xs">◀</button>
            <h2 className="font-rajdhani font-bold text-lg uppercase tracking-military">{calMonth.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long' })}</h2>
            <button onClick={() => setCalMonth(new Date(year, month + 1))} className="btn-mil-secondary text-xs">▶</button>
          </div>
          <div className="grid grid-cols-7 gap-px bg-border">
            {['H','K','Sz','Cs','P','Sz','V'].map(d => <div key={d} className="bg-background p-2 text-center text-xs uppercase tracking-military text-muted-foreground">{d}</div>)}
            {calDays.map((d, i) => (
              <div key={i} className={`bg-card min-h-[80px] p-1 ${d ? '' : 'opacity-30'}`}>
                {d && <>
                  <span className="text-xs font-mono text-muted-foreground">{d}</span>
                  {getDutiesForDay(d).map(duty => (
                    <div key={duty.id} className={`text-[10px] px-1 py-0.5 mt-0.5 truncate ${statusClass[duty.status]} font-mono`} style={{ borderRadius: '2px' }} title={`${duty.type} — ${duty.personName}`}>
                      {duty.personName.split(' ')[1] || duty.personName}
                    </div>
                  ))}
                </>}
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Szolgálat szerkesztése' : 'Új szolgálat'}>
        <div className="space-y-3">
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Típus</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Kezdete *</label><DateTimePickerInput value={form.startDate} onChange={(value) => setForm({ ...form, startDate: value })} /></div>
            <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Vége *</label><DateTimePickerInput value={form.endDate} onChange={(value) => setForm({ ...form, endDate: value })} /></div>
          </div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Helyszín</label><input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} /></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Személy *</label><select value={form.personId} onChange={e => { const p = activePpl.find(x => x.id === e.target.value); setForm({ ...form, personId: e.target.value, personName: p?.name || '' }); }} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}><option value="">Válassz...</option>{activePpl.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Státusz</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Duty['status'] })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Megjegyzés</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm resize-none h-16" style={{ borderRadius: '2px' }} /></div>
          <div className="flex gap-3 justify-end pt-4"><button onClick={() => { setCreating(false); setEditing(null); }} className="btn-mil-secondary text-xs">Mégsem</button><button onClick={() => { void handleSave(); }} className="btn-mil-primary text-xs">Mentés</button></div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) { void (async () => { try { await store.remove(deleteTarget.id); await logAction(user!.displayName, user!.username, 'törölve', 'Szolgálatok', deleteTarget.type); toast.success('Törölve'); setDeleteTarget(null); await refresh(); } catch (error) { toast.error(getErrorMessage(error)); } })(); } }} />
    </div>
  );
}
