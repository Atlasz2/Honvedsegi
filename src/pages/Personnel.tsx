import React, { useState, useEffect, useCallback } from 'react';
import { personnel as store, logAction, getErrorMessage } from '@/lib/store';
import { Person } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

const RANKS = ['Közlegény','Tizedes','Szakaszvezető','Őrmester','Törzsőrmester','Főtörzsőrmester','Zászlós','Törzszászlós','Főtörzszászlós','Hadnagy','Főhadnagy','Százados','Őrnagy','Alezredes','Ezredes'];
const STATUSES = ['Aktív','Tartalékos','Szabadságon','Leszerelt'] as const;
const UNIT_OPTIONS = ['31 TVZ', '83 TVZ', '19 TVZ', 'Ezredtörzs'] as const;

const statusClass: Record<string, string> = {
  'Aktív': 'badge-active', 'Tartalékos': 'badge-reserve', 'Szabadságon': 'badge-leave', 'Leszerelt': 'badge-discharged',
};

const emptyPerson: Omit<Person, 'id'> = {
  name: '',
  sztsz: '',
  rank: 'Közlegény',
  unit: '31 TVZ',
  status: 'Aktív',
  email: '',
  phone: '',
  birthDate: '',
  address: '',
  joinDate: '',
  notes: '',
};

type PersonForm = Omit<Person, 'id'>;

type FormFieldProps = {
  label: string;
  field: keyof PersonForm;
  form: PersonForm;
  setForm: React.Dispatch<React.SetStateAction<PersonForm>>;
  errors: Record<string, string>;
  type?: string;
  required?: boolean;
  maxLength?: number;
};

function FormField({ label, field, form, setForm, errors, type = 'text', required, maxLength }: FormFieldProps) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">{label}{required && ' *'}</label>
      {type === 'textarea' ? (
        <textarea
          value={form[field] as string}
          onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
          className="w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary resize-none h-20"
          style={{ borderRadius: '2px' }}
        />
      ) : (
        <input
          type={type}
          maxLength={maxLength}
          value={form[field] as string}
          onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
          className="w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary"
          style={{ borderRadius: '2px' }}
        />
      )}
      {errors[field] && <p className="text-destructive text-xs mt-1">{errors[field]}</p>}
    </div>
  );
}

export default function Personnel() {
  const { canEdit, user } = useAuth();
  const [data, setData] = useState<Person[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('Összes');
  const [unitFilter, setUnitFilter] = useState<string>('Összes');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Person | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<PersonForm>(emptyPerson);
  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const refresh = useCallback(async () => {
    try {
      const result = await store.getPaged({
        page,
        pageSize,
        search,
        unit: unitFilter,
        status: statusFilter,
      });
      setData(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setPage(result.page);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [page, pageSize, search, unitFilter, statusFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const id = setTimeout(() => {
      setPage(1);
      setSearch(searchInput);
    }, 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Kötelező mező';
    if (!form.sztsz.trim()) e.sztsz = 'Kötelező mező';
    if (!/^\d{8}$/.test(form.sztsz.trim())) e.sztsz = 'Pontosan 8 számjegy';
    if (!form.unit.trim()) e.unit = 'Kötelező mező';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      const normalizedForm = { ...form, sztsz: form.sztsz.trim() };
      if (editing) {
        await store.update({ ...editing, ...normalizedForm });
        await logAction(user!.displayName, user!.username, 'módosítva', 'Személyek', normalizedForm.name);
      } else {
        await store.add(normalizedForm);
        await logAction(user!.displayName, user!.username, 'létrehozva', 'Személyek', normalizedForm.name);
      }
      toast.success('Sikeresen mentve');
      setEditing(null);
      setCreating(false);
      setPage(1);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDelete = async (p: Person) => {
    try {
      await store.remove(p.id);
      await logAction(user!.displayName, user!.username, 'törölve', 'Személyek', p.name);
      toast.success('Törölve');
      setDeleteTarget(null);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const statusCounts = { Aktív: 0, Tartalékos: 0, Szabadságon: 0, Leszerelt: 0 };
  data.forEach(p => { if (p.status in statusCounts) statusCounts[p.status as keyof typeof statusCounts]++; });

  const openCreate = () => { setForm({ ...emptyPerson }); setErrors({}); setCreating(true); };
  const openEdit = (p: Person) => {
    setForm({
      name: p.name,
      sztsz: p.sztsz,
      rank: p.rank,
      unit: UNIT_OPTIONS.includes(p.unit as typeof UNIT_OPTIONS[number]) ? p.unit : UNIT_OPTIONS[0],
      status: p.status,
      email: p.email,
      phone: p.phone,
      birthDate: p.birthDate,
      address: p.address,
      joinDate: p.joinDate,
      notes: p.notes,
    });
    setErrors({});
    setEditing(p);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Személyek</h1>
        {canEdit && <button onClick={openCreate} className="btn-mil-primary flex items-center gap-2 text-xs"><Plus className="w-4 h-4" />Új személy</button>}
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {(['Aktív','Tartalékos','Szabadságon','Leszerelt'] as const).map(s => (
          <div key={s} className="stats-card">
            <div className="stats-number">{statusCounts[s]}</div>
            <div className="stats-label">{s}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Keresés név/SZTSz/rf/alegység..."
            className="w-full bg-input border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
            style={{ borderRadius: '2px' }}
          />
        </div>

        <select
          value={unitFilter}
          onChange={e => { setUnitFilter(e.target.value); setPage(1); }}
          className="bg-input border border-border px-3 py-2 text-xs uppercase tracking-military font-mono"
          style={{ borderRadius: '2px' }}
        >
          <option value="Összes">Minden alegység</option>
          {UNIT_OPTIONS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
        </select>

        {['Összes', ...STATUSES].map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 text-xs uppercase tracking-military font-mono transition-colors ${statusFilter === s ? 'btn-mil-primary' : 'btn-mil-secondary'}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border overflow-hidden" style={{ borderRadius: '2px' }}>
        <table className="w-full mil-table">
          <thead><tr>
            <th>Név</th><th>SZTSz</th><th>Rendfokozat</th><th>Alakulat</th><th>Státusz</th><th>Email</th><th>Telefon</th><th>Belépés</th>
            {canEdit && <th>Műveletek</th>}
          </tr></thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground font-mono py-8">Nincs adat</td></tr>}
            {data.map(p => (
              <tr key={p.id}>
                <td className="font-semibold">{p.name}</td>
                <td className="font-mono text-primary text-xs">{p.sztsz}</td>
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

      <div className="flex items-center justify-between mt-4 text-xs font-mono text-muted-foreground">
        <div>Összes találat: {total}</div>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="bg-input border border-border px-2 py-1"
            style={{ borderRadius: '2px' }}
          >
            {[25, 50, 100].map(size => <option key={size} value={size}>{size}/oldal</option>)}
          </select>
          <button onClick={() => setPage(prev => Math.max(1, prev - 1))} className="btn-mil-secondary text-xs" disabled={page <= 1}>Előző</button>
          <span>{page} / {totalPages}</span>
          <button onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} className="btn-mil-secondary text-xs" disabled={page >= totalPages}>Következő</button>
        </div>
      </div>

      <Modal open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Személy szerkesztése' : 'Új személy'}>
        <div className="space-y-3">
          <FormField label="Név" field="name" form={form} setForm={setForm} errors={errors} required />
          <FormField label="SZTSz" field="sztsz" form={form} setForm={setForm} errors={errors} required maxLength={8} />
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Rendfokozat</label>
            <select value={form.rank} onChange={e => setForm(prev => ({ ...prev, rank: e.target.value }))}
              className="w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary" style={{ borderRadius: '2px' }}>
              {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Alakulat *</label>
            <select value={form.unit} onChange={e => setForm(prev => ({ ...prev, unit: e.target.value }))}
              className="w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary" style={{ borderRadius: '2px' }}>
              {UNIT_OPTIONS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
            </select>
            {errors.unit && <p className="text-destructive text-xs mt-1">{errors.unit}</p>}
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Státusz</label>
            <select value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value as Person['status'] }))}
              className="w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary" style={{ borderRadius: '2px' }}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <FormField label="Email" field="email" form={form} setForm={setForm} errors={errors} type="email" />
          <FormField label="Telefon" field="phone" form={form} setForm={setForm} errors={errors} />
          <FormField label="Születési dátum" field="birthDate" form={form} setForm={setForm} errors={errors} type="date" />
          <FormField label="Lakcím" field="address" form={form} setForm={setForm} errors={errors} />
          <FormField label="Belépés dátuma" field="joinDate" form={form} setForm={setForm} errors={errors} type="date" />
          <FormField label="Megjegyzés" field="notes" form={form} setForm={setForm} errors={errors} type="textarea" />
          <div className="flex gap-3 justify-end pt-4">
            <button onClick={() => { setCreating(false); setEditing(null); }} className="btn-mil-secondary text-xs">Mégsem</button>
            <button onClick={() => { void handleSave(); }} className="btn-mil-primary text-xs">Mentés</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) { void handleDelete(deleteTarget); } }} />
    </div>
  );
}
