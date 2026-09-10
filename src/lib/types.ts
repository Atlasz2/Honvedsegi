export type Role = 'reader' | 'editor' | 'admin' | 'fejleszto';

export interface User {
  username: string;
  password?: string;
  displayName: string;
  role: Role;
  active: boolean;
  lastLogin?: string;
}

export interface AuthToken {
  username: string;
  displayName: string;
  role: Role;
  expiry: number;
}

export interface Person {
  id: string;
  name: string;
  sztsz: string;
  rank: string;
  unit: string;
  beosztas: string;
  status: 'Aktív' | 'Tartalékos' | 'Szabadságon' | 'Leszerelt';
  email: string;
  phone: string;
  birthDate: string;
  address: string;
  joinDate: string;
  notes: string;
  qualifications: string[];
}

/**
 * Egy eseményhez beosztott személy közös mezői. A gyakorlat- és kiképzés-beosztás
 * ezt bővíti; a Műveletek oldal a kettőt együtt kezeli, ezért ez a közös szerződés.
 */
export interface PersonAssignment {
  personId: string;
  personName: string;
  attendance?: string;
  rank?: string;
  rankShort?: string;
  sztsz?: string;
}

export interface ExerciseAssignment extends PersonAssignment {
  role: string;
}

export interface Exercise {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  maxPersonnel: number;
  description: string;
  status: 'Tervezett' | 'Folyamatban' | 'Befejezett' | 'Törölve';
  qualificationId?: string;
  seriesId?: string;
  level?: string;
  assigned: ExerciseAssignment[];
}

export interface Series {
  id: string;
  name: string;
  description: string;
  itemCount: number;
}

export interface TrainingAssignment extends PersonAssignment {
  attendance: 'Tervezett' | 'Megjelent' | 'Hiányzott' | 'Beteg';
  qualificationApproved?: boolean;
}

export interface Training {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  organizer: string;
  qualificationId: string;
  maxPersonnel: number;
  description: string;
  status: 'Tervezett' | 'Folyamatban' | 'Befejezett';
  seriesId?: string;
  level?: string;
  assigned: TrainingAssignment[];
}


export interface BasicAssignment {
  personId: string;
  personName: string;
  rank?: string;
  rankShort?: string;
  sztsz?: string;
  attendance?: string;
  role?: string;
}

export interface AppEvent {
  id: string;
  eventType: 'esemeny';
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  organizer: string;
  maxPersonnel: number;
  description: string;
  status: 'Tervezett' | 'Folyamatban' | 'Befejezett' | 'Törölve';
  assigned: BasicAssignment[];
}

export interface CheckoutRecord {
  personId: string;
  personName: string;
  checkedOutDate: string;
  returnedDate?: string;
  note: string;
}

export interface Equipment {
  id: string;
  name: string;
  category: string;
  serialNumber: string;
  qrCode: string;
  condition: 'Jó' | 'Javítandó' | 'Selejtezendő';
  description: string;
  checkedOutTo?: string;
  checkedOutToName?: string;
  checkedOutDate?: string;
  checkoutHistory: CheckoutRecord[];
}

export interface SupplyMovement {
  id: string;
  type: 'Bevételezés' | 'Kiadás' | 'Visszavétel' | 'Selejtezés' | 'Korrekció';
  quantity: number;
  note: string;
  date: string;
  userId: string;
  userName: string;
}

export interface Supply {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentQty: number;
  minQty: number;
  description: string;
  movements: SupplyMovement[];
}

export interface ServiceRecord {
  id: string;
  date: string;
  description: string;
  cost: number;
  nextServiceDate: string;
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  type: string;
  makeModel: string;
  year: number;
  km: number;
  nextService: string;
  nextInspection: string;
  status: 'Elérhető' | 'Használatban' | 'Szervizben' | 'Meghibásodott' | 'Selejtezett';
  notes: string;
  assignedTo?: string;
  assignedToName?: string;
  serviceLog: ServiceRecord[];
}

export interface Duty {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  personId: string;
  personName: string;
  assigned: BasicAssignment[];
  notes: string;
  status: 'Tervezett' | 'Teljesített' | 'Lemondva';
}

export interface Announcement {
  id: string;
  title: string;
  category: 'Általános' | 'Fontos' | 'Sürgős' | 'Gyakorlat' | 'Adminisztráció';
  content: string;
  author: string;
  date: string;
  pinned: boolean;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole?: string;
  action: 'létrehozva' | 'módosítva' | 'törölve';
  module: string;
  recordName: string;
  payload?: Record<string, unknown> | null;
}

// ── Képesítés-típusok ──────────────────────────────────────────────────────────

export interface QualificationType {
  id: string;
  name: string;
  category: string;
  validityDays: number | null;
  description: string;
}

export interface PersonnelQualification {
  id: string;
  personnelId: string;
  qualTypeId: string;
  qualTypeName: string;
  qualTypeCategory: string;
  validityDays: number | null;
  earnedDate: string;
  expiryDate: string | null;
  sourceEventId: string | null;
  sourceEventType: string | null;
  notes: string;
  isExpired: boolean;
  daysUntilExpiry: number | null;
}

export interface QualificationAlert {
  personnelId: string;
  personnelName: string;
  rank: string;
  unit: string;
  qualificationId: string;
  qualTypeName: string;
  qualTypeCategory: string;
  earnedDate: string;
  expiryDate: string;
  daysUntilExpiry: number;
  isExpired: boolean;
}

export interface QualificationStat {
  id: string;
  name: string;
  category: string;
  validityDays: number | null;
  totalPersonnel: number;
  holdersAll: number;
  holdersValid: number;
}

// ── Résztvevők ─────────────────────────────────────────────────────────────────

export type ParticipantStatus =
  | 'Tervezett' | 'Megjelent' | 'Hiányzott' | 'Beteg' | 'Teljesített' | 'Lemondva';

export interface Participant {
  id: string;
  personnelId: string;
  personName: string;
  rank: string;
  rankShort: string;
  sztsz: string;
  role: string;
  status: ParticipantStatus;
  qualificationApproved: boolean;
  notes: string;
}

// ── Személytörténet ────────────────────────────────────────────────────────────

export interface PersonHistoryEntry {
  eventType: 'exercise' | 'training' | 'event' | 'duty';
  eventId: string;
  status: string;
  role: string;
  qualificationApproved: boolean;
  notes: string;
}
