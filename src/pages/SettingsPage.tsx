import React, { useState, useEffect, useCallback } from 'react';
import { users as uStore, getErrorMessage } from '@/lib/store';
import { User, Role } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Plus, Pencil, ShieldCheck, ShieldOff } from 'lucide-react';
import Modal from '@/components/Modal';
import { useNavigate } from 'react-router-dom';

export default function SettingsPage() {
  const { user: authUser, isDev } = useAuth();
  const [data, setData] = useState<User[]>([]);
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', displayName: '', role: 'reader' as Role, active: true });
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      setData(await uStore.getAll());
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSave = async () => {
    if (!form.username.trim()) { toast.error('Felhasználónév kötelező'); return; }
    try {
      if (editing) {
        await uStore.update(editing.username, { displayName: form.displayName, role: form.role, active: form.active, password: form.password || undefined });
        toast.success('Sikeresen mentve');
      } else {
        if (!form.password) { toast.error('Jelszó kötelező'); return; }
        await uStore.create({ username: form.username, password: form.password, displayName: form.displayName, role: form.role, active: form.active });
        toast.success('Felhasználó létrehozva');
      }
      setEditing(null);
      setCreating(false);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const canEditUser = (u: User) => {
    if (u.username === authUser?.username) return false;
    if (u.role === 'fejleszto' && !isDev) return false;
    return true;
  };

  const availableRoles: Role[] = isDev ? ['reader', 'admin', 'fejleszto'] : ['reader', 'admin'];
  const roleBadge: Record<string, string> = { admin: 'ADMIN', reader: 'OLVASÓ', fejleszto: 'FEJLESZTŐ' };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Beállítások</h1>
        <div className="flex gap-2">
          <button onClick={() => navigate('/activity-log')} className="btn-mil-secondary text-xs">Tevékenységnapló</button>
          <button onClick={() => { setForm({ username: '', password: '', displayName: '', role: 'reader', active: true }); setCreating(true); }} className="btn-mil-primary flex items-center gap-2 text-xs"><Plus className="w-4 h-4" />Új felhasználó</button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="h-px flex-1 bg-primary/30" />
        <span className="text-xs uppercase tracking-military text-primary font-mono">Felhasználók</span>
        <div className="h-px flex-1 bg-primary/30" />
      </div>

      <div className="bg-card border border-border overflow-hidden" style={{ borderRadius: '2px' }}>
        <table className="w-full mil-table">
          <thead><tr><th>Felhasználónév</th><th>Megjelenítési név</th><th>Szerep</th><th>Státusz</th><th>Utolsó belépés</th><th>Műveletek</th></tr></thead>
          <tbody>
            {data.map(u => (
              <tr key={u.username}>
                <td className="font-mono text-primary">{u.username}</td>
                <td className="text-brass">{u.displayName}</td>
                <td><span className="px-2 py-0.5 text-xs uppercase tracking-military font-mono border border-border" style={{ borderRadius: '2px' }}>{roleBadge[u.role]}</span></td>
                <td>{u.active ? <span className="badge-active px-2 py-0.5 text-xs uppercase font-mono" style={{ borderRadius: '2px' }}>Aktív</span> : <span className="badge-cancelled px-2 py-0.5 text-xs uppercase font-mono" style={{ borderRadius: '2px' }}>Inaktív</span>}</td>
                <td className="font-mono text-xs text-muted-foreground">{u.lastLogin ? new Date(u.lastLogin).toLocaleString('hu-HU') : '—'}</td>
                <td>
                  {canEditUser(u) ? (
                    <div className="flex gap-1">
                      <button onClick={() => { setForm({ username: u.username, password: '', displayName: u.displayName, role: u.role, active: u.active }); setEditing(u); }} className="p-1.5 text-primary hover:bg-primary/10" title="Szerkesztés"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { void (async () => { try { await uStore.update(u.username, { displayName: u.displayName, role: u.role, active: !u.active }); await refresh(); toast.success(u.active ? 'Deaktiválva' : 'Aktiválva'); } catch (error) { toast.error(getErrorMessage(error)); } })(); }} className="p-1.5 hover:bg-secondary" title={u.active ? 'Deaktiválás' : 'Aktiválás'}>
                        {u.active ? <ShieldOff className="w-3.5 h-3.5 text-warning" /> : <ShieldCheck className="w-3.5 h-3.5 text-primary" />}
                      </button>
                    </div>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Felhasználó szerkesztése' : 'Új felhasználó'}>
        <div className="space-y-3">
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Felhasználónév{!editing && ' *'}</label>
            <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} disabled={!!editing} className="w-full bg-input border border-border px-3 py-2 text-sm font-mono disabled:opacity-50" style={{ borderRadius: '2px' }} /></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">{editing ? 'Új jelszó (üres = nem változik)' : 'Jelszó *'}</label>
            <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} /></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Megjelenítési név</label>
            <input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} /></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Szerep</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as Role })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>
              {availableRoles.map(r => <option key={r} value={r}>{roleBadge[r]}</option>)}</select></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="accent-primary" />Aktív</label>
          <div className="flex gap-3 justify-end pt-4"><button onClick={() => { setCreating(false); setEditing(null); }} className="btn-mil-secondary text-xs">Mégsem</button><button onClick={() => { void handleSave(); }} className="btn-mil-primary text-xs">Mentés</button></div>
        </div>
      </Modal>
    </div>
  );
}
