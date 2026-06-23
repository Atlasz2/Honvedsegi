import React, { useEffect, useMemo, useState } from 'react';
import { availability as store, getErrorMessage, Booking } from '@/lib/store';
import DatePickerInput from '@/components/DatePickerInput';
import { toast } from 'sonner';
import { CalendarSearch, MapPin } from 'lucide-react';

const TYPE_LABEL: Record<Booking['eventType'], string> = {
  exercise: 'Gyakorlat',
  training: 'Kiképzés',
  event: 'Esemény',
  duty: 'Ügyelet',
};

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Availability() {
  const [location, setLocation] = useState('');
  const [fromDate, setFromDate] = useState(addDays(14));
  const [toDate, setToDate] = useState('');
  const [locations, setLocations] = useState<string[]>([]);
  const [result, setResult] = useState<Booking[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    store.locations().then(setLocations).catch(() => setLocations([]));
  }, []);

  const check = async () => {
    if (!fromDate) {
      toast.error('Adj meg legalább kezdő dátumot.');
      return;
    }
    setLoading(true);
    try {
      setResult(await store.check(fromDate, toDate, location));
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const booking of result ?? []) {
      const arr = map.get(booking.location) ?? [];
      arr.push(booking);
      map.set(booking.location, arr);
    }
    return Array.from(map.entries());
  }, [result]);

  const isFree = result !== null && result.length === 0;

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold font-rajdhani tracking-military-wide text-primary flex items-center gap-2">
          <CalendarSearch className="w-6 h-6" /> Foglaltság kereső
        </h1>
        <p className="text-xs text-muted-foreground tracking-military">
          Szabad-e egy helyszín (pl. lőtér) egy adott napon vagy időszakban?
        </p>
      </div>

      {/* Controls */}
      <div className="bg-card border border-border p-4 space-y-3" style={{ borderRadius: '2px' }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Helyszín</label>
            <div className="relative">
              <MapPin className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                list="availability-locations"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="pl. lőtér (üres = mind)"
                className="w-full bg-input border border-border pl-8 pr-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary"
                style={{ borderRadius: '2px' }}
              />
              <datalist id="availability-locations">
                {locations.map(loc => <option key={loc} value={loc} />)}
              </datalist>
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Mettől *</label>
            <DatePickerInput value={fromDate} onChange={setFromDate} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Meddig (opcionális)</label>
            <DatePickerInput value={toDate} onChange={setToDate} placeholder="— (egy nap)" />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={check}
            disabled={loading}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-rajdhani font-semibold tracking-wide disabled:opacity-40"
            style={{ borderRadius: '2px' }}
          >
            Ellenőrzés
          </button>
          <button onClick={() => setFromDate(addDays(0))} className="px-3 py-2 text-sm border border-border text-muted-foreground hover:text-foreground" style={{ borderRadius: '2px' }}>Ma</button>
          <button onClick={() => setFromDate(addDays(14))} className="px-3 py-2 text-sm border border-border text-muted-foreground hover:text-foreground" style={{ borderRadius: '2px' }}>2 hét múlva</button>
        </div>
      </div>

      {/* Result */}
      {result !== null && (
        isFree ? (
          <div className="border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 px-4 py-3 font-rajdhani font-semibold" style={{ borderRadius: '2px' }}>
            SZABAD — nincs foglalás{location.trim() ? ` „${location.trim()}" helyszínen` : ''} a megadott időszakban.
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{result.length} foglalás a megadott időszakban:</p>
            {grouped.map(([loc, items]) => (
              <div key={loc} className="border border-border" style={{ borderRadius: '2px' }}>
                <div className="px-3 py-2 bg-secondary flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="font-rajdhani font-semibold text-foreground">{loc}</span>
                  <span className="px-1.5 py-0.5 bg-destructive/20 text-destructive text-[10px] font-mono" style={{ borderRadius: '2px' }}>FOGLALT</span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {items.map(b => (
                      <tr key={`${b.eventType}-${b.eventId}`} className="border-t border-border/50">
                        <td className="px-3 py-1.5 font-rajdhani text-foreground">{b.eventName}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{TYPE_LABEL[b.eventType]}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{b.startDate} – {b.endDate}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{b.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
