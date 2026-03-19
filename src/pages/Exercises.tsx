import React, { useState, useEffect, useCallback } from 'react';
import { exercises as store, personnel as pStore, logAction, getErrorMessage } from '@/lib/store';
import { Exercise, ExerciseAssignment, Person } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { Plus, Users, MapPin, Calendar } from 'lucide-react';
import DatePickerInput from '@/components/DatePickerInput';

const TYPES = ['Lőgyakorlat','Terepgyakorlat','Törzsgyakorlat','Mesterlövész','NBC védelmi','Egyéb'];
const STATUSES = ['Tervezett','Folyamatban','Befejezett','Törölve'] as const;
const statusClass: Record<string, string> = {
  'Tervezett': 'badge-planned', 'Folyamatban': 'badge-ongoing', 'Befejezett': 'badge-completed', 'Törölve': 'badge-cancelled',
};

const emptyExercise = { name: '', type: 'Lőgyakorlat', startDate: '', endDate: '', location: '', maxPersonnel: 20, description: '', status: 'Tervezett' as const, assigned: [] as ExerciseAssignment[] };

export default function Exercises() {
  const { canEdit, user } = useAuth();
  const [data, setData] = useState<Exercise[]>([]);
  const [personnelData, setPersonnelData] = useState<Person[]>([]);
  const [filter, setFilter] = useState('Összes');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Exercise | null>(null);
  const [form, setForm] = useState(emptyExercise);
  const [deleteTarget, setDeleteTarget] = useState<Exercise | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addPersonId, setAddPersonId] = useState('');
  const [addPersonRole, setAddPersonRole] = useState('résztvevő');

  const refresh = useCallback(async () => {
    try {
      const [nextData, nextPersonnel] = await Promise.all([store.getAll(), pStore.getAll()]);
      setData(nextData);
      setPersonnelData(nextPersonnel);
      if (detail) {
        const updatedDetail = nextData.find(item => item.id === detail.id) || null;
        setDetail(updatedDetail);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [detail]);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => { void refresh(); }, 30000);
    return () => clearInterval(iv);
  }, [refresh]);

  const filtered = data.filter(e => {
    if (filter !== 'Összes' && e.status !== filter) return false;
    if (dateFrom && e.endDate < dateFrom) return false;
    if (dateTo && e.startDate > dateTo) return false;
    return true;
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Kötelező';
    if (!form.startDate) e.startDate = 'Kötelező';
    if (!form.endDate) e.endDate = 'Kötelező';
    if (form.startDate && form.endDate && form.endDate < form.startDate) e.endDate = 'Vége >= Kezdete';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      if (editing) {
        await store.update({ ...editing, ...form });
        await logAction(user!.displayName, user!.username, 'módosítva', 'Gyakorlatok', form.name);
      } else {
        await store.add(form);
        await logAction(user!.displayName, user!.username, 'létrehozva', 'Gyakorlatok', form.name);
      }
      toast.success('Sikeresen mentve');
      setEditing(null);
      setCreating(false);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const addPerson = async () => {
    if (!detail || !addPersonId) return;
    const p = personnelData.find(x => x.id === addPersonId);
    if (!p) return;
    const overlapping = data.filter(e => e.id !== detail.id && e.assigned.some(a => a.personId === addPersonId) && e.startDate <= detail.endDate && e.endDate >= detail.startDate && e.status !== 'Törölve' && e.status !== 'Befejezett');
    if (overlapping.length > 0) {
      toast.warning(`Figyelem: ${p.name} már beosztva: ${overlapping.map(o => o.name).join(', ')}`);
    }
    try {
      const updated = { ...detail, assigned: [...detail.assigned, { personId: p.id, personName: p.name, role: addPersonRole }] };
      await store.update(updated);
      setDetail(updated);
      setAddPersonId('');
      setAddPersonRole('résztvevő');
      await refresh();
      toast.success('Személy hozzáadva');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const removePerson = async (personId: string) => {
    if (!detail) return;
    try {
      const updated = { ...detail, assigned: detail.assigned.filter(a => a.personId !== personId) };
      await store.update(updated);
      setDetail(updated);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const openCreate = () => { setForm({ ...emptyExercise, assigned: [] }); setErrors({}); setCreating(true); };
  const openEdit = (e: Exercise) => {
    setForm({ name: e.name, type: e.type, startDate: e.startDate, endDate: e.endDate, location: e.location, maxPersonnel: e.maxPersonnel, description: e.description, status: e.status, assigned: e.assigned });
    setErrors({});
    setDetail(null);
    setEditing(e);
  };

  const activePpl = personnelData.filter(p => p.status === 'Aktív' || p.status === 'Tartalékos');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Gyakorlatok</h1>
        {canEdit && <button onClick={openCreate} className="btn-mil-primary flex items-center gap-2 text-xs"><Plus className="w-4 h-4" />Új gyakorlat</button>}
      </div>

      <div className="flex gap-2 mb-6 flex-wrap items-end">
        {['Összes', ...STATUSES].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 text-xs uppercase tracking-military font-mono ${filter === s ? 'btn-mil-primary' : 'btn-mil-secondary'}`}>
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
        <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="btn-mil-secondary text-xs">Szűrő törlése</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 && <div className="col-span-3 text-center text-muted-foreground font-mono py-12">Nincs adat</div>}
        {filtered.map(e => (
          <div key={e.id} className="bg-card border border-border border-l-2 border-l-primary p-4 cursor-pointer hover:bg-secondary transition-colors"
            style={{ borderRadius: '2px' }} onClick={() => setDetail(e)}>
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-bold font-rajdhani text-lg">{e.name}</h3>
              <span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${statusClass[e.status]}`} style={{ borderRadius: '2px' }}>
                {e.status === 'Folyamatban' && <span className="pulse-dot" />}{e.status}
              </span>
            </div>
            <span className="mono-chip text-xs mb-3 inline-block">{e.type}</span>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /><span className="font-mono text-primary text-xs">{e.startDate} → {e.endDate}</span></div>
              <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" />{e.location}</div>
              <div className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /><span className="font-mono text-primary">{e.assigned.length}</span>/{e.maxPersonnel} fő</div>
            </div>
            <div className="mt-3 w-full bg-border h-1.5" style={{ borderRadius: '2px' }}>
              <div className="bg-primary h-1.5 transition-all" style={{ width: `${Math.min(100, (e.assigned.length / e.maxPersonnel) * 100)}%`, borderRadius: '2px' }} />
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground font-mono mt-4">Frissítve: {new Date().toLocaleTimeString('hu-HU')}</p>

      <Modal open={!!detail && !editing} onClose={() => setDetail(null)} title={detail?.name || ''} wide>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Típus</span><p className="mono-chip mt-1">{detail.type}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Státusz</span>
                <p className={`inline-flex items-center px-2 py-0.5 text-xs uppercase tracking-military font-mono mt-1 ${statusClass[detail.status]}`} style={{ borderRadius: '2px' }}>
                  {detail.status === 'Folyamatban' && <span className="pulse-dot" />}{detail.status}
                </p>
              </div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Időszak</span><p className="font-mono text-primary text-sm mt-1">{detail.startDate} → {detail.endDate}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Helyszín</span><p className="mt-1">{detail.location}</p></div>
            </div>
            {detail.description && <p className="text-sm text-muted-foreground">{detail.description}</p>}

            <div className="flex items-center gap-3 pt-2">
              <div className="h-px flex-1 bg-primary/30" />
              <span className="text-xs uppercase tracking-military text-primary font-mono">Beosztott személyek ({detail.assigned.length}/{detail.maxPersonnel})</span>
              <div className="h-px flex-1 bg-primary/30" />
            </div>

            <table className="w-full mil-table">
              <thead><tr><th>Név</th><th>Beosztás</th>{canEdit && <th></th>}</tr></thead>
              <tbody>
                {detail.assigned.map(a => (
                  <tr key={a.personId}>
                    <td>{a.personName}</td>
                    <td className="text-brass font-mono text-xs">{a.role}</td>
                    {canEdit && <td><button onClick={() => { void removePerson(a.personId); }} className="text-destructive text-xs hover:underline">Eltávolítás</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>

            {canEdit && (
              <div className="flex gap-2 items-end pt-2">
                <div className="flex-1">
                  <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Személy</label>
                  <select value={addPersonId} onChange={e => setAddPersonId(e.target.value)}
                    className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>
                    <option value="">Válassz...</option>
                    {activePpl.filter(p => !detail.assigned.some(a => a.personId === p.id)).map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.rank})</option>
                    ))}
                  </select>
                </div>
                <div className="w-40">
                  <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Beosztás</label>
                  <input value={addPersonRole} onChange={e => setAddPersonRole(e.target.value)} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
                </div>
                <button onClick={() => { void addPerson(); }} className="btn-mil-primary text-xs">Hozzáadás</button>
              </div>
            )}

            {canEdit && (
              <div className="flex gap-2 justify-end pt-4">
                <button onClick={() => { openEdit(detail); }} className="btn-mil-secondary text-xs">Szerkesztés</button>
                <button onClick={() => setDeleteTarget(detail)} className="btn-mil-danger text-xs">Törlés</button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); setDetail(null); }} title={editing ? 'Gyakorlat szerkesztése' : 'Új gyakorlat'}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Megnevezés *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
            {errors.name && <p className="text-destructive text-xs mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Típus</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
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
            <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Max létszám</label>
            <input type="number" value={form.maxPersonnel} onChange={e => setForm({ ...form, maxPersonnel: Number(e.target.value) })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Státusz</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Exercise['status'] })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Leírás</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm resize-none h-20" style={{ borderRadius: '2px' }} />
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <button onClick={() => { setCreating(false); setEditing(null); setDetail(null); }} className="btn-mil-secondary text-xs">Mégsem</button>
            <button onClick={() => { void handleSave(); }} className="btn-mil-primary text-xs">Mentés</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => {
        if (deleteTarget) {
          void (async () => {
            try {
              await store.remove(deleteTarget.id);
              await logAction(user!.displayName, user!.username, 'törölve', 'Gyakorlatok', deleteTarget.name);
              toast.success('Törölve');
              setDetail(null);
              setDeleteTarget(null);
              await refresh();
            } catch (error) {
              toast.error(getErrorMessage(error));
            }
          })();
        }
      }} />
    </div>
  );
}
