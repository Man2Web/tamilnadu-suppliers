// Regression: a same-day rental computes to 0 days, but quotations/bills.rental_days must be >= 1 in the database.
// Saving such a quotation from the New Quotation page failed with a raw "quotations_rental_days_check" error.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapQuotationToRow, mapBillToRow } from "../src/lib/db/mappers";
import { calculateRentalDays } from "../src/lib/calculations/financial";

describe("rental_days is never below 1 when persisted", () => {
  it("same-day dates still compute to 0 for display (unchanged rule)", () => {
    assert.equal(calculateRentalDays("2026-11-05", "2026-11-05"), 0);
  });

  it("quotation rows floor 0 / invalid days to 1 and keep real values", () => {
    assert.equal(mapQuotationToRow({ rentalDays: 0 }).rental_days, 1);
    assert.equal(mapQuotationToRow({ rentalDays: Number.NaN as number }).rental_days, 1);
    assert.equal(mapQuotationToRow({ rentalDays: 3 }).rental_days, 3);
  });

  it("bill rows floor 0 / invalid days to 1 and keep real values", () => {
    assert.equal(mapBillToRow({ rentalDays: 0 }).rental_days, 1);
    assert.equal(mapBillToRow({ rentalDuration: 0 }).rental_days, 1);
    assert.equal(mapBillToRow({ rentalDays: 4 }).rental_days, 4);
  });
});
