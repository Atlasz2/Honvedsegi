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
  User,
  Vehicle,
} from './types';

const defaultApiBase = `${window.location.protocol}//${window.location.hostname}:8000/api`;
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
  if (!headers.has('Content-Type') && init.body) {
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
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
    }
    throw new Error(data?.detail || 'A kérés sikertelen volt');
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
  try {
    const result = await request<{ token: string; user: AuthToken }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
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
  getPaged: (params: { page: number; pageSize: number; search?: string; unit?: string; status?: string; sortBy?: string; sortDir?: 'asc' | 'desc' }) => {
    const query = new URLSearchParams({
      page: String(params.page),
      page_size: String(params.pageSize),
    });
    if (params.search?.trim()) query.set('q', params.search.trim());
    if (params.unit?.trim() && params.unit !== 'Összes') query.set('unit', params.unit.trim());
    if (params.status?.trim() && params.status !== 'Összes') query.set('status_filter', params.status.trim());
    if (params.sortBy?.trim()) query.set('sort_by', params.sortBy.trim());
    if (params.sortDir) query.set('sort_dir', params.sortDir);
    return request<PersonnelPagedResult>(`/personnel/paged?${query.toString()}`);
  },
};
export const exercises = createCrud<Exercise>('/exercises');
export const trainings = createCrud<Training>('/trainings');
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
};

export function logAction(userName: string, userId: string, action: ActivityLogEntry['action'], module: string, recordName: string) {
  return activityLog.add({ userId, userName, action, module, recordName });
}

export function initializeData() {
  // The backend seeds the database on startup.
}



export const reports = {
  downloadOperationsPdf: async (params?: { dateFrom?: string; dateTo?: string }) => {
    const query = new URLSearchParams();
    if (params?.dateFrom) query.set('date_from', params.dateFrom);
    if (params?.dateTo) query.set('date_to', params.dateTo);

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
    link.href = url;
    link.download = `hadmuveleti-riport-${from}-${to}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};
