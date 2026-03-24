import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DatePickerInput from '@/components/DatePickerInput';
import { exercises, equipment, supplies, activityLog, duties, reports, getErrorMessage } from '@/lib/store';
import { Users, Crosshair, Package, AlertTriangle, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function Dashboard() {
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  const [exs, setExs] = useState<any[]>([]);
  const [eqs, setEqs] = useState<any[]>([]);
  const [sups, setSups] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [dutiesData, setDutiesData] = useState<any[]>([]);
  const [showOnDutyDetails, setShowOnDutyDetails] = useState(false);
  const [pdfFrom, setPdfFrom] = useState('');
  const [pdfTo, setPdfTo] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [nextExs, nextEqs, nextSups, nextLogs, nextDuties] = await Promise.all([
        exercises.getAll(),
        equipment.getAll(),
        supplies.getAll(),
        activityLog.getAll(),
        duties.getAll(),
      ]);
      setExs(nextExs);
      setEqs(nextEqs);
      setSups(nextSups);
      setLogs(nextLogs);
      setDutiesData(nextDuties);
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

  const todayIso = new Date().toISOString().slice(0, 10);
  const onDutyToday = dutiesData
    .filter(d => d.status !== 'Lemondva' && d.startDate.slice(0, 10) <= todayIso && d.endDate.slice(0, 10) >= todayIso)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const onDutyTodayCount = new Set(onDutyToday.map(d => d.personId)).size;

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

  const handleDownloadPdf = async () => {
    try {
      await reports.downloadOperationsPdf({ dateFrom: pdfFrom || undefined, dateTo: pdfTo || undefined });
      toast.success('PDF riport letöltve');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military mb-6 text-foreground">Áttekintés</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <button onClick={() => setShowOnDutyDetails(prev => !prev)} className="stats-card text-left hover:bg-secondary transition-colors">
          <div className="flex items-center gap-2 mb-2"><Users className="w-4 h-4 text-primary" /></div>
          <div className="stats-number">{onDutyTodayCount}</div>
          <div className="stats-label">Ma szolgálatban</div>
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

      {showOnDutyDetails && (
        <div className="bg-card border border-border mb-6 p-4" style={{ borderRadius: '2px' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm uppercase tracking-military font-mono text-primary">Mai szolgálatok részletezése</h2>
            <button onClick={() => setShowOnDutyDetails(false)} className="btn-mil-secondary text-xs">Bezárás</button>
          </div>
          <div className="space-y-2">
            {onDutyToday.length === 0 && <p className="text-xs text-muted-foreground font-mono">Ma nincs aktív szolgálat.</p>}
            {onDutyToday.map(item => (
              <div key={item.id} className="border border-border px-3 py-2" style={{ borderRadius: '2px' }}>
                <p className="text-sm"><span className="text-primary font-mono">{item.type}</span> — {item.personName}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-card border border-border mb-6 p-4" style={{ borderRadius: '2px' }}>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-primary" />
          <h2 className="text-sm uppercase tracking-military font-mono text-primary">PDF lekérdezés</h2>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Intervallum eleje</label>
            <DatePickerInput value={pdfFrom} onChange={setPdfFrom} className="text-xs" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Intervallum vége</label>
            <DatePickerInput value={pdfTo} onChange={setPdfTo} className="text-xs" />
          </div>
          <button onClick={() => { setPdfFrom(''); setPdfTo(''); }} className="btn-mil-secondary text-xs">Törlés</button>
          <button onClick={() => { void handleDownloadPdf(); }} className="btn-mil-primary text-xs">PDF letöltés</button>
        </div>
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
