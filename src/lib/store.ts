import {
  User, Person, Exercise, Training, Equipment, Supply,
  Vehicle, Duty, Announcement, ActivityLogEntry, AuthToken
} from './types';

const KEYS = {
  USERS: 'honved_users',
  PERSONNEL: 'honved_personnel',
  EXERCISES: 'honved_exercises',
  TRAININGS: 'honved_trainings',
  EQUIPMENT: 'honved_equipment',
  SUPPLIES: 'honved_supplies',
  VEHICLES: 'honved_vehicles',
  DUTIES: 'honved_duties',
  ANNOUNCEMENTS: 'honved_announcements',
  ACTIVITY_LOG: 'honved_activity_log',
  AUTH_TOKEN: 'honved_auth_token',
  INITIALIZED: 'honved_initialized',
};

// Generic helpers
function get<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function set<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}
let uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Auth
export function getToken(): AuthToken | null {
  try {
    const t = JSON.parse(localStorage.getItem(KEYS.AUTH_TOKEN) || 'null');
    if (t && t.expiry > Date.now()) return t;
    localStorage.removeItem(KEYS.AUTH_TOKEN);
    return null;
  } catch { return null; }
}
export function setToken(t: AuthToken) { localStorage.setItem(KEYS.AUTH_TOKEN, JSON.stringify(t)); }
export function clearToken() { localStorage.removeItem(KEYS.AUTH_TOKEN); }

export function login(username: string, password: string): { success: boolean; error?: string; token?: AuthToken } {
  const users = get<User>(KEYS.USERS);
  const user = users.find(u => u.username === username);
  if (!user) return { success: false, error: 'Hibás felhasználónév vagy jelszó' };
  if (!user.active) return { success: false, error: 'Fiók deaktiválva' };
  if (user.password !== password) return { success: false, error: 'Hibás felhasználónév vagy jelszó' };
  user.lastLogin = new Date().toISOString();
  set(KEYS.USERS, users);
  const token: AuthToken = {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    expiry: Date.now() + 8 * 60 * 60 * 1000,
  };
  setToken(token);
  return { success: true, token };
}

// CRUD factories
export const users = {
  getAll: () => get<User>(KEYS.USERS),
  save: (data: User[]) => set(KEYS.USERS, data),
};
export const personnel = {
  getAll: () => get<Person>(KEYS.PERSONNEL),
  save: (data: Person[]) => set(KEYS.PERSONNEL, data),
  add: (p: Omit<Person, 'id'>) => { const all = get<Person>(KEYS.PERSONNEL); const n = { ...p, id: uid() } as Person; all.push(n); set(KEYS.PERSONNEL, all); return n; },
  update: (p: Person) => { const all = get<Person>(KEYS.PERSONNEL).map(x => x.id === p.id ? p : x); set(KEYS.PERSONNEL, all); },
  remove: (id: string) => set(KEYS.PERSONNEL, get<Person>(KEYS.PERSONNEL).filter(x => x.id !== id)),
};
export const exercises = {
  getAll: () => get<Exercise>(KEYS.EXERCISES),
  save: (data: Exercise[]) => set(KEYS.EXERCISES, data),
  add: (p: Omit<Exercise, 'id'>) => { const all = get<Exercise>(KEYS.EXERCISES); const n = { ...p, id: uid() } as Exercise; all.push(n); set(KEYS.EXERCISES, all); return n; },
  update: (p: Exercise) => { const all = get<Exercise>(KEYS.EXERCISES).map(x => x.id === p.id ? p : x); set(KEYS.EXERCISES, all); },
  remove: (id: string) => set(KEYS.EXERCISES, get<Exercise>(KEYS.EXERCISES).filter(x => x.id !== id)),
};
export const trainings = {
  getAll: () => get<Training>(KEYS.TRAININGS),
  save: (data: Training[]) => set(KEYS.TRAININGS, data),
  add: (p: Omit<Training, 'id'>) => { const all = get<Training>(KEYS.TRAININGS); const n = { ...p, id: uid() } as Training; all.push(n); set(KEYS.TRAININGS, all); return n; },
  update: (p: Training) => { const all = get<Training>(KEYS.TRAININGS).map(x => x.id === p.id ? p : x); set(KEYS.TRAININGS, all); },
  remove: (id: string) => set(KEYS.TRAININGS, get<Training>(KEYS.TRAININGS).filter(x => x.id !== id)),
};
export const equipment = {
  getAll: () => get<Equipment>(KEYS.EQUIPMENT),
  save: (data: Equipment[]) => set(KEYS.EQUIPMENT, data),
  add: (p: Omit<Equipment, 'id'>) => { const all = get<Equipment>(KEYS.EQUIPMENT); const n = { ...p, id: uid() } as Equipment; all.push(n); set(KEYS.EQUIPMENT, all); return n; },
  update: (p: Equipment) => { const all = get<Equipment>(KEYS.EQUIPMENT).map(x => x.id === p.id ? p : x); set(KEYS.EQUIPMENT, all); },
  remove: (id: string) => set(KEYS.EQUIPMENT, get<Equipment>(KEYS.EQUIPMENT).filter(x => x.id !== id)),
};
export const supplies = {
  getAll: () => get<Supply>(KEYS.SUPPLIES),
  save: (data: Supply[]) => set(KEYS.SUPPLIES, data),
  add: (p: Omit<Supply, 'id'>) => { const all = get<Supply>(KEYS.SUPPLIES); const n = { ...p, id: uid() } as Supply; all.push(n); set(KEYS.SUPPLIES, all); return n; },
  update: (p: Supply) => { const all = get<Supply>(KEYS.SUPPLIES).map(x => x.id === p.id ? p : x); set(KEYS.SUPPLIES, all); },
  remove: (id: string) => set(KEYS.SUPPLIES, get<Supply>(KEYS.SUPPLIES).filter(x => x.id !== id)),
};
export const vehicles = {
  getAll: () => get<Vehicle>(KEYS.VEHICLES),
  save: (data: Vehicle[]) => set(KEYS.VEHICLES, data),
  add: (p: Omit<Vehicle, 'id'>) => { const all = get<Vehicle>(KEYS.VEHICLES); const n = { ...p, id: uid() } as Vehicle; all.push(n); set(KEYS.VEHICLES, all); return n; },
  update: (p: Vehicle) => { const all = get<Vehicle>(KEYS.VEHICLES).map(x => x.id === p.id ? p : x); set(KEYS.VEHICLES, all); },
  remove: (id: string) => set(KEYS.VEHICLES, get<Vehicle>(KEYS.VEHICLES).filter(x => x.id !== id)),
};
export const duties = {
  getAll: () => get<Duty>(KEYS.DUTIES),
  save: (data: Duty[]) => set(KEYS.DUTIES, data),
  add: (p: Omit<Duty, 'id'>) => { const all = get<Duty>(KEYS.DUTIES); const n = { ...p, id: uid() } as Duty; all.push(n); set(KEYS.DUTIES, all); return n; },
  update: (p: Duty) => { const all = get<Duty>(KEYS.DUTIES).map(x => x.id === p.id ? p : x); set(KEYS.DUTIES, all); },
  remove: (id: string) => set(KEYS.DUTIES, get<Duty>(KEYS.DUTIES).filter(x => x.id !== id)),
};
export const announcements = {
  getAll: () => get<Announcement>(KEYS.ANNOUNCEMENTS),
  save: (data: Announcement[]) => set(KEYS.ANNOUNCEMENTS, data),
  add: (p: Omit<Announcement, 'id'>) => { const all = get<Announcement>(KEYS.ANNOUNCEMENTS); const n = { ...p, id: uid() } as Announcement; all.push(n); set(KEYS.ANNOUNCEMENTS, all); return n; },
  update: (p: Announcement) => { const all = get<Announcement>(KEYS.ANNOUNCEMENTS).map(x => x.id === p.id ? p : x); set(KEYS.ANNOUNCEMENTS, all); },
  remove: (id: string) => set(KEYS.ANNOUNCEMENTS, get<Announcement>(KEYS.ANNOUNCEMENTS).filter(x => x.id !== id)),
};
export const activityLog = {
  getAll: () => get<ActivityLogEntry>(KEYS.ACTIVITY_LOG),
  add: (entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>) => {
    const all = get<ActivityLogEntry>(KEYS.ACTIVITY_LOG);
    all.unshift({ ...entry, id: uid(), timestamp: new Date().toISOString() });
    if (all.length > 500) all.length = 500;
    set(KEYS.ACTIVITY_LOG, all);
  },
};

export function logAction(userName: string, userId: string, action: ActivityLogEntry['action'], module: string, recordName: string) {
  activityLog.add({ userId, userName, action, module, recordName });
}

// Seed sample data
export function initializeData() {
  if (localStorage.getItem(KEYS.INITIALIZED)) return;

  // Users
  set<User>(KEYS.USERS, [
    { username: 'admin', password: 'admin123', displayName: 'Szabó Anna', role: 'admin', active: true },
    { username: 'kovacs', password: 'admin123', displayName: 'Kovács János', role: 'reader', active: true },
    { username: 'nagy', password: 'admin123', displayName: 'Nagy Péter', role: 'reader', active: true },
    { username: 'dev', password: 'dev123', displayName: 'Fejlesztő', role: 'fejleszto', active: true },
  ]);

  // Personnel
  const ppl: Person[] = [
    { id: 'p1', name: 'Szabó Anna', rank: 'Hadnagy', unit: 'Törzs', status: 'Aktív', email: 'szabo.anna@honved.hu', phone: '+36 20 111 2222', birthDate: '', address: '', joinDate: '2018-03-15', notes: '' },
    { id: 'p2', name: 'Kovács János', rank: 'Szakaszvezető', unit: '1. szakasz', status: 'Aktív', email: 'kovacs.j@honved.hu', phone: '+36 30 333 4444', birthDate: '', address: '', joinDate: '2019-06-01', notes: '' },
    { id: 'p3', name: 'Nagy Péter', rank: 'Tizedes', unit: '1. szakasz', status: 'Tartalékos', email: 'nagy.peter@gmail.com', phone: '', birthDate: '', address: '', joinDate: '2020-09-10', notes: '' },
    { id: 'p4', name: 'Horváth Zoltán', rank: 'Őrmester', unit: '2. szakasz', status: 'Aktív', email: 'horvath.z@honved.hu', phone: '+36 70 555 6666', birthDate: '', address: '', joinDate: '2017-01-20', notes: '' },
    { id: 'p5', name: 'Kiss Erzsébet', rank: 'Főhadnagy', unit: 'Törzs', status: 'Szabadságon', email: 'kiss.e@honved.hu', phone: '', birthDate: '', address: '', joinDate: '2015-07-04', notes: 'Szülési szabadság' },
    { id: 'p6', name: 'Varga Gábor', rank: 'Közlegény', unit: '2. szakasz', status: 'Aktív', email: 'varga.g@gmail.com', phone: '+36 20 777 8888', birthDate: '', address: '', joinDate: '2023-02-14', notes: '' },
    { id: 'p7', name: 'Tóth Miklós', rank: 'Tizedes', unit: '1. szakasz', status: 'Tartalékos', email: 'toth.m@gmail.com', phone: '', birthDate: '', address: '', joinDate: '2021-05-28', notes: '' },
    { id: 'p8', name: 'Fekete Norbert', rank: 'Szakaszvezető', unit: '3. szakasz', status: 'Leszerelt', email: 'fekete.n@gmail.com', phone: '', birthDate: '', address: '', joinDate: '2016-11-03', notes: '' },
    { id: 'p9', name: 'Molnár Dóra', rank: 'Hadnagy', unit: 'Törzs', status: 'Aktív', email: 'molnar.d@honved.hu', phone: '+36 30 999 0000', birthDate: '', address: '', joinDate: '2020-03-01', notes: '' },
    { id: 'p10', name: 'Simon Ádám', rank: 'Közlegény', unit: '3. szakasz', status: 'Aktív', email: 'simon.a@gmail.com', phone: '', birthDate: '', address: '', joinDate: '2024-01-08', notes: '' },
    { id: 'p11', name: 'Lukács Béla', rank: 'Törzsőrmester', unit: '2. szakasz', status: 'Aktív', email: 'lukacs.b@honved.hu', phone: '', birthDate: '', address: '', joinDate: '2014-08-22', notes: '' },
    { id: 'p12', name: 'Farkas Réka', rank: 'Százados', unit: 'Törzs', status: 'Aktív', email: 'farkas.r@honved.hu', phone: '+36 20 444 5555', birthDate: '', address: '', joinDate: '2012-04-10', notes: '' },
  ];
  set(KEYS.PERSONNEL, ppl);

  // Exercises
  set<Exercise>(KEYS.EXERCISES, [
    { id: 'e1', name: 'Tavaszi lőgyakorlat', type: 'Lőgyakorlat', startDate: '2025-04-07', endDate: '2025-04-11', location: 'Esztergom, Lőtér', maxPersonnel: 15, description: '', status: 'Tervezett', assigned: [
      { personId: 'p2', personName: 'Kovács János', role: 'résztvevő' }, { personId: 'p3', personName: 'Nagy Péter', role: 'résztvevő' },
      { personId: 'p4', personName: 'Horváth Zoltán', role: 'rajparancsnok' }, { personId: 'p6', personName: 'Varga Gábor', role: 'résztvevő' },
      { personId: 'p10', personName: 'Simon Ádám', role: 'résztvevő' },
    ]},
    { id: 'e2', name: 'Tiszti törzsgyakorlat', type: 'Törzsgyakorlat', startDate: '2025-03-24', endDate: '2025-04-04', location: 'Budapest, Ludovika', maxPersonnel: 10, description: '', status: 'Folyamatban', assigned: [
      { personId: 'p1', personName: 'Szabó Anna', role: 'parancsnok' }, { personId: 'p9', personName: 'Molnár Dóra', role: 'vezérkari tiszt' },
      { personId: 'p12', personName: 'Farkas Réka', role: 'résztvevő' },
    ]},
    { id: 'e3', name: 'Határőrizeti szolgálat', type: 'Terepgyakorlat', startDate: '2025-04-01', endDate: '2025-04-30', location: 'Kiskunhalas', maxPersonnel: 8, description: '', status: 'Folyamatban', assigned: [
      { personId: 'p6', personName: 'Varga Gábor', role: 'járőrparancsnok' }, { personId: 'p7', personName: 'Tóth Miklós', role: 'járőrtag' },
      { personId: 'p10', personName: 'Simon Ádám', role: 'járőrtag' },
    ]},
    { id: 'e4', name: 'NBC védelmi kiképzés', type: 'Terepgyakorlat', startDate: '2025-05-05', endDate: '2025-05-09', location: 'Veszprém, Kiképzőközpont', maxPersonnel: 12, description: '', status: 'Tervezett', assigned: [
      { personId: 'p2', personName: 'Kovács János', role: 'résztvevő' }, { personId: 'p4', personName: 'Horváth Zoltán', role: 'résztvevő' },
      { personId: 'p11', personName: 'Lukács Béla', role: 'oktató' },
    ]},
    { id: 'e5', name: 'Nyári nagypraktika 2025', type: 'Terepgyakorlat', startDate: '2025-06-16', endDate: '2025-06-27', location: 'Győr, Katonai bázis', maxPersonnel: 20, description: '', status: 'Tervezett', assigned: [
      { personId: 'p1', personName: 'Szabó Anna', role: 'parancsnok' }, { personId: 'p2', personName: 'Kovács János', role: 'szakaszparancsnok' },
      { personId: 'p3', personName: 'Nagy Péter', role: 'résztvevő' }, { personId: 'p4', personName: 'Horváth Zoltán', role: 'résztvevő' },
      { personId: 'p6', personName: 'Varga Gábor', role: 'résztvevő' }, { personId: 'p7', personName: 'Tóth Miklós', role: 'résztvevő' },
    ]},
    { id: 'e6', name: 'Téli túlélőgyakorlat', type: 'Terepgyakorlat', startDate: '2025-01-13', endDate: '2025-01-17', location: 'Mátra, Erdős terület', maxPersonnel: 10, description: '', status: 'Befejezett', assigned: [
      { personId: 'p2', personName: 'Kovács János', role: 'résztvevő' }, { personId: 'p3', personName: 'Nagy Péter', role: 'résztvevő' },
      { personId: 'p4', personName: 'Horváth Zoltán', role: 'résztvevő' }, { personId: 'p9', personName: 'Molnár Dóra', role: 'résztvevő' },
      { personId: 'p10', personName: 'Simon Ádám', role: 'résztvevő' },
    ]},
  ]);

  // Trainings
  set<Training>(KEYS.TRAININGS, [
    { id: 't1', name: 'Alapkiképzés 2024/2', type: 'Alapkiképzés', startDate: '2024-09-02', endDate: '2024-12-20', location: 'Budapest, Petőfi Laktanya', organizer: '', maxPersonnel: 20, description: '', status: 'Befejezett', assigned: [
      { personId: 'p10', personName: 'Simon Ádám', attendance: 'Megjelent' }, { personId: 'p6', personName: 'Varga Gábor', attendance: 'Megjelent' },
    ]},
    { id: 't2', name: 'Elsősegély tanfolyam', type: 'Elsősegély', startDate: '2025-02-10', endDate: '2025-02-14', location: 'Budapest, Katonai Kórház', organizer: '', maxPersonnel: 15, description: '', status: 'Befejezett', assigned: [
      { personId: 'p9', personName: 'Molnár Dóra', attendance: 'Megjelent' }, { personId: 'p4', personName: 'Horváth Zoltán', attendance: 'Megjelent' },
      { personId: 'p3', personName: 'Nagy Péter', attendance: 'Hiányzott' },
    ]},
    { id: 't3', name: 'Lövészeti mesterkurzus', type: 'Lövészeti', startDate: '2025-04-22', endDate: '2025-04-25', location: 'Esztergom, Lőtér', organizer: '', maxPersonnel: 8, description: '', status: 'Tervezett', assigned: [
      { personId: 'p2', personName: 'Kovács János', attendance: 'Tervezett' }, { personId: 'p11', personName: 'Lukács Béla', attendance: 'Tervezett' },
    ]},
    { id: 't4', name: 'Parancsnoki tanfolyam', type: 'Parancsnoki tanfolyam', startDate: '2025-05-12', endDate: '2025-05-23', location: 'Budapest, Ludovika', organizer: '', maxPersonnel: 6, description: '', status: 'Tervezett', assigned: [
      { personId: 'p9', personName: 'Molnár Dóra', attendance: 'Tervezett' }, { personId: 'p12', personName: 'Farkas Réka', attendance: 'Tervezett' },
    ]},
  ]);

  // Equipment
  set<Equipment>(KEYS.EQUIPMENT, [
    { id: 'eq1', name: 'Rohamsisak M92', category: 'Védőfelszerelés', serialNumber: 'SIS-001-A', qrCode: '', condition: 'Jó', description: '', checkoutHistory: [] },
    { id: 'eq2', name: 'Rohamsisak M92', category: 'Védőfelszerelés', serialNumber: 'SIS-002-A', qrCode: '', condition: 'Jó', description: '', checkedOutTo: 'p2', checkedOutToName: 'Kovács János', checkedOutDate: '2025-03-10', checkoutHistory: [{ personId: 'p2', personName: 'Kovács János', checkedOutDate: '2025-03-10', note: '' }] },
    { id: 'eq3', name: 'Rohamsisak M92', category: 'Védőfelszerelés', serialNumber: 'SIS-003-A', qrCode: '', condition: 'Javítandó', description: '', checkoutHistory: [] },
    { id: 'eq4', name: 'Golyóálló mellény', category: 'Védőfelszerelés', serialNumber: 'MEL-001-B', qrCode: '', condition: 'Jó', description: '', checkedOutTo: 'p4', checkedOutToName: 'Horváth Zoltán', checkedOutDate: '2025-03-12', checkoutHistory: [{ personId: 'p4', personName: 'Horváth Zoltán', checkedOutDate: '2025-03-12', note: '' }] },
    { id: 'eq5', name: 'Golyóálló mellény', category: 'Védőfelszerelés', serialNumber: 'MEL-002-B', qrCode: '', condition: 'Jó', description: '', checkoutHistory: [] },
    { id: 'eq6', name: 'Golyóálló mellény', category: 'Védőfelszerelés', serialNumber: 'MEL-003-B', qrCode: '', condition: 'Javítandó', description: '', checkoutHistory: [] },
    { id: 'eq7', name: 'Éjjellátó NVG-7', category: 'Optika', serialNumber: 'NVG-001-C', qrCode: '', condition: 'Jó', description: '', checkedOutTo: 'p1', checkedOutToName: 'Szabó Anna', checkedOutDate: '2025-03-20', checkoutHistory: [{ personId: 'p1', personName: 'Szabó Anna', checkedOutDate: '2025-03-20', note: '' }] },
    { id: 'eq8', name: 'Éjjellátó NVG-7', category: 'Optika', serialNumber: 'NVG-002-C', qrCode: '', condition: 'Jó', description: '', checkoutHistory: [] },
    { id: 'eq9', name: 'Rádiókészülék RF-10', category: 'Kommunikáció', serialNumber: 'RAD-001-D', qrCode: '', condition: 'Jó', description: '', checkedOutTo: 'p6', checkedOutToName: 'Varga Gábor', checkedOutDate: '2025-03-18', checkoutHistory: [{ personId: 'p6', personName: 'Varga Gábor', checkedOutDate: '2025-03-18', note: '' }] },
    { id: 'eq10', name: 'Rádiókészülék RF-10', category: 'Kommunikáció', serialNumber: 'RAD-002-D', qrCode: '', condition: 'Jó', description: '', checkoutHistory: [] },
    { id: 'eq11', name: 'Rádiókészülék RF-10', category: 'Kommunikáció', serialNumber: 'RAD-003-D', qrCode: '', condition: 'Selejtezendő', description: '', checkoutHistory: [] },
    { id: 'eq12', name: 'Elsősegély csomag', category: 'Egészségügy', serialNumber: 'MED-001-E', qrCode: '', condition: 'Jó', description: '', checkoutHistory: [] },
    { id: 'eq13', name: 'Elsősegély csomag', category: 'Egészségügy', serialNumber: 'MED-002-E', qrCode: '', condition: 'Jó', description: '', checkedOutTo: 'p9', checkedOutToName: 'Molnár Dóra', checkedOutDate: '2025-03-22', checkoutHistory: [{ personId: 'p9', personName: 'Molnár Dóra', checkedOutDate: '2025-03-22', note: '' }] },
    { id: 'eq14', name: 'Taktikai hátizsák', category: 'Tábori felszerelés', serialNumber: 'HZS-001-F', qrCode: '', condition: 'Jó', description: '', checkoutHistory: [] },
    { id: 'eq15', name: 'Taktikai hátizsák', category: 'Tábori felszerelés', serialNumber: 'HZS-002-F', qrCode: '', condition: 'Jó', description: '', checkedOutTo: 'p10', checkedOutToName: 'Simon Ádám', checkedOutDate: '2025-03-25', checkoutHistory: [{ personId: 'p10', personName: 'Simon Ádám', checkedOutDate: '2025-03-25', note: '' }] },
    { id: 'eq16', name: 'Katonai sátor (4 személyes)', category: 'Tábori felszerelés', serialNumber: 'SAT-001-G', qrCode: '', condition: 'Javítandó', description: '', checkoutHistory: [] },
    { id: 'eq17', name: 'Katonai sátor (4 személyes)', category: 'Tábori felszerelés', serialNumber: 'SAT-002-G', qrCode: '', condition: 'Jó', description: '', checkoutHistory: [] },
    { id: 'eq18', name: 'Gázálarc', category: 'Védőfelszerelés', serialNumber: 'GAZ-001-H', qrCode: '', condition: 'Jó', description: '', checkoutHistory: [] },
    { id: 'eq19', name: 'Gázálarc', category: 'Védőfelszerelés', serialNumber: 'GAZ-002-H', qrCode: '', condition: 'Jó', description: '', checkedOutTo: 'p11', checkedOutToName: 'Lukács Béla', checkedOutDate: '2025-04-01', checkoutHistory: [{ personId: 'p11', personName: 'Lukács Béla', checkedOutDate: '2025-04-01', note: '' }] },
  ]);

  // Supplies
  set<Supply>(KEYS.SUPPLIES, [
    { id: 's1', name: '9mm lőszer', category: 'Lőszer', unit: 'db', currentQty: 2400, minQty: 500, description: '', movements: [] },
    { id: 's2', name: '5.56mm lőszer', category: 'Lőszer', unit: 'db', currentQty: 8500, minQty: 2000, description: '', movements: [] },
    { id: 's3', name: 'Kézigránát (gyakorló)', category: 'Lőszer', unit: 'db', currentQty: 45, minQty: 20, description: '', movements: [] },
    { id: 's4', name: 'Gázolaj', category: 'Üzemanyag', unit: 'liter', currentQty: 320, minQty: 200, description: '', movements: [] },
    { id: 's5', name: 'Benzin', category: 'Üzemanyag', unit: 'liter', currentQty: 85, minQty: 150, description: '', movements: [] },
    { id: 's6', name: 'Harci fejadagok (MRE)', category: 'Élelmiszer', unit: 'csomag', currentQty: 180, minQty: 100, description: '', movements: [] },
    { id: 's7', name: 'Ivóvíz tartalék', category: 'Élelmiszer', unit: 'liter', currentQty: 0, minQty: 200, description: '', movements: [] },
    { id: 's8', name: 'Kötszer csomag', category: 'Gyógyszer', unit: 'db', currentQty: 62, minQty: 30, description: '', movements: [] },
    { id: 's9', name: 'Morfium injekció', category: 'Gyógyszer', unit: 'db', currentQty: 8, minQty: 10, description: '', movements: [] },
    { id: 's10', name: 'Írószer csomag', category: 'Irodaszer', unit: 'csomag', currentQty: 15, minQty: 5, description: '', movements: [] },
    { id: 's11', name: 'Akkumulátor (9V)', category: 'Műszaki anyag', unit: 'db', currentQty: 120, minQty: 50, description: '', movements: [] },
    { id: 's12', name: 'Rádió elem készlet', category: 'Műszaki anyag', unit: 'csomag', currentQty: 28, minQty: 20, description: '', movements: [] },
  ]);

  // Vehicles
  set<Vehicle>(KEYS.VEHICLES, [
    { id: 'v1', plateNumber: 'ABC-123', type: 'Terepjáró', makeModel: 'Land Rover Defender', year: 2019, km: 42500, nextService: '2025-06-15', nextInspection: '2026-01-10', status: 'Elérhető', notes: '', serviceLog: [] },
    { id: 'v2', plateNumber: 'DEF-456', type: 'Terepjáró', makeModel: 'Mercedes G-Osztály', year: 2021, km: 28300, nextService: '2025-08-20', nextInspection: '2026-03-15', status: 'Használatban', notes: '', assignedTo: 'p2', assignedToName: 'Kovács János', serviceLog: [] },
    { id: 'v3', plateNumber: 'GHI-789', type: 'Tehergépjármű', makeModel: 'MAN TGS', year: 2017, km: 187600, nextService: '2025-04-30', nextInspection: '2025-05-12', status: 'Szervizben', notes: '', serviceLog: [] },
    { id: 'v4', plateNumber: 'JKL-012', type: 'Személyautó', makeModel: 'Skoda Octavia', year: 2020, km: 55200, nextService: '2025-07-01', nextInspection: '2025-11-20', status: 'Elérhető', notes: '', serviceLog: [] },
    { id: 'v5', plateNumber: 'MNO-345', type: 'Busz', makeModel: 'Ikarus 256', year: 2008, km: 312400, nextService: '2025-05-05', nextInspection: '2025-06-30', status: 'Meghibásodott', notes: 'Váltó csere szükséges', serviceLog: [] },
  ]);

  // Duties
  set<Duty>(KEYS.DUTIES, [
    { id: 'd1', type: 'Őrszolgálat', startDate: '2025-04-05T08:00', endDate: '2025-04-06T08:00', location: 'Laktanya főbejárat', personId: 'p6', personName: 'Varga Gábor', notes: '', status: 'Tervezett' },
    { id: 'd2', type: 'Őrszolgálat', startDate: '2025-04-06T08:00', endDate: '2025-04-07T08:00', location: 'Laktanya főbejárat', personId: 'p10', personName: 'Simon Ádám', notes: '', status: 'Tervezett' },
    { id: 'd3', type: 'Ügyeleti szolgálat', startDate: '2025-04-07T00:00', endDate: '2025-04-08T00:00', location: 'Parancsnoki épület', personId: 'p11', personName: 'Lukács Béla', notes: '', status: 'Tervezett' },
    { id: 'd4', type: 'Készenléti szolgálat', startDate: '2025-04-10T06:00', endDate: '2025-04-11T06:00', location: 'Laktanya', personId: 'p4', personName: 'Horváth Zoltán', notes: '', status: 'Tervezett' },
    { id: 'd5', type: 'Rendezvénybiztosítás', startDate: '2025-04-15T09:00', endDate: '2025-04-15T18:00', location: 'Városháza tér', personId: 'p2', personName: 'Kovács János', notes: '', status: 'Tervezett' },
    { id: 'd6', type: 'Őrszolgálat', startDate: '2025-03-28T08:00', endDate: '2025-03-29T08:00', location: 'Laktanya főbejárat', personId: 'p3', personName: 'Nagy Péter', notes: '', status: 'Teljesített' },
    { id: 'd7', type: 'Ügyeleti szolgálat', startDate: '2025-03-30T00:00', endDate: '2025-03-31T00:00', location: 'Parancsnoki épület', personId: 'p9', personName: 'Molnár Dóra', notes: '', status: 'Teljesített' },
  ]);

  // Announcements
  set<Announcement>(KEYS.ANNOUNCEMENTS, [
    { id: 'a1', title: 'Tavaszi nagypraktika előkészítése', category: 'Fontos', content: 'Az április végi nagypraktikára való felkészülés megkezdődött. Kérem az érintett személyek felszerelésének ellenőrzését és a szükséges pótlások jelzését az adminisztrációnak legkésőbb április 1-ig.', author: 'Szabó Anna', date: '2025-03-20', pinned: true },
    { id: 'a2', title: 'Orvosi alkalmassági vizsgálat', category: 'Sürgős', content: 'Minden tartalékos állományú személynek április 15-ig orvosi alkalmasság vizsgálaton kell részt vennie. Időpontfoglalás az adminisztrációs irodában.', author: 'Farkas Réka', date: '2025-03-25', pinned: true },
    { id: 'a3', title: 'NBC kiképzés – kötelező felszerelés lista', category: 'Gyakorlat', content: 'Az május eleji NBC védelmi kiképzéshez szükséges személyes felszerelés listája: gázálarc, védőöltözet, egyéni elsősegély csomag. A felszereléseket kiadás előtt ellenőrizni kell.', author: 'Lukács Béla', date: '2025-03-28', pinned: false },
    { id: 'a4', title: 'Új raktárhelyiség átadása', category: 'Általános', content: 'Értesítjük az állományt, hogy a B épület alagsorában az új raktárhelyiség átadásra kerül. A készletek tárolása április 3-tól az új helyszínen történik.', author: 'Szabó Anna', date: '2025-04-01', pinned: false },
    { id: 'a5', title: 'Éves értékelő lapok kitöltése', category: 'Adminisztráció', content: 'Kérem a szakaszparancsnokokat az éves értékelő lapok kitöltését és visszajuttatását a törzsre április 20-ig.', author: 'Farkas Réka', date: '2025-04-02', pinned: false },
  ]);

  // Activity log seed
  set<ActivityLogEntry>(KEYS.ACTIVITY_LOG, [
    { id: 'al1', timestamp: '2025-04-02T14:30:00Z', userId: 'admin', userName: 'Szabó Anna', action: 'létrehozva', module: 'Hírek', recordName: 'Éves értékelő lapok kitöltése' },
    { id: 'al2', timestamp: '2025-04-01T10:00:00Z', userId: 'admin', userName: 'Szabó Anna', action: 'létrehozva', module: 'Hírek', recordName: 'Új raktárhelyiség átadása' },
    { id: 'al3', timestamp: '2025-04-01T09:15:00Z', userId: 'admin', userName: 'Szabó Anna', action: 'módosítva', module: 'Felszerelés', recordName: 'Gázálarc (GAZ-002-H)' },
    { id: 'al4', timestamp: '2025-03-28T16:00:00Z', userId: 'kovacs', userName: 'Kovács János', action: 'módosítva', module: 'Szolgálatok', recordName: 'Őrszolgálat — Nagy Péter' },
    { id: 'al5', timestamp: '2025-03-25T11:30:00Z', userId: 'admin', userName: 'Szabó Anna', action: 'létrehozva', module: 'Hírek', recordName: 'Orvosi alkalmassági vizsgálat' },
    { id: 'al6', timestamp: '2025-03-22T08:45:00Z', userId: 'admin', userName: 'Szabó Anna', action: 'módosítva', module: 'Felszerelés', recordName: 'Elsősegély csomag (MED-002-E)' },
    { id: 'al7', timestamp: '2025-03-20T14:00:00Z', userId: 'admin', userName: 'Szabó Anna', action: 'létrehozva', module: 'Gyakorlatok', recordName: 'Nyári nagypraktika 2025' },
    { id: 'al8', timestamp: '2025-03-18T09:00:00Z', userId: 'admin', userName: 'Szabó Anna', action: 'módosítva', module: 'Járművek', recordName: 'DEF-456' },
    { id: 'al9', timestamp: '2025-03-15T13:00:00Z', userId: 'admin', userName: 'Szabó Anna', action: 'létrehozva', module: 'Kiképzések', recordName: 'Lövészeti mesterkurzus' },
    { id: 'al10', timestamp: '2025-03-10T10:30:00Z', userId: 'admin', userName: 'Szabó Anna', action: 'módosítva', module: 'Személyek', recordName: 'Simon Ádám' },
  ]);

  localStorage.setItem(KEYS.INITIALIZED, 'true');
}
