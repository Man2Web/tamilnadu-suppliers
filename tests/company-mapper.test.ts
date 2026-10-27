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

import { mapUserToRow, mapUserFromRow } from "../src/lib/db/mappers";

describe("user mapper keeps the first-login password rule and the username", () => {
  it("writes must_change_password and username", () => {
    const row = mapUserToRow({ mustChangePassword: true, username: "counter1" });
    assert.equal(row.must_change_password, true);
    assert.equal(row.username, "counter1");
    assert.equal(mapUserToRow({ mustChangePassword: false }).must_change_password, false);
    assert.equal("must_change_password" in mapUserToRow({ name: "x" }), false);
  });

  it("reads must_change_password back instead of always reporting false", () => {
    const base = { id: "1", email: "a@b.co", name: "A", role: "EMPLOYEE", status: "ACTIVE", permissions: [] };
    assert.equal(mapUserFromRow({ ...base, must_change_password: true }).mustChangePassword, true);
    assert.equal(mapUserFromRow({ ...base, must_change_password: false }).mustChangePassword, false);
    assert.equal(mapUserFromRow(base).mustChangePassword, false);
  });
});
