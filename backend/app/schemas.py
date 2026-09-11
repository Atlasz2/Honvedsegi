from __future__ import annotations

from datetime import datetime
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


Role = Literal["reader", "editor", "admin", "fejleszto"]
PersonStatus = Literal["Aktív", "Tartalékos", "Szabadságon", "Leszerelt"]
ExerciseStatus = Literal["Tervezett", "Folyamatban", "Befejezett", "Törölve"]
TrainingStatus = Literal["Tervezett", "Folyamatban", "Befejezett"]
TrainingAttendance = Literal["Tervezett", "Megjelent", "Hiányzott", "Beteg"]
EquipmentCondition = Literal["Jó", "Javítandó", "Selejtezendő"]
VehicleStatus = Literal["Elérhető", "Használatban", "Szervizben", "Meghibásodott", "Selejtezett"]
DutyStatus = Literal["Tervezett", "Teljesített", "Lemondva"]
AnnouncementCategory = Literal["Általános", "Fontos", "Sürgős", "Gyakorlat", "Adminisztráció"]
ActivityAction = Literal["létrehozva", "módosítva", "törölve"]
SupplyMoveType = Literal["Bevételezés", "Kiadás", "Visszavétel", "Selejtezés", "Korrekció"]
AttendanceStatus = Literal[
    "Jelen", "Szabadság", "Betegállomány", "Vezényelve",
    "Szolgálatban", "Kiküldetés", "Igazolt távollét", "Igazolatlan távollét",
]
LeaveType = Literal["Szabadság", "Betegszabadság", "Kiküldetés", "Egyéb"]
LeaveStatus = Literal["Beadva", "Jóváhagyva", "Elutasítva"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserRead(ORMModel):
    username: str
    display_name: str
    role: Role
    active: bool
    last_login: datetime | None = None


class UserCreate(BaseModel):
    username: str
    password: str
    display_name: str
    role: Role
    active: bool = True


class UserUpdate(BaseModel):
    display_name: str
    role: Role
    active: bool
    password: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthUser(BaseModel):
    username: str
    displayName: str
    role: Role
    expiry: int


class LoginResponse(BaseModel):
    token: str
    user: AuthUser


# ── Napi létszám / jelenléti ív ────────────────────────────────────────────

class AttendanceEntry(BaseModel):
    personnelId: str
    name: str
    rank: str
    unit: str
    status: AttendanceStatus
    note: str = ""


class AttendanceDayRead(BaseModel):
    date: str
    total: int
    summary: dict[str, int]
    items: list[AttendanceEntry]


class AttendanceMark(BaseModel):
    personnelId: str
    status: AttendanceStatus
    note: str = ""


class AttendanceUpdate(BaseModel):
    date: str
    items: list[AttendanceMark]


class AttendanceFill(BaseModel):
    date: str
    eventType: str
    eventId: str
    status: AttendanceStatus


# ── Képzési követelmény / jogosultság ───────────────────────────────────────

class QualTypeRef(BaseModel):
    id: str
    name: str


class PrerequisiteRead(BaseModel):
    qualTypeIds: list[str]
    qualTypes: list[QualTypeRef]


class PrerequisiteSet(BaseModel):
    qualTypeIds: list[str]


class EligibilityPerson(BaseModel):
    personnelId: str
    name: str
    rank: str
    unit: str
    eligible: bool
    missing: list[str]


# ── Személyi okmányok / alkalmasság ─────────────────────────────────────────

DocumentCategory = Literal["Okmány", "Alkalmasság", "Szerződés", "Egyéb"]


class PersonDocumentCreate(BaseModel):
    category: DocumentCategory = "Okmány"
    name: str
    identifier: str = ""
    issuedDate: str = ""
    expiryDate: str | None = None
    notes: str = ""


class PersonDocumentRead(BaseModel):
    id: str
    personnelId: str
    category: str
    name: str
    identifier: str
    issuedDate: str
    expiryDate: str | None
    notes: str
    isExpired: bool
    daysUntilExpiry: int | None


# ── Szabadság / távollét ────────────────────────────────────────────────────

class LeaveRequestCreate(BaseModel):
    personnelId: str
    type: LeaveType
    startDate: str
    endDate: str
    reason: str = ""


class LeaveDecision(BaseModel):
    approve: bool


class LeaveRequestRead(BaseModel):
    id: str
    personnelId: str
    personName: str
    type: LeaveType
    startDate: str
    endDate: str
    days: int
    reason: str
    status: LeaveStatus
    requestedBy: str
    decidedBy: str
    decidedAt: datetime | None
    createdAt: datetime


class PersonBase(BaseModel):
    name: str
    sztsz: str
    rank: str
    unit: str
    beosztas: str = ""
    status: PersonStatus
    email: str = ""
    phone: str = ""
    birthDate: str = ""
    address: str = ""
    joinDate: str = ""
    notes: str = ""
    qualifications: list[str] = Field(default_factory=list)


class PersonCreate(PersonBase):
    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        raw = (value or "").strip()
        if not raw:
            return ""
        digits = re.sub(r"\D", "", raw)
        if digits.startswith("06"):
            digits = digits[2:]
        elif digits.startswith("36"):
            digits = digits[2:]
        if len(digits) != 9:
            raise ValueError("A telefonszám formátuma: +36 XX XXX XXXX")
        return f"+36 {digits[:2]} {digits[2:5]} {digits[5:]}"


class PersonUpdate(PersonBase):
    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        return PersonCreate.normalize_phone(value)


class PersonRead(PersonBase):
    id: str


class ExerciseAssignment(BaseModel):
    personId: str
    personName: str
    role: str
    attendance: TrainingAttendance | None = None
    rank: str | None = None
    rankShort: str | None = None
    sztsz: str | None = None


class ExerciseBase(BaseModel):
    name: str
    type: str
    startDate: str
    endDate: str
    location: str = ""
    maxPersonnel: int = 0
    description: str = ""
    status: ExerciseStatus
    qualificationId: str = ""
    seriesId: str = ""
    level: str = ""
    assigned: list[ExerciseAssignment] = []


class ExerciseCreate(ExerciseBase):
    pass


class ExerciseUpdate(ExerciseBase):
    pass


class ExerciseRead(ExerciseBase):
    id: str


class TrainingAssignment(BaseModel):
    personId: str
    personName: str
    attendance: TrainingAttendance
    qualificationApproved: bool = False


class TrainingBase(BaseModel):
    name: str
    type: str
    startDate: str
    endDate: str
    location: str = ""
    organizer: str = ""
    qualificationId: str = ""
    maxPersonnel: int = 0
    description: str = ""
    status: TrainingStatus
    seriesId: str = ""
    level: str = ""
    assigned: list[TrainingAssignment] = []


class TrainingCreate(TrainingBase):
    pass


class TrainingUpdate(TrainingBase):
    pass


class SeriesBase(BaseModel):
    name: str
    description: str = ""


class SeriesCreate(SeriesBase):
    pass


class SeriesUpdate(SeriesBase):
    pass


class SeriesRead(SeriesBase):
    id: str
    itemCount: int = 0


class TrainingRead(TrainingBase):
    id: str


class OperationRead(BaseModel):
    id: str
    name: str
    type: str
    operationType: Literal["exercise", "training"]
    startDate: str
    endDate: str
    location: str
    organizer: str | None = None
    maxPersonnel: int
    description: str
    status: str
    assigned: list[dict] = []


# ── Műveletek: fa, jelenlét, anyagigény, dokumentumok ─────────────────────

AttendanceState = Literal["Present", "Excused", "Absent", "Pending"]
RequirementStatus = Literal["Requested", "Approved", "Fulfilled"]


class OperationTreeNode(BaseModel):
    """Egy csomópont a művelet-fában, a gyerekeivel együtt."""
    id: str
    eventType: Literal["esemeny"] = "esemeny"
    parentId: str | None = None
    name: str
    type: str
    startDate: str
    endDate: str
    location: str = ""
    organizer: str = ""
    maxPersonnel: int = 0
    description: str = ""
    status: str
    assigned: list[dict] = []
    children: list["OperationTreeNode"] = []


class AttendanceEntryRead(BaseModel):
    personId: str
    personName: str
    status: AttendanceState
    note: str = ""
    updatedAt: str
    updatedBy: str = ""


class AttendanceEntryUpdate(BaseModel):
    personName: str | None = None
    status: AttendanceState | None = None
    note: str | None = None


class AttendanceBatchEntry(BaseModel):
    personId: str
    personName: str = ""
    status: AttendanceState = "Pending"
    note: str = ""


class AttendanceBatchUpdateRequest(BaseModel):
    entries: list[AttendanceBatchEntry] = []


class MaterialRequirementBase(BaseModel):
    itemName: str
    quantity: int = 0
    unit: str = ""
    note: str = ""
    status: RequirementStatus = "Requested"


class MaterialRequirementUpdate(BaseModel):
    itemName: str | None = None
    quantity: int | None = None
    unit: str | None = None
    note: str | None = None
    status: RequirementStatus | None = None


class MaterialRequirementRead(MaterialRequirementBase):
    id: str
    operationId: str


class OperationDocumentRead(BaseModel):
    id: str
    operationId: str
    filename: str
    originalName: str
    mimeType: str
    fileSize: int
    uploadedBy: str = ""
    uploadedAt: str
    title: str = ""


class EventBase(BaseModel):
    eventType: Literal["esemeny"] = "esemeny"
    name: str
    type: str
    startDate: str
    endDate: str
    location: str = ""
    organizer: str = ""
    maxPersonnel: int = 0
    description: str = ""
    status: ExerciseStatus
    assigned: list[dict] = []
    parentId: str | None = None   # szülő a művelet-fában


class EventCreate(EventBase):
    pass


class EventUpdate(EventBase):
    pass


class EventRead(EventBase):
    id: str




class CheckoutRecord(BaseModel):
    personId: str
    personName: str
    checkedOutDate: str
    returnedDate: str | None = None
    note: str = ""


class EquipmentBase(BaseModel):
    name: str
    category: str
    serialNumber: str = ""
    qrCode: str = ""
    condition: EquipmentCondition
    description: str = ""
    checkedOutTo: str | None = None
    checkedOutToName: str | None = None
    checkedOutDate: str | None = None
    checkoutHistory: list[CheckoutRecord] = []


class EquipmentCreate(EquipmentBase):
    pass


class EquipmentUpdate(EquipmentBase):
    pass


class EquipmentRead(EquipmentBase):
    id: str


class EquipmentCheckoutRequest(BaseModel):
    personId: str
    note: str = ""


class SupplyMovement(BaseModel):
    id: str
    type: SupplyMoveType
    quantity: int
    note: str = ""
    date: str
    userId: str
    userName: str


class SupplyBase(BaseModel):
    name: str
    category: str
    unit: str
    currentQty: int = 0
    minQty: int = 0
    description: str = ""
    movements: list[SupplyMovement] = []


class SupplyCreate(SupplyBase):
    pass


class SupplyUpdate(SupplyBase):
    pass


class SupplyRead(SupplyBase):
    id: str


class SupplyMovementCreate(BaseModel):
    type: SupplyMoveType
    quantity: int
    note: str = ""


class ServiceRecord(BaseModel):
    id: str
    date: str
    description: str
    cost: int
    nextServiceDate: str


class VehicleBase(BaseModel):
    plateNumber: str
    type: str
    makeModel: str = ""
    year: int = 0
    km: int = 0
    nextService: str = ""
    nextInspection: str = ""
    status: VehicleStatus
    notes: str = ""
    assignedTo: str | None = None
    assignedToName: str | None = None
    serviceLog: list[ServiceRecord] = []


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(VehicleBase):
    pass


class VehicleRead(VehicleBase):
    id: str


class VehicleAssignRequest(BaseModel):
    personId: str


class DutyAssignment(BaseModel):
    personId: str
    personName: str
    rank: str | None = None
    rankShort: str | None = None
    sztsz: str | None = None


class DutyBase(BaseModel):
    type: str
    startDate: str
    endDate: str
    location: str = ""
    personId: str = ""
    personName: str = ""
    assigned: list[DutyAssignment] = Field(default_factory=list)
    notes: str = ""
    status: DutyStatus


class DutyCreate(DutyBase):
    pass


class DutyUpdate(DutyBase):
    pass


class DutyRead(DutyBase):
    id: str


class AnnouncementBase(BaseModel):
    title: str
    category: AnnouncementCategory
    content: str
    author: str
    date: str
    pinned: bool = False


class AnnouncementCreate(BaseModel):
    title: str
    category: AnnouncementCategory
    content: str
    pinned: bool = False


class AnnouncementUpdate(AnnouncementCreate):
    pass


class AnnouncementRead(AnnouncementBase):
    id: str


class ActivityLogCreate(BaseModel):
    userId: str
    userName: str
    action: ActivityAction
    module: str
    recordName: str
    payload: dict | None = None


class ActivityLogRead(BaseModel):
    id: str
    timestamp: str
    userId: str
    userName: str
    userRole: str = ""
    action: ActivityAction
    module: str
    recordName: str
    payload: dict | None = None



# ── Képesítés-típusok ──────────────────────────────────────────────────────────

class QualificationTypeBase(BaseModel):
    name: str
    category: str
    validityDays: int | None = None
    description: str = ""


class QualificationTypeCreate(QualificationTypeBase):
    pass


class QualificationTypeUpdate(QualificationTypeBase):
    pass


class QualificationTypeRead(QualificationTypeBase):
    model_config = ConfigDict(from_attributes=True)
    id: str


# ── Személyi képesítések ───────────────────────────────────────────────────────

class PersonnelQualificationBase(BaseModel):
    personnelId: str
    qualTypeId: str
    earnedDate: str
    expiryDate: str | None = None
    sourceEventId: str | None = None
    sourceEventType: str | None = None
    notes: str = ""


class PersonnelQualificationCreate(PersonnelQualificationBase):
    pass


class PersonnelQualificationUpdate(BaseModel):
    earnedDate: str
    expiryDate: str | None = None
    sourceEventId: str | None = None
    sourceEventType: str | None = None
    notes: str = ""


class PersonnelQualificationRead(ORMModel):
    id: str
    personnelId: str
    qualTypeId: str
    qualTypeName: str
    qualTypeCategory: str
    validityDays: int | None = None
    earnedDate: str
    expiryDate: str | None = None
    sourceEventId: str | None = None
    sourceEventType: str | None = None
    notes: str = ""
    isExpired: bool = False
    daysUntilExpiry: int | None = None


# ── Résztvevők ─────────────────────────────────────────────────────────────────

ParticipantStatus = Literal[
    "Tervezett", "Megjelent", "Hiányzott", "Beteg", "Teljesített", "Lemondva"
]


class ParticipantBase(BaseModel):
    personnelId: str
    personName: str
    rank: str = ""
    rankShort: str = ""
    sztsz: str = ""
    role: str = ""
    status: ParticipantStatus = "Tervezett"
    qualificationApproved: bool = False
    notes: str = ""


class ParticipantCreate(ParticipantBase):
    pass


class ParticipantUpdate(BaseModel):
    status: ParticipantStatus
    role: str = ""
    qualificationApproved: bool = False
    notes: str = ""


class ParticipantRead(ParticipantBase):
    id: str


# ── Figyelmeztetések ──────────────────────────────────────────────────────────

class QualificationAlert(BaseModel):
    personnelId: str
    personnelName: str
    rank: str
    unit: str
    qualificationId: str
    qualTypeName: str
    qualTypeCategory: str
    earnedDate: str
    expiryDate: str
    daysUntilExpiry: int
    isExpired: bool


class ImportIssue(BaseModel):
    line: int
    message: str


class PersonnelImportResult(BaseModel):
    totalRows: int
    created: int
    updated: int
    skipped: int
    dryRun: bool = False
    issues: list[ImportIssue] = []


class ImportPreviewItem(BaseModel):
    line: int
    action: Literal["create", "update", "skip"]
    key: str
    name: str
    enabled: bool = True
    data: dict[str, str] = {}
    rawData: dict[str, str] = {}
    unknownData: dict[str, str] = {}
    issues: list[str] = []


class ImportMissingPerson(BaseModel):
    """A nyilvántartásban szereplő, de a feltöltött fájlból hiányzó személy."""
    id: str
    name: str
    sztsz: str
    unit: str
    status: str


class ImportPreviewResult(BaseModel):
    draftId: str
    entity: Literal["personnel", "exercises"]
    totalRows: int
    created: int
    updated: int
    skipped: int
    issues: list[ImportIssue] = []
    items: list[ImportPreviewItem] = []
    # Fejlécek, amiket a rendszer nem tudott mezőhöz rendelni — az adatuk kimarad.
    unknownColumns: list[str] = []
    # Csak személyzetnél: akik a nyilvántartásban vannak, de a fájlban nem
    # (napi KGIR-exportnál ez a leszereltek / hibás export jelzője).
    missingCount: int = 0
    missing: list[ImportMissingPerson] = []


class ImportDraftItemUpdate(BaseModel):
    line: int
    enabled: bool = True
    data: dict[str, str] = {}


class ImportDraftUpdateRequest(BaseModel):
    items: list[ImportDraftItemUpdate] = []


class ImportConfirmResult(BaseModel):
    draftId: str
    entity: Literal["personnel", "exercises"]
    applied: bool
    created: int
    updated: int
    skipped: int


