import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  users as uStore,
  bugReports,
  getErrorMessage,
  previewImport,
  updateImportDraft,
  confirmImport,
  type ImportPreviewResult,
  type ImportEntity,
  type ImportPreviewItem,
} from '@/lib/store';
import { User, Role, BugReport } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Plus, Pencil, ShieldCheck, ShieldOff } from 'lucide-react';
import Modal from '@/components/Modal';
import { useNavigate } from 'react-router-dom';

type ImportFieldConfig = {
  key: string;
  label: string;
  required?: boolean;
  multiline?: boolean;
  options?: string[];
  placeholder?: string;
};

const IMPORT_FIELDS: Record<ImportEntity, ImportFieldConfig[]> = {
  personnel: [
    { key: 'name', label: 'Név', required: true, placeholder: 'pl. Kiss Károly' },
    { key: 'sztsz', label: 'SZTSZ', required: true, placeholder: 'pl. HU123456' },
    { key: 'rank', label: 'Rendfokozat', required: true, placeholder: 'pl. főhadnagy' },
    { key: 'unit', label: 'Alegység', required: true, placeholder: 'pl. 2. lövészszázad' },
    { key: 'status', label: 'Státusz', required: true, options: ['Aktív', 'Tartalékos', 'Szabadságon', 'Leszerelt'] },
    { key: 'email', label: 'E-mail', placeholder: 'pl. nev@honved.hu' },
    { key: 'phone', label: 'Telefon', placeholder: 'pl. +36 30 123 4567' },
    { key: 'birthDate', label: 'Születési dátum', placeholder: 'YYYY-MM-DD' },
    { key: 'address', label: 'Cím', placeholder: 'pl. Veszprém, Kossuth u. 12.' },
    { key: 'joinDate', label: 'Belépés dátuma', placeholder: 'YYYY-MM-DD' },
    { key: 'notes', label: 'Megjegyzés', multiline: true, placeholder: 'További információk' },
  ],
  exercises: [
    { key: 'name', label: 'Gyakorlat neve', required: true, placeholder: 'pl. Tavaszi Pajzs 2026' },
    { key: 'type', label: 'Típus', required: true, placeholder: 'pl. lövészeti' },
    { key: 'startDate', label: 'Kezdés', required: true, placeholder: 'YYYY-MM-DD' },
    { key: 'endDate', label: 'Befejezés', required: true, placeholder: 'YYYY-MM-DD' },
    { key: 'status', label: 'Státusz', required: true, options: ['Tervezett', 'Folyamatban', 'Befejezett', 'Törölve'] },
    { key: 'location', label: 'Helyszín', placeholder: 'pl. Hajmáskér' },
    { key: 'maxPersonnel', label: 'Max. létszám', placeholder: 'pl. 120' },
    { key: 'description', label: 'Leírás', multiline: true, placeholder: 'Részletek, célok, megjegyzések' },
  ],
};

const ACTION_LABELS: Record<ImportPreviewItem['action'], string> = {
  create: 'Új rekord',
  update: 'Frissítés',
  skip: 'Kihagyva',
};

const ACTION_CLASSES: Record<ImportPreviewItem['action'], string> = {
  create: 'border-primary/40 bg-primary/5 text-primary',
  update: 'border-brass/40 bg-brass/10 text-brass',
  skip: 'border-warning/40 bg-warning/10 text-warning',
};

function cloneImportItems(items: ImportPreviewItem[]): ImportPreviewItem[] {
  return items.map(item => ({
    ...item,
    enabled: item.enabled ?? true,
    data: { ...(item.data ?? {}) },
    rawData: { ...(item.rawData ?? {}) },
    unknownData: { ...(item.unknownData ?? {}) },
    issues: [...(item.issues ?? [])],
  }));
}

function formatIssueLine(line: number) {
  return line > 0 ? `Sor ${line}` : 'Általános';
}

function countMappedValues(item: ImportPreviewItem) {
  return Object.values(item.data ?? {}).filter(value => value?.trim()).length;
}

function countOriginalValues(item: ImportPreviewItem) {
  return Object.values(item.rawData ?? {}).filter(value => value?.trim()).length;
}

export default function RohamInformatikusPage() {
  const { user: authUser, isDev, isAdmin } = useAuth();
  const [data, setData] = useState<User[]>([]);
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', displayName: '', role: 'reader' as Role, active: true });
  const [importEntity, setImportEntity] = useState<ImportEntity>('personnel');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null);
  const [importPreviewError, setImportPreviewError] = useState<string | null>(null);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [importEditorOpen, setImportEditorOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<ImportPreviewItem[]>([]);
  const [selectedDraftLine, setSelectedDraftLine] = useState<number | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [bugForm, setBugForm] = useState({ title: '', description: '', page: '', severity: 'normal' as BugReport['severity'] });
  const [bugSubmitting, setBugSubmitting] = useState(false);
  const [bugSummary, setBugSummary] = useState<{ openCount: number; resolvedCount: number; criticalOpen: number } | null>(null);
  const [bugItems, setBugItems] = useState<BugReport[]>([]);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    if (!isAdmin) {
      setData([]);
      return;
    }
    try {
      setData(await uStore.getAll());
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [isAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadBugAdminData = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [summary, items] = await Promise.all([bugReports.getSummary(), bugReports.getAll()]);
      setBugSummary(summary);
      setBugItems(items);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadBugAdminData();
  }, [loadBugAdminData]);

  const activePreviewEntity = importPreview?.entity ?? importEntity;
  const activeImportFields = useMemo(() => IMPORT_FIELDS[activePreviewEntity], [activePreviewEntity]);
  const selectedDraftItem = useMemo(
    () => draftItems.find(item => item.line === selectedDraftLine) ?? null,
    [draftItems, selectedDraftLine],
  );

  const syncDraftState = useCallback((preview: ImportPreviewResult, preferredLine?: number | null) => {
    const items = cloneImportItems(preview.items);
    setImportPreview(preview);
    setDraftItems(items);
    setDraftDirty(false);
    if (items.length === 0) {
      setSelectedDraftLine(null);
      return;
    }
    const nextLine = preferredLine && items.some(item => item.line === preferredLine)
      ? preferredLine
      : items[0].line;
    setSelectedDraftLine(nextLine);
  }, []);

  const resetImportState = useCallback(() => {
    setImportPreview(null);
    setImportPreviewError(null);
    setDraftItems([]);
    setSelectedDraftLine(null);
    setDraftDirty(false);
    setImportEditorOpen(false);
  }, []);

  const handleSave = async () => {
    if (!form.username.trim()) {
      toast.error('Felhasználónév kötelező');
      return;
    }
    try {
      if (editing) {
        await uStore.update(editing.username, {
          displayName: form.displayName,
          role: form.role,
          active: form.active,
          password: form.password || undefined,
        });
        toast.success('Sikeresen mentve');
      } else {
        if (!form.password) {
          toast.error('Jelszó kötelező');
          return;
        }
        await uStore.create({
          username: form.username,
          password: form.password,
          displayName: form.displayName,
          role: form.role,
          active: form.active,
        });
        toast.success('Felhasználó létrehozva');
      }
      setEditing(null);
      setCreating(false);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleImportPreview = async () => {
    if (!importFile) {
      toast.error('Válassz fájlt az importhoz');
      return;
    }
    try {
      setImporting(true);
      resetImportState();
      const result = await previewImport(importEntity, importFile);
      syncDraftState(result);
      setImportEditorOpen(true);
      toast.success(`Előnézet kész: ${result.created} új, ${result.updated} frissített, ${result.skipped} kihagyott`);
    } catch (error) {
      const message = getErrorMessage(error);
      resetImportState();
      setImportPreviewError(message);
      toast.error(message);
    } finally {
      setImporting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!importPreview) {
      toast.error('Nincs menthető import-tervezet');
      return;
    }
    try {
      setSavingDraft(true);
      const result = await updateImportDraft(
        importPreview.entity,
        importPreview.draftId,
        draftItems.map(item => ({
          line: item.line,
          enabled: item.enabled,
          data: item.data,
        })),
      );
      syncDraftState(result, selectedDraftLine);
      setImportPreviewError(null);
      toast.success('A tervezet frissítve lett');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSavingDraft(false);
    }
  };

  const handleImportConfirm = async () => {
    if (!importPreview) {
      toast.error('Nincs megerősíthető import előnézet');
      return;
    }
    if (draftDirty) {
      setImportEditorOpen(true);
      toast.error('Mentened kell a tervezet módosításait alkalmazás előtt');
      return;
    }
    try {
      setConfirmingImport(true);
      const result = await confirmImport(importPreview.entity, importPreview.draftId);
      toast.success(`Import alkalmazva: ${result.created} új, ${result.updated} frissített`);
      setImportFile(null);
      resetImportState();
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setConfirmingImport(false);
    }
  };

  const updateDraftItem = useCallback((line: number, updater: (item: ImportPreviewItem) => ImportPreviewItem) => {
    setDraftItems(current => current.map(item => {
      if (item.line !== line) {
        return item;
      }
      return updater({
        ...item,
        data: { ...(item.data ?? {}) },
        rawData: { ...(item.rawData ?? {}) },
        unknownData: { ...(item.unknownData ?? {}) },
        issues: [...(item.issues ?? [])],
      });
    }));
    setDraftDirty(true);
  }, []);

  const handleDraftFieldChange = (field: string, value: string) => {
    if (!selectedDraftItem) return;
    updateDraftItem(selectedDraftItem.line, item => ({
      ...item,
      data: {
        ...item.data,
        [field]: value,
      },
    }));
  };

  const handleDraftEnabledChange = (enabled: boolean) => {
    if (!selectedDraftItem) return;
    updateDraftItem(selectedDraftItem.line, item => ({
      ...item,
      enabled,
    }));
  };

  const submitBugReport = useCallback(async () => {
    if (!bugForm.title.trim() || !bugForm.description.trim()) {
      toast.error('A cím és a leírás kötelező');
      return;
    }
    try {
      setBugSubmitting(true);
      await bugReports.create({
        title: bugForm.title.trim(),
        description: bugForm.description.trim(),
        page: bugForm.page.trim(),
        severity: bugForm.severity,
      });
      setBugForm({ title: '', description: '', page: '', severity: 'normal' });
      toast.success('A hibabejelentés rögzítve lett');
      await loadBugAdminData();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBugSubmitting(false);
    }
  }, [bugForm, loadBugAdminData]);

  const updateBugAdmin = useCallback(async (id: string, payload: { status?: BugReport['status']; severity?: BugReport['severity'] }) => {
    try {
      await bugReports.updateAdmin(id, payload);
      toast.success('Hibajegy frissítve');
      await loadBugAdminData();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [loadBugAdminData]);

  const canEditUser = (u: User) => {
    if (u.username === authUser?.username) return false;
    if (u.role === 'fejleszto' && !isDev) return false;
    return true;
  };

  const availableRoles: Role[] = isDev ? ['reader', 'editor', 'admin', 'fejleszto'] : ['reader', 'editor', 'admin'];
  const roleBadge: Record<string, string> = { admin: 'ADMIN', editor: 'SZERKESZTŐ', reader: 'OLVASÓ', fejleszto: 'FEJLESZTŐ' };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Rohaminformatikus</h1>
        <div className="flex gap-2">
          <button onClick={() => navigate('/activity-log')} className="btn-mil-secondary text-xs">Tevékenységnapló</button>
          <button
            onClick={() => {
              setForm({ username: '', password: '', displayName: '', role: 'reader', active: true });
              setCreating(true);
            }}
            className="btn-mil-primary flex items-center gap-2 text-xs"
          >
            <Plus className="w-4 h-4" />Új felhasználó
          </button>
        </div>
      </div>

      <div className="bg-card border border-border p-4 mb-6" style={{ borderRadius: '2px' }}>
        <h2 className="text-sm uppercase tracking-military text-primary font-mono">Hibabejelentő</h2>
        <div className="grid gap-3 mt-3">
          <input value={bugForm.title} onChange={e => setBugForm({ ...bugForm, title: e.target.value })} placeholder="Rövid cím" className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
          <textarea value={bugForm.description} onChange={e => setBugForm({ ...bugForm, description: e.target.value })} placeholder="Mit tapasztaltál, hogyan reprodukálható?" rows={4} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
          <div className="grid gap-3 md:grid-cols-3">
            <input value={bugForm.page} onChange={e => setBugForm({ ...bugForm, page: e.target.value })} placeholder="Érintett oldal (opcionális)" className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
            <select value={bugForm.severity} onChange={e => setBugForm({ ...bugForm, severity: e.target.value as BugReport['severity'] })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }}>
              <option value="low">Alacsony</option>
              <option value="normal">Normál</option>
              <option value="high">Magas</option>
              <option value="critical">Kritikus</option>
            </select>
            <button onClick={() => { void submitBugReport(); }} disabled={bugSubmitting} className="btn-mil-primary text-xs">{bugSubmitting ? 'Küldés...' : 'Hiba beküldése'}</button>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="bg-card border border-border p-4 mb-6" style={{ borderRadius: '2px' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-military text-primary font-mono">Rohaminformatikus</h2>
            <button onClick={() => navigate('/activity-log')} className="btn-mil-secondary text-xs">Tevékenységnapló</button>
          </div>
          <div className="grid gap-3 md:grid-cols-3 mt-3">
            <div className="border border-border px-3 py-2 text-xs" style={{ borderRadius: '2px' }}>Nyitott: <span className="font-mono text-primary">{bugSummary?.openCount ?? 0}</span></div>
            <div className="border border-border px-3 py-2 text-xs" style={{ borderRadius: '2px' }}>Lezárt: <span className="font-mono text-primary">{bugSummary?.resolvedCount ?? 0}</span></div>
            <div className="border border-border px-3 py-2 text-xs" style={{ borderRadius: '2px' }}>Kritikus nyitott: <span className="font-mono text-warning">{bugSummary?.criticalOpen ?? 0}</span></div>
          </div>
          <div className="mt-4 overflow-auto">
            <table className="w-full mil-table">
              <thead><tr><th>Cím</th><th>Súlyosság</th><th>Státusz</th><th>Beküldő</th><th>Művelet</th></tr></thead>
              <tbody>
                {bugItems.map(item => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>
                      <select
                        value={item.severity}
                        onChange={e => { void updateBugAdmin(item.id, { severity: e.target.value as BugReport['severity'] }); }}
                        className="bg-input border border-border px-2 py-1 text-xs uppercase"
                        style={{ borderRadius: '2px' }}
                      >
                        <option value="low">LOW</option>
                        <option value="normal">NORMAL</option>
                        <option value="high">HIGH</option>
                        <option value="critical">CRITICAL</option>
                      </select>
                    </td>
                    <td className="uppercase text-xs">{item.status}</td>
                    <td>{item.reportedByName}</td>
                    <td>
                      {item.status === 'open' ? (
                        <button onClick={() => { void updateBugAdmin(item.id, { status: 'resolved' }); }} className="btn-mil-secondary text-xs">Lezárás</button>
                      ) : (
                        <button onClick={() => { void updateBugAdmin(item.id, { status: 'open' }); }} className="btn-mil-secondary text-xs">Újranyitás</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isAdmin && (<>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-px flex-1 bg-primary/30" />
        <span className="text-xs uppercase tracking-military text-primary font-mono">Felhasználók</span>
        <div className="h-px flex-1 bg-primary/30" />
      </div>

      <div className="bg-card border border-border overflow-hidden" style={{ borderRadius: '2px' }}>
        <table className="w-full mil-table">
          <thead>
            <tr>
              <th>Felhasználónév</th>
              <th>Megjelenítési név</th>
              <th>Szerep</th>
              <th>Státusz</th>
              <th>Utolsó belépés</th>
              <th>Műveletek</th>
            </tr>
          </thead>
          <tbody>
            {data.map(u => (
              <tr key={u.username}>
                <td className="font-mono text-primary">{u.username}</td>
                <td className="text-brass">{u.displayName}</td>
                <td>
                  <span className="px-2 py-0.5 text-xs uppercase tracking-military font-mono border border-border" style={{ borderRadius: '2px' }}>
                    {roleBadge[u.role]}
                  </span>
                </td>
                <td>
                  {u.active ? (
                    <span className="badge-active px-2 py-0.5 text-xs uppercase font-mono" style={{ borderRadius: '2px' }}>Aktív</span>
                  ) : (
                    <span className="badge-cancelled px-2 py-0.5 text-xs uppercase font-mono" style={{ borderRadius: '2px' }}>Inaktív</span>
                  )}
                </td>
                <td className="font-mono text-xs text-muted-foreground">{u.lastLogin ? new Date(u.lastLogin).toLocaleString('hu-HU') : '—'}</td>
                <td>
                  {canEditUser(u) ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setForm({ username: u.username, password: '', displayName: u.displayName, role: u.role, active: u.active });
                          setEditing(u);
                        }}
                        className="p-1.5 text-primary hover:bg-primary/10"
                        title="Szerkesztés"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          void (async () => {
                            try {
                              await uStore.update(u.username, { displayName: u.displayName, role: u.role, active: !u.active });
                              await refresh();
                              toast.success(u.active ? 'Deaktiválva' : 'Aktiválva');
                            } catch (error) {
                              toast.error(getErrorMessage(error));
                            }
                          })();
                        }}
                        className="p-1.5 hover:bg-secondary"
                        title={u.active ? 'Deaktiválás' : 'Aktiválás'}
                      >
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

      <div className="mt-8 bg-card border border-border p-4" style={{ borderRadius: '2px' }}>
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-sm uppercase tracking-military text-primary font-mono">Importtervezet</h2>
            <p className="text-xs text-muted-foreground mt-1">
              A rendszer megpróbálja felismerni a mezőket, megmutatja mit tudott kinyerni, és a problémás sorokat is szerkeszthetővé teszi.
            </p>
          </div>
          {importFile && (
            <div className="border border-border px-3 py-2 text-xs font-mono text-muted-foreground" style={{ borderRadius: '2px' }}>
              {importFile.name} • {(importFile.size / 1024).toFixed(1)} KB
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-[220px_1fr_auto_auto] mt-4">
          <select
            value={importEntity}
            onChange={e => {
              setImportEntity(e.target.value as ImportEntity);
              resetImportState();
            }}
            className="bg-input border border-border px-3 py-2 text-sm"
            style={{ borderRadius: '2px' }}
          >
            <option value="personnel">Személyi állomány</option>
            <option value="exercises">Hadgyakorlatok</option>
          </select>
          <input
            type="file"
            accept=".pdf,.xlsx,.xlsm,.csv,.docx"
            onChange={e => {
              setImportFile(e.target.files?.[0] || null);
              resetImportState();
            }}
            className="w-full bg-input border border-border px-3 py-2 text-sm file:mr-3 file:rounded-sm file:border file:border-primary/40 file:bg-primary/20 file:px-3 file:py-1.5 file:text-xs file:font-mono file:text-primary hover:file:bg-primary/30"
            style={{ borderRadius: '2px' }}
          />
          <button onClick={() => { void handleImportPreview(); }} disabled={!importFile || importing} className="btn-mil-primary text-xs">
            {importing ? 'Elemzés...' : 'Előnézet készítése'}
          </button>
          <button
            onClick={() => { void handleImportConfirm(); }}
            disabled={!importPreview || confirmingImport || draftDirty}
            className="btn-mil-secondary text-xs"
          >
            {confirmingImport ? 'Alkalmazás...' : draftDirty ? 'Mentsd a tervezetet' : 'Rendben, alkalmazd'}
          </button>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Személyeknél kötelező: név, SZTSZ, rendfokozat, alegység, státusz. Hadgyakorlatnál kötelező: név, típus, kezdés, befejezés, státusz.
        </p>

        {importPreviewError && (
          <div className="mt-3 border border-warning/40 bg-warning/5 p-3 text-sm text-warning" style={{ borderRadius: '2px' }}>
            <p className="font-mono uppercase tracking-military">Import probléma</p>
            <p className="mt-1 text-xs">{importPreviewError}</p>
          </div>
        )}

        {importPreview && (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="border border-border bg-background/60 p-3" style={{ borderRadius: '2px' }}>
                <p className="text-[11px] uppercase tracking-military text-muted-foreground">Összes sor</p>
                <p className="mt-1 text-2xl font-rajdhani text-foreground">{importPreview.totalRows}</p>
              </div>
              <div className="border border-primary/20 bg-primary/10 p-3" style={{ borderRadius: '2px' }}>
                <p className="text-[11px] uppercase tracking-military text-primary">Érvényes sorok</p>
                <p className="mt-1 text-2xl font-rajdhani text-primary">{importPreview.created + importPreview.updated}</p>
              </div>
              <div className="border border-primary/30 bg-primary/5 p-3" style={{ borderRadius: '2px' }}>
                <p className="text-[11px] uppercase tracking-military text-primary">Új rekord</p>
                <p className="mt-1 text-2xl font-rajdhani text-primary">{importPreview.created}</p>
              </div>
              <div className="border border-brass/40 bg-brass/10 p-3" style={{ borderRadius: '2px' }}>
                <p className="text-[11px] uppercase tracking-military text-brass">Frissítés</p>
                <p className="mt-1 text-2xl font-rajdhani text-brass">{importPreview.updated}</p>
              </div>
              <div className="border border-warning/40 bg-warning/10 p-3" style={{ borderRadius: '2px' }}>
                <p className="text-[11px] uppercase tracking-military text-warning">Problémás / kihagyott</p>
                <p className="mt-1 text-2xl font-rajdhani text-warning">{importPreview.skipped}</p>
              </div>
            </div>

            <div className="border border-border p-4" style={{ borderRadius: '2px' }}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-military text-primary font-mono">Import tervezet</p>
                  <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
                    A rendszer soronként megmutatja a felismert mezőket, a nyers forrásadatokat és az észlelt hibákat.
                    Ha valami félrement, nyisd meg a szerkesztőt és javítsd a mezőket, majd mentsd újra a tervezetet.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground font-mono">Draft ID: {importPreview.draftId}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setImportEditorOpen(true)} className="btn-mil-secondary text-xs">Tervezet megnyitása</button>
                  <button onClick={() => { void handleSaveDraft(); }} disabled={!draftDirty || savingDraft} className="btn-mil-primary text-xs">
                    {savingDraft ? 'Mentés...' : draftDirty ? 'Tervezet mentése' : 'Tervezet naprakész'}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-2">
                  {importPreview.items.slice(0, 6).map(item => (
                    <button
                      key={`${item.line}-${item.key}`}
                      onClick={() => {
                        setSelectedDraftLine(item.line);
                        setImportEditorOpen(true);
                      }}
                      className="w-full border border-border bg-background/60 p-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                      style={{ borderRadius: '2px' }}
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`border px-2 py-0.5 text-[11px] uppercase tracking-military font-mono ${ACTION_CLASSES[item.action]}`} style={{ borderRadius: '2px' }}>
                              {ACTION_LABELS[item.action]}
                            </span>
                            {!item.enabled && (
                              <span className="border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] uppercase tracking-military font-mono text-warning" style={{ borderRadius: '2px' }}>
                                Kézzel kihagyva
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-sm font-semibold text-foreground">{item.name || 'Névtelen sor'}</p>
                          <p className="text-xs font-mono text-muted-foreground">Sor {item.line} • {item.key}</p>
                        </div>
                        <div className="text-xs font-mono text-muted-foreground">
                          <div>Felismert mezők: {countMappedValues(item)}</div>
                          <div>Nyers mezők: {countOriginalValues(item)}</div>
                          <div>Problémák: {item.issues.length}</div>
                        </div>
                      </div>

                      {Object.keys(item.data ?? {}).length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono text-muted-foreground">
                          {Object.entries(item.data ?? {}).slice(0, 4).map(([key, value]) => (
                            <span key={key} className="border border-border px-2 py-1" style={{ borderRadius: '2px' }}>
                              {key}: {value || '—'}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                <div className="border border-border bg-background/40 p-3" style={{ borderRadius: '2px' }}>
                  <p className="text-[11px] uppercase tracking-military text-warning font-mono">Észlelt problémák</p>
                  {importPreview.issues.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">Nem találtam validációs hibát. A szerkesztőben ettől még át tudod nézni a sorokat.</p>
                  ) : (
                    <div className="mt-3 space-y-2 max-h-64 overflow-auto pr-1">
                      {importPreview.issues.slice(0, 8).map((issue, idx) => (
                        <div key={`${issue.line}-${idx}`} className="border border-warning/30 bg-warning/5 p-2 text-xs" style={{ borderRadius: '2px' }}>
                          <p className="font-mono text-warning">{formatIssueLine(issue.line)}</p>
                          <p className="mt-1 text-muted-foreground">{issue.message}</p>
                        </div>
                      ))}
                      {importPreview.issues.length > 8 && (
                        <p className="text-xs text-muted-foreground font-mono">+ {importPreview.issues.length - 8} további probléma a szerkesztőben</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      </>)}

      <Modal open={importEditorOpen} onClose={() => setImportEditorOpen(false)} title="Import tervezet szerkesztése" wide>
        {!importPreview ? (
          <p className="text-sm text-muted-foreground">Nincs megnyitható import-tervezet.</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
            <div className="space-y-4">
              <div className="border border-border bg-background/50 p-3" style={{ borderRadius: '2px' }}>
                <p className="text-[11px] uppercase tracking-military text-primary font-mono">Tervezet állapota</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="border border-border px-3 py-2" style={{ borderRadius: '2px' }}>
                    <div className="text-muted-foreground">Sor</div>
                    <div className="mt-1 text-foreground">{importPreview.totalRows}</div>
                  </div>
                  <div className="border border-border px-3 py-2" style={{ borderRadius: '2px' }}>
                    <div className="text-muted-foreground">Probléma</div>
                    <div className="mt-1 text-warning">{importPreview.issues.length}</div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Itt tudod kijavítani a felismert mezőket, kikapcsolni a rossz sorokat, majd újraszámolni az importot.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => { void handleSaveDraft(); }} disabled={!draftDirty || savingDraft} className="btn-mil-primary text-xs">
                    {savingDraft ? 'Mentés...' : draftDirty ? 'Változások mentése' : 'Nincs mentetlen változás'}
                  </button>
                  <button onClick={() => { void handleImportConfirm(); }} disabled={confirmingImport || draftDirty} className="btn-mil-secondary text-xs">
                    {confirmingImport ? 'Alkalmazás...' : draftDirty ? 'Ments előbb' : 'Import alkalmazása'}
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-[58vh] overflow-auto pr-1">
                {draftItems.map(item => (
                  <button
                    key={`${item.line}-${item.key}`}
                    onClick={() => setSelectedDraftLine(item.line)}
                    className={`w-full border p-3 text-left transition ${selectedDraftLine === item.line ? 'border-primary bg-primary/5' : 'border-border bg-background/40 hover:border-primary/30'}`}
                    style={{ borderRadius: '2px' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.name || 'Névtelen sor'}</p>
                        <p className="text-xs font-mono text-muted-foreground">Sor {item.line}</p>
                      </div>
                      <span className={`border px-2 py-0.5 text-[11px] uppercase tracking-military font-mono ${ACTION_CLASSES[item.action]}`} style={{ borderRadius: '2px' }}>
                        {ACTION_LABELS[item.action]}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs font-mono text-muted-foreground">
                      <span>{item.enabled ? 'Aktív sor' : 'Kihagyott sor'}</span>
                      <span>{item.issues.length} probléma</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {selectedDraftItem ? (
                <>
                  <div className="border border-border bg-background/50 p-4" style={{ borderRadius: '2px' }}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-[11px] uppercase tracking-military text-primary font-mono">Kijelölt sor</p>
                        <h3 className="mt-2 text-xl font-rajdhani text-foreground">Sor {selectedDraftItem.line}</h3>
                        <p className="text-sm text-muted-foreground">{selectedDraftItem.name || 'Névtelen sor'} • {selectedDraftItem.key}</p>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={selectedDraftItem.enabled}
                          onChange={e => handleDraftEnabledChange(e.target.checked)}
                          className="accent-primary"
                        />
                        Sor engedélyezése az importhoz
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {activeImportFields.map(field => (
                      <div key={field.key} className={field.multiline ? 'md:col-span-2' : ''}>
                        <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">
                          {field.label}{field.required ? ' *' : ''}
                        </label>
                        {field.options ? (
                          <select
                            value={selectedDraftItem.data[field.key] ?? ''}
                            onChange={e => handleDraftFieldChange(field.key, e.target.value)}
                            className="w-full bg-input border border-border px-3 py-2 text-sm"
                            style={{ borderRadius: '2px' }}
                          >
                            <option value="">—</option>
                            {field.options.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        ) : field.multiline ? (
                          <textarea
                            value={selectedDraftItem.data[field.key] ?? ''}
                            onChange={e => handleDraftFieldChange(field.key, e.target.value)}
                            rows={4}
                            placeholder={field.placeholder}
                            className="w-full bg-input border border-border px-3 py-2 text-sm"
                            style={{ borderRadius: '2px' }}
                          />
                        ) : (
                          <input
                            value={selectedDraftItem.data[field.key] ?? ''}
                            onChange={e => handleDraftFieldChange(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            className="w-full bg-input border border-border px-3 py-2 text-sm"
                            style={{ borderRadius: '2px' }}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="border border-border bg-background/40 p-3" style={{ borderRadius: '2px' }}>
                      <p className="text-[11px] uppercase tracking-military text-brass font-mono">Eredeti felismert mezők</p>
                      {Object.keys(selectedDraftItem.rawData ?? {}).length === 0 ? (
                        <p className="mt-3 text-sm text-muted-foreground">Ehhez a sorhoz nem maradt meg külön nyers mezőlista.</p>
                      ) : (
                        <div className="mt-3 space-y-2 max-h-52 overflow-auto pr-1">
                          {Object.entries(selectedDraftItem.rawData ?? {}).map(([key, value]) => (
                            <div key={key} className="border border-border px-3 py-2 text-xs font-mono" style={{ borderRadius: '2px' }}>
                              <div className="text-muted-foreground">{key}</div>
                              <div className="mt-1 text-foreground">{value || '—'}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="border border-border bg-background/40 p-3" style={{ borderRadius: '2px' }}>
                      <p className="text-[11px] uppercase tracking-military text-warning font-mono">Nem felismert mezők</p>
                      {Object.keys(selectedDraftItem.unknownData ?? {}).length === 0 ? (
                        <p className="mt-3 text-sm text-muted-foreground">Minden értelmezett mezőt sikerült ismert mezőhöz kötni.</p>
                      ) : (
                        <div className="mt-3 space-y-2 max-h-52 overflow-auto pr-1">
                          {Object.entries(selectedDraftItem.unknownData ?? {}).map(([key, value]) => (
                            <div key={key} className="border border-warning/30 bg-warning/5 px-3 py-2 text-xs font-mono" style={{ borderRadius: '2px' }}>
                              <div className="text-warning">{key}</div>
                              <div className="mt-1 text-foreground">{value || '—'}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border border-border bg-background/40 p-3" style={{ borderRadius: '2px' }}>
                    <p className="text-[11px] uppercase tracking-military text-warning font-mono">Sorhoz tartozó problémák</p>
                    {selectedDraftItem.issues.length === 0 ? (
                      <p className="mt-3 text-sm text-muted-foreground">Ehhez a sorhoz jelenleg nincs nyilvántartott hiba.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {selectedDraftItem.issues.map((issue, idx) => (
                          <div key={`${selectedDraftItem.line}-${idx}`} className="border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-foreground" style={{ borderRadius: '2px' }}>
                            {issue}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="border border-border bg-background/40 p-6 text-sm text-muted-foreground" style={{ borderRadius: '2px' }}>
                  Válassz ki egy sort a bal oldali listából az importtervezet szerkesztéséhez.
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Felhasználó szerkesztése' : 'Új felhasználó'}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Felhasználónév{!editing && ' *'}</label>
            <input
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              disabled={!!editing}
              className="w-full bg-input border border-border px-3 py-2 text-sm font-mono disabled:opacity-50"
              style={{ borderRadius: '2px' }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">{editing ? 'Új jelszó (üres = nem változik)' : 'Jelszó *'}</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              className="w-full bg-input border border-border px-3 py-2 text-sm"
              style={{ borderRadius: '2px' }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Megjelenítési név</label>
            <input
              value={form.displayName}
              onChange={e => setForm({ ...form, displayName: e.target.value })}
              className="w-full bg-input border border-border px-3 py-2 text-sm"
              style={{ borderRadius: '2px' }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Szerep</label>
            <select
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value as Role })}
              className="w-full bg-input border border-border px-3 py-2 text-sm"
              style={{ borderRadius: '2px' }}
            >
              {availableRoles.map(r => <option key={r} value={r}>{roleBadge[r]}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={e => setForm({ ...form, active: e.target.checked })}
              className="accent-primary"
            />
            Aktív
          </label>
          <div className="flex gap-3 justify-end pt-4">
            <button onClick={() => { setCreating(false); setEditing(null); }} className="btn-mil-secondary text-xs">Mégsem</button>
            <button onClick={() => { void handleSave(); }} className="btn-mil-primary text-xs">Mentés</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

