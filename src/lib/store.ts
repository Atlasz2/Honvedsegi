import {
  ActivityLogEntry,
  Announcement,
  AuthToken,
  Duty,
  Equipment,
  Exercise,
  Person,
  Supply,
  Training,
  AppEvent,
  AttendanceEntry,
  AttendanceEntryUpdate,
  MaterialRequirement,
  OperationDocument,
  OperationTreeNode,
  User,
  Vehicle,
  BugReport,
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

export type ImportPreviewResult = {
  draftId: string;
  entity: ImportEntity;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  issues: ImportIssue[];
  items: ImportPreviewItem[];
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

    throw new Error(detail || `A k?r?s sikertelen volt (${response.status})`);
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
};
export const exercises = createCrud<Exercise>('/exercises');
export const trainings = createCrud<Training>('/trainings');
export const events = createCrud<AppEvent>('/events');
export const duties = createCrud<Duty>('/duties');
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
};

export const activityLog = {
  getAll: () => request<ActivityLogEntry[]>('/activity-log'),
  add: (payload: Omit<ActivityLogEntry, 'id' | 'timestamp'>) => request<ActivityLogEntry>('/activity-log', { method: 'POST', body: JSON.stringify(payload) }),
  restore: (id: string) => request<ActivityLogEntry>(`/activity-log/${id}/restore`, { method: 'POST' }),
};



export const bugReports = {
  getAll: () => request<BugReport[]>('/bug-reports'),
  getSummary: () => request<{ openCount: number; resolvedCount: number; criticalOpen: number }>('/bug-reports/summary'),
  create: (payload: { title: string; description: string; page?: string; severity?: BugReport['severity']; screenshotData?: string }) =>
    request<BugReport>('/bug-reports', { method: 'POST', body: JSON.stringify(payload) }),
  updateStatus: (id: string, status: BugReport['status']) =>
    request<BugReport>(`/bug-reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateAdmin: (id: string, payload: { status?: BugReport['status']; severity?: BugReport['severity'] }) =>
    request<BugReport>(`/bug-reports/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
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




export async function fetchOperationTree(): Promise<OperationTreeNode[]> {
  return request<OperationTreeNode[]>('/operations/tree');
}

export async function fetchAttendance(id: string): Promise<AttendanceEntry[]> {
  return request<AttendanceEntry[]>(`/operations/${id}/attendance`);
}

export async function updateAttendance(id: string, entries: AttendanceEntryUpdate[]): Promise<AttendanceEntry[]> {
  return request<AttendanceEntry[]>(`/operations/${id}/attendance/batch`, {
    method: 'POST',
    body: JSON.stringify({ entries }),
  });
}

export async function patchAttendance(id: string, personId: string, entry: Partial<Omit<AttendanceEntryUpdate, 'personId'>>): Promise<AttendanceEntry> {
  return request<AttendanceEntry>(`/operations/${id}/attendance/${personId}`, {
    method: 'PATCH',
    body: JSON.stringify(entry),
  });
}

export async function fetchRequirements(id: string): Promise<MaterialRequirement[]> {
  return request<MaterialRequirement[]>(`/operations/${id}/requirements`);
}

export async function createRequirement(
  id: string,
  payload: Omit<MaterialRequirement, 'id' | 'operationId'>,
): Promise<MaterialRequirement> {
  return request<MaterialRequirement>(`/operations/${id}/requirements`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateRequirement(
  id: string,
  reqId: string,
  payload: Partial<Omit<MaterialRequirement, 'id' | 'operationId'>>,
): Promise<MaterialRequirement> {
  return request<MaterialRequirement>(`/operations/${id}/requirements/${reqId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteRequirement(id: string, reqId: string): Promise<void> {
  return request<void>(`/operations/${id}/requirements/${reqId}`, {
    method: 'DELETE',
  });
}

export async function uploadDocument(id: string, file: File, title = ''): Promise<OperationDocument> {
  const formData = new FormData();
  formData.append('file', file);
  if (title.trim()) formData.append('title', title.trim());
  return request<OperationDocument>(`/operations/${id}/documents`, {
    method: 'POST',
    body: formData,
  });
}

export async function viewDocument(id: string, docId: string): Promise<{ url: string; mimeType: string }> {
  const token = getAccessToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}/operations/${id}/documents/${docId}/view`, {
    method: 'GET',
    headers,
  });
  if (!response.ok) {
    throw new Error('Megtekintés sikertelen');
  }
  const headerMime = response.headers.get('Content-Type')?.trim() ?? '';
  const blob = await response.blob();
  const blobMime = blob.type?.trim() ?? '';
  const mimeType = !blobMime || blobMime === 'application/octet-stream'
    ? (headerMime || 'application/octet-stream')
    : blobMime;
  const url = window.URL.createObjectURL(blob);
  return { url, mimeType };
}

export async function createOperation(payload: Omit<import('./types').OperationTreeNode, 'id' | 'children'>): Promise<import('./types').AppEvent> {
  return request<import('./types').AppEvent>('/operations/nodes', {
    method: 'POST',
    body: JSON.stringify({ ...payload, eventType: 'esemeny' }),
  });
}

export async function updateOperation(id: string, payload: Omit<import('./types').OperationTreeNode, 'id' | 'children'>): Promise<import('./types').AppEvent> {
  return request<import('./types').AppEvent>(`/operations/nodes/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...payload, eventType: 'esemeny' }),
  });
}

export async function deleteOperation(id: string): Promise<void> {
  return request<void>(`/operations/nodes/${id}`, { method: 'DELETE' });
}

export async function fetchDocuments(id: string): Promise<OperationDocument[]> {
  return request<OperationDocument[]>(`/operations/${id}/documents`);
}

export async function deleteDocument(id: string, docId: string): Promise<void> {
  return request<void>(`/operations/${id}/documents/${docId}`, {
    method: 'DELETE',
  });
}

export async function downloadDocument(id: string, docId: string, fallbackName: string): Promise<void> {
  const token = getAccessToken();
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE}/operations/${id}/documents/${docId}/download`, {
    method: 'GET',
    headers,
  });
  if (!response.ok) {
    const raw = await response.text();
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      throw new Error(parsed?.detail || 'Dokumentum letöltés sikertelen');
    } catch {
      throw new Error(raw || 'Dokumentum letöltés sikertelen');
    }
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fallbackName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export type ReportPreviewListItem = {
  id: string;
  itemType: 'exercise' | 'training' | 'event' | 'duty';
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
  type: 'exercise' | 'training' | 'event' | 'duty';
  id: string;
  headline: string;
  description: string;
  participants: ReportPreviewFocusParticipant[];
  details: ReportPreviewFocusDetail[];
};

export type ReportPreviewResponse = {
  template: 'overview' | 'operations' | 'duties' | 'events' | 'focus';
  title: string;
  interval: {
    dateFrom: string;
    dateTo: string;
  };
  focusType: 'exercise' | 'training' | 'event' | 'duty' | null;
  focusId: string | null;
  summary: {
    exercises: number;
    trainings: number;
    events: number;
    duties: number;
  };
  sections: ReportPreviewSection[];
  focus: ReportPreviewFocus | null;
};
export const reports = {
  previewOperationsReport: (params?: {
    dateFrom?: string;
    dateTo?: string;
    template?: 'overview' | 'operations' | 'duties' | 'events' | 'focus';
    focusType?: 'exercise' | 'training' | 'event' | 'duty';
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
    template?: 'overview' | 'operations' | 'duties' | 'events' | 'focus';
    focusType?: 'exercise' | 'training' | 'event' | 'duty';
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
    template?: "overview" | "operations" | "duties" | "events" | "focus";
    focusType?: "exercise" | "training" | "event" | "duty";
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
    template?: "overview" | "operations" | "duties" | "events" | "focus";
    focusType?: "exercise" | "training" | "event" | "duty";
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

