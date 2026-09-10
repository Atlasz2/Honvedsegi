import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  leave as store,
  personnel as personnelStore,
  getErrorMessage,
  logAction,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
} from '@/lib/store';
import { Person } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import ConfirmDialog from '@/components/ConfirmDialog';
import DatePickerInput from '@/components/DatePickerInput';
import { toast } from 'sonner';
import { Check, Plus, Search, Trash2, X, Palmtree } from 'lucide-react';

const TYPE_OPTIONS: LeaveType[] = ['Szabadság', 'Betegszabadság', 'Kiküldetés', 'Egyéb'];
const STATUS_FILTERS = ['Összes', 'Beadva', 'Jóváhagyva', 'Elutasítva'] as const;

const statusClass: Record<LeaveStatus, string> = {
  'Beadva': 'text-amber-400',
  'Jóváhagyva': 'text-emerald-400',
  'Elutasítva': 'text-destructive',
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Leave() {
  const { canEdit, user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>('Összes');
  const [list, setList] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LeaveRequest | null>(null);

  // Create form
  const [creating, setCreating] = useState(false);
  const [personSearch, setPersonSearch] = useState('');
  const [matches, setMatches] = useState<Person[]>([]);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [type, setType] = useState<LeaveType>('Szabadság');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setList(await store.list(statusFilter));
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Személy-kereső autocomplete (a 1500 fős listához nem dropdown kell).
  useEffect(() => {
    if (selected || personSearch.trim().length < 2) {
      setMatches([]);
      return;
    }
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

  const resetForm = () => {
    setSelected(null);
    setPersonSearch('');
    setMatches([]);
    setType('Szabadság');
    setStartDate(today());
    setEndDate(today());
    setReason('');
  };

  const submit = async () => {
    if (!selected) {
      toast.error('Válassz egy személyt.');
      return;
    }
    if (endDate < startDate) {
      toast.error('A vége nem lehet korábban a kezdetnél.');
      return;
    }
    setSubmitting(true);
    try {
      await store.create({ personnelId: selected.id, type, startDate, endDate, reason });
      await logAction(user!.displayName, user!.username, 'létrehozva', 'Szabadság', `${selected.name} – ${type}`);
      toast.success('Kérelem rögzítve.');
      resetForm();
      setCreating(false);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (item: LeaveRequest, approve: boolean) => {
    try {
      await store.decide(item.id, approve);
      await logAction(user!.displayName, user!.username, 'módosítva', 'Szabadság', `${item.personName} – ${approve ? 'jóváhagyva' : 'elutasítva'}`);
      toast.success(approve ? 'Jóváhagyva.' : 'Elutasítva.');
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await store.remove(deleteTarget.id);
      await logAction(user!.displayName, user!.username, 'törölve', 'Szabadság', deleteTarget.personName);
      toast.success('Törölve.');
      setDeleteTarget(null);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const pendingCount = useMemo(() => list.filter(i => i.status === 'Beadva').length, [list]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-rajdhani tracking-military-wide text-primary flex items-center gap-2">
            <Palmtree className="w-6 h-6" /> Szabadság és távollét
          </h1>
          <p className="text-xs text-muted-foreground tracking-military">
            A jóváhagyott kérelmek automatikusan megjelennek a napi létszámjelentésben.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setCreating(c => !c); resetForm(); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-rajdhani font-semibold tracking-wide transition-opacity"
            style={{ borderRadius: '2px' }}
          >
            <Plus className="w-4 h-4" /> Új kérelem
          </button>
        )}
      </div>

      {/* Create form */}
      {canEdit && creating && (
        <div className="bg-card border border-border p-4 space-y-3" style={{ borderRadius: '2px' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Person picker */}
            <div className="relative">
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Személy *</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={selected ? selected.name : personSearch}
                  onChange={e => { setSelected(null); setPersonSearch(e.target.value); }}
                  placeholder="Név keresése…"
                  className="w-full bg-input border border-border pl-8 pr-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary"
                  style={{ borderRadius: '2px' }}
                />
              </div>
              {matches.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-popover border border-border shadow-md max-h-56 overflow-auto" style={{ borderRadius: '2px' }}>
                  {matches.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setSelected({ id: p.id, name: p.name }); setPersonSearch(''); setMatches([]); }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary"
                    >
                      <span className="text-foreground">{p.name}</span>
                      <span className="text-muted-foreground"> · {p.rank} · {p.unit}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Típus</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as LeaveType)}
                className="w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary"
                style={{ borderRadius: '2px' }}
              >
                {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Kezdet *</label>
              <DatePickerInput value={startDate} onChange={setStartDate} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Vége *</label>
              <DatePickerInput value={endDate} onChange={setEndDate} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Indok</label>
              <input
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary"
                style={{ borderRadius: '2px' }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setCreating(false); resetForm(); }}
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Mégse
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-rajdhani font-semibold tracking-wide disabled:opacity-40"
              style={{ borderRadius: '2px' }}
            >
              Rögzítés
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-sm font-rajdhani tracking-wide border transition-colors ${
              statusFilter === s ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
            style={{ borderRadius: '2px' }}
          >
            {s}{s === 'Beadva' && pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="border border-border" style={{ borderRadius: '2px' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-military text-muted-foreground border-b border-border">
              <th className="px-3 py-2 font-medium">Név</th>
              <th className="px-3 py-2 font-medium">Típus</th>
              <th className="px-3 py-2 font-medium">Időszak</th>
              <th className="px-3 py-2 font-medium">Indok</th>
              <th className="px-3 py-2 font-medium">Állapot</th>
              {canEdit && <th className="px-3 py-2 font-medium text-right">Művelet</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canEdit ? 6 : 5} className="px-3 py-6 text-center text-muted-foreground">Betöltés…</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={canEdit ? 6 : 5} className="px-3 py-6 text-center text-muted-foreground">Nincs kérelem.</td></tr>
            ) : list.map(item => (
              <tr key={item.id} className="border-b border-border/50 hover:bg-secondary/40">
                <td className="px-3 py-2 font-rajdhani text-foreground">{item.personName}</td>
                <td className="px-3 py-2 text-muted-foreground">{item.type}</td>
                <td className="px-3 py-2 text-muted-foreground">{item.startDate} – {item.endDate} <span className="text-xs">({item.days} nap)</span></td>
                <td className="px-3 py-2 text-muted-foreground">{item.reason}</td>
                <td className={`px-3 py-2 font-medium ${statusClass[item.status]}`}>{item.status}</td>
                {canEdit && (
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {item.status === 'Beadva' && (
                        <>
                          <button onClick={() => decide(item, true)} title="Jóváhagyás" className="p-1.5 text-emerald-400 hover:bg-emerald-400/10" style={{ borderRadius: '2px' }}>
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => decide(item, false)} title="Elutasítás" className="p-1.5 text-destructive hover:bg-destructive/10" style={{ borderRadius: '2px' }}>
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button onClick={() => setDeleteTarget(item)} title="Törlés" className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10" style={{ borderRadius: '2px' }}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        message={deleteTarget ? `Biztosan törlöd ${deleteTarget.personName} kérelmét?` : ''}
        onConfirm={remove}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
