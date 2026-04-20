import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Calendar, MapPin, Pencil, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";

import AttendanceGrid from "@/components/operations/AttendanceGrid";
import DocumentList from "@/components/operations/DocumentList";
import RequirementsList from "@/components/operations/RequirementsList";
import ConfirmDialog from "@/components/ConfirmDialog";
import DatePickerInput from "@/components/DatePickerInput";
import Modal from "@/components/Modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import {
  createRequirement,
  deleteDocument,
  deleteRequirement,
  downloadDocument,
  exercises,
  fetchAttendance,
  fetchDocuments,
  fetchRequirements,
  getErrorMessage,
  trainings,
  updateAttendance,
  updateRequirement,
  uploadDocument,
  viewDocument,
} from "@/lib/store";
import type {
  AttendanceEntry,
  AttendanceEntryUpdate,
  AttendanceStatus,
  Exercise,
  MaterialRequirement,
  OperationDocument,
  Training,
} from "@/lib/types";

type OperationType = "exercise" | "training";

type CombinedOperation = {
  id: string;
  operationType: OperationType;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  organizer: string;
  qualificationId: string;
  maxPersonnel: number;
  description: string;
  status: string;
  assigned: Array<Record<string, unknown>>;
};

type OperationLocationState = {
  openOperationId?: string;
  openOperationType?: OperationType;
  openOperationName?: string;
};

type OperationForm = {
  operationType: OperationType;
  name: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  location: string;
  organizer: string;
  maxPersonnel: string;
  description: string;
};

type SortDirection = "asc" | "desc";
type ParticipantSortField = "name" | "rank" | "sztsz" | "role" | "attendance";

type PendingDelete =
  | { kind: "requirement"; id: string }
  | { kind: "document"; id: string; name: string }
  | null;

type DocumentPreview = {
  open: boolean;
  url: string;
  mimeType: string;
  title: string;
};

const EXERCISE_STATUSES: Exercise["status"][] = ["Tervezett", "Folyamatban", "Befejezett", "Törölve"];
const TRAINING_STATUSES: Training["status"][] = ["Tervezett", "Folyamatban", "Befejezett"];

const statusClass: Record<string, string> = {
  Tervezett: "badge-planned",
  Folyamatban: "badge-ongoing",
  Befejezett: "badge-completed",
  Törölve: "badge-cancelled",
};

function toCombinedOperation(item: Exercise | Training, operationType: OperationType): CombinedOperation {
  return {
    id: item.id,
    operationType,
    name: item.name,
    type: item.type,
    startDate: item.startDate,
    endDate: item.endDate,
    location: item.location,
    organizer: operationType === "training" ? item.organizer : "",
    qualificationId: operationType === "training" ? item.qualificationId : "",
    maxPersonnel: item.maxPersonnel,
    description: item.description,
    status: item.status,
    assigned: item.assigned.map((entry) => ({ ...entry })),
  };
}

function getSelectedKey(id: string, operationType: OperationType) {
  return `${id}::${operationType}`;
}

function getDateOnly(value: string) {
  return value.slice(0, 10);
}

function getTodayDateOnly() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDisplayText(value: unknown, fallback = "-") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getParticipantRole(item: Record<string, unknown>) {
  const role = getDisplayText(item.role, "");
  if (role !== "") return role;

  if (typeof item.qualificationApproved === "boolean") {
    return item.qualificationApproved ? "Képzettség jóváhagyva" : "Képzettség függőben";
  }

  return "Kijelölt résztvevő";
}

function getParticipantAttendance(item: Record<string, unknown>) {
  return getDisplayText(item.attendance, "Nincs adat");
}

function getParticipantRank(item: Record<string, unknown>) {
  return getDisplayText(item.rankShort ?? item.rank, "-");
}

function getParticipantSztsz(item: Record<string, unknown>) {
  return getDisplayText(item.sztsz, "-");
}

function createEmptyForm(operationType: OperationType): OperationForm {
  return {
    operationType,
    name: "",
    type: "",
    status: "Tervezett",
    startDate: "",
    endDate: "",
    location: "",
    organizer: "",
    maxPersonnel: "20",
    description: "",
  };
}

function getAllowedStatuses(operationType: OperationType): string[] {
  return operationType === "exercise" ? EXERCISE_STATUSES : TRAINING_STATUSES;
}

function makeAttendanceSnapshot(entries: AttendanceEntry[]) {
  return new Map(entries.map((entry) => [entry.personId, { status: entry.status, note: entry.note, personName: entry.personName }]));
}

function toDefaultAttendanceEntries(assigned: Array<Record<string, unknown>>): AttendanceEntry[] {
  return assigned.map((item, index) => {
    const fallbackId = `person-${index}`;
    return {
      personId: getDisplayText(item.personId, fallbackId),
      personName: getDisplayText(item.personName, "Ismeretlen"),
      status: "Pending",
      note: "",
      updatedAt: "",
      updatedBy: "",
    };
  });
}

function getSortIndicator(active: boolean, direction: SortDirection) {
  if (!active) return "";
  return direction === "asc" ? " ↑" : " ↓";
}

export default function Operations() {
  const { canEdit } = useAuth();
  const location = useLocation();
  const navState = (location.state as OperationLocationState | null) ?? null;

  const [operations, setOperations] = useState<CombinedOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Összes");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [handledNavigation, setHandledNavigation] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingOperation, setEditingOperation] = useState<CombinedOperation | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OperationForm>(createEmptyForm("exercise"));
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [attendanceEntries, setAttendanceEntries] = useState<AttendanceEntry[]>([]);
  const [attendanceSnapshot, setAttendanceSnapshot] = useState<Map<string, { status: AttendanceStatus; note: string; personName: string }>>(new Map());
  const [attendanceSaving, setAttendanceSaving] = useState(false);

  const [requirements, setRequirements] = useState<MaterialRequirement[]>([]);
  const [requirementsBusy, setRequirementsBusy] = useState(false);

  const [documents, setDocuments] = useState<OperationDocument[]>([]);
  const [documentsBusy, setDocumentsBusy] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [preview, setPreview] = useState<DocumentPreview | null>(null);

  const [participantSortField, setParticipantSortField] = useState<ParticipantSortField>("name");
  const [participantSortDirection, setParticipantSortDirection] = useState<SortDirection>("asc");

  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const refreshOperations = useCallback(async () => {
    try {
      const [exerciseItems, trainingItems] = await Promise.all([exercises.getAll(), trainings.getAll()]);
      const normalized = [
        ...exerciseItems.map((item) => toCombinedOperation(item, "exercise")),
        ...trainingItems.map((item) => toCombinedOperation(item, "training")),
      ];

      setOperations(normalized);
      setSelectedId((current) => {
        if (current && normalized.some((item) => getSelectedKey(item.id, item.operationType) === current)) {
          return current;
        }
        return normalized[0] ? getSelectedKey(normalized[0].id, normalized[0].operationType) : null;
      });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshOperations();
    const timer = setInterval(() => void refreshOperations(), 30000);
    return () => clearInterval(timer);
  }, [refreshOperations]);

  const navigationSignature = `${navState?.openOperationId ?? ""}|${navState?.openOperationType ?? ""}|${navState?.openOperationName ?? ""}`;

  useEffect(() => {
    if (!operations.length || !navigationSignature || navigationSignature === "||" || handledNavigation === navigationSignature) {
      return;
    }

    const normalizedName = navState?.openOperationName?.trim().toLowerCase() ?? "";
    const foundExact = navState?.openOperationId && navState.openOperationType
      ? operations.find((item) => item.id === navState.openOperationId && item.operationType === navState.openOperationType)
      : undefined;
    const foundById = navState?.openOperationId
      ? operations.find((item) => item.id === navState.openOperationId)
      : undefined;
    const foundByName = normalizedName
      ? operations.find((item) => item.name.trim().toLowerCase() === normalizedName)
      : undefined;
    const found = foundExact ?? foundById ?? foundByName;

    if (found) {
      setSelectedId(getSelectedKey(found.id, found.operationType));
      setActiveTab("overview");
    }

    setHandledNavigation(navigationSignature);
  }, [handledNavigation, navState?.openOperationId, navState?.openOperationName, navState?.openOperationType, navigationSignature, operations]);

  const detectedStatuses = useMemo(
    () => Array.from(new Set(operations.map((item) => item.status))).sort((left, right) => left.localeCompare(right)),
    [operations],
  );

  const searchQuery = search.trim().toLowerCase();

  const { orderedOperations, anchorKey } = useMemo(() => {
    const filtered = operations.filter((item) => {
      if (searchQuery) {
        const searchableFields = [item.name, item.type, item.location, item.organizer, item.description]
          .map((value) => value.toLowerCase());
        if (!searchableFields.some((value) => value.includes(searchQuery))) {
          return false;
        }
      }

      if (statusFilter !== "Összes" && item.status !== statusFilter) {
        return false;
      }

      const start = getDateOnly(item.startDate);
      const end = getDateOnly(item.endDate);
      if (dateFrom && end < dateFrom) {
        return false;
      }
      if (dateTo && start > dateTo) {
        return false;
      }

      return true;
    });

    const today = getTodayDateOnly();
    const past: CombinedOperation[] = [];
    const current: CombinedOperation[] = [];
    const future: CombinedOperation[] = [];

    filtered.forEach((item) => {
      const start = getDateOnly(item.startDate);
      const end = getDateOnly(item.endDate);

      if (end < today) {
        past.push(item);
      } else if (start > today) {
        future.push(item);
      } else {
        current.push(item);
      }
    });

    past.sort((left, right) => {
      const byEnd = getDateOnly(right.endDate).localeCompare(getDateOnly(left.endDate));
      if (byEnd !== 0) return byEnd;
      return left.name.localeCompare(right.name, "hu");
    });

    current.sort((left, right) => {
      const byStart = getDateOnly(left.startDate).localeCompare(getDateOnly(right.startDate));
      if (byStart !== 0) return byStart;
      const byEnd = getDateOnly(left.endDate).localeCompare(getDateOnly(right.endDate));
      if (byEnd !== 0) return byEnd;
      return left.name.localeCompare(right.name, "hu");
    });

    future.sort((left, right) => {
      const byStart = getDateOnly(left.startDate).localeCompare(getDateOnly(right.startDate));
      if (byStart !== 0) return byStart;
      return left.name.localeCompare(right.name, "hu");
    });

    const ordered = [...past, ...current, ...future];
    const anchorItem = current[0] ?? future[0] ?? past[0] ?? null;

    return {
      orderedOperations: ordered,
      anchorKey: anchorItem ? getSelectedKey(anchorItem.id, anchorItem.operationType) : null,
    };
  }, [operations, searchQuery, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (!orderedOperations.length) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !orderedOperations.some((item) => getSelectedKey(item.id, item.operationType) === selectedId)) {
      const fallback = anchorKey ?? getSelectedKey(orderedOperations[0].id, orderedOperations[0].operationType);
      setSelectedId(fallback);
      setActiveTab("overview");
    }
  }, [anchorKey, orderedOperations, selectedId]);

  useEffect(() => {
    if (!anchorKey) return;

    const frame = requestAnimationFrame(() => {
      const row = rowRefs.current[anchorKey];
      row?.scrollIntoView({ block: "center", behavior: "smooth" });
    });

    return () => cancelAnimationFrame(frame);
  }, [anchorKey, searchQuery, statusFilter, dateFrom, dateTo]);

  const selectedOperation = useMemo(
    () => operations.find((item) => getSelectedKey(item.id, item.operationType) === selectedId) ?? null,
    [operations, selectedId],
  );

  const participants = selectedOperation?.assigned ?? [];
  const isExerciseSelected = selectedOperation?.operationType === "exercise";

  useEffect(() => {
    if (selectedOperation?.operationType === "training" && ["attendance", "requirements", "documents"].includes(activeTab)) {
      setActiveTab("overview");
    }
  }, [activeTab, selectedOperation?.operationType]);

  useEffect(() => {
    if (!selectedOperation || selectedOperation.operationType !== "exercise") {
      setAttendanceEntries([]);
      setAttendanceSnapshot(new Map());
      setRequirements([]);
      setDocuments([]);
      return;
    }

    let cancelled = false;

    const loadExerciseData = async () => {
      try {
        const [attendance, reqs, docs] = await Promise.all([
          fetchAttendance(selectedOperation.id),
          fetchRequirements(selectedOperation.id),
          fetchDocuments(selectedOperation.id),
        ]);

        if (cancelled) return;

        const normalizedAttendance = attendance.length > 0 ? attendance : toDefaultAttendanceEntries(selectedOperation.assigned);

        setAttendanceEntries(normalizedAttendance);
        setAttendanceSnapshot(makeAttendanceSnapshot(normalizedAttendance));
        setRequirements(reqs);
        setDocuments(docs);
      } catch (error) {
        if (!cancelled) {
          toast.error(getErrorMessage(error));
        }
      }
    };

    void loadExerciseData();

    return () => {
      cancelled = true;
    };
  }, [selectedOperation]);

  const sortedParticipants = useMemo(() => {
    const list = [...participants];
    const dir = participantSortDirection === "asc" ? 1 : -1;

    return list.sort((left, right) => {
      const leftName = getDisplayText(left.personName, "Ismeretlen");
      const rightName = getDisplayText(right.personName, "Ismeretlen");
      const leftRank = getParticipantRank(left);
      const rightRank = getParticipantRank(right);
      const leftSztsz = getParticipantSztsz(left);
      const rightSztsz = getParticipantSztsz(right);
      const leftRole = getParticipantRole(left);
      const rightRole = getParticipantRole(right);
      const leftAttendance = getParticipantAttendance(left);
      const rightAttendance = getParticipantAttendance(right);

      const valueMap: Record<ParticipantSortField, [string, string]> = {
        name: [leftName, rightName],
        rank: [leftRank, rightRank],
        sztsz: [leftSztsz, rightSztsz],
        role: [leftRole, rightRole],
        attendance: [leftAttendance, rightAttendance],
      };

      const [leftValue, rightValue] = valueMap[participantSortField];
      const primary = leftValue.localeCompare(rightValue, "hu", { numeric: true, sensitivity: "base" });
      if (primary !== 0) return primary * dir;
      return leftName.localeCompare(rightName, "hu", { numeric: true, sensitivity: "base" }) * dir;
    });
  }, [participantSortDirection, participantSortField, participants]);

  const attendanceDirtyPersonIds = useMemo(() => {
    const dirty = new Set<string>();

    attendanceEntries.forEach((entry) => {
      const snapshot = attendanceSnapshot.get(entry.personId);
      if (!snapshot) {
        dirty.add(entry.personId);
        return;
      }

      if (snapshot.status !== entry.status || snapshot.note !== entry.note) {
        dirty.add(entry.personId);
      }
    });

    return dirty;
  }, [attendanceEntries, attendanceSnapshot]);

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingOperation(null);
    setFormErrors({});
  };

  const openCreateModal = () => {
    const defaultType: OperationType = selectedOperation?.operationType ?? "exercise";
    setEditingOperation(null);
    setForm(createEmptyForm(defaultType));
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = () => {
    if (!selectedOperation) return;
    setEditingOperation(selectedOperation);
    setForm({
      operationType: selectedOperation.operationType,
      name: selectedOperation.name,
      type: selectedOperation.type,
      status: selectedOperation.status,
      startDate: getDateOnly(selectedOperation.startDate),
      endDate: getDateOnly(selectedOperation.endDate),
      location: selectedOperation.location,
      organizer: selectedOperation.organizer,
      maxPersonnel: String(selectedOperation.maxPersonnel || 0),
      description: selectedOperation.description,
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    const maxPersonnel = Number(form.maxPersonnel);

    if (!form.name.trim()) nextErrors.name = "Kötelező";
    if (!form.type.trim()) nextErrors.type = "Kötelező";
    if (!form.status.trim()) nextErrors.status = "Kötelező";
    if (!form.startDate) nextErrors.startDate = "Kötelező";
    if (!form.endDate) nextErrors.endDate = "Kötelező";
    if (!form.location.trim()) nextErrors.location = "Kötelező";
    if (form.operationType === "training" && !form.organizer.trim()) nextErrors.organizer = "Kötelező";
    if (!Number.isFinite(maxPersonnel) || maxPersonnel <= 0) nextErrors.maxPersonnel = "Pozitív szám szükséges";
    if (form.startDate && form.endDate && form.endDate < form.startDate) nextErrors.endDate = "A befejezés nem lehet korábbi a kezdésnél";

    if (!getAllowedStatuses(form.operationType).includes(form.status)) {
      nextErrors.status = "Érvénytelen státusz";
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    const normalized = {
      name: form.name.trim(),
      type: form.type.trim(),
      status: form.status.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      location: form.location.trim(),
      organizer: form.organizer.trim(),
      maxPersonnel: Number(form.maxPersonnel),
      description: form.description.trim(),
    };

    setSaving(true);

    try {
      let savedKey: string | null = null;

      if (editingOperation) {
        const current = operations.find((item) => getSelectedKey(item.id, item.operationType) === getSelectedKey(editingOperation.id, editingOperation.operationType));
        if (!current) {
          throw new Error("A szerkesztett művelet már nem található.");
        }

        if (editingOperation.operationType === "exercise") {
          const payload: Exercise = {
            id: editingOperation.id,
            name: normalized.name,
            type: normalized.type,
            startDate: normalized.startDate,
            endDate: normalized.endDate,
            location: normalized.location,
            maxPersonnel: normalized.maxPersonnel,
            description: normalized.description,
            status: normalized.status as Exercise["status"],
            assigned: current.assigned as Exercise["assigned"],
          };
          const updated = await exercises.update(payload);
          savedKey = getSelectedKey(updated.id, "exercise");
          toast.success("Gyakorlat sikeresen frissítve");
        } else {
          const payload: Training = {
            id: editingOperation.id,
            name: normalized.name,
            type: normalized.type,
            startDate: normalized.startDate,
            endDate: normalized.endDate,
            location: normalized.location,
            organizer: normalized.organizer,
            qualificationId: current.qualificationId,
            maxPersonnel: normalized.maxPersonnel,
            description: normalized.description,
            status: normalized.status as Training["status"],
            assigned: current.assigned as Training["assigned"],
          };
          const updated = await trainings.update(payload);
          savedKey = getSelectedKey(updated.id, "training");
          toast.success("Kiképzés sikeresen frissítve");
        }
      } else if (form.operationType === "exercise") {
        const payload: Omit<Exercise, "id"> = {
          name: normalized.name,
          type: normalized.type,
          startDate: normalized.startDate,
          endDate: normalized.endDate,
          location: normalized.location,
          maxPersonnel: normalized.maxPersonnel,
          description: normalized.description,
          status: normalized.status as Exercise["status"],
          assigned: [],
        };
        const created = await exercises.add(payload);
        savedKey = getSelectedKey(created.id, "exercise");
        toast.success("Gyakorlat sikeresen létrehozva");
      } else {
        const payload: Omit<Training, "id"> = {
          name: normalized.name,
          type: normalized.type,
          startDate: normalized.startDate,
          endDate: normalized.endDate,
          location: normalized.location,
          organizer: normalized.organizer,
          qualificationId: "",
          maxPersonnel: normalized.maxPersonnel,
          description: normalized.description,
          status: normalized.status as Training["status"],
          assigned: [],
        };
        const created = await trainings.add(payload);
        savedKey = getSelectedKey(created.id, "training");
        toast.success("Kiképzés sikeresen létrehozva");
      }

      await refreshOperations();
      if (savedKey) {
        setSelectedId(savedKey);
        setActiveTab("overview");
      }
      closeModal();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleParticipantSort = (field: ParticipantSortField) => {
    setParticipantSortField((currentField) => {
      if (currentField === field) {
        setParticipantSortDirection((currentDirection) => (currentDirection === "asc" ? "desc" : "asc"));
        return currentField;
      }

      setParticipantSortDirection("asc");
      return field;
    });
  };

  const handleAttendanceChange = (personId: string, field: "status" | "note", value: string) => {
    setAttendanceEntries((current) => current.map((entry) => {
      if (entry.personId !== personId) return entry;

      if (field === "status") {
        return { ...entry, status: value as AttendanceStatus };
      }

      return { ...entry, note: value };
    }));
  };

  const handleAttendanceSave = async () => {
    if (!selectedOperation || selectedOperation.operationType !== "exercise") return;

    const dirtyEntries = attendanceEntries.filter((entry) => attendanceDirtyPersonIds.has(entry.personId));
    if (dirtyEntries.length === 0) return;

    const payload: AttendanceEntryUpdate[] = dirtyEntries.map((entry) => ({
      personId: entry.personId,
      personName: entry.personName,
      status: entry.status,
      note: entry.note,
    }));

    setAttendanceSaving(true);

    try {
      const updated = await updateAttendance(selectedOperation.id, payload);
      const next = updated.length > 0 ? updated : attendanceEntries;
      setAttendanceEntries(next);
      setAttendanceSnapshot(makeAttendanceSnapshot(next));
      toast.success("Jelenléti adatok mentve");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setAttendanceSaving(false);
    }
  };

  const handleCreateRequirement = async (payload: Omit<MaterialRequirement, "id" | "operationId">) => {
    if (!selectedOperation || selectedOperation.operationType !== "exercise") return;
    setRequirementsBusy(true);
    try {
      const created = await createRequirement(selectedOperation.id, payload);
      setRequirements((current) => [...current, created]);
      toast.success("Anyagigény hozzáadva");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setRequirementsBusy(false);
    }
  };

  const handleUpdateRequirement = async (id: string, payload: Partial<Omit<MaterialRequirement, "id" | "operationId">>) => {
    if (!selectedOperation || selectedOperation.operationType !== "exercise") return;
    setRequirementsBusy(true);
    try {
      const updated = await updateRequirement(selectedOperation.id, id, payload);
      setRequirements((current) => current.map((item) => (item.id === id ? updated : item)));
      toast.success("Anyagigény frissítve");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setRequirementsBusy(false);
    }
  };

  const executeDeleteRequirement = async (id: string) => {
    if (!selectedOperation || selectedOperation.operationType !== "exercise") return;
    setRequirementsBusy(true);
    try {
      await deleteRequirement(selectedOperation.id, id);
      setRequirements((current) => current.filter((item) => item.id !== id));
      toast.success("Anyagigény törölve");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setRequirementsBusy(false);
    }
  };

  const handleDeleteRequirement = async (id: string) => {
    setPendingDelete({ kind: "requirement", id });
  };

  const handleUploadDocument = async (file: File, title: string) => {
    if (!selectedOperation || selectedOperation.operationType !== "exercise") return;
    setDocumentsBusy(true);
    try {
      const created = await uploadDocument(selectedOperation.id, file, title);
      setDocuments((current) => [created, ...current]);
      toast.success("Dokumentum feltöltve");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDocumentsBusy(false);
    }
  };

  const executeDeleteDocument = async (docId: string) => {
    if (!selectedOperation || selectedOperation.operationType !== "exercise") return;
    setDocumentsBusy(true);
    try {
      await deleteDocument(selectedOperation.id, docId);
      setDocuments((current) => current.filter((item) => item.id !== docId));
      toast.success("Dokumentum törölve");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDocumentsBusy(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    const item = documents.find((doc) => doc.id === docId);
    setPendingDelete({ kind: "document", id: docId, name: item?.originalName ?? "ismeretlen fájl" });
  };

  const handleDownloadDocument = async (docId: string, originalName: string) => {
    if (!selectedOperation || selectedOperation.operationType !== "exercise") return;
    setDocumentsBusy(true);
    try {
      await downloadDocument(selectedOperation.id, docId, originalName);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDocumentsBusy(false);
    }
  };

  const closePreview = () => {
    setPreview((current) => {
      if (current?.url) {
        window.URL.revokeObjectURL(current.url);
      }
      return null;
    });
  };

  const handleViewDocument = async (docId: string) => {
    if (!selectedOperation || selectedOperation.operationType !== "exercise") return;
    setDocumentsBusy(true);
    try {
      const response = await viewDocument(selectedOperation.id, docId);
      const target = documents.find((doc) => doc.id === docId);
      setPreview((current) => {
        if (current?.url) {
          window.URL.revokeObjectURL(current.url);
        }

        return {
          open: true,
          url: response.url,
          mimeType: response.mimeType,
          title: target?.title || target?.originalName || "Dokumentum",
        };
      });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDocumentsBusy(false);
    }
  };

  useEffect(() => {
    return () => {
      if (preview?.url) {
        window.URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview?.url]);

  const confirmDeleteMessage = useMemo(() => {
    if (!pendingDelete) return "Biztosan törlöd?";
    if (pendingDelete.kind === "requirement") return "Biztosan törlöd az anyagigényt?";
    return `Biztosan törlöd a dokumentumot: ${pendingDelete.name}?`;
  }, [pendingDelete]);

  const formStatusOptions = getAllowedStatuses(form.operationType);

  return (
    <div>
      <h1 className="text-2xl font-bold font-rajdhani uppercase tracking-military mb-6 text-foreground">Műveletek</h1>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <section className="bg-card border border-border p-4" style={{ borderRadius: "2px" }}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm uppercase tracking-military font-mono text-primary">Kombinált lista</h2>
              <p className="text-xs text-muted-foreground font-mono">Gyakorlatok és kiképzések egy nézetben.</p>
            </div>
            <div className="inline-flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <Users className="w-4 h-4 text-primary" />
              <span>{orderedOperations.length} találat</span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 mb-4">
            <label className="block md:col-span-2 xl:col-span-4">
              <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Keresés</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Megnevezés, típus, helyszín..."
                  className="w-full bg-input border border-border pl-10 pr-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                  style={{ borderRadius: "2px" }}
                />
              </div>
            </label>

            <label className="block">
              <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Státusz</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full bg-input border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                style={{ borderRadius: "2px" }}
              >
                <option value="Összes">Összes</option>
                {detectedStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Kezdettől</span>
              <DatePickerInput value={dateFrom} onChange={setDateFrom} className="text-sm" />
            </label>

            <label className="block">
              <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Befejezésig</span>
              <DatePickerInput value={dateTo} onChange={setDateTo} className="text-sm" />
            </label>
          </div>

          <div className="border border-border overflow-auto max-h-[70vh]" style={{ borderRadius: "2px" }}>
            <table className="w-full mil-table">
              <thead>
                <tr>
                  <th>Megnevezés</th>
                  <th>Típus</th>
                  <th>Időszak</th>
                </tr>
              </thead>
              <tbody>
                {loading && operations.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-muted-foreground font-mono">Betöltés...</td>
                  </tr>
                )}
                {!loading && orderedOperations.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-muted-foreground font-mono">Nincs a szűrésnek megfelelő művelet.</td>
                  </tr>
                )}
                {orderedOperations.map((item) => {
                  const rowKey = getSelectedKey(item.id, item.operationType);
                  const selected = rowKey === selectedId;
                  const isAnchor = rowKey === anchorKey;
                  return (
                    <tr
                      key={rowKey}
                      ref={(node) => {
                        rowRefs.current[rowKey] = node;
                      }}
                      className={`cursor-pointer transition-colors ${selected ? "bg-secondary/60" : "hover:bg-secondary/30"}`}
                      onClick={() => {
                        setSelectedId(rowKey);
                        setActiveTab("overview");
                      }}
                    >
                      <td>
                        <div className="font-semibold text-foreground">{item.name}</div>
                        <div className="text-[11px] text-muted-foreground">{item.location || "Nincs helyszín"}</div>
                        {isAnchor && (
                          <div className="text-[10px] uppercase tracking-military text-primary font-mono mt-1">Mai horgony</div>
                        )}
                      </td>
                      <td>
                        <div className="text-xs uppercase tracking-military font-mono text-primary">
                          {item.operationType === "exercise" ? "GYAKORLAT" : "KIKÉPZÉS"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{item.type || "Nincs altípus"}</div>
                      </td>
                      <td className="text-xs font-mono text-primary">{item.startDate} → {item.endDate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-card border border-border p-4" style={{ borderRadius: "2px" }}>
          {canEdit && (
            <div className="flex items-center justify-end mb-4">
              <button
                type="button"
                onClick={openCreateModal}
                className="btn-mil-primary flex items-center gap-2 text-xs"
              >
                <Plus className="w-4 h-4" />
                Új művelet
              </button>
            </div>
          )}

          {!selectedOperation && (
            <div className="min-h-[320px] flex items-center justify-center text-center">
              <div>
                <p className="text-sm font-semibold text-foreground mb-2">Nincs kiválasztott művelet</p>
                <p className="text-xs text-muted-foreground font-mono">Válassz egy gyakorlatot vagy kiképzést a bal oldali listából.</p>
              </div>
            </div>
          )}

          {selectedOperation && (
            <>
              <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 text-xs uppercase tracking-military font-mono bg-primary/15 text-primary" style={{ borderRadius: "2px" }}>
                      {selectedOperation.operationType === "exercise" ? "GYAKORLAT" : "KIKÉPZÉS"}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs uppercase tracking-military font-mono ${statusClass[selectedOperation.status] ?? "badge-planned"}`} style={{ borderRadius: "2px" }}>
                      {selectedOperation.status}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold font-rajdhani uppercase tracking-military text-foreground">{selectedOperation.name}</h2>
                  <p className="text-sm text-muted-foreground mt-2">{selectedOperation.description || "Nincs részletes leírás megadva."}</p>
                </div>

                <div className="text-right text-xs font-mono text-muted-foreground">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={openEditModal}
                      className="btn-mil-secondary flex items-center gap-2 text-xs ml-auto mb-2"
                    >
                      <Pencil className="w-4 h-4" />
                      Szerkesztés
                    </button>
                  )}
                  <div>{selectedOperation.type || "Általános"}</div>
                  <div>{selectedOperation.id}</div>
                </div>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4 flex flex-wrap h-auto">
                  <TabsTrigger value="overview">Áttekintés</TabsTrigger>
                  <TabsTrigger value="participants">Jelenlévők</TabsTrigger>
                  {isExerciseSelected && <TabsTrigger value="attendance">Jelenlét</TabsTrigger>}
                  {isExerciseSelected && <TabsTrigger value="requirements">Anyagigény</TabsTrigger>}
                  {isExerciseSelected && <TabsTrigger value="documents">Dokumentumok</TabsTrigger>}
                </TabsList>

                <TabsContent value="overview" className="space-y-4 mt-0">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="border border-border p-3" style={{ borderRadius: "2px" }}>
                      <p className="text-[10px] uppercase tracking-military text-muted-foreground mb-1">Típus</p>
                      <p className="text-sm font-semibold text-primary">{selectedOperation.type || "Általános"}</p>
                    </div>

                    <div className="border border-border p-3" style={{ borderRadius: "2px" }}>
                      <p className="text-[10px] uppercase tracking-military text-muted-foreground mb-1">Státusz</p>
                      <p className="text-sm font-semibold text-foreground">{selectedOperation.status}</p>
                    </div>

                    <div className="border border-border p-3" style={{ borderRadius: "2px" }}>
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Users className="w-4 h-4 text-primary" />
                        <p className="text-[10px] uppercase tracking-military">Létszám</p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{participants.length} / {selectedOperation.maxPersonnel || 0} fő</p>
                    </div>

                    <div className="border border-border p-3" style={{ borderRadius: "2px" }}>
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Calendar className="w-4 h-4 text-primary" />
                        <p className="text-[10px] uppercase tracking-military">Időszak</p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{selectedOperation.startDate} → {selectedOperation.endDate}</p>
                    </div>

                    <div className="border border-border p-3" style={{ borderRadius: "2px" }}>
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <MapPin className="w-4 h-4 text-primary" />
                        <p className="text-[10px] uppercase tracking-military">Helyszín</p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{selectedOperation.location || "Nincs megadva"}</p>
                    </div>

                    <div className="border border-border p-3" style={{ borderRadius: "2px" }}>
                      <p className="text-[10px] uppercase tracking-military text-muted-foreground mb-1">Szervező</p>
                      <p className="text-sm font-semibold text-foreground">{selectedOperation.organizer || "Nincs megadva"}</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="participants" className="space-y-4 mt-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="text-sm uppercase tracking-military font-mono text-primary">Jelenlévők</h3>
                      <p className="text-xs text-muted-foreground font-mono">A forrás rekord assigned adatai alapján.</p>
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">Összesen: {participants.length} fő</div>
                  </div>

                  <div className="border border-border overflow-hidden" style={{ borderRadius: "2px" }}>
                    <table className="w-full mil-table">
                      <thead>
                        <tr>
                          <th>
                            <button type="button" className="text-left" onClick={() => handleParticipantSort("name")}>
                              Név{getSortIndicator(participantSortField === "name", participantSortDirection)}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="text-left" onClick={() => handleParticipantSort("rank")}>
                              Rendfokozat{getSortIndicator(participantSortField === "rank", participantSortDirection)}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="text-left" onClick={() => handleParticipantSort("sztsz")}>
                              SZTSZ{getSortIndicator(participantSortField === "sztsz", participantSortDirection)}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="text-left" onClick={() => handleParticipantSort("role")}>
                              Szerep{getSortIndicator(participantSortField === "role", participantSortDirection)}
                            </button>
                          </th>
                          <th>
                            <button type="button" className="text-left" onClick={() => handleParticipantSort("attendance")}>
                              Jelenlét{getSortIndicator(participantSortField === "attendance", participantSortDirection)}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedParticipants.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-muted-foreground font-mono">Ehhez a művelethez nincs hozzárendelt résztvevő.</td>
                          </tr>
                        )}
                        {sortedParticipants.map((participant, index) => {
                          const personId = getDisplayText(participant.personId, `participant-${index}`);
                          return (
                            <tr key={`${personId}-${index}`}>
                              <td className="font-semibold text-foreground">{getDisplayText(participant.personName, "Ismeretlen")}</td>
                              <td>{getParticipantRank(participant)}</td>
                              <td className="font-mono text-primary">{getParticipantSztsz(participant)}</td>
                              <td>{getParticipantRole(participant)}</td>
                              <td>{getParticipantAttendance(participant)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {isExerciseSelected && (
                  <TabsContent value="attendance" className="space-y-4 mt-0">
                    <AttendanceGrid
                      entries={attendanceEntries}
                      canEdit={canEdit}
                      saving={attendanceSaving}
                      dirtyPersonIds={attendanceDirtyPersonIds}
                      onChange={handleAttendanceChange}
                      onSave={() => void handleAttendanceSave()}
                    />
                  </TabsContent>
                )}

                {isExerciseSelected && (
                  <TabsContent value="requirements" className="space-y-4 mt-0">
                    <RequirementsList
                      items={requirements}
                      canEdit={canEdit}
                      busy={requirementsBusy}
                      onCreate={handleCreateRequirement}
                      onUpdate={handleUpdateRequirement}
                      onDelete={handleDeleteRequirement}
                    />
                  </TabsContent>
                )}

                {isExerciseSelected && (
                  <TabsContent value="documents" className="space-y-4 mt-0">
                    <DocumentList
                      items={documents}
                      canEdit={canEdit}
                      busy={documentsBusy}
                      onUpload={handleUploadDocument}
                      onDelete={handleDeleteDocument}
                      onDownload={handleDownloadDocument}
                      onView={handleViewDocument}
                    />
                  </TabsContent>
                )}
              </Tabs>
            </>
          )}
        </section>
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingOperation ? "Művelet szerkesztése" : "Új művelet"}
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Megnevezés</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full bg-input border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                style={{ borderRadius: "2px" }}
              />
              {formErrors.name && <p className="text-xs text-destructive mt-1">{formErrors.name}</p>}
            </label>

            <label className="block">
              <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Altípus</span>
              <input
                value={form.type}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
                className="w-full bg-input border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                style={{ borderRadius: "2px" }}
              />
              {formErrors.type && <p className="text-xs text-destructive mt-1">{formErrors.type}</p>}
            </label>

            <label className="block">
              <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Státusz</span>
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                className="w-full bg-input border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                style={{ borderRadius: "2px" }}
              >
                {formStatusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              {formErrors.status && <p className="text-xs text-destructive mt-1">{formErrors.status}</p>}
            </label>

            <label className="block">
              <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Kezdés</span>
              <DatePickerInput value={form.startDate} onChange={(nextValue) => setForm((current) => ({ ...current, startDate: nextValue }))} />
              {formErrors.startDate && <p className="text-xs text-destructive mt-1">{formErrors.startDate}</p>}
            </label>

            <label className="block">
              <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Befejezés</span>
              <DatePickerInput value={form.endDate} onChange={(nextValue) => setForm((current) => ({ ...current, endDate: nextValue }))} />
              {formErrors.endDate && <p className="text-xs text-destructive mt-1">{formErrors.endDate}</p>}
            </label>

            <label className="block">
              <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Helyszín</span>
              <input
                value={form.location}
                onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                className="w-full bg-input border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                style={{ borderRadius: "2px" }}
              />
              {formErrors.location && <p className="text-xs text-destructive mt-1">{formErrors.location}</p>}
            </label>

            {form.operationType === "training" && (
              <label className="block">
                <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Szervező</span>
                <input
                  value={form.organizer}
                  onChange={(event) => setForm((current) => ({ ...current, organizer: event.target.value }))}
                  className="w-full bg-input border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                  style={{ borderRadius: "2px" }}
                />
                {formErrors.organizer && <p className="text-xs text-destructive mt-1">{formErrors.organizer}</p>}
              </label>
            )}

            <label className="block">
              <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Max. létszám</span>
              <input
                type="number"
                min={1}
                step={1}
                value={form.maxPersonnel}
                onChange={(event) => setForm((current) => ({ ...current, maxPersonnel: event.target.value }))}
                className="w-full bg-input border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                style={{ borderRadius: "2px" }}
              />
              {formErrors.maxPersonnel && <p className="text-xs text-destructive mt-1">{formErrors.maxPersonnel}</p>}
            </label>

            <label className="block md:col-span-2">
              <span className="block text-[10px] uppercase tracking-military text-muted-foreground mb-1">Leírás</span>
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                rows={4}
                className="w-full bg-input border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                style={{ borderRadius: "2px" }}
              />
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeModal} className="btn-mil-secondary text-xs" disabled={saving}>
              Mégse
            </button>
            <button type="button" onClick={() => void handleSave()} className="btn-mil-primary text-xs" disabled={saving}>
              {saving ? "Mentés..." : "Mentés"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={preview?.open ?? false}
        onClose={closePreview}
        title={preview?.title ?? "Dokumentum előnézet"}
        wide
      >
        <div className="space-y-3">
          {preview && preview.mimeType.startsWith("image/") && (
            <img src={preview.url} alt={preview.title} className="w-full max-h-[70vh] object-contain border border-border" style={{ borderRadius: "2px" }} />
          )}

          {preview && preview.mimeType.includes("pdf") && (
            <iframe title={preview.title} src={preview.url} className="w-full h-[70vh] border border-border" style={{ borderRadius: "2px" }} />
          )}

          {preview && !preview.mimeType.startsWith("image/") && !preview.mimeType.includes("pdf") && (
            <div className="border border-border p-4" style={{ borderRadius: "2px" }}>
              <p className="text-sm text-muted-foreground mb-3">Ehhez a fájltípushoz nincs beépített előnézet.</p>
              <a href={preview.url} target="_blank" rel="noreferrer" className="btn-mil-primary text-xs inline-flex">
                Megnyitás új lapon
              </a>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        message={confirmDeleteMessage}
        onConfirm={() => {
          if (!pendingDelete) return;

          if (pendingDelete.kind === "requirement") {
            void executeDeleteRequirement(pendingDelete.id);
            return;
          }

          void executeDeleteDocument(pendingDelete.id);
        }}
      />
    </div>
  );
}
