import { useState, useEffect, useCallback } from 'react';
import { vehicles as store, personnel as pStore, logAction, getErrorMessage } from '@/lib/store';
import { Vehicle, Person } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ArrowUpFromLine, ArrowDownToLine } from 'lucide-react';

const TYPES = ['Személyautó','Terepjáró','Tehergépjármű','Busz','Motorkerékpár','Páncélozott','Egyéb'];
const STATUSES = ['Elérhető','Használatban','Szervizben','Meghibásodott','Selejtezett'] as const;
const statusClass: Record<string, string> = { 'Elérhető': 'badge-active', 'Használatban': 'badge-leave', 'Szervizben': 'badge-reserve', 'Meghibásodott': 'badge-cancelled', 'Selejtezett': 'badge-discharged' };

export default function VehiclesPage() {
  const { canEdit, user } = useAuth();
  const [data, setData] = useState<Vehicle[]>([]);
  const [personnelData, setPersonnelData] = useState<Person[]>([]);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ plateNumber: '', type: TYPES[0], makeModel: '', year: 2020, km: 0, nextService: '', nextInspection: '', status: 'Elérhető' as Vehicle['status'], notes: '' });
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [assignTarget, setAssignTarget] = useState<Vehicle | null>(null);
  const [assignPerson, setAssignPerson] = useState('');

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

  const filtered = data.filter(v => !filter || v.status === filter);
  const activePpl = personnelData.filter(p => p.status === 'Aktív' || p.status === 'Tartalékos');

  const handleSave = async () => {
    if (!form.plateNumber.trim()) { toast.error('Rendszám kötelező'); return; }
    try {
      if (editing) {
        await store.update({ ...editing, ...form });
        await logAction(user!.displayName, user!.username, 'módosítva', 'Járművek', form.plateNumber);
      } else {
        await store.add({ ...form, serviceLog: [] });
        await logAction(user!.displayName, user!.username, 'létrehozva', 'Járművek', form.plateNumber);
      }
      toast.success('Sikeresen mentve');
      setEditing(null);
      setCreating(false);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const assign = async () => {
    if (!assignTarget || !assignPerson) return;
    const p = personnelData.find(x => x.id === assignPerson);
    if (!p) return;
    try {
      await store.assign(assignTarget.id, p.id);
      await logAction(user!.displayName, user!.username, 'módosítva', 'Járművek', `${assignTarget.plateNumber} → ${p.name}`);
      toast.success('Kiadva');
      setAssignTarget(null);
      setAssignPerson('');
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const returnVehicle = async (v: Vehicle) => {
    try {
      await store.returnItem(v.id);
      await logAction(user!.displayName, user!.username, 'módosítva', 'Járművek', `${v.plateNumber} → visszavéve`);
      toast.success('Visszavéve');
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Járművek</h1>
        {canEdit && <button onClick={() => { setForm({ plateNumber: '', type: TYPES[0], makeModel: '', year: 2020, km: 0, nextService: '', nextInspection: '', status: 'Elérhető', notes: '' }); setCreating(true); }} className="btn-mil-primary flex items-center gap-2 text-xs"><Plus className="w-4 h-4" />Új jármű</button>}
      </div>
      <div className="flex gap-2 mb-6">
        {['', ...STATUSES].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 text-xs uppercase tracking-military font-mono ${filter === s ? 'btn-mil-primary' : 'btn-mil-secondary'}`}>{s || 'Összes'}</button>
        ))}
      </div>
      <div className="bg-card border border-border overflow-hidden" style={{ borderRadius: '2px' }}>
        <table className="w-full mil-table">
          <thead><tr><th>Rendszám</th><th>Típus</th><th>Márka/Model</th><th>Státusz</th><th>Km</th><th>Szerviz</th><th>Használó</th><th>Műveletek</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground font-mono py-8">Nincs adat</td></tr>}
            {filtered.map(v => (
              <tr key={v.id}>
                <td className="font-mono text-primary font-bold">{v.plateNumber}</td>
                <td><span className="mono-chip">{v.type}</span></td>
                <td>{v.makeModel}</td>
                <td><span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${statusClass[v.status]}`} style={{ borderRadius: '2px' }}>{v.status}</span></td>
                <td className="font-mono text-primary text-xs">{v.km.toLocaleString()}</td>
                <td className="font-mono text-xs">{v.nextService}</td>
                <td className="text-brass text-xs">{v.assignedToName || '—'}</td>
                <td>
                  <div className="flex gap-1">
                    {canEdit && !v.assignedTo && v.status === 'Elérhető' && <button onClick={() => setAssignTarget(v)} className="p-1.5 text-primary hover:bg-primary/10" title="Kiadás"><ArrowUpFromLine className="w-3.5 h-3.5" /></button>}
                    {canEdit && v.assignedTo && <button onClick={() => { void returnVehicle(v); }} className="p-1.5 text-primary hover:bg-primary/10" title="Visszavétel"><ArrowDownToLine className="w-3.5 h-3.5" /></button>}
                    {canEdit && <button onClick={() => { setForm({ plateNumber: v.plateNumber, type: v.type, makeModel: v.makeModel, year: v.year, km: v.km, nextService: v.nextService, nextInspection: v.nextInspection, status: v.status, notes: v.notes }); setEditing(v); }} className="p-1.5 text-primary hover:bg-primary/10" title="Szerkesztés"><Pencil className="w-3.5 h-3.5" /></button>}
                    {canEdit && <button onClick={() => setDeleteTarget(v)} className="p-1.5 text-destructive hover:bg-destructive/10" title="Törlés"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!assignTarget} onClose={() => setAssignTarget(null)} title="Jármű kiadása">
        <div className="space-y-3">
          <p className="text-sm">{assignTarget?.plateNumber} — {assignTarget?.makeModel}</p>
          <select value={assignPerson} onChange={e => setAssignPerson(e.target.value)} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>
            <option value="">Válassz személyt...</option>
            {activePpl.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex gap-3 justify-end"><button onClick={() => setAssignTarget(null)} className="btn-mil-secondary text-xs">Mégsem</button><button onClick={() => { void assign(); }} className="btn-mil-primary text-xs">Kiadás</button></div>
        </div>
      </Modal>

      <Modal open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Jármű szerkesztése' : 'Új jármű'}>
        <div className="space-y-3">
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Rendszám *</label><input value={form.plateNumber} onChange={e => setForm({ ...form, plateNumber: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm font-mono" style={{ borderRadius: '2px' }} /></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Típus</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Márka és modell</label><input value={form.makeModel} onChange={e => setForm({ ...form, makeModel: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Gyártási év</label><input type="number" value={form.year} onChange={e => setForm({ ...form, year: Number(e.target.value) })} className="w-full bg-input border border-border px-3 py-2 text-sm font-mono" style={{ borderRadius: '2px' }} /></div>
            <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Km óra</label><input type="number" value={form.km} onChange={e => setForm({ ...form, km: Number(e.target.value) })} className="w-full bg-input border border-border px-3 py-2 text-sm font-mono" style={{ borderRadius: '2px' }} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Következő szerviz</label><input type="date" value={form.nextService} onChange={e => setForm({ ...form, nextService: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} /></div>
            <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Műszaki vizsga</label><input type="date" value={form.nextInspection} onChange={e => setForm({ ...form, nextInspection: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} /></div>
          </div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Státusz</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Vehicle['status'] })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Megjegyzés</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm resize-none h-20" style={{ borderRadius: '2px' }} /></div>
          <div className="flex gap-3 justify-end pt-4"><button onClick={() => { setCreating(false); setEditing(null); }} className="btn-mil-secondary text-xs">Mégsem</button><button onClick={() => { void handleSave(); }} className="btn-mil-primary text-xs">Mentés</button></div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) { void (async () => { try { await store.remove(deleteTarget.id); await logAction(user!.displayName, user!.username, 'törölve', 'Járművek', deleteTarget.plateNumber); toast.success('Törölve'); setDeleteTarget(null); await refresh(); } catch (error) { toast.error(getErrorMessage(error)); } })(); } }} />
    </div>
  );
}
