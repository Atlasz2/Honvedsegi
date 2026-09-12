import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, CheckCircle2, RefreshCw, FileWarning, UserX, GraduationCap, Palmtree, Shield, FileSignature, CalendarClock } from "lucide-react";
import {
  qualificationAlerts, alerts as alertsStore, documents as docStore, settings as settingsStore,
  type UnexcusedAlert, type ReadinessGap, type ExpiringDocument,
  type LeaveMinimumResult, type BasicTrainingResult, type BasicTrainingItem, type ServiceMinimumResult, type YearDeadline,
  type OrderDeadlinesResult, type OrderDeadlineItem, type CustomRuleAlertsResult, type CustomRuleAlertItem,
} from "@/lib/store";
import type { QualificationAlert, QualificationStat } from "@/lib/types";
import { getErrorMessage } from "@/lib/store";
import { toast } from "sonner";
import AlertSection, { type AlertColumn } from "@/components/AlertSection";

const DAYS_OPTIONS = [30, 60, 90] as const;

const DISABLED_LABEL: Record<string, string> = {
  order_deadline_warn_days: "parancs-határidők",
  basic_training_warn_days: "alapkiképzés-határidő",
  leave_minimum_days: "szabadság-minimum",
  service_minimum_days: "szolgálati minimum",
  qualification_warn_days: "képesítés-lejárat",
};
type DaysAhead = (typeof DAYS_OPTIONS)[number];

const badge = (cls: string, text: string) => (
  <span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${cls}`} style={{ borderRadius: "2px" }}>{text}</span>
);

function expiryBadge(isExpired: boolean, days: number) {
  if (isExpired) return badge("badge-cancelled", `Lejárt ${Math.abs(days)} napja`);
  return badge(days <= 14 ? "badge-ongoing" : "badge-planned", `${days} nap`);
}

function deadlineBadge(item: BasicTrainingItem) {
  if (item.daysLeft === null) return badge("badge-planned", "nincs jogviszony-kezdet");
  if (item.isOverdue) return badge("badge-cancelled", `Lejárt ${Math.abs(item.daysLeft)} napja`);
  return badge(item.isDueSoon ? "badge-ongoing" : "badge-planned", `${item.daysLeft} nap`);
}

function deadlineText(item: BasicTrainingItem): string {
  if (item.daysLeft === null) return "nincs jogviszony-kezdet";
  return item.isOverdue ? `lejárt ${Math.abs(item.daysLeft)} napja` : `${item.daysLeft} nap`;
}

/** Az éves kötelezettség határidő-sora: dec. 31., és egy hónappal előtte figyelmeztet. */
function YearDeadlineLine({ d }: { d: YearDeadline }) {
  const cls = d.isOverdue ? "text-destructive" : d.isDueSoon ? "text-amber-400" : "text-muted-foreground";
  const text = d.isOverdue
    ? `Határidő lejárt: ${d.deadline} (${Math.abs(d.daysLeft)} napja)`
    : d.isDueSoon
      ? `Határidő ${d.deadline} — ${d.daysLeft} nap van hátra!`
      : `Határidő ${d.deadline} — ${d.daysLeft} nap van hátra`;
  return <p className={cls}>{text}</p>;
}

// Közös oszlopok: név / rendfokozat / alegység — minden személyes lista így kezdődik.
function personColumns<T extends { name: string; rank: string; unit: string }>(): AlertColumn<T>[] {
  return [
    { header: "Név", render: (r) => <span className="font-medium">{r.name}</span>, value: (r) => r.name },
    { header: "Rendfokozat", render: (r) => <span className="font-mono text-xs text-primary">{r.rank}</span>, value: (r) => r.rank },
    { header: "Alegység", render: (r) => <span className="text-muted-foreground text-xs">{r.unit}</span>, value: (r) => r.unit },
  ];
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
  const [orderDeadlines, setOrderDeadlines] = useState<OrderDeadlinesResult | null>(null);
  const [customAlerts, setCustomAlerts] = useState<CustomRuleAlertsResult | null>(null);
  // Kikapcsolt figyelmeztetés-fajták (Beállítások → Riasztási küszöbök): a szekció el sem jelenik.
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [daysAhead, setDaysAhead] = useState<DaysAhead>(60);
  const [showExpired, setShowExpired] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [alertData, statData, unexcusedData, gapData, docData, leaveData, basicData, serviceData, orderData, customData, settingsData] = await Promise.all([
        qualificationAlerts.getAlerts(daysAhead),
        qualificationAlerts.getStats(),
        alertsStore.unexcused(30),
        alertsStore.readinessGaps(),
        docStore.expiring(daysAhead),
        alertsStore.leaveMinimum(),
        alertsStore.basicTraining(),
        alertsStore.serviceMinimum(),
        alertsStore.orderDeadlines(),
        alertsStore.custom(),
        settingsStore.alerts(),
      ]);
      setOrderDeadlines(orderData);
      setCustomAlerts(customData);
      setDisabled(new Set(settingsData.items.filter((i) => i.toggleable && !i.enabled).map((i) => i.key)));
      setAlerts(alertData);
      setStats(statData);
      setUnexcused(unexcusedData);
      setGaps(gapData);
      setExpiringDocs(docData);
      setLeaveMinimum(leaveData);
      setBasicTraining(basicData);
      setServiceMinimum(serviceData);
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

  const openPerson = (personnelId: string) => navigate("/personnel", { state: { openPersonnelId: personnelId } });
  const visibleQuals = (showExpired ? alerts : alerts.filter((a) => !a.isExpired)).slice().sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  const expiredCount = alerts.filter((a) => a.isExpired).length;
  const urgentCount = alerts.filter((a) => !a.isExpired && a.daysUntilExpiry <= 14).length;
  const soonCount = alerts.filter((a) => !a.isExpired && a.daysUntilExpiry > 14).length;
  const basicItems = basicTraining?.items ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Figyelmeztetések</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">Lejáratok, határidők, hiányok — szekciónként kinyitható, szűrhető, exportálható</p>
        </div>
        <button onClick={() => { setLoading(true); void refresh(); }} className="btn-mil-secondary flex items-center gap-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5" />
          Frissítés
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stats-card border-l-2 border-l-destructive">
          <div className="stats-number text-destructive">{expiredCount}</div>
          <div className="stats-label">Lejárt képesítés</div>
        </div>
        <div className="stats-card border-l-2 border-l-orange-500">
          <div className="stats-number text-orange-500">{urgentCount}</div>
          <div className="stats-label">Sürgős (&lt;14 nap)</div>
        </div>
        <div className="stats-card border-l-2 border-l-primary">
          <div className="stats-number">{soonCount}</div>
          <div className="stats-label">Hamarosan lejár</div>
        </div>
        <div className="stats-card border-l-2 border-l-destructive">
          <div className="stats-number text-destructive">{basicItems.filter((i) => i.isOverdue).length}</div>
          <div className="stats-label">Alapkiképzés lejárt — leszerelendő</div>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap items-center">
        <span className="text-xs uppercase tracking-military text-muted-foreground font-mono">Időablak (képesítés, okmány):</span>
        {DAYS_OPTIONS.map((d) => (
          <button key={d} onClick={() => setDaysAhead(d)} className={`px-3 py-1.5 text-xs uppercase tracking-military font-mono ${daysAhead === d ? "btn-mil-primary" : "btn-mil-secondary"}`}>
            {d} nap
          </button>
        ))}
        <label className="ml-4 flex items-center gap-2 text-xs font-mono text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={showExpired} onChange={(e) => setShowExpired(e.target.checked)} className="accent-primary" />
          Lejártak megjelenítése
        </label>
      </div>

      {disabled.size > 0 && (
        <p className="text-[11px] font-mono text-muted-foreground mb-4">
          Kikapcsolt figyelmeztetés: {[...disabled].map((k) => DISABLED_LABEL[k] ?? k).join(", ")} — a Beállítások → Riasztási küszöbök alatt kapcsolható vissza.
        </p>
      )}

      {customAlerts && customAlerts.rules.length > 0 && (
        <AlertSection<CustomRuleAlertItem>
          title={`Egyéni szabályok — ${customAlerts.rules.map((r) => r.label).join(", ")}`}
          tone="warning"
          icon={<CalendarClock className="w-4 h-4 text-amber-400" />}
          loading={loading}
          rows={customAlerts.items}
          rowKey={(i) => `${i.ruleId}-${i.personnelId}`}
          onRowClick={(i) => openPerson(i.personnelId)}
          emptyText="Egyik egyéni szabály sem jelez"
          description={<p>Az admin által felvett dátum-szabályok (Beállítások → Riasztási küszöbök → Egyéni szabályok). Lejárat = a mező dátuma + érvényesség.</p>}
          groupOf={(i) => i.ruleLabel}
          columns={[
            ...personColumns<CustomRuleAlertItem>(),
            { header: "Alapdátum", render: (i) => <span className="font-mono text-xs">{i.baseDate}</span>, value: (i) => i.baseDate },
            { header: "Lejárat", render: (i) => <span className="font-mono text-xs">{i.deadline}</span>, value: (i) => i.deadline },
            { header: "Hátra", render: (i) => expiryBadge(i.isOverdue, i.daysLeft), value: (i) => (i.isOverdue ? `lejárt ${Math.abs(i.daysLeft)} napja` : `${i.daysLeft} nap`) },
          ]}
        />
      )}

      {!disabled.has("basic_training_warn_days") && <AlertSection<BasicTrainingItem>
        title="Alapkiképzés-határidő — tartalékosok, akiknek nincs meg minden modul"
        tone="destructive"
        icon={<GraduationCap className="w-4 h-4 text-destructive" />}
        loading={loading}
        rows={basicItems}
        rowKey={(i) => i.personnelId}
        onRowClick={(i) => openPerson(i.personnelId)}
        emptyText={basicTraining && basicTraining.modules.length === 0 ? "Nincs „Alapkiképzés” kategóriájú képesítés-típus — a Műveletek → Képzettségek alatt hozd létre a modulokat." : "Minden tartalékosnak megvan az alapkiképzése"}
        description={<p>Modul = „Alapkiképzés” kategóriájú képesítés-típus ({basicTraining?.modules.length ?? 0} db); mind megvan → automatikusan jár az „Alapkiképzés” képesítés. Határidő: jogviszony kezdete + {basicTraining?.deadlineDays ?? 365} nap; {basicTraining?.warnDays ?? 30} nappal előtte jelezzük. Lejárt határidő = leszerelendő.</p>}
        groupOf={(i) => (i.isOverdue ? "Lejárt — leszerelendő" : i.isDueSoon ? `Hamarosan lejár (${basicTraining?.warnDays ?? 30} napon belül)` : "Folyamatban")}
        columns={[
          ...personColumns<BasicTrainingItem>(),
          { header: "Jogviszony kezdete", render: (i) => <span className="font-mono text-xs">{i.joinDate || "—"}</span>, value: (i) => i.joinDate },
          { header: "Határidő", render: (i) => <span className="font-mono text-xs">{i.deadline ?? "—"}</span>, value: (i) => i.deadline ?? "" },
          { header: "Hátra", render: deadlineBadge, value: deadlineText },
          { header: "Modulok", render: (i) => <span className="font-mono text-xs">{i.completedModules} / {i.totalModules}</span>, value: (i) => `${i.completedModules}/${i.totalModules}` },
          { header: "Hiányzik", render: (i) => <span className="text-muted-foreground text-xs">{i.missingModules.join(", ")}</span>, value: (i) => i.missingModules.join(", ") },
        ]}
      />}

      {!disabled.has("order_deadline_warn_days") && <AlertSection<OrderDeadlineItem>
        title={`Parancs-határidők — lejárt vagy ${orderDeadlines?.warnDays ?? 30} napon belül`}
        tone="warning"
        icon={<FileSignature className="w-4 h-4 text-amber-400" />}
        loading={loading}
        rows={orderDeadlines?.items ?? []}
        rowKey={(i) => `${i.orderId}-${i.kind}-${i.label}`}
        onRowClick={(i) => navigate("/parancsok", { state: { openOrderId: i.orderId } })}
        emptyText="Nincs lejárt vagy közelgő parancs-határidő"
        description={<p>Nyitott parancsok: a parancs egészének határideje és az el nem készült fejezeteké, felelős részleggel. Kattintásra a parancs megnyílik.</p>}
        groupOf={(i) => (i.responsible ? `${i.responsible} részleg` : "A parancs egésze")}
        columns={[
          { header: "Parancs", render: (i) => <span className="font-medium">{i.number ? `${i.number} — ` : ""}{i.subject}</span>, value: (i) => `${i.number} ${i.subject}`.trim() },
          { header: "Mi", render: (i) => i.label, value: (i) => i.label },
          { header: "Felelős", render: (i) => <span className="font-mono text-xs text-primary">{i.responsible || "—"}</span>, value: (i) => i.responsible },
          { header: "Dolgozik rajta", render: (i) => <span className="text-muted-foreground text-xs">{i.assignee || "—"}</span>, value: (i) => i.assignee },
          { header: "Határidő", render: (i) => <span className="font-mono text-xs">{i.dueDate}</span>, value: (i) => i.dueDate },
          { header: "Hátra", render: (i) => expiryBadge(i.isOverdue, i.daysLeft), value: (i) => (i.isOverdue ? `lejárt ${Math.abs(i.daysLeft)} napja` : `${i.daysLeft} nap`) },
        ]}
      />}

      {!disabled.has("qualification_warn_days") && <AlertSection<QualificationAlert>
        title={`Lejáró és lejárt képesítések — ${daysAhead} napon belül`}
        tone="warning"
        icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
        loading={loading}
        rows={visibleQuals}
        rowKey={(a) => `${a.personnelId}-${a.qualificationId}`}
        onRowClick={(a) => openPerson(a.personnelId)}
        emptyText="Nincs lejáró képesítés a kiválasztott időablakban"
        columns={[
          { header: "Név", render: (a) => <span className="font-medium">{a.personnelName}</span>, value: (a) => a.personnelName },
          { header: "Rendfokozat", render: (a) => <span className="font-mono text-xs text-primary">{a.rank}</span>, value: (a) => a.rank },
          { header: "Alegység", render: (a) => <span className="text-muted-foreground text-xs">{a.unit}</span>, value: (a) => a.unit },
          { header: "Képesítés", render: (a) => a.qualTypeName, value: (a) => a.qualTypeName },
          { header: "Kategória", render: (a) => <span className="mono-chip text-[10px]">{a.qualTypeCategory}</span>, value: (a) => a.qualTypeCategory },
          { header: "Lejárat", render: (a) => <span className="font-mono text-xs">{a.expiryDate}</span>, value: (a) => a.expiryDate },
          { header: "Állapot", render: (a) => expiryBadge(a.isExpired, a.daysUntilExpiry), value: (a) => (a.isExpired ? `lejárt ${Math.abs(a.daysUntilExpiry)} napja` : `${a.daysUntilExpiry} nap`) },
        ]}
      />}

      <AlertSection<ExpiringDocument>
        title={`Lejáró okmányok / alkalmasság — ${daysAhead} napon belül`}
        tone="warning"
        icon={<FileWarning className="w-4 h-4 text-amber-400" />}
        loading={loading}
        rows={expiringDocs}
        rowKey={(d) => d.documentId}
        onRowClick={(d) => openPerson(d.personnelId)}
        emptyText="Nincs lejáró okmány a kiválasztott időablakban"
        columns={[
          ...personColumns<ExpiringDocument>(),
          { header: "Kategória", render: (d) => <span className="mono-chip text-[10px]">{d.category}</span>, value: (d) => d.category },
          { header: "Megnevezés", render: (d) => d.documentName, value: (d) => d.documentName },
          { header: "Lejárat", render: (d) => <span className="font-mono text-xs">{d.expiryDate ?? "—"}</span>, value: (d) => d.expiryDate ?? "" },
          { header: "Állapot", render: (d) => expiryBadge(d.isExpired, d.daysUntilExpiry), value: (d) => (d.isExpired ? `lejárt ${Math.abs(d.daysUntilExpiry)} napja` : `${d.daysUntilExpiry} nap`) },
        ]}
      />

      {!disabled.has("service_minimum_days") && <AlertSection<NonNullable<ServiceMinimumResult>["items"][number]>
        title={`Évi szolgálati minimum ${serviceMinimum?.year ?? ""} — tartalékosok ${serviceMinimum?.minDays ?? 7} nap alatt`}
        tone="warning"
        icon={<Shield className="w-4 h-4 text-amber-400" />}
        loading={loading}
        rows={serviceMinimum?.items ?? []}
        rowKey={(i) => i.personnelId}
        onRowClick={(i) => openPerson(i.personnelId)}
        emptyText="Minden tartalékos teljesítette az éves szolgálati minimumot"
        description={<>
          <p>Jogszabályi kötelezettség: minden tartalékos évente legalább {serviceMinimum?.minDays ?? 7} napot szolgál. Szolgált nap = a művelet (gyakorlat, kiképzés, szolgálat) napjai „Megjelent” jelenléttel; a lemondott művelet nem számít.</p>
          {serviceMinimum && <YearDeadlineLine d={serviceMinimum} />}
        </>}
        columns={[
          ...personColumns(),
          { header: "Szolgált", render: (i) => <span className="font-mono text-xs">{i.servedDays} nap</span>, value: (i) => `${i.servedDays}` },
          { header: "Hiányzik", render: (i) => badge(i.servedDays === 0 ? "badge-cancelled" : "badge-ongoing", `${i.missingDays} nap`), value: (i) => `${i.missingDays}` },
        ]}
      />}

      {!disabled.has("leave_minimum_days") && <AlertSection<NonNullable<LeaveMinimumResult>["items"][number]>
        title={`Szabadság-minimum ${leaveMinimum?.year ?? ""} — aktívak ${leaveMinimum?.minDays ?? 10} munkanap alatt`}
        tone="primary"
        icon={<Palmtree className="w-4 h-4 text-primary" />}
        loading={loading}
        rows={leaveMinimum?.items ?? []}
        rowKey={(i) => i.personnelId}
        onRowClick={(i) => openPerson(i.personnelId)}
        emptyText="Minden aktív katona elérte a minimumot"
        description={<>
          <p>Jóváhagyott „Szabadság” típusú távollétek, hétfő–péntek napok (ünnepnap nélkül), az idei évből.</p>
          {leaveMinimum && <YearDeadlineLine d={leaveMinimum} />}
        </>}
        columns={[
          ...personColumns(),
          { header: "Kivett", render: (i) => <span className="font-mono text-xs">{i.takenDays} nap</span>, value: (i) => `${i.takenDays}` },
          { header: "Hiányzik", render: (i) => badge(i.takenDays === 0 ? "badge-cancelled" : "badge-ongoing", `${i.missingDays} nap`), value: (i) => `${i.missingDays}` },
        ]}
      />}

      <AlertSection<UnexcusedAlert>
        title="Igazolatlan távollétek — utolsó 30 nap"
        tone="destructive"
        icon={<UserX className="w-4 h-4 text-destructive" />}
        loading={loading}
        rows={unexcused}
        rowKey={(a) => `${a.personnelId}-${a.date}`}
        onRowClick={(a) => openPerson(a.personnelId)}
        emptyText="Nincs igazolatlan távollét"
        columns={[
          ...personColumns<UnexcusedAlert>(),
          { header: "Dátum", render: (a) => <span className="font-mono text-xs">{a.date}</span>, value: (a) => a.date },
          { header: "Megjegyzés", render: (a) => <span className="text-muted-foreground text-xs">{a.note}</span>, value: (a) => a.note },
        ]}
      />

      <AlertSection<ReadinessGap>
        title="Készenléti rés — aktívak érvényes képesítés nélkül"
        tone="primary"
        icon={<Clock className="w-4 h-4 text-primary" />}
        loading={loading}
        rows={gaps}
        rowKey={(g) => g.personnelId}
        onRowClick={(g) => openPerson(g.personnelId)}
        emptyText="Minden aktív katonának van érvényes képesítése"
        columns={personColumns<ReadinessGap>()}
      />

      {/* Képesítési statisztikák — nem riasztás, áttekintő */}
      <div className="mt-8">
        <div className="flex items-center gap-3 mb-3">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-military">Képesítési statisztikák</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full mil-table">
            <thead>
              <tr>
                <th>Képesítés neve</th><th>Kategória</th><th>Érvényesség</th><th>Összes állomány</th><th>Rendelkezők (összes)</th><th>Érvényes</th><th>Lefedettség</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => {
                const pct = s.totalPersonnel > 0 ? Math.round((s.holdersValid / s.totalPersonnel) * 100) : 0;
                return (
                  <tr key={s.id}>
                    <td className="font-medium">{s.name}</td>
                    <td><span className="mono-chip text-[10px]">{s.category}</span></td>
                    <td className="font-mono text-xs">{s.validityDays === null ? <span className="text-muted-foreground">Nem jár le</span> : `${s.validityDays} nap`}</td>
                    <td className="font-mono text-center">{s.totalPersonnel}</td>
                    <td className="font-mono text-center">{s.holdersAll}</td>
                    <td className="font-mono text-center text-primary">{s.holdersValid}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-border h-2" style={{ borderRadius: "1px" }}>
                          <div className={`h-2 transition-all ${pct >= 80 ? "bg-green-600" : pct >= 50 ? "bg-yellow-500" : "bg-destructive"}`} style={{ width: `${pct}%`, borderRadius: "1px" }} />
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
