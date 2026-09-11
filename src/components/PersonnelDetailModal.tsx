import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  personnel as pStore,
  personnelQualifications as pqStore,
  qualificationTypes as qtStore,
  documents as docStore,
  getErrorMessage,
  type PersonDocument,
} from '@/lib/store';
import type { PersonnelQualification, QualificationType } from '@/lib/types';
import type { Person } from '@/lib/types';
import Modal from '@/components/Modal';
import { toast } from 'sonner';
import { differenceInDays, parseISO } from 'date-fns';

// ── Állapot badge-ek ──────────────────────────────────────────────────────────

const PERSON_STATUS_CLASS: Record<string, string> = {
  Aktív: 'badge-active',
  Tartalékos: 'badge-reserve',
  Szabadságon: 'badge-leave',
  Leszerelt: 'badge-discharged',
};

function QualBadge({ qual }: { qual: PersonnelQualification }) {
  const today = new Date();
  let cls = 'badge-active';
  let label = 'Érvényes';
  if (qual.expiryDate) {
    const expiry = parseISO(qual.expiryDate);
    const days = differenceInDays(expiry, today);
    if (days < 0) {
      cls = 'badge-cancelled';
      label = `Lejárt ${Math.abs(days)} napja`;
    } else if (days <= 30) {
      cls = 'badge-reserve';
      label = `${days} nap múlva jár le`;
    } else {
      label = `${days} nap múlva jár le`;
    }
  } else {
    label = 'Nem jár le';
  }
  return (
    <span className={`px-2 py-0.5 text-xs font-mono ${cls}`} style={{ borderRadius: '2px' }}>
      {label}
    </span>
  );
}

function AttendanceBadge({ status }: { status?: string }) {
  const cls =
    status === 'Megjelent' ? 'badge-active' :
    status === 'Hiányzott' ? 'badge-cancelled' :
    status === 'Beteg' ? 'badge-reserve' : 'badge-planned';
  return (
    <span className={`px-2 py-0.5 text-xs font-mono ${cls}`} style={{ borderRadius: '2px' }}>
      {status ?? 'Tervezett'}
    </span>
  );
}

// ── Típusok ───────────────────────────────────────────────────────────────────

interface HistoryEntry {
  eventType: string;
  eventId: string;
  eventName: string;
  eventSubtype: string;
  startDate: string;
  endDate: string;
  location: string;
  status: string;
  role: string;
  qualificationApproved: boolean;
  notes: string;
}

interface Props {
  person: Person;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
}

// ── Fő komponens ──────────────────────────────────────────────────────────────

export default function PersonnelDetailModal({ person, canEdit, onClose, onEdit }: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'alap' | 'kepesitsegek' | 'okmanyok' | 'elozmenyek'>('alap');
  const [docs, setDocs] = useState<PersonDocument[]>([]);
  const [addingDoc, setAddingDoc] = useState(false);
  const [docCategory, setDocCategory] = useState<'Okmány' | 'Alkalmasság' | 'Szerződés' | 'Egyéb'>('Okmány');
  const [docName, setDocName] = useState('');
  const [docIdentifier, setDocIdentifier] = useState('');
  const [docIssued, setDocIssued] = useState('');
  const [docExpiry, setDocExpiry] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [savingDoc, setSavingDoc] = useState(false);
  const [qualifications, setQualifications] = useState<PersonnelQualification[]>([]);
  const [qualTypes, setQualTypes] = useState<QualificationType[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Képesítés hozzáadás form
  const [addingQual, setAddingQual] = useState(false);
  const [newQualName, setNewQualName] = useState('');
  const [newQualEarned, setNewQualEarned] = useState('');
  const [newQualExpiry, setNewQualExpiry] = useState('');
  const [newQualNotes, setNewQualNotes] = useState('');
  const [savingQual, setSavingQual] = useState(false);

  // Előzményszűrés
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 15;

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      pqStore.getForPerson(person.id),
      qtStore.getAll(),
      pStore.getHistory(person.id),
      docStore.getForPerson(person.id),
    ])
      .then(([quals, types, hist, personDocs]) => {
        if (!active) return;
        setQualifications(quals);
        setQualTypes(types);
        setHistory(hist as HistoryEntry[]);
        setDocs(personDocs);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        toast.error(getErrorMessage(err));
        setLoading(false);
      });
    return () => { active = false; };
  }, [person.id]);

  async function handleAddQual() {
    const name = newQualName.trim();
    if (!name) {
      toast.error('Add meg a képesítés nevét');
      return;
    }
    setSavingQual(true);
    try {
      // Csak meglévő képzettség adható ki — új típust a Műveletek résznél hoznak létre.
      const type = qualTypes.find(t => t.name.toLowerCase() === name.toLowerCase());
      if (!type) {
        toast.error('Nincs ilyen képzettség — hozd létre a Műveletek → Képzettségek résznél.');
        setSavingQual(false);
        return;
      }
      const now = new Date();
      const earned = newQualEarned || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const created = await pqStore.add(person.id, {
        personnelId: person.id,
        qualTypeId: type.id,
        earnedDate: earned,
        expiryDate: newQualExpiry || null,
        notes: newQualNotes,
      });
      setQualifications(prev => [created, ...prev]);
      setAddingQual(false);
      setNewQualName(''); setNewQualEarned(''); setNewQualExpiry(''); setNewQualNotes('');
      toast.success('Képesítés kiadva');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingQual(false);
    }
  }

  async function handleRemoveQual(qual: PersonnelQualification) {
    if (!confirm(`Törlöd a(z) "${qual.qualTypeName}" képesítést?`)) return;
    try {
      await pqStore.remove(person.id, qual.id);
      setQualifications(prev => prev.filter(q => q.id !== qual.id));
      toast.success('Képesítés törölve');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function handleAddDoc() {
    const name = docName.trim();
    if (!name) { toast.error('Add meg az okmány/alkalmasság nevét'); return; }
    setSavingDoc(true);
    try {
      const created = await docStore.add(person.id, {
        category: docCategory, name, identifier: docIdentifier,
        issuedDate: docIssued, expiryDate: docExpiry || null, notes: docNotes,
      });
      setDocs(prev => [created, ...prev]);
      setAddingDoc(false);
      setDocName(''); setDocIdentifier(''); setDocIssued(''); setDocExpiry(''); setDocNotes('');
      toast.success('Rögzítve');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingDoc(false);
    }
  }

  async function handleRemoveDoc(doc: PersonDocument) {
    if (!confirm(`Törlöd a(z) "${doc.name}" tételt?`)) return;
    try {
      await docStore.remove(doc.id);
      setDocs(prev => prev.filter(d => d.id !== doc.id));
      toast.success('Törölve');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  const docExpiredCount = docs.filter(d => d.isExpired).length;

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return history;
    return history.filter(h =>
      [h.eventName, h.eventSubtype, h.startDate, h.endDate, h.location, h.status, h.role]
        .some(v => v.toLowerCase().includes(q))
    );
  }, [history, historySearch]);

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / historyPageSize));
  const safePage = Math.min(historyPage, totalPages);
  const pagedHistory = filteredHistory.slice((safePage - 1) * historyPageSize, safePage * historyPageSize);

  const EVENT_TYPE_LABEL: Record<string, string> = {
    exercise: 'Gyakorlat', training: 'Kiképzés', event: 'Esemény', duty: 'Ügyelet',
  };

  const expiredCount = qualifications.filter(q => q.isExpired).length;
  const expiringSoonCount = qualifications.filter(q => !q.isExpired && q.daysUntilExpiry !== null && q.daysUntilExpiry <= 30).length;

  return (
    <Modal open onClose={onClose} title={person.name} wide>
      <div className="space-y-4">
        {/* Fejléc */}
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

        {/* Tab-navigáció */}
        <div className="flex border-b border-border gap-4">
          {(['alap', 'kepesitsegek', 'okmanyok', 'elozmenyek'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 text-xs uppercase tracking-military font-mono transition-colors ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t === 'alap' ? 'Alapadatok' :
               t === 'kepesitsegek' ? (
                 <span className="flex items-center gap-1">
                   Képesítések
                   {expiredCount > 0 && <span className="px-1 text-xs badge-cancelled">{expiredCount}</span>}
                   {expiringSoonCount > 0 && !expiredCount && <span className="px-1 text-xs badge-reserve">{expiringSoonCount}</span>}
                 </span>
               ) :
               t === 'okmanyok' ? (
                 <span className="flex items-center gap-1">
                   Okmányok/Alkalmasság
                   {docExpiredCount > 0 && <span className="px-1 text-xs badge-cancelled">{docExpiredCount}</span>}
                 </span>
               ) : `Előzmények (${history.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground font-mono text-xs py-8">Betöltés...</p>
        ) : (
          <>
            {/* ── Alapadatok tab ── */}
            {tab === 'alap' && (
              <div className="space-y-3 text-sm">
                {person.email && (
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-military">Email</span>
                    <p className="font-mono mt-1">{person.email}</p>
                  </div>
                )}
                {person.phone && (
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-military">Telefon</span>
                    <p className="font-mono mt-1">{person.phone}</p>
                  </div>
                )}
                {person.birthDate && (
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-military">Születési dátum</span>
                    <p className="font-mono mt-1">{person.birthDate}</p>
                  </div>
                )}
                {person.joinDate && (
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-military">Belépés dátuma</span>
                    <p className="font-mono mt-1">{person.joinDate}</p>
                  </div>
                )}
                {person.address && (
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-military">Lakcím</span>
                    <p className="mt-1">{person.address}</p>
                  </div>
                )}
                {person.notes && (
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-military">Megjegyzés</span>
                    <p className="mt-1 text-muted-foreground">{person.notes}</p>
                  </div>
                )}
                {person.extra && Object.keys(person.extra).length > 0 && (
                  <div className="border-t border-border pt-3">
                    <span className="text-muted-foreground text-xs uppercase tracking-military">Importált adatok (KGIR-export)</span>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                      {Object.entries(person.extra).map(([key, value]) => (
                        <div key={key} className="contents">
                          <dt className="text-muted-foreground">{key}</dt>
                          <dd className="font-mono">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            )}

            {/* ── Képesítések tab ── */}
            {tab === 'kepesitsegek' && (
              <div className="space-y-3">
                {canEdit && (
                  <div>
                    {!addingQual ? (
                      <button onClick={() => setAddingQual(true)} className="btn-mil-secondary text-xs">
                        + Képesítés hozzáadása
                      </button>
                    ) : (
                      <div className="border border-border p-3 space-y-3" style={{ borderRadius: '2px' }}>
                        <p className="text-xs uppercase tracking-military text-primary font-mono">Új képesítés</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1">Képesítés neve *</label>
                            <input
                              type="text"
                              list="qual-type-names"
                              value={newQualName}
                              onChange={e => setNewQualName(e.target.value)}
                              placeholder="Írd be vagy válaszd ki…"
                              className="w-full bg-input border border-border px-2 py-1.5 text-sm"
                              style={{ borderRadius: '2px' }}
                            />
                            <datalist id="qual-type-names">
                              {qualTypes.map(qt => <option key={qt.id} value={qt.name} />)}
                            </datalist>
                            <p className="text-[11px] text-muted-foreground mt-1">Csak meglévő képzettség adható ki (újat a Műveleteknél hozz létre).</p>
                          </div>
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1">Megszerzés dátuma (alapból ma)</label>
                            <input type="date" value={newQualEarned} onChange={e => setNewQualEarned(e.target.value)} className="w-full bg-input border border-border px-2 py-1.5 text-sm" style={{ borderRadius: '2px' }} />
                          </div>
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1">Lejárat dátuma (opcionális)</label>
                            <input type="date" value={newQualExpiry} onChange={e => setNewQualExpiry(e.target.value)} className="w-full bg-input border border-border px-2 py-1.5 text-sm" style={{ borderRadius: '2px' }} />
                          </div>
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1">Megjegyzés</label>
                            <input type="text" value={newQualNotes} onChange={e => setNewQualNotes(e.target.value)} className="w-full bg-input border border-border px-2 py-1.5 text-sm" style={{ borderRadius: '2px' }} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleAddQual} disabled={savingQual} className="btn-mil-primary text-xs">
                            {savingQual ? 'Kiadás...' : 'Kiad'}
                          </button>
                          <button onClick={() => setAddingQual(false)} className="btn-mil-secondary text-xs">Mégse</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {qualifications.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-mono py-4">Nincs rögzített képesítés</p>
                ) : (
                  <table className="w-full mil-table">
                    <thead>
                      <tr>
                        <th>Képesítés</th>
                        <th>Kategória</th>
                        <th>Megszerzés</th>
                        <th>Lejárat</th>
                        <th>Állapot</th>
                        {canEdit && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {qualifications.map(q => (
                        <tr key={q.id}>
                          <td className="font-mono text-sm">{q.qualTypeName}</td>
                          <td><span className="mono-chip">{q.qualTypeCategory}</span></td>
                          <td className="font-mono text-xs text-primary">{q.earnedDate}</td>
                          <td className="font-mono text-xs text-muted-foreground">{q.expiryDate ?? '—'}</td>
                          <td><QualBadge qual={q} /></td>
                          {canEdit && (
                            <td>
                              <button onClick={() => handleRemoveQual(q)} className="text-xs text-destructive hover:text-destructive/80 font-mono">
                                Törlés
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── Előzmények tab ── */}
            {tab === 'okmanyok' && (
              <div className="space-y-3">
                {canEdit && (
                  !addingDoc ? (
                    <button onClick={() => setAddingDoc(true)} className="btn-mil-secondary text-xs">+ Okmány / alkalmasság hozzáadása</button>
                  ) : (
                    <div className="border border-border p-3 space-y-3" style={{ borderRadius: '2px' }}>
                      <p className="text-xs uppercase tracking-military text-primary font-mono">Új tétel</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Kategória</label>
                          <select value={docCategory} onChange={e => setDocCategory(e.target.value as 'Okmány' | 'Alkalmasság' | 'Szerződés' | 'Egyéb')} className="w-full bg-input border border-border px-2 py-1.5 text-sm" style={{ borderRadius: '2px' }}>
                            <option value="Okmány">Okmány</option>
                            <option value="Alkalmasság">Alkalmasság</option>
                            <option value="Szerződés">Szerződés (jogviszony)</option>
                            <option value="Egyéb">Egyéb</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Megnevezés *</label>
                          <input value={docName} onChange={e => setDocName(e.target.value)} placeholder="pl. Katonai igazolvány / Orvosi alkalmasság" className="w-full bg-input border border-border px-2 py-1.5 text-sm" style={{ borderRadius: '2px' }} />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Azonosító (opcionális)</label>
                          <input value={docIdentifier} onChange={e => setDocIdentifier(e.target.value)} className="w-full bg-input border border-border px-2 py-1.5 text-sm" style={{ borderRadius: '2px' }} />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Kiállítás dátuma</label>
                          <input type="date" value={docIssued} onChange={e => setDocIssued(e.target.value)} className="w-full bg-input border border-border px-2 py-1.5 text-sm" style={{ borderRadius: '2px' }} />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Lejárat (opcionális)</label>
                          <input type="date" value={docExpiry} onChange={e => setDocExpiry(e.target.value)} className="w-full bg-input border border-border px-2 py-1.5 text-sm" style={{ borderRadius: '2px' }} />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Megjegyzés</label>
                          <input value={docNotes} onChange={e => setDocNotes(e.target.value)} className="w-full bg-input border border-border px-2 py-1.5 text-sm" style={{ borderRadius: '2px' }} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleAddDoc} disabled={savingDoc} className="btn-mil-primary text-xs">{savingDoc ? 'Mentés...' : 'Mentés'}</button>
                        <button onClick={() => setAddingDoc(false)} className="btn-mil-secondary text-xs">Mégse</button>
                      </div>
                    </div>
                  )
                )}
                {docs.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-mono py-4">Nincs rögzített okmány / alkalmasság</p>
                ) : (
                  <table className="w-full mil-table">
                    <thead><tr><th>Kategória</th><th>Megnevezés</th><th>Azonosító</th><th>Lejárat</th><th>Állapot</th>{canEdit && <th></th>}</tr></thead>
                    <tbody>
                      {docs.map(d => (
                        <tr key={d.id}>
                          <td><span className="mono-chip text-[10px]">{d.category}</span></td>
                          <td className="font-mono text-sm">{d.name}</td>
                          <td className="font-mono text-xs text-muted-foreground">{d.identifier || '—'}</td>
                          <td className="font-mono text-xs">{d.expiryDate || '—'}</td>
                          <td>
                            {d.expiryDate == null ? <span className="text-xs text-muted-foreground">nincs lejárat</span>
                              : d.isExpired ? <span className="px-2 py-0.5 text-xs badge-cancelled" style={{ borderRadius: '2px' }}>Lejárt</span>
                              : (d.daysUntilExpiry ?? 99) <= 30 ? <span className="px-2 py-0.5 text-xs badge-reserve" style={{ borderRadius: '2px' }}>{d.daysUntilExpiry} nap</span>
                              : <span className="px-2 py-0.5 text-xs badge-active" style={{ borderRadius: '2px' }}>Érvényes</span>}
                          </td>
                          {canEdit && <td><button onClick={() => handleRemoveDoc(d)} className="text-xs text-destructive hover:text-destructive/80 font-mono">Törlés</button></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === 'elozmenyek' && (
              <div className="space-y-3">
                <div>
                  <input
                    value={historySearch}
                    onChange={e => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                    placeholder="Keresés a előzményekben..."
                    className="w-full bg-input border border-border px-3 py-2 text-sm"
                    style={{ borderRadius: '2px' }}
                  />
                </div>

                <table className="w-full mil-table">
                  <thead>
                    <tr>
                      <th>Esemény</th>
                      <th>Típus</th>
                      <th>Időszak</th>
                      <th>Helyszín</th>
                      <th>Státusz / Jelenlét</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedHistory.length === 0 && (
                      <tr><td colSpan={5} className="text-center text-muted-foreground font-mono text-xs py-4">Nincs találat</td></tr>
                    )}
                    {pagedHistory.map((item, i) => (
                      <tr
                        key={`${item.eventType}-${item.eventId}-${i}`}
                        className="cursor-pointer hover:bg-secondary transition-colors"
                        onClick={() => {
                          onClose();
                          if (item.eventType === 'training' || item.eventType === 'exercise') {
                            navigate('/operations', { state: { openOperationId: item.eventId, openOperationSource: item.eventType } });
                          }
                        }}
                      >
                        <td>
                          <span className="font-mono text-xs text-muted-foreground mr-1">
                            [{EVENT_TYPE_LABEL[item.eventType] ?? item.eventType}]
                          </span>
                          {item.eventName}
                        </td>
                        <td><span className="mono-chip">{item.eventSubtype || '—'}</span></td>
                        <td className="font-mono text-primary text-xs">
                          {item.startDate?.slice(0, 10)} → {item.endDate?.slice(0, 10)}
                        </td>
                        <td className="text-xs text-muted-foreground">{item.location || '—'}</td>
                        <td><AttendanceBadge status={item.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                  <div>Összes: {filteredHistory.length}</div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} className="btn-mil-secondary text-xs" disabled={safePage <= 1}>Előző</button>
                    <span>{safePage} / {totalPages}</span>
                    <button onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))} className="btn-mil-secondary text-xs" disabled={safePage >= totalPages}>Következő</button>
                  </div>
                </div>
              </div>
            )}
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
