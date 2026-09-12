import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  prerequisites as store,
  exercises, events, qualificationTypes,
  getErrorMessage, logAction, EligibilityPerson,
} from '@/lib/store';
import { QualificationType } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Check, GraduationCap, Save, Search, X } from 'lucide-react';

type EventType = 'exercise' | 'event';

const EVENT_TYPES: { key: EventType; label: string }[] = [
  { key: 'exercise', label: 'Művelet' },
  { key: 'event', label: 'Esemény' },
];

type EventOption = { id: string; label: string };

function loadEventOptions(type: EventType): Promise<EventOption[]> {
  const source = { exercise: exercises, event: events }[type];
  return source.getAll().then((items: Array<{ id: string; name?: string; type?: string }>) =>
    items.map(i => ({ id: i.id, label: i.name || i.type || i.id })),
  );
}

export default function Kovetelmenyek() {
  const { canEdit, user } = useAuth();
  const [eventType, setEventType] = useState<EventType>('exercise');
  const [eventOptions, setEventOptions] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState('');
  const [qualTypes, setQualTypes] = useState<QualificationType[]>([]);
  const [selectedQuals, setSelectedQuals] = useState<string[]>([]);
  const [qualSearch, setQualSearch] = useState('');
  const [eligible, setEligible] = useState<EligibilityPerson[]>([]);
  const [search, setSearch] = useState('');
  const [showNotEligible, setShowNotEligible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { qualificationTypes.getAll().then(setQualTypes).catch(() => setQualTypes([])); }, []);

  useEffect(() => {
    loadEventOptions(eventType)
      .then(opts => {
        setEventOptions(opts);
        setEventId(prev => (opts.some(o => o.id === prev) ? prev : (opts[0]?.id ?? '')));
      })
      .catch(error => toast.error(getErrorMessage(error)));
  }, [eventType]);

  const refresh = useCallback(async () => {
    if (!eventId) { setSelectedQuals([]); setEligible([]); return; }
    setLoading(true);
    try {
      const [prereq, eligibility] = await Promise.all([
        store.get(eventType, eventId),
        store.eligibility(eventType, eventId, undefined, true),
      ]);
      setSelectedQuals(prereq.qualTypeIds);
      setEligible(eligibility);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [eventType, eventId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const toggleQual = (id: string) =>
    setSelectedQuals(prev => (prev.includes(id) ? prev.filter(q => q !== id) : [...prev, id]));

  const save = async () => {
    if (!eventId) return;
    setSaving(true);
    try {
      await store.set(eventType, eventId, selectedQuals);
      const label = eventOptions.find(o => o.id === eventId)?.label ?? eventId;
      await logAction(user!.displayName, user!.username, 'módosítva', 'Követelmények', label);
      toast.success('Követelmények mentve.');
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const needle = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (needle ? eligible.filter(p => p.name.toLowerCase().includes(needle)) : eligible),
    [eligible, needle],
  );
  const eligibleList = filtered.filter(p => p.eligible);
  const notEligibleList = filtered.filter(p => !p.eligible);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold font-rajdhani tracking-military-wide text-primary flex items-center gap-2">
          <GraduationCap className="w-6 h-6" /> Képzési követelmények
        </h1>
        <p className="text-xs text-muted-foreground tracking-military">
          Állítsd be, mely képesítések szükségesek — a rendszer megmondja, ki jogosult. Így a progresszió (alap → haladó → emelt) kézi ellenőrzés nélkül megy.
        </p>
      </div>

      {/* Event selection */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Típus</label>
          <select
            value={eventType}
            onChange={e => setEventType(e.target.value as EventType)}
            className="bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary"
            style={{ borderRadius: '2px' }}
          >
            {EVENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Esemény</label>
          <select
            value={eventId}
            onChange={e => setEventId(e.target.value)}
            className="w-full bg-input border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary"
            style={{ borderRadius: '2px' }}
          >
            {eventOptions.length === 0 && <option value="">Nincs ilyen esemény</option>}
            {eventOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {eventId && (
        <>
          {/* Prerequisites editor */}
          <div className="bg-card border border-border p-4 space-y-3" style={{ borderRadius: '2px' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-rajdhani font-semibold tracking-military text-foreground">Belépési követelmények</h2>
              {canEdit && (
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-rajdhani font-semibold tracking-wide disabled:opacity-40"
                  style={{ borderRadius: '2px' }}
                >
                  <Save className="w-4 h-4" /> Mentés
                </button>
              )}
            </div>
            {qualTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nincs képesítés-típus.</p>
            ) : (
              <>
                <div className="relative max-w-sm">
                  <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={qualSearch}
                    onChange={e => setQualSearch(e.target.value)}
                    placeholder="Képesítés keresése…"
                    className="w-full bg-input border border-border pl-8 pr-3 py-1.5 text-foreground text-sm focus:outline-none focus:border-primary"
                    style={{ borderRadius: '2px' }}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2 max-h-72 overflow-auto">
                {qualTypes
                  .filter(qt => !qualSearch.trim() || qt.name.toLowerCase().includes(qualSearch.trim().toLowerCase()))
                  .map(qt => (
                  <label key={qt.id} className={`flex items-center gap-2 px-2 py-1.5 border text-sm cursor-pointer select-none ${selectedQuals.includes(qt.id) ? 'border-primary bg-primary/10' : 'border-border'} ${canEdit ? '' : 'pointer-events-none opacity-70'}`} style={{ borderRadius: '2px' }}>
                    <input
                      type="checkbox"
                      checked={selectedQuals.includes(qt.id)}
                      onChange={() => toggleQual(qt.id)}
                      disabled={!canEdit}
                    />
                    <span className="text-foreground">{qt.name}</span>
                  </label>
                ))}
                </div>
              </>
            )}
            {selectedQuals.length === 0 && (
              <p className="text-xs text-muted-foreground">Nincs követelmény — mindenki jogosult.</p>
            )}
          </div>

          {/* Eligibility */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="px-3 py-1.5 bg-card border border-border text-sm font-rajdhani" style={{ borderRadius: '2px' }}>
              Jogosult: <span className="font-bold text-emerald-400">{eligible.filter(p => p.eligible).length}</span>
            </span>
            <span className="px-3 py-1.5 bg-card border border-border text-sm font-rajdhani" style={{ borderRadius: '2px' }}>
              Nem jogosult: <span className="font-bold text-destructive">{eligible.filter(p => !p.eligible).length}</span>
            </span>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Név szűrése…"
                className="w-full bg-input border border-border pl-8 pr-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary"
                style={{ borderRadius: '2px' }}
              />
            </div>
          </div>

          {loading ? (
            <p className="text-muted-foreground">Betöltés…</p>
          ) : (
            <>
              {/* Eligible */}
              <div className="border border-border" style={{ borderRadius: '2px' }}>
                <div className="px-3 py-2 bg-secondary text-sm font-rajdhani font-semibold text-emerald-400 flex items-center gap-2">
                  <Check className="w-4 h-4" /> Jogosultak ({eligibleList.length})
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {eligibleList.length === 0 ? (
                      <tr><td className="px-3 py-4 text-center text-muted-foreground">Senki sem teljesíti a követelményeket.</td></tr>
                    ) : eligibleList.map(p => (
                      <tr key={p.personnelId} className="border-t border-border/50">
                        <td className="px-3 py-1.5 font-rajdhani text-foreground">{p.name}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{p.rank}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{p.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Not eligible (collapsed by default) */}
              {notEligibleList.length > 0 && (
                <div className="border border-border" style={{ borderRadius: '2px' }}>
                  <button
                    onClick={() => setShowNotEligible(v => !v)}
                    className="w-full px-3 py-2 bg-secondary text-sm font-rajdhani font-semibold text-destructive flex items-center gap-2"
                  >
                    <X className="w-4 h-4" /> Nem jogosultak ({notEligibleList.length}) — {showNotEligible ? 'elrejtés' : 'mutasd'}
                  </button>
                  {showNotEligible && (
                    <table className="w-full text-sm">
                      <tbody>
                        {notEligibleList.map(p => (
                          <tr key={p.personnelId} className="border-t border-border/50">
                            <td className="px-3 py-1.5 font-rajdhani text-foreground">{p.name}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{p.rank}</td>
                            <td className="px-3 py-1.5 text-xs text-destructive">Hiányzik: {p.missing.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
