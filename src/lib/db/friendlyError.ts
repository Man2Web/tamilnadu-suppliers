// ============================================================================
// FRIENDLY DATABASE ERRORS
// Turns raw database failures (constraint names, SQL text, driver messages) into short messages that say what is
// actually wrong, so the screen never shows technical text. The raw error is logged on the server for diagnosis.
// ============================================================================

export interface RawDbError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

// Constraint name -> message. Matched by substring so renamed suffixes keep working.
const CONSTRAINT_MESSAGES: Array<[RegExp, string]> = [
  [/rental_days_check/, "Rental days must be at least 1."],
  [/bill_items_quantity_check|quotation_items_quantity_check|gate_pass_items.*quantity|quantity.*check/, "Quantity cannot be negative."],
  [/bill_items_days_check|quotation_items_days_check|days_check/, "Days cannot be negative."],
  [/payments_amount_check|amount.*check/, "Payment amount must be greater than 0."],
  [/bill_number_key|bills_bill_number/, "A bill with this number already exists."],
  [/quotation_number_key|quotations_quotation_number/, "A quotation with this number already exists."],
  [/gate_pass_number_key/, "A gate pass with this number already exists."],
  [/payment_number_key/, "A payment with this receipt number already exists."],
  [/users_email_key|users_username/, "An account with this email or username already exists."],
  [/companies_.*(prefix|name)/, "A company with this name or prefix already exists."],
  [/customers_.*(mobile|name)/, "A customer with these details already exists."],
  [/products_.*(sku|name)/, "A product with this name or code already exists."],
  [/status_check/, "That status is not allowed for this record."],
  [/gst_type_check|tax_type_check/, "The GST type is not valid."],
  [/role_check/, "The role is not valid."],
];

const NETWORK = /ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|timeout|terminating connection|connection (terminated|refused|closed)|too many clients|fetch failed/i;

/** Message for a database failure while doing `action` (for example "creating quotation"). */
export function friendlyDbError(action: string, error: RawDbError | unknown): string {
  const e = (error || {}) as RawDbError;
  const raw = `${e.message || ""} ${e.details || ""}`;
  const code = e.code || "";

  // Keep the technical text for the server log only
  console.error(`[database] ${action} failed${code ? ` (${code})` : ""}: ${String(e.message || error).slice(0, 400)}`);

  // RAISE EXCEPTION inside the database (SQLSTATE P0001) is a message someone wrote on purpose: show it as written
  if (code === "P0001" && e.message) return e.message;

  if (code === "23505" || /duplicate key|already exists/i.test(raw)) {
    for (const [pattern, message] of CONSTRAINT_MESSAGES) if (pattern.test(raw)) return message;
    return "This record already exists (a value that must be unique is already used).";
  }
  if (code === "23514" || /violates check constraint/i.test(raw)) {
    for (const [pattern, message] of CONSTRAINT_MESSAGES) if (pattern.test(raw)) return message;
    return "One of the values is outside the allowed range. Please check the entries and try again.";
  }
  if (code === "23503" || /violates foreign key constraint/i.test(raw)) {
    return /update or delete on table/i.test(raw)
      ? "This record cannot be removed or changed because other records still use it."
      : "A linked record (company, customer, product or user) no longer exists. Please refresh the page and try again.";
  }
  if (code === "23502" || /violates not-null constraint|null value in column/i.test(raw)) {
    const column = raw.match(/column "([^"]+)"/)?.[1];
    return column ? `A required field is missing: ${column.replace(/_/g, " ")}.` : "A required field is missing.";
  }
  if (code === "22P02" || /invalid input syntax/i.test(raw)) return "One of the values has an invalid format. Please check the entries and try again.";
  if (code === "22001" || /value too long/i.test(raw)) return "One of the values is too long.";
  if (code === "22003" || /numeric field overflow|out of range/i.test(raw)) return "A number is too large.";
  if (code === "22007" || code === "22008" || /invalid input syntax for type (date|timestamp)|date\/time/i.test(raw)) return "A date is not valid.";
  if (code === "40P01" || code === "40001" || /deadlock|could not serialize/i.test(raw)) {
    return "Someone else was changing the same record at the same time. Please try again.";
  }
  if (code === "42501" || /permission denied/i.test(raw)) return "The system is not allowed to do this. Please contact the administrator.";
  if (code === "57014" || /statement timeout|canceling statement/i.test(raw)) return "This took too long and was stopped. Please try again.";
  if (code.startsWith("08") || code === "57P01" || NETWORK.test(raw)) {
    return "The database is not reachable right now. Please try again in a moment.";
  }

  return `Something went wrong while ${action}. Please try again; if it keeps happening, contact the administrator.`;
}

const TECHNICAL =
  /violates (check|foreign key|not-null|unique)|duplicate key value|invalid input syntax|SQLSTATE|relation "[^"]+" does not exist|column "[^"]+" (of relation|does not exist)|syntax error at or near|deadlock detected|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|connection terminated|too many clients|Supabase|PostgREST|\[POSTGRES ADAPTER/i;

/**
 * Message for an API response. Deliberate business messages ("Cannot close bill: balance unpaid") pass through
 * unchanged; anything that looks like raw database or driver text is translated by friendlyDbError.
 */
export function friendlyApiError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const e = (err || {}) as RawDbError;
  const message = typeof e.message === "string" ? e.message : "";
  if (/^[0-9A-Z]{5}$/.test(e.code || "") || TECHNICAL.test(message)) {
    return friendlyDbError("saving your changes", e);
  }
  return message || fallback;
}
