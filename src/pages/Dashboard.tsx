import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { personnel, exercises, equipment, supplies, activityLog, getErrorMessage } from '@/lib/store';
import { Users, Crosshair, Package, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function Dashboard() {
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  const [ppl, setPpl] = useState<any[]>([]);
  const [exs, setExs] = useState<any[]>([]);
  const [eqs, setEqs] = useState<any[]>([]);
  const [sups, setSups] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [nextPpl, nextExs, nextEqs, nextSups, nextLogs] = await Promise.all([
        personnel.getAll(),
        exercises.getAll(),
        equipment.getAll(),
        supplies.getAll(),
        activityLog.getAll(),
      ]);
      setPpl(nextPpl);
      setExs(nextExs);
      setEqs(nextEqs);
      setSups(nextSups);
      setLogs(nextLogs);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => {
      setTick(t => t + 1);
      void refresh();
    }, 30000);
    return () => clearInterval(iv);
  }, [refresh]);

  const activePpl = ppl.filter(p => p.status !== 'Leszerelt').length;
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);
  const upcoming = exs.filter(e => {
    const sd = new Date(e.startDate);
    return sd >= now && sd <= in30 && (e.status === 'Tervezett' || e.status === 'Folyamatban');
  });
  const checkedOut = eqs.filter(e => e.checkedOutTo).length;
  const lowStock = sups.filter(s => s.currentQty < s.minQty).length;

  const upcomingExs = exs
    .filter(e => e.status === 'Tervezett' || e.status === 'Folyamatban')
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 3);

  return (
    <div>
      <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military mb-6 text-foreground">Áttekintés</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <button onClick={() => navigate('/personnel')} className="stats-card text-left hover:bg-secondary transition-colors">
          <div className="flex items-center gap-2 mb-2"><Users className="w-4 h-4 text-primary" /></div>
          <div className="stats-number">{activePpl}</div>
          <div className="stats-label">Aktív személyzet</div>
        </button>
        <button onClick={() => navigate('/exercises')} className="stats-card text-left hover:bg-secondary transition-colors">
          <div className="flex items-center gap-2 mb-2"><Crosshair className="w-4 h-4 text-primary" /></div>
          <div className="stats-number">{upcoming.length}</div>
          <div className="stats-label">Közelgő gyakorlat (30 nap)</div>
        </button>
        <button onClick={() => navigate('/equipment')} className="stats-card text-left hover:bg-secondary transition-colors">
          <div className="flex items-center gap-2 mb-2"><Package className="w-4 h-4 text-primary" /></div>
          <div className="stats-number">{checkedOut}</div>
          <div className="stats-label">Kiadott felszerelés</div>
        </button>
        <button onClick={() => navigate('/inventory')} className="stats-card text-left hover:bg-secondary transition-colors">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-warning" /></div>
          <div className="stats-number text-warning" style={{ color: 'hsl(var(--mil-warning))' }}>{lowStock}</div>
          <div className="stats-label">Alacsony készlet</div>
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="h-px flex-1 bg-primary/30" />
        <span className="text-xs uppercase tracking-military text-primary font-mono">Közelgő gyakorlatok</span>
        <div className="h-px flex-1 bg-primary/30" />
      </div>

      <div className="bg-card border border-border mb-8 overflow-hidden" style={{ borderRadius: '2px' }}>
        <table className="w-full mil-table">
          <thead><tr>
            <th>Megnevezés</th><th>Dátum</th><th>Helyszín</th><th>Létszám</th><th>Státusz</th>
          </tr></thead>
          <tbody>
            {upcomingExs.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground font-mono py-8">Nincs adat</td></tr>}
            {upcomingExs.map(e => (
              <tr key={e.id}>
                <td className="font-semibold">{e.name}</td>
                <td className="font-mono text-primary text-xs">{e.startDate} → {e.endDate}</td>
                <td>{e.location}</td>
                <td className="font-mono text-primary">{e.assigned.length}/{e.maxPersonnel}</td>
                <td>
                  <span className={`inline-flex items-center px-2 py-0.5 text-xs uppercase tracking-military font-mono ${
                    e.status === 'Folyamatban' ? 'badge-ongoing' : 'badge-planned'
                  }`} style={{ borderRadius: '2px' }}>
                    {e.status === 'Folyamatban' && <span className="pulse-dot" />}
                    {e.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="h-px flex-1 bg-primary/30" />
        <span className="text-xs uppercase tracking-military text-primary font-mono">Legutóbbi tevékenységek</span>
        <div className="h-px flex-1 bg-primary/30" />
      </div>

      <div className="bg-card border border-border overflow-hidden" style={{ borderRadius: '2px' }}>
        <table className="w-full mil-table">
          <thead><tr>
            <th>Időpont</th><th>Felhasználó</th><th>Művelet</th><th>Modul</th><th>Rekord</th>
          </tr></thead>
          <tbody>
            {logs.slice(0, 10).map(l => (
              <tr key={l.id}>
                <td className="font-mono text-primary text-xs">{new Date(l.timestamp).toLocaleString('hu-HU')}</td>
                <td className="text-brass">{l.userName}</td>
                <td>
                  <span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${
                    l.action === 'létrehozva' ? 'badge-ongoing' : l.action === 'törölve' ? 'badge-cancelled' : 'badge-reserve'
                  }`} style={{ borderRadius: '2px' }}>
                    {l.action}
                  </span>
                </td>
                <td className="text-muted-foreground">{l.module}</td>
                <td>{l.recordName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground font-mono mt-4">Frissítve: {new Date().toLocaleTimeString('hu-HU')}</p>
    </div>
  );
}
