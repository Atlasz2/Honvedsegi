import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DatePickerInput from "@/components/DatePickerInput";
import { exercises, duties, trainings, events, reports, getErrorMessage } from "@/lib/store";
import { Users, Crosshair, FileText, BookOpen, Calendar } from "lucide-react";
import { toast } from "sonner";

export default function Dashboard() {
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  const [exs, setExs] = useState<any[]>([]);
  const [eventsData, setEventsData] = useState<any[]>([]);
  const [dutiesData, setDutiesData] = useState<any[]>([]);
  const [trainingsData, setTrainingsData] = useState<any[]>([]);
  const [showOnDutyDetails, setShowOnDutyDetails] = useState(false);
  const [showOngoingExercises, setShowOngoingExercises] = useState(false);
  const [showOngoingTrainings, setShowOngoingTrainings] = useState(false);
  const [showOngoingEvents, setShowOngoingEvents] = useState(false);
  const [pdfFrom, setPdfFrom] = useState("");
  const [pdfTo, setPdfTo] = useState("");

  const openDuty = (dutyId: string) => navigate("/duties", { state: { openDutyId: dutyId } });
  const openOperation = (itemId: string, source: "exercise" | "training") => navigate("/operations", { state: { openOperationId: itemId, openOperationSource: source } });
  const openEvent = (eventId: string) => navigate("/events", { state: { openEventId: eventId } });

  const refresh = useCallback(async () => {
    try {
      const [nextExs, nextEvents, nextDuties, nextTrainings] = await Promise.all([
        exercises.getAll(),
        events.getAll(),
        duties.getAll(),
        trainings.getAll(),
      ]);
      setExs(nextExs);
      setEventsData(nextEvents);
      setDutiesData(nextDuties);
      setTrainingsData(nextTrainings);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => {
      setTick((t) => t + 1);
      void refresh();
    }, 30000);
    return () => clearInterval(iv);
  }, [refresh]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const onDutyToday = dutiesData
    .filter((d) => d.status !== "Lemondva" && d.startDate.slice(0, 10) <= todayIso && d.endDate.slice(0, 10) >= todayIso)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const onDutyTodayCount = new Set(onDutyToday.map((d) => d.personId)).size;

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

  const handleDownloadPdf = async () => {
    try {
      await reports.downloadOperationsPdf({ dateFrom: pdfFrom || undefined, dateTo: pdfTo || undefined });
      toast.success("PDF riport letöltve");
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
                <p className="text-sm"><span className="text-primary font-mono">{item.type}</span> — {item.personName}</p>
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

      <div className="bg-card border border-border mb-6 p-4" style={{ borderRadius: "2px" }}>
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
          <button onClick={() => { setPdfFrom(""); setPdfTo(""); }} className="btn-mil-secondary text-xs">Törlés</button>
          <button onClick={() => { void handleDownloadPdf(); }} className="btn-mil-primary text-xs">PDF letöltés</button>
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
    </div>
  );
}
