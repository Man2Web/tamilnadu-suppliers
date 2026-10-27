// ============================================================================
// FINANCIAL & RENTAL CALCULATIONS ENGINE
// Exact Decimal Arithmetic & Indian Rupee Formatting
// ============================================================================

import { GstType } from "../types";

export interface DocumentFinancialInput {
  taxType: GstType;
  branchSubtotals?: number[];
  itemsSubtotal?: number;
  transportCharges?: number;
  loadingCharges?: number;
  laborCharges?: number;
  otherCharges?: number;
  discountAmount?: number;
  isInterState?: boolean;
  gstRatePercent?: number; // default 18%
  advancePaid?: number;
  securityDepositHeld?: number;
  amountPaid?: number;
}

export interface DocumentFinancialSummary {
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
  advancePaid: number;
  securityDepositHeld: number;
  amountPaid: number;
  balanceDue: number;
  amountInWords: string;
}

/**
 * Calculates rental line amount = Quantity × Days × Unit Price
 */
export function calculateRentalLineTotal(
  quantity: number,
  days: number,
  unitPrice: number
): number {
  const q = Math.max(0, Number(quantity) || 0);
  const d = Math.max(1, Number(days) || 1);
  const p = Math.max(0, Number(unitPrice) || 0);
  return round2(q * d * p);
}

/**
 * Parses date-only strings consistently in UTC to avoid timezone-related off-by-one errors.
 * Accepts both YYYY-MM-DD and DD-MM-YYYY formats.
 */
export function parseDateOnly(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const clean = dateStr.trim().split("T")[0];
  const parts = clean.split("-").map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    if (parts[0] > 1000) {
      // YYYY-MM-DD
      return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    } else {
      // DD-MM-YYYY
      return new Date(Date.UTC(parts[2], parts[1] - 1, parts[0]));
    }
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/**
 * Calculates rental duration from start date to actual return date
 * using the number of elapsed calendar days:
 * Duration = Actual Return Date − Rental Start Date
 * Example: 12-10-2026 to 14-10-2026 = 2 days.
 * 12-10-2026 to 13-10-2026 = 1 day.
 * Same date = 0 elapsed days.
 */
/**
 * Returns a message when the rental end date is before the start date (null when the dates are fine or incomplete).
 * Shared by the create pages and the server so a rental can never end before it starts.
 */
export function getRentalDateError(startDateStr?: string | null, endDateStr?: string | null): string | null {
  if (!startDateStr || !endDateStr) return null;
  const start = parseDateOnly(startDateStr);
  const end = parseDateOnly(endDateStr);
  if (!start || !end) return null;
  return end.getTime() < start.getTime() ? "Rental end date cannot be before the rental start date." : null;
}

export function calculateRentalDays(startDateStr: string, endDateStr: string): number {
  if (!startDateStr || !endDateStr) return 0;
  const start = parseDateOnly(startDateStr);
  const end = parseDateOnly(endDateStr);
  if (!start || !end) return 0;
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Safe rounding to 2 decimal places
 */
export function round2(num: number): number {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

/**
 * Formats currency in Indian format: ₹ 78,730.00
 */
export function formatINR(amount: number): string {
  const val = round2(amount || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

/**
 * Calculates complete document financial breakdown
 */
/**
 * The backend reports a GST company as "GST" while forms and older code use "GST_REGISTERED".
 * Always test with this helper; comparing against one spelling treats GST companies as Non-GST (wrong labels,
 * missing CGST/SGST lines on PDFs).
 */
export function isGstRegistered(type?: string | null): boolean {
  return type === "GST" || type === "GST_REGISTERED";
}

export function calculateDocumentFinancials(
  input: DocumentFinancialInput
): DocumentFinancialSummary {
  const subtotal = round2(
    input.itemsSubtotal !== undefined
      ? input.itemsSubtotal
      : (input.branchSubtotals || []).reduce((acc, curr) => acc + (Number(curr) || 0), 0)
  );

  const transportCharges = round2(input.transportCharges || 0);
  const loadingCharges = round2(input.loadingCharges || 0);
  const laborCharges = round2(input.laborCharges || 0);
  const otherCharges = round2(input.otherCharges || 0);
  const discountAmount = round2(input.discountAmount || 0);

  const netCharges = transportCharges + loadingCharges + laborCharges + otherCharges;
  const taxableAmount = Math.max(0, round2(subtotal + netCharges - discountAmount));

  let cgstRate = 0;
  let cgstAmount = 0;
  let sgstRate = 0;
  let sgstAmount = 0;
  let igstRate = 0;
  let igstAmount = 0;
  let totalTax = 0;

  if (isGstRegistered(input.taxType)) {
    const totalGstRate = input.gstRatePercent !== undefined ? input.gstRatePercent : 18;
    if (input.isInterState) {
      igstRate = totalGstRate;
      igstAmount = round2((taxableAmount * igstRate) / 100);
      totalTax = igstAmount;
    } else {
      cgstRate = totalGstRate / 2;
      sgstRate = totalGstRate / 2;
      cgstAmount = round2((taxableAmount * cgstRate) / 100);
      sgstAmount = round2((taxableAmount * sgstRate) / 100);
      totalTax = round2(cgstAmount + sgstAmount);
    }
  }

  const grandTotal = Math.round(taxableAmount + totalTax); // Standard rounding to whole rupee
  const advancePaid = round2(input.advancePaid || 0);
  const securityDepositHeld = round2(input.securityDepositHeld || 0);
  const amountPaid = round2(input.amountPaid || 0);
  const balanceDue = Math.max(0, round2(grandTotal - amountPaid - advancePaid));

  const amountInWords = numberToIndianWords(grandTotal);

  return {
    subtotal,
    transportCharges,
    loadingCharges,
    laborCharges,
    otherCharges,
    discountAmount,
    taxableAmount,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    totalTax,
    grandTotal,
    advancePaid,
    securityDepositHeld,
    amountPaid,
    balanceDue,
    amountInWords,
  };
}

/**
 * Converts numeric amount to Indian Rupee Words format
 * e.g. 78730 -> "Rupees Seventy Eight Thousand Seven Hundred Thirty Only"
 */
export function numberToIndianWords(num: number): string {
  const integerPart = Math.floor(Math.abs(num));
  if (integerPart === 0) return "Rupees Zero Only";

  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];

  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
  ];

  function convertSection(n: number): string {
    let str = "";
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + " ";
      n %= 10;
    }
    if (n > 0) {
      str += ones[n] + " ";
    }
    return str.trim();
  }

  let words = "";

  // Crores (1,00,00,000)
  const crore = Math.floor(integerPart / 10000000);
  let remainder = integerPart % 10000000;
  if (crore > 0) {
    words += convertSection(crore) + " Crore ";
  }

  // Lakhs (1,00,000)
  const lakh = Math.floor(remainder / 100000);
  remainder = remainder % 100000;
  if (lakh > 0) {
    words += convertSection(lakh) + " Lakh ";
  }

  // Thousands (1,000)
  const thousand = Math.floor(remainder / 1000);
  remainder = remainder % 1000;
  if (thousand > 0) {
    words += convertSection(thousand) + " Thousand ";
  }

  // Hundreds & Below
  if (remainder > 0) {
    words += convertSection(remainder) + " ";
  }

  return `Rupees ${words.trim()} Only`;
}

/**
 * Calculates overdue rental duration and additional charges
 */
export function calculateOverdueDetails(
  expectedReturnDateStr: string,
  actualReturnDateStr: string,
  agreedDailyRate: number,
  policy: "DAILY_RATE" | "GRACE_PERIOD" | "NO_CHARGE" = "DAILY_RATE"
) {
  if (!expectedReturnDateStr || !actualReturnDateStr) {
    return { isOverdue: false, additionalDays: 0, additionalAmount: 0, policy };
  }

  const expected = parseDateOnly(expectedReturnDateStr);
  const actual = parseDateOnly(actualReturnDateStr);
  if (!expected || !actual) {
    return { isOverdue: false, additionalDays: 0, additionalAmount: 0, policy };
  }

  const diffMs = actual.getTime() - expected.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const additionalDays = Math.max(0, diffDays);

  let additionalAmount = 0;
  if (policy === "DAILY_RATE" && additionalDays > 0) {
    additionalAmount = round2(additionalDays * agreedDailyRate);
  } else if (policy === "GRACE_PERIOD" && additionalDays > 1) {
    additionalAmount = round2((additionalDays - 1) * agreedDailyRate);
  }

  return {
    isOverdue: additionalDays > 0,
    additionalDays,
    additionalAmount,
    policy,
  };
}

export interface FinalSettlementInput {
  originalGrandTotal: number;
  additionalRentalCharges?: number;
  approvedDamageCharges?: number;
  approvedMissingCharges?: number;
  lateFeeCharges?: number;
  discountAmount?: number;
  paymentsReceived?: number;
  advancePaid?: number;
  securityDepositReceived?: number;
  authorizedDepositDeductions?: number;
}

export interface FinalSettlementSummary {
  originalGrandTotal: number;
  additionalRentalCharges: number;
  approvedDamageCharges: number;
  approvedMissingCharges: number;
  lateFeeCharges: number;
  discountAmount: number;
  revisedGrandTotal: number;
  paymentsReceived: number;
  advancePaid: number;
  totalPaidTowardsRent: number;
  securityDepositReceived: number;
  authorizedDepositDeductions: number;
  depositRefundDue: number;
  outstandingBalance: number;
  customerCredit: number;
}

/**
 * Calculates final rental bill settlement
 * Treats security deposit in custody (NOT as rental revenue)
 * Does not double-count original rental amounts
 */
export function calculateFinalSettlement(
  input: FinalSettlementInput
): FinalSettlementSummary {
  const originalGrandTotal = round2(input.originalGrandTotal || 0);
  const additionalRentalCharges = round2(input.additionalRentalCharges || 0);
  const approvedDamageCharges = round2(input.approvedDamageCharges || 0);
  const approvedMissingCharges = round2(input.approvedMissingCharges || 0);
  const lateFeeCharges = round2(input.lateFeeCharges || 0);
  const discountAmount = round2(input.discountAmount || 0);

  const additions =
    additionalRentalCharges + approvedDamageCharges + approvedMissingCharges + lateFeeCharges;
  const revisedGrandTotal = Math.max(0, round2(originalGrandTotal + additions - discountAmount));

  const paymentsReceived = round2(input.paymentsReceived || 0);
  const advancePaid = round2(input.advancePaid || 0);
  const securityDepositReceived = round2(input.securityDepositReceived || 0);
  const authorizedDepositDeductions = Math.min(
    securityDepositReceived,
    round2(input.authorizedDepositDeductions || 0)
  );

  const depositRefundDue = Math.max(0, round2(securityDepositReceived - authorizedDepositDeductions));
  const totalPaidTowardsRent = round2(paymentsReceived + advancePaid + authorizedDepositDeductions);

  const outstandingBalance = Math.max(0, round2(revisedGrandTotal - totalPaidTowardsRent));
  const customerCredit = Math.max(0, round2(totalPaidTowardsRent - revisedGrandTotal));

  return {
    originalGrandTotal,
    additionalRentalCharges,
    approvedDamageCharges,
    approvedMissingCharges,
    lateFeeCharges,
    discountAmount,
    revisedGrandTotal,
    paymentsReceived,
    advancePaid,
    totalPaidTowardsRent,
    securityDepositReceived,
    authorizedDepositDeductions,
    depositRefundDue,
    outstandingBalance,
    customerCredit,
  };
}
