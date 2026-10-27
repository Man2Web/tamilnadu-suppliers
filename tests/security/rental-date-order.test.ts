import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./helpers"; // safe test env variables
import { SupabaseStore } from "../../src/lib/db/supabaseStore";
import { getRentalDateError } from "../../src/lib/calculations/financial";

describe("a rental can never end before it starts", () => {
  it("getRentalDateError flags only reversed dates", () => {
    assert.match(getRentalDateError("2026-11-07", "2026-10-27")!, /cannot be before/);
    assert.equal(getRentalDateError("2026-11-05", "2026-11-05"), null); // same day is allowed
    assert.equal(getRentalDateError("2026-11-05", "2026-11-07"), null);
    assert.equal(getRentalDateError("", "2026-11-07"), null);
    assert.equal(getRentalDateError(undefined, undefined), null);
  });

  for (const kind of ["quotation", "bill"] as const) {
    it(`createQuotation/createBill reject reversed dates before consuming a ${kind} number`, async () => {
      const store = new SupabaseStore() as any;
      let numberAllocated = false;
      store.getCompany = async () => ({ id: "c", gstType: "NON_GST", placeOfSupply: "Vellore", isActive: true });
      store.getNextDocumentNumber = async () => {
        numberAllocated = true;
        return "X-1";
      };
      const data = { companyId: "c", customerName: "A", customerPhone: "9000000000", rentalStartDate: "2026-11-07", rentalEndDate: "2026-10-27", items: [] };
      const promise = kind === "quotation" ? store.createQuotation(data) : store.createBill(data);
      await assert.rejects(promise, /cannot be before the rental start date/);
      assert.equal(numberAllocated, false, "a rejected document must not burn a document number");
    });
  }
});
