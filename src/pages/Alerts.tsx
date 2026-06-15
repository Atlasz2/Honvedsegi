import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, CheckCircle2, RefreshCw } from "lucide-react";
import { qualificationAlerts } from "@/lib/store";
import type { QualificationAlert, QualificationStat } from "@/lib/types";
import { getErrorMessage } from "@/lib/store";
import { toast } from "sonner";

const DAYS_OPTIONS = [30, 60, 90] as const;
type DaysAhead = (typeof DAYS_OPTIONS)[number];

function urgencyClass(a: QualificationAlert): string {
  if (a.isExpired) return "badge-cancelled";
  if (a.daysUntilExpiry <= 14) return "badge-ongoing";
  return "badge-planned";
}

function urgencyLabel(a: QualificationAlert): string {
  if (a.isExpired) return `Lejárt ${Math.abs(a.daysUntilExpiry)} napja`;
  return `${a.daysUntilExpiry} nap`;
}

export default function Alerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<QualificationAlert[]>([]);
  const [stats, setStats] = useState<QualificationStat[]>([]);
  const [daysAhead, setDaysAhead] = useState<DaysAhead>(60);
  const [showExpired, setShowExpired] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [alertData, statData] = await Promise.all([
        qualificationAlerts.getAlerts(daysAhead),
        qualificationAlerts.getStats(),
      ]);
      setAlerts(alertData);
      setStats(statData);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [daysAhead]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const visible = showExpired ? alerts : alerts.filter((a) => !a.isExpired);
  const expiredCount = alerts.filter((a) => a.isExpired).length;
  const urgentCount = alerts.filter((a) => !a.isExpired && a.daysUntilExpiry <= 14).length;
  const soonCount = alerts.filter((a) => !a.isExpired && a.daysUntilExpiry > 14).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Figyelmeztetések</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">Lejáró és lejárt képesítések nyomon követése</p>
        </div>
        <button onClick={() => { setLoading(true); void refresh(); }} className="btn-mil-secondary flex items-center gap-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5" />
          Frissítés
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stats-card border-l-2 border-l-destructive">
          <div className="stats-number text-destructive">{expiredCount}</div>
          <div className="stats-label">Lejárt</div>
        </div>
        <div className="stats-card border-l-2 border-l-orange-500">
          <div className="stats-number text-orange-500">{urgentCount}</div>
          <div className="stats-label">Sürgős (&lt;14 nap)</div>
        </div>
        <div className="stats-card border-l-2 border-l-primary">
          <div className="stats-number">{soonCount}</div>
          <div className="stats-label">Hamarosan lejár</div>
        </div>
        <div className="stats-card">
          <div className="stats-number">{stats.filter((s) => s.validityDays !== null).length}</div>
          <div className="stats-label">Lejáró képesítéstípus</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-wrap items-center">
        <span className="text-xs uppercase tracking-military text-muted-foreground font-mono">Időablak:</span>
        {DAYS_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDaysAhead(d)}
            className={`px-3 py-1.5 text-xs uppercase tracking-military font-mono ${daysAhead === d ? "btn-mil-primary" : "btn-mil-secondary"}`}
          >
            {d} nap
          </button>
        ))}
        <div className="ml-4 flex items-center gap-2">
          <input
            type="checkbox"
            id="show-expired"
            checked={showExpired}
            onChange={(e) => setShowExpired(e.target.checked)}
            className="accent-primary"
          />
          <label htmlFor="show-expired" className="text-xs font-mono text-muted-foreground">Lejártak megjelenítése</label>
        </div>
      </div>

      {/* Alert table */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <AlertTriangle className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-military">Képesítési figyelmeztetések ({visible.length})</h2>
        </div>

        {loading ? (
          <div className="text-muted-foreground font-mono py-8">Betöltés...</div>
        ) : visible.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground font-mono py-6">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-sm">Nincs figyelmeztetés a kiválasztott időablakban</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full mil-table">
              <thead>
                <tr>
                  <th>Név</th>
                  <th>Rendfokozat</th>
                  <th>Alegység</th>
                  <th>Képesítés</th>
                  <th>Kategória</th>
                  <th>Lejárat</th>
                  <th>Állapot</th>
                </tr>
              </thead>
              <tbody>
                {visible
                  .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
                  .map((a) => (
                    <tr
                      key={`${a.personnelId}-${a.qualificationId}`}
                      className="cursor-pointer hover:bg-secondary transition-colors"
                      onClick={() => navigate("/personnel", { state: { openPersonnelId: a.personnelId } })}
                    >
                      <td className="font-medium">{a.personnelName}</td>
                      <td className="font-mono text-xs text-primary">{a.rank}</td>
                      <td className="text-muted-foreground text-xs">{a.unit}</td>
                      <td>{a.qualTypeName}</td>
                      <td><span className="mono-chip text-[10px]">{a.qualTypeCategory}</span></td>
                      <td className="font-mono text-xs">{a.expiryDate}</td>
                      <td>
                        <span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${urgencyClass(a)}`} style={{ borderRadius: "2px" }}>
                          {a.isExpired ? <AlertTriangle className="w-3 h-3 inline mr-1" /> : <Clock className="w-3 h-3 inline mr-1" />}
                          {urgencyLabel(a)}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stats table */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-military">Képesítési statisztikák</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full mil-table">
            <thead>
              <tr>
                <th>Képesítés neve</th>
                <th>Kategória</th>
                <th>Érvényesség</th>
                <th>Összes állomány</th>
                <th>Rendelkezők (összes)</th>
                <th>Érvényes</th>
                <th>Lefedettség</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => {
                const pct = s.totalPersonnel > 0 ? Math.round((s.holdersValid / s.totalPersonnel) * 100) : 0;
                return (
                  <tr key={s.id}>
                    <td className="font-medium">{s.name}</td>
                    <td><span className="mono-chip text-[10px]">{s.category}</span></td>
                    <td className="font-mono text-xs">
                      {s.validityDays === null ? (
                        <span className="text-muted-foreground">Nem jár le</span>
                      ) : (
                        `${s.validityDays} nap`
                      )}
                    </td>
                    <td className="font-mono text-center">{s.totalPersonnel}</td>
                    <td className="font-mono text-center">{s.holdersAll}</td>
                    <td className="font-mono text-center text-primary">{s.holdersValid}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-border h-2" style={{ borderRadius: "1px" }}>
                          <div
                            className={`h-2 transition-all ${pct >= 80 ? "bg-green-600" : pct >= 50 ? "bg-yellow-500" : "bg-destructive"}`}
                            style={{ width: `${pct}%`, borderRadius: "1px" }}
                          />
                        </div>
                        <span className="font-mono text-xs w-8 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {stats.length === 0 && !loading && (
                <tr><td colSpan={7} className="text-muted-foreground text-xs py-4">Nincs adat</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
