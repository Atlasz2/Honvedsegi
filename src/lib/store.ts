import {
  ActivityLogEntry,
  Announcement,
  AuthToken,
  Equipment,
  Exercise,
  Person,
  PersonLite,
  PersonHistoryEntry,
  PersonnelQualification,
  QualificationAlert,
  QualificationStat,
  QualificationType,
  Supply,
  Training,
  Series,
  AppEvent,
  AttendanceDay,
  AttendanceMark,
  AttendanceStatus,
  MaterialRequirement,
  OperationAttendanceEntry,
  OperationDocument,
  OperationTreeNode,
  User,
  Vehicle,
} from './types';

const defaultApiBase = "/api";
const API_BASE = import.meta.env.VITE_API_URL || defaultApiBase;
const TOKEN_KEY = 'honved_auth_token';

type StoredSession = {
  token: string;
  user: AuthToken;
};

type BackendUser = {
  username: string;
  display_name: string;
  role: User['role'];
  active: boolean;
  last_login?: string | null;
};

type PersonnelPagedResult = {
  items: Person[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ImportIssue = {
  line: number;
  message: string;
};

export type ImportEntity = "personnel" | "exercises";

export type ImportPreviewItem = {
  line: number;
  action: "create" | "update" | "skip";
  key: string;
  name: string;
  enabled: boolean;
  data: Record<string, string>;
  rawData: Record<string, string>;
  unknownData: Record<string, string>;
  issues: string[];
};

export type ImportMissingPerson = {
  id: string;
  name: string;
  sztsz: string;
  unit: string;
  status: string;
};

export type ImportPreviewResult = {
  draftId: string;
  entity: ImportEntity;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  issues: ImportIssue[];
  items: ImportPreviewItem[];
  /** Fejlécek, amiket a rendszer nem tudott mezőhöz rendelni — a személy „Importált adatok" részébe kerülnek. */
  unknownColumns: string[];
  /** Csak személyzetnél: a nyilvántartásban vannak, de a fájlból hiányoznak. */
  missingCount: number;
  missing: ImportMissingPerson[];
};

export type ImportDraftUpdateItem = {
  line: number;
  enabled: boolean;
  data: Record<string, string>;
};

export type ImportConfirmResult = {
  draftId: string;
  entity: ImportEntity;
  applied: boolean;
  created: number;
  updated: number;
  skipped: number;
};

function getSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed.user.expiry <= Date.now()) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

function getAccessToken() {
  return getSession()?.token ?? null;
}

function toUser(raw: BackendUser): User {
  return {
    username: raw.username,
    displayName: raw.display_name,
    role: raw.role,
    active: raw.active,
    lastLogin: raw.last_login || undefined,
  };
}

async function request<T>(path: string, init: RequestInit = {}, includeAuth = true): Promise<T> {
  const headers = new Headers(init.headers || {});
  const isFormDataBody = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (!headers.has('Content-Type') && init.body && !isFormDataBody) {
    headers.set('Content-Type', 'application/json');
  }
  if (includeAuth) {
    const token = getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (response.status === 204) {
    return undefined as T;
  }

  const raw = await response.text();
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
    }

    const detail =
      typeof data === 'object' && data !== null && 'detail' in data
        ? String((data as { detail?: unknown }).detail ?? '')
        : typeof data === 'string'
          ? data
          : '';

    throw new Error(detail || `A kérés sikertelen volt (${response.status})`);
  }

  return data as T;
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Váratlan hiba történt';
}

export function getToken(): AuthToken | null {
  return getSession()?.user ?? null;
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function logoutSession() {
  try {
    await request('/auth/logout', { method: 'POST' });
  } catch {
    // Ignore logout errors and clear the local session anyway.
  } finally {
    clearToken();
  }
}

export async function login(username: string, password: string): Promise<{ success: boolean; error?: string; token?: AuthToken }> {
  const normalizedUsername = username.trim();
  try {
    const result = await request<{ token: string; user: AuthToken }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username: normalizedUsername, password }),
      },
      false,
    );
    localStorage.setItem(TOKEN_KEY, JSON.stringify(result));
    return { success: true, token: result.user };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

function createCrud<T extends { id: string }, TCreate extends Omit<T, 'id'> = Omit<T, 'id'>>(basePath: string) {
  return {
    getAll: () => request<T[]>(basePath),
    add: (payload: TCreate) => request<T>(basePath, { method: 'POST', body: JSON.stringify(payload) }),
    update: (payload: T) => request<T>(`${basePath}/${payload.id}`, { method: 'PUT', body: JSON.stringify({ ...payload, id: undefined }) }),
    remove: (id: string) => request<void>(`${basePath}/${id}`, { method: 'DELETE' }),
  };
}

export const personnel = {
  ...createCrud<Person>('/personnel'),
  /** Könnyű lista a beosztó/kiadó felületeknek — a teljes akta helyett. */
  getLite: () => request<PersonLite[]>('/personnel/lite'),
  getPaged: (params: { page: number; pageSize: number; search?: string; unit?: string; status?: string; qualification?: string; sortBy?: string; sortDir?: 'asc' | 'desc' }) => {
    const query = new URLSearchParams({
      page: String(params.page),
      page_size: String(params.pageSize),
    });
    if (params.search?.trim()) query.set('q', params.search.trim());
    if (params.unit?.trim() && params.unit !== 'Összes') query.set('unit', params.unit.trim());
    if (params.status?.trim() && params.status !== 'Összes') query.set('status_filter', params.status.trim());
    if (params.qualification?.trim()) query.set('qualification', params.qualification.trim());
    if (params.sortBy?.trim()) query.set('sort_by', params.sortBy.trim());
    if (params.sortDir) query.set('sort_dir', params.sortDir);
    return request<PersonnelPagedResult>(`/personnel/paged?${query.toString()}`);
  },
  getHistory: (id: string) => request<PersonHistoryEntry[]>(`/personnel/${id}/history`),
};

export type ReferenceData = {
  units: string[];
  personStatuses: string[];
  ranks: { name: string; short: string }[];
};

/**
 * Törzsadatok a backendből. Korábban az egységek, rendfokozatok és státuszok a
 * Personnel.tsx-ben voltak hardkódolva, a seedtől függetlenül — így a kettő el
 * tudott (és el is szokott) csúszni egymástól.
 */
export const reference = {
  get: () => request<ReferenceData>('/reference'),
};

export const qualificationTypes = {
  getAll: () => request<QualificationType[]>('/qualifications/types'),
  create: (payload: Omit<QualificationType, 'id'>) =>
    request<QualificationType>('/qualifications/types', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Omit<QualificationType, 'id'>) =>
    request<QualificationType>(`/qualifications/types/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (id: string) => request<void>(`/qualifications/types/${id}`, { method: 'DELETE' }),
};

export const personnelQualifications = {
  getForPerson: (personId: string) =>
    request<PersonnelQualification[]>(`/qualifications/personnel/${personId}`),
  add: (personId: string, payload: {
    personnelId: string; qualTypeId: string; earnedDate: string;
    expiryDate?: string | null; sourceEventId?: string | null;
    sourceEventType?: string | null; notes?: string;
  }) => request<PersonnelQualification>(`/qualifications/personnel/${personId}`, {
    method: 'POST', body: JSON.stringify(payload),
  }),
  update: (personId: string, qualId: string, payload: {
    earnedDate: string; expiryDate?: string | null;
    sourceEventId?: string | null; sourceEventType?: string | null; notes?: string;
  }) => request<PersonnelQualification>(`/qualifications/personnel/${personId}/${qualId}`, {
    method: 'PUT', body: JSON.stringify(payload),
  }),
  remove: (personId: string, qualId: string) =>
    request<void>(`/qualifications/personnel/${personId}/${qualId}`, { method: 'DELETE' }),
};

export const qualificationAlerts = {
  getAlerts: (daysAhead = 60) =>
    request<QualificationAlert[]>(`/qualifications/alerts?days_ahead=${daysAhead}`),
  getStats: () => request<QualificationStat[]>('/qualifications/stats'),
};

export type LocationConflict = {
  eventType: 'exercise' | 'training' | 'event';
  eventId: string;
  eventName: string;
  startDate: string;
  endDate: string;
  status: string;
};

export function checkLocationConflicts(
  location: string,
  startDate: string,
  endDate: string,
  excludeType?: string,
  excludeId?: string,
): Promise<LocationConflict[]> {
  const params = new URLSearchParams({ location, start_date: startDate, end_date: endDate });
  if (excludeType) params.set('exclude_type', excludeType);
  if (excludeId) params.set('exclude_id', excludeId);
  return request<LocationConflict[]>(`/conflicts?${params.toString()}`);
}
export const exercises = createCrud<Exercise>('/exercises');
export const trainings = createCrud<Training>('/trainings');

export type SeriesMatrix = {
  operations: { id: string; name: string; level: string; source: string; startDate: string }[];
  rows: { personnelId: string; name: string; completed: string[] }[];
};

export const series = {
  getAll: () => request<Series[]>('/series'),
  create: (payload: { name: string; description?: string }) =>
    request<Series>('/series', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: { name: string; description?: string }) =>
    request<Series>(`/series/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (id: string) => request<void>(`/series/${id}`, { method: 'DELETE' }),
  matrix: (id: string) => request<SeriesMatrix>(`/series/${id}/matrix`),
};

export type UnexcusedAlert = { personnelId: string; name: string; rank: string; unit: string; date: string; note: string };
export type ReadinessGap = { personnelId: string; name: string; rank: string; unit: string };

export type LeaveMinimumItem = {
  personnelId: string; name: string; rank: string; unit: string;
  takenDays: number; missingDays: number;
};
/** Éves kötelezettség határideje (dec. 31.) és az előrejelzés állapota. */
export type YearDeadline = { deadline: string; daysLeft: number; warnDays: number; isOverdue: boolean; isDueSoon: boolean };
export type LeaveMinimumResult = YearDeadline & { year: number; minDays: number; items: LeaveMinimumItem[] };
export type ServiceMinimumItem = {
  personnelId: string; name: string; rank: string; unit: string;
  servedDays: number; missingDays: number;
};
export type ServiceMinimumResult = YearDeadline & { year: number; minDays: number; items: ServiceMinimumItem[] };
export type BasicTrainingItem = {
  personnelId: string; name: string; rank: string; unit: string;
  joinDate: string; deadline: string | null; daysLeft: number | null;
  isOverdue: boolean; isDueSoon: boolean;
  completedModules: number; totalModules: number; missingModules: string[];
};
export type BasicTrainingResult = {
  modules: { id: string; name: string }[];
  deadlineDays: number;
  warnDays: number;
  items: BasicTrainingItem[];
};

export const alerts = {
  unexcused: (days = 30) => request<UnexcusedAlert[]>(`/alerts/unexcused?days=${days}`),
  readinessGaps: () => request<ReadinessGap[]>('/alerts/readiness-gaps'),
  leaveMinimum: (year?: number) => request<LeaveMinimumResult>(`/alerts/leave-minimum${year ? `?year=${year}` : ''}`),
  basicTraining: () => request<BasicTrainingResult>('/alerts/basic-training'),
  serviceMinimum: (year?: number) => request<ServiceMinimumResult>(`/alerts/service-minimum${year ? `?year=${year}` : ''}`),
};

export type ApplicantMatch = { line: string; personnelId: string; name: string; sztsz: string };
export type ApplicantPasteResult = {
  added: ApplicantMatch[];
  alreadyPresent: ApplicantMatch[];
  unmatched: string[];
  ambiguous: { line: string; candidates: ApplicantMatch[] }[];
};
export type CampaignRow = {
  participantId: string; personnelId: string; name: string; rank: string; unit: string; sztsz: string;
  personStatus: string; status: string; role: string; eligible: boolean; missing: string[];
};
export type CampaignPlan = {
  eventType: string; eventId: string; eventName: string; startDate: string; endDate: string; location: string;
  requirements: string[]; rows: CampaignRow[];
};

type CampaignSource = 'exercise' | 'training';

export const campaign = {
  pasteApplicants: (source: CampaignSource, eventId: string, text: string) =>
    request<ApplicantPasteResult>(`/campaign/${source}/${eventId}/applicants`, { method: 'POST', body: JSON.stringify({ text }) }),
  plan: (source: CampaignSource, eventId: string) => request<CampaignPlan>(`/campaign/${source}/${eventId}/plan`),
  exportXlsx: (source: CampaignSource, eventId: string) =>
    downloadBlob(`/campaign/${source}/${eventId}/plan/export.xlsx`, 'kampanyterv.xlsx'),
  exportPdf: (source: CampaignSource, eventId: string) =>
    downloadBlob(`/campaign/${source}/${eventId}/plan/export.pdf`, 'kampanyterv.pdf'),
};

export type PersonDocument = {
  id: string;
  personnelId: string;
  category: string;
  name: string;
  identifier: string;
  issuedDate: string;
  expiryDate: string | null;
  notes: string;
  isExpired: boolean;
  daysUntilExpiry: number | null;
};

export type DocumentPayload = {
  category: string;
  name: string;
  identifier?: string;
  issuedDate?: string;
  expiryDate?: string | null;
  notes?: string;
};

export type ExpiringDocument = {
  documentId: string;
  personnelId: string;
  name: string;
  rank: string;
  unit: string;
  category: string;
  documentName: string;
  expiryDate: string | null;
  isExpired: boolean;
  daysUntilExpiry: number;
};

export const documents = {
  getForPerson: (personId: string) => request<PersonDocument[]>(`/documents/personnel/${personId}`),
  add: (personId: string, payload: DocumentPayload) =>
    request<PersonDocument>(`/documents/personnel/${personId}`, { method: 'POST', body: JSON.stringify(payload) }),
  update: (docId: string, payload: DocumentPayload) =>
    request<PersonDocument>(`/documents/${docId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (docId: string) => request<void>(`/documents/${docId}`, { method: 'DELETE' }),
  expiring: (days = 60) => request<ExpiringDocument[]>(`/documents/expiring?days=${days}`),
};
export const events = createCrud<AppEvent>('/events');
export const announcements = createCrud<Announcement>('/announcements',);

export const equipment = {
  ...createCrud<Equipment>('/equipment'),
  checkout: (id: string, personId: string, note: string) => request<Equipment>(`/equipment/${id}/checkout`, { method: 'POST', body: JSON.stringify({ personId, note }) }),
  returnItem: (id: string) => request<Equipment>(`/equipment/${id}/return`, { method: 'POST' }),
};

export const supplies = {
  ...createCrud<Supply>('/supplies'),
  recordMovement: (id: string, type: Supply['movements'][number]['type'], quantity: number, note: string) =>
    request<Supply>(`/supplies/${id}/movements`, { method: 'POST', body: JSON.stringify({ type, quantity, note }) }),
};

export const vehicles = {
  ...createCrud<Vehicle>('/vehicles'),
  assign: (id: string, personId: string) => request<Vehicle>(`/vehicles/${id}/assign`, { method: 'POST', body: JSON.stringify({ personId }) }),
  returnItem: (id: string) => request<Vehicle>(`/vehicles/${id}/return`, { method: 'POST' }),
};

export const users = {
  getAll: async () => {
    const result = await request<BackendUser[]>('/users');
    return result.map(toUser);
  },
  create: async (payload: Required<Pick<User, 'username' | 'displayName' | 'role' | 'active'>> & { password: string }) => {
    const result = await request<BackendUser>('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: payload.username,
        password: payload.password,
        display_name: payload.displayName,
        role: payload.role,
        active: payload.active,
      }),
    });
    return toUser(result);
  },
  update: async (username: string, payload: Pick<User, 'displayName' | 'role' | 'active'> & { password?: string }) => {
    const result = await request<BackendUser>(`/users/${username}`, {
      method: 'PUT',
      body: JSON.stringify({
        display_name: payload.displayName,
        role: payload.role,
        active: payload.active,
        password: payload.password || null,
      }),
    });
    return toUser(result);
  },
  remove: (username: string) => request<void>(`/users/${username}`, { method: 'DELETE' }),
};

export type SystemStatus = {
  time: string;
  database: { path: string; sizeBytes: number };
  lastBackup: { name: string; sizeBytes: number; modifiedAt: string; count: number } | null;
  sessions: { active: number; expired: number };
  users: { byRole: Record<string, number> };
  lockedAccounts: number;
};

/**
 * Karbantartás — kizárólag a god (dev_master) éri el. Nem-god hívónál a backend
 * semleges 403-at ad, ezért a felület ezt a szekciót csak god esetén jeleníti meg.
 */
export const maintenance = {
  status: () => request<SystemStatus>('/maintenance/status'),
  purgeSessions: () => request<{ removed: number }>('/maintenance/sessions/purge', { method: 'POST' }),
  forceLogout: (username: string) => request<{ revoked: number }>(`/maintenance/users/${username}/logout`, { method: 'POST' }),
  unlock: (username: string) => request<{ status: string }>(`/maintenance/users/${username}/unlock`, { method: 'POST' }),
};

export type ActivityLogQuery = { dateFrom?: string; dateTo?: string; user?: string; module?: string; q?: string; limit?: number };

export const activityLog = {
  getAll: (params: ActivityLogQuery = {}) => {
    const query = new URLSearchParams();
    if (params.dateFrom) query.set('date_from', params.dateFrom);
    if (params.dateTo) query.set('date_to', params.dateTo);
    if (params.user) query.set('user', params.user);
    if (params.module) query.set('module', params.module);
    if (params.q) query.set('q', params.q);
    if (params.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return request<ActivityLogEntry[]>(`/activity-log${qs ? `?${qs}` : ''}`);
  },
  facets: () => request<{ users: string[]; modules: string[] }>('/activity-log/facets'),
  add: (payload: Omit<ActivityLogEntry, 'id' | 'timestamp'>) => request<ActivityLogEntry>('/activity-log', { method: 'POST', body: JSON.stringify(payload) }),
  restore: (id: string) => request<ActivityLogEntry>(`/activity-log/${id}/restore`, { method: 'POST' }),
};

export function logAction(
  userName: string,
  userId: string,
  action: ActivityLogEntry['action'],
  module: string,
  recordName: string,
  payload?: Record<string, unknown>,
) {
  return activityLog.add({ userId, userName, action, module, recordName, payload });
}

export function initializeData() {
  // The backend seeds the database on startup.
}



export type ReportPreviewListItem = {
  id: string;
  itemType: 'exercise' | 'training' | 'event';
  name?: string;
  type?: string;
  personId?: string;
  personName?: string;
  startDate: string;
  endDate: string;
  location: string;
  status: string;
  maxPersonnel?: number;
  assignedCount?: number;
  organizer?: string;
  previewRow: string;
};

export type ReportPreviewSection = {
  key: string;
  title: string;
  count: number;
  truncated: boolean;
  items: ReportPreviewListItem[];
};

export type ReportPreviewFocusDetail = {
  label: string;
  value: string;
};

export type ReportPreviewFocusParticipant = {
  personName: string;
  detail: string;
};

export type ReportPreviewFocus = {
  type: 'exercise' | 'training' | 'event';
  id: string;
  headline: string;
  description: string;
  participants: ReportPreviewFocusParticipant[];
  details: ReportPreviewFocusDetail[];
};

export type ReportPreviewResponse = {
  template: 'overview' | 'operations' | 'events' | 'focus';
  title: string;
  interval: {
    dateFrom: string;
    dateTo: string;
  };
  focusType: 'exercise' | 'training' | 'event' | null;
  focusId: string | null;
  summary: {
    exercises: number;
    trainings: number;
    events: number;
  };
  sections: ReportPreviewSection[];
  focus: ReportPreviewFocus | null;
};
export const reports = {
  previewOperationsReport: (params?: {
    dateFrom?: string;
    dateTo?: string;
    template?: 'overview' | 'operations' | 'events' | 'focus';
    focusType?: 'exercise' | 'training' | 'event';
    focusId?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.dateFrom) query.set('date_from', params.dateFrom);
    if (params?.dateTo) query.set('date_to', params.dateTo);
    if (params?.template) query.set('template', params.template);
    if (params?.focusType) query.set('focus_type', params.focusType);
    if (params?.focusId) query.set('focus_id', params.focusId);
    return request<ReportPreviewResponse>(`/reports/operations/preview${query.toString() ? `?${query.toString()}` : ''}`);
  },
  downloadOperationsPdf: async (params?: {
    dateFrom?: string;
    dateTo?: string;
    template?: 'overview' | 'operations' | 'events' | 'focus';
    focusType?: 'exercise' | 'training' | 'event';
    focusId?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.dateFrom) query.set('date_from', params.dateFrom);
    if (params?.dateTo) query.set('date_to', params.dateTo);
    if (params?.template) query.set('template', params.template);
    if (params?.focusType) query.set('focus_type', params.focusType);
    if (params?.focusId) query.set('focus_id', params.focusId);

    const token = getAccessToken();
    const headers = new Headers();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${API_BASE}/reports/operations.pdf${query.toString() ? `?${query.toString()}` : ''}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      try {
        const parsed = text ? JSON.parse(text) : null;
        throw new Error(parsed?.detail || 'PDF lekérdezés sikertelen');
      } catch {
        throw new Error(text || 'PDF lekérdezés sikertelen');
      }
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const from = params?.dateFrom || 'kezdet';
    const to = params?.dateTo || 'veg';
    const template = params?.template || 'overview';
    const focusPart = params?.focusType && params?.focusId ? `-${params.focusType}-${params.focusId}` : '';
    link.href = url;
    link.download = `hadmuveleti-jelentes-${template}${focusPart}-${from}-${to}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
  downloadOperationsExcel: async (params?: {
    dateFrom?: string;
    dateTo?: string;
    template?: "overview" | "operations" | "events" | "focus";
    focusType?: "exercise" | "training" | "event";
    focusId?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.dateFrom) query.set("date_from", params.dateFrom);
    if (params?.dateTo) query.set("date_to", params.dateTo);
    if (params?.template) query.set("template", params.template);
    if (params?.focusType) query.set("focus_type", params.focusType);
    if (params?.focusId) query.set("focus_id", params.focusId);

    const token = getAccessToken();
    const headers = new Headers();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${API_BASE}/reports/operations.xlsx${query.toString() ? `?${query.toString()}` : ""}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      try {
        const parsed = text ? JSON.parse(text) : null;
        throw new Error(parsed?.detail || "Excel lekérdezés sikertelen");
      } catch {
        throw new Error(text || "Excel lekérdezés sikertelen");
      }
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const from = params?.dateFrom || "kezdet";
    const to = params?.dateTo || "veg";
    const template = params?.template || "overview";
    const focusPart = params?.focusType && params?.focusId ? `-${params.focusType}-${params.focusId}` : "";
    link.href = url;
    link.download = `hadmuveleti-jelentes-${template}${focusPart}-${from}-${to}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
  downloadOperationsWord: async (params?: {
    dateFrom?: string;
    dateTo?: string;
    template?: "overview" | "operations" | "events" | "focus";
    focusType?: "exercise" | "training" | "event";
    focusId?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.dateFrom) query.set("date_from", params.dateFrom);
    if (params?.dateTo) query.set("date_to", params.dateTo);
    if (params?.template) query.set("template", params.template);
    if (params?.focusType) query.set("focus_type", params.focusType);
    if (params?.focusId) query.set("focus_id", params.focusId);

    const token = getAccessToken();
    const headers = new Headers();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${API_BASE}/reports/operations.docx${query.toString() ? `?${query.toString()}` : ""}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      try {
        const parsed = text ? JSON.parse(text) : null;
        throw new Error(parsed?.detail || "Word lekérdezés sikertelen");
      } catch {
        throw new Error(text || "Word lekérdezés sikertelen");
      }
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const from = params?.dateFrom || "kezdet";
    const to = params?.dateTo || "veg";
    const template = params?.template || "overview";
    const focusPart = params?.focusType && params?.focusId ? `-${params.focusType}-${params.focusId}` : "";
    link.href = url;
    link.download = `hadmuveleti-jelentes-${template}${focusPart}-${from}-${to}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};
export async function previewImport(entity: ImportEntity, file: File): Promise<ImportPreviewResult> {
  const formData = new FormData();
  formData.append('file', file);
  return request<ImportPreviewResult>(`/import/${entity}/preview`, {
    method: 'POST',
    body: formData,
  });
}

export async function updateImportDraft(entity: ImportEntity, draftId: string, items: ImportDraftUpdateItem[]): Promise<ImportPreviewResult> {
  return request<ImportPreviewResult>(`/import/${entity}/draft/${draftId}`, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
}

export async function confirmImport(entity: ImportEntity, draftId: string): Promise<ImportConfirmResult> {
  return request<ImportConfirmResult>(`/import/${entity}/confirm/${draftId}`, {
    method: 'POST',
  });
}

export type { AttendanceStatus, AttendanceEntry, AttendanceDay, AttendanceMark } from './types';

function attendanceQuery(date: string, unit?: string, includeReserve?: boolean): string {
  const query = new URLSearchParams({ date });
  if (unit?.trim() && unit !== 'Összes') query.set('unit', unit.trim());
  if (includeReserve) query.set('include_reserve', 'true');
  return query.toString();
}

async function downloadBlob(path: string, filename: string, body?: unknown): Promise<void> {
  const token = getAccessToken();
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, body === undefined ? { headers } : { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) {
    throw new Error((await response.text()) || 'A letöltés sikertelen');
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export type AttendanceEventOption = {
  eventType: 'exercise' | 'training' | 'event';
  eventId: string;
  name: string;
  participantCount: number;
};

export const attendance = {
  getDay: (date: string, unit?: string, includeReserve?: boolean) =>
    request<AttendanceDay>(`/attendance?${attendanceQuery(date, unit, includeReserve)}`),
  setDay: (date: string, items: AttendanceMark[]) =>
    request<AttendanceDay>('/attendance', { method: 'PUT', body: JSON.stringify({ date, items }) }),
  eventsOnDay: (date: string) =>
    request<AttendanceEventOption[]>(`/attendance/events?date=${encodeURIComponent(date)}`),
  fillFromEvent: (date: string, eventType: string, eventId: string, status: AttendanceStatus) =>
    request<AttendanceDay>('/attendance/fill', { method: 'POST', body: JSON.stringify({ date, eventType, eventId, status }) }),
  exportXlsx: (date: string, unit?: string, includeReserve?: boolean) =>
    downloadBlob(`/attendance/export.xlsx?${attendanceQuery(date, unit, includeReserve)}`, `letszamjelentes-${date}.xlsx`),
  exportPdf: (date: string, unit?: string, includeReserve?: boolean) =>
    downloadBlob(`/attendance/export.pdf?${attendanceQuery(date, unit, includeReserve)}`, `letszamjelentes-${date}.pdf`),
};

export type LeaveType = 'Szabadság' | 'Betegszabadság' | 'Kiküldetés' | 'Egyéb';
export type LeaveStatus = 'Beadva' | 'Jóváhagyva' | 'Elutasítva';

export type LeaveRequest = {
  id: string;
  personnelId: string;
  personName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  requestedBy: string;
  decidedBy: string;
  decidedAt: string | null;
  createdAt: string;
};

export const leave = {
  list: (status?: string, personnelId?: string) => {
    const query = new URLSearchParams();
    if (status?.trim() && status !== 'Összes') query.set('status', status.trim());
    if (personnelId?.trim()) query.set('personnel_id', personnelId.trim());
    const qs = query.toString();
    return request<LeaveRequest[]>(`/leave${qs ? `?${qs}` : ''}`);
  },
  create: (payload: { personnelId: string; type: LeaveType; startDate: string; endDate: string; reason?: string }) =>
    request<LeaveRequest>('/leave', { method: 'POST', body: JSON.stringify(payload) }),
  decide: (id: string, approve: boolean) =>
    request<LeaveRequest>(`/leave/${id}/decision`, { method: 'POST', body: JSON.stringify({ approve }) }),
  remove: (id: string) => request<void>(`/leave/${id}`, { method: 'DELETE' }),
};

export type Booking = {
  location: string;
  eventType: 'exercise' | 'training' | 'event';
  eventId: string;
  eventName: string;
  startDate: string;
  endDate: string;
  status: string;
};

export const availability = {
  locations: () => request<string[]>('/availability/locations'),
  check: (startDate: string, endDate?: string, q?: string) => {
    const query = new URLSearchParams({ start_date: startDate });
    if (endDate?.trim()) query.set('end_date', endDate.trim());
    if (q?.trim()) query.set('q', q.trim());
    return request<Booking[]>(`/availability?${query.toString()}`);
  },
};

export type PrerequisiteInfo = {
  qualTypeIds: string[];
  qualTypes: { id: string; name: string }[];
};

export type EligibilityPerson = {
  personnelId: string;
  name: string;
  rank: string;
  unit: string;
  eligible: boolean;
  missing: string[];
};

export const prerequisites = {
  get: (eventType: string, eventId: string) =>
    request<PrerequisiteInfo>(`/prerequisites/${eventType}/${eventId}`),
  set: (eventType: string, eventId: string, qualTypeIds: string[]) =>
    request<PrerequisiteInfo>(`/prerequisites/${eventType}/${eventId}`, {
      method: 'PUT',
      body: JSON.stringify({ qualTypeIds }),
    }),
  eligibility: (eventType: string, eventId: string, unit?: string, includeReserve?: boolean) => {
    const query = new URLSearchParams();
    if (unit?.trim() && unit !== 'Összes') query.set('unit', unit.trim());
    if (includeReserve) query.set('include_reserve', 'true');
    const qs = query.toString();
    return request<EligibilityPerson[]>(`/prerequisites/${eventType}/${eventId}/eligibility${qs ? `?${qs}` : ''}`);
  },
};

// ── Műveletek: fa, jelenlét, anyagigény, dokumentumok ─────────────────────

export type OperationNodePayload = {
  eventType: 'esemeny';
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location?: string;
  organizer?: string;
  maxPersonnel?: number;
  description?: string;
  status: string;
  parentId?: string | null;
};

export const operationTree = {
  get: () => request<OperationTreeNode[]>('/operations/tree'),
  create: (payload: OperationNodePayload) =>
    request<{ id: string }>('/operations/tree', { method: 'POST', body: JSON.stringify(payload) }),
  update: (nodeId: string, payload: OperationNodePayload) =>
    request<{ id: string }>(`/operations/tree/${nodeId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (nodeId: string) => request<void>(`/operations/tree/${nodeId}`, { method: 'DELETE' }),
};

export const operationAttendance = {
  get: (operationId: string) =>
    request<OperationAttendanceEntry[]>(`/operations/${operationId}/attendance`),
  saveBatch: (operationId: string, entries: Array<Pick<OperationAttendanceEntry, 'personId' | 'personName' | 'status' | 'note'>>) =>
    request<OperationAttendanceEntry[]>(`/operations/${operationId}/attendance`, {
      method: 'PUT',
      body: JSON.stringify({ entries }),
    }),
  patch: (operationId: string, personId: string, payload: Partial<Pick<OperationAttendanceEntry, 'personName' | 'status' | 'note'>>) =>
    request<OperationAttendanceEntry>(`/operations/${operationId}/attendance/${personId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};

export const operationRequirements = {
  get: (operationId: string) =>
    request<MaterialRequirement[]>(`/operations/${operationId}/requirements`),
  create: (operationId: string, payload: Omit<MaterialRequirement, 'id' | 'operationId'>) =>
    request<MaterialRequirement>(`/operations/${operationId}/requirements`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (operationId: string, id: string, payload: Partial<Omit<MaterialRequirement, 'id' | 'operationId'>>) =>
    request<MaterialRequirement>(`/operations/${operationId}/requirements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  remove: (operationId: string, id: string) =>
    request<void>(`/operations/${operationId}/requirements/${id}`, { method: 'DELETE' }),
};

export const operationDocuments = {
  get: (operationId: string) =>
    request<OperationDocument[]>(`/operations/${operationId}/documents`),
  upload: (operationId: string, file: File, title: string) => {
    const body = new FormData();
    body.append('file', file);
    body.append('title', title);
    return request<OperationDocument>(`/operations/${operationId}/documents`, { method: 'POST', body });
  },
  remove: (operationId: string, docId: string) =>
    request<void>(`/operations/${operationId}/documents/${docId}`, { method: 'DELETE' }),
  download: (operationId: string, docId: string, originalName: string) =>
    downloadBlob(`/operations/${operationId}/documents/${docId}/download`, originalName),
  view: (operationId: string, docId: string, originalName: string) =>
    downloadBlob(`/operations/${operationId}/documents/${docId}/view`, originalName),
};

// ── Parancs-műhely (I5) ─────────────────────────────────────────────────────

export type OrderStatus = 'Előkészítés' | 'Aláírásra vár' | 'Kiadva' | 'Visszavonva';
export type OrderChapterStatus = 'Nincs elkezdve' | 'Folyamatban' | 'Kész' | 'Nem szükséges';
export type OrderChapterTemplate = { name: string; responsible: string; required: boolean; template: string };
export type OrderType = {
  id: string; name: string; description: string; chapters: OrderChapterTemplate[]; signers: string[]; orderCount: number;
};
export type OrderChapter = {
  id: string; position: number; name: string; responsible: string; required: boolean; content: string;
  status: OrderChapterStatus; assignee: string; dueDate: string; note: string; updatedBy: string; updatedAt: string | null;
};
export type OrderSignature = { role: string; name: string; signed: boolean; signedAt: string; signedBy: string };
export type Order = {
  id: string; orderTypeId: string; typeName: string; number: string; issuer: string; subject: string;
  personnelId: string; personName: string; status: OrderStatus; dueDate: string; issuedDate: string; notes: string;
  createdBy: string; createdAt: string; doneChapters: number; totalChapters: number;
  pendingResponsibles: string[]; readyToSign: boolean; signedCount: number; isOverdue: boolean;
  signatures: OrderSignature[]; chapters: OrderChapter[];
};
export type OrderOverview = {
  openOrders: number; overdueOrders: number;
  byResponsible: { responsible: string; openChapters: number; overdueChapters: number; blockingOrders: number }[];
};

type OrderTypePayload = { name: string; description?: string; chapters: OrderChapterTemplate[]; signers: string[] };

export const orders = {
  types: () => request<OrderType[]>('/orders/types'),
  createType: (payload: OrderTypePayload) => request<OrderType>('/orders/types', { method: 'POST', body: JSON.stringify(payload) }),
  updateType: (id: string, payload: OrderTypePayload) => request<OrderType>(`/orders/types/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  removeType: (id: string) => request<void>(`/orders/types/${id}`, { method: 'DELETE' }),
  list: (openOnly: boolean) => request<Order[]>(`/orders${openOnly ? '?open_only=true' : ''}`),
  overview: () => request<OrderOverview>('/orders/overview'),
  get: (id: string) => request<Order>(`/orders/${id}`),
  create: (payload: { orderTypeId: string; subject: string; number?: string; issuer?: string; personnelId?: string; dueDate?: string; notes?: string }) =>
    request<Order>('/orders', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: { subject: string; status: OrderStatus; number?: string; issuer?: string; dueDate?: string; issuedDate?: string; notes?: string }) =>
    request<Order>(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (id: string) => request<void>(`/orders/${id}`, { method: 'DELETE' }),
  updateChapter: (orderId: string, chapterId: string, payload: { status: OrderChapterStatus; content: string; assignee?: string; dueDate?: string; note?: string }) =>
    request<Order>(`/orders/${orderId}/chapters/${chapterId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  addChapter: (orderId: string, payload: OrderChapterTemplate) =>
    request<Order>(`/orders/${orderId}/chapters`, { method: 'POST', body: JSON.stringify(payload) }),
  removeChapter: (orderId: string, chapterId: string) =>
    request<Order>(`/orders/${orderId}/chapters/${chapterId}`, { method: 'DELETE' }),
  updateSignatures: (orderId: string, signatures: { role: string; name: string; signed: boolean }[]) =>
    request<Order>(`/orders/${orderId}/signatures`, { method: 'PUT', body: JSON.stringify({ signatures }) }),
  exportDocx: (orderId: string, number: string) => downloadBlob(`/orders/${orderId}/export.docx`, `parancs-${number || orderId.slice(0, 8)}.docx`),
  exportPdf: (orderId: string, number: string) => downloadBlob(`/orders/${orderId}/export.pdf`, `parancs-${number || orderId.slice(0, 8)}.pdf`),
};

/** Bármely (már megszűrt) táblázat Excelbe — a szerver csak formáz. */
export const tableExport = {
  xlsx: (title: string, headers: string[], rows: string[][], filename: string) =>
    downloadBlob('/reports/table.xlsx', filename, { title, headers, rows }),
};

// ── Alapkiképzés-tábla import (név/SZTSZ + modulonként egy oszlop) ──────────

export type BasicTrainingImportPreview = {
  draftId: string;
  totalRows: number;
  matchedPersons: number;
  unmatched: { line: number; name: string; sztsz: string; problem: string; completedCount: number }[];
  modules: { header: string; qualTypeId: string | null; known: boolean }[];
  unknownModules: string[];
  newGrants: number;
  alreadyHeld: number;
  items: { line: number; personnelId: string; name: string; sztsz: string; completedCount: number; newCount: number }[];
};
export type BasicTrainingImportResult = { granted: number; createdModules: string[]; skippedUnknownModules: number; summariesGranted: number };

export const basicTrainingImport = {
  preview: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<BasicTrainingImportPreview>('/import/basic-training/preview', { method: 'POST', body: formData });
  },
  confirm: (draftId: string, createMissingModules: boolean) =>
    request<BasicTrainingImportResult>(`/import/basic-training/confirm/${draftId}?create_missing_modules=${createMissingModules}`, { method: 'POST' }),
};
