import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import { useLocation } from "react-router-dom";
import { Calendar, MapPin, Search, Users, Crosshair, GraduationCap, Plus, Layers } from "lucide-react";
import { exercises, trainings, series as seriesStore, personnel as pStore, checkLocationConflicts, getErrorMessage, logAction, prerequisites, qualificationTypes, type LocationConflict, type SeriesMatrix } from "@/lib/store";
import type { Exercise, ExerciseAssignment, Training, TrainingAssignment, PersonLite, QualificationType, Series } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import DatePickerInput from "@/components/DatePickerInput";
import DateTimePickerInput from "@/components/DateTimePickerInput";
import OperationDetailTabs from "@/components/operations/OperationDetailTabs";
import CampaignPanel from "@/components/operations/CampaignPanel";
import { shortRank, rankWeight } from "@/lib/rank";
import { DUTY_TYPES } from "@/lib/dutyTypes";
import { toast } from "sonner";

// A művelet státusza megegyezik a gyakorlatéval — egy igazságforrás, nincs másolat.
type OperationStatus = Exercise["status"];
type OperationSource = "exercise" | "training";

type OperationItemBase = {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  maxPersonnel: number;
  description: string;
  status: OperationStatus;
  seriesId: string;
  level: string;
};

/**
 * A `source` diszkriminátor dönti el, milyen beosztás tartozik az elemhez:
 * gyakorlatnál van `role`, kiképzésnél nincs. Így a fordító őrzi, hogy a
 * szerep-mezőt csak gyakorlaton olvassuk ki.
 */
type OperationItem =
  | (OperationItemBase & { source: "exercise"; assigned: ExerciseAssignment[] })
  | (OperationItemBase & { source: "training"; assigned: TrainingAssignment[] });

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
  qualificationId: string;       // mit ad teljesítéskor
  prerequisiteIds: string[];     // belépési követelmények
  seriesId: string;              // szülő felkészítés-sorozat (pl. 7×20)
  level: string;                 // Alap/Haladó/Emelt
};

type EditForm = {
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  organizer: string;
  maxPersonnel: number;
  description: string;
  status: OperationStatus;
  // Utólag is állítható: mit ad, milyen szint, mi a belépési követelmény.
  qualificationId: string;
  level: string;
  prerequisiteIds: string[];
};

// Az időbeli állapotot (közelgő / folyamatban / lezajlott) a rendszer a dátumokból
// számolja; a felhasználó csak lemondani tud. A tárolt értékek a régi nevek.
const STATUSES: OperationStatus[] = ["Tervezett", "Folyamatban", "Befejezett", "Lemondva"];
const STATUS_LABEL: Record<OperationStatus, string> = {
  Tervezett: "Közelgő",
  Folyamatban: "Folyamatban",
  Befejezett: "Lezajlott",
  Lemondva: "Lemondva",
};
const ATTENDANCE = ["Jelentkezett", "Tervezett", "Megjelent", "Hiányzott", "Beteg", "Visszamondta"] as const;

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
  qualificationId: "",
  prerequisiteIds: [],
  seriesId: "",
  level: "",
};

const statusClass: Record<OperationStatus, string> = {
  Tervezett: "badge-planned",
  Folyamatban: "badge-ongoing",
  Befejezett: "badge-completed",
  Lemondva: "badge-cancelled",
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
    status: item.status,
    seriesId: item.seriesId ?? "",
    level: item.level ?? "",
    assigned: item.assigned,
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
    maxPersonnel: item.maxPersonnel,
    description: item.description,
    status: item.status,
    seriesId: item.seriesId ?? "",
    level: item.level ?? "",
    assigned: item.assigned,
  };
}

export default function Operations() {
  const location = useLocation();
  const { canEdit, user } = useAuth();

  const [data, setData] = useState<OperationItem[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [seriesMatrix, setSeriesMatrix] = useState<SeriesMatrix | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [seriesDeleteTarget, setSeriesDeleteTarget] = useState<Series | null>(null);
  const [newSeriesOpen, setNewSeriesOpen] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState("");
  const [newSeriesDesc, setNewSeriesDesc] = useState("");
  const [savingSeries, setSavingSeries] = useState(false);
  const [rawExercises, setRawExercises] = useState<Exercise[]>([]);
  const [rawTrainings, setRawTrainings] = useState<Training[]>([]);
  const [personnelData, setPersonnelData] = useState<PersonLite[]>([]);
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
  const [qualTypeOptions, setQualTypeOptions] = useState<QualificationType[]>([]);
  const [prereqSearch, setPrereqSearch] = useState("");
  const [qualMgrOpen, setQualMgrOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeCategory, setNewTypeCategory] = useState("");
  const [savingType, setSavingType] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyCreateForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [editing, setEditing] = useState<OperationItem | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", type: "", startDate: "", endDate: "", location: "", organizer: "", maxPersonnel: 20, description: "", status: "Tervezett", qualificationId: "", level: "", prerequisiteIds: [] });
  const [editPrereqSearch, setEditPrereqSearch] = useState("");
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const [deleteTarget, setDeleteTarget] = useState<OperationItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OperationItem | null>(null);
  const [addPersonId, setAddPersonId] = useState("");
  const [addPersonRole, setAddPersonRole] = useState("résztvevő");
  const [eligibilityMap, setEligibilityMap] = useState<Record<string, { eligible: boolean; missing: string[] }>>({});
  const [personSearch, setPersonSearch] = useState("");

  const [createConflicts, setCreateConflicts] = useState<LocationConflict[]>([]);
  const [editConflicts, setEditConflicts] = useState<LocationConflict[]>([]);

  const detailRef = useRef<OperationItem | null>(null);
  detailRef.current = detail;

  useEffect(() => {
    if (!creating) { setCreateConflicts([]); return; }
    if (!form.location.trim() || !form.startDate || !form.endDate) { setCreateConflicts([]); return; }
    const timer = setTimeout(() => {
      void checkLocationConflicts(form.location, form.startDate, form.endDate)
        .then(setCreateConflicts)
        .catch(() => setCreateConflicts([]));
    }, 600);
    return () => clearTimeout(timer);
  }, [creating, form.location, form.startDate, form.endDate]);

  useEffect(() => {
    if (!editing) { setEditConflicts([]); return; }
    if (!editForm.location.trim() || !editForm.startDate || !editForm.endDate) { setEditConflicts([]); return; }
    const timer = setTimeout(() => {
      void checkLocationConflicts(editForm.location, editForm.startDate, editForm.endDate, editing.source, editing.id)
        .then(setEditConflicts)
        .catch(() => setEditConflicts([]));
    }, 600);
    return () => clearTimeout(timer);
  }, [editing, editForm.location, editForm.startDate, editForm.endDate]);

  const formatDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("hu-HU");
  };

  const refresh = useCallback(async () => {
    try {
      const [exerciseData, trainingData, seriesData] = await Promise.all([
        exercises.getAll(),
        trainings.getAll(),
        seriesStore.getAll(),
      ]);
      setRawExercises(exerciseData);
      setRawTrainings(trainingData);
      setSeriesList(seriesData);
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

  useEffect(() => { void refresh(); }, [refresh]);
  useAutoRefresh(refresh);

  // Az állomány ritkán változik: egyszer töltjük, könnyű formában (nem 30 mp-enként a teljes aktát).
  useEffect(() => {
    pStore.getLite().then(setPersonnelData).catch((error) => toast.error(getErrorMessage(error)));
  }, []);

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
      if (item.seriesId) return false;  // a sorozat-elemek a sorozat-kártyán belül jelennek meg
      return true;
    });
  }, [data, search, filter, sourceFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const statusCounts: Record<OperationStatus, number> = {
    Tervezett: 0,
    Folyamatban: 0,
    Befejezett: 0,
    Lemondva: 0,
  };
  data.forEach((item) => {
    if (statusCounts[item.status] !== undefined) {
      statusCounts[item.status] += 1;
    }
  });

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

  useEffect(() => {
    const navState = location.state as { openOperationId?: string; openOperationSource?: "exercise" | "training" } | null;
    if (!navState?.openOperationId || data.length === 0) return;
    const found = data.find((item) =>
      item.id === navState.openOperationId &&
      (!navState.openOperationSource || item.source === navState.openOperationSource),
    );
    if (found) setDetail(found);
  }, [location.state, data]);

  const activePpl = useMemo(
    () =>
      personnelData
        .filter((p) => p.status === "Aktív" || p.status === "Tartalékos")
        .sort((a, b) => rankWeight(b.rank) - rankWeight(a.rank) || a.name.localeCompare(b.name, "hu")),
    [personnelData],
  );

  // ── Résztvevő-kezelés ──────────────────────────────────────────────────────

  useEffect(() => {
    qualificationTypes.getAll().then(setQualTypeOptions).catch(() => setQualTypeOptions([]));
  }, []);

  useEffect(() => {
    if (!selectedSeries) { setSeriesMatrix(null); return; }
    let active = true;
    setMatrixLoading(true);
    seriesStore.matrix(selectedSeries.id)
      .then((m) => { if (active) setSeriesMatrix(m); })
      .catch(() => { if (active) setSeriesMatrix(null); })
      .finally(() => { if (active) setMatrixLoading(false); });
    return () => { active = false; };
  }, [selectedSeries]);

  // A megnyitott művelet követelmény-jogosultsága (figyelmeztetéshez a beosztásnál).
  useEffect(() => {
    if (!detail) { setEligibilityMap({}); return; }
    let active = true;
    prerequisites.eligibility(detail.source, detail.id, undefined, true)
      .then(list => {
        if (!active) return;
        const map: Record<string, { eligible: boolean; missing: string[] }> = {};
        for (const e of list) map[e.personnelId] = { eligible: e.eligible, missing: e.missing };
        setEligibilityMap(map);
      })
      .catch(() => { if (active) setEligibilityMap({}); });
    return () => { active = false; };
  }, [detail]);

  const addPerson = async () => {
    if (!detail || !addPersonId) return;
    const p = personnelData.find((x) => x.id === addPersonId);
    if (!p) return;
    try {
      if (detail.source === "exercise") {
        const raw = rawExercises.find((e) => e.id === detail.id);
        if (!raw) return;
        const newAssignment: ExerciseAssignment = {
          personId: p.id, personName: p.name, role: addPersonRole,
          attendance: "Tervezett", rank: p.rank, rankShort: shortRank(p.rank), sztsz: p.sztsz,
        };
        await exercises.update({ ...raw, assigned: [...raw.assigned, newAssignment] });
      } else {
        const raw = rawTrainings.find((t) => t.id === detail.id);
        if (!raw) return;
        const newAssignment: TrainingAssignment = {
          personId: p.id, personName: p.name, attendance: "Tervezett",
          qualificationApproved: false, rank: p.rank, rankShort: shortRank(p.rank), sztsz: p.sztsz,
        };
        await trainings.update({ ...raw, assigned: [...raw.assigned, newAssignment] });
      }
      setAddPersonId("");
      setAddPersonRole("résztvevő");
      setPersonSearch("");
      await refresh();
      const elig = eligibilityMap[p.id];
      if (elig && !elig.eligible) {
        toast.warning(`Figyelem: ${p.name} nem teljesíti a követelményt (${elig.missing.join(", ")}). Beosztva — ellenőrizd.`);
      } else {
        toast.success("Személy hozzáadva");
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const removePerson = async (personId: string) => {
    if (!detail) return;
    try {
      if (detail.source === "exercise") {
        const raw = rawExercises.find((e) => e.id === detail.id);
        if (!raw) return;
        await exercises.update({ ...raw, assigned: raw.assigned.filter((a) => a.personId !== personId) });
      } else {
        const raw = rawTrainings.find((t) => t.id === detail.id);
        if (!raw) return;
        await trainings.update({ ...raw, assigned: raw.assigned.filter((a) => a.personId !== personId) });
      }
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const updateAttendance = async (personId: string, att: string) => {
    if (!detail) return;
    const attendanceVal = att as TrainingAssignment["attendance"];
    try {
      if (detail.source === "exercise") {
        const raw = rawExercises.find((e) => e.id === detail.id);
        if (!raw) return;
        await exercises.update({
          ...raw,
          assigned: raw.assigned.map((a) => a.personId === personId ? { ...a, attendance: attendanceVal } : a),
        });
      } else {
        const raw = rawTrainings.find((t) => t.id === detail.id);
        if (!raw) return;
        await trainings.update({
          ...raw,
          assigned: raw.assigned.map((a) => a.personId === personId ? { ...a, attendance: attendanceVal } : a),
        });
      }
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  // ── Szerkesztés ────────────────────────────────────────────────────────────

  const openEdit = (item: OperationItem) => {
    const rawTraining = item.source === "training" ? rawTrainings.find((t) => t.id === item.id) : undefined;
    const rawExercise = item.source === "exercise" ? rawExercises.find((e) => e.id === item.id) : undefined;
    const raw = rawTraining ?? rawExercise;
    setEditForm({
      name: item.name, type: item.type,
      startDate: item.startDate, endDate: item.endDate,
      location: item.location, organizer: rawTraining?.organizer ?? "",
      maxPersonnel: item.maxPersonnel, description: item.description,
      status: item.status,
      qualificationId: raw?.qualificationId ?? "", level: raw?.level ?? "", prerequisiteIds: [],
    });
    setEditPrereqSearch("");
    setEditErrors({});
    setEditing(item);
    // A követelmények külön végponton élnek; betöltjük, hogy szerkeszthetők legyenek.
    prerequisites.get(item.source, item.id)
      .then((pr) => setEditForm((prev) => ({ ...prev, prerequisiteIds: pr.qualTypeIds })))
      .catch(() => { /* nincs követelmény vagy nem elérhető — üres lista marad */ });
  };

  const handleEdit = async () => {
    if (!editing) return;
    const errs: Record<string, string> = {};
    if (!editForm.name.trim()) errs.name = "Kötelező";
    if (!editForm.startDate) errs.startDate = "Kötelező";
    if (!editForm.endDate) errs.endDate = "Kötelező";
    if (editForm.startDate && editForm.endDate && editForm.endDate < editForm.startDate) errs.endDate = "Vége >= Kezdete";
    setEditErrors(errs);
    if (Object.keys(errs).length > 0) return;
    try {
      if (editing.source === "exercise") {
        const raw = rawExercises.find((e) => e.id === editing.id);
        if (!raw) return;
        await exercises.update({
          ...raw, name: editForm.name, type: editForm.type,
          startDate: editForm.startDate, endDate: editForm.endDate,
          location: editForm.location, maxPersonnel: editForm.maxPersonnel,
          description: editForm.description, status: editForm.status as Exercise["status"],
          qualificationId: editForm.qualificationId, level: editForm.level,
        });
      } else {
        const raw = rawTrainings.find((t) => t.id === editing.id);
        if (!raw) return;
        await trainings.update({
          ...raw, name: editForm.name, type: editForm.type,
          startDate: editForm.startDate, endDate: editForm.endDate,
          location: editForm.location, organizer: editForm.organizer,
          maxPersonnel: editForm.maxPersonnel, description: editForm.description,
          status: editForm.status, qualificationId: editForm.qualificationId, level: editForm.level,
        });
      }
      await prerequisites.set(editing.source, editing.id, editForm.prerequisiteIds);
      toast.success("Sikeresen mentve");
      setEditing(null);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.source === "exercise") {
        await exercises.remove(deleteTarget.id);
      } else {
        await trainings.remove(deleteTarget.id);
      }      toast.success("Törölve");
      setDetail(null);
      setDeleteTarget(null);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  // ── Felkészítés-sorozatok ────────────────────────────────────────────────────

  const openCreateInSeries = (seriesId: string) => {
    setForm({ ...emptyCreateForm, seriesId });
    setErrors({});
    setSelectedSeries(null);
    setCreating(true);
  };

  const handleDeleteSeries = async () => {
    if (!seriesDeleteTarget) return;
    try {
      await seriesStore.remove(seriesDeleteTarget.id);
      await logAction(user!.displayName, user!.username, "törölve", "Sorozatok", seriesDeleteTarget.name);
      setSeriesDeleteTarget(null);
      setSelectedSeries(null);
      await refresh();
      toast.success("Sorozat törölve (az elemei önállóvá váltak)");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleCreateSeries = async () => {
    const name = newSeriesName.trim();
    if (!name) { toast.error("Add meg a sorozat nevét"); return; }
    setSavingSeries(true);
    try {
      await seriesStore.create({ name, description: newSeriesDesc.trim() });
      await logAction(user!.displayName, user!.username, "létrehozva", "Sorozatok", name);
      setNewSeriesName(""); setNewSeriesDesc(""); setNewSeriesOpen(false);
      await refresh();
      toast.success("Sorozat létrehozva");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSavingSeries(false);
    }
  };

  // ── Képzettség-típusok ─────────────────────────────────────────────────────

  const handleCreateType = async () => {
    const name = newTypeName.trim();
    if (!name) { toast.error("Add meg a képzettség nevét"); return; }
    if (qualTypeOptions.some(qt => qt.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Már van ilyen képzettség");
      return;
    }
    setSavingType(true);
    try {
      const created = await qualificationTypes.create({ name, category: newTypeCategory.trim() || "Általános", validityDays: null, description: "" });
      setQualTypeOptions(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "hu")));
      setNewTypeName(""); setNewTypeCategory("");
      await logAction(user!.displayName, user!.username, "létrehozva", "Képzettségek", created.name);
      toast.success("Képzettség létrehozva");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSavingType(false);
    }
  };

  // ── Létrehozás ─────────────────────────────────────────────────────────────

  const validateCreate = () => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Kötelező";
    if (!form.startDate) next.startDate = "Kötelező";
    if (!form.endDate) next.endDate = "Kötelező";
    if (form.startDate && form.endDate && form.endDate < form.startDate) next.endDate = "Vége >= Kezdete";
    if (form.source === "training" && !form.organizer.trim()) next.organizer = "Kötelező";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleCreate = async () => {
    if (!validateCreate()) return;
    try {
      const common = {
        name: form.name.trim(), type: form.type.trim(),
        startDate: form.startDate, endDate: form.endDate,
        location: form.location.trim(), maxPersonnel: form.maxPersonnel,
        description: form.description.trim(),
      };
      if (form.source === "exercise") {
        const created = await exercises.add({ ...common, status: form.status, qualificationId: form.qualificationId, seriesId: form.seriesId, level: form.level, assigned: [] });
        await prerequisites.set("exercise", created.id, form.prerequisiteIds);      } else {
        const created = await trainings.add({ ...common, organizer: form.organizer.trim(), status: form.status, assigned: [], qualificationId: form.qualificationId, seriesId: form.seriesId, level: form.level });
        await prerequisites.set("training", created.id, form.prerequisiteIds);      }
      toast.success("Művelet létrehozva");
      setCreating(false);
      setForm(emptyCreateForm);
      setErrors({});
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  // Lemondás / visszavonás: a szerver a dátumból számolja vissza az állapotot.
  const setCancelled = async (cancelled: boolean) => {
    if (!detail) return;
    const status: OperationStatus = cancelled ? "Lemondva" : "Tervezett";
    try {
      if (detail.source === "exercise") {
        const raw = rawExercises.find((e) => e.id === detail.id);
        if (raw) await exercises.update({ ...raw, status });
      } else {
        const raw = rawTrainings.find((t) => t.id === detail.id);
        if (raw) await trainings.update({ ...raw, status });
      }
      toast.success(cancelled ? "Művelet lemondva — nem számít bele semmibe." : "Lemondás visszavonva.");
      setCancelTarget(null);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military">Műveletek</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">Gyakorlatok + kiképzések egy nézetben</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button onClick={() => setQualMgrOpen(true)} className="btn-mil-secondary flex items-center gap-2 text-xs">
              <GraduationCap className="w-4 h-4" /> Képzettségek
            </button>
          )}
          {canEdit && (
            <button onClick={() => setNewSeriesOpen(true)} className="btn-mil-secondary flex items-center gap-2 text-xs">
              <Layers className="w-4 h-4" /> Új sorozat
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => {
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
        {STATUSES.map((s) => (
          <div key={s} className="stats-card"><div className="stats-number">{statusCounts[s]}</div><div className="stats-label">{STATUS_LABEL[s]}</div></div>
        ))}
      </div>

      {seriesList.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-military mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" /> Felkészítés-sorozatok
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {seriesList.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSeries(s)}
                className="text-left bg-card border border-border border-l-2 border-l-primary p-4 hover:bg-secondary transition-colors"
                style={{ borderRadius: "2px" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="w-4 h-4 text-primary" />
                  <h3 className="font-bold font-rajdhani">{s.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground font-mono">{s.itemCount} elem — belépéshez kattints</p>
              </button>
            ))}
          </div>
        </div>
      )}

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
            {s === "Összes" ? s : STATUS_LABEL[s as OperationStatus]}
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
                    {STATUS_LABEL[item.status]}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  {item.source === "exercise" ? <Crosshair className="w-3.5 h-3.5 text-primary" /> : <GraduationCap className="w-3.5 h-3.5 text-primary" />}
                  <span className="mono-chip text-xs">{typeMap[item.type] || item.type}</span>
                  <span className="mono-chip text-[10px]">{item.source === "exercise" ? "GYAKORLAT" : "KIKÉPZÉS"}</span>
                  {item.level && (
                    <span className="mono-chip text-[10px] bg-primary/15 text-primary">{item.level}</span>
                  )}
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

      {/* ── Létrehozás modal ──────────────────────────────────────────────── */}
      <Modal open={!!selectedSeries} onClose={() => setSelectedSeries(null)} title={selectedSeries?.name ?? "Sorozat"} wide>
        {selectedSeries && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground">{selectedSeries.description || "A sorozat elemei (modulok/szintek)."}</p>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <button onClick={() => openCreateInSeries(selectedSeries.id)} className="btn-mil-primary flex items-center gap-2 text-xs">
                    <Plus className="w-4 h-4" /> Új elem a sorozatba
                  </button>
                  <button onClick={() => setSeriesDeleteTarget(selectedSeries)} className="btn-mil-danger text-xs">
                    Sorozat törlése
                  </button>
                </div>
              )}
            </div>
            {(() => {
              const items = data.filter((o) => o.seriesId === selectedSeries.id);
              return items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Még nincs elem ebben a sorozatban. Hozz létre egyet az „Új elem a sorozatba" gombbal.</p>
              ) : (
                <div className="border border-border" style={{ borderRadius: "2px" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-military text-muted-foreground border-b border-border">
                        <th className="px-3 py-2">Megnevezés</th>
                        <th className="px-3 py-2">Szint</th>
                        <th className="px-3 py-2">Időszak</th>
                        <th className="px-3 py-2">Állapot</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((o) => (
                        <tr key={`${o.source}-${o.id}`} className="border-b border-border/50 hover:bg-secondary/40 cursor-pointer" onClick={() => { setSelectedSeries(null); setDetail(o); }}>
                          <td className="px-3 py-1.5 font-rajdhani text-foreground">{o.name}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{o.level || "—"}</td>
                          <td className="px-3 py-1.5 text-muted-foreground text-xs">{formatDate(o.startDate)} → {formatDate(o.endDate)}</td>
                          <td className="px-3 py-1.5"><span className={`px-2 py-0.5 text-xs uppercase font-mono ${statusClass[o.status]}`} style={{ borderRadius: "2px" }}>{STATUS_LABEL[o.status]}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            <div>
              <h3 className="text-sm font-bold uppercase tracking-military mb-2">Haladási mátrix</h3>
              {matrixLoading ? (
                <p className="text-sm text-muted-foreground">Betöltés…</p>
              ) : !seriesMatrix || seriesMatrix.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Még senki nem teljesített elemet ebben a sorozatban.</p>
              ) : (
                <div className="overflow-x-auto border border-border" style={{ borderRadius: "2px" }}>
                  <table className="text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-military text-muted-foreground border-b border-border">
                        <th className="px-3 py-2 text-left sticky left-0 bg-card">Név</th>
                        {seriesMatrix.operations.map((o) => (
                          <th key={o.id} className="px-2 py-2 text-center whitespace-nowrap">{o.name}{o.level ? ` (${o.level})` : ""}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {seriesMatrix.rows.map((r) => (
                        <tr key={r.personnelId} className="border-b border-border/50">
                          <td className="px-3 py-1.5 font-rajdhani text-foreground sticky left-0 bg-card">{r.name}</td>
                          {seriesMatrix.operations.map((o) => (
                            <td key={o.id} className="px-2 py-1.5 text-center">
                              {r.completed.includes(o.id)
                                ? <span className="text-emerald-400">✓</span>
                                : <span className="text-muted-foreground/40">–</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={newSeriesOpen} onClose={() => setNewSeriesOpen(false)} title="Új felkészítés-sorozat">
        <div className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Sorozat neve *</label>
            <input value={newSeriesName} onChange={(e) => setNewSeriesName(e.target.value)} placeholder="pl. 7×20 Tartalékos szakfelkészítés" className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Leírás</label>
            <textarea value={newSeriesDesc} onChange={(e) => setNewSeriesDesc(e.target.value)} className="w-full bg-input border border-border px-3 py-2 text-sm resize-none h-20" style={{ borderRadius: "2px" }} />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setNewSeriesOpen(false)} className="btn-mil-secondary text-xs">Mégse</button>
            <button onClick={handleCreateSeries} disabled={savingSeries} className="btn-mil-primary text-xs">Létrehoz</button>
          </div>
        </div>
      </Modal>

      <Modal open={qualMgrOpen} onClose={() => setQualMgrOpen(false)} title="Képzettségek">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">Itt hozhatsz létre új képzettség-típust; a katonáknak a Személyek oldalon adod ki, a műveletekhez pedig követelményként állítod be.</p>
          {canEdit && (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Új képzettség neve</label>
                <input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }} />
              </div>
              <div className="w-40">
                <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Kategória</label>
                <input value={newTypeCategory} onChange={(e) => setNewTypeCategory(e.target.value)} placeholder="Általános" className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }} />
              </div>
              <button onClick={handleCreateType} disabled={savingType} className="btn-mil-primary text-xs">Létrehoz</button>
            </div>
          )}
          <div className="border border-border max-h-80 overflow-auto" style={{ borderRadius: "2px" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-military text-muted-foreground border-b border-border">
                  <th className="px-3 py-2">Név</th>
                  <th className="px-3 py-2">Kategória</th>
                </tr>
              </thead>
              <tbody>
                {qualTypeOptions.length === 0 ? (
                  <tr><td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">Nincs képzettség.</td></tr>
                ) : qualTypeOptions.map((qt) => (
                  <tr key={qt.id} className="border-b border-border/50">
                    <td className="px-3 py-1.5 text-foreground font-rajdhani">{qt.name}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{qt.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      <Modal open={creating} onClose={() => setCreating(false)} title="Új művelet hozzáadása">
        <div className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Típus *</label>
            <select
              value={form.source}
              onChange={(e) => {
                const nextSource = e.target.value as OperationSource;
                setForm((prev) => ({ ...prev, source: nextSource }));
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
            <input list="operation-type-options" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="pl. Lövészet, Őrszolgálat, Ügyeleti szolgálat…" className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }} />
            <datalist id="operation-type-options">
              {DUTY_TYPES.map((t) => <option key={t} value={t} />)}
              {Array.from(new Set(data.map((d) => d.type).filter(Boolean))).map((t) => <option key={t} value={t} />)}
            </datalist>
            <p className="text-[11px] font-mono text-muted-foreground mt-1">A szolgálat is művelet: a szolgálat-típusok ({DUTY_TYPES.join(", ")}) a naptárban és a helyzetképben szolgálatként jelennek meg.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Felkészítés-sorozat</label>
              <div className="w-full bg-input border border-border px-3 py-2 text-sm text-muted-foreground" style={{ borderRadius: "2px" }}>
                {form.seriesId ? (seriesList.find((s) => s.id === form.seriesId)?.name ?? "Sorozat") : "Önálló (nincs sorozat)"}
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Szint</label>
              <select
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })}
                className="w-full bg-input border border-border px-3 py-2 text-sm"
                style={{ borderRadius: "2px" }}
              >
                <option value="">—</option>
                <option value="Alap">Alap</option>
                <option value="Haladó">Haladó</option>
                <option value="Emelt">Emelt</option>
              </select>
            </div>
          </div>
          {!!form.seriesId && (form.level === "Haladó" || form.level === "Emelt") && (
            <p className="text-[11px] text-muted-foreground -mt-1">A rendszer automatikusan megköveteli az azonos nevű, eggyel alacsonyabb szintű elem képesítését (ha van).</p>
          )}

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
            {createConflicts.length > 0 && (
              <div className="mt-2 p-2 border border-yellow-600/50 bg-yellow-600/10 text-xs font-mono">
                <p className="text-yellow-500 mb-1">⚠ Helyszínütközés ({createConflicts.length} esemény):</p>
                {createConflicts.map((c) => (
                  <p key={c.eventId} className="text-muted-foreground">• {c.eventName} ({c.startDate} → {c.endDate})</p>
                ))}
              </div>
            )}
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
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Mit ad teljesítéskor (képesítés)</label>
            <select value={form.qualificationId} onChange={(e) => setForm({ ...form, qualificationId: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }}>
              <option value="">— nem ad képesítést —</option>
              {qualTypeOptions.map((qt) => <option key={qt.id} value={qt.id}>{qt.name}</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">A „Megjelent" résztvevők automatikusan megkapják (a lemondott művelet nem ad).</p>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Belépési követelmény(ek)</label>
            <input value={prereqSearch} onChange={(e) => setPrereqSearch(e.target.value)} placeholder="Képesítés keresése…" className="w-full bg-input border border-border px-3 py-1.5 text-sm mb-1" style={{ borderRadius: "2px" }} />
            <div className="border border-border max-h-40 overflow-auto" style={{ borderRadius: "2px" }}>
              {qualTypeOptions.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">Nincs képesítés-típus.</p>}
              {qualTypeOptions
                .filter((qt) => !prereqSearch.trim() || qt.name.toLowerCase().includes(prereqSearch.trim().toLowerCase()))
                .map((qt) => {
                  const checked = form.prerequisiteIds.includes(qt.id);
                  return (
                    <label key={qt.id} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-secondary">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setForm((prev) => ({
                          ...prev,
                          prerequisiteIds: checked
                            ? prev.prerequisiteIds.filter((id) => id !== qt.id)
                            : [...prev.prerequisiteIds, qt.id],
                        }))}
                      />
                      <span className="text-foreground">{qt.name}</span>
                    </label>
                  );
                })}
            </div>
            {form.prerequisiteIds.length > 0 && <p className="text-[11px] text-muted-foreground mt-1">{form.prerequisiteIds.length} követelmény kiválasztva</p>}
          </div>

          <div>
            <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Leírás</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm resize-none h-20" style={{ borderRadius: "2px" }} />
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <button onClick={() => setCreating(false)} className="btn-mil-secondary text-xs">Mégsem</button>
            <button onClick={() => { void handleCreate(); }} className="btn-mil-primary text-xs">Mentés</button>
          </div>
        </div>
      </Modal>

      {/* ── Részletek + hozzárendelés modal ──────────────────────────────── */}
      <Modal open={!!detail && !editing} onClose={() => { setDetail(null); setPersonSearch(""); }} title={detail?.name || ""} wide>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Típus</span><p className="mono-chip mt-1">{typeMap[detail.type] || detail.type}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Forrás</span><p className="mono-chip mt-1">{detail.source === "exercise" ? "Gyakorlat" : "Kiképzés"}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Státusz</span><p className={`inline-flex items-center px-2 py-0.5 text-xs uppercase tracking-military font-mono mt-1 ${statusClass[detail.status]}`} style={{ borderRadius: "2px" }}>{STATUS_LABEL[detail.status]}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Időszak</span><p className="font-mono text-primary text-sm mt-1">{formatDate(detail.startDate)} → {formatDate(detail.endDate)}</p></div>
              <div><span className="text-muted-foreground text-xs uppercase tracking-military">Helyszín</span><p className="mt-1">{detail.location || "Nincs megadva"}</p></div>
            </div>
            {detail.description && <p className="text-sm text-muted-foreground">{detail.description}</p>}

            <div className="flex items-center gap-3 pt-2">
              <div className="h-px flex-1 bg-primary/30" />
              <span className="text-xs uppercase tracking-military text-primary font-mono">Résztvevők ({detail.assigned.length}/{detail.maxPersonnel})</span>
              <div className="h-px flex-1 bg-primary/30" />
            </div>

            <CampaignPanel source={detail.source} eventId={detail.id} eventName={detail.name} canEdit={canEdit} onChanged={refresh} />

            <table className="w-full mil-table">
              <thead>
                <tr>
                  <th>Név</th>
                  <th>Rendfokozat / SZTSZ</th>
                  <th>{detail.source === "exercise" ? "Beosztás" : "Jelenlét"}</th>
                  {canEdit && <th></th>}
                </tr>
              </thead>
              <tbody>
                {detail.assigned.length === 0 && (
                  <tr><td colSpan={canEdit ? 4 : 3} className="text-muted-foreground text-xs py-4">Nincs hozzárendelt személy</td></tr>
                )}
                {detail.assigned.map((a, idx) => {
                  const personId = String(a.personId ?? "");
                  const name = String(a.personName ?? "Ismeretlen");
                  const rankLabel = String(a.rankShort ?? a.rank ?? "-");
                  const sztszLabel = String(a.sztsz ?? "-");
                  const att = String(a.attendance ?? "Tervezett");
                  // Szerep csak a gyakorlat-beosztáson van; a fordító itt szűkít.
                  const role = "role" in a ? a.role : "-";
                  const elig = eligibilityMap[personId];
                  return (
                    <tr key={`${personId}-${idx}`}>
                      <td>
                        {name}
                        {elig && !elig.eligible && (
                          <span className="ml-2 text-warning text-xs font-mono" title={`Hiányzik: ${elig.missing.join(", ")}`}>
                            ⚠ {elig.missing.join(", ")}
                          </span>
                        )}
                      </td>
                      <td className="font-mono text-xs text-primary">{rankLabel} / {sztszLabel}</td>
                      <td>
                        {canEdit ? (
                          <select
                            value={att}
                            onChange={(e) => { void updateAttendance(personId, e.target.value); }}
                            className="bg-input border border-border px-2 py-1 text-xs"
                            style={{ borderRadius: "2px" }}
                          >
                            {ATTENDANCE.map((at) => <option key={at} value={at}>{at}</option>)}
                          </select>
                        ) : (
                          <span className="text-brass font-mono text-xs">
                            {detail.source === "exercise" ? role : att}
                          </span>
                        )}
                      </td>
                      {canEdit && (
                        <td>
                          <button onClick={() => { void removePerson(personId); }} className="text-destructive text-xs hover:underline">
                            Eltávolítás
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {canEdit && (
              <div className="flex gap-2 items-end pt-2">
                <div className="flex-1">
                  <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Személy hozzáadása</label>
                  <input
                    placeholder="Szűrés név/rang/sztsz..."
                    value={personSearch}
                    onChange={(e) => setPersonSearch(e.target.value)}
                    className="w-full bg-input border border-border px-3 py-1.5 text-sm mb-1"
                    style={{ borderRadius: "2px" }}
                  />
                  <select
                    value={addPersonId}
                    onChange={(e) => setAddPersonId(e.target.value)}
                    className="w-full bg-input border border-border px-3 py-2 text-sm"
                    style={{ borderRadius: "2px" }}
                  >
                    <option value="">Válassz...</option>
                    {activePpl
                      .filter((p) =>
                        !detail.assigned.some((a) => String(a.personId) === p.id) &&
                        (personSearch === "" ||
                          p.name.toLowerCase().includes(personSearch.toLowerCase()) ||
                          p.rank.toLowerCase().includes(personSearch.toLowerCase()) ||
                          p.sztsz.includes(personSearch))
                      )
                      .slice(0, 50)
                      .map((p) => {
                        const elig = eligibilityMap[p.id];
                        const warn = elig && !elig.eligible;
                        return (
                          <option key={p.id} value={p.id}>
                            {warn ? "⚠ " : ""}{p.name} ({p.rank}) – {p.sztsz}{warn ? ` — hiányzik: ${elig.missing.join(", ")}` : ""}
                          </option>
                        );
                      })}
                  </select>
                </div>
                {detail.source === "exercise" && (
                  <div className="w-40">
                    <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Beosztás</label>
                    <input
                      value={addPersonRole}
                      onChange={(e) => setAddPersonRole(e.target.value)}
                      className="w-full bg-input border border-border px-3 py-2 text-sm"
                      style={{ borderRadius: "2px" }}
                    />
                  </div>
                )}
                <button onClick={() => { void addPerson(); }} className="btn-mil-primary text-xs">Hozzáadás</button>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <div className="h-px flex-1 bg-primary/30" />
              <span className="text-xs uppercase tracking-military text-primary font-mono">Művelet-adminisztráció</span>
              <div className="h-px flex-1 bg-primary/30" />
            </div>

            <OperationDetailTabs operationId={detail.id} operationName={detail.name} assigned={detail.assigned} canEdit={canEdit} />

            <div className="flex justify-between pt-2">
              <button onClick={() => { setDetail(null); setPersonSearch(""); }} className="btn-mil-secondary text-xs">Bezárás</button>
              {canEdit && (
                <div className="flex gap-2">
                  <button onClick={() => openEdit(detail)} className="btn-mil-secondary text-xs">Szerkesztés</button>
                  {detail.status === "Lemondva" ? (
                    <button onClick={() => { void setCancelled(false); }} className="btn-mil-secondary text-xs">Lemondás visszavonása</button>
                  ) : (
                    <button onClick={() => setCancelTarget(detail)} className="btn-mil-secondary text-xs text-warning">Lemondás</button>
                  )}
                  <button onClick={() => setDeleteTarget(detail)} className="btn-mil-danger text-xs">Törlés</button>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Szerkesztés modal ──────────────────────────────────────────────── */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Művelet szerkesztése">
        {editing && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Megnevezés *</label>
              <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }} />
              {editErrors.name && <p className="text-destructive text-xs mt-1">{editErrors.name}</p>}
            </div>

            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Alkategória</label>
              <input value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Kezdete *</label>
                <DateTimePickerInput value={editForm.startDate} onChange={(value) => setEditForm({ ...editForm, startDate: value })} />
                {editErrors.startDate && <p className="text-destructive text-xs mt-1">{editErrors.startDate}</p>}
              </div>
              <div>
                <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Vége *</label>
                <DateTimePickerInput value={editForm.endDate} onChange={(value) => setEditForm({ ...editForm, endDate: value })} />
                {editErrors.endDate && <p className="text-destructive text-xs mt-1">{editErrors.endDate}</p>}
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Helyszín</label>
              <input value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }} />
              {editConflicts.length > 0 && (
                <div className="mt-2 p-2 border border-yellow-600/50 bg-yellow-600/10 text-xs font-mono">
                  <p className="text-yellow-500 mb-1">⚠ Helyszínütközés ({editConflicts.length} esemény):</p>
                  {editConflicts.map((c) => (
                    <p key={c.eventId} className="text-muted-foreground">• {c.eventName} ({c.startDate} → {c.endDate})</p>
                  ))}
                </div>
              )}
            </div>

            {editing.source === "training" && (
              <div>
                <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Szervező</label>
                <input value={editForm.organizer} onChange={(e) => setEditForm({ ...editForm, organizer: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }} />
              </div>
            )}

            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Max létszám</label>
              <input type="number" value={editForm.maxPersonnel} onChange={(e) => setEditForm({ ...editForm, maxPersonnel: Number(e.target.value) || 0 })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }} />
            </div>


            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Mit ad teljesítéskor (képesítés)</label>
                <select value={editForm.qualificationId} onChange={(e) => setEditForm({ ...editForm, qualificationId: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }}>
                  <option value="">— nem ad képesítést —</option>
                  {qualTypeOptions.map((qt) => <option key={qt.id} value={qt.id}>{qt.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Szint</label>
                <select value={editForm.level} onChange={(e) => setEditForm({ ...editForm, level: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm" style={{ borderRadius: "2px" }}>
                  <option value="">—</option>
                  <option value="Alap">Alap</option>
                  <option value="Haladó">Haladó</option>
                  <option value="Emelt">Emelt</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Belépési követelmény(ek)</label>
              <input value={editPrereqSearch} onChange={(e) => setEditPrereqSearch(e.target.value)} placeholder="Képesítés keresése…" className="w-full bg-input border border-border px-3 py-1.5 text-sm mb-1" style={{ borderRadius: "2px" }} />
              <div className="border border-border max-h-40 overflow-auto" style={{ borderRadius: "2px" }}>
                {qualTypeOptions
                  .filter((qt) => !editPrereqSearch.trim() || qt.name.toLowerCase().includes(editPrereqSearch.trim().toLowerCase()))
                  .map((qt) => {
                    const checked = editForm.prerequisiteIds.includes(qt.id);
                    return (
                      <label key={qt.id} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-secondary">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setEditForm((prev) => ({
                            ...prev,
                            prerequisiteIds: checked ? prev.prerequisiteIds.filter((id) => id !== qt.id) : [...prev.prerequisiteIds, qt.id],
                          }))}
                        />
                        <span className="text-foreground">{qt.name}</span>
                      </label>
                    );
                  })}
              </div>
              {editForm.prerequisiteIds.length > 0 && <p className="text-[11px] text-muted-foreground mt-1">{editForm.prerequisiteIds.length} követelmény kiválasztva</p>}
            </div>

            <div>
              <label className="block text-xs uppercase tracking-military text-muted-foreground mb-1">Leírás</label>
              <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="w-full bg-input border border-border px-3 py-2 text-sm resize-none h-20" style={{ borderRadius: "2px" }} />
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <button onClick={() => setEditing(null)} className="btn-mil-secondary text-xs">Mégsem</button>
              <button onClick={() => { void handleEdit(); }} className="btn-mil-primary text-xs">Mentés</button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => { void setCancelled(true); }}
        message={`Lemondod a műveletet: „${cancelTarget?.name}"? A lemondott művelet nem számít bele semmibe (képesítés, éves szolgálati napok), a beosztás megmarad.`}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { void handleDelete(); }}
        message={`Biztosan törli a következőt: „${deleteTarget?.name}"? Ez a művelet nem visszavonható.`}
      />

      <ConfirmDialog
        open={!!seriesDeleteTarget}
        onClose={() => setSeriesDeleteTarget(null)}
        onConfirm={() => { void handleDeleteSeries(); }}
        message={`Törli a(z) „${seriesDeleteTarget?.name}" sorozatot? Az elemei nem törlődnek, csak önállóvá válnak.`}
      />
    </div>
  );
}
