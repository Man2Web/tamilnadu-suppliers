// Regression: partial company updates (for example the invoice counter bump on every new bill) must never
// overwrite the company's address and bank details with placeholder defaults.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapCompanyToRow } from "../src/lib/db/mappers";

describe("mapCompanyToRow", () => {
  it("does not invent address or bank values for a partial update", () => {
    const row = mapCompanyToRow({ nextInvoiceNo: 42, updatedAt: "2026-01-01T00:00:00.000Z" });
    assert.deepEqual(Object.keys(row).sort(), ["next_invoice_no", "updated_at"]);
  });

  it("writes the values it is given", () => {
    const row = mapCompanyToRow({ address: "Real Road", bankName: "Real Bank", bankAccountNo: "111", bankIfsc: "X", bankBranch: "Y" });
    assert.equal(row.address, "Real Road");
    assert.equal(row.bank_name, "Real Bank");
    assert.equal(row.bank_account_no, "111");
  });
});
