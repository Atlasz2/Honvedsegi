import { useEffect, useState } from 'react';
import { attendance, leave, getErrorMessage, AttendanceDay } from '@/lib/store';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Activity, ClipboardList, Palmtree } from 'lucide-react';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const statusColor: Record<string, string> = {
  'Jelen': 'text-emerald-400',
  'Szabadság': 'text-amber-400',
  'Betegállomány': 'text-red-400',
  'Vezényelve': 'text-sky-400',
  'Szolgálatban': 'text-primary',
  'Kiküldetés': 'text-violet-400',
  'Igazolt távollét': 'text-muted-foreground',
  'Igazolatlan távollét': 'text-destructive',
};

export default function Helyzetkep() {
  const date = today();
  const [day, setDay] = useState<AttendanceDay | null>(null);
  const [pendingLeave, setPendingLeave] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [dayResult, leaves] = await Promise.all([attendance.getDay(date), leave.list('Beadva')]);
        if (active) { setDay(dayResult); setPendingLeave(leaves.length); }
      } catch (error) {
        if (active) toast.error(getErrorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [date]);

  const exceptions = (day?.items ?? []).filter(item => item.status !== 'Jelen');
  const presentCount = day?.summary?.['Jelen'] ?? 0;
  const otherStatuses = Object.entries(day?.summary ?? {})
    .filter(([status]) => status !== 'Jelen')
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-rajdhani tracking-military-wide text-primary flex items-center gap-2">
          <Activity className="w-6 h-6" /> Napi helyzetkép
        </h1>
        <p className="text-xs text-muted-foreground tracking-military">{date} · aktív állomány</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Betöltés…</p>
      ) : (
        <>
          {/* Key numbers */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-card border border-border p-4" style={{ borderRadius: '2px' }}>
              <p className="text-xs uppercase tracking-military text-muted-foreground">Aktív létszám</p>
              <p className="text-3xl font-bold font-rajdhani text-foreground">{day?.total ?? 0}</p>
            </div>
            <div className="bg-card border border-border p-4" style={{ borderRadius: '2px' }}>
              <p className="text-xs uppercase tracking-military text-muted-foreground">Jelen</p>
              <p className="text-3xl font-bold font-rajdhani text-emerald-400">{presentCount}</p>
            </div>
            <div className="bg-card border border-border p-4" style={{ borderRadius: '2px' }}>
              <p className="text-xs uppercase tracking-military text-muted-foreground">Távol / eltérés</p>
              <p className="text-3xl font-bold font-rajdhani text-amber-400">{exceptions.length}</p>
            </div>
            <Link to="/szabadsag" className="bg-card border border-border p-4 hover:border-primary transition-colors" style={{ borderRadius: '2px' }}>
              <p className="text-xs uppercase tracking-military text-muted-foreground flex items-center gap-1"><Palmtree className="w-3 h-3" /> Függő szabadság</p>
              <p className="text-3xl font-bold font-rajdhani text-foreground">{pendingLeave}</p>
            </Link>
          </div>

          {/* Status breakdown chips */}
          {otherStatuses.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {otherStatuses.map(([status, count]) => (
                <span key={status} className="px-3 py-1.5 bg-card border border-border text-sm font-rajdhani" style={{ borderRadius: '2px' }}>
                  {status}: <span className={`font-bold ${statusColor[status] ?? 'text-foreground'}`}>{count}</span>
                </span>
              ))}
            </div>
          )}

          {/* Exceptions — who is NOT present and why */}
          <div>
            <h2 className="text-sm font-rajdhani font-semibold tracking-military text-foreground flex items-center gap-2 mb-2">
              <ClipboardList className="w-4 h-4" /> Eltérések ({exceptions.length})
            </h2>
            <div className="border border-border" style={{ borderRadius: '2px' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-military text-muted-foreground border-b border-border">
                    <th className="px-3 py-2 font-medium">Név</th>
                    <th className="px-3 py-2 font-medium">Rendfokozat</th>
                    <th className="px-3 py-2 font-medium">Egység</th>
                    <th className="px-3 py-2 font-medium">Állapot</th>
                    <th className="px-3 py-2 font-medium">Megjegyzés</th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-emerald-400 font-rajdhani">Teljes az aktív állomány — mindenki jelen.</td></tr>
                  ) : exceptions.map(entry => (
                    <tr key={entry.personnelId} className="border-b border-border/50">
                      <td className="px-3 py-1.5 font-rajdhani text-foreground">{entry.name}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{entry.rank}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{entry.unit}</td>
                      <td className={`px-3 py-1.5 font-medium ${statusColor[entry.status] ?? 'text-foreground'}`}>{entry.status}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{entry.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Részletes szerkesztés: <Link to="/letszam" className="text-primary hover:underline">Létszám</Link>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
