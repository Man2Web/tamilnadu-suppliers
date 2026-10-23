import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert";
import { stubStore, cookieFor, req } from "./helpers";

type Handler = (r: Request, ctx?: any) => Promise<Response>;

interface Case {
  name: string;
  load: () => Promise<Record<string, Handler>>;
  method: string;
  url: string;
  body?: any;
  params?: Record<string, string>;
  /** roles that must be allowed through the guard (everyone else must get 403) */
  allowed: string[];
}

const SUPER = ["u-super"];
const SUPER_ADMIN_BILLING = ["u-super", "u-admin", "u-billing"];

// Permission matrix under test (mirrors the presets: ADMIN / BILLING / EMPLOYEE with no permissions).
const CASES: Case[] = [
  { name: "admin/sessions GET", load: () => import("../../src/app/api/admin/sessions/route") as any, method: "GET", url: "/api/admin/sessions", allowed: SUPER },
  { name: "admin/audit-logs GET", load: () => import("../../src/app/api/admin/audit-logs/route") as any, method: "GET", url: "/api/admin/audit-logs", allowed: SUPER },
  { name: "admin/notifications GET", load: () => import("../../src/app/api/admin/notifications/route") as any, method: "GET", url: "/api/admin/notifications", allowed: SUPER },
  { name: "companies POST", load: () => import("../../src/app/api/companies/route") as any, method: "POST", url: "/api/companies", body: { name: "x" }, allowed: SUPER },
  { name: "companies/[id] DELETE", load: () => import("../../src/app/api/companies/[id]/route") as any, method: "DELETE", url: "/api/companies/c1", params: { id: "c1" }, allowed: SUPER },
  { name: "companies/[id] PATCH", load: () => import("../../src/app/api/companies/[id]/route") as any, method: "PATCH", url: "/api/companies/c1", params: { id: "c1" }, body: { isActive: false }, allowed: SUPER },
  { name: "companies/[id] PUT", load: () => import("../../src/app/api/companies/[id]/route") as any, method: "PUT", url: "/api/companies/c1", params: { id: "c1" }, body: {}, allowed: SUPER },
  { name: "users GET", load: () => import("../../src/app/api/users/route") as any, method: "GET", url: "/api/users", allowed: SUPER },
  { name: "users POST", load: () => import("../../src/app/api/users/route") as any, method: "POST", url: "/api/users", body: {}, allowed: SUPER },
  { name: "products GET", load: () => import("../../src/app/api/products/route") as any, method: "GET", url: "/api/products", allowed: SUPER_ADMIN_BILLING },
  { name: "products POST", load: () => import("../../src/app/api/products/route") as any, method: "POST", url: "/api/products", body: { name: "p" }, allowed: ["u-super", "u-admin"] },
  { name: "products/import POST", load: () => import("../../src/app/api/products/import/route") as any, method: "POST", url: "/api/products/import", allowed: ["u-super", "u-admin"] },
  { name: "customers GET", load: () => import("../../src/app/api/customers/route") as any, method: "GET", url: "/api/customers", allowed: SUPER_ADMIN_BILLING },
  { name: "customers POST", load: () => import("../../src/app/api/customers/route") as any, method: "POST", url: "/api/customers", body: { name: "a", mobile: "1" }, allowed: SUPER_ADMIN_BILLING },
  { name: "customers/[id] PUT", load: () => import("../../src/app/api/customers/[id]/route") as any, method: "PUT", url: "/api/customers/c1", params: { id: "c1" }, body: {}, allowed: ["u-super", "u-admin"] },
  { name: "quotations GET", load: () => import("../../src/app/api/quotations/route") as any, method: "GET", url: "/api/quotations", allowed: SUPER_ADMIN_BILLING },
  { name: "quotations POST", load: () => import("../../src/app/api/quotations/route") as any, method: "POST", url: "/api/quotations", body: {}, allowed: SUPER_ADMIN_BILLING },
  { name: "quotations/[id]/convert POST", load: () => import("../../src/app/api/quotations/[id]/convert/route") as any, method: "POST", url: "/api/quotations/q1/convert", params: { id: "q1" }, body: {}, allowed: SUPER_ADMIN_BILLING },
  { name: "bills GET", load: () => import("../../src/app/api/bills/route") as any, method: "GET", url: "/api/bills", allowed: SUPER_ADMIN_BILLING },
  { name: "bills POST", load: () => import("../../src/app/api/bills/route") as any, method: "POST", url: "/api/bills", body: {}, allowed: SUPER_ADMIN_BILLING },
  { name: "bills/[id] GET", load: () => import("../../src/app/api/bills/[id]/route") as any, method: "GET", url: "/api/bills/b1", params: { id: "b1" }, allowed: SUPER_ADMIN_BILLING },
  { name: "bills/[id] PUT (autosave)", load: () => import("../../src/app/api/bills/[id]/route") as any, method: "PUT", url: "/api/bills/b1", params: { id: "b1" }, body: {}, allowed: SUPER_ADMIN_BILLING },
  { name: "bills/[id]/payments POST", load: () => import("../../src/app/api/bills/[id]/payments/route") as any, method: "POST", url: "/api/bills/b1/payments", params: { id: "b1" }, body: {}, allowed: SUPER_ADMIN_BILLING },
  { name: "bills/[id]/returns POST", load: () => import("../../src/app/api/bills/[id]/returns/route") as any, method: "POST", url: "/api/bills/b1/returns", params: { id: "b1" }, body: {}, allowed: SUPER_ADMIN_BILLING },
  { name: "bills/[id]/dispatch POST", load: () => import("../../src/app/api/bills/[id]/dispatch/route") as any, method: "POST", url: "/api/bills/b1/dispatch", params: { id: "b1" }, body: {}, allowed: SUPER_ADMIN_BILLING },
  { name: "bills/[id]/reopen POST", load: () => import("../../src/app/api/bills/[id]/reopen/route") as any, method: "POST", url: "/api/bills/b1/reopen", params: { id: "b1" }, body: {}, allowed: ["u-super", "u-admin"] },
  { name: "finance/payments POST", load: () => import("../../src/app/api/finance/payments/route") as any, method: "POST", url: "/api/finance/payments", body: {}, allowed: SUPER_ADMIN_BILLING },
  { name: "operations/returns GET", load: () => import("../../src/app/api/operations/returns/route") as any, method: "GET", url: "/api/operations/returns", allowed: SUPER_ADMIN_BILLING },
  { name: "operations/gate-passes POST", load: () => import("../../src/app/api/operations/gate-passes/route") as any, method: "POST", url: "/api/operations/gate-passes", body: {}, allowed: SUPER_ADMIN_BILLING },
  { name: "dashboard/summary GET", load: () => import("../../src/app/api/dashboard/summary/route") as any, method: "GET", url: "/api/dashboard/summary", allowed: SUPER_ADMIN_BILLING },
  { name: "documents/bill pdf GET", load: () => import("../../src/app/api/documents/bill/[id]/pdf/route") as any, method: "GET", url: "/api/documents/bill/b1/pdf", params: { id: "b1" }, allowed: SUPER_ADMIN_BILLING },
  { name: "documents/quotation pdf GET", load: () => import("../../src/app/api/documents/quotation/[id]/pdf/route") as any, method: "GET", url: "/api/documents/quotation/q1/pdf", params: { id: "q1" }, allowed: SUPER_ADMIN_BILLING },
  { name: "whatsapp/share POST", load: () => import("../../src/app/api/whatsapp/share/route") as any, method: "POST", url: "/api/whatsapp/share", body: {}, allowed: SUPER_ADMIN_BILLING },
  // Authenticated-only reads (any active role)
  { name: "companies GET", load: () => import("../../src/app/api/companies/route") as any, method: "GET", url: "/api/companies", allowed: [...SUPER_ADMIN_BILLING, "u-employee"] },
];

async function call(c: Case, cookie?: string, headers?: Record<string, string>): Promise<{ status: number; threw: boolean }> {
  const mod = await c.load();
  const handler = mod[c.method];
  assert.ok(handler, `${c.name}: handler ${c.method} missing`);
  const request = req(c.url, { method: c.method, cookie, headers, body: c.body });
  try {
    const res = await handler(request, { params: Promise.resolve(c.params || {}) });
    return { status: res.status, threw: false };
  } catch {
    // The handler got past the guard and failed later on stubbed data: that counts as "allowed".
    return { status: 599, threw: true };
  }
}

describe("API route authorization (direct handler calls, stubbed store)", () => {
  let ctx: Awaited<ReturnType<typeof stubStore>>;
  before(async () => {
    ctx = await stubStore();
  });
  beforeEach(() => {
    ctx.dataCalls.length = 0;
  });

  for (const c of CASES) {
    it(`3. ${c.name}: unauthenticated -> 401 and no data access`, async () => {
      const r = await call(c);
      assert.equal(r.status, 401);
      assert.deepEqual(ctx.dataCalls, []);
    });

    it(`3. ${c.name}: spoofed x-user-role / x-user-id headers without a session -> 401`, async () => {
      const r = await call(c, undefined, { "x-user-role": "SUPER_ADMIN", "x-user-id": "u-super" });
      assert.equal(r.status, 401);
      assert.deepEqual(ctx.dataCalls, []);
    });

    for (const user of ["u-super", "u-admin", "u-billing", "u-employee"]) {
      const shouldAllow = c.allowed.includes(user);
      it(`${shouldAllow ? "5" : "4"}. ${c.name}: ${user} ${shouldAllow ? "allowed" : "-> 403 and no data access"}`, async () => {
        const r = await call(c, await cookieFor(user));
        if (shouldAllow) {
          assert.ok(r.status !== 401 && r.status !== 403, `expected access for ${user}, got ${r.status}`);
        } else {
          assert.equal(r.status, 403);
          assert.deepEqual(ctx.dataCalls, []);
        }
      });
    }

    it(`6. ${c.name}: a non-allowed role cannot escalate by sending x-user-role: SUPER_ADMIN`, async () => {
      const denied = ["u-super", "u-admin", "u-billing", "u-employee"].filter((u) => !c.allowed.includes(u));
      for (const user of denied) {
        const r = await call(c, await cookieFor(user), { "x-user-role": "SUPER_ADMIN", "x-user-id": "u-super" });
        assert.equal(r.status, 403, `${user} escalated via headers`);
      }
      assert.deepEqual(ctx.dataCalls, []);
    });
  }

  it("inactive accounts are rejected even with a validly signed cookie", async () => {
    const r = await call(CASES[0], await cookieFor("u-inactive"));
    assert.equal(r.status, 401);
  });

  it("/api/db/verify no longer exists", async () => {
    await assert.rejects(import("../../src/app/api/db/verify/route"));
  });
});
