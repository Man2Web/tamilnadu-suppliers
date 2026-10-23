import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert";
import { stubStore, cookieFor, req } from "./helpers";

// Proves the new authorization guards are transparent to the business workflows: legitimate roles reach the
// unchanged handler logic, and the handler passes the same arguments to the store with no extra side effects.
// Business rules themselves (stock, billing math, returned = dispatched - damaged - missing) live in the store
// and are covered by the existing DB-backed suites, which must be run against an isolated test database.

describe("business workflow routes still work for authorized roles", () => {
  let ctx: Awaited<ReturnType<typeof stubStore>>;
  before(async () => {
    ctx = await stubStore();
  });
  beforeEach(() => {
    ctx.dataCalls.length = 0;
  });

  const P = (id: string) => ({ params: Promise.resolve({ id }) });

  it("9. quotation -> bill conversion reaches the store with unchanged arguments (BILLING)", async () => {
    let captured: any[] = [];
    ctx.overrides.convertQuotationToBill = async (...a: any[]) => {
      captured = a;
      return { id: "b-new", billNumber: "B-1" };
    };
    const { POST } = await import("../../src/app/api/quotations/[id]/convert/route");
    const res = await POST(
      req("/api/quotations/q1/convert", { method: "POST", cookie: await cookieFor("u-billing"), body: { advancePaid: 500, paymentMethod: "CASH" } }),
      P("q1")
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).bill.id, "b-new");
    assert.equal(captured[0], "q1");
    assert.equal(captured[2].advancePaid, 500);
    assert.equal(captured[2].paymentMethod, "CASH");
    assert.equal(captured[2].actor.role, "BILLING");
    assert.deepEqual(ctx.dataCalls, ["convertQuotationToBill"]);
  });

  it("10. payment recording works for BILLING and is attributed to the session user", async () => {
    let payment: any;
    ctx.overrides.getBill = async () => ({ id: "b1", companyId: "c1", customerId: "cu1", customerName: "ACME" });
    ctx.overrides.recordPayment = async (p: any) => {
      payment = p;
      return { id: "pay-1", amount: p.amount };
    };
    const { POST } = await import("../../src/app/api/bills/[id]/payments/route");
    const res = await POST(req("/api/bills/b1/payments", { method: "POST", cookie: await cookieFor("u-billing"), body: { amount: 1200, method: "CASH" } }), P("b1"));
    assert.equal(res.status, 201);
    assert.equal(payment.amount, 1200);
    assert.equal(payment.billId, "b1");
    assert.equal(payment.actor.userId, "u-billing");
    assert.equal(ctx.dataCalls.filter((c) => c === "recordPayment").length, 1);
  });

  it("10. rental return recording passes the payload through unchanged (BILLING)", async () => {
    let args: any[] = [];
    ctx.overrides.recordBillReturn = async (...a: any[]) => {
      args = a;
      return { bill: { id: "b1" } };
    };
    const body = { items: [{ itemId: "i1", quantityReturnedGood: 7, quantityDamaged: 2, quantityMissing: 1 }] };
    const { POST } = await import("../../src/app/api/bills/[id]/returns/route");
    const res = await POST(req("/api/bills/b1/returns", { method: "POST", cookie: await cookieFor("u-billing"), body }), P("b1"));
    assert.equal(res.status, 200);
    assert.equal(args[0], "b1");
    assert.deepEqual(args[1], body); // quantities are not touched by the route layer
    assert.equal(args[2].userId, "u-billing");
    assert.deepEqual(ctx.dataCalls, ["recordBillReturn"]);
  });

  it("12. autosave: repeated saves send the latest values, each with exactly one store write and no extra side effects", async () => {
    const saved: any[] = [];
    ctx.overrides.saveBillWorkspaceChanges = async (id: string, body: any) => {
      saved.push({ id, body });
      return { id, ...body };
    };
    const { PUT } = await import("../../src/app/api/bills/[id]/route");
    const cookie = await cookieFor("u-admin");
    for (const notes of ["first", "second", "latest"]) {
      const res = await PUT(req("/api/bills/b1", { method: "PUT", cookie, body: { notes } }), P("b1"));
      assert.equal(res.status, 200);
    }
    assert.deepEqual(saved.map((s) => s.body.notes), ["first", "second", "latest"]);
    assert.deepEqual(ctx.dataCalls, ["saveBillWorkspaceChanges", "saveBillWorkspaceChanges", "saveBillWorkspaceChanges"]);
  });
});
