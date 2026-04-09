import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trainings as tStore, exercises as eStore, getErrorMessage } from '@/lib/store';
import type { Exercise, Person, Training } from '@/lib/types';
import { QUALIFICATIONS } from '@/lib/qualifications';
import Modal from '@/components/Modal';
import { toast } from 'sonner';

interface HistoryEntry {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  kind: 'training' | 'exercise';
  attendance?: string;
  qualificationId?: string;
  qualificationApproved?: boolean;
}

const PERSON_STATUS_CLASS: Record<string, string> = {
  Aktív: 'badge-active',
  Tartalékos: 'badge-reserve',
  Szabadságon: 'badge-leave',
  Leszerelt: 'badge-discharged',
};

function AttendanceBadge({ attendance }: { attendance?: string }) {
  const cls =
    attendance === 'Megjelent' ? 'badge-active' :
    attendance === 'Hiányzott' ? 'badge-cancelled' :
    attendance === 'Beteg' ? 'badge-reserve' : 'badge-planned';
  return (
    <span className={`px-2 py-0.5 text-xs font-mono ${cls}`} style={{ borderRadius: '2px' }}>
      {attendance ?? 'Tervezett'}
    </span>
  );
}

interface Props {
  person: Person;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
}

export default function PersonnelDetailModal({ person, canEdit, onClose, onEdit }: Props) {
  const navigate = useNavigate();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState('');
  const [historySort, setHistorySort] = useState<'date-desc' | 'date-asc' | 'name-asc' | 'name-desc'>('date-desc');
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 15;

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([tStore.getAll(), eStore.getAll()])
      .then(([t, e]) => {
        if (!active) return;
        setTrainings(t);
        setExercises(e);
        setLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        toast.error(getErrorMessage(error));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [person.id]);

  const qualifications = useMemo(() => person.qualifications || [], [person.qualifications]);

  const history = useMemo<HistoryEntry[]>(() => {
    return [
      ...trainings
        .filter((t) => t.assigned.some((a) => a.personId === person.id))
        .map((t) => {
          const assignment = t.assigned.find((a) => a.personId === person.id)!;
          return {
            id: t.id,
            name: t.name,
            type: t.type,
            startDate: t.startDate,
            endDate: t.endDate,
            kind: 'training' as const,
            attendance: assignment.attendance,
            qualificationId: t.qualificationId,
            qualificationApproved: Boolean(assignment.qualificationApproved),
          };
        }),
      ...exercises
        .filter((e) => e.assigned.some((a) => a.personId === person.id))
        .map((e) => {
          const assignment = e.assigned.find((a) => a.personId === person.id)!;
          return {
            id: e.id,
            name: e.name,
            type: e.type,
            startDate: e.startDate,
            endDate: e.endDate,
            kind: 'exercise' as const,
            attendance: assignment.attendance,
          };
        }),
    ];
  }, [trainings, exercises, person.id]);

  const visibleHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const base = history.filter((item) => {
      if (!q) return true;
      const qualificationLabel = item.qualificationId ? (QUALIFICATIONS.find((x) => x.id === item.qualificationId)?.label || item.qualificationId) : '';
      return [item.name, item.type, item.startDate, item.endDate, item.attendance || '', qualificationLabel]
        .some((value) => value.toLowerCase().includes(q));
    });

    const sorted = [...base];
    sorted.sort((a, b) => {
      if (historySort === 'date-asc') return a.startDate.localeCompare(b.startDate);
      if (historySort === 'date-desc') return b.startDate.localeCompare(a.startDate);
      if (historySort === 'name-asc') return a.name.localeCompare(b.name, 'hu');
      return b.name.localeCompare(a.name, 'hu');
    });
    return sorted;
  }, [history, historySearch, historySort]);

  const totalPages = Math.max(1, Math.ceil(visibleHistory.length / historyPageSize));
  const safePage = Math.min(historyPage, totalPages);
  const pagedHistory = visibleHistory.slice((safePage - 1) * historyPageSize, safePage * historyPageSize);

  useEffect(() => {
    setHistoryPage(1);
  }, [historySearch, historySort, person.id]);

  return (
    <Modal open onClose={onClose} title={person.name} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-military">Rendfokozat</span>
            <p className="text-brass font-mono mt-1">{person.rank}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-military">SZTSz</span>
            <p className="font-mono text-primary mt-1">{person.sztsz}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-military">Alegység</span>
            <p className="mt-1">{person.unit}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-military">Beosztás</span>
            <p className="mt-1">{person.beosztas || '-'}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-military">Státusz</span>
            <span className={`inline-flex items-center px-2 py-0.5 text-xs uppercase tracking-military font-mono mt-1 ${PERSON_STATUS_CLASS[person.status]}`} style={{ borderRadius: '2px' }}>
              {person.status === 'Aktív' && <span className="pulse-dot" />}
              {person.status}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <div className="h-px flex-1 bg-primary/30" />
          <span className="text-xs uppercase tracking-military text-primary font-mono">Képzettségek (jóváhagyott képzésekből)</span>
          <div className="h-px flex-1 bg-primary/30" />
        </div>

        <div className="flex flex-wrap gap-2">
          {qualifications.length === 0 && <span className="text-xs text-muted-foreground font-mono">Nincs jóváhagyott képzettség</span>}
          {qualifications.map((id) => {
            const item = QUALIFICATIONS.find((q) => q.id === id);
            const label = item?.label || id;
            return (
              <span key={id} className="px-2 py-1 text-xs font-mono uppercase tracking-military badge-active" style={{ borderRadius: '2px' }}>
                {label}
              </span>
            );
          })}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <div className="h-px flex-1 bg-primary/30" />
          <span className="text-xs uppercase tracking-military text-primary font-mono">Kiképzési előzmények ({visibleHistory.length})</span>
          <div className="h-px flex-1 bg-primary/30" />
        </div>

        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Keresés előzményekben</label>
            <input value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="Név / típus / dátum / jelenlét / képzettség" className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: '2px' }} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Rendezés</label>
            <select value={historySort} onChange={e => setHistorySort(e.target.value as typeof historySort)} className="bg-input border border-border px-3 py-2 text-xs" style={{ borderRadius: '2px' }}>
              <option value="date-desc">Dátum (új → régi)</option>
              <option value="date-asc">Dátum (régi → új)</option>
              <option value="name-asc">Név (A-Z)</option>
              <option value="name-desc">Név (Z-A)</option>
            </select>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground font-mono text-xs py-4">Betöltés...</p>
        ) : (
          <>
            <table className="w-full mil-table">
              <thead>
                <tr>
                  <th>Megnevezés</th>
                  <th>Típus</th>
                  <th>Időszak</th>
                  <th>Jelenlét</th>
                  <th>Képzettség</th>
                </tr>
              </thead>
              <tbody>
                {pagedHistory.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted-foreground font-mono text-xs py-4">Nincs találat</td>
                  </tr>
                )}
                {pagedHistory.map((item) => {
                  const qualificationLabel = item.qualificationId
                    ? (QUALIFICATIONS.find((q) => q.id === item.qualificationId)?.label || item.qualificationId)
                    : '-';
                  const pendingApproval = item.kind === 'training' && item.qualificationId && item.attendance === 'Megjelent' && !item.qualificationApproved;
                  const handleRowClick = () => {
                    onClose();
                    if (item.kind === 'training') {
                      navigate('/operations?source=training', { state: { openOperationId: item.id, openOperationSource: 'training' } });
                    } else {
                      navigate('/operations?source=exercise', { state: { openOperationId: item.id, openOperationSource: 'exercise' } });
                    }
                  };
                  return (
                    <tr
                      key={`${item.kind}-${item.id}`}
                      className={`cursor-pointer hover:bg-secondary transition-colors${pendingApproval ? ' bg-warning/10' : ''}`}
                      onClick={handleRowClick}
                      title="Kattints a megnyitáshoz"
                    >
                      <td>{item.name}</td>
                      <td><span className="mono-chip text-xs">{item.type}</span></td>
                      <td className="font-mono text-primary text-xs">{item.startDate.slice(0, 10)} → {item.endDate.slice(0, 10)}</td>
                      <td><AttendanceBadge attendance={item.attendance} /></td>
                      <td>
                        {item.kind === 'training' && item.qualificationId ? (
                          <span className={`px-2 py-0.5 text-xs font-mono ${item.qualificationApproved ? 'badge-active' : 'badge-planned'}`} style={{ borderRadius: '2px' }}>
                            {qualificationLabel} {item.qualificationApproved ? '(jóváhagyva)' : '(nincs jóváhagyva)'}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{qualificationLabel}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
              <div>Összes előzmény: {visibleHistory.length}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))} className="btn-mil-secondary text-xs" disabled={safePage <= 1}>Előző</button>
                <span>{safePage} / {totalPages}</span>
                <button onClick={() => setHistoryPage(prev => Math.min(totalPages, prev + 1))} className="btn-mil-secondary text-xs" disabled={safePage >= totalPages}>Következő</button>
              </div>
            </div>
          </>
        )}

        <div className="flex gap-2 justify-end pt-2">
          {canEdit && <button onClick={onEdit} className="btn-mil-secondary text-xs">Szerkesztés</button>}
          <button onClick={onClose} className="btn-mil-secondary text-xs">Bezárás</button>
        </div>
      </div>
    </Modal>
  );
}

