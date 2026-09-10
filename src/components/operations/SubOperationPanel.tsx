import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { OperationTreeNode } from '@/lib/types';
import DatePickerInput from '@/components/DatePickerInput';
import OperationTree from './OperationTree';

type NewSubOperation = {
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
};

const emptyForm: NewSubOperation = { name: '', type: '', startDate: '', endDate: '', location: '' };

type Props = {
  /** A művelet saját azonosítója — ez a fa gyökere ezen a panelen. */
  rootId: string;
  rootName: string;
  subOperations: OperationTreeNode[];
  /** Melyik csomópontra vonatkozik jelenleg a jelenlét/anyagigény/dokumentum. */
  activeId: string;
  canEdit: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
  onCreate: (payload: NewSubOperation) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

/**
 * Egy művelet részfeladatai. A kiválasztott csomópont adja a többi fül
 * kontextusát: a jelenléti ív részfeladatonként külön vezethető.
 */
export default function SubOperationPanel({
  rootId, rootName, subOperations, activeId, canEdit, busy, onSelect, onCreate, onDelete,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set([rootId]));
  const [form, setForm] = useState<NewSubOperation>(emptyForm);
  const [adding, setAdding] = useState(false);

  const nodes: OperationTreeNode[] = [{
    id: rootId,
    eventType: 'esemeny',
    parentId: null,
    name: `${rootName} (fő művelet)`,
    type: '',
    startDate: '',
    endDate: '',
    location: '',
    organizer: '',
    maxPersonnel: 0,
    description: '',
    status: 'Folyamatban',
    assigned: [],
    children: subOperations,
  }];

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const canSubmit = form.name.trim() && form.startDate && form.endDate && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    await onCreate({ ...form, name: form.name.trim(), type: form.type.trim() || 'Részfeladat' });
    setForm(emptyForm);
    setAdding(false);
  };

  const activeChild = subOperations.find(node => node.id === activeId);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        A kiválasztott elem adja a Jelenlét, Anyagigény és Dokumentumok fülek kontextusát.
      </p>

      <OperationTree
        nodes={nodes}
        selectedId={activeId}
        expanded={expanded}
        onToggle={toggle}
        onSelect={onSelect}
      />

      {activeChild && canEdit && (
        <div className="flex items-center justify-between border border-border px-2 py-1.5" style={{ borderRadius: '2px' }}>
          <span className="text-xs text-muted-foreground truncate">Kiválasztva: {activeChild.name}</span>
          <button
            onClick={() => { void onDelete(activeChild.id); }}
            disabled={busy}
            className="btn-mil-danger text-xs inline-flex items-center gap-1 disabled:opacity-50"
          >
            <Trash2 className="w-3 h-3" /> Törlés
          </button>
        </div>
      )}

      {canEdit && (adding ? (
        <div className="space-y-2 border border-border p-3" style={{ borderRadius: '2px' }}>
          <input
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="Részfeladat megnevezése *"
            className="w-full bg-input border border-border px-3 py-2 text-sm"
            style={{ borderRadius: '2px' }}
          />
          <div className="grid grid-cols-2 gap-2">
            <DatePickerInput value={form.startDate} onChange={value => setForm({ ...form, startDate: value })} />
            <DatePickerInput value={form.endDate} onChange={value => setForm({ ...form, endDate: value })} />
          </div>
          <input
            value={form.location}
            onChange={e => setForm({ ...form, location: e.target.value })}
            placeholder="Helyszín"
            className="w-full bg-input border border-border px-3 py-2 text-sm"
            style={{ borderRadius: '2px' }}
          />
          <div className="flex gap-2">
            <button onClick={() => { void submit(); }} disabled={!canSubmit} className="btn-mil-primary text-xs disabled:opacity-50">
              Hozzáadás
            </button>
            <button onClick={() => { setAdding(false); setForm(emptyForm); }} className="btn-mil-secondary text-xs">
              Mégse
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="btn-mil-secondary text-xs inline-flex items-center gap-1">
          <Plus className="w-3 h-3" /> Részfeladat
        </button>
      ))}
    </div>
  );
}
