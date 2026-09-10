import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  getErrorMessage,
  operationAttendance,
  operationDocuments,
  operationRequirements,
} from '@/lib/store';
import type {
  MaterialRequirement,
  OperationAttendanceEntry,
  OperationDocument,
  PersonAssignment,
} from '@/lib/types';
import AttendanceGrid from './AttendanceGrid';
import DocumentList from './DocumentList';
import RequirementsList from './RequirementsList';

type Tab = 'attendance' | 'requirements' | 'documents';

const TABS: { key: Tab; label: string }[] = [
  { key: 'attendance', label: 'Jelenlét' },
  { key: 'requirements', label: 'Anyagigény' },
  { key: 'documents', label: 'Dokumentumok' },
];

type Props = {
  operationId: string;
  assigned: PersonAssignment[];
  canEdit: boolean;
};

/**
 * A művelet-részletek három fülét fogja össze, és birtokolja a hozzájuk tartozó
 * betöltést. Külön komponens, hogy az Operations oldal ne hízzon tovább.
 */
export default function OperationDetailTabs({ operationId, assigned, canEdit }: Props) {
  const [tab, setTab] = useState<Tab>('attendance');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [attendance, setAttendance] = useState<OperationAttendanceEntry[]>([]);
  const [dirtyPersonIds, setDirtyPersonIds] = useState<Set<string>>(new Set());
  const [requirements, setRequirements] = useState<MaterialRequirement[]>([]);
  const [documents, setDocuments] = useState<OperationDocument[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [att, reqs, docs] = await Promise.all([
        operationAttendance.get(operationId),
        operationRequirements.get(operationId),
        operationDocuments.get(operationId),
      ]);
      setAttendance(att);
      setRequirements(reqs);
      setDocuments(docs);
      setDirtyPersonIds(new Set());
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [operationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * A beosztott, de még jelenléti sorral nem rendelkező személyek "Függőben"
   * állapottal jelennek meg — így az ügyintézőnek nem kell egyesével felvennie
   * őket, csak átállítania.
   */
  const rows: OperationAttendanceEntry[] = (() => {
    const byPerson = new Map(attendance.map(entry => [entry.personId, entry]));
    for (const person of assigned) {
      if (byPerson.has(person.personId)) continue;
      byPerson.set(person.personId, {
        personId: person.personId,
        personName: person.personName,
        status: 'Pending',
        note: '',
        updatedAt: '',
        updatedBy: '',
      });
    }
    return [...byPerson.values()].sort((a, b) => a.personName.localeCompare(b.personName, 'hu'));
  })();

  const handleAttendanceChange = (personId: string, field: 'status' | 'note', value: string) => {
    setAttendance(prev => {
      const existing = prev.find(entry => entry.personId === personId);
      const base = existing ?? rows.find(entry => entry.personId === personId);
      if (!base) return prev;
      const updated = { ...base, [field]: value } as OperationAttendanceEntry;
      return existing
        ? prev.map(entry => (entry.personId === personId ? updated : entry))
        : [...prev, updated];
    });
    setDirtyPersonIds(prev => new Set(prev).add(personId));
  };

  const handleAttendanceSave = async () => {
    setSaving(true);
    try {
      const entries = rows.map(({ personId, personName, status, note }) => ({ personId, personName, status, note }));
      setAttendance(await operationAttendance.saveBatch(operationId, entries));
      setDirtyPersonIds(new Set());
      toast.success('Jelenlét mentve');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const runRequirementAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setSaving(true);
    try {
      await action();
      setRequirements(await operationRequirements.get(operationId));
      toast.success(successMessage);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const runDocumentAction = async (action: () => Promise<unknown>, successMessage?: string) => {
    setSaving(true);
    try {
      await action();
      setDocuments(await operationDocuments.get(operationId));
      if (successMessage) toast.success(successMessage);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-border">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-xs uppercase tracking-military font-mono border-b-2 transition-colors ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            {key === 'requirements' && requirements.length > 0 && ` (${requirements.length})`}
            {key === 'documents' && documents.length > 0 && ` (${documents.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground py-4">Betöltés…</p>
      ) : (
        <>
          {tab === 'attendance' && (
            <AttendanceGrid
              entries={rows}
              canEdit={canEdit}
              saving={saving}
              dirtyPersonIds={dirtyPersonIds}
              onChange={handleAttendanceChange}
              onSave={() => { void handleAttendanceSave(); }}
            />
          )}

          {tab === 'requirements' && (
            <RequirementsList
              items={requirements}
              canEdit={canEdit}
              busy={saving}
              onCreate={payload => runRequirementAction(
                () => operationRequirements.create(operationId, payload), 'Anyagigény rögzítve')}
              onUpdate={(id, payload) => runRequirementAction(
                () => operationRequirements.update(operationId, id, payload), 'Anyagigény módosítva')}
              onDelete={id => runRequirementAction(
                () => operationRequirements.remove(operationId, id), 'Anyagigény törölve')}
            />
          )}

          {tab === 'documents' && (
            <DocumentList
              items={documents}
              canEdit={canEdit}
              busy={saving}
              onUpload={(file, title) => runDocumentAction(
                () => operationDocuments.upload(operationId, file, title), 'Dokumentum feltöltve')}
              onDelete={docId => runDocumentAction(
                () => operationDocuments.remove(operationId, docId), 'Dokumentum törölve')}
              onDownload={(docId, originalName) => runDocumentAction(
                () => operationDocuments.download(operationId, docId, originalName))}
              onView={docId => {
                const doc = documents.find(item => item.id === docId);
                return runDocumentAction(
                  () => operationDocuments.view(operationId, docId, doc?.originalName ?? 'dokumentum'));
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
