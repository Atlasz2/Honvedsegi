import React, { useState, useEffect, useCallback } from 'react';
import { equipment as store, personnel as pStore, logAction, getErrorMessage } from '@/lib/store';
import { Equipment as Eq, Person } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, ArrowUpFromLine, ArrowDownToLine, History } from 'lucide-react';

const CATEGORIES = ['Védőfelszerelés','Optika','Kommunikáció','Fegyverzet','Egészségügy','Tábori felszerelés','Ruházat','Egyéb'];
const CONDITIONS = ['Jó','Javítandó','Selejtezendő'] as const;
const condClass: Record<string, string> = { 'Jó': 'badge-active', 'Javítandó': 'badge-reserve', 'Selejtezendő': 'badge-cancelled' };

export default function EquipmentPage() {
  const { canEdit, user } = useAuth();
  const [data, setData] = useState<Eq[]>([]);
  const [personnelData, setPersonnelData] = useState<Person[]>([]);
  const [filter, setFilter] = useState('Összes');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Eq | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', category: CATEGORIES[0], serialNumber: '', qrCode: '', condition: 'Jó' as Eq['condition'], description: '' });
  const [deleteTarget, setDeleteTarget] = useState<Eq | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<Eq | null>(null);
  const [checkoutPerson, setCheckoutPerson] = useState('');
  const [checkoutNote, setCheckoutNote] = useState('');
  const [historyTarget, setHistoryTarget] = useState<Eq | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const [nextData, nextPersonnel] = await Promise.all([store.getAll(), pStore.getAll()]);
      setData(nextData);
      setPersonnelData(nextPersonnel);
      if (historyTarget) {
        setHistoryTarget(nextData.find(item => item.id === historyTarget.id) || null);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [historyTarget]);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => { void refresh(); }, 30000);
    return () => clearInterval(iv);
  }, [refresh]);

  const filtered = data.filter(e => {
    if (filter === 'Szabad' && e.checkedOutTo) return false;
    if (filter === 'Kiadva' && !e.checkedOutTo) return false;
    if (['Jó','Javítandó','Selejtezendő'].includes(filter) && e.condition !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return e.name.toLowerCase().includes(s) || e.serialNumber.toLowerCase().includes(s) || e.qrCode.toLowerCase().includes(s);
    }
    return true;
  });

  const stats = { free: data.filter(e => !e.checkedOutTo).length, out: data.filter(e => e.checkedOutTo).length, repair: data.filter(e => e.condition === 'Javítandó').length, scrap: data.filter(e => e.condition === 'Selejtezendő').length };

  const handleSave = async () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Kötelező';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    try {
      if (editing) {
        await store.update({ ...editing, ...form });
        await logAction(user!.displayName, user!.username, 'módosítva', 'Felszerelés', `${form.name} (${form.serialNumber})`);
      } else {
        await store.add({ ...form, checkoutHistory: [] });
        await logAction(user!.displayName, user!.username, 'létrehozva', 'Felszerelés', `${form.name} (${form.serialNumber})`);
      }
      toast.success('Sikeresen mentve');
      setEditing(null);
      setCreating(false);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const checkout = async () => {
    if (!checkoutTarget || !checkoutPerson) return;
    const p = personnelData.find(x => x.id === checkoutPerson);
    if (!p) return;
    try {
      await store.checkout(checkoutTarget.id, p.id, checkoutNote);
      await logAction(user!.displayName, user!.username, 'módosítva', 'Felszerelés', `${checkoutTarget.name} → kiadva: ${p.name}`);
      toast.success('Kiadva');
      setCheckoutTarget(null);
      setCheckoutPerson('');
      setCheckoutNote('');
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const returnItem = async (item: Eq) => {
    try {
      await store.returnItem(item.id);
      await logAction(user!.displayName, user!.username, 'módosítva', 'Felszerelés', `${item.name} → visszavéve`);
      toast.success('Visszavéve');
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const activePpl = personnelData.filter(p => p.status === 'Aktív' || p.status === 'Tartalékos');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Felszerelés</h1>
        {canEdit && <button onClick={() => { setForm({ name: '', category: CATEGORIES[0], serialNumber: '', qrCode: '', condition: 'Jó', description: '' }); setErrors({}); setCreating(true); }} className="btn-mil-primary flex items-center gap-2 text-xs"><Plus className="w-4 h-4" />Új eszköz</button>}
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="stats-card"><div className="stats-number">{stats.free}</div><div className="stats-label">Szabad</div></div>
        <div className="stats-card"><div className="stats-number" style={{ color: 'hsl(210 70% 60%)' }}>{stats.out}</div><div className="stats-label">Kiadva</div></div>
        <div className="stats-card"><div className="stats-number" style={{ color: 'hsl(var(--mil-warning))' }}>{stats.repair}</div><div className="stats-label">Javítandó</div></div>
        <div className="stats-card"><div className="stats-number" style={{ color: 'hsl(var(--destructive))' }}>{stats.scrap}</div><div className="stats-label">Selejtezendő</div></div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Keresés..." className="w-full bg-input border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary" style={{ borderRadius: '2px' }} />
        </div>
        {['Összes','Szabad','Kiadva','Jó','Javítandó','Selejtezendő'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 text-xs uppercase tracking-military font-mono ${filter === s ? 'btn-mil-primary' : 'btn-mil-secondary'}`}>{s}</button>
        ))}
      </div>

      <div className="bg-card border border-border overflow-hidden" style={{ borderRadius: '2px' }}>
        <table className="w-full mil-table">
          <thead><tr><th>Megnevezés</th><th>Kategória</th><th>Sorozatszám</th><th>Állapot</th><th>Státusz</th><th>Kiadva</th><th>Műveletek</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center text-muted-foreground font-mono py-8">Nincs adat</td></tr>}
            {filtered.map(e => (
              <tr key={e.id}>
                <td className="font-semibold">{e.name}</td>
                <td><span className="mono-chip">{e.category}</span></td>
                <td className="font-mono text-primary text-xs">{e.serialNumber}</td>
                <td><span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${condClass[e.condition]}`} style={{ borderRadius: '2px' }}>{e.condition}</span></td>
                <td><span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${e.checkedOutTo ? 'badge-leave' : 'badge-active'}`} style={{ borderRadius: '2px' }}>{e.checkedOutTo ? 'Kiadva' : 'Szabad'}</span></td>
                <td>{e.checkedOutToName && <span className="text-xs">{e.checkedOutToName} <span className="font-mono text-primary">({e.checkedOutDate})</span></span>}</td>
                <td>
                  <div className="flex gap-1">
                    {canEdit && !e.checkedOutTo && <button onClick={() => setCheckoutTarget(e)} className="p-1.5 text-primary hover:bg-primary/10" title="Kiadás"><ArrowUpFromLine className="w-3.5 h-3.5" /></button>}
                    {canEdit && e.checkedOutTo && <button onClick={() => { void returnItem(e); }} className="p-1.5 text-primary hover:bg-primary/10" title="Visszavétel"><ArrowDownToLine className="w-3.5 h-3.5" /></button>}
                    <button onClick={() => setHistoryTarget(e)} className="p-1.5 text-muted-foreground hover:bg-secondary" title="Kiadási napló"><History className="w-3.5 h-3.5" /></button>
                    {canEdit && <button onClick={() => { setForm({ name: e.name, category: e.category, serialNumber: e.serialNumber, qrCode: e.qrCode, condition: e.condition, description: e.description }); setEditing(e); }} className="p-1.5 text-primary hover:bg-primary/10" title="Szerkesztés"><Pencil className="w-3.5 h-3.5" /></button>}
                    {canEdit && <button onClick={() => setDeleteTarget(e)} className="p-1.5 text-destructive hover:bg-destructive/10" title="Törlés"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!checkoutTarget} onClose={() => setCheckoutTarget(null)} title="Kiadás">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{checkoutTarget?.name} — <span className="mono-chip">{checkoutTarget?.serialNumber}</span></p>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Személy</label>
            <select value={checkoutPerson} onChange={e => setCheckoutPerson(e.target.value)} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>
              <option value="">Válassz...</option>
              {activePpl.map(p => <option key={p.id} value={p.id}>{p.name} ({p.rank})</option>)}
            </select></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Megjegyzés</label>
            <input value={checkoutNote} onChange={e => setCheckoutNote(e.target.value)} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} /></div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setCheckoutTarget(null)} className="btn-mil-secondary text-xs">Mégsem</button>
            <button onClick={() => { void checkout(); }} className="btn-mil-primary text-xs">Kiadás</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!historyTarget} onClose={() => setHistoryTarget(null)} title="Kiadási napló" wide>
        {historyTarget && (
          <div>
            <p className="text-sm mb-4">{historyTarget.name} — <span className="mono-chip">{historyTarget.serialNumber}</span></p>
            <table className="w-full mil-table">
              <thead><tr><th>Személy</th><th>Kiadva</th><th>Visszavéve</th><th>Megjegyzés</th></tr></thead>
              <tbody>
                {historyTarget.checkoutHistory.length === 0 && <tr><td colSpan={4} className="text-center text-muted-foreground font-mono py-4">Nincs korábbi kiadás</td></tr>}
                {historyTarget.checkoutHistory.map((h, i) => (
                  <tr key={i}>
                    <td>{h.personName}</td>
                    <td className="font-mono text-primary text-xs">{h.checkedOutDate}</td>
                    <td className="font-mono text-xs">{h.returnedDate || '—'}</td>
                    <td className="text-muted-foreground text-xs">{h.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Eszköz szerkesztése' : 'Új eszköz'}>
        <div className="space-y-3">
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Megnevezés *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
            {errors.name && <p className="text-destructive text-xs mt-1">{errors.name}</p>}</div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Kategória</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Sorozatszám</label>
            <input value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm font-mono" style={{ borderRadius: '2px' }} /></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">QR kód</label>
            <input value={form.qrCode} onChange={e => setForm({ ...form, qrCode: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm font-mono" style={{ borderRadius: '2px' }} /></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Állapot</label>
            <select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value as Eq['condition'] })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>
              {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
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
              await logAction(user!.displayName, user!.username, 'törölve', 'Felszerelés', deleteTarget.name);
              toast.success('Törölve');
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
