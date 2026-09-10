import React, { useState, useEffect, useCallback } from 'react';
import { personnel as store, qualificationTypes as qtStore, reference as refStore, getErrorMessage } from '@/lib/store';
import { Person, QualificationType } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import DatePickerInput from '@/components/DatePickerInput';
import PersonnelDetailModal from '@/components/PersonnelDetailModal';
import { isValidHungarianPhone, normalizeHungarianPhone } from '@/lib/phone';

// A törzsadatok forrása a backend (/api/reference). Ezek csak tartalék-értékek
// az első betöltésig, hogy az űrlap ne villanjon üres legördülőkkel.
const FALLBACK_RANKS = ['Honvéd', 'Őrvezető', 'Tizedes', 'Szakaszvezető', 'Őrmester'];
const FALLBACK_STATUSES = ['Aktív', 'Tartalékos', 'Szabadságon', 'Leszerelt'];
const FALLBACK_UNITS = ['31 TVZ', '83 TVZ', '19 TVZ', 'Ezredtörzs'];

const statusClass: Record<string, string> = {
  'Aktív': 'badge-active', 'Tartalékos': 'badge-reserve', 'Szabadságon': 'badge-leave', 'Leszerelt': 'badge-discharged',
};

const emptyPerson: Omit<Person, 'id'> = {
  name: '',
  sztsz: '',
  rank: 'Közkatona',
  unit: '31 TVZ',
  beosztas: '',
  status: 'Aktív',
  email: '',
  phone: '',
  birthDate: '',
  address: '',
  joinDate: '',
  notes: '',
  qualifications: [],
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
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
};

function FormField({ label, field, form, setForm, errors, type = 'text', required, maxLength, placeholder, inputMode }: FormFieldProps) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">{label}{required && ' *'}</label>
      {type === 'textarea' ? (
        <textarea
          value={form[field] as string}
          onChange={e => {
            const nextValue = field === 'phone' ? normalizeHungarianPhone(e.target.value) : e.target.value;
            setForm(prev => ({ ...prev, [field]: nextValue }));
          }}
          className="w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary resize-none h-20"
          style={{ borderRadius: '2px' }}
        />
      ) : (
        <input
          type={type}
          maxLength={maxLength}
          placeholder={placeholder}
          inputMode={inputMode}
          value={form[field] as string}
          onChange={e => {
            const nextValue = field === 'phone' ? normalizeHungarianPhone(e.target.value) : e.target.value;
            setForm(prev => ({ ...prev, [field]: nextValue }));
          }}
          className="w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary"
          style={{ borderRadius: '2px' }}
        />
      )}
      {errors[field] && <p className="text-destructive text-xs mt-1">{errors[field]}</p>}
    </div>
  );
}

export default function Personnel() {
  const { canEdit } = useAuth();
  const [data, setData] = useState<Person[]>([]);
  const [summaryData, setSummaryData] = useState<Person[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('Összes');
  const [qualificationFilter, setQualificationFilter] = useState<string>('');
  const [qualTypeOptions, setQualTypeOptions] = useState<QualificationType[]>([]);
  const [unitFilter, setUnitFilter] = useState<string>('Összes');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Person | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<PersonForm>(emptyPerson);
  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [detailPerson, setDetailPerson] = useState<Person | null>(null);
  const [ranks, setRanks] = useState<string[]>(FALLBACK_RANKS);
  const [statuses, setStatuses] = useState<string[]>(FALLBACK_STATUSES);
  const [units, setUnits] = useState<string[]>(FALLBACK_UNITS);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<'name' | 'rank' | 'sztsz' | 'unit' | 'status' | 'joinDate'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const refresh = useCallback(async () => {
    try {
      const [result, allPeople] = await Promise.all([
        store.getPaged({
          page,
          pageSize,
          search,
          unit: unitFilter,
          status: statusFilter,
          qualification: qualificationFilter,
          sortBy,
          sortDir,
        }),
        store.getAll(),
      ]);
      setData(result.items);
      setSummaryData(allPeople);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setPage(result.page);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [page, pageSize, search, unitFilter, statusFilter, qualificationFilter, sortBy, sortDir]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    qtStore.getAll().then(setQualTypeOptions).catch(() => setQualTypeOptions([]));
  }, []);

  useEffect(() => {
    refStore.get()
      .then(data => {
        setRanks(data.ranks.map(rank => rank.name));
        setStatuses(data.personStatuses);
        setUnits(data.units);
      })
      .catch(() => { /* marad a tartalék-lista */ });
  }, []);

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
    if (form.phone && !isValidHungarianPhone(form.phone)) e.phone = 'Formátum: +36 XX XXX XXXX';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      const normalizedForm = { ...form, sztsz: form.sztsz.trim(), phone: normalizeHungarianPhone(form.phone).trim() };
      if (editing) {
        await store.update({ ...editing, ...normalizedForm });
      } else {
        await store.add(normalizedForm);
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
      toast.success('Törölve');
      setDeleteTarget(null);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const statusCounts = { Aktív: 0, Tartalékos: 0, Szabadságon: 0, Leszerelt: 0 };
  summaryData.forEach(p => { if (p.status in statusCounts) statusCounts[p.status as keyof typeof statusCounts]++; });

  const openCreate = () => { setForm({ ...emptyPerson }); setErrors({}); setCreating(true); };
  const handleSort = (field: 'name' | 'rank' | 'sztsz' | 'unit' | 'status' | 'joinDate') => {
    if (sortBy === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir(field === 'rank' ? 'desc' : 'asc');
    }
    setPage(1);
  };
  const sortIndicator = (field: 'name' | 'rank' | 'sztsz' | 'unit' | 'status' | 'joinDate') => {
    if (sortBy !== field) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };
  const openEdit = (p: Person) => {
    setForm({
      name: p.name,
      sztsz: p.sztsz,
      rank: p.rank,
      unit: units.includes(p.unit) ? p.unit : units[0],
      beosztas: p.beosztas || '',
      status: p.status,
      email: p.email,
      phone: p.phone,
      birthDate: p.birthDate,
      address: p.address,
      joinDate: p.joinDate,
      notes: p.notes,
      qualifications: p.qualifications || [],
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
            placeholder="Keresés név/SZTSz/rf/alegység/beosztás..."
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
          {units.map(unit => <option key={unit} value={unit}>{unit}</option>)}
        </select>


        <select
          value={qualificationFilter}
          onChange={e => { setQualificationFilter(e.target.value); setPage(1); }}
          className="bg-input border border-border px-3 py-2 text-xs uppercase tracking-military font-mono"
          style={{ borderRadius: '2px' }}
        >
          <option value="">Minden képzettség</option>
          {qualTypeOptions.map(qt => <option key={qt.id} value={qt.id}>{qt.name}</option>)}
        </select>
        {['Összes', ...statuses].map(s => (
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
            <th><button onClick={() => handleSort('name')} className="text-left w-full">Név{sortIndicator('name')}</button></th>
            <th><button onClick={() => handleSort('sztsz')} className="text-left w-full">SZTSz{sortIndicator('sztsz')}</button></th>
            <th><button onClick={() => handleSort('rank')} className="text-left w-full">Rendfokozat{sortIndicator('rank')}</button></th>
            <th>Beosztás</th>
            <th><button onClick={() => handleSort('unit')} className="text-left w-full">Alakulat{sortIndicator('unit')}</button></th>
            <th><button onClick={() => handleSort('status')} className="text-left w-full">Státusz{sortIndicator('status')}</button></th>
            <th>Email</th><th>Telefon</th>
            <th><button onClick={() => handleSort('joinDate')} className="text-left w-full">Belépés{sortIndicator('joinDate')}</button></th>
            {canEdit && <th>Műveletek</th>}
          </tr></thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={10} className="text-center text-muted-foreground font-mono py-8">Nincs adat</td></tr>}
            {data.map(p => (
              <tr key={p.id} className="cursor-pointer" onClick={() => setDetailPerson(p)}>
                <td className="font-semibold">{p.name}</td>
                <td className="font-mono text-primary text-xs">{p.sztsz}</td>
                <td className="text-brass font-mono text-xs">{p.rank}</td>
                <td>{p.beosztas || '-'}</td>
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
                  <td onClick={e => e.stopPropagation()}>
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
              {ranks.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Alakulat *</label>
            <select value={form.unit} onChange={e => setForm(prev => ({ ...prev, unit: e.target.value }))}
              className="w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary" style={{ borderRadius: '2px' }}>
              {units.map(unit => <option key={unit} value={unit}>{unit}</option>)}
            </select>
            {errors.unit && <p className="text-destructive text-xs mt-1">{errors.unit}</p>}
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Státusz</label>
            <select value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value as Person['status'] }))}
              className="w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary" style={{ borderRadius: '2px' }}>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <FormField label="Email" field="email" form={form} setForm={setForm} errors={errors} type="email" />
          <FormField label="Telefon" field="phone" form={form} setForm={setForm} errors={errors} maxLength={15} placeholder="+36 30 123 4567" inputMode="tel" />
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Születési dátum</label>
            <DatePickerInput value={form.birthDate} onChange={val => setForm(prev => ({ ...prev, birthDate: val }))} />
          </div>
          <FormField label="Beosztás" field="beosztas" form={form} setForm={setForm} errors={errors} />
          <FormField label="Lakcím" field="address" form={form} setForm={setForm} errors={errors} />
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Belépés dátuma</label>
            <DatePickerInput value={form.joinDate} onChange={val => setForm(prev => ({ ...prev, joinDate: val }))} />
          </div>
          <FormField label="Megjegyzés" field="notes" form={form} setForm={setForm} errors={errors} type="textarea" />
          <div className="flex gap-3 justify-end pt-4">
            <button onClick={() => { setCreating(false); setEditing(null); }} className="btn-mil-secondary text-xs">Mégsem</button>
            <button onClick={() => { void handleSave(); }} className="btn-mil-primary text-xs">Mentés</button>
          </div>
        </div>
      </Modal>

      {detailPerson && !editing && !creating && (
        <PersonnelDetailModal
          person={detailPerson}
          canEdit={canEdit}
          onClose={() => setDetailPerson(null)}
          onEdit={() => { openEdit(detailPerson); setDetailPerson(null); }}
        />
      )}
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) { void handleDelete(deleteTarget); } }} />
    </div>
  );
}




