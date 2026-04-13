import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Calendar, MapPin, Search, Users, Crosshair, GraduationCap, Plus } from "lucide-react";
import { exercises, trainings, getErrorMessage } from "@/lib/store";
import type { Exercise, Training } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import Modal from "@/components/Modal";
import DatePickerInput from "@/components/DatePickerInput";
import { toast } from "sonner";

type OperationStatus = "Tervezett" | "Folyamatban" | "Befejezett" | "Törölve";
type OperationSource = "exercise" | "training";

type OperationItem = {
  id: string;
  source: OperationSource;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  organizer?: string;
  qualificationId?: string;
  maxPersonnel: number;
  description: string;
  status: OperationStatus;
  assigned: Array<Record<string, unknown>>;
};

type CreateForm = {
  source: OperationSource;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  organizer: string;
  maxPersonnel: number;
  description: string;
  status: OperationStatus;
};

const STATUSES: OperationStatus[] = ["Tervezett", "Folyamatban", "Befejezett", "Törölve"];
const TRAINING_STATUSES: Array<Exclude<OperationStatus, "Törölve">> = ["Tervezett", "Folyamatban", "Befejezett"];

const emptyCreateForm: CreateForm = {
  source: "exercise",
  name: "",
  type: "",
  startDate: "",
  endDate: "",
  location: "",
  organizer: "",
  maxPersonnel: 20,
  description: "",
  status: "Tervezett",
};

const statusClass: Record<OperationStatus, string> = {
  Tervezett: "badge-planned",
  Folyamatban: "badge-ongoing",
  Befejezett: "badge-completed",
  Törölve: "badge-cancelled",
};

const typeMap: Record<string, string> = {
  "combat-training": "Harctéri kiképzés",
  marksmanship: "Lövészeti gyakorlat",
  "field-exercise": "Szabadtéri gyakorlat",
  tactical: "Taktikai",
  fitness: "Kondicionálás",
  basic: "Alapképzés",
};

function normalizeExercise(item: Exercise): OperationItem {
  return {
    id: item.id,
    source: "exercise",
    name: item.name,
    type: item.type,
    startDate: item.startDate,
    endDate: item.endDate,
    location: item.location,
    maxPersonnel: item.maxPersonnel,
    description: item.description,
    status: item.status as OperationStatus,
    assigned: item.assigned as Array<Record<string, unknown>>,
  };
}

function normalizeTraining(item: Training): OperationItem {
  return {
    id: item.id,
    source: "training",
    name: item.name,
    type: item.type,
    startDate: item.startDate,
    endDate: item.endDate,
    location: item.location,
    organizer: item.organizer,
    qualificationId: item.qualificationId,
    maxPersonnel: item.maxPersonnel,
    description: item.description,
    status: item.status as OperationStatus,
    assigned: item.assigned as Array<Record<string, unknown>>,
  };
}

export default function Operations() {
  const location = useLocation();
  const { canEdit } = useAuth();

  const [data, setData] = useState<OperationItem[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"Összes" | OperationStatus>("Összes");
  const [sourceFilter, setSourceFilter] = useState<"all" | OperationSource>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detail, setDetail] = useState<OperationItem | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [editingItem, setEditingItem] = useState<OperationItem | null>(null);
  const [form, setForm] = useState<CreateForm>(emptyCreateForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const detailRef = useRef<OperationItem | null>(null);
  detailRef.current = detail;

  const formatDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("hu-HU");
  };

  const refresh = useCallback(async () => {
    try {
      const [exerciseData, trainingData] = await Promise.all([exercises.getAll(), trainings.getAll()]);
      const merged = [...exerciseData.map(normalizeExercise), ...trainingData.map(normalizeTraining)]
        .sort((a, b) => a.startDate.localeCompare(b.startDate));
      setData(merged);
      if (detailRef.current) {
        const updated = merged.find((item) => item.id === detailRef.current!.id && item.source === detailRef.current!.source) ?? null;
        setDetail(updated);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => {
      void refresh();
    }, 30000);
    return () => clearInterval(iv);
  }, [refresh]);

  useEffect(() => {
    const sourceParam = new URLSearchParams(location.search).get("source");
    if (sourceParam === "exercise" || sourceParam === "training") setSourceFilter(sourceParam);
    else setSourceFilter("all");
  }, [location.search]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return data.filter((item) => {
      if (normalized && ![item.name, item.type, item.location, item.description].some((v) => v?.toLowerCase().includes(normalized))) return false;
      if (filter !== "Összes" && item.status !== filter) return false;
      if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
      if (dateFrom && item.endDate.slice(0, 10) < dateFrom) return false;
      if (dateTo && item.startDate.slice(0, 10) > dateTo) return false;
      return true;
    });
  }, [data, search, filter, sourceFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const statusCounts = useMemo<Record<OperationStatus, number>>(() => {
    const counts: Record<OperationStatus, number> = { Tervezett: 0, Folyamatban: 0, Befejezett: 0, Törölve: 0 };
    data.forEach((item) => { if (counts[item.status] !== undefined) counts[item.status] += 1; });
    return counts;
  }, [data]);

  const sourceCounts = useMemo(
    () => ({
      exercise: data.filter((item) => item.source === "exercise").length,
      training: data.filter((item) => item.source === "training").length,
    }),
    [data],
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const validateForm = () => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Kötelező";
    if (!form.startDate) next.startDate = "Kötelező";
    if (!form.endDate) next.endDate = "Kötelező";
    if (form.startDate && form.endDate && form.endDate < form.startDate) next.endDate = "Vége >= Kezdete";
    if (form.source === "training" && !form.organizer.trim()) next.organizer = "Kötelező";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const openEditModal = (item: OperationItem) => {
    setEditingItem(item);
    setForm({
      source: item.source,
      name: item.name,
      type: item.type,
      startDate: item.startDate,
      endDate: item.endDate,
      location: item.location,
      organizer: item.organizer ?? "",
      maxPersonnel: item.maxPersonnel,
      description: item.description,
      status: item.status,
    });
    setErrors({});
    setDetail(null);
    setCreating(true);
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      const common = {
        name: form.name.trim(),
        type: form.type.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        location: form.location.trim(),
        maxPersonnel: form.maxPersonnel,
        description: form.description.trim(),
      };

      const resolvedTrainingStatus = form.status === "Törölve" ? "Tervezett" : form.status;

      if (editingItem) {
        if (form.source === "exercise") {
          await exercises.update({
            id: editingItem.id,
            ...common,
            status: form.status,
            assigned: editingItem.assigned as Exercise["assigned"],
          });
        } else {
          await trainings.update({
            id: editingItem.id,
            ...common,
            organizer: form.organizer.trim(),
            qualificationId: editingItem.qualificationId ?? "",
            status: resolvedTrainingStatus,
            assigned: editingItem.assigned as Training["assigned"],
          });
        }
      } else if (form.source === "exercise") {
        await exercises.add({
          ...common,
          status: form.status,
          assigned: [],
        });
      } else {
        await trainings.add({
          ...common,
          organizer: form.organizer.trim(),
          status: resolvedTrainingStatus,
          assigned: [],
        });
      }

      toast.success(editingItem ? "Művelet frissítve" : "Művelet létrehozva");
      setCreating(false);
      setEditingItem(null);
      setForm(emptyCreateForm);
      setErrors({});
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const availableStatuses = form.source === "exercise" ? STATUSES : TRAINING_STATUSES;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Műveletek</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">Gyakorlatok + kiképzések egy nézetben</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => {
                setEditingItem(null);
                setForm(emptyCreateForm);
                setErrors({});
                setCreating(true);
              }}
              className="btn-mil-primary flex items-center gap-2 text-xs"
            >
              <Plus className="w-4 h-4" />
              Új hozzáadás
            </button>
          )}
          <div className="hidden md:flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span className="mono-chip">GYAKORLAT: {sourceCounts.exercise}</span>
            <span className="mono-chip">KIKÉPZÉS: {sourceCounts.training}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stats-card"><div className="stats-number">{statusCounts.Tervezett}</div><div className="stats-label">Tervezett</div></div>
        <div className="stats-card"><div className="stats-number">{statusCounts.Folyamatban}</div><div className="stats-label">Folyamatban</div></div>
        <div className="stats-card"><div className="stats-number">{statusCounts.Befejezett}</div><div className="stats-label">Befejezett</div></div>
        <div className="stats-card"><div className="stats-number">{statusCounts.Törölve}</div><div className="stats-label">Törölve</div></div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap items-end">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Keresés név/típus/helyszín..."
            className="w-full bg-input border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
            style={{ borderRadius: "2px" }}
          />
        </div>
        {(["all", "exercise", "training"] as const).map((src) => (
          <button key={src} onClick={() => { setSourceFilter(src); setPage(1); }} className={`px-3 py-1.5 text-xs uppercase tracking-military font-mono ${sourceFilter === src ? "btn-mil-primary" : "btn-mil-secondary"}`}>
            {src === "all" ? "Összes forrás" : src === "exercise" ? "Gyakorlat" : "Kiképzés"}
          </button>
        ))}
        {["Összes", ...STATUSES].map((s) => (
          <button key={s} onClick={() => { setFilter(s as "Összes" | OperationStatus); setPage(1); }} className={`px-3 py-1.5 text-xs uppercase tracking-military font-mono ${filter === s ? "btn-mil-primary" : "btn-mil-secondary"}`}>
            {s}
          </button>
        ))}
        <div>
          <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Intervallum eleje</label>
          <DatePickerInput value={dateFrom} onChange={setDateFrom} className="px-2 py-1.5 text-xs" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Intervallum vége</label>
          <DatePickerInput value={dateTo} onChange={setDateTo} className="px-2 py-1.5 text-xs" />
        </div>
        <button onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }} className="btn-mil-secondary text-xs">Szűrő törlése</button>
      </div>

      {loading ? (
        <div className="text-muted-foreground font-mono py-8">Betöltés...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pagedItems.length === 0 && <div className="col-span-3 text-center text-muted-foreground font-mono py-12">Nincs találat a jelenlegi szűrőkre</div>}
            {pagedItems.map((item) => (
              <div key={`${item.source}-${item.id}`} className="bg-card border border-border border-l-2 border-l-primary p-4 cursor-pointer hover:bg-secondary transition-colors" style={{ borderRadius: "2px" }} onClick={() => setDetail(item)}>
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold font-rajdhani text-lg">{item.name}</h3>
                  <span className={`px-2 py-0.5 text-xs uppercase tracking-military font-mono ${statusClass[item.status]}`} style={{ borderRadius: "2px" }}>
                    {item.status === "Folyamatban" && <span className="pulse-dot" />}
                    {item.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  {item.source === "exercise" ? <Crosshair className="w-3.5 h-3.5 text-primary" /> : <GraduationCap className="w-3.5 h-3.5 text-primary" />}
                  <span className="mono-chip text-xs">{typeMap[item.type] || item.type}</span>
                  <span className="mono-chip text-[10px]">{item.source === "exercise" ? "GYAKORLAT" : "KIKÉPZÉS"}</span>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /><span className="font-mono text-primary text-xs">{formatDate(item.startDate)} → {formatDate(item.endDate)}</span></div>
                  <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" />{item.location || "Nincs megadva"}</div>
                  <div className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /><span className="font-mono text-primary">{item.assigned.length}</span>/{item.maxPersonnel} fő</div>
                </div>
                <div className="mt-3 w-full bg-border h-1.5" style={{ borderRadius: "2px" }}>
                  <div className="bg-primary h-1.5 transition-all" style={{ width: `${item.maxPersonnel > 0 ? Math.min(100, (item.assigned.length / item.maxPersonnel) * 100) : 0}%`, borderRadius: "2px" }} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-4 text-xs font-mono text-muted-foreground">
            <div>
              Találat: {filtered.length}
              {filtered.length > 0 && <span className="ml-2">({(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, filtered.length)})</span>}
            </div>
            <div className="flex items-center gap-2">
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="bg-input border border-border px-2 py-1" style={{ borderRadius: "2px" }}>
                {[10, 20].map((size) => <option key={size} value={size}>{size}/oldal</option>)}
              </select>
              <button onClick={() => setPage((prev) => Math.max(1, prev - 1))} className="btn-mil-secondary text-xs" disabled={safePage <= 1}>Előző</button>
              <span>{safePage} / {totalPages}</span>
              <button onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} className="btn-mil-secondary text-xs" disabled={safePage >= totalPages}>Következő</button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground font-mono mt-4">Frissítve: {new Date().toLocaleTimeString("hu-HU")}</p>
        </>
      )}

      <Modal
        open={creating}
        onClose={() => {
          setCreating(false);
          setEditingItem(null);
        }}
        title={editingItem ? "Művelet szerkesztése" : "Új művelet hozzáadása"}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Típus *</label>
            <select
              value={form.source}
              onChange={(e) => {
                const nextSource = e.target.value as OperationSource;
                setForm((prev) => ({
                  ...prev,
                  source: nextSource,
                  status: nextSource === "training" && prev.status === "Törölve" ? "Tervezett" : prev.status,
                }));
              }}
              className="w-full bg-input border border-border px-3 py-2 text-sm"
              style={{ borderRadius: "2px" }}
            >
              <option value="exercise">Gyakorlat</option>
              <option value="training">Kiképzés</option>
            </select>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Megnevezés *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }} />
            {errors.name && <p className="text-destructive text-xs mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Alkategória</label>
            <input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Kezdete *</label>
              <DatePickerInput value={form.startDate} onChange={(value) => setForm({ ...form, startDate: value })} />
              {errors.startDate && <p className="text-destructive text-xs mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Vége *</label>
              <DatePickerInput value={form.endDate} onChange={(value) => setForm({ ...form, endDate: value })} />
              {errors.endDate && <p className="text-destructive text-xs mt-1">{errors.endDate}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Helyszín</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }} />
          </div>

          {form.source === "training" && (
            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Szervező *</label>
              <input value={form.organizer} onChange={(e) => setForm({ ...form, organizer: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }} />
              {errors.organizer && <p className="text-destructive text-xs mt-1">{errors.organizer}</p>}
            </div>
          )}

          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Max létszám</label>
            <input type="number" value={form.maxPersonnel} onChange={(e) => setForm({ ...form, maxPersonnel: Number(e.target.value) || 0 })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }} />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Státusz</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as OperationStatus })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }}>
              {availableStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Leírás</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm resize-none h-20" style={{ borderRadius: "2px" }} />
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <button
              onClick={() => {
                setCreating(false);
                setEditingItem(null);
              }}
              className="btn-mil-secondary text-xs"
            >
              Mégsem
            </button>
            <button onClick={() => { void handleSave(); }} className="btn-mil-primary text-xs">
              {editingItem ? "Mentés" : "Létrehozás"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name || ""} wide>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Típus</span><p className="mono-chip mt-1">{typeMap[detail.type] || detail.type}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Forrás</span><p className="mono-chip mt-1">{detail.source === "exercise" ? "Gyakorlat" : "Kiképzés"}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Státusz</span><p className={`inline-flex items-center px-2 py-0.5 text-xs uppercase tracking-military font-mono mt-1 ${statusClass[detail.status]}`} style={{ borderRadius: "2px" }}>{detail.status}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Időszak</span><p className="font-mono text-primary text-sm mt-1">{formatDate(detail.startDate)} → {formatDate(detail.endDate)}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Helyszín</span><p className="mt-1">{detail.location || "Nincs megadva"}</p></div>
            </div>
            {detail.description && <p className="text-sm text-muted-foreground">{detail.description}</p>}

            <div className="flex items-center gap-3 pt-2">
              <div className="h-px flex-1 bg-primary/30" />
              <span className="text-xs uppercase tracking-military text-primary font-mono">Résztvevők ({detail.assigned.length}/{detail.maxPersonnel})</span>
              <div className="h-px flex-1 bg-primary/30" />
            </div>

            <table className="w-full mil-table">
              <thead><tr><th>Név</th><th>Szerep / Jelenlét</th></tr></thead>
              <tbody>
                {detail.assigned.length === 0 && <tr><td colSpan={2} className="text-muted-foreground text-xs py-4">Nincs hozzárendelt személy</td></tr>}
                {detail.assigned.map((a, idx) => {
                  const name = String(a.personName ?? "Ismeretlen");
                  const roleOrAttendance = String(a.role ?? a.attendance ?? "-");
                  return (
                    <tr key={`${name}-${idx}`}>
                      <td>{name}</td>
                      <td className="text-brass font-mono text-xs">{roleOrAttendance}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="flex justify-end gap-2 pt-2">
              {canEdit && (
                <button onClick={() => openEditModal(detail)} className="btn-mil-secondary text-xs">
                  Szerkesztés / Hozzárendelés
                </button>
              )}
              <button onClick={() => setDetail(null)} className="btn-mil-secondary text-xs">Bezárás</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
