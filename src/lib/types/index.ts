// ============================================================================
// TAMILNADU SUPPLIERS - TYPE DEFINITIONS
// ============================================================================

export type GstType = "GST_REGISTERED" | "NON_GST" | "GST";

export interface Company {
  id: string;
  name: string;
  displayName: string;
  gstType: GstType;
  gstin?: string | null;
  pan?: string | null;
  email?: string | null;
  phone?: string | null;
  address: string;
  state: string;
  stateCode: string;
  placeOfSupply: string;
  bankName: string;
  bankAccountNo: string;
  bankIfsc: string;
  bankBranch: string;
  invoicePrefix: string;
  quotationPrefix: string;
  gatePassPrefix: string;
  nextInvoiceNo: number;
  nextQuotationNo: number;
  nextGatePassNo: number;
  logoUrl?: string | null;
  termsAndConditions: string;
  authorizedSignatoryTitle: string;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

import { ModulePermissionId } from "./permissions";
export * from "./permissions";

export type UserRole = "SUPER_ADMIN" | "ADMIN" | "BILLING" | "EMPLOYEE";

export type Permission = ModulePermissionId;

export interface User {
  id: string;
  email: string;
  username?: string | null;
  name: string;
  phone?: string | null;
  role: UserRole;
  status: "ACTIVE" | "INACTIVE";
  passwordHash?: string;
  mustChangePassword?: boolean;
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  parentId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RentalRateUnit = "PER_DAY" | "PER_EVENT" | "PER_SQFT";

export interface Product {
  id: string;
  name: string;
  alias?: string | null;
  sku?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  description?: string | null;
  sizeSpec?: string | null;
  unit: string;
  defaultRentalRate: number;
  rentalRate?: number;
  rentalRateUnit: RentalRateUnit;
  minRentalDuration: number;
  securityDepositAmount: number;
  replacementValue: number;
  totalOwnedQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  rentedQuantity: number;
  damagedQuantity: number;
  missingQuantity: number;
  maintenanceQuantity: number;
  isActive: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerBranch {
  id: string;
  customerId: string;
  branchName: string;
  contactPerson?: string | null;
  phone?: string | null;
  address: string;
  city: string;
  state: string;
  postalCode?: string | null;
  deliveryInstructions?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  contactPerson?: string | null;
  mobile: string;
  whatsapp?: string | null;
  email?: string | null;
  billingAddress: string;
  gstin?: string | null;
  state: string;
  postalCode?: string | null;
  notes?: string | null;
  isActive: boolean;
  branches?: CustomerBranch[];
  createdAt: string;
  updatedAt: string;
}

export type QuotationStatus =
  | "DRAFT"
  | "ISSUED"
  | "SENT"
  | "REQUIRES_REVISION"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "CONVERTED"
  | "CANCELLED";

export interface QuotationRevision {
  revisionNumber: number;
  quotationDate: string;
  rentalStartDate: string;
  rentalEndDate: string;
  rentalDays: number;
  grandTotal: number;
  reason?: string | null;
  revisionNotes?: string | null;
  notes?: string | null;
  notesList?: string[] | null;
  items?: QuotationItem[];
  branches?: QuotationBranch[];
  financials: {
    subtotal: number;
    transportCharges: number;
    loadingCharges: number;
    laborCharges: number;
    otherCharges: number;
    discountAmount: number;
    taxableAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    totalTax: number;
    grandTotal: number;
  };
  createdAt: string;
  createdBy?: string;
}

export type DocumentEntryType = "product" | "note";

export interface DocumentLine {
  id: string;
  entryType: DocumentEntryType;
  position: number;
  text?: string;
  productId?: string;
  itemName?: string;
  sizeSpec?: string | null;
  quantity?: number;
  days?: number;
  unitPrice?: number;
  amount?: number;
  deliveryLocation?: string | null;
  pickupLocation?: string | null;
  notes?: string | null;
  quantityPhysicallyReturned?: number;
  quantityReturnedGood?: number;
  returnedGoodQuantity?: number;
  quantityDamaged?: number;
  quantityMissing?: number;
  damageChargeDecision?: IncidentChargeStatus;
  damageChargeAmount?: number;
  missingChargeDecision?: IncidentChargeStatus;
  missingChargeAmount?: number;
  damageNotes?: string | null;
  missingNotes?: string | null;
}

export interface QuotationItem {
  id: string;
  quotationBranchId?: string;
  quotationId?: string;
  entryType?: DocumentEntryType;
  position?: number;
  productId?: string;
  itemName: string;
  sizeSpec?: string | null;
  quantity: number;
  days: number;
  unitPrice: number;
  amount: number;
  itemOrder: number;
  notes?: string | null;
  text?: string | null;
  deliveryLocation?: string | null;
}

export interface QuotationBranch {
  id: string;
  quotationId: string;
  customerBranchId?: string | null;
  branchName: string;
  deliveryAddress?: string | null;
  sectionOrder: number;
  branchSubtotal: number;
  items: QuotationItem[];
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  revisionNumber: number;
  revisionHistory?: QuotationRevision[];
  companyId: string;
  companySnapshot: Partial<Company>;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerGstin?: string | null;
  deliveryLocation?: string | null;
  eventName?: string | null;
  deliveryDate?: string | null;
  quotationDate: string;
  supplyDate?: string | null;
  placeOfSupply: string;
  rentalStartDate: string;
  rentalEndDate: string;
  expectedReturnDate?: string;
  validUntil?: string;
  rentalDays: number;
  status: QuotationStatus;
  taxType: GstType;
  subtotal: number;
  transportCharges: number;
  loadingCharges: number;
  laborCharges: number;
  otherCharges: number;
  discountAmount: number;
  taxableAmount: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTax: number;
  grandTotal: number;
  advanceRequired: number;
  securityDepositRequired: number;
  amountInWords: string;
  notes?: string | null;
  notesList?: string[] | null;
  termsAndConditions?: string | null;
  convertedBillId?: string | null;
  convertedBillNumber?: string | null;
  convertedAt?: string | null;
  items?: QuotationItem[];
  documentLines?: DocumentLine[];
  branches?: QuotationBranch[];
  activityHistory?: AuditLog[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type BillStatus =
  | "DRAFT"
  | "ISSUED"
  | "ACTIVE"
  | "OUT_ON_RENT"
  | "PARTIALLY_RETURNED"
  | "RETURN_INSPECTION"
  | "PENDING_SETTLEMENT"
  | "CLOSED"
  | "SETTLED"
  | "PAID"
  | "CANCELLED";

export type IncidentChargeStatus = "PENDING_DECISION" | "ADD_CHARGE" | "NO_CHARGE";
export type IncidentType = "DAMAGED" | "MISSING";

export interface DamageMissingIncident {
  id: string;
  billId: string;
  productId: string;
  productName: string;
  quantityAffected: number;
  type: IncidentType;
  description: string;
  inspectionDate: string;
  proposedCharge: number;
  finalApprovedCharge: number;
  chargeApprovalStatus: IncidentChargeStatus;
  chargeAmount?: number;
  decisionNotes?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

export interface BillAmendment {
  id: string;
  billId: string;
  amendmentNumber: number;
  reason: string;
  changes: Record<string, any>;
  createdAt: string;
  authorizedBy?: string | null;
}

export interface BillBranch {
  id: string;
  billId: string;
  customerBranchId?: string | null;
  branchName: string;
  deliveryAddress?: string | null;
  sectionOrder: number;
  branchSubtotal: number;
  items: BillItem[];
}

export interface BillItem {
  id: string;
  billBranchId?: string;
  billId?: string;
  entryType?: DocumentEntryType;
  position?: number;
  productId?: string;
  itemName: string;
  sizeSpec?: string | null;
  quantity: number;
  days: number;
  unitPrice: number;
  amount: number;
  itemOrder: number;
  notes?: string | null;
  text?: string | null;
  deliveryLocation?: string | null;
  pickupLocation?: string | null;
  dispatchedQuantity?: number;
  quantityPhysicallyReturned?: number;
  physicalReturnedQuantity?: number;
  returnedGoodQuantity?: number;
  quantityReturnedGood?: number;
  quantityDamaged?: number;
  quantityMissing?: number;
  outstandingQuantity?: number;
  chargeDecision?: IncidentChargeStatus;
  chargeAmount?: number;
  damageChargeDecision?: IncidentChargeStatus;
  damageChargeAmount?: number;
  missingChargeDecision?: IncidentChargeStatus;
  missingChargeAmount?: number;
  damageNotes?: string | null;
  missingNotes?: string | null;
}

export interface Bill {
  id: string;
  billNumber: string;
  companyId: string;
  companySnapshot: Partial<Company>;
  sourceQuotationId?: string | null;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerGstin?: string | null;
  deliveryLocation?: string | null;
  eventName?: string | null;
  deliveryDate?: string | null;
  billDate: string;
  supplyDate?: string | null;
  placeOfSupply: string;
  rentalStartDate: string;
  rentalEndDate: string;
  expectedReturnDate: string;
  actualReturnDate?: string | null;
  rentalDays: number;
  rentalDuration?: number;
  rentalBillingUnit: RentalRateUnit;
  originalRentalDuration: number;
  agreedRentalRate: number;
  lateReturnPolicy: "DAILY_RATE" | "GRACE_PERIOD" | "NO_CHARGE";
  isOverdue?: boolean;
  overdueDays?: number;
  additionalRentalDays?: number;
  additionalRentalCharges?: number;
  approvedDamageCharges?: number;
  approvedMissingCharges?: number;
  lateFeeCharges?: number;
  depositAdjustment?: number;
  depositRefundDue?: number;
  status: BillStatus;
  taxType: GstType;
  subtotal: number;
  transportCharges: number;
  loadingCharges: number;
  laborCharges: number;
  otherCharges: number;
  discountAmount: number;
  taxableAmount: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTax: number;
  originalGrandTotal?: number;
  grandTotal: number;
  advancePaid: number;
  advanceAmount?: number;
  securityDepositHeld: number;
  amountPaid: number;
  paidAmount?: number;
  balanceDue: number;
  customerCredit?: number;
  paymentStatus?: "UNPAID" | "PARTIALLY_PAID" | "FULLY_PAID" | "OVERPAID";
  amountInWords: string;
  notes?: string | null;
  notesList?: string[] | null;
  termsAndConditions?: string | null;
  incidents?: DamageMissingIncident[];
  amendments?: BillAmendment[];
  totalDispatched?: number;
  totalReturnedGood?: number;
  totalDamaged?: number;
  totalMissing?: number;
  settlementNotes?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
  items?: BillItem[];
  documentLines?: DocumentLine[];
  branches?: BillBranch[];
  payments?: Payment[];
  activityHistory?: AuditLog[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "READY_FOR_DISPATCH"
  | "DISPATCHED"
  | "PARTIALLY_RETURNED"
  | "RETURNED"
  | "COMPLETED"
  | "CANCELLED";

export interface ReservationItem {
  id: string;
  reservationId: string;
  productId: string;
  productName: string;
  branchName?: string;
  quantityReserved: number;
  quantityDispatched: number;
  quantityReturned: number;
  quantityDamaged: number;
  quantityMissing: number;
}

export interface Reservation {
  id: string;
  reservationNumber: string;
  quotationId?: string | null;
  billId?: string | null;
  companyId: string;
  customerId: string;
  customerName: string;
  rentalStartDate: string;
  rentalEndDate: string;
  status: ReservationStatus;
  advanceRequired: number;
  depositRequired: number;
  notes?: string | null;
  items: ReservationItem[];
  createdAt: string;
  updatedAt: string;
}

export interface GatePassItem {
  id: string;
  gatePassId: string;
  productId: string;
  itemName: string;
  sizeSpec?: string | null;
  quantityDispatched: number;
  quantityReturned: number;
  quantityDamaged: number;
  quantityMissing: number;
}

export interface GatePass {
  id: string;
  gatePassNumber: string;
  companyId: string;
  companySnapshot: Partial<Company>;
  customerId: string;
  customerName: string;
  destinationBranch: string;
  destinationAddress: string;
  reservationId?: string | null;
  billId?: string | null;
  dispatchDate: string;
  expectedReturnDate: string;
  vehicleNumber?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  authorizedBy: string;
  notes?: string | null;
  status: "DISPATCHED" | "PARTIALLY_RETURNED" | "RETURNED" | "CLOSED";
  items: GatePassItem[];
  createdAt: string;
}

export interface ReturnItem {
  id: string;
  returnId: string;
  productId: string;
  gatePassItemId: string;
  itemName: string;
  quantityExpected: number;
  quantityReturnedGood: number;
  quantityDamaged: number;
  quantityMissing: number;
  damageNotes?: string | null;
}

export interface ReturnRecord {
  id: string;
  returnNumber: string;
  gatePassId: string;
  companyId: string;
  customerId: string;
  customerName: string;
  returnDate: string;
  inspectedBy: string;
  damageCharges: number;
  lateFeeCharges: number;
  depositAdjustment: number;
  notes?: string | null;
  items: ReturnItem[];
  createdAt: string;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  movementType:
    | "OPENING"
    | "MANUAL_ADJUSTMENT"
    | "IMPORT"
    | "RESERVATION_HOLD"
    | "RESERVATION_RELEASE"
    | "DISPATCH"
    | "RETURN_GOOD"
    | "RETURN_DAMAGED"
    | "RETURN_MISSING"
    | "REPAIR_RESTORE";
  quantityChange: number;
  referenceType: string;
  referenceId?: string | null;
  balanceAfter: number;
  notes?: string | null;
  createdBy?: string;
  createdAt: string;
}

export type PaymentType =
  | "RENTAL_PAYMENT"
  | "ADVANCE"
  | "SECURITY_DEPOSIT"
  | "DEPOSIT_REFUND"
  | "DAMAGE_SETTLEMENT";

export type PaymentMethod = "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "ONLINE" | "CARD" | "OTHER";

export interface Payment {
  id: string;
  paymentNumber: string;
  billId?: string | null;
  companyId: string;
  customerId: string;
  customerName: string;
  paymentType: PaymentType;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNumber?: string | null;
  notes?: string | null;
  isReversed: boolean;
  reversedAt?: string | null;
  reversalReason?: string | null;
  createdAt: string;
}

export interface WhatsAppLog {
  id: string;
  documentType: "QUOTATION" | "BILL" | "GATE_PASS" | "RECEIPT";
  documentId: string;
  documentNumber: string;
  recipientPhone: string;
  recipientName: string;
  shareMethod: "HANDOFF_WEB" | "API_CLOUD";
  status: "PREPARED" | "WINDOW_OPENED" | "ACCEPTED" | "SENT" | "DELIVERED" | "READ" | "FAILED";
  messagePayload?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SessionStatus = "ACTIVE" | "SIGNED_OUT" | "EXPIRED" | "REJECTED";

export interface UserSession {
  id: string; // unique session identifier (sid)
  userId: string;
  userName: string;
  username: string;
  userEmail: string;
  role: UserRole;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  status: SessionStatus;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  rejectedByUserId?: string | null;
}

export type AuditEntityType = "QUOTATION" | "BILL" | "ACCOUNT" | "SESSION" | "PAYMENT" | "COMPANY";

export interface AuditLog {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  entityNumber?: string | null;
  customerName?: string | null;
  action: string;
  actionLabel: string;
  summary?: string;
  actorId: string;
  actorName: string;
  actorUsername: string;
  actorRole: UserRole;
  details?: {
    summary?: string;
    changes?: Record<string, { previous: any; current: any }> | string[];
    previousValues?: Record<string, any>;
    newValues?: Record<string, any>;
    sourceQuotationId?: string;
    sourceQuotationNumber?: string;
    convertedBillId?: string;
    convertedBillNumber?: string;
    [key: string]: any;
  } | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface ActivityNotification {
  id: string;
  type: "SIGN_IN" | "SIGN_OUT";
  userId: string;
  userName: string;
  username: string;
  role: UserRole;
  sessionId: string;
  title: string;
  message: string;
  isRead: boolean;
  readAt?: string | null;
  isRejected?: boolean;
  createdAt: string;
}
