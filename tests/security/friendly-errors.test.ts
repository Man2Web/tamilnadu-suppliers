import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { friendlyDbError, friendlyApiError } from "../../src/lib/db/friendlyError";

const db = (code: string, message: string) => ({ code, message });
const quiet = <T>(fn: () => T): T => {
  const original = console.error;
  console.error = () => undefined;
  try {
    return fn();
  } finally {
    console.error = original;
  }
};

describe("friendly database errors", () => {
  it("explains constraint failures in plain words and never shows technical text", () => {
    const cases: Array<[any, RegExp]> = [
      [db("23514", 'new row for relation "quotations" violates check constraint "quotations_rental_days_check"'), /Rental days must be at least 1/],
      [db("23514", 'violates check constraint "bill_items_quantity_check"'), /Quantity cannot be negative/],
      [db("23514", 'violates check constraint "something_else_check"'), /outside the allowed range/],
      [db("23505", 'duplicate key value violates unique constraint "bills_bill_number_key"'), /bill with this number already exists/],
      [db("23505", 'duplicate key value violates unique constraint "payments_payment_number_key"'), /receipt number already exists/],
      [db("23505", 'duplicate key value violates unique constraint "users_email_key"'), /email or username already exists/],
      [db("23503", 'insert or update on table "bills" violates foreign key constraint "bills_company_id_fkey"'), /linked record .* no longer exists/],
      [db("23503", 'update or delete on table "customers" violates foreign key constraint'), /cannot be removed or changed/],
      [db("23502", 'null value in column "customer_name" of relation "bills" violates not-null constraint'), /required field is missing: customer name/],
      [db("22P02", 'invalid input syntax for type integer: "abc"'), /invalid format/],
      [db("40P01", "deadlock detected"), /same time/],
      [db("57014", "canceling statement due to statement timeout"), /took too long/],
      [{ message: "connect ECONNREFUSED 10.0.0.2:5432" }, /not reachable/],
    ];
    for (const [err, expected] of cases) {
      const message = quiet(() => friendlyDbError("creating bill", err));
      assert.match(message, expected);
      assert.doesNotMatch(message, /violates|constraint|relation|SQLSTATE|duplicate key|Supabase|ECONN/i);
    }
  });

  it("falls back to a sentence about what was being done", () => {
    assert.equal(
      quiet(() => friendlyDbError("updating company", { message: "weird" })),
      "Something went wrong while updating company. Please try again; if it keeps happening, contact the administrator."
    );
  });
});

describe("friendly API errors", () => {
  it("keeps deliberate business messages exactly as written", () => {
    for (const m of ["Cannot close bill: Outstanding balance of ₹712.00 remains unpaid.", "Over-return rejected: requested return of 5 units exceeds outstanding 0.", "Rental end date cannot be before the rental start date."]) {
      assert.equal(friendlyApiError(new Error(m)), m);
    }
  });

  it("translates raw database or driver text, including anything mentioning Supabase", () => {
    for (const err of [
      new Error('duplicate key value violates unique constraint "bills_bill_number_key"'),
      new Error("Supabase error fetching user x: Invalid API key"),
      new Error('relation "public.nothing" does not exist'),
      Object.assign(new Error("boom"), { code: "23503" }),
    ]) {
      const message = quiet(() => friendlyApiError(err));
      assert.doesNotMatch(message, /violates|constraint|relation|Supabase|duplicate key|SQLSTATE/i, message);
    }
  });

  it("uses the fallback when there is no message", () => {
    assert.equal(friendlyApiError({}, "Failed to update bill"), "Failed to update bill");
    assert.equal(friendlyApiError(undefined), "Something went wrong. Please try again.");
  });
});
