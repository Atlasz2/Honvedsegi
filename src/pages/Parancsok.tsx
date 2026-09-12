import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, Copy, FileDown, FileText, Plus, Search, Settings2, Trash2 } from 'lucide-react';
import {
  orders as store,
  personnel as personnelStore,
  getErrorMessage,
  type Order,
  type OrderChapter,
  type OrderChapterStatus,
  type OrderChapterTemplate,
  type OrderOverview,
  type OrderSignature,
  type OrderStatus,
  type OrderType,
} from '@/lib/store';
import type { Person } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import DatePickerInput from '@/components/DatePickerInput';

// A részlegek, amelyek fejezetet írnak. Az ellenjegyzés nem részleg, hanem a
// záró aláírás (2–3 illetékes parancsnok). A backend ORDER_RESPONSIBLES párja.
const RESPONSIBLES = ['Ügyvitel', 'Jog', 'Kiképzés', 'Személyügy', 'Pénzügy'] as const;
const ORDER_STATUSES: OrderStatus[] = ['Előkészítés', 'Aláírásra vár', 'Kiadva', 'Visszavonva'];
const PLACEHOLDERS = ['{{név}}', '{{rendfokozat}}', '{{sztsz}}', '{{alegység}}', '{{tárgy}}', '{{dátum}}', '{{parancsszám}}'];

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
  return { name: '', responsible: 'Ügyvitel', required: true, template: '' };
}

export default function Parancsok() {
  const { canEdit } = useAuth();
  const [list, setList] = useState<Order[]>([]);
  const [overview, setOverview] = useState<OrderOverview | null>(null);
  const [types, setTypes] = useState<OrderType[]>([]);
  const [openOnly, setOpenOnly] = useState(true);
  // A felső kártyák szűrőként működnek: 'overdue' vagy egy részleg neve.
  const [cardFilter, setCardFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [detail, setDetail] = useState<Order | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [creating, setCreating] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [copySource, setCopySource] = useState<Order | null>(null);

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

  // Más oldalról (pl. Figyelmeztetések) érkezve a kért parancs rögtön megnyílik.
  const location = useLocation();
  useEffect(() => {
    const wanted = (location.state as { openOrderId?: string } | null)?.openOrderId;
    if (!wanted) return;
    store.get(wanted).then(setDetail).catch((error) => toast.error(getErrorMessage(error)));
    window.history.replaceState({}, '');
  }, [location.state]);

  const visibleList = list.filter((o) =>
    cardFilter === null ? true : cardFilter === 'overdue' ? o.isOverdue : o.pendingResponsibles.includes(cardFilter));

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
          <p className="text-xs text-muted-foreground font-mono mt-1">A részlegek a saját fejezetüket írják; a parancs ezekből áll össze, a végén az aláírásokkal</p>
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

      {/* Részlegenkénti áttekintő — kattintásra szűri a listát */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
          <button onClick={() => setCardFilter(null)} className={`stats-card border-l-2 border-l-primary text-left transition-colors hover:bg-secondary/40 ${cardFilter === null ? 'ring-1 ring-primary' : ''}`}>
            <div className="stats-number">{overview.openOrders}</div>
            <div className="stats-label">Nyitott parancs</div>
          </button>
          <button onClick={() => setCardFilter(cardFilter === 'overdue' ? null : 'overdue')} className={`stats-card border-l-2 text-left transition-colors hover:bg-secondary/40 ${overview.overdueOrders ? 'border-l-destructive' : 'border-l-border'} ${cardFilter === 'overdue' ? 'ring-1 ring-destructive' : ''}`}>
            <div className="stats-number">{overview.overdueOrders}</div>
            <div className="stats-label">Lejárt határidejű</div>
          </button>
          {overview.byResponsible.map((r) => (
            <button key={r.responsible} onClick={() => setCardFilter(cardFilter === r.responsible ? null : r.responsible)} className={`stats-card border-l-2 text-left transition-colors hover:bg-secondary/40 ${r.blockingOrders ? 'border-l-amber-400' : 'border-l-border'} ${cardFilter === r.responsible ? 'ring-1 ring-amber-400' : ''}`}>
              <div className="stats-number">{r.blockingOrders}</div>
              <div className="stats-label">{r.responsible} — vár rá</div>
              <div className="text-[11px] font-mono text-muted-foreground mt-1">
                {r.openChapters} nyitott fejezet{r.overdueChapters ? ` · ${r.overdueChapters} lejárt` : ''}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
        <label className="flex items-center gap-2 text-xs font-mono text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          Csak a nyitottak
        </label>
        <span className="text-xs font-mono text-muted-foreground">({visibleList.length})</span>
        {cardFilter && (
          <button onClick={() => setCardFilter(null)} className="text-xs font-mono text-primary hover:underline">
            szűrés: {cardFilter === 'overdue' ? 'lejárt határidejű' : `${cardFilter} vár rá`} ×
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground font-mono">Betöltés…</p>
      ) : visibleList.length === 0 ? (
        <div className="bg-card border border-border p-6 text-center" style={radius}>
          <FileText className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {types.length === 0 ? 'Először hozz létre egy parancstípust a fejezeteivel és az aláíróival.' : 'Nincs parancs a szűrésben.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full mil-table">
            <thead>
              <tr><th>Szám</th><th>Tárgy</th><th>Típus</th><th>Határidő</th><th>Állapot</th><th>Fejezetek</th><th>Aláírás</th><th>Még dolgozik rajta</th></tr>
            </thead>
            <tbody>
              {visibleList.map((o) => (
                <tr key={o.id} className="cursor-pointer hover:bg-secondary transition-colors" onClick={() => { void openDetail(o); }}>
                  <td className="font-mono text-xs">{o.number || '—'}</td>
                  <td className="font-medium">{o.subject}</td>
                  <td className="text-xs text-muted-foreground">{o.typeName}</td>
                  <td className="font-mono text-xs">
                    {o.dueDate || '—'}
                    {o.isOverdue && <AlertTriangle className="inline w-3.5 h-3.5 ml-1 text-destructive" />}
                  </td>
                  <td><span className={orderStatusClass[o.status]}>{o.status}</span></td>
                  <td className="font-mono text-xs">{o.doneChapters} / {o.totalChapters}</td>
                  <td className="font-mono text-xs">{o.signedCount} / {o.signatures.length}</td>
                  <td className="text-xs">
                    {o.pendingResponsibles.length > 0
                      ? <span className="text-amber-400 font-mono">{o.pendingResponsibles.join(', ')}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
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
          onCopy={() => setCopySource(detail)}
        />
      )}

      <CopyOrderModal
        source={copySource}
        onClose={() => setCopySource(null)}
        onCopied={async (created) => { setCopySource(null); setDetail(created); await refresh(); }}
      />

      <NewOrderModal open={creating} types={types} onClose={() => setCreating(false)} onCreated={async () => { setCreating(false); await refresh(); }} />

      <OrderTypesModal open={typesOpen} types={types} canEdit={canEdit} onClose={() => setTypesOpen(false)} onChanged={refresh} />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { void remove(); }}
        message={`Törlöd a parancsot: „${deleteTarget?.subject}"? A fejezetek szövege is elvész.`}
      />
    </div>
  );
}

// ── Parancs részlete: a dokumentum egyben, a fejezetek a helyükön írhatók ──
//
// Egyetlen nézet: a parancs úgy látszik, ahogy kiadva fog kinézni. Minden
// fejezet a saját helyén szerkeszthető. A még el nem fogadott (sablonból jött
// vagy folyamatban lévő) szöveg FÉLKÖVÉR, az elfogadott (Kész) normál
// vastagságú — így ránézésre látszik, mi van még hátra. A margón fejezetenként
// ott van a részleg, ki nyúlt hozzá utoljára és mikor.

export function OrderDetailModal({ order, canEdit, onClose, onChanged, onDelete, onCopy }: {
  order: Order; canEdit: boolean; onClose: () => void; onChanged: (o: Order) => void; onDelete: () => void; onCopy: () => void;
}) {
  const [metaOpen, setMetaOpen] = useState(false);
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [number, setNumber] = useState(order.number);
  const [issuer, setIssuer] = useState(order.issuer);
  const [dueDate, setDueDate] = useState(order.dueDate);
  const [issuedDate, setIssuedDate] = useState(order.issuedDate);
  const [notes, setNotes] = useState(order.notes);
  const [signatures, setSignatures] = useState<OrderSignature[]>(order.signatures);
  const [addingChapter, setAddingChapter] = useState(false);
  const [newChapter, setNewChapter] = useState<OrderChapterTemplate>(emptyChapter());
  const [removeChapter, setRemoveChapter] = useState<OrderChapter | null>(null);

  useEffect(() => {
    setStatus(order.status); setNumber(order.number); setIssuer(order.issuer);
    setDueDate(order.dueDate); setIssuedDate(order.issuedDate); setNotes(order.notes);
    setSignatures(order.signatures);
  }, [order]);

  const metaDirty = status !== order.status || number !== order.number || issuer !== order.issuer
    || dueDate !== order.dueDate || issuedDate !== order.issuedDate || notes !== order.notes;
  const visible = order.chapters.filter((ch) => ch.status !== 'Nem szükséges');
  const skipped = order.chapters.filter((ch) => ch.status === 'Nem szükséges');

  const saveMeta = async () => {
    try {
      onChanged(await store.update(order.id, { subject: order.subject, status, number, issuer, dueDate, issuedDate, notes }));
      toast.success('Parancs adatai mentve.');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const saveChapter = async (chapter: OrderChapter, patch: Partial<OrderChapter>) => {
    try {
      onChanged(await store.updateChapter(order.id, chapter.id, {
        status: patch.status ?? chapter.status,
        content: patch.content ?? chapter.content,
        assignee: patch.assignee ?? chapter.assignee,
        dueDate: patch.dueDate ?? chapter.dueDate,
        note: patch.note ?? chapter.note,
      }));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  // Az aláírás egy kattintás: a jelölőnégyzet azonnal ment. A név kikattintáskor.
  const saveSignatures = async (next: OrderSignature[]) => {
    setSignatures(next);
    try {
      onChanged(await store.updateSignatures(order.id, next.map(({ role, name, signed }) => ({ role, name, signed }))));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const addChapter = async () => {
    try {
      onChanged(await store.addChapter(order.id, { ...newChapter, name: newChapter.name.trim() }));
      setNewChapter(emptyChapter());
      setAddingChapter(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const doRemoveChapter = async () => {
    if (!removeChapter) return;
    try {
      onChanged(await store.removeChapter(order.id, removeChapter.id));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const download = async (format: 'docx' | 'pdf') => {
    try {
      await (format === 'docx' ? store.exportDocx(order.id, order.number) : store.exportPdf(order.id, order.number));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <Modal open onClose={onClose} title={`${order.number ? `${order.number} — ` : ''}${order.subject}`} wide>
      <div className="space-y-4">
        {/* Állapotsor + műveletek */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <span className={orderStatusClass[order.status]}>{order.status}</span>
            <span className="text-muted-foreground">{order.typeName}</span>
            {order.personName && <span className="text-muted-foreground">· {order.personName}</span>}
            <span className="text-muted-foreground">· fejezet {order.doneChapters}/{order.totalChapters} · aláírás {order.signedCount}/{order.signatures.length}</span>
            {order.pendingResponsibles.length > 0
              ? <span className="text-amber-400">még dolgozik rajta: {order.pendingResponsibles.join(', ')}</span>
              : <span className="text-emerald-400">minden fejezet elfogadva</span>}
          </div>
          <div className="flex gap-2">
            {canEdit && <button onClick={onCopy} title="Ugyanez a parancs más személyre" className="btn-mil-secondary text-xs flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" />Másolás</button>}
            <button onClick={() => setMetaOpen((v) => !v)} className="btn-mil-secondary text-xs flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" />Adatok</button>
            <button onClick={() => { void download('docx'); }} className="btn-mil-secondary text-xs flex items-center gap-1.5"><FileDown className="w-3.5 h-3.5" />Word</button>
            <button onClick={() => { void download('pdf'); }} className="btn-mil-secondary text-xs flex items-center gap-1.5"><FileDown className="w-3.5 h-3.5" />PDF</button>
          </div>
        </div>

        {metaOpen && (
          <div className="border border-border p-3 space-y-3" style={radius}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Parancs száma</label>
                <input value={number} disabled={!canEdit} onChange={(e) => setNumber(e.target.value)} placeholder="pl. 12/2026" className={inputClass} style={radius} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Kiadó (fejléc)</label>
                <input value={issuer} disabled={!canEdit} onChange={(e) => setIssuer(e.target.value)} className={inputClass} style={radius} />
              </div>
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
                <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Kelt (kiadás dátuma)</label>
                {canEdit ? <DatePickerInput value={issuedDate} onChange={setIssuedDate} /> : <p className="font-mono text-sm py-2">{issuedDate || '—'}</p>}
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Belső megjegyzés (nem kerül a dokumentumba)</label>
                <input value={notes} disabled={!canEdit} onChange={(e) => setNotes(e.target.value)} className={inputClass} style={radius} />
              </div>
            </div>
            {canEdit && (
              <div className="flex justify-end">
                <button onClick={() => { void saveMeta(); }} disabled={!metaDirty} className="btn-mil-primary text-xs">Adatok mentése</button>
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] font-mono text-muted-foreground">
          <span className="font-bold text-foreground">Félkövér</span> = még nem elfogadott szöveg (sablon vagy folyamatban); normál = a részleg elfogadta. A fejezetbe kattintva a helyén írható át.
        </p>

        {/* Az irat egyben */}
        <div className="bg-background border border-border px-6 py-8 md:px-12 md:py-10 text-sm leading-relaxed" style={radius}>
          <div className="flex justify-between text-xs font-mono mb-6">
            <span className="font-semibold">{order.issuer}</span>
            <span>Nyt. szám: {order.number || '________'}</span>
          </div>
          <h2 className="text-center font-bold text-base uppercase tracking-wide mb-4">
            {order.number ? `${order.number}. számú ` : ''}{order.typeName}
          </h2>
          <p className="mb-1"><span className="font-semibold">Tárgy:</span> {order.subject}</p>
          {order.personName && <p className="mb-4"><span className="font-semibold">Érintett:</span> {order.personName}</p>}

          <div className="mt-4">
            {visible.map((ch, index) => (
              <InlineChapter key={ch.id} index={index + 1} chapter={ch} canEdit={canEdit} onSave={(patch) => saveChapter(ch, patch)} onRemove={() => setRemoveChapter(ch)} />
            ))}
          </div>

          {canEdit && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-mono">
              {addingChapter ? (
                <>
                  <input value={newChapter.name} onChange={(e) => setNewChapter({ ...newChapter, name: e.target.value })} placeholder="Fejezet neve" className="w-48 bg-input border border-border px-2 py-1 text-xs" style={radius} />
                  <select value={newChapter.responsible} onChange={(e) => setNewChapter({ ...newChapter, responsible: e.target.value })} className="bg-input border border-border px-2 py-1 text-xs" style={radius}>
                    {RESPONSIBLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-muted-foreground"><input type="checkbox" checked={newChapter.required} onChange={(e) => setNewChapter({ ...newChapter, required: e.target.checked })} />kötelező</label>
                  <button type="button" onClick={() => { void addChapter(); }} disabled={!newChapter.name.trim()} className="btn-mil-primary text-[11px] px-2 py-0.5">Felvesz</button>
                  <button type="button" onClick={() => setAddingChapter(false)} className="btn-mil-secondary text-[11px] px-2 py-0.5">Mégsem</button>
                </>
              ) : (
                <button type="button" onClick={() => setAddingChapter(true)} className="text-muted-foreground hover:text-foreground hover:underline">+ fejezet ehhez a parancshoz</button>
              )}
            </div>
          )}

          {skipped.length > 0 && (
            <p className="mt-4 text-[11px] font-mono text-muted-foreground">
              Nem szükséges ebben a parancsban: {skipped.map((ch) => ch.name).join(', ')}
              {canEdit && (
                <>
                  {' — '}
                  {skipped.map((ch) => (
                    <button key={ch.id} onClick={() => { void saveChapter(ch, { status: 'Nincs elkezdve' }); }} className="underline hover:text-foreground mr-2">
                      {ch.name} visszavétele
                    </button>
                  ))}
                </>
              )}
            </p>
          )}

          <p className="mt-8 font-mono text-xs">{order.issuedDate ? `Kelt: ${order.issuedDate}` : 'Kelt: ____________________'}</p>

          <div className="mt-8 grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(1, signatures.length)}, minmax(0, 1fr))` }}>
            {signatures.map((sig, i) => (
              <div key={i} className="text-center text-xs relative group">
                {canEdit && !sig.signed && (
                  <button
                    type="button"
                    title="Aláírás-hely törlése"
                    onClick={() => { void saveSignatures(signatures.filter((_, j) => j !== i)); }}
                    className="absolute -top-1 right-1 text-destructive text-[11px] opacity-0 group-hover:opacity-100 hover:underline"
                  >
                    törlés
                  </button>
                )}
                <div className="border-t border-foreground/60 mx-4 mb-2" />
                {canEdit ? (
                  <input
                    value={sig.name}
                    onChange={(e) => setSignatures((prev) => prev.map((s, j) => (j === i ? { ...s, name: e.target.value } : s)))}
                    onBlur={() => { if (sig.name !== order.signatures[i]?.name) void saveSignatures(signatures); }}
                    placeholder="(név)"
                    className="w-full bg-transparent border-b border-dashed border-border px-2 py-1 text-xs text-center font-semibold focus:outline-none focus:border-primary"
                  />
                ) : (
                  <p className="font-semibold">{sig.name || '(név)'}</p>
                )}
                {canEdit ? (
                  <input
                    value={sig.role}
                    onChange={(e) => setSignatures((prev) => prev.map((s, j) => (j === i ? { ...s, role: e.target.value } : s)))}
                    onBlur={() => { if (sig.role !== order.signatures[i]?.role) void saveSignatures(signatures); }}
                    placeholder="(beosztás)"
                    className="w-full bg-transparent border-b border-dashed border-transparent hover:border-border px-2 py-0.5 text-xs text-center text-muted-foreground focus:outline-none focus:border-primary"
                  />
                ) : (
                  <p className="text-muted-foreground mt-1">{sig.role}</p>
                )}
                <label className={`mt-2 inline-flex items-center gap-1.5 font-mono ${sig.signed ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                  <input
                    type="checkbox"
                    checked={sig.signed}
                    disabled={!canEdit || !order.readyToSign}
                    onChange={(e) => { void saveSignatures(signatures.map((s, j) => (j === i ? { ...s, signed: e.target.checked } : s))); }}
                  />
                  {sig.signed ? 'aláírva' : 'aláírás'}
                </label>
              </div>
            ))}
          </div>
          {canEdit && (
            <div className="mt-3 text-right">
              <button type="button" onClick={() => { void saveSignatures([...signatures, { role: 'Parancsnok', name: '', signed: false, signedAt: '', signedBy: '' }]); }} className="text-[11px] font-mono text-muted-foreground hover:text-foreground hover:underline">
                + aláírás-hely
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-mono text-muted-foreground">
            {order.readyToSign
              ? `Minden kötelező fejezet elfogadva — aláírható (${order.signedCount}/${order.signatures.length}).`
              : `Aláírásra akkor kerülhet, ha minden kötelező fejezet elfogadott (még: ${order.pendingResponsibles.join(', ')}).`}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-mil-secondary text-xs">Bezárás</button>
            {canEdit && (
              <button onClick={onDelete} className="btn-mil-danger text-xs flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" />
                Törlés
              </button>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog open={!!removeChapter} onClose={() => setRemoveChapter(null)} onConfirm={() => { void doRemoveChapter(); }} message={`Törlöd a fejezetet: „${removeChapter?.name}"? A szövege elvész.`} />
    </Modal>
  );
}

/** Egy fejezet a dokumentumban: a szöveg a helyén írható, a margón a részleg és a nyoma. */
function InlineChapter({ index, chapter, canEdit, onSave, onRemove }: {
  index: number; chapter: OrderChapter; canEdit: boolean; onSave: (patch: Partial<OrderChapter>) => Promise<void>; onRemove?: () => void;
}) {
  const [content, setContent] = useState(chapter.content);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => setContent(chapter.content), [chapter]);
  // A szövegdoboz a tartalomhoz nő, hogy irat maradjon, ne űrlap.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [content]);

  const accepted = chapter.status === 'Kész';
  const dirty = content !== chapter.content;
  const trace = chapter.updatedAt ? `${chapter.updatedBy} · ${chapter.updatedAt.slice(0, 10)}` : 'még senki nem nyúlt hozzá';

  const run = async (patch: Partial<OrderChapter>) => {
    setSaving(true);
    try {
      await onSave({ content, ...patch });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`grid grid-cols-1 md:grid-cols-[1fr_11rem] gap-x-4 gap-y-1 py-2 -mx-2 px-2 ${accepted ? '' : 'bg-amber-400/5'}`} style={radius}>
      <div>
        <p className="font-semibold mb-1">{index}. {chapter.name}</p>
        {canEdit ? (
          <textarea
            ref={ref}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={() => { if (dirty) void run({ status: accepted ? 'Folyamatban' : chapter.status }); }}
            placeholder={`[${chapter.responsible} — a fejezet még üres]`}
            spellCheck={false}
            className={`w-full resize-none overflow-hidden bg-transparent border-l-2 pl-3 py-0.5 text-sm leading-relaxed focus:outline-none focus:border-primary ${accepted ? 'font-normal border-transparent' : 'font-bold border-amber-400/60'}`}
          />
        ) : (
          <p className={`whitespace-pre-wrap border-l-2 pl-3 ${accepted ? 'font-normal border-transparent' : 'font-bold border-amber-400/60'}`}>
            {chapter.content.trim() || <span className="italic text-muted-foreground">[A fejezet még nem készült el.]</span>}
          </p>
        )}
      </div>
      <div className="text-[11px] font-mono text-muted-foreground md:pt-6 space-y-1">
        <p><span className="mono-chip">{chapter.responsible}</span>{!chapter.required && <span className="ml-1 uppercase">opcionális</span>}</p>
        <p className={chapterStatusClass[chapter.status]}>{chapter.status}</p>
        <p>{trace}</p>
        {chapter.assignee && <p>dolgozik rajta: {chapter.assignee}</p>}
        {chapter.dueDate && <p>határidő: {chapter.dueDate}</p>}
        {canEdit && (
          <div className="flex flex-wrap gap-1 pt-1">
            {dirty && (
              <button onClick={() => { void run({ status: accepted ? 'Folyamatban' : chapter.status }); }} disabled={saving} className="btn-mil-secondary text-[11px] px-2 py-0.5">
                {saving ? '…' : 'Mentés'}
              </button>
            )}
            {!accepted ? (
              <button onClick={() => { void run({ status: 'Kész' }); }} disabled={saving} className="btn-mil-primary text-[11px] px-2 py-0.5">Elfogadom</button>
            ) : (
              <button onClick={() => { void run({ status: 'Folyamatban' }); }} disabled={saving} className="btn-mil-secondary text-[11px] px-2 py-0.5">Visszanyitás</button>
            )}
            {!accepted && !chapter.required && (
              <button onClick={() => { void run({ status: 'Nem szükséges' }); }} disabled={saving} className="btn-mil-secondary text-[11px] px-2 py-0.5">Nem kell</button>
            )}
            {!accepted && onRemove && (
              <button onClick={onRemove} disabled={saving} title="Fejezet törlése a parancsról" className="text-[11px] text-destructive hover:underline px-1">Törlés</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Másolás más személyre ──────────────────────────────────────────────────

function CopyOrderModal({ source, onClose, onCopied }: { source: Order | null; onClose: () => void; onCopied: (o: Order) => Promise<void> }) {
  const [subject, setSubject] = useState('');
  const [number, setNumber] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [matches, setMatches] = useState<Person[]>([]);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!source) return;
    setSubject(''); setNumber(''); setDueDate(''); setPersonSearch(''); setMatches([]); setSelected(null);
  }, [source]);

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

  // A tárgyat az eredetiből képezzük: a régi nevet az újra cseréljük.
  const pickPerson = (p: Person) => {
    setSelected({ id: p.id, name: p.name });
    setPersonSearch('');
    setMatches([]);
    if (!subject.trim() && source) {
      setSubject(source.personName && source.subject.includes(source.personName) ? source.subject.replace(source.personName, p.name) : `${p.name} – ${source.subject}`);
    }
  };

  const submit = async () => {
    if (!source) return;
    if (!subject.trim()) { toast.error('A tárgy kötelező.'); return; }
    setSubmitting(true);
    try {
      const created = await store.copy(source.id, { subject: subject.trim(), personnelId: selected?.id ?? '', number: number.trim(), dueDate });
      toast.success('Parancs lemásolva — a fejezetek szövege az új személyre igazítva, az állapotok nulláról indulnak.');
      await onCopied(created);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={!!source} onClose={onClose} title={`Másolás: ${source?.subject ?? ''}`}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Ugyanez a típus és fejezet-szerkezet, a szövegben az eredeti személy neve, rendfokozata és SZTSZ-e az újéra cserélve. Az elfogadások és aláírások nem másolódnak.</p>
        <div className="relative">
          <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Új érintett személy</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={selected ? selected.name : personSearch} onChange={(e) => { setSelected(null); setPersonSearch(e.target.value); }} placeholder="Név keresése…" className={`${inputClass} pl-8`} style={radius} />
          </div>
          {matches.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-popover border border-border shadow-md max-h-56 overflow-auto" style={radius}>
              {matches.map((p) => (
                <button key={p.id} onClick={() => pickPerson(p)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary">
                  <span className="text-foreground">{p.name}</span><span className="text-muted-foreground"> · {p.rank} · {p.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_10rem] gap-3">
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Tárgy *</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} style={radius} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Parancs száma</label>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="13/2026" className={inputClass} style={radius} />
          </div>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Határidő</label>
          <DatePickerInput value={dueDate} onChange={setDueDate} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-mil-secondary text-xs">Mégsem</button>
          <button onClick={() => { void submit(); }} disabled={submitting} className="btn-mil-primary text-xs">{submitting ? 'Másolás…' : 'Másolat létrehozása'}</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Új parancs ─────────────────────────────────────────────────────────────

function NewOrderModal({ open, types, onClose, onCreated }: {
  open: boolean; types: OrderType[]; onClose: () => void; onCreated: () => Promise<void>;
}) {
  const [typeId, setTypeId] = useState('');
  const [subject, setSubject] = useState('');
  const [number, setNumber] = useState('');
  const [dueDate, setDueDate] = useState('');
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

  const reset = () => { setSubject(''); setNumber(''); setDueDate(''); setPersonSearch(''); setMatches([]); setSelected(null); };

  const submit = async () => {
    if (!typeId) { toast.error('Válassz parancstípust.'); return; }
    if (!subject.trim()) { toast.error('A tárgy kötelező.'); return; }
    setSubmitting(true);
    try {
      await store.create({ orderTypeId: typeId, subject: subject.trim(), number: number.trim(), personnelId: selected?.id ?? '', dueDate });
      toast.success('Parancs létrehozva — a fejezetek a sablonból kitöltve, szerkeszthetők.');
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
              Fejezetek: {selectedType.chapters.map((c) => `${c.name} (${c.responsible})`).join(' · ')} — aláírók: {selectedType.signers.join(', ')}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_10rem] gap-3">
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Tárgy *</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="pl. Kiss Béla leszerelése" className={inputClass} style={radius} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Parancs száma</label>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="12/2026" className={inputClass} style={radius} />
          </div>
        </div>
        <div className="relative">
          <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Érintett személy (a sablon helyőrzőit ebből tölti ki)</label>
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
        <div>
          <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Határidő</label>
          <DatePickerInput value={dueDate} onChange={setDueDate} />
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

export function OrderTypesModal({ open, types, canEdit, onClose, onChanged }: {
  open: boolean; types: OrderType[]; canEdit: boolean; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<OrderType | 'new' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [chapters, setChapters] = useState<OrderChapterTemplate[]>([emptyChapter()]);
  const [signers, setSigners] = useState<string[]>(['Parancsnok']);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrderType | null>(null);

  const startEdit = (t: OrderType | 'new') => {
    setEditing(t);
    if (t === 'new') { setName(''); setDescription(''); setChapters([emptyChapter()]); setSigners(['Parancsnok']); }
    else { setName(t.name); setDescription(t.description); setChapters(t.chapters.map((c) => ({ ...c }))); setSigners([...t.signers]); }
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
    const payload = { name: name.trim(), description, chapters: chapters.filter((c) => c.name.trim()), signers: signers.filter((s) => s.trim()) };
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
            A fejezetek sorrendje a dokumentum sorrendje; a részlegek egymástól függetlenül írják őket. A sablon-szövegben helyőrzők használhatók: {PLACEHOLDERS.join(' ')}.
          </p>
          <div className="space-y-2">
            {chapters.map((c, i) => (
              <div key={i} className="border border-border p-2 space-y-2" style={radius}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{i + 1}.</span>
                  <input value={c.name} onChange={(e) => updateChapter(i, { name: e.target.value })} placeholder="Fejezet neve, pl. Jogi rész" className="flex-1 min-w-[10rem] bg-input border border-border px-2 py-1 text-xs" style={radius} />
                  <select value={c.responsible} onChange={(e) => updateChapter(i, { responsible: e.target.value })} className="bg-input border border-border px-2 py-1 text-xs" style={radius}>
                    {RESPONSIBLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
                    <input type="checkbox" checked={c.required} onChange={(e) => updateChapter(i, { required: e.target.checked })} />
                    kötelező
                  </label>
                  <button onClick={() => moveChapter(i, -1)} className="text-xs text-muted-foreground hover:text-foreground px-1" title="Feljebb">▲</button>
                  <button onClick={() => moveChapter(i, 1)} className="text-xs text-muted-foreground hover:text-foreground px-1" title="Lejjebb">▼</button>
                  <button onClick={() => setChapters((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-destructive hover:underline px-1">Törlés</button>
                </div>
                <textarea value={c.template} onChange={(e) => updateChapter(i, { template: e.target.value })} rows={3} placeholder="Sablon-szöveg (a parancs létrehozásakor ez kerül a fejezetbe, helyőrzőkkel kitöltve)" className="w-full bg-input border border-border px-2 py-1 text-xs" style={radius} />
              </div>
            ))}
          </div>
          <button onClick={() => setChapters((prev) => [...prev, emptyChapter()])} className="btn-mil-secondary text-xs">+ Fejezet</button>

          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Aláírók (illetékes parancsnokok szerepe, a dokumentum végén)</label>
            <div className="space-y-1">
              {signers.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground w-4">{i + 1}.</span>
                  <input value={s} onChange={(e) => setSigners((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} placeholder="pl. Parancsnok" className="w-56 bg-input border border-border px-2 py-1 text-xs" style={radius} />
                  <button type="button" title="Aláíró törlése" onClick={() => setSigners((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-destructive hover:underline px-1">Törlés</button>
                </div>
              ))}
              <button type="button" onClick={() => setSigners((prev) => [...prev, ''])} className="btn-mil-secondary text-xs">+ Aláíró</button>
              {signers.length === 0 && <p className="text-[11px] font-mono text-amber-400">Legalább egy aláíró kell a kiadáshoz.</p>}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditing(null)} className="btn-mil-secondary text-xs">Mégsem</button>
            <button onClick={() => { void save(); }} disabled={saving} className="btn-mil-primary text-xs">{saving ? 'Mentés…' : 'Mentés'}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {types.length === 0 ? (
            <p className="text-sm text-muted-foreground">Még nincs parancstípus. Az első lépés: a típus, a fejezetei (részleg + sablon-szöveg) és az aláírói.</p>
          ) : (
            <table className="w-full mil-table">
              <thead><tr><th>Név</th><th>Fejezetek</th><th>Aláírók</th><th>Parancsok</th>{canEdit && <th></th>}</tr></thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium">{t.name}{t.description && <span className="block text-xs text-muted-foreground">{t.description}</span>}</td>
                    <td className="text-xs text-muted-foreground">{t.chapters.map((c) => `${c.name} (${c.responsible})`).join(' · ')}</td>
                    <td className="text-xs text-muted-foreground">{t.signers.join(', ')}</td>
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
