// ============================================================================
// EXCEL IMPORT OF OLDER RECORDS (customers, bills + payments, products)
// Pure parsing / validation / template code: no database access, so it is unit-testable.
// The API route feeds it the current master data and then writes the validated rows.
// ============================================================================

import * as XLSX from "xlsx";
import { calculateDocumentFinancials } from "../calculations/financial";
import type { GstType } from "../types";

export const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_IMPORT_ROWS_PER_SHEET = 5000;

export type PaymentMethodCode = "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "ONLINE";
export type PaymentTypeCode = "RENTAL_PAYMENT" | "ADVANCE" | "SECURITY_DEPOSIT";

export interface ImportCompany {
  id: string;
  name: string;
  displayName: string;
  invoicePrefix: string;
  gstType: GstType;
  placeOfSupply: string;
}

export interface ImportContext {
  companies: ImportCompany[];
  defaultCompanyId?: string;
  existingCustomers: Array<{ id: string; name: string; mobile: string }>;
  existingBillNumbers: string[];
  existingProducts: Array<{ id: string; name: string; categoryName?: string | null }>;
  categories: Array<{ id: string; name: string }>;
}

export interface RowIssues {
  errors: string[];
  warnings: string[];
}

export interface ParsedCustomer extends RowIssues {
  row: number;
  name: string;
  contactPerson: string | null;
  mobile: string;
  email: string | null;
  billingAddress: string;
  gstin: string | null;
  state: string;
  postalCode: string | null;
  notes: string | null;
  action: "create" | "skip";
}

export interface ParsedBillItem {
  row: number;
  itemName: string;
  sizeSpec: string;
  quantity: number;
  days: number;
  unitPrice: number;
  amount: number;
  productId: string | null;
}

export interface ParsedPayment extends RowIssues {
  row: number;
  billNumber: string;
  paymentDate: string;
  amount: number;
  method: PaymentMethodCode;
  type: PaymentTypeCode;
  reference: string | null;
  paymentNumber: string;
}

export interface ParsedBill extends RowIssues {
  billNumber: string;
  rows: number[];
  companyId: string | null;
  companyLabel: string;
  billDate: string;
  rentalStartDate: string;
  rentalEndDate: string;
  rentalDays: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerGstin: string | null;
  items: ParsedBillItem[];
  transportCharges: number;
  loadingCharges: number;
  laborCharges: number;
  otherCharges: number;
  discountAmount: number;
  notes: string | null;
  computedGrandTotal: number;
  expectedGrandTotal: number | null;
  payments: ParsedPayment[];
  totalPaid: number;
  action: "create" | "skip";
}

export interface ParsedProduct extends RowIssues {
  row: number;
  name: string;
  categoryName: string | null;
  categoryId: string | null;
  sizeSpec: string | null;
  unit: string | null;
  rentalRate: number | null;
  totalStock: number | null;
  securityDeposit: number | null;
  replacementValue: number | null;
  existingProductId: string | null;
  action: "create" | "update" | "skip";
}

export interface RecordsPreview {
  sheetsFound: string[];
  customers: ParsedCustomer[];
  bills: ParsedBill[];
  orphanPayments: ParsedPayment[];
  products: ParsedProduct[];
  fatalErrors: string[];
  summary: {
    customersToCreate: number;
    customersSkipped: number;
    billsToCreate: number;
    billsSkipped: number;
    paymentsToCreate: number;
    productsToCreate: number;
    productsToUpdate: number;
    rowsWithErrors: number;
    rowsWithWarnings: number;
    importable: boolean;
  };
}

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

const norm = (s: unknown): string => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const text = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).replace(/\s+/g, " ").trim();
};

export function parseMoney(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  const cleaned = String(v).replace(/[₹,\s]|rs\.?|inr/gi, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function parseInteger(v: unknown): number | null {
  const n = parseMoney(v);
  return n === null ? null : Math.trunc(n);
}

const pad = (n: number) => String(n).padStart(2, "0");

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Accepts Excel dates, serial numbers, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY and YYYY-MM-DD. Returns YYYY-MM-DD. */
export function parseDateCell(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const shifted = new Date(v.getTime() + 12 * 3600 * 1000); // robust to local/UTC midnight representations
    return validYmd(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
  }
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null; // not an Excel date serial
    const parsed = XLSX.SSF.parse_date_code(v);
    return parsed ? validYmd(parsed.y, parsed.m, parsed.d) : null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validYmd(year, Number(m[2]), Number(m[1])); // Indian convention: day first
  }
  return null;
}

export function normalizeMobile(v: unknown): string {
  return text(v).replace(/[^\d+]/g, "").replace(/^\+?91(?=\d{10}$)/, "");
}

function mapMethod(v: unknown): PaymentMethodCode | null {
  const k = norm(v);
  if (!k) return "CASH";
  if (k.includes("cash")) return "CASH";
  if (k.includes("upi") || k.includes("gpay") || k.includes("phonepe") || k.includes("paytm")) return "UPI";
  if (k.includes("bank") || k.includes("neft") || k.includes("rtgs") || k.includes("imps") || k.includes("transfer")) return "BANK_TRANSFER";
  if (k.includes("cheque") || k.includes("check") || k.includes("dd")) return "CHEQUE";
  if (k.includes("online") || k.includes("card")) return "ONLINE";
  return null;
}

function mapPaymentType(v: unknown): PaymentTypeCode | null {
  const k = norm(v);
  if (!k || k.includes("rental") || k === "payment" || k === "receipt") return "RENTAL_PAYMENT";
  if (k.includes("advance")) return "ADVANCE";
  if (k.includes("deposit") || k.includes("security")) return "SECURITY_DEPOSIT";
  return null;
}

type RawRow = Record<string, unknown>;

/** Re-keys a row by normalised header text so "Bill No." / "bill_number" / "BillNumber" all resolve. */
function keyed(row: RawRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[norm(k)] = v;
  return out;
}

function pick(row: Record<string, unknown>, aliases: string[]): unknown {
  for (const a of aliases) {
    const v = row[norm(a)];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

function sheetRows(wb: XLSX.WorkBook, names: string[]): { rows: Array<{ row: number; data: Record<string, unknown> }>; found: boolean; tooMany: boolean } {
  const sheetName = wb.SheetNames.find((s) => names.some((n) => norm(n) === norm(s)));
  if (!sheetName) return { rows: [], found: false, tooMany: false };
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "", raw: true });
  const tooMany = raw.length > MAX_IMPORT_ROWS_PER_SHEET;
  const rows = raw.slice(0, MAX_IMPORT_ROWS_PER_SHEET).map((r, i) => ({ row: i + 2, data: keyed(r) })); // +2: header row + 1-based
  // Ignore fully empty rows and instruction/example rows that start with "#"
  const filtered = rows.filter(({ data }) => {
    const vals = Object.values(data).map(text);
    if (vals.every((v) => v === "")) return false;
    return !vals[0]?.startsWith("#");
  });
  return { rows: filtered, found: true, tooMany };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseRecordsWorkbook(buffer: Buffer, ctx: ImportContext): RecordsPreview {
  const fatalErrors: string[] = [];
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return emptyPreview(["The file could not be read as an Excel workbook (.xlsx / .xls)."]);
  }

  const customersSheet = sheetRows(wb, ["Customers", "Customer"]);
  const billsSheet = sheetRows(wb, ["Bills", "Invoices", "Bill"]);
  const paymentsSheet = sheetRows(wb, ["Payments", "Payment", "Receipts"]);
  const productsSheet = sheetRows(wb, ["Products", "Product", "Stock"]);

  const sheetsFound = [
    customersSheet.found && "Customers",
    billsSheet.found && "Bills",
    paymentsSheet.found && "Payments",
    productsSheet.found && "Products",
  ].filter(Boolean) as string[];

  if (sheetsFound.length === 0) {
    fatalErrors.push("No recognised sheet found. Use the template: sheets named Customers, Bills, Payments and/or Products.");
  }
  for (const [label, s] of [["Customers", customersSheet], ["Bills", billsSheet], ["Payments", paymentsSheet], ["Products", productsSheet]] as const) {
    if (s.tooMany) fatalErrors.push(`Sheet "${label}" has more than ${MAX_IMPORT_ROWS_PER_SHEET} rows. Split it into several files.`);
  }

  const customers = parseCustomers(customersSheet.rows, ctx);
  const { bills, orphanPayments } = parseBills(billsSheet.rows, paymentsSheet.rows, ctx);
  const products = parseProducts(productsSheet.rows, ctx);

  return finalize({ sheetsFound, customers, bills, orphanPayments, products, fatalErrors });
}

function emptyPreview(fatalErrors: string[]): RecordsPreview {
  return finalize({ sheetsFound: [], customers: [], bills: [], orphanPayments: [], products: [], fatalErrors });
}

function finalize(p: Omit<RecordsPreview, "summary">): RecordsPreview {
  const hasErr = (x: RowIssues) => x.errors.length > 0;
  const hasWarn = (x: RowIssues) => x.warnings.length > 0;
  const allIssues: RowIssues[] = [
    ...p.customers,
    ...p.bills,
    ...p.bills.flatMap((b) => b.payments),
    ...p.orphanPayments,
    ...p.products,
  ];
  const rowsWithErrors = allIssues.filter(hasErr).length;
  const summary = {
    customersToCreate: p.customers.filter((c) => c.action === "create" && !hasErr(c)).length,
    customersSkipped: p.customers.filter((c) => c.action === "skip").length,
    billsToCreate: p.bills.filter((b) => b.action === "create" && !hasErr(b)).length,
    billsSkipped: p.bills.filter((b) => b.action === "skip").length,
    paymentsToCreate: p.bills.filter((b) => b.action === "create" && !hasErr(b)).reduce((a, b) => a + b.payments.filter((x) => !hasErr(x)).length, 0),
    productsToCreate: p.products.filter((x) => x.action === "create" && !hasErr(x)).length,
    productsToUpdate: p.products.filter((x) => x.action === "update" && !hasErr(x)).length,
    rowsWithErrors,
    rowsWithWarnings: allIssues.filter(hasWarn).length,
    importable: false,
  };
  summary.importable =
    p.fatalErrors.length === 0 &&
    summary.customersToCreate + summary.billsToCreate + summary.productsToCreate + summary.productsToUpdate > 0;
  return { ...p, summary };
}

function parseCustomers(rows: Array<{ row: number; data: Record<string, unknown> }>, ctx: ImportContext): ParsedCustomer[] {
  const seen = new Set<string>();
  const existingByMobile = new Set(ctx.existingCustomers.map((c) => normalizeMobile(c.mobile)).filter(Boolean));
  const out: ParsedCustomer[] = [];

  for (const { row, data } of rows) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const name = text(pick(data, ["name", "customer name", "customer", "party name"]));
    const mobile = normalizeMobile(pick(data, ["mobile", "phone", "mobile number", "contact number", "customer mobile"]));
    const address = text(pick(data, ["billing address", "address", "customer address"]));
    const gstin = text(pick(data, ["gstin", "gst number", "gst no"])).toUpperCase() || null;

    if (!name) errors.push("Customer name is required.");
    if (!mobile) errors.push("Mobile number is required.");
    else if (!/^\+?\d{7,15}$/.test(mobile)) errors.push(`Mobile "${mobile}" is not a valid phone number.`);
    if (!address) warnings.push("No address given; \"Address not provided\" will be saved.");
    if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) errors.push(`GSTIN "${gstin}" must be 15 letters/digits.`);

    let action: "create" | "skip" = "create";
    if (mobile && existingByMobile.has(mobile)) {
      action = "skip";
      warnings.push("A customer with this mobile already exists; skipped.");
    } else if (mobile && seen.has(mobile)) {
      action = "skip";
      warnings.push("Duplicate mobile earlier in this file; skipped.");
    }
    if (mobile) seen.add(mobile);

    out.push({
      row,
      name,
      contactPerson: text(pick(data, ["contact person", "contact"])) || null,
      mobile,
      email: text(pick(data, ["email", "email id"])) || null,
      billingAddress: address || "Address not provided",
      gstin,
      state: text(pick(data, ["state"])) || "Tamil Nadu",
      postalCode: text(pick(data, ["postal code", "pincode", "pin code", "pin"])) || null,
      notes: text(pick(data, ["notes", "remarks"])) || null,
      action,
      errors,
      warnings,
    });
  }
  return out;
}

function resolveCompany(label: string, ctx: ImportContext): ImportCompany | null {
  const k = norm(label);
  if (k) {
    const hit = ctx.companies.find(
      (c) => norm(c.name) === k || norm(c.displayName) === k || norm(c.invoicePrefix) === k || norm(c.id) === k
    );
    if (hit) return hit;
    return null;
  }
  return ctx.companies.find((c) => c.id === ctx.defaultCompanyId) || null;
}

function parseBills(
  billRows: Array<{ row: number; data: Record<string, unknown> }>,
  paymentRows: Array<{ row: number; data: Record<string, unknown> }>,
  ctx: ImportContext
): { bills: ParsedBill[]; orphanPayments: ParsedPayment[] } {
  const existing = new Set(ctx.existingBillNumbers.map((n) => n.toLowerCase()));
  const productByName = new Map(ctx.existingProducts.map((p) => [norm(p.name), p.id]));

  const groups = new Map<string, Array<{ row: number; data: Record<string, unknown> }>>();
  const missingNumberRows: number[] = [];
  for (const r of billRows) {
    const bn = text(pick(r.data, ["bill number", "bill no", "invoice number", "invoice no", "invoice"]));
    if (!bn) {
      missingNumberRows.push(r.row);
      continue;
    }
    const k = bn.toLowerCase();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  const bills: ParsedBill[] = [];

  for (const [, rows] of groups) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const first = rows[0].data;
    const billNumber = text(pick(first, ["bill number", "bill no", "invoice number", "invoice no", "invoice"]));

    const header = (aliases: string[]): unknown => {
      let value: unknown;
      for (const { data } of rows) {
        const v = pick(data, aliases);
        if (v === undefined) continue;
        if (value === undefined) value = v;
        else if (text(value) !== text(v)) {
          warnings.push(`"${aliases[0]}" differs between rows of this bill; the first value is used.`);
          return value;
        }
      }
      return value;
    };

    // Company
    const companyLabel = text(header(["company", "company name", "issuing company", "company prefix"]));
    const company = resolveCompany(companyLabel, ctx);
    if (!company) {
      errors.push(
        companyLabel
          ? `Company "${companyLabel}" was not found. Use the company name or invoice prefix.`
          : "No company given and no default company selected."
      );
    }

    // Dates
    const billDate = parseDateCell(header(["bill date", "invoice date", "date"]));
    if (!billDate) errors.push("Bill date is missing or not a valid date (use DD/MM/YYYY).");
    const rs = parseDateCell(header(["rental start date", "rental start", "from date", "start date"]));
    const re = parseDateCell(header(["rental end date", "rental end", "to date", "end date"]));
    const rentalStartDate = rs || billDate || "";
    const rentalEndDate = re || rentalStartDate;
    if (rentalStartDate && rentalEndDate && rentalEndDate < rentalStartDate) {
      errors.push("Rental end date is before the rental start date.");
    }
    const daysCell = parseInteger(header(["rental days", "days"]));
    const spanDays =
      rentalStartDate && rentalEndDate
        ? Math.max(1, Math.round((Date.parse(rentalEndDate) - Date.parse(rentalStartDate)) / 86400000) + 1)
        : 1;
    const rentalDays = daysCell && daysCell >= 1 ? daysCell : spanDays;

    // Customer
    const customerName = text(header(["customer name", "customer", "party name", "name"]));
    const customerPhone = normalizeMobile(header(["customer mobile", "customer phone", "mobile", "phone"]));
    if (!customerName) errors.push("Customer name is required.");
    if (!customerPhone) errors.push("Customer mobile is required.");
    else if (!/^\+?\d{7,15}$/.test(customerPhone)) errors.push(`Customer mobile "${customerPhone}" is not valid.`);
    const customerGstin = text(header(["customer gstin", "gstin"])).toUpperCase() || null;
    if (customerGstin && !/^[0-9A-Z]{15}$/.test(customerGstin)) errors.push(`Customer GSTIN "${customerGstin}" must be 15 letters/digits.`);

    // Items
    const items: ParsedBillItem[] = [];
    for (const { row, data } of rows) {
      const itemName = text(pick(data, ["item name", "item", "product", "description", "particulars"]));
      if (!itemName) {
        if (rows.length === 1) errors.push(`Row ${row}: item name is missing.`);
        continue;
      }
      const quantity = parseInteger(pick(data, ["quantity", "qty"])) ?? 1;
      const unitPrice = parseMoney(pick(data, ["unit price", "rate", "price", "rental rate"]));
      const itemDays = parseInteger(pick(data, ["item days", "line days"])) ?? rentalDays;
      if (quantity <= 0) errors.push(`Row ${row}: quantity must be greater than 0.`);
      if (unitPrice === null) errors.push(`Row ${row}: unit price is missing or not a number.`);
      if (itemDays < 1) errors.push(`Row ${row}: days must be at least 1.`);
      const price = unitPrice ?? 0;
      const amountCell = parseMoney(pick(data, ["amount", "line total", "total"]));
      const computed = Math.round(quantity * itemDays * price * 100) / 100;
      if (amountCell !== null && Math.abs(amountCell - computed) > 1) {
        warnings.push(`Row ${row}: line amount ₹${amountCell} differs from qty × days × rate = ₹${computed}; the calculated value is used.`);
      }
      const productId = productByName.get(norm(itemName)) || null;
      items.push({
        row,
        itemName,
        sizeSpec: text(pick(data, ["size", "size spec", "specification", "size/spec"])),
        quantity,
        days: itemDays,
        unitPrice: price,
        amount: computed,
        productId,
      });
    }
    if (items.length === 0 && errors.every((e) => !e.includes("item name"))) errors.push("The bill has no item rows.");
    const unmatched = items.filter((i) => !i.productId).length;
    if (unmatched > 0) warnings.push(`${unmatched} item(s) are not in the product master; they are saved as plain text lines on this bill.`);

    // Charges
    const num = (aliases: string[]) => parseMoney(header(aliases)) ?? 0;
    const transportCharges = num(["transport charges", "transport"]);
    const loadingCharges = num(["loading charges", "loading"]);
    const laborCharges = num(["labor charges", "labour charges", "labor", "labour"]);
    const otherCharges = num(["other charges", "other"]);
    const discountAmount = num(["discount", "discount amount"]);
    for (const [label, v] of [["Transport", transportCharges], ["Loading", loadingCharges], ["Labour", laborCharges], ["Other", otherCharges], ["Discount", discountAmount]] as const) {
      if (v < 0) errors.push(`${label} charge cannot be negative.`);
    }

    // Totals (same engine the app uses when it creates a bill)
    const itemsSubtotal = items.reduce((a, i) => a + i.amount, 0);
    let computedGrandTotal = 0;
    if (company) {
      const fin = calculateDocumentFinancials({
        taxType: company.gstType,
        itemsSubtotal,
        transportCharges,
        loadingCharges,
        laborCharges,
        otherCharges,
        discountAmount,
        isInterState: false,
      });
      computedGrandTotal = fin.grandTotal;
    } else {
      computedGrandTotal = Math.round((itemsSubtotal + transportCharges + loadingCharges + laborCharges + otherCharges - discountAmount) * 100) / 100;
    }
    const expected = parseMoney(header(["grand total", "total amount", "bill total", "net amount"]));
    if (expected !== null && Math.abs(expected - computedGrandTotal) > 1) {
      warnings.push(
        `Grand total in the sheet (₹${expected}) differs from the calculated total (₹${computedGrandTotal}). The calculated total is saved; check tax settings, charges and discount.`
      );
    }

    const duplicateInDb = existing.has(billNumber.toLowerCase());
    if (duplicateInDb) warnings.push("A bill with this number already exists in the system; skipped.");

    bills.push({
      billNumber,
      rows: rows.map((r) => r.row),
      companyId: company?.id ?? null,
      companyLabel: company ? company.displayName || company.name : companyLabel,
      billDate: billDate || "",
      rentalStartDate,
      rentalEndDate,
      rentalDays,
      customerName,
      customerPhone,
      customerAddress: text(header(["customer address", "address", "billing address"])),
      customerGstin,
      items,
      transportCharges,
      loadingCharges,
      laborCharges,
      otherCharges,
      discountAmount,
      notes: text(header(["notes", "remarks"])) || null,
      computedGrandTotal,
      expectedGrandTotal: expected,
      payments: [],
      totalPaid: 0,
      action: duplicateInDb ? "skip" : "create",
      errors,
      warnings,
    });
  }

  for (const r of missingNumberRows) {
    bills.push(emptyBillWithError(r, "Bill number is missing."));
  }

  // Payments: from the Payments sheet, or the "amount paid" shortcut column on the Bills sheet
  const billByKey = new Map(bills.filter((b) => b.billNumber).map((b) => [b.billNumber.toLowerCase(), b]));
  const orphanPayments: ParsedPayment[] = [];
  const counters = new Map<string, number>();

  const addPayment = (bill: ParsedBill | undefined, p: ParsedPayment) => {
    if (bill) bill.payments.push(p);
    else orphanPayments.push(p);
  };

  for (const { row, data } of paymentRows) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const billNumber = text(pick(data, ["bill number", "bill no", "invoice number", "invoice no", "invoice"]));
    const bill = billByKey.get(billNumber.toLowerCase());
    if (!billNumber) errors.push("Bill number is missing.");
    else if (!bill) errors.push(`Bill "${billNumber}" is not in the Bills sheet of this file. Payments can only be added together with their bill.`);
    const amount = parseMoney(pick(data, ["amount", "amount paid", "paid"]));
    if (amount === null || amount <= 0) errors.push("Payment amount must be greater than 0.");
    const date = parseDateCell(pick(data, ["payment date", "date", "received date"]));
    if (!date) errors.push("Payment date is missing or not a valid date.");
    const method = mapMethod(pick(data, ["payment method", "method", "mode", "payment mode"]));
    if (!method) errors.push("Payment method must be Cash, UPI, Bank Transfer, Cheque or Online.");
    const type = mapPaymentType(pick(data, ["payment type", "type"]));
    if (!type) errors.push("Payment type must be Rental Payment, Advance or Security Deposit.");

    const k = billNumber.toLowerCase();
    const n = (counters.get(k) || 0) + 1;
    counters.set(k, n);
    const supplied = text(pick(data, ["payment number", "receipt number", "receipt no"]));
    addPayment(bill, {
      row,
      billNumber,
      paymentDate: date || "",
      amount: amount ?? 0,
      method: method || "CASH",
      type: type || "RENTAL_PAYMENT",
      reference: text(pick(data, ["reference", "reference number", "transaction id", "cheque no"])) || null,
      paymentNumber: supplied || `IMP-${billNumber}-${n}`,
      errors,
      warnings,
    });
  }

  // Shortcut: "amount paid" on the Bills sheet when the Payments sheet has nothing for that bill
  for (const { data } of billRows) {
    const bn = text(pick(data, ["bill number", "bill no", "invoice number", "invoice no", "invoice"]));
    const bill = billByKey.get(bn.toLowerCase());
    if (!bill || bill.payments.length > 0) continue;
    const paid = parseMoney(pick(data, ["amount paid", "paid amount", "paid"]));
    if (paid === null || paid <= 0) continue;
    bill.payments.push({
      row: bill.rows[0],
      billNumber: bill.billNumber,
      paymentDate: bill.billDate,
      amount: paid,
      method: mapMethod(pick(data, ["payment method", "method", "mode"])) || "CASH",
      type: "RENTAL_PAYMENT",
      reference: null,
      paymentNumber: `IMP-${bill.billNumber}-1`,
      errors: [],
      warnings: ["Created from the \"Amount Paid\" column using the bill date."],
    });
  }

  for (const bill of bills) {
    bill.totalPaid = Math.round(bill.payments.reduce((a, p) => a + p.amount, 0) * 100) / 100;
    if (bill.totalPaid > bill.computedGrandTotal + 1) {
      bill.warnings.push(`Payments (₹${bill.totalPaid}) exceed the bill total (₹${bill.computedGrandTotal}); the balance will show as ₹0.`);
    }
    for (const p of bill.payments) {
      if (bill.billDate && p.paymentDate && p.paymentDate < bill.billDate) {
        p.warnings.push("Payment date is before the bill date.");
      }
    }
  }

  return { bills, orphanPayments };
}

function emptyBillWithError(row: number, message: string): ParsedBill {
  return {
    billNumber: "",
    rows: [row],
    companyId: null,
    companyLabel: "",
    billDate: "",
    rentalStartDate: "",
    rentalEndDate: "",
    rentalDays: 1,
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    customerGstin: null,
    items: [],
    transportCharges: 0,
    loadingCharges: 0,
    laborCharges: 0,
    otherCharges: 0,
    discountAmount: 0,
    notes: null,
    computedGrandTotal: 0,
    expectedGrandTotal: null,
    payments: [],
    totalPaid: 0,
    action: "create",
    errors: [`Row ${row}: ${message}`],
    warnings: [],
  };
}

function parseProducts(rows: Array<{ row: number; data: Record<string, unknown> }>, ctx: ImportContext): ParsedProduct[] {
  const byName = new Map(ctx.existingProducts.map((p) => [norm(p.name), p.id]));
  const catByName = new Map(ctx.categories.map((c) => [norm(c.name), c.id]));
  const seen = new Set<string>();
  const out: ParsedProduct[] = [];

  for (const { row, data } of rows) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const name = text(pick(data, ["name", "product name", "item name", "item"]));
    if (!name) errors.push("Product name is required.");

    const categoryName = text(pick(data, ["category", "category name", "group"])) || null;
    let categoryId: string | null = null;
    if (categoryName) {
      categoryId = catByName.get(norm(categoryName)) || null;
      if (!categoryId) warnings.push(`Category "${categoryName}" does not exist; the product is saved without a category.`);
    }

    const rentalRate = parseMoney(pick(data, ["rental rate", "rate", "price", "default rental rate"]));
    const totalStock = parseInteger(pick(data, ["total stock", "stock", "quantity", "total quantity", "owned quantity"]));
    const securityDeposit = parseMoney(pick(data, ["security deposit", "deposit"]));
    const replacementValue = parseMoney(pick(data, ["replacement value"]));
    for (const [label, v] of [["Rental rate", rentalRate], ["Total stock", totalStock], ["Security deposit", securityDeposit], ["Replacement value", replacementValue]] as const) {
      if (v !== null && v < 0) errors.push(`${label} cannot be negative.`);
    }

    const key = norm(name);
    let action: ParsedProduct["action"] = "create";
    const existingProductId = key ? byName.get(key) || null : null;
    if (existingProductId) {
      const hasChange = rentalRate !== null || totalStock !== null || securityDeposit !== null || replacementValue !== null || categoryId !== null;
      action = hasChange ? "update" : "skip";
      warnings.push(hasChange ? "Existing product: only the filled-in columns will be updated." : "Existing product with nothing to update; skipped.");
    }
    if (key && seen.has(key)) {
      action = "skip";
      warnings.push("Duplicate product name earlier in this file; skipped.");
    }
    if (key) seen.add(key);

    out.push({
      row,
      name,
      categoryName,
      categoryId,
      sizeSpec: text(pick(data, ["size", "size spec", "specification"])) || null,
      unit: text(pick(data, ["unit"])) || null,
      rentalRate,
      totalStock,
      securityDeposit,
      replacementValue,
      existingProductId,
      action,
      errors,
      warnings,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export function buildImportTemplate(): Buffer {
  const wb = XLSX.utils.book_new();

  const add = (name: string, header: string[], examples: unknown[][], widths?: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet([header, ...examples]);
    ws["!cols"] = (widths || header.map(() => 18)).map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  add("Instructions", ["How to use this file"], [
    ["1. Fill only the sheets you need (Customers, Bills, Payments, Products). Delete the example rows that start with #."],
    ["2. Dates: DD/MM/YYYY (for example 15/03/2025)."],
    ["3. Bills sheet: one row per ITEM. Rows with the same Bill Number are combined into one bill."],
    ["4. Bill totals are recalculated by the system (items x days x rate + charges - discount + GST). Put the old total in \"Grand Total\" to get a warning if it differs."],
    ["5. Payments sheet: one row per payment. Or use the \"Amount Paid\" column on the Bills sheet for a single lump sum."],
    ["6. Customers are matched by mobile number. Missing customers on bills are created automatically."],
    ["7. Imported bills do not change stock, gate passes or returns; they are historical records only."],
    ["8. Existing bill numbers and existing customers are skipped, never overwritten. Products with a matching name are updated only in the columns you fill."],
  ], [120]);

  add("Customers", ["Name", "Mobile", "Address", "GSTIN", "Email", "Contact Person", "State", "Postal Code", "Notes"], [
    ["# Example Traders", "9876543210", "12 Main Road, Vellore", "", "example@mail.com", "Ravi", "Tamil Nadu", "632001", ""],
  ]);

  add(
    "Bills",
    ["Bill Number", "Bill Date", "Company", "Customer Name", "Customer Mobile", "Customer Address", "Customer GSTIN",
      "Rental Start Date", "Rental End Date", "Item Name", "Size", "Quantity", "Days", "Unit Price",
      "Transport Charges", "Loading Charges", "Labour Charges", "Other Charges", "Discount", "Grand Total", "Amount Paid", "Payment Method", "Notes"],
    [
      ["# TNS-GST1-0001", "15/03/2025", "TNS-GST1-", "Example Traders", "9876543210", "12 Main Road, Vellore", "", "16/03/2025", "18/03/2025", "Steel Plate", "10 inch", 50, 3, 2, 500, 0, 0, 0, 0, 1180, 1180, "UPI", ""],
    ],
    [16, 12, 16, 22, 16, 26, 18, 16, 16, 24, 12, 10, 8, 12, 14, 14, 14, 14, 10, 12, 12, 14, 20]
  );

  add("Payments", ["Bill Number", "Payment Date", "Amount", "Method", "Type", "Reference", "Payment Number"], [
    ["# TNS-GST1-0001", "15/03/2025", 1000, "UPI", "Rental Payment", "UPI-12345", ""],
  ]);

  add("Products", ["Name", "Category", "Size", "Unit", "Rental Rate", "Total Stock", "Security Deposit", "Replacement Value"], [
    ["# Steel Plate", "Utensils", "10 inch", "pcs", 2, 500, 0, 15],
  ]);

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
