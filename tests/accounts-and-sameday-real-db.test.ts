// ============================================================================
// REAL POSTGRESQL: account lifecycle (create, first login, forced password change, duplicates) and
// same-day quotations/bills against the real rental_days >= 1 constraint.
// Disposable loopback test database only (skipped when TEST_DB_PASSWORD is not set).
// ============================================================================

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { closePostgresPool } from "../src/lib/db/postgresClient";
import { SupabaseStore } from "../src/lib/db/supabaseStore";
import { getTestDbConfig } from "./helpers/testDbConfig";

const testDb = getTestDbConfig();
const P = "ZZACC-";
const COMPANY_ID = `${P}company`;

describe("Accounts and same-day rentals on real PostgreSQL", { skip: !testDb.isConfigured ? testDb.skipReason : false }, () => {
  let pool: Pool;
  let store: SupabaseStore;

  const cleanup = async () => {
    await pool.query(`DELETE FROM public.audit_logs WHERE customer_name LIKE $1 OR entity_number LIKE $2`, [`${P}%`, `${P}%`]);
    await pool.query(`DELETE FROM public.quotation_items WHERE quotation_id IN (SELECT id FROM public.quotations WHERE company_id = $1)`, [COMPANY_ID]);
    await pool.query(`DELETE FROM public.quotation_branches WHERE quotation_id IN (SELECT id FROM public.quotations WHERE company_id = $1)`, [COMPANY_ID]);
    await pool.query(`DELETE FROM public.quotations WHERE company_id = $1`, [COMPANY_ID]);
    await pool.query(`DELETE FROM public.bill_items WHERE bill_id IN (SELECT id FROM public.bills WHERE company_id = $1)`, [COMPANY_ID]);
    await pool.query(`DELETE FROM public.bill_branches WHERE bill_id IN (SELECT id FROM public.bills WHERE company_id = $1)`, [COMPANY_ID]);
    await pool.query(`DELETE FROM public.bills WHERE company_id = $1`, [COMPANY_ID]);
    await pool.query(`DELETE FROM public.customers WHERE name LIKE $1`, [`${P}%`]);
    await pool.query(`DELETE FROM public.products WHERE id LIKE $1`, [`${P}%`]);
    await pool.query(`DELETE FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    await pool.query(`DELETE FROM public.users WHERE email LIKE $1`, [`${P.toLowerCase()}%`]);
  };

  before(async () => {
    pool = new Pool(testDb.getPoolConfig());
    await testDb.assertLiveConnection(pool);
    process.env.DB_PROVIDER = "postgres";
    process.env.DATABASE_URL = testDb.getDatabaseUrl();
    store = new SupabaseStore();
    await cleanup();
    await pool.query(
      `INSERT INTO public.companies (id, name, display_name, phone, address, state, gstin, pan, gst_type, bank_account_no, bank_ifsc,
         invoice_prefix, quotation_prefix, gate_pass_prefix, next_invoice_no, next_quotation_no, next_gate_pass_no, is_active)
       VALUES ($1, 'ZZACC Rentals', 'ZZACC Rentals', '9876543210', 'Vellore', 'Tamil Nadu', '33AAAAA0000A1Z5', 'AAAAA0000A', 'GST_REGISTERED',
         '123456789012', 'SBIN0001234', 'ZZACC-INV-', 'ZZACC-Q-', 'ZZACC-GP-', 1, 1, 1, true)`,
      [COMPANY_ID]
    );
    await pool.query(
      `INSERT INTO public.products (id, name, unit, default_rental_rate, total_owned_quantity, available_quantity)
       VALUES ('${P}prod', '${P}Chair', 'pcs', 20, 100, 100)`
    );
  });

  after(async () => {
    if (pool) {
      await cleanup();
      await pool.end();
    }
    await closePostgresPool();
  });

  it("new account: stored with a hash, forced to change the password at first login, then logs in normally", async () => {
    const created = await store.createUser({ name: "ZZACC Billing", email: "zzacc-bill@example.com", password: "TempPass1", role: "BILLING" }, "SUPER_ADMIN");
    assert.equal(created.role, "BILLING");

    const row = (await pool.query(`SELECT password_hash, must_change_password FROM public.users WHERE email = $1`, ["zzacc-bill@example.com"])).rows[0];
    assert.match(row.password_hash, /^\$2[aby]\$/);
    assert.equal(row.must_change_password, true);

    const first = await store.verifyCredentialsAsync("zzacc-bill@example.com", "TempPass1");
    assert.ok(first, "temporary password must work for the first login");
    assert.equal(first!.mustChangePassword, true);
    assert.equal(await store.verifyCredentialsAsync("zzacc-bill@example.com", "wrong"), null);

    await assert.rejects(store.changePassword(first!.id, "not-the-temp-password", "NewPass22"), /verification failed/);
    const changed = await store.changePassword(first!.id, "TempPass1", "NewPass22");
    assert.equal(changed.user.mustChangePassword, false);

    assert.equal(await store.verifyCredentialsAsync("zzacc-bill@example.com", "TempPass1"), null, "old password must stop working");
    const later = await store.verifyCredentialsAsync("zzacc-bill@example.com", "NewPass22");
    assert.ok(later);
    assert.equal(later!.mustChangePassword, false, "the forced change must not repeat after it is done");
  });

  it("a username-only account logs in with that username; duplicates are refused with a clear message", async () => {
    await store.createUser({ name: "ZZACC Counter", username: "zzacc-counter", password: "Counter11" }, "SUPER_ADMIN");
    const login = await store.verifyCredentialsAsync("zzacc-counter", "Counter11");
    assert.ok(login, "login by the bare username");
    assert.equal(login!.username, "zzacc-counter");

    await assert.rejects(store.createUser({ name: "Again", username: "ZZACC-Counter", password: "Counter11" }, "SUPER_ADMIN"), /already exists/);
    await assert.rejects(store.createUser({ name: "Again", email: "ZZACC-BILL@example.com", password: "Counter11" }, "SUPER_ADMIN"), /already exists/);
    await assert.rejects(store.createUser({ name: "Weak", email: "zzacc-weak@example.com", password: "123" }, "SUPER_ADMIN"), /at least 6/);
    const weak = (await pool.query(`SELECT count(*)::int n FROM public.users WHERE email = 'zzacc-weak@example.com'`)).rows[0].n;
    assert.equal(weak, 0);
  });

  it("a same-day quotation and bill (0 computed days) are saved with 1 rental day instead of failing the database check", async () => {
    const line = { productId: `${P}prod`, itemName: `${P}Chair`, sizeSpec: "std", quantity: 10, days: 1, unitPrice: 20, amount: 200 };
    const quote = await store.createQuotation({
      companyId: COMPANY_ID, customerName: `${P}Cust`, customerPhone: "9000000055", customerAddress: "x",
      rentalStartDate: "2026-11-05", rentalEndDate: "2026-11-05", rentalDays: 0,
      items: [line], documentLines: [line],
    });
    const qrow = (await pool.query(`SELECT rental_days FROM public.quotations WHERE id = $1`, [quote.id])).rows[0];
    assert.equal(qrow.rental_days, 1);

    const bill = await store.createBill({
      companyId: COMPANY_ID, customerName: `${P}Cust`, customerPhone: "9000000055", customerAddress: "x",
      rentalStartDate: "2026-11-05", rentalEndDate: "2026-11-05", rentalDays: 0,
      items: [line], documentLines: [line],
    });
    const brow = (await pool.query(`SELECT rental_days, grand_total FROM public.bills WHERE id = $1`, [bill.id])).rows[0];
    assert.equal(brow.rental_days, 1);
    assert.equal(Number(brow.grand_total), 236); // 200 + 18% GST
  });

  it("editing a quotation recalculates subtotal, tax and grand total on the server; reversed dates are rejected", async () => {
    const line = { productId: `${P}prod`, itemName: `${P}Chair`, sizeSpec: "std", quantity: 10, days: 1, unitPrice: 20, amount: 200 };
    const quote = await store.createQuotation({
      companyId: COMPANY_ID, customerName: `${P}Cust`, customerPhone: "9000000056", customerAddress: "x",
      rentalStartDate: "2026-11-05", rentalEndDate: "2026-11-06", items: [line], documentLines: [line],
    });
    const read = async () =>
      (await pool.query(`SELECT subtotal, total_tax, grand_total, rental_days FROM public.quotations WHERE id = $1`, [quote.id])).rows[0];
    assert.equal(Number((await read()).grand_total), 236);

    // The page sends lines only (never totals): 20 chairs x 2 days x 20 = 800 -> 800 + 18% = 944
    const edited = { ...line, quantity: 20, days: 2, amount: 800 };
    await store.updateQuotation(quote.id, { items: [edited], documentLines: [edited], rentalDays: 2 } as never);
    let row = await read();
    assert.equal(Number(row.subtotal), 800);
    assert.equal(Number(row.total_tax), 144);
    assert.equal(Number(row.grand_total), 944);
    assert.equal(row.rental_days, 2);

    // Changing only a charge also recalculates: (800 + 100) x 1.18 = 1062
    await store.updateQuotation(quote.id, { transportCharges: 100 } as never);
    row = await read();
    assert.equal(Number(row.grand_total), 1062);

    // A reversed date range is refused and nothing changes
    await assert.rejects(
      store.updateQuotation(quote.id, { rentalStartDate: "2026-11-09", rentalEndDate: "2026-11-01" } as never),
      /cannot be before the rental start date/
    );
    assert.equal(Number((await read()).grand_total), 1062);
  });
});
