import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, CheckCircle2, RefreshCw } from "lucide-react";
import {
  qualificationAlerts, alerts as alertsStore, documents as docStore,
  type UnexcusedAlert, type ReadinessGap, type ExpiringDocument,
  type LeaveMinimumResult, type BasicTrainingResult, type BasicTrainingItem, type ServiceMinimumResult, type YearDeadline,
} from "@/lib/store";
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

function deadlineClass(item: BasicTrainingItem): string {
  if (item.isOverdue) return "badge-cancelled";
  if (item.isDueSoon) return "badge-ongoing";
  return "badge-planned";
}

/** Az éves kötelezettség határidő-sora: dec. 31., és egy hónappal előtte figyelmeztet. */
function YearDeadlineLine({ d }: { d: YearDeadline }) {
  const cls = d.isOverdue ? "text-destructive" : d.isDueSoon ? "text-amber-400" : "text-muted-foreground";
  const text = d.isOverdue
    ? `Határidő lejárt: ${d.deadline} (${Math.abs(d.daysLeft)} napja)`
    : d.isDueSoon
      ? `Határidő ${d.deadline} — ${d.daysLeft} nap van hátra!`
      : `Határidő ${d.deadline} — ${d.daysLeft} nap van hátra`;
  return <p className={`text-xs font-mono mb-3 ${cls}`}>{text}</p>;
}

function deadlineLabel(item: BasicTrainingItem): string {
  if (item.daysLeft === null) return "nincs jogviszony-kezdet";
  if (item.daysLeft < 0) return `Lejárt ${Math.abs(item.daysLeft)} napja`;
  return `${item.daysLeft} nap`;
}

export default function Alerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<QualificationAlert[]>([]);
  const [stats, setStats] = useState<QualificationStat[]>([]);
  const [unexcused, setUnexcused] = useState<UnexcusedAlert[]>([]);
  const [gaps, setGaps] = useState<ReadinessGap[]>([]);
  const [expiringDocs, setExpiringDocs] = useState<ExpiringDocument[]>([]);
  const [leaveMinimum, setLeaveMinimum] = useState<LeaveMinimumResult | null>(null);
  const [basicTraining, setBasicTraining] = useState<BasicTrainingResult | null>(null);
  const [serviceMinimum, setServiceMinimum] = useState<ServiceMinimumResult | null>(null);
  const [daysAhead, setDaysAhead] = useState<DaysAhead>(60);
  const [showExpired, setShowExpired] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [alertData, statData, unexcusedData, gapData, docData, leaveData, basicData, serviceData] = await Promise.all([
        qualificationAlerts.getAlerts(daysAhead),
        qualificationAlerts.getStats(),
        alertsStore.unexcused(30),
        alertsStore.readinessGaps(),
        docStore.expiring(daysAhead),
        alertsStore.leaveMinimum(),
        alertsStore.basicTraining(),
        alertsStore.serviceMinimum(),
      ]);
      setServiceMinimum(serviceData);
      setAlerts(alertData);
      setStats(statData);
      setUnexcused(unexcusedData);
      setGaps(gapData);
      setExpiringDocs(docData);
      setLeaveMinimum(leaveData);
      setBasicTraining(basicData);
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

      {/* Lejáró okmányok / alkalmasság */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <AlertTriangle className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-military">Lejáró okmányok / alkalmasság ({expiringDocs.length})</h2>
        </div>
        {expiringDocs.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground font-mono py-4"><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-sm">Nincs lejáró okmány a kiválasztott időablakban</span></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full mil-table">
              <thead><tr><th>Név</th><th>Rendfokozat</th><th>Alegység</th><th>Kategória</th><th>Megnevezés</th><th>Lejárat</th><th>Állapot</th></tr></thead>
              <tbody>
                {expiringDocs.map((d) => (
                  <tr key={d.documentId} className="cursor-pointer hover:bg-secondary transition-colors" onClick={() => navigate("/personnel", { state: { openPersonnelId: d.personnelId } })}>
                    <td className="font-medium">{d.name}</td>
                    <td className="font-mono text-xs text-primary">{d.rank}</td>
                    <td className="text-muted-foreground text-xs">{d.unit}</td>
                    <td><span className="mono-chip text-[10px]">{d.category}</span></td>
                    <td>{d.documentName}</td>
                    <td className="font-mono text-xs">{d.expiryDate}</td>
                    <td>
                      <span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${d.isExpired ? "badge-cancelled" : d.daysUntilExpiry <= 14 ? "badge-ongoing" : "badge-planned"}`} style={{ borderRadius: "2px" }}>
                        {d.isExpired ? `Lejárt ${Math.abs(d.daysUntilExpiry)} napja` : `${d.daysUntilExpiry} nap`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Igazolatlan távollétek */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <h2 className="text-sm font-bold uppercase tracking-military">Igazolatlan távollétek — 30 nap ({unexcused.length})</h2>
        </div>
        {unexcused.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground font-mono py-4"><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-sm">Nincs igazolatlan távollét</span></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full mil-table">
              <thead><tr><th>Név</th><th>Rendfokozat</th><th>Alegység</th><th>Dátum</th><th>Megjegyzés</th></tr></thead>
              <tbody>
                {unexcused.map((a, i) => (
                  <tr key={`${a.personnelId}-${a.date}-${i}`} className="cursor-pointer hover:bg-secondary transition-colors" onClick={() => navigate("/personnel", { state: { openPersonnelId: a.personnelId } })}>
                    <td className="font-medium">{a.name}</td>
                    <td className="font-mono text-xs text-primary">{a.rank}</td>
                    <td className="text-muted-foreground text-xs">{a.unit}</td>
                    <td className="font-mono text-xs">{a.date}</td>
                    <td className="text-muted-foreground text-xs">{a.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Készenléti rés */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <AlertTriangle className="w-4 h-4 text-orange-500" />
          <h2 className="text-sm font-bold uppercase tracking-military">Készenléti rés — érvényes képesítés nélkül ({gaps.length})</h2>
        </div>
        {gaps.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground font-mono py-4"><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-sm">Minden aktív katonának van érvényes képesítése</span></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full mil-table">
              <thead><tr><th>Név</th><th>Rendfokozat</th><th>Alegység</th></tr></thead>
              <tbody>
                {gaps.map((g) => (
                  <tr key={g.personnelId} className="cursor-pointer hover:bg-secondary transition-colors" onClick={() => navigate("/personnel", { state: { openPersonnelId: g.personnelId } })}>
                    <td className="font-medium">{g.name}</td>
                    <td className="font-mono text-xs text-primary">{g.rank}</td>
                    <td className="text-muted-foreground text-xs">{g.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Alapkiképzés-határidő */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <Clock className="w-4 h-4 text-destructive" />
          <h2 className="text-sm font-bold uppercase tracking-military">
            Alapkiképzés-határidő — tartalékosok, akiknek nincs meg minden modul ({basicTraining?.items.length ?? 0})
          </h2>
        </div>
        <p className="text-xs text-muted-foreground font-mono mb-3">
          Modul = „Alapkiképzés" kategóriájú képesítés-típus ({basicTraining?.modules.length ?? 0} db); mind megvan → automatikusan jár az „Alapkiképzés" képesítés. Határidő: jogviszony kezdete + {basicTraining?.deadlineDays ?? 365} nap; {basicTraining?.warnDays ?? 30} nappal előtte jelezzük. Lejárt határidő = leszerelendő.
        </p>
        {!basicTraining || basicTraining.modules.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground font-mono py-4"><AlertTriangle className="w-4 h-4 text-orange-500" /><span className="text-sm">Nincs „Alapkiképzés" kategóriájú képesítés-típus — a Műveletek → Képzettségek alatt hozd létre a modulokat.</span></div>
        ) : basicTraining.items.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground font-mono py-4"><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-sm">Minden tartalékosnak megvan az alapkiképzése</span></div>
        ) : (
          <div className="space-y-4">
            {([
              ["Lejárt — leszerelendő", basicTraining.items.filter((i) => i.isOverdue), "text-destructive"],
              [`Hamarosan lejár (${basicTraining.warnDays} napon belül)`, basicTraining.items.filter((i) => i.isDueSoon), "text-amber-400"],
              ["Folyamatban", basicTraining.items.filter((i) => !i.isOverdue && !i.isDueSoon), "text-muted-foreground"],
            ] as const).map(([title, items, cls]) => items.length === 0 ? null : (
              <div key={title}>
                <p className={`text-xs font-mono uppercase tracking-military mb-2 ${cls}`}>{title} ({items.length})</p>
                <div className="overflow-x-auto">
                  <table className="w-full mil-table">
                    <thead><tr><th>Név</th><th>Rendfokozat</th><th>Alegység</th><th>Jogviszony kezdete</th><th>Határidő</th><th>Hátra</th><th>Modulok</th><th>Hiányzik</th></tr></thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.personnelId} className="cursor-pointer hover:bg-secondary transition-colors" onClick={() => navigate("/personnel", { state: { openPersonnelId: item.personnelId } })}>
                          <td className="font-medium">{item.name}</td>
                          <td className="font-mono text-xs text-primary">{item.rank}</td>
                          <td className="text-muted-foreground text-xs">{item.unit}</td>
                          <td className="font-mono text-xs">{item.joinDate || "—"}</td>
                          <td className="font-mono text-xs">{item.deadline ?? "—"}</td>
                          <td><span className={deadlineClass(item)}>{deadlineLabel(item)}</span></td>
                          <td className="font-mono text-xs">{item.completedModules} / {item.totalModules}</td>
                          <td className="text-muted-foreground text-xs">{item.missingModules.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Évi 7 nap szolgálat */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <Clock className="w-4 h-4 text-orange-500" />
          <h2 className="text-sm font-bold uppercase tracking-military">
            Évi szolgálati minimum {serviceMinimum?.year ?? ""} — tartalékosok {serviceMinimum?.minDays ?? 7} nap alatt ({serviceMinimum?.items.length ?? 0})
          </h2>
        </div>
        <p className="text-xs text-muted-foreground font-mono mb-1">
          Jogszabályi kötelezettség: minden tartalékos évente legalább {serviceMinimum?.minDays ?? 7} napot szolgál. Szolgált nap = gyakorlat/kiképzés napjai „Megjelent" jelenléttel; a lemondott művelet nem számít.
        </p>
        {serviceMinimum && <YearDeadlineLine d={serviceMinimum} />}
        {!serviceMinimum || serviceMinimum.items.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground font-mono py-4"><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-sm">Minden tartalékos teljesítette az éves szolgálati minimumot</span></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full mil-table">
              <thead><tr><th>Név</th><th>Rendfokozat</th><th>Alegység</th><th>Szolgált</th><th>Hiányzik</th></tr></thead>
              <tbody>
                {serviceMinimum.items.map((item) => (
                  <tr key={item.personnelId} className="cursor-pointer hover:bg-secondary transition-colors" onClick={() => navigate("/personnel", { state: { openPersonnelId: item.personnelId } })}>
                    <td className="font-medium">{item.name}</td>
                    <td className="font-mono text-xs text-primary">{item.rank}</td>
                    <td className="text-muted-foreground text-xs">{item.unit}</td>
                    <td className="font-mono text-xs">{item.servedDays} nap</td>
                    <td><span className={item.servedDays === 0 ? "badge-cancelled" : "badge-ongoing"}>{item.missingDays} nap</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Szabadság-minimum */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <Clock className="w-4 h-4 text-orange-500" />
          <h2 className="text-sm font-bold uppercase tracking-military">
            Szabadság-minimum {leaveMinimum?.year ?? ""} — aktívak {leaveMinimum?.minDays ?? 10} munkanap alatt ({leaveMinimum?.items.length ?? 0})
          </h2>
        </div>
        <p className="text-xs text-muted-foreground font-mono mb-1">
          Jóváhagyott „Szabadság" típusú távollétek, hétfő–péntek napok (ünnepnap nélkül), az idei évből.
        </p>
        {leaveMinimum && <YearDeadlineLine d={leaveMinimum} />}
        {!leaveMinimum || leaveMinimum.items.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground font-mono py-4"><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-sm">Minden aktív katona elérte a minimumot</span></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full mil-table">
              <thead><tr><th>Név</th><th>Rendfokozat</th><th>Alegység</th><th>Kivett</th><th>Hiányzik</th></tr></thead>
              <tbody>
                {leaveMinimum.items.map((item) => (
                  <tr key={item.personnelId} className="cursor-pointer hover:bg-secondary transition-colors" onClick={() => navigate("/personnel", { state: { openPersonnelId: item.personnelId } })}>
                    <td className="font-medium">{item.name}</td>
                    <td className="font-mono text-xs text-primary">{item.rank}</td>
                    <td className="text-muted-foreground text-xs">{item.unit}</td>
                    <td className="font-mono text-xs">{item.takenDays} nap</td>
                    <td><span className={item.takenDays === 0 ? "badge-cancelled" : "badge-ongoing"}>{item.missingDays} nap</span></td>
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
