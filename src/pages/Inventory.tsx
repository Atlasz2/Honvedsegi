import React, { useState, useEffect, useCallback } from 'react';
import { supplies as store, logAction } from '@/lib/store';
import { Supply, SupplyMovement } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ArrowRightLeft, History } from 'lucide-react';

const CATEGORIES = ['Lőszer','Üzemanyag','Élelmiszer','Gyógyszer','Irodaszer','Műszaki anyag','Egyéb'];
const MOVE_TYPES = ['Bevételezés','Kiadás','Visszavétel','Selejtezés','Korrekció'] as const;

export default function InventoryPage() {
  const { canEdit, user } = useAuth();
  const [data, setData] = useState<Supply[]>([]);
  const [filterCat, setFilterCat] = useState('');
  const [filterLow, setFilterLow] = useState(false);
  const [editing, setEditing] = useState<Supply | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', category: CATEGORIES[0], unit: '', currentQty: 0, minQty: 0, description: '' });
  const [deleteTarget, setDeleteTarget] = useState<Supply | null>(null);
  const [moveTarget, setMoveTarget] = useState<Supply | null>(null);
  const [moveForm, setMoveForm] = useState({ type: 'Bevételezés' as string, quantity: 0, note: '' });
  const [historyTarget, setHistoryTarget] = useState<Supply | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const refresh = useCallback(() => setData(store.getAll()), []);
  useEffect(() => { refresh(); const iv = setInterval(refresh, 30000); return () => clearInterval(iv); }, [refresh]);

  const filtered = data.filter(s => {
    if (filterCat && s.category !== filterCat) return false;
    if (filterLow && s.currentQty >= s.minQty) return false;
    return true;
  });

  const getStatus = (s: Supply) => {
    if (s.currentQty === 0) return { label: 'Kifogyott', cls: 'badge-cancelled' };
    if (s.currentQty < s.minQty) return { label: 'Kevés', cls: 'badge-reserve' };
    return { label: 'Elegendő', cls: 'badge-active' };
  };

  const handleSave = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Kötelező';
    if (!form.unit.trim()) e.unit = 'Kötelező';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    if (editing) {
      store.update({ ...editing, ...form } as any);
      logAction(user!.displayName, user!.username, 'módosítva', 'Készletek', form.name);
    } else {
      store.add({ ...form, movements: [] } as any);
      logAction(user!.displayName, user!.username, 'létrehozva', 'Készletek', form.name);
    }
    toast.success('Sikeresen mentve');
    setEditing(null); setCreating(false); refresh();
  };

  const handleMove = () => {
    if (!moveTarget || moveForm.quantity <= 0) { toast.error('Érvényes mennyiséget adj meg'); return; }
    let newQty = moveTarget.currentQty;
    if (['Bevételezés', 'Visszavétel'].includes(moveForm.type)) newQty += moveForm.quantity;
    else if (['Kiadás', 'Selejtezés'].includes(moveForm.type)) newQty = Math.max(0, newQty - moveForm.quantity);
    else newQty = moveForm.quantity; // Korrekció = set

    const movement: SupplyMovement = {
      id: Date.now().toString(36),
      type: moveForm.type as any,
      quantity: moveForm.quantity,
      note: moveForm.note,
      date: new Date().toISOString(),
      userId: user!.username,
      userName: user!.displayName,
    };
    const updated = { ...moveTarget, currentQty: newQty, movements: [movement, ...moveTarget.movements] };
    store.update(updated);
    logAction(user!.displayName, user!.username, 'módosítva', 'Készletek', `${moveTarget.name} — ${moveForm.type}: ${moveForm.quantity}`);
    toast.success('Mozgás rögzítve');
    setMoveTarget(null);
    setMoveForm({ type: 'Bevételezés', quantity: 0, note: '' });
    refresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Készletek</h1>
        {canEdit && <button onClick={() => { setForm({ name: '', category: CATEGORIES[0], unit: '', currentQty: 0, minQty: 0, description: '' }); setErrors({}); setCreating(true); }} className="btn-mil-primary flex items-center gap-2 text-xs"><Plus className="w-4 h-4" />Új tétel</button>}
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="bg-input border border-border px-3 py-1.5 text-xs" style={{ borderRadius: '2px' }}>
          <option value="">Minden kategória</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => setFilterLow(!filterLow)} className={`px-3 py-1.5 text-xs uppercase tracking-military font-mono ${filterLow ? 'btn-mil-primary' : 'btn-mil-secondary'}`}>
          Alacsony készlet
        </button>
      </div>

      <div className="bg-card border border-border overflow-hidden" style={{ borderRadius: '2px' }}>
        <table className="w-full mil-table">
          <thead><tr><th>Megnevezés</th><th>Kategória</th><th>Egység</th><th>Mennyiség</th><th>Min.</th><th>Státusz</th><th>Műveletek</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center text-muted-foreground font-mono py-8">Nincs adat</td></tr>}
            {filtered.map(s => {
              const st = getStatus(s);
              return (
                <tr key={s.id}>
                  <td className="font-semibold">{s.name}</td>
                  <td><span className="mono-chip">{s.category}</span></td>
                  <td className="text-muted-foreground text-xs">{s.unit}</td>
                  <td className="font-mono text-primary">{s.currentQty}</td>
                  <td className="font-mono text-muted-foreground text-xs">{s.minQty}</td>
                  <td><span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${st.cls}`} style={{ borderRadius: '2px' }}>
                    {st.label === 'Kifogyott' && <span className="pulse-dot-red" />}
                    {st.label}
                  </span></td>
                  <td>
                    <div className="flex gap-1">
                      {canEdit && <button onClick={() => { setMoveTarget(s); setMoveForm({ type: 'Bevételezés', quantity: 0, note: '' }); }} className="p-1.5 text-primary hover:bg-primary/10" title="Mozgás rögzítése"><ArrowRightLeft className="w-3.5 h-3.5" /></button>}
                      <button onClick={() => setHistoryTarget(s)} className="p-1.5 text-muted-foreground hover:bg-secondary" title="Mozgási napló"><History className="w-3.5 h-3.5" /></button>
                      {canEdit && <button onClick={() => { setForm({ name: s.name, category: s.category, unit: s.unit, currentQty: s.currentQty, minQty: s.minQty, description: s.description }); setEditing(s); }} className="p-1.5 text-primary hover:bg-primary/10" title="Szerkesztés"><Pencil className="w-3.5 h-3.5" /></button>}
                      {canEdit && <button onClick={() => setDeleteTarget(s)} className="p-1.5 text-destructive hover:bg-destructive/10" title="Törlés"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Movement Modal */}
      <Modal open={!!moveTarget} onClose={() => setMoveTarget(null)} title="Mozgás rögzítése">
        {moveTarget && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{moveTarget.name} — jelenlegi: <span className="font-mono text-primary">{moveTarget.currentQty} {moveTarget.unit}</span></p>
            <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Típus</label>
              <select value={moveForm.type} onChange={e => setMoveForm({ ...moveForm, type: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>
                {MOVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Mennyiség</label>
              <input type="number" value={moveForm.quantity} onChange={e => setMoveForm({ ...moveForm, quantity: Number(e.target.value) })} className="w-full bg-input border border-border px-3 py-2 text-sm font-mono" style={{ borderRadius: '2px' }} /></div>
            <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Megjegyzés</label>
              <input value={moveForm.note} onChange={e => setMoveForm({ ...moveForm, note: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} /></div>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setMoveTarget(null)} className="btn-mil-secondary text-xs">Mégsem</button>
              <button onClick={handleMove} className="btn-mil-primary text-xs">Rögzítés</button>
            </div>
          </div>
        )}
      </Modal>

      {/* History Modal */}
      <Modal open={!!historyTarget} onClose={() => setHistoryTarget(null)} title="Mozgási napló" wide>
        {historyTarget && (
          <div>
            <p className="text-sm mb-4">{historyTarget.name}</p>
            <table className="w-full mil-table">
              <thead><tr><th>Dátum</th><th>Típus</th><th>Mennyiség</th><th>Felhasználó</th><th>Megjegyzés</th></tr></thead>
              <tbody>
                {historyTarget.movements.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground font-mono py-4">Nincs korábbi mozgás</td></tr>}
                {historyTarget.movements.map(m => (
                  <tr key={m.id}>
                    <td className="font-mono text-primary text-xs">{new Date(m.date).toLocaleString('hu-HU')}</td>
                    <td><span className="mono-chip">{m.type}</span></td>
                    <td className="font-mono text-primary">{m.quantity}</td>
                    <td className="text-brass text-xs">{m.userName}</td>
                    <td className="text-muted-foreground text-xs">{m.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Create/Edit Modal */}
      <Modal open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Tétel szerkesztése' : 'Új tétel'}>
        <div className="space-y-3">
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Megnevezés *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
            {errors.name && <p className="text-destructive text-xs mt-1">{errors.name}</p>}</div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Kategória</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Egység *</label>
            <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="db, liter, kg..." className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
            {errors.unit && <p className="text-destructive text-xs mt-1">{errors.unit}</p>}</div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Jelenlegi mennyiség</label>
              <input type="number" value={form.currentQty} onChange={e => setForm({ ...form, currentQty: Number(e.target.value) })} className="w-full bg-input border border-border px-3 py-2 text-sm font-mono" style={{ borderRadius: '2px' }} /></div>
            <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Min. mennyiség</label>
              <input type="number" value={form.minQty} onChange={e => setForm({ ...form, minQty: Number(e.target.value) })} className="w-full bg-input border border-border px-3 py-2 text-sm font-mono" style={{ borderRadius: '2px' }} /></div>
          </div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Leírás</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm resize-none h-20" style={{ borderRadius: '2px' }} /></div>
          <div className="flex gap-3 justify-end pt-4">
            <button onClick={() => { setCreating(false); setEditing(null); }} className="btn-mil-secondary text-xs">Mégsem</button>
            <button onClick={handleSave} className="btn-mil-primary text-xs">Mentés</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => {
        if (deleteTarget) { store.remove(deleteTarget.id); logAction(user!.displayName, user!.username, 'törölve', 'Készletek', deleteTarget.name); toast.success('Törölve'); refresh(); }
      }} />
    </div>
  );
}
