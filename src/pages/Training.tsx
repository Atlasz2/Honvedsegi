import React, { useState, useEffect, useCallback } from 'react';
import { trainings as store, personnel as pStore, logAction, getErrorMessage } from '@/lib/store';
import { Training, TrainingAssignment, Person } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import DatePickerInput from '@/components/DatePickerInput';

const TYPES = ['Alapkiképzés','Szakmai kiképzés','Parancsnoki tanfolyam','Elsősegély','Lövészeti','Egyéb'];
const STATUSES = ['Tervezett','Folyamatban','Befejezett'] as const;
const ATTENDANCE = ['Tervezett','Megjelent','Hiányzott','Beteg'] as const;
const statusClass: Record<string, string> = { 'Tervezett': 'badge-planned', 'Folyamatban': 'badge-ongoing', 'Befejezett': 'badge-completed' };

export default function TrainingPage() {
  const { canEdit, user } = useAuth();
  const [data, setData] = useState<Training[]>([]);
  const [personnelData, setPersonnelData] = useState<Person[]>([]);
  const [filter, setFilter] = useState({ type: '', status: '' });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editing, setEditing] = useState<Training | null>(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Training | null>(null);
  const [form, setForm] = useState({ name: '', type: TYPES[0], startDate: '', endDate: '', location: '', organizer: '', maxPersonnel: 20, description: '', status: 'Tervezett' as Training['status'], assigned: [] as TrainingAssignment[] });
  const [deleteTarget, setDeleteTarget] = useState<Training | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addPersonId, setAddPersonId] = useState('');

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

  const filtered = data.filter(t => {
    if (filter.type && t.type !== filter.type) return false;
    if (filter.status && t.status !== filter.status) return false;
    if (dateFrom && t.endDate < dateFrom) return false;
    if (dateTo && t.startDate > dateTo) return false;
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
        await logAction(user!.displayName, user!.username, 'módosítva', 'Kiképzések', form.name);
      } else {
        await store.add(form);
        await logAction(user!.displayName, user!.username, 'létrehozva', 'Kiképzések', form.name);
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
    try {
      const updated = { ...detail, assigned: [...detail.assigned, { personId: p.id, personName: p.name, attendance: 'Tervezett' as const }] };
      await store.update(updated);
      setDetail(updated);
      setAddPersonId('');
      await refresh();
      toast.success('Személy hozzáadva');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const updateAttendance = async (personId: string, att: string) => {
    if (!detail) return;
    try {
      const updated = { ...detail, assigned: detail.assigned.map(a => a.personId === personId ? { ...a, attendance: att as TrainingAssignment['attendance'] } : a) };
      await store.update(updated);
      setDetail(updated);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const activePpl = personnelData.filter(p => p.status === 'Aktív' || p.status === 'Tartalékos');

  const openCreate = () => { setForm({ name: '', type: TYPES[0], startDate: '', endDate: '', location: '', organizer: '', maxPersonnel: 20, description: '', status: 'Tervezett', assigned: [] }); setErrors({}); setCreating(true); };
  const openEdit = (t: Training) => { setForm({ ...t }); setErrors({}); setDetail(null); setEditing(t); };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Kiképzések</h1>
        {canEdit && <button onClick={openCreate} className="btn-mil-primary flex items-center gap-2 text-xs"><Plus className="w-4 h-4" />Új kiképzés</button>}
      </div>

      <div className="flex gap-2 mb-6 flex-wrap items-end">
        <select value={filter.type} onChange={e => setFilter({ ...filter, type: e.target.value })} className="bg-input border border-border px-3 py-1.5 text-xs uppercase" style={{ borderRadius: '2px' }}>
          <option value="">Minden típus</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {['', ...STATUSES].map(s => (
          <button key={s} onClick={() => setFilter({ ...filter, status: s })} className={`px-3 py-1.5 text-xs uppercase tracking-military font-mono ${filter.status === s ? 'btn-mil-primary' : 'btn-mil-secondary'}`}>
            {s || 'Összes'}
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

      <div className="bg-card border border-border overflow-hidden" style={{ borderRadius: '2px' }}>
        <table className="w-full mil-table">
          <thead><tr><th>Megnevezés</th><th>Típus</th><th>Kezdete</th><th>Vége</th><th>Helyszín</th><th>Résztvevők</th><th>Státusz</th><th>Műveletek</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground font-mono py-8">Nincs adat</td></tr>}
            {filtered.map(t => (
              <tr key={t.id} className="cursor-pointer" onClick={() => setDetail(t)}>
                <td className="font-semibold">{t.name}</td>
                <td><span className="mono-chip">{t.type}</span></td>
                <td className="font-mono text-primary text-xs">{t.startDate}</td>
                <td className="font-mono text-primary text-xs">{t.endDate}</td>
                <td>{t.location}</td>
                <td className="font-mono text-primary">{t.assigned.length}/{t.maxPersonnel}</td>
                <td><span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${statusClass[t.status]}`} style={{ borderRadius: '2px' }}>{t.status}</span></td>
                <td onClick={e => e.stopPropagation()}>
                  {canEdit && (
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(t)} className="p-1.5 text-primary hover:bg-primary/10" title="Szerkesztés"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeleteTarget(t)} className="p-1.5 text-destructive hover:bg-destructive/10" title="Törlés"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!detail && !editing} onClose={() => setDetail(null)} title={detail?.name || ''} wide>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Típus</span><p className="mono-chip mt-1">{detail.type}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Státusz</span><p className={`inline-flex px-2 py-0.5 text-xs uppercase tracking-military font-mono mt-1 ${statusClass[detail.status]}`} style={{ borderRadius: '2px' }}>{detail.status}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Időszak</span><p className="font-mono text-primary text-sm mt-1">{detail.startDate} → {detail.endDate}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Helyszín</span><p className="mt-1">{detail.location}</p></div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <div className="h-px flex-1 bg-primary/30" />
              <span className="text-xs uppercase tracking-military text-primary font-mono">Jelenléti ív</span>
              <div className="h-px flex-1 bg-primary/30" />
            </div>

            <table className="w-full mil-table">
              <thead><tr><th>Név</th><th>Jelenlét</th>{canEdit && <th></th>}</tr></thead>
              <tbody>
                {detail.assigned.map(a => (
                  <tr key={a.personId}>
                    <td>{a.personName}</td>
                    <td>
                      {canEdit ? (
                        <select value={a.attendance} onChange={e => { void updateAttendance(a.personId, e.target.value); }} className="bg-input border border-border px-2 py-1 text-xs" style={{ borderRadius: '2px' }}>
                          {ATTENDANCE.map(at => <option key={at} value={at}>{at}</option>)}
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 text-xs font-mono ${a.attendance === 'Megjelent' ? 'badge-active' : a.attendance === 'Hiányzott' ? 'badge-cancelled' : a.attendance === 'Beteg' ? 'badge-reserve' : 'badge-planned'}`} style={{ borderRadius: '2px' }}>{a.attendance}</span>
                      )}
                    </td>
                    {canEdit && <td><button onClick={() => {
                      void (async () => {
                        if (!detail) return;
                        try {
                          const updated = { ...detail, assigned: detail.assigned.filter(x => x.personId !== a.personId) };
                          await store.update(updated);
                          setDetail(updated);
                          await refresh();
                        } catch (error) {
                          toast.error(getErrorMessage(error));
                        }
                      })();
                    }} className="text-destructive text-xs hover:underline">Eltávolítás</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>

            {canEdit && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <select value={addPersonId} onChange={e => setAddPersonId(e.target.value)} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>
                    <option value="">Személy kiválasztása...</option>
                    {activePpl.filter(p => !detail.assigned.some(a => a.personId === p.id)).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <button onClick={() => { void addPerson(); }} className="btn-mil-primary text-xs">Hozzáadás</button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); setDetail(null); }} title={editing ? 'Kiképzés szerkesztése' : 'Új kiképzés'}>
        <div className="space-y-3">
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Megnevezés *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
            {errors.name && <p className="text-destructive text-xs mt-1">{errors.name}</p>}</div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Típus</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Kezdete *</label>
              <DatePickerInput value={form.startDate} onChange={(value) => setForm({ ...form, startDate: value })} />
              {errors.startDate && <p className="text-destructive text-xs mt-1">{errors.startDate}</p>}</div>
            <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Vége *</label>
              <DatePickerInput value={form.endDate} onChange={(value) => setForm({ ...form, endDate: value })} />
              {errors.endDate && <p className="text-destructive text-xs mt-1">{errors.endDate}</p>}</div>
          </div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Helyszín</label>
            <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} /></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Szervező</label>
            <input value={form.organizer} onChange={e => setForm({ ...form, organizer: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} /></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Max létszám</label>
            <input type="number" value={form.maxPersonnel} onChange={e => setForm({ ...form, maxPersonnel: Number(e.target.value) })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} /></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Státusz</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Training['status'] })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Leírás</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm resize-none h-20" style={{ borderRadius: '2px' }} /></div>
          <div className="flex gap-3 justify-end pt-4">
            <button onClick={() => { setCreating(false); setEditing(null); }} className="btn-mil-secondary text-xs">Mégsem</button>
            <button onClick={() => { void handleSave(); }} className="btn-mil-primary text-xs">Mentés</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => {
        if (deleteTarget) {
          void (async () => {
            try {
              await store.remove(deleteTarget.id);
              await logAction(user!.displayName, user!.username, 'törölve', 'Kiképzések', deleteTarget.name);
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


