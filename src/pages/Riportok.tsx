import { useState, useEffect, useCallback, useMemo } from "react";
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import DatePickerInput from "@/components/DatePickerInput";
import Modal from "@/components/Modal";
import { exercises, events, reports, getErrorMessage, type ReportPreviewResponse } from "@/lib/store";
import type { Exercise, AppEvent } from "@/lib/types";
import { FileText } from "lucide-react";
import { toast } from "sonner";

type ReportTemplate = "overview" | "operations" | "events" | "focus";
type ReportFocusType = "exercise" | "event";

type ExportOption = {
  id: string;
  label: string;
  subtitle: string;
};

const REPORT_TEMPLATES: Array<{ value: ReportTemplate; label: string; description: string }> = [
  { value: "overview", label: "Összesített riport", description: "Műveletek és események egy PDF-ben." },
  { value: "operations", label: "Műveleti naptár", description: "Csak a műveletek az adott időszakra." },
  { value: "events", label: "Eseménynaptár", description: "Kizárólag események exportja." },
  { value: "focus", label: "Konkrét elem riport", description: "Egy kiválasztott gyakorlat, kiképzés, esemény vagy szolgálat részletes exportja." },
];

const FOCUS_TYPES: Array<{ value: ReportFocusType; label: string }> = [
  { value: "exercise", label: "Gyakorlat" },
  { value: "event", label: "Esemény" },
];

export default function Riportok() {
  const [exs, setExs] = useState<Exercise[]>([]);
  const [eventsData, setEventsData] = useState<AppEvent[]>([]);
  const [pdfFrom, setPdfFrom] = useState("");
  const [pdfTo, setPdfTo] = useState("");
  const [reportTemplate, setReportTemplate] = useState<ReportTemplate>("overview");
  const [reportFocusType, setReportFocusType] = useState<ReportFocusType>("exercise");
  const [reportFocusId, setReportFocusId] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<ReportPreviewResponse | null>(null);


  const refresh = useCallback(async () => {
    try {
      const [nextExs, nextEvents] = await Promise.all([
        exercises.getAll(),
        events.getAll(),
      ]);
      setExs(nextExs);
      setEventsData(nextEvents);
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
  }, [eventsData, exs, reportFocusType]);

  useEffect(() => {
    if (reportTemplate !== "focus") return;
    if (focusOptions.length === 0) {
      setReportFocusId("");
      return;
    }
    setReportFocusId((current) => (focusOptions.some((option) => option.id === current) ? current : focusOptions[0].id));
  }, [focusOptions, reportTemplate]);

  const selectedTemplate = REPORT_TEMPLATES.find((item) => item.value === reportTemplate) ?? REPORT_TEMPLATES[0];

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military text-foreground">Riportok</h1>
        <p className="text-xs text-muted-foreground font-mono mt-1">Időszakra szűrt műveleti / esemény riport PDF, Excel és Word formátumban</p>
      </div>

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
                <p className="text-sm font-mono">Műveletek: {previewData.summary.exercises}</p>
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




















