import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import { announcements as store, logAction, getErrorMessage } from '@/lib/store';
import { Announcement } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { Plus, Pin } from 'lucide-react';

const CATEGORIES = ['Általános','Fontos','Sürgős','Gyakorlat','Adminisztráció'] as const;
const catClass: Record<string, string> = { 'Általános': 'badge-general', 'Fontos': 'badge-important', 'Sürgős': 'badge-urgent', 'Gyakorlat': 'badge-exercise', 'Adminisztráció': 'badge-admin-cat' };

export default function AnnouncementsPage() {
  const { canEdit, user } = useAuth();
  const location = useLocation();
  const [data, setData] = useState<Announcement[]>([]);
  const [filterCat, setFilterCat] = useState('');
  const [detail, setDetail] = useState<Announcement | null>(null);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'Általános' as Announcement['category'], content: '', pinned: false });
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const nextData = await store.getAll();
      setData(nextData);
      setDetail(currentDetail => {
        if (!currentDetail) return null;
        return nextData.find(item => item.id === currentDetail.id) || null;
      });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useAutoRefresh(refresh);

  // A fejléc-harangból érkezve a kiválasztott közlemény rögtön megnyílik.
  useEffect(() => {
    const navState = location.state as { openAnnouncementId?: string } | null;
    if (!navState?.openAnnouncementId || data.length === 0) return;
    const found = data.find((a) => a.id === navState.openAnnouncementId);
    if (found) setDetail(found);
  }, [location.state, data]);

  const sorted = [...data].filter(a => !filterCat || a.category === filterCat).sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.date.localeCompare(a.date);
  });

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) { toast.error('Cím és tartalom kötelező'); return; }
    try {
      if (editing) {
        await store.update({ ...editing, ...form });
        await logAction(user!.displayName, user!.username, 'módosítva', 'Hírek', form.title);
      } else {
        await store.add({ ...form, author: user!.displayName, date: new Date().toISOString().split('T')[0] });
        await logAction(user!.displayName, user!.username, 'létrehozva', 'Hírek', form.title);
      }
      toast.success('Sikeresen mentve');
      setEditing(null);
      setCreating(false);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Hírek és közlemények</h1>
        {canEdit && <button onClick={() => { setForm({ title: '', category: 'Általános', content: '', pinned: false }); setCreating(true); }} className="btn-mil-primary flex items-center gap-2 text-xs"><Plus className="w-4 h-4" />Új közlemény</button>}
      </div>

      <div className="flex gap-2 mb-6">
        {['', ...CATEGORIES].map(c => (
          <button key={c} onClick={() => setFilterCat(c)} className={`px-3 py-1.5 text-xs uppercase tracking-military font-mono ${filterCat === c ? 'btn-mil-primary' : 'btn-mil-secondary'}`}>{c || 'Összes'}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {sorted.length === 0 && <div className="col-span-2 text-center text-muted-foreground font-mono py-12">Nincs adat</div>}
        {sorted.map(a => (
          <div
            key={a.id}
            className={`bg-card border cursor-pointer transition-colors hover:bg-secondary ${a.category === 'Sürgős' ? 'border-destructive' : 'border-border'} ${a.pinned ? 'border-l-2 border-l-primary' : ''}`}
            style={{ borderRadius: '2px' }}
            onClick={() => setDetail(a)}
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {a.pinned && <Pin className="w-3.5 h-3.5 text-primary shrink-0" />}
                <h3 className="font-bold font-rajdhani uppercase tracking-military truncate">{a.title}</h3>
              </div>
              <span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${catClass[a.category]}`} style={{ borderRadius: '2px' }}>
                {a.category === 'Sürgős' && <span className="pulse-dot-red" />}{a.category}
              </span>
            </div>
            <div className="px-4 py-3">
              <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{a.content}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-2">
                <span className="text-brass uppercase tracking-military">{a.author}</span>
                <span className="font-mono text-primary">{a.date}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!detail && !editing} onClose={() => setDetail(null)} title={detail?.title || ''} wide>
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${catClass[detail.category]}`} style={{ borderRadius: '2px' }}>{detail.category}</span>
              <span className="text-brass text-sm">{detail.author}</span>
              <span className="font-mono text-primary text-xs">{detail.date}</span>
              {detail.pinned && <Pin className="w-3.5 h-3.5 text-primary" />}
            </div>
            <p className="text-foreground whitespace-pre-wrap">{detail.content}</p>
            {canEdit && (
              <div className="flex gap-2 justify-end pt-4">
                <button onClick={() => { setForm({ title: detail.title, category: detail.category, content: detail.content, pinned: detail.pinned }); setEditing(detail); }} className="btn-mil-secondary text-xs">Szerkesztés</button>
                <button onClick={() => setDeleteTarget(detail)} className="btn-mil-danger text-xs">Törlés</button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Közlemény szerkesztése' : 'Új közlemény'}>
        <div className="space-y-3">
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Cím *</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} /></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Kategória</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as Announcement['category'] })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Tartalom *</label><textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm resize-none h-32" style={{ borderRadius: '2px' }} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.pinned} onChange={e => setForm({ ...form, pinned: e.target.checked })} className="accent-primary" />Rögzített (kitűzött)</label>
          <div className="flex gap-3 justify-end pt-4"><button onClick={() => { setCreating(false); setEditing(null); }} className="btn-mil-secondary text-xs">Mégsem</button><button onClick={() => { void handleSave(); }} className="btn-mil-primary text-xs">Mentés</button></div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) { void (async () => { try { await store.remove(deleteTarget.id); await logAction(user!.displayName, user!.username, 'törölve', 'Hírek', deleteTarget.title); toast.success('Törölve'); setDetail(null); setDeleteTarget(null); await refresh(); } catch (error) { toast.error(getErrorMessage(error)); } })(); } }} />
    </div>
  );
}
