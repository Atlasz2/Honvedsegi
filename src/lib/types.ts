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
  completedOperations?: Array<{
    operationId: string;
    operationName: string;
    success: boolean;
    qualificationId: string;
    date: string;
  }>;
}

export interface ExerciseAssignment {
  personId: string;
  personName: string;
  role: string;
  attendance?: string;
  rank?: string;
  rankShort?: string;
  sztsz?: string;
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
  assigned: ExerciseAssignment[];
}

export interface TrainingAssignment {
  personId: string;
  personName: string;
  attendance: 'Tervezett' | 'Megjelent' | 'Hiányzott' | 'Beteg';
  qualificationApproved?: boolean;
  rank?: string;
  rankShort?: string;
  sztsz?: string;
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
  parentId?: string | null;
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
  action: 'létrehozva' | 'módosítva' | 'törölve';
  module: string;
  recordName: string;
  payload?: Record<string, unknown> | null;
}
export type AttendanceStatus = 'Present' | 'Excused' | 'Absent' | 'Pending';
export type RequirementStatus = 'Requested' | 'Approved' | 'Fulfilled';

export interface OperationTreeNode extends AppEvent {
  parentId?: string | null;
  children: OperationTreeNode[];
}

export interface AttendanceEntry {
  personId: string;
  personName: string;
  status: AttendanceStatus;
  note: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AttendanceEntryUpdate {
  personId: string;
  personName: string;
  status: AttendanceStatus;
  note: string;
}

export interface MaterialRequirement {
  id: string;
  operationId: string;
  itemName: string;
  quantity: number;
  unit: string;
  note: string;
  status: RequirementStatus;
}

export interface OperationDocument {
  id: string;
  operationId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  title: string;
}

export interface BugReport {
  id: string;
  title: string;
  description: string;
  page: string;
  severity: "low" | "normal" | "high" | "critical";
  status: "open" | "resolved";
  reportedBy: string;
  reportedByName: string;
  createdAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  screenshotData?: string | null;
}
