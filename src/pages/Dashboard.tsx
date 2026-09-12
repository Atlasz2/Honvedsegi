import { useState, useEffect, useCallback, useMemo } from "react";
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import { useNavigate } from "react-router-dom";
import DatePickerInput from "@/components/DatePickerInput";
import Modal from "@/components/Modal";
import { exercises, trainings, events, reports, qualificationAlerts, getErrorMessage, type ReportPreviewResponse } from "@/lib/store";
import type { Exercise, Training, AppEvent, QualificationAlert } from "@/lib/types";
import { isDutyType } from "@/lib/dutyTypes";
import { Users, Crosshair, FileText, BookOpen, Calendar, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type ReportTemplate = "overview" | "operations" | "events" | "focus";
type ReportFocusType = "exercise" | "training" | "event";

type ExportOption = {
  id: string;
  label: string;
  subtitle: string;
};

const REPORT_TEMPLATES: Array<{ value: ReportTemplate; label: string; description: string }> = [
  { value: "overview", label: "Összesített riport", description: "Gyakorlatok, kiképzések, események és szolgálatok egy PDF-ben." },
  { value: "operations", label: "Műveleti naptár", description: "Csak gyakorlatok és kiképzések az adott időszakra." },
  { value: "events", label: "Eseménynaptár", description: "Kizárólag események exportja." },
  { value: "focus", label: "Konkrét elem riport", description: "Egy kiválasztott gyakorlat, kiképzés, esemény vagy szolgálat részletes exportja." },
];

const FOCUS_TYPES: Array<{ value: ReportFocusType; label: string }> = [
  { value: "exercise", label: "Gyakorlat" },
  { value: "training", label: "Kiképzés" },
  { value: "event", label: "Esemény" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [exs, setExs] = useState<Exercise[]>([]);
  const [eventsData, setEventsData] = useState<AppEvent[]>([]);
  const [trainingsData, setTrainingsData] = useState<Training[]>([]);
  const [alertsData, setAlertsData] = useState<QualificationAlert[]>([]);
  const [showOnDutyDetails, setShowOnDutyDetails] = useState(false);
  const [showOngoingExercises, setShowOngoingExercises] = useState(false);
  const [showOngoingTrainings, setShowOngoingTrainings] = useState(false);
  const [showOngoingEvents, setShowOngoingEvents] = useState(false);
  const [pdfFrom, setPdfFrom] = useState("");
  const [pdfTo, setPdfTo] = useState("");
  const [reportTemplate, setReportTemplate] = useState<ReportTemplate>("overview");
  const [reportFocusType, setReportFocusType] = useState<ReportFocusType>("exercise");
  const [reportFocusId, setReportFocusId] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<ReportPreviewResponse | null>(null);

  const openDuty = (id: string) => navigate("/operations?source=exercise", { state: { openOperationId: id, openOperationSource: "exercise" } });
  const openOperation = (itemId: string, source: "exercise" | "training") => navigate("/operations", { state: { openOperationId: itemId, openOperationSource: source } });
  const openEvent = (eventId: string) => navigate("/events", { state: { openEventId: eventId } });

  const refresh = useCallback(async () => {
    try {
      const [nextExs, nextEvents, nextTrainings, nextAlerts] = await Promise.all([
        exercises.getAll(),
        events.getAll(),
        trainings.getAll(),
        qualificationAlerts.getAlerts(30),
      ]);
      setExs(nextExs);
      setEventsData(nextEvents);
      setTrainingsData(nextTrainings);
      setAlertsData(nextAlerts);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useAutoRefresh(refresh);

  const focusOptions = useMemo<ExportOption[]>(() => {
    if (reportFocusType === "exercise") {
      return [...exs]
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name))
        .map((item) => ({
          id: item.id,
          label: item.name,
          subtitle: `${item.startDate} | ${item.location || "Nincs helyszín"}`,
        }));
    }
    if (reportFocusType === "training") {
      return [...trainingsData]
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name))
        .map((item) => ({
          id: item.id,
          label: item.name,
          subtitle: `${item.startDate} | ${item.location || "Nincs helyszín"}`,
        }));
    }
    if (reportFocusType === "event") {
      return [...eventsData]
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name))
        .map((item) => ({
          id: item.id,
          label: item.name,
          subtitle: `${item.startDate} | ${item.location || "Nincs helyszín"}`,
        }));
    }
    return [];
  }, [eventsData, exs, reportFocusType, trainingsData]);

  useEffect(() => {
    if (reportTemplate !== "focus") return;
    if (focusOptions.length === 0) {
      setReportFocusId("");
      return;
    }
    setReportFocusId((current) => (focusOptions.some((option) => option.id === current) ? current : focusOptions[0].id));
  }, [focusOptions, reportTemplate]);

  const selectedTemplate = REPORT_TEMPLATES.find((item) => item.value === reportTemplate) ?? REPORT_TEMPLATES[0];

  const todayIso = new Date().toISOString().slice(0, 10);
  // Szolgálat = szolgálat-típusú gyakorlat; a beosztottak adják a mai szolgálati létszámot.
  const onDutyToday = exs
    .filter((e) => isDutyType(e.type) && e.status !== "Lemondva" && e.startDate.slice(0, 10) <= todayIso && e.endDate.slice(0, 10) >= todayIso)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const onDutyTodayCount = new Set(onDutyToday.flatMap((e) => e.assigned.map((a) => a.personId))).size;

  const ongoingExercises = exs.filter((e) => e.status === "Folyamatban").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const ongoingTrainingsList = trainingsData.filter((t) => t.status === "Folyamatban").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const ongoingEventsList = eventsData.filter((e) => e.status === "Folyamatban").sort((a, b) => a.startDate.localeCompare(b.startDate));



  const upcomingExs = exs
    .filter((e) => e.status === "Tervezett" || e.status === "Folyamatban")
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 3);

  const upcomingTrainings = trainingsData
    .filter((t) => t.status === "Tervezett" || t.status === "Folyamatban")
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 3);

  const upcomingEvents = eventsData
    .filter((e) => e.status === "Tervezett" || e.status === "Folyamatban")
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 3);

  const handlePreview = async () => {
    try {
      if (reportTemplate === "focus" && !reportFocusId) {
        toast.error("Válassz konkrét rekordot a fókusz riporthoz");
        return;
      }
      setPreviewLoading(true);
      const result = await reports.previewOperationsReport({
        dateFrom: pdfFrom || undefined,
        dateTo: pdfTo || undefined,
        template: reportTemplate,
        focusType: reportTemplate === "focus" ? reportFocusType : undefined,
        focusId: reportTemplate === "focus" ? reportFocusId : undefined,
      });
      setPreviewData(result);
      setPreviewOpen(true);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      if (reportTemplate === "focus" && !reportFocusId) {
        toast.error("Válassz konkrét rekordot a fókusz riporthoz");
        return;
      }
      await reports.downloadOperationsPdf({
        dateFrom: pdfFrom || undefined,
        dateTo: pdfTo || undefined,
        template: reportTemplate,
        focusType: reportTemplate === "focus" ? reportFocusType : undefined,
        focusId: reportTemplate === "focus" ? reportFocusId : undefined,
      });
      toast.success("PDF riport letöltve");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDownloadExcel = async () => {
    try {
      if (reportTemplate === "focus" && !reportFocusId) {
        toast.error("Válassz konkrét rekordot a fókusz riporthoz");
        return;
      }
      await reports.downloadOperationsExcel({
        dateFrom: pdfFrom || undefined,
        dateTo: pdfTo || undefined,
        template: reportTemplate,
        focusType: reportTemplate === "focus" ? reportFocusType : undefined,
        focusId: reportTemplate === "focus" ? reportFocusId : undefined,
      });
      toast.success("Excel riport letöltve");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDownloadWord = async () => {
    try {
      if (reportTemplate === "focus" && !reportFocusId) {
        toast.error("Válassz konkrét rekordot a fókusz riporthoz");
        return;
      }
      await reports.downloadOperationsWord({
        dateFrom: pdfFrom || undefined,
        dateTo: pdfTo || undefined,
        template: reportTemplate,
        focusType: reportTemplate === "focus" ? reportFocusType : undefined,
        focusId: reportTemplate === "focus" ? reportFocusId : undefined,
      });
      toast.success("Word riport letöltve");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };
  return (
    <div>
      <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military mb-6 text-foreground">Áttekintés</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <button onClick={() => setShowOnDutyDetails((prev) => !prev)} className="stats-card text-left hover:bg-secondary transition-colors">
          <div className="flex items-center gap-2 mb-2"><Users className="w-4 h-4 text-primary" /></div>
          <div className="stats-number">{onDutyTodayCount}</div>
          <div className="stats-label">Ma szolgálatban</div>
        </button>
        <button onClick={() => setShowOngoingExercises((prev) => !prev)} className="stats-card text-left hover:bg-secondary transition-colors">
          <div className="flex items-center gap-2 mb-2"><Crosshair className="w-4 h-4 text-primary" /></div>
          <div className="stats-number">{ongoingExercises.length}</div>
          <div className="stats-label">Folyamatban lévő gyakorlatok</div>
        </button>
        <button onClick={() => setShowOngoingTrainings((prev) => !prev)} className="stats-card text-left hover:bg-secondary transition-colors">
          <div className="flex items-center gap-2 mb-2"><BookOpen className="w-4 h-4 text-primary" /></div>
          <div className="stats-number">{ongoingTrainingsList.length}</div>
          <div className="stats-label">Folyamatban lévő kiképzések</div>
        </button>
        <button onClick={() => setShowOngoingEvents((prev) => !prev)} className="stats-card text-left hover:bg-secondary transition-colors">
          <div className="flex items-center gap-2 mb-2"><Calendar className="w-4 h-4 text-primary" /></div>
          <div className="stats-number">{ongoingEventsList.length}</div>
          <div className="stats-label">Folyamatban lévő események</div>
        </button>
      </div>



      {showOnDutyDetails && (
        <div className="bg-card border border-border mb-6 p-4" style={{ borderRadius: "2px" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm uppercase tracking-military font-mono text-primary">Mai szolgálatok részletezése</h2>
            <button onClick={() => setShowOnDutyDetails(false)} className="btn-mil-secondary text-xs">Bezárás</button>
          </div>
          <div className="space-y-2">
            {onDutyToday.length === 0 && <p className="text-xs text-muted-foreground font-mono">Ma nincs aktív szolgálat.</p>}
            {onDutyToday.map((item) => (
              <button key={item.id} onClick={() => openDuty(item.id)} className="w-full text-left border border-border px-3 py-2 hover:bg-secondary transition-colors" style={{ borderRadius: "2px" }}>
                <p className="text-sm"><span className="text-primary font-mono">{item.type}</span> — {item.assigned.map((a) => a.personName).join(", ") || "nincs beosztott"}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {showOngoingExercises && (
        <div className="bg-card border border-border mb-6 p-4" style={{ borderRadius: "2px" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm uppercase tracking-military font-mono text-primary">Folyamatban lévő gyakorlatok</h2>
            <button onClick={() => setShowOngoingExercises(false)} className="btn-mil-secondary text-xs">Bezárás</button>
          </div>
          <div className="space-y-2">
            {ongoingExercises.length === 0 && <p className="text-xs text-muted-foreground font-mono">Nincs aktív gyakorlat.</p>}
            {ongoingExercises.map((item) => (
              <button key={item.id} onClick={() => openOperation(item.id, "exercise")} className="w-full text-left border border-border px-3 py-2 hover:bg-secondary transition-colors" style={{ borderRadius: "2px" }}>
                <p className="text-sm font-semibold text-primary">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.startDate} → {item.endDate} | {item.location}</p>
                <p className="text-xs"><span className="text-brass">Résztvevők:</span> {item.assigned.length}/{item.maxPersonnel}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {showOngoingTrainings && (
        <div className="bg-card border border-border mb-6 p-4" style={{ borderRadius: "2px" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm uppercase tracking-military font-mono text-primary">Folyamatban lévő kiképzések</h2>
            <button onClick={() => setShowOngoingTrainings(false)} className="btn-mil-secondary text-xs">Bezárás</button>
          </div>
          <div className="space-y-2">
            {ongoingTrainingsList.length === 0 && <p className="text-xs text-muted-foreground font-mono">Nincs aktív kiképzés.</p>}
            {ongoingTrainingsList.map((item) => (
              <button key={item.id} onClick={() => openOperation(item.id, "training")} className="w-full text-left border border-border px-3 py-2 hover:bg-secondary transition-colors" style={{ borderRadius: "2px" }}>
                <p className="text-sm font-semibold text-primary">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.startDate} → {item.endDate} | {item.location}</p>
                <p className="text-xs"><span className="text-brass">Résztvevők:</span> {item.assigned.length}/{item.maxPersonnel}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {showOngoingEvents && (
        <div className="bg-card border border-border mb-6 p-4" style={{ borderRadius: "2px" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm uppercase tracking-military font-mono text-primary">Folyamatban lévő események</h2>
            <button onClick={() => setShowOngoingEvents(false)} className="btn-mil-secondary text-xs">Bezárás</button>
          </div>
          <div className="space-y-2">
            {ongoingEventsList.length === 0 && <p className="text-xs text-muted-foreground font-mono">Nincs folyamatban lévő esemény.</p>}
            {ongoingEventsList.map((item) => (
              <button key={item.id} onClick={() => openEvent(item.id)} className="w-full text-left border border-border px-3 py-2 hover:bg-secondary transition-colors" style={{ borderRadius: "2px" }}>
                <p className="text-sm font-semibold text-primary">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.startDate} → {item.endDate} | {item.location}</p>
                <p className="text-xs"><span className="text-brass">Szervező:</span> {item.organizer || "-"}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {alertsData.length > 0 && (
        <div className="bg-card border border-destructive/50 mb-6 p-4" style={{ borderRadius: "2px" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <h2 className="text-sm uppercase tracking-military font-mono text-destructive">
                Képesítési figyelmeztetések ({alertsData.length})
              </h2>
            </div>
            <button onClick={() => navigate("/figyelmeztetesek")} className="btn-mil-secondary text-xs">
              Összes megtekintése
            </button>
          </div>
          <div className="space-y-1">
            {alertsData
              .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
              .slice(0, 5)
              .map((a) => (
                <div
                  key={`${a.personnelId}-${a.qualificationId}`}
                  className="flex items-center justify-between border border-border/50 px-3 py-2 text-xs cursor-pointer hover:bg-secondary transition-colors"
                  style={{ borderRadius: "2px" }}
                  onClick={() => navigate("/figyelmeztetesek")}
                >
                  <span className="font-medium">{a.personnelName}</span>
                  <span className="text-muted-foreground mx-2">{a.qualTypeName}</span>
                  <span className={`font-mono px-2 py-0.5 ${a.isExpired ? "badge-cancelled" : a.daysUntilExpiry <= 14 ? "badge-ongoing" : "badge-planned"}`} style={{ borderRadius: "2px" }}>
                    {a.isExpired ? `Lejárt ${Math.abs(a.daysUntilExpiry)} napja` : `${a.daysUntilExpiry} nap`}
                  </span>
                </div>
              ))}
            {alertsData.length > 5 && (
              <p className="text-xs text-muted-foreground font-mono pt-1">
                + {alertsData.length - 5} további figyelmeztetés
              </p>
            )}
          </div>
        </div>
      )}

      <div className="bg-card border border-border mb-6 p-4" style={{ borderRadius: "2px" }}>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-primary" />
          <h2 className="text-sm uppercase tracking-military font-mono text-primary">Export riportok</h2>
        </div>
        <p className="text-xs text-muted-foreground font-mono mb-4">{selectedTemplate.description}</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5 items-end">
          <div>
            <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Riportminta</label>
            <select value={reportTemplate} onChange={(e) => setReportTemplate(e.target.value as ReportTemplate)} className="w-full bg-input border border-border px-3 py-2 text-xs" style={{ borderRadius: "2px" }}>
              {REPORT_TEMPLATES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Intervallum eleje</label>
            <DatePickerInput value={pdfFrom} onChange={setPdfFrom} className="text-xs" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Intervallum vége</label>
            <DatePickerInput value={pdfTo} onChange={setPdfTo} className="text-xs" />
          </div>
          {reportTemplate === "focus" && (
            <div>
              <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Fókusz típus</label>
              <select value={reportFocusType} onChange={(e) => setReportFocusType(e.target.value as ReportFocusType)} className="w-full bg-input border border-border px-3 py-2 text-xs" style={{ borderRadius: "2px" }}>
                {FOCUS_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
          )}
          {reportTemplate === "focus" && (
            <div>
              <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Konkrét rekord</label>
              <select value={reportFocusId} onChange={(e) => setReportFocusId(e.target.value)} className="w-full bg-input border border-border px-3 py-2 text-xs" style={{ borderRadius: "2px" }}>
                {focusOptions.length === 0 && <option value="">Nincs választható elem</option>}
                {focusOptions.map((item) => <option key={item.id} value={item.id}>{item.label} | {item.subtitle}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <button onClick={() => { setPdfFrom(""); setPdfTo(""); }} className="btn-mil-secondary text-xs">Dátum törlése</button>
          <button onClick={() => { void handlePreview(); }} className="btn-mil-secondary text-xs" disabled={previewLoading}>{previewLoading ? "Előnézet betöltése..." : "Előnézet"}</button>
          <button onClick={() => { void handleDownloadPdf(); }} className="btn-mil-primary text-xs">PDF letöltés</button>
          <button onClick={() => { void handleDownloadExcel(); }} className="btn-mil-primary text-xs">Excel letöltés</button>
          <button onClick={() => { void handleDownloadWord(); }} className="btn-mil-primary text-xs">Word letöltés</button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="h-px flex-1 bg-primary/30" />
        <span className="text-xs uppercase tracking-military text-primary font-mono">Közelgő gyakorlatok</span>
        <div className="h-px flex-1 bg-primary/30" />
      </div>

      <div className="bg-card border border-border mb-8 overflow-hidden" style={{ borderRadius: "2px" }}>
        <table className="w-full mil-table">
          <thead><tr>
            <th>Megnevezés</th><th>Dátum</th><th>Helyszín</th><th>Létszám</th><th>Státusz</th>
          </tr></thead>
          <tbody>
            {upcomingExs.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground font-mono py-8">Nincs adat</td></tr>}
            {upcomingExs.map((e) => (
              <tr key={e.id} className="cursor-pointer hover:bg-secondary/40" onClick={() => openOperation(e.id, "exercise")}>
                <td className="font-semibold">{e.name}</td>
                <td className="font-mono text-primary text-xs">{e.startDate} → {e.endDate}</td>
                <td>{e.location}</td>
                <td className="font-mono text-primary">{e.assigned.length}/{e.maxPersonnel}</td>
                <td>
                  <span className={`inline-flex items-center px-2 py-0.5 text-xs uppercase tracking-military font-mono ${
                    e.status === "Folyamatban" ? "badge-ongoing" : "badge-planned"
                  }`} style={{ borderRadius: "2px" }}>
                    {e.status === "Folyamatban" && <span className="pulse-dot" />}
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
        <span className="text-xs uppercase tracking-military text-primary font-mono">Közelgő kiképzések</span>
        <div className="h-px flex-1 bg-primary/30" />
      </div>

      <div className="bg-card border border-border mb-8 overflow-hidden" style={{ borderRadius: "2px" }}>
        <table className="w-full mil-table">
          <thead><tr>
            <th>Megnevezés</th><th>Dátum</th><th>Helyszín</th><th>Létszám</th><th>Státusz</th>
          </tr></thead>
          <tbody>
            {upcomingTrainings.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground font-mono py-8">Nincs adat</td></tr>}
            {upcomingTrainings.map((t) => (
              <tr key={t.id} className="cursor-pointer hover:bg-secondary/40" onClick={() => openOperation(t.id, "training")}>
                <td className="font-semibold">{t.name}</td>
                <td className="font-mono text-primary text-xs">{t.startDate} → {t.endDate}</td>
                <td>{t.location}</td>
                <td className="font-mono text-primary">{t.assigned.length}/{t.maxPersonnel}</td>
                <td>
                  <span className={`inline-flex items-center px-2 py-0.5 text-xs uppercase tracking-military font-mono ${
                    t.status === "Folyamatban" ? "badge-ongoing" : "badge-planned"
                  }`} style={{ borderRadius: "2px" }}>
                    {t.status === "Folyamatban" && <span className="pulse-dot" />}
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="h-px flex-1 bg-primary/30" />
        <span className="text-xs uppercase tracking-military text-primary font-mono">Közelgő események</span>
        <div className="h-px flex-1 bg-primary/30" />
      </div>

      <div className="bg-card border border-border overflow-hidden" style={{ borderRadius: "2px" }}>
        <table className="w-full mil-table">
          <thead><tr>
            <th>Megnevezés</th><th>Dátum</th><th>Helyszín</th><th>Szervező</th><th>Státusz</th>
          </tr></thead>
          <tbody>
            {upcomingEvents.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground font-mono py-8">Nincs adat</td></tr>}
            {upcomingEvents.map((e) => (
              <tr key={e.id} className="cursor-pointer hover:bg-secondary/40" onClick={() => openEvent(e.id)}>
                <td className="font-semibold">{e.name}</td>
                <td className="font-mono text-primary text-xs">{e.startDate} → {e.endDate}</td>
                <td>{e.location}</td>
                <td>{e.organizer || "-"}</td>
                <td>
                  <span className={`inline-flex items-center px-2 py-0.5 text-xs uppercase tracking-military font-mono ${
                    e.status === "Folyamatban" ? "badge-ongoing" : "badge-planned"
                  }`} style={{ borderRadius: "2px" }}>
                    {e.status === "Folyamatban" && <span className="pulse-dot" />}
                    {e.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground font-mono mt-4">Frissítve: {new Date().toLocaleTimeString("hu-HU")}</p>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Export előnézet" wide>
        {!previewData && <p className="text-sm text-muted-foreground font-mono">Nincs megjeleníthető előnézet.</p>}
        {previewData && (
          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="border border-border p-3" style={{ borderRadius: "2px" }}>
                <p className="text-[10px] uppercase tracking-military text-muted-foreground mb-1">Riport</p>
                <p className="text-sm font-semibold text-primary">{previewData.title}</p>
              </div>
              <div className="border border-border p-3" style={{ borderRadius: "2px" }}>
                <p className="text-[10px] uppercase tracking-military text-muted-foreground mb-1">Intervallum</p>
                <p className="text-sm font-mono">{previewData.interval.dateFrom} → {previewData.interval.dateTo}</p>
              </div>
              <div className="border border-border p-3" style={{ borderRadius: "2px" }}>
                <p className="text-[10px] uppercase tracking-military text-muted-foreground mb-1">Összesítés</p>
                <p className="text-sm font-mono">Gy: {previewData.summary.exercises} | Ki: {previewData.summary.trainings}</p>
                <p className="text-sm font-mono">Es: {previewData.summary.events}</p>
              </div>
              <div className="border border-border p-3" style={{ borderRadius: "2px" }}>
                <p className="text-[10px] uppercase tracking-military text-muted-foreground mb-1">Fókusz</p>
                <p className="text-sm font-mono">{previewData.focusType ? `${previewData.focusType} / ${previewData.focusId}` : "Nincs"}</p>
              </div>
            </div>

            {previewData.focus && (
              <div className="border border-border p-4" style={{ borderRadius: "2px" }}>
                <h3 className="text-sm uppercase tracking-military font-mono text-primary mb-3">Részletes elem</h3>
                <p className="text-base font-semibold mb-3">{previewData.focus.headline}</p>
                <div className="grid gap-2 md:grid-cols-2 mb-4">
                  {previewData.focus.details.map((detail) => (
                    <div key={`${detail.label}-${detail.value}`} className="border border-border/70 px-3 py-2" style={{ borderRadius: "2px" }}>
                      <p className="text-[10px] uppercase tracking-military text-muted-foreground">{detail.label}</p>
                      <p className="text-sm font-mono">{detail.value}</p>
                    </div>
                  ))}
                </div>
                {previewData.focus.description && (
                  <div className="mb-4">
                    <h4 className="text-xs uppercase tracking-military font-mono text-primary mb-2">Leírás</h4>
                    <div className="border border-border/70 p-3 whitespace-pre-wrap text-sm" style={{ borderRadius: "2px" }}>{previewData.focus.description}</div>
                  </div>
                )}
                <div>
                  <h4 className="text-xs uppercase tracking-military font-mono text-primary mb-2">Résztvevők</h4>
                  {previewData.focus.participants.length === 0 && <p className="text-sm text-muted-foreground font-mono">Nincs résztvevő adat.</p>}
                  {previewData.focus.participants.length > 0 && (
                    <div className="max-h-72 overflow-y-auto border border-border/70" style={{ borderRadius: "2px" }}>
                      <table className="w-full mil-table">
                        <thead><tr><th>Személy</th><th>Részlet</th></tr></thead>
                        <tbody>
                          {previewData.focus.participants.map((participant) => (
                            <tr key={`${participant.personName}-${participant.detail}`}>
                              <td>{participant.personName}</td>
                              <td>{participant.detail}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {previewData.sections.map((section) => (
              <div key={section.key} className="border border-border p-4" style={{ borderRadius: "2px" }}>
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <h3 className="text-sm uppercase tracking-military font-mono text-primary">{section.title}</h3>
                  <p className="text-xs text-muted-foreground font-mono">{section.count} rekord{section.truncated ? " (a PDF-ben a limit miatt rövidítve)" : ""}</p>
                </div>
                {section.items.length === 0 && <p className="text-sm text-muted-foreground font-mono">Nincs találat a megadott feltételekre.</p>}
                {section.items.length > 0 && (
                  <div className="max-h-80 overflow-y-auto border border-border/70" style={{ borderRadius: "2px" }}>
                    <table className="w-full mil-table">
                      <thead>
                        <tr>
                          <th>Megnevezés</th>
                          <th>Időszak</th>
                          <th>Helyszín</th>
                          <th>Státusz</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.items.map((item) => (
                          <tr key={item.id}>
                            <td>{item.name}</td>
                            <td className="font-mono text-xs">{item.startDate} → {item.endDate}</td>
                            <td>{item.location}</td>
                            <td>{item.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}




















