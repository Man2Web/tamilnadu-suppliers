// ============================================================================
// TAMILNADU SUPPLIERS RENTAL ERP - DATA TRANSFORMATION & NORMALIZATION
// File: scripts/migration/transformer.ts
// ============================================================================

import { TableTransformResult } from "./types";

/**
 * Decimal-safe monetary string formatter.
 * Avoids cumulative floating-point rounding errors by strictly handling strings and fixed two decimals.
 */
export function formatDecimalMoney(val: any, fieldName: string = "amount"): string {
  if (val === null || val === undefined || val === "") {
    return "0.00";
  }
  if (typeof val === "number") {
    if (!Number.isFinite(val)) {
      throw new Error(`[DATA ERROR] ${fieldName} has non-finite value: ${val}`);
    }
    return val.toFixed(2);
  }
  const str = String(val).trim();
  const num = parseFloat(str);
  if (isNaN(num) || !Number.isFinite(num)) {
    throw new Error(`[DATA ERROR] ${fieldName} has invalid numeric representation: '${str}'`);
  }
  return num.toFixed(2);
}

/**
 * Validates and normalizes timestamp strings to ISO-8601.
 */
export function normalizeTimestamp(val: any, fieldName: string = "timestamp"): string | null {
  if (val === null || val === undefined || val === "") {
    return null;
  }
  const date = new Date(val);
  if (isNaN(date.getTime())) {
    throw new Error(`[DATA ERROR] Invalid date format for ${fieldName}: '${val}'`);
  }
  return date.toISOString();
}

/**
 * Normalizes JSON/JSONB fields into standard string or null.
 */
export function normalizeJsonb(val: any, defaultVal: string = "[]"): string {
  if (val === null || val === undefined) {
    return defaultVal;
  }
  if (typeof val === "object") {
    return JSON.stringify(val);
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return defaultVal;
    try {
      JSON.parse(trimmed); // Validate well-formedness
      return trimmed;
    } catch {
      throw new Error(`[DATA ERROR] Malformed JSON string: '${trimmed.slice(0, 50)}...'`);
    }
  }
  return JSON.stringify(val);
}

/**
 * Normalizes foreign key or nullable string references.
 * Empty strings are coerced to null to prevent foreign key errors.
 */
export function normalizeNullableString(val: any): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str === "" ? null : str;
}

/**
 * Per-table transformation rules applied to raw source records.
 */
export function transformTableRecords(
  tableName: string,
  records: Array<Record<string, any>>,
  options: { skipSessions?: boolean } = {}
): TableTransformResult {
  const transformedRecords: Array<Record<string, any>> = [];
  const validationErrors: Array<{ recordId: string; column?: string; error: string }> = [];

  for (const raw of records) {
    const recordId = raw.id || raw.key || "[UNKNOWN_ID]";

    try {
      const row: Record<string, any> = { ...raw };

      // Global ID handling: trim strings
      if (typeof row.id === "string") {
        row.id = row.id.trim();
      }

      // Standard timestamp normalization
      if ("created_at" in row) {
        row.created_at = normalizeTimestamp(row.created_at, "created_at") || new Date().toISOString();
      }
      if ("updated_at" in row) {
        row.updated_at = normalizeTimestamp(row.updated_at, "updated_at") || row.created_at || new Date().toISOString();
      }

      // Table-specific business transformations
      switch (tableName) {
        case "users":
          if (row.username) row.username = normalizeNullableString(row.username);
          if (row.phone) row.phone = normalizeNullableString(row.phone);
          if ("permissions" in row) row.permissions = normalizeJsonb(row.permissions, "[]");
          if (row.role === "STAFF") row.role = "EMPLOYEE";
          delete row.company_id;
          break;

        case "companies":
          row.gstin = normalizeNullableString(row.gstin);
          row.pan = normalizeNullableString(row.pan);
          row.email = normalizeNullableString(row.email);
          row.phone = normalizeNullableString(row.phone);
          row.logo_url = normalizeNullableString(row.logo_url);
          row.notes = normalizeNullableString(row.notes);
          if (row.gst_type === "GST") {
            row.gst_type = "GST_REGISTERED";
          }
          delete row.authorized_signatory_name;
          row.next_invoice_no = parseInt(row.next_invoice_no || "1", 10);
          row.next_quotation_no = parseInt(row.next_quotation_no || "1", 10);
          row.next_gate_pass_no = parseInt(row.next_gate_pass_no || "1", 10);
          break;

        case "categories":
          row.parent_id = normalizeNullableString(row.parent_id);
          row.code = normalizeNullableString(row.code);
          row.description = normalizeNullableString(row.description);
          break;

        case "customers":
          row.contact_person = normalizeNullableString(row.contact_person);
          row.whatsapp = normalizeNullableString(row.whatsapp);
          row.email = normalizeNullableString(row.email);
          row.phone = normalizeNullableString(row.phone);
          row.gstin = normalizeNullableString(row.gstin);
          row.postal_code = normalizeNullableString(row.postal_code);
          row.notes = normalizeNullableString(row.notes);
          if ("branches" in row) row.branches = normalizeJsonb(row.branches, "[]");
          break;

        case "customer_branches":
          row.contact_person = normalizeNullableString(row.contact_person);
          row.phone = normalizeNullableString(row.phone);
          row.postal_code = normalizeNullableString(row.postal_code);
          row.delivery_instructions = normalizeNullableString(row.delivery_instructions);
          delete row.is_primary;
          break;

        case "products":
          row.category_id = normalizeNullableString(row.category_id);
          row.default_rental_rate = formatDecimalMoney(row.default_rental_rate ?? row.daily_rental_rate ?? row.rental_rate, "default_rental_rate");
          row.replacement_value = formatDecimalMoney(row.replacement_value ?? row.replacement_cost, "replacement_value");
          row.security_deposit_amount = formatDecimalMoney(row.security_deposit_amount ?? "0.00", "security_deposit_amount");
          row.available_quantity = parseInt(row.available_quantity ?? row.quantity_available ?? "0", 10);
          row.rented_quantity = parseInt(row.rented_quantity ?? row.quantity_on_rent ?? "0", 10);
          row.maintenance_quantity = parseInt(row.maintenance_quantity ?? row.quantity_maintenance ?? "0", 10);
          row.reserved_quantity = parseInt(row.reserved_quantity ?? row.quantity_reserved ?? "0", 10);
          row.damaged_quantity = parseInt(row.damaged_quantity ?? "0", 10);
          row.missing_quantity = parseInt(row.missing_quantity ?? "0", 10);
          row.total_owned_quantity = parseInt(
            row.total_owned_quantity ??
              row.total_quantity ??
              String(row.available_quantity + row.rented_quantity + row.maintenance_quantity + row.reserved_quantity),
            10
          );
          delete row.daily_rental_rate;
          delete row.replacement_cost;
          delete row.quantity_available;
          delete row.quantity_on_rent;
          delete row.quantity_maintenance;
          delete row.total_quantity;
          break;

        case "bills":
          row.subtotal = formatDecimalMoney(row.subtotal, "subtotal");
          row.total_tax = formatDecimalMoney(row.total_tax ?? row.tax_amount, "total_tax");
          row.discount_amount = formatDecimalMoney(row.discount_amount, "discount_amount");
          row.grand_total = formatDecimalMoney(row.grand_total, "grand_total");
          row.advance_paid = formatDecimalMoney(row.advance_paid ?? row.advance_amount, "advance_paid");
          row.amount_paid = formatDecimalMoney(row.amount_paid ?? row.paid_amount ?? "0.00", "amount_paid");
          row.balance_due = formatDecimalMoney(row.balance_due ?? row.balance_amount, "balance_due");
          delete row.tax_amount;
          delete row.advance_amount;
          delete row.paid_amount;
          delete row.balance_amount;
          row.source_quotation_id = normalizeNullableString(row.source_quotation_id);
          row.customer_id = normalizeNullableString(row.customer_id);
          delete row.customer_branch_id;
          row.created_by = normalizeNullableString(row.created_by);
          if ("document_lines" in row) row.document_lines = normalizeJsonb(row.document_lines, "[]");
          if ("incidents" in row) row.incidents = normalizeJsonb(row.incidents, "[]");
          if ("amendments" in row) row.amendments = normalizeJsonb(row.amendments, "[]");
          if ("branches" in row) row.branches = normalizeJsonb(row.branches, "[]");
          break;

        case "bill_items":
          row.unit_price = formatDecimalMoney(row.unit_price, "unit_price");
          row.amount = formatDecimalMoney(row.amount ?? row.total_amount, "amount");
          delete row.total_amount;
          row.product_id = normalizeNullableString(row.product_id);
          row.bill_branch_id = normalizeNullableString(row.bill_branch_id);
          row.quantity = parseInt(row.quantity || "0", 10);
          if ("quantity_returned" in row) {
            row.quantity_physically_returned = parseInt(row.quantity_physically_returned ?? row.quantity_returned ?? "0", 10);
            delete row.quantity_returned;
          }
          delete row.quantity_lost;
          delete row.quantity_damaged;
          break;

        case "quotations":
          row.subtotal = formatDecimalMoney(row.subtotal, "subtotal");
          row.total_tax = formatDecimalMoney(row.total_tax ?? row.tax_amount, "total_tax");
          delete row.tax_amount;
          row.discount_amount = formatDecimalMoney(row.discount_amount, "discount_amount");
          row.grand_total = formatDecimalMoney(row.grand_total, "grand_total");
          row.customer_id = normalizeNullableString(row.customer_id);
          delete row.customer_branch_id;
          row.created_by = normalizeNullableString(row.created_by);
          row.converted_bill_id = normalizeNullableString(row.converted_bill_id);
          if ("document_lines" in row) row.document_lines = normalizeJsonb(row.document_lines, "[]");
          break;

        case "quotation_items":
          row.unit_price = formatDecimalMoney(row.unit_price, "unit_price");
          row.amount = formatDecimalMoney(row.amount ?? row.total_amount, "amount");
          delete row.total_amount;
          row.product_id = normalizeNullableString(row.product_id);
          row.quotation_branch_id = normalizeNullableString(row.quotation_branch_id);
          row.quantity = parseInt(row.quantity || "0", 10);
          break;

        case "product_imports":
          row.created_by = normalizeNullableString(row.created_by);
          if ("errors" in row) row.errors = normalizeJsonb(row.errors, "[]");
          break;

        case "reservations":
          row.quotation_id = normalizeNullableString(row.quotation_id);
          row.bill_id = normalizeNullableString(row.bill_id);
          row.customer_id = normalizeNullableString(row.customer_id);
          row.created_by = normalizeNullableString(row.created_by);
          row.rental_start_date = row.rental_start_date || row.start_date;
          row.rental_end_date = row.rental_end_date || row.end_date;
          delete row.start_date;
          delete row.end_date;
          delete row.company_snapshot;
          delete row.customer_name;
          break;

        case "reservation_items":
          row.product_id = normalizeNullableString(row.product_id);
          delete row.item_name;
          break;

        case "payments":
          row.amount = formatDecimalMoney(row.amount, "amount");
          row.bill_id = normalizeNullableString(row.bill_id);
          row.customer_id = normalizeNullableString(row.customer_id);
          row.created_by = normalizeNullableString(row.created_by);
          if (row.payment_date && typeof row.payment_date === "string") {
            row.payment_date = row.payment_date.split("T")[0];
          }
          if (row.payment_type) {
            const pt = String(row.payment_type).toUpperCase();
            if (["RENTAL_PAYMENT", "ADVANCE", "SECURITY_DEPOSIT", "DEPOSIT_REFUND", "DAMAGE_SETTLEMENT"].includes(pt)) {
              row.payment_type = pt;
            } else {
              row.payment_type = "RENTAL_PAYMENT";
            }
          } else {
            row.payment_type = "RENTAL_PAYMENT";
          }
          break;

        case "gate_passes":
          row.bill_id = normalizeNullableString(row.bill_id);
          row.reservation_id = normalizeNullableString(row.reservation_id);
          row.customer_id = normalizeNullableString(row.customer_id);
          row.created_by = normalizeNullableString(row.created_by);
          row.dispatch_date = normalizeTimestamp(row.dispatch_date, "dispatch_date") || row.created_at;
          break;

        case "gate_pass_items":
          row.product_id = normalizeNullableString(row.product_id);
          row.quantity_dispatched = parseInt(row.quantity_dispatched ?? row.quantity ?? "1", 10);
          delete row.bill_item_id;
          delete row.quantity;
          break;

        case "returns":
          row.gate_pass_id = normalizeNullableString(row.gate_pass_id);
          row.customer_id = normalizeNullableString(row.customer_id);
          row.created_by = normalizeNullableString(row.created_by);
          row.inspected_by = row.inspected_by || row.received_by || "Store Manager";
          row.damage_charges = formatDecimalMoney(row.damage_charges ?? "0.00", "damage_charges");
          row.late_fee_charges = formatDecimalMoney(row.late_fee_charges ?? "0.00", "late_fee_charges");
          row.deposit_adjustment = formatDecimalMoney(row.deposit_adjustment ?? "0.00", "deposit_adjustment");
          row.return_date = normalizeTimestamp(row.return_date, "return_date") || row.created_at;
          delete row.bill_id;
          delete row.received_by;
          delete row.vehicle_number;
          delete row.driver_name;
          delete row.driver_phone;
          delete row.status;
          delete row.company_snapshot;
          delete row.customer_name;
          break;

        case "return_items":
          row.product_id = normalizeNullableString(row.product_id);
          row.gate_pass_item_id = normalizeNullableString(row.gate_pass_item_id);
          row.quantity_returned_good = parseInt(row.quantity_returned_good || "0", 10);
          row.quantity_damaged = parseInt(row.quantity_damaged || "0", 10);
          row.quantity_missing = parseInt(row.quantity_missing || "0", 10);
          row.quantity_expected = parseInt(row.quantity_expected || "0", 10);
          row.damage_notes = row.damage_notes ?? row.condition_notes ?? null;
          delete row.condition_notes;
          delete row.charge_approval_status;
          delete row.assessed_charge_amount;
          break;

        case "inventory_movements":
          row.created_by = normalizeNullableString(row.created_by);
          row.product_id = normalizeNullableString(row.product_id);
          row.quantity_change = parseInt(row.quantity_change ?? row.quantity ?? "0", 10);
          row.reference_id = normalizeNullableString(row.reference_id ?? row.bill_id ?? row.gate_pass_id ?? row.return_id);
          row.reference_type = row.reference_type || (row.gate_pass_id ? "GATE_PASS" : row.return_id ? "RETURN" : "BILL");
          row.balance_after = parseInt(row.balance_after ?? "0", 10);
          if (row.movement_type === "RETURN") {
            row.movement_type = "RETURN_GOOD";
          }
          delete row.quantity;
          delete row.bill_id;
          delete row.gate_pass_id;
          delete row.return_id;
          break;

        case "whatsapp_logs":
          row.document_number = row.document_number || (row.document_type + "-0001");
          row.recipient_name = row.recipient_name || "Customer";
          row.share_method = row.share_method || "HANDOFF_WEB";
          if (row.content && !row.message_payload) {
            row.message_payload = row.content;
          }
          delete row.content;
          delete row.message_type;
          break;

        case "sessions":
          if (options.skipSessions) {
            // Cutover policy: Active sessions are excluded / invalidated
            continue;
          }
          row.rejected_by_user_id = normalizeNullableString(row.rejected_by_user_id);
          row.expires_at = normalizeTimestamp(row.expires_at, "expires_at");
          break;

        case "login_rate_limits":
          row.attempts = parseInt(row.attempts || "0", 10);
          row.window_start = normalizeTimestamp(row.window_start ?? row.last_attempt_at, "window_start") || new Date().toISOString();
          row.locked_until = normalizeNullableString(row.locked_until);
          delete row.last_attempt_at;
          break;

        case "activity_notifications":
          row.user_id = normalizeNullableString(row.user_id);
          row.user_name = row.user_name || "Admin Officer";
          row.username = row.username || "tns_admin";
          row.role = row.role || "ADMIN";
          row.session_id = row.session_id || "migration-session";
          delete row.data;
          break;

        case "audit_logs":
          row.actor_id = normalizeNullableString(row.actor_id);
          delete row.company_id;
          if ("details" in row) row.details = normalizeJsonb(row.details, "{}");
          break;
      }

      transformedRecords.push(row);
    } catch (err: any) {
      validationErrors.push({
        recordId,
        error: err.message,
      });
    }
  }

  return {
    tableName,
    transformedRecords,
    validationErrors,
  };
}
