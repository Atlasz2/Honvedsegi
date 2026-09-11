import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, FileText, Plus, Search, Settings2, Trash2 } from 'lucide-react';
import {
  orders as store,
  personnel as personnelStore,
  getErrorMessage,
  type Order,
  type OrderChapter,
  type OrderChapterStatus,
  type OrderChapterTemplate,
  type OrderOverview,
  type OrderStatus,
  type OrderType,
} from '@/lib/store';
import type { Person } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import DatePickerInput from '@/components/DatePickerInput';

// A felhasználó által leírt munkafolyamat-sorrend: ügyvitel → jog → kiképzés/
// személyügy → pénzügy → ellenjegyzés. A backend ORDER_RESPONSIBLES párja.
const RESPONSIBLES = ['Ügyvitel', 'Jog', 'Kiképzés', 'Személyügy', 'Pénzügy', 'Ellenjegyzés'] as const;
const ORDER_STATUSES: OrderStatus[] = ['Előkészítés', 'Aláírásra vár', 'Kiadva', 'Visszavonva'];
const CHAPTER_STATUSES: OrderChapterStatus[] = ['Nincs elkezdve', 'Folyamatban', 'Kész', 'Nem szükséges'];

const orderStatusClass: Record<OrderStatus, string> = {
  'Előkészítés': 'badge-planned',
  'Aláírásra vár': 'badge-ongoing',
  'Kiadva': 'badge-completed',
  'Visszavonva': 'badge-cancelled',
};
const chapterStatusClass: Record<OrderChapterStatus, string> = {
  'Nincs elkezdve': 'text-muted-foreground',
  'Folyamatban': 'text-amber-400',
  'Kész': 'text-emerald-400',
  'Nem szükséges': 'text-muted-foreground line-through',
};

const inputClass = 'w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary';
const radius = { borderRadius: '2px' } as const;

function emptyChapter(): OrderChapterTemplate {
  return { name: '', responsible: 'Ügyvitel', required: true };
}

export default function Parancsok() {
  const { canEdit } = useAuth();
  const [list, setList] = useState<Order[]>([]);
  const [overview, setOverview] = useState<OrderOverview | null>(null);
  const [types, setTypes] = useState<OrderType[]>([]);
  const [openOnly, setOpenOnly] = useState(true);
  const [loading, setLoading] = useState(true);

  const [detail, setDetail] = useState<Order | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [creating, setCreating] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [orderList, ov, typeList] = await Promise.all([store.list(openOnly), store.overview(), store.types()]);
      setList(orderList);
      setOverview(ov);
      setTypes(typeList);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [openOnly]);

  useEffect(() => { void refresh(); }, [refresh]);

  const openDetail = async (order: Order) => {
    try {
      setDetail(await store.get(order.id));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await store.remove(deleteTarget.id);
      toast.success('Parancs törölve.');
      setDetail(null);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Parancsok</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">Ki melyik fejezetért felel, hol tart, mi tartja fel a parancsot</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setTypesOpen(true)} className="btn-mil-secondary flex items-center gap-2 text-xs">
            <Settings2 className="w-3.5 h-3.5" />
            Parancstípusok
          </button>
          {canEdit && (
            <button onClick={() => setCreating(true)} className="btn-mil-primary flex items-center gap-2 text-xs">
              <Plus className="w-3.5 h-3.5" />
              Új parancs
            </button>
          )}
        </div>
      </div>

      {/* Felelősönkénti áttekintő — hol torlódik */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-6">
          <div className="stats-card border-l-2 border-l-primary">
            <div className="stats-number">{overview.openOrders}</div>
            <div className="stats-label">Nyitott parancs</div>
          </div>
          <div className={`stats-card border-l-2 ${overview.overdueOrders ? 'border-l-destructive' : 'border-l-border'}`}>
            <div className="stats-number">{overview.overdueOrders}</div>
            <div className="stats-label">Lejárt határidejű</div>
          </div>
          {overview.byResponsible.map((r) => (
            <div key={r.responsible} className={`stats-card border-l-2 ${r.blockingOrders ? 'border-l-amber-400' : 'border-l-border'}`}>
              <div className="stats-number">{r.blockingOrders}</div>
              <div className="stats-label">{r.responsible} tartja fel</div>
              <div className="text-[11px] font-mono text-muted-foreground mt-1">
                {r.openChapters} nyitott fejezet{r.overdueChapters ? ` · ${r.overdueChapters} lejárt` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
        <label className="flex items-center gap-2 text-xs font-mono text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          Csak a nyitottak
        </label>
        <span className="text-xs font-mono text-muted-foreground">({list.length})</span>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground font-mono">Betöltés…</p>
      ) : list.length === 0 ? (
        <div className="bg-card border border-border p-6 text-center" style={radius}>
          <FileText className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {types.length === 0 ? 'Először hozz létre egy parancstípust a fejezeteivel.' : 'Nincs parancs a szűrésben.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full mil-table">
            <thead>
              <tr><th>Tárgy</th><th>Típus</th><th>Személy</th><th>Határidő</th><th>Állapot</th><th>Fejezetek</th><th>Feltartja</th></tr>
            </thead>
            <tbody>
              {list.map((o) => (
                <tr key={o.id} className="cursor-pointer hover:bg-secondary transition-colors" onClick={() => { void openDetail(o); }}>
                  <td className="font-medium">{o.subject}</td>
                  <td className="text-xs text-muted-foreground">{o.typeName}</td>
                  <td className="text-xs">{o.personName || '—'}</td>
                  <td className="font-mono text-xs">
                    {o.dueDate || '—'}
                    {o.isOverdue && <AlertTriangle className="inline w-3.5 h-3.5 ml-1 text-destructive" />}
                  </td>
                  <td><span className={orderStatusClass[o.status]}>{o.status}</span></td>
                  <td className="font-mono text-xs">{o.doneChapters} / {o.totalChapters}</td>
                  <td className="text-xs">{o.blockedBy ? <span className="text-amber-400 font-mono">{o.blockedBy}</span> : <span className="text-muted-foreground">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <OrderDetailModal
          order={detail}
          canEdit={canEdit}
          onClose={() => setDetail(null)}
          onChanged={(updated) => { setDetail(updated); void refresh(); }}
          onDelete={() => setDeleteTarget(detail)}
        />
      )}

      <NewOrderModal open={creating} types={types} onClose={() => setCreating(false)} onCreated={async () => { setCreating(false); await refresh(); }} />

      <OrderTypesModal open={typesOpen} types={types} canEdit={canEdit} onClose={() => setTypesOpen(false)} onChanged={refresh} />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { void remove(); }}
        message={`Törlöd a parancsot: „${deleteTarget?.subject}"? A fejezet-állapotok is elvesznek.`}
      />
    </div>
  );
}

// ── Parancs részlete: fejezetek állapota ──────────────────────────────────

function OrderDetailModal({ order, canEdit, onClose, onChanged, onDelete }: {
  order: Order; canEdit: boolean; onClose: () => void; onChanged: (o: Order) => void; onDelete: () => void;
}) {
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [dueDate, setDueDate] = useState(order.dueDate);
  const [notes, setNotes] = useState(order.notes);

  useEffect(() => { setStatus(order.status); setDueDate(order.dueDate); setNotes(order.notes); }, [order]);

  const saveOrder = async () => {
    try {
      onChanged(await store.update(order.id, { subject: order.subject, status, dueDate, notes }));
      toast.success('Parancs mentve.');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const saveChapter = async (chapter: OrderChapter, patch: Partial<OrderChapter>) => {
    try {
      onChanged(await store.updateChapter(order.id, chapter.id, {
        status: patch.status ?? chapter.status,
        assignee: patch.assignee ?? chapter.assignee,
        dueDate: patch.dueDate ?? chapter.dueDate,
        note: patch.note ?? chapter.note,
      }));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <Modal open onClose={onClose} title={order.subject} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><span className="text-muted-foreground text-xs uppercase tracking-military">Típus</span><p className="mt-1">{order.typeName}</p></div>
          <div><span className="text-muted-foreground text-xs uppercase tracking-military">Személy</span><p className="mt-1">{order.personName || '—'}</p></div>
          <div><span className="text-muted-foreground text-xs uppercase tracking-military">Létrehozta</span><p className="mt-1 font-mono text-xs">{order.createdBy} · {order.createdAt.slice(0, 10)}</p></div>
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-military">Feltartja</span>
            <p className="mt-1">{order.blockedBy ? <span className="text-amber-400 font-mono">{order.blockedBy}</span> : <span className="text-muted-foreground">—</span>}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Állapot</label>
            <select value={status} disabled={!canEdit} onChange={(e) => setStatus(e.target.value as OrderStatus)} className={inputClass} style={radius}>
              {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Határidő</label>
            {canEdit ? <DatePickerInput value={dueDate} onChange={setDueDate} /> : <p className="font-mono text-sm py-2">{dueDate || '—'}</p>}
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Megjegyzés</label>
            <input value={notes} disabled={!canEdit} onChange={(e) => setNotes(e.target.value)} className={inputClass} style={radius} />
          </div>
        </div>
        {canEdit && (
          <div className="flex justify-end">
            <button onClick={() => { void saveOrder(); }} className="btn-mil-secondary text-xs">Parancs mentése</button>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-primary/30" />
          <span className="text-xs uppercase tracking-military text-primary font-mono">Fejezetek ({order.doneChapters}/{order.totalChapters})</span>
          <div className="h-px flex-1 bg-primary/30" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full mil-table">
            <thead>
              <tr><th>#</th><th>Fejezet</th><th>Felelős</th><th>Állapot</th><th>Ki dolgozik rajta</th><th>Határidő</th><th>Megjegyzés</th><th>Utoljára</th></tr>
            </thead>
            <tbody>
              {order.chapters.map((ch) => (
                <ChapterRow key={ch.id} chapter={ch} canEdit={canEdit} isBlocker={ch.responsible === order.blockedBy && ch.status !== 'Kész' && ch.status !== 'Nem szükséges'} onSave={(patch) => saveChapter(ch, patch)} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between pt-2">
          <button onClick={onClose} className="btn-mil-secondary text-xs">Bezárás</button>
          {canEdit && (
            <button onClick={onDelete} className="btn-mil-danger text-xs flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" />
              Törlés
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ChapterRow({ chapter, canEdit, isBlocker, onSave }: {
  chapter: OrderChapter; canEdit: boolean; isBlocker: boolean; onSave: (patch: Partial<OrderChapter>) => Promise<void>;
}) {
  const [assignee, setAssignee] = useState(chapter.assignee);
  const [note, setNote] = useState(chapter.note);
  useEffect(() => { setAssignee(chapter.assignee); setNote(chapter.note); }, [chapter]);

  const commitText = () => {
    if (assignee !== chapter.assignee || note !== chapter.note) void onSave({ assignee, note });
  };

  return (
    <tr className={isBlocker ? 'bg-amber-400/5' : ''}>
      <td className="font-mono text-xs text-muted-foreground">{chapter.position + 1}</td>
      <td className="font-medium">
        {chapter.name}
        {!chapter.required && <span className="ml-2 text-[10px] font-mono text-muted-foreground uppercase">opcionális</span>}
      </td>
      <td className="font-mono text-xs text-primary">{chapter.responsible}</td>
      <td>
        {canEdit ? (
          <select value={chapter.status} onChange={(e) => { void onSave({ status: e.target.value as OrderChapterStatus }); }} className={`bg-input border border-border px-2 py-1 text-xs ${chapterStatusClass[chapter.status]}`} style={radius}>
            {CHAPTER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <span className={`text-xs ${chapterStatusClass[chapter.status]}`}>{chapter.status}</span>
        )}
      </td>
      <td>
        <input value={assignee} disabled={!canEdit} onChange={(e) => setAssignee(e.target.value)} onBlur={commitText} placeholder="név" className="w-32 bg-input border border-border px-2 py-1 text-xs" style={radius} />
      </td>
      <td>
        {canEdit ? (
          <DatePickerInput value={chapter.dueDate} onChange={(v) => { void onSave({ dueDate: v }); }} className="w-36" />
        ) : (
          <span className="font-mono text-xs">{chapter.dueDate || '—'}</span>
        )}
      </td>
      <td>
        <input value={note} disabled={!canEdit} onChange={(e) => setNote(e.target.value)} onBlur={commitText} className="w-40 bg-input border border-border px-2 py-1 text-xs" style={radius} />
      </td>
      <td className="font-mono text-[11px] text-muted-foreground">
        {chapter.updatedAt ? `${chapter.updatedBy} · ${chapter.updatedAt.slice(0, 10)}` : '—'}
      </td>
    </tr>
  );
}

// ── Új parancs ─────────────────────────────────────────────────────────────

function NewOrderModal({ open, types, onClose, onCreated }: {
  open: boolean; types: OrderType[]; onClose: () => void; onCreated: () => Promise<void>;
}) {
  const [typeId, setTypeId] = useState('');
  const [subject, setSubject] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [matches, setMatches] = useState<Person[]>([]);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open && !typeId && types.length) setTypeId(types[0].id); }, [open, types, typeId]);

  // Személy-kereső autocomplete (a 1500 fős listához nem dropdown kell).
  useEffect(() => {
    if (selected || personSearch.trim().length < 2) { setMatches([]); return; }
    let active = true;
    const handle = setTimeout(async () => {
      try {
        const result = await personnelStore.getPaged({ page: 1, pageSize: 8, search: personSearch });
        if (active) setMatches(result.items);
      } catch {
        if (active) setMatches([]);
      }
    }, 250);
    return () => { active = false; clearTimeout(handle); };
  }, [personSearch, selected]);

  const reset = () => { setSubject(''); setDueDate(''); setNotes(''); setPersonSearch(''); setMatches([]); setSelected(null); };

  const submit = async () => {
    if (!typeId) { toast.error('Válassz parancstípust.'); return; }
    if (!subject.trim()) { toast.error('A tárgy kötelező.'); return; }
    setSubmitting(true);
    try {
      await store.create({ orderTypeId: typeId, subject: subject.trim(), personnelId: selected?.id ?? '', dueDate, notes });
      toast.success('Parancs létrehozva a típus fejezeteivel.');
      reset();
      await onCreated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedType = types.find((t) => t.id === typeId);

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Új parancs">
      <div className="space-y-3">
        <div>
          <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Parancstípus *</label>
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={inputClass} style={radius}>
            {types.length === 0 && <option value="">Nincs parancstípus — hozz létre egyet</option>}
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {selectedType && (
            <p className="text-[11px] font-mono text-muted-foreground mt-1">
              Fejezetek: {selectedType.chapters.map((c) => `${c.name} (${c.responsible})`).join(' → ')}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Tárgy *</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="pl. Kiss Béla leszerelése" className={inputClass} style={radius} />
        </div>
        <div className="relative">
          <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Érintett személy</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={selected ? selected.name : personSearch}
              onChange={(e) => { setSelected(null); setPersonSearch(e.target.value); }}
              placeholder="Név keresése… (nem kötelező)"
              className={`${inputClass} pl-8`}
              style={radius}
            />
          </div>
          {matches.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-popover border border-border shadow-md max-h-56 overflow-auto" style={radius}>
              {matches.map((p) => (
                <button key={p.id} onClick={() => { setSelected({ id: p.id, name: p.name }); setPersonSearch(''); setMatches([]); if (!subject.trim()) setSubject(`${p.name} – `); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary">
                  <span className="text-foreground">{p.name}</span>
                  <span className="text-muted-foreground"> · {p.rank} · {p.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Határidő</label>
            <DatePickerInput value={dueDate} onChange={setDueDate} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Megjegyzés</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} style={radius} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={() => { reset(); onClose(); }} className="btn-mil-secondary text-xs">Mégsem</button>
          <button onClick={() => { void submit(); }} disabled={submitting || !typeId} className="btn-mil-primary text-xs">
            {submitting ? 'Mentés…' : 'Létrehozás'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Parancstípusok kezelése ────────────────────────────────────────────────

function OrderTypesModal({ open, types, canEdit, onClose, onChanged }: {
  open: boolean; types: OrderType[]; canEdit: boolean; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<OrderType | 'new' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [chapters, setChapters] = useState<OrderChapterTemplate[]>([emptyChapter()]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrderType | null>(null);

  const startEdit = (t: OrderType | 'new') => {
    setEditing(t);
    if (t === 'new') { setName(''); setDescription(''); setChapters([emptyChapter()]); }
    else { setName(t.name); setDescription(t.description); setChapters(t.chapters.map((c) => ({ ...c }))); }
  };

  const updateChapter = (index: number, patch: Partial<OrderChapterTemplate>) =>
    setChapters((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const moveChapter = (index: number, dir: -1 | 1) =>
    setChapters((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const save = async () => {
    const payload = { name: name.trim(), description, chapters: chapters.filter((c) => c.name.trim()) };
    if (!payload.name) { toast.error('A név kötelező.'); return; }
    if (payload.chapters.length === 0) { toast.error('Legalább egy fejezet kell.'); return; }
    setSaving(true);
    try {
      if (editing === 'new') await store.createType(payload);
      else if (editing) await store.updateType(editing.id, payload);
      toast.success('Parancstípus mentve.');
      setEditing(null);
      await onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await store.removeType(deleteTarget.id);
      toast.success('Parancstípus törölve.');
      await onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <Modal open={open} onClose={() => { setEditing(null); onClose(); }} title="Parancstípusok" wide>
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Név *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="pl. Leszerelési parancs" className={inputClass} style={radius} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Leírás</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} style={radius} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A fejezetek sorrendje a munkafolyamat sorrendje — a rendszer a sorrendben első, még el nem készült kötelező fejezet felelősét mutatja mint „feltartja".
          </p>
          <table className="w-full mil-table">
            <thead><tr><th>#</th><th>Fejezet</th><th>Felelős</th><th>Kötelező</th><th></th></tr></thead>
            <tbody>
              {chapters.map((c, i) => (
                <tr key={i}>
                  <td className="font-mono text-xs text-muted-foreground">{i + 1}</td>
                  <td><input value={c.name} onChange={(e) => updateChapter(i, { name: e.target.value })} placeholder="pl. Jogi rész" className="w-full bg-input border border-border px-2 py-1 text-xs" style={radius} /></td>
                  <td>
                    <select value={c.responsible} onChange={(e) => updateChapter(i, { responsible: e.target.value })} className="bg-input border border-border px-2 py-1 text-xs" style={radius}>
                      {RESPONSIBLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td><input type="checkbox" checked={c.required} onChange={(e) => updateChapter(i, { required: e.target.checked })} /></td>
                  <td className="whitespace-nowrap">
                    <button onClick={() => moveChapter(i, -1)} className="text-xs text-muted-foreground hover:text-foreground px-1" title="Feljebb">▲</button>
                    <button onClick={() => moveChapter(i, 1)} className="text-xs text-muted-foreground hover:text-foreground px-1" title="Lejjebb">▼</button>
                    <button onClick={() => setChapters((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-destructive hover:underline px-1">Törlés</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setChapters((prev) => [...prev, emptyChapter()])} className="btn-mil-secondary text-xs">+ Fejezet</button>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditing(null)} className="btn-mil-secondary text-xs">Mégsem</button>
            <button onClick={() => { void save(); }} disabled={saving} className="btn-mil-primary text-xs">{saving ? 'Mentés…' : 'Mentés'}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {types.length === 0 ? (
            <p className="text-sm text-muted-foreground">Még nincs parancstípus. Az első lépés: a típus és a fejezetei, felelősökkel.</p>
          ) : (
            <table className="w-full mil-table">
              <thead><tr><th>Név</th><th>Fejezetek</th><th>Parancsok</th>{canEdit && <th></th>}</tr></thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium">{t.name}{t.description && <span className="block text-xs text-muted-foreground">{t.description}</span>}</td>
                    <td className="text-xs text-muted-foreground">{t.chapters.map((c) => `${c.name} (${c.responsible})`).join(' → ')}</td>
                    <td className="font-mono text-xs">{t.orderCount}</td>
                    {canEdit && (
                      <td className="whitespace-nowrap">
                        <button onClick={() => startEdit(t)} className="text-xs text-primary hover:underline px-1">Szerkesztés</button>
                        <button onClick={() => setDeleteTarget(t)} disabled={t.orderCount > 0} className="text-xs text-destructive hover:underline px-1 disabled:opacity-40 disabled:no-underline" title={t.orderCount > 0 ? 'Vannak hozzá parancsok' : ''}>Törlés</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex justify-between pt-1">
            <button onClick={onClose} className="btn-mil-secondary text-xs">Bezárás</button>
            {canEdit && <button onClick={() => startEdit('new')} className="btn-mil-primary text-xs">+ Új parancstípus</button>}
          </div>
        </div>
      )}
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { void remove(); }} message={`Törlöd a parancstípust: „${deleteTarget?.name}"?`} />
    </Modal>
  );
}
