import React, { useState, useEffect, useCallback } from 'react';
import { personnel as store, logAction } from '@/lib/store';
import { Person } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

const RANKS = ['Közlegény','Tizedes','Szakaszvezető','Őrmester','Törzsőrmester','Főtörzsőrmester','Zászlós','Törzszászlós','Főtörzszászlós','Hadnagy','Főhadnagy','Százados','Őrnagy','Alezredes','Ezredes'];
const STATUSES = ['Aktív','Tartalékos','Szabadságon','Leszerelt'] as const;

const statusClass: Record<string, string> = {
  'Aktív': 'badge-active', 'Tartalékos': 'badge-reserve', 'Szabadságon': 'badge-leave', 'Leszerelt': 'badge-discharged',
};

const emptyPerson: Omit<Person, 'id'> = {
  name: '', rank: 'Közlegény', unit: '', status: 'Aktív', email: '', phone: '', birthDate: '', address: '', joinDate: '', notes: '',
};

export default function Personnel() {
  const { canEdit, user } = useAuth();
  const [data, setData] = useState<Person[]>([]);
  const [filter, setFilter] = useState<string>('Összes');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Person | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Omit<Person, 'id'>>(emptyPerson);
  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const refresh = useCallback(() => setData(store.getAll()), []);
  useEffect(() => { refresh(); const iv = setInterval(refresh, 30000); return () => clearInterval(iv); }, [refresh]);

  const filtered = data.filter(p => {
    if (filter !== 'Összes' && p.status !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return p.name.toLowerCase().includes(s) || p.rank.toLowerCase().includes(s) || p.unit.toLowerCase().includes(s);
    }
    return true;
  });

  const statusCounts = { Aktív: 0, Tartalékos: 0, Szabadságon: 0, Leszerelt: 0 };
  data.forEach(p => { if (p.status in statusCounts) statusCounts[p.status as keyof typeof statusCounts]++; });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Kötelező mező';
    if (!form.unit.trim()) e.unit = 'Kötelező mező';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    if (editing) {
      store.update({ ...editing, ...form });
      logAction(user!.displayName, user!.username, 'módosítva', 'Személyek', form.name);
      toast.success('Sikeresen mentve');
    } else {
      store.add(form);
      logAction(user!.displayName, user!.username, 'létrehozva', 'Személyek', form.name);
      toast.success('Sikeresen mentve');
    }
    setEditing(null);
    setCreating(false);
    refresh();
  };

  const handleDelete = (p: Person) => {
    store.remove(p.id);
    logAction(user!.displayName, user!.username, 'törölve', 'Személyek', p.name);
    toast.success('Törölve');
    refresh();
  };

  const openCreate = () => { setForm({ ...emptyPerson }); setErrors({}); setCreating(true); };
  const openEdit = (p: Person) => { setForm({ name: p.name, rank: p.rank, unit: p.unit, status: p.status, email: p.email, phone: p.phone, birthDate: p.birthDate, address: p.address, joinDate: p.joinDate, notes: p.notes }); setErrors({}); setEditing(p); };

  const Field = ({ label, field, type = 'text', required }: { label: string; field: keyof typeof form; type?: string; required?: boolean }) => (
    <div>
      <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">{label}{required && ' *'}</label>
      {type === 'textarea' ? (
        <textarea value={form[field] as string} onChange={e => setForm({ ...form, [field]: e.target.value })}
          className="w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary resize-none h-20"
          style={{ borderRadius: '2px' }} />
      ) : (
        <input type={type} value={form[field] as string} onChange={e => setForm({ ...form, [field]: e.target.value })}
          className="w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary"
          style={{ borderRadius: '2px' }} />
      )}
      {errors[field] && <p className="text-destructive text-xs mt-1">{errors[field]}</p>}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Személyek</h1>
        {canEdit && <button onClick={openCreate} className="btn-mil-primary flex items-center gap-2 text-xs"><Plus className="w-4 h-4" />Új személy</button>}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {(['Aktív','Tartalékos','Szabadságon','Leszerelt'] as const).map(s => (
          <div key={s} className="stats-card">
            <div className="stats-number">{statusCounts[s]}</div>
            <div className="stats-label">{s}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Keresés..."
            className="w-full bg-input border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
            style={{ borderRadius: '2px' }} />
        </div>
        {['Összes', ...STATUSES].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs uppercase tracking-military font-mono transition-colors ${filter === s ? 'btn-mil-primary' : 'btn-mil-secondary'}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border overflow-hidden" style={{ borderRadius: '2px' }}>
        <table className="w-full mil-table">
          <thead><tr>
            <th>Név</th><th>Rendfokozat</th><th>Alakulat</th><th>Státusz</th><th>Email</th><th>Telefon</th><th>Belépés</th>
            {canEdit && <th>Műveletek</th>}
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground font-mono py-8">Nincs adat</td></tr>}
            {filtered.map(p => (
              <tr key={p.id}>
                <td className="font-semibold">{p.name}</td>
                <td className="text-brass font-mono text-xs">{p.rank}</td>
                <td>{p.unit}</td>
                <td>
                  <span className={`inline-flex items-center px-2 py-0.5 text-xs uppercase tracking-military font-mono ${statusClass[p.status]}`} style={{ borderRadius: '2px' }}>
                    {(p.status === 'Aktív') && <span className="pulse-dot" />}
                    {p.status}
                  </span>
                </td>
                <td className="text-muted-foreground text-xs">{p.email}</td>
                <td className="font-mono text-xs">{p.phone}</td>
                <td className="font-mono text-primary text-xs">{p.joinDate}</td>
                {canEdit && (
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(p)} className="p-1.5 text-primary hover:bg-primary/10 transition-colors" title="Szerkesztés"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeleteTarget(p)} className="p-1.5 text-destructive hover:bg-destructive/10 transition-colors" title="Törlés"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground font-mono mt-4">Frissítve: {new Date().toLocaleTimeString('hu-HU')}</p>

      {/* Add/Edit Modal */}
      <Modal open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Személy szerkesztése' : 'Új személy'}>
        <div className="space-y-3">
          <Field label="Név" field="name" required />
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Rendfokozat</label>
            <select value={form.rank} onChange={e => setForm({ ...form, rank: e.target.value })}
              className="w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary" style={{ borderRadius: '2px' }}>
              {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <Field label="Alakulat" field="unit" required />
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Státusz</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Person['status'] })}
              className="w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary" style={{ borderRadius: '2px' }}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <Field label="Email" field="email" type="email" />
          <Field label="Telefon" field="phone" />
          <Field label="Születési dátum" field="birthDate" type="date" />
          <Field label="Lakcím" field="address" />
          <Field label="Belépés dátuma" field="joinDate" type="date" />
          <Field label="Megjegyzés" field="notes" type="textarea" />
          <div className="flex gap-3 justify-end pt-4">
            <button onClick={() => { setCreating(false); setEditing(null); }} className="btn-mil-secondary text-xs">Mégsem</button>
            <button onClick={handleSave} className="btn-mil-primary text-xs">Mentés</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && handleDelete(deleteTarget)} />
    </div>
  );
}
