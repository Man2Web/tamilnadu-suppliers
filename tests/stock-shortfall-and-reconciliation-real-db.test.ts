// ============================================================================
// STOCK: ZERO-AVAILABLE DISPATCH EXCEPTION, RETURNS, DAMAGED, MISSING, CLOSURE
// Runs only against the disposable test database (see tests/helpers/testDbConfig.ts).
// ============================================================================

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { closePostgresPool } from "../src/lib/db/postgresClient";
import { SupabaseStore } from "../src/lib/db/supabaseStore";
import { getTestDbConfig } from "./helpers/testDbConfig";

const testDb = getTestDbConfig();
const P = "test:stk:";
const COMPANY_ID = `${P}comp`;
const CUSTOMER_ID = "0663cf3d-5700-4000-8000-000000000001";
const USER_ID = "0663cf3d-5700-4000-8000-000000000002";
const PROD_ZERO = `${P}prod-zero`;
const PROD_PARTIAL = `${P}prod-partial`;

const admin = { id: USER_ID, name: "Stock Test Admin", role: "ADMIN" };
const biller = { id: USER_ID, name: "Stock Test Biller", role: "BILLING" };

describe("Stock shortfall dispatch, returns, damaged, missing and closure", { skip: !testDb.isConfigured ? testDb.skipReason : false }, () => {
  let pool: Pool;
  let store: SupabaseStore;

  async function clean() {
    await pool.query(`DELETE FROM public.audit_logs WHERE entity_number LIKE 'TNS-STK-%' OR entity_number LIKE 'TNGP-STK-%'`);
    await pool.query(`DELETE FROM public.inventory_movements WHERE product_id LIKE $1`, [`${P}%`]);
    await pool.query(`DELETE FROM public.return_items WHERE return_id IN (SELECT id FROM public.returns WHERE company_id = $1)`, [COMPANY_ID]);
    await pool.query(`DELETE FROM public.returns WHERE company_id = $1`, [COMPANY_ID]);
    await pool.query(
      `DELETE FROM public.gate_pass_items WHERE gate_pass_id IN (SELECT id FROM public.gate_passes WHERE company_id = $1)`,
      [COMPANY_ID]
    );
    await pool.query(`DELETE FROM public.gate_passes WHERE company_id = $1`, [COMPANY_ID]);
    await pool.query(`DELETE FROM public.payments WHERE company_id = $1`, [COMPANY_ID]);
    await pool.query(`DELETE FROM public.bill_items WHERE bill_id IN (SELECT id FROM public.bills WHERE company_id = $1)`, [COMPANY_ID]);
    await pool.query(`DELETE FROM public.bill_branches WHERE bill_id IN (SELECT id FROM public.bills WHERE company_id = $1)`, [COMPANY_ID]);
    await pool.query(`DELETE FROM public.bills WHERE company_id = $1`, [COMPANY_ID]);
    await pool.query(`DELETE FROM public.products WHERE id LIKE $1`, [`${P}%`]);
    await pool.query(`DELETE FROM public.customers WHERE id = $1`, [CUSTOMER_ID]);
    await pool.query(`DELETE FROM public.users WHERE id = $1`, [USER_ID]);
    await pool.query(`DELETE FROM public.companies WHERE id = $1`, [COMPANY_ID]);
  }

  before(async () => {
    pool = new Pool(testDb.getPoolConfig());
    await testDb.assertLiveConnection(pool);
    process.env.DB_PROVIDER = "postgres";
    process.env.DATABASE_URL = testDb.getDatabaseUrl();
    store = new SupabaseStore();
    await clean();
    await pool.query(
      `INSERT INTO public.users (id, email, password_hash, name, role, status) VALUES ($1, 'stk@tamilnadusuppliers.com', 'x', 'Stock Test Admin', 'ADMIN', 'ACTIVE')`,
      [USER_ID]
    );
    await pool.query(
      `INSERT INTO public.companies (id, name, display_name, phone, address, state, gstin, pan, gst_type, bank_account_no, bank_ifsc,
         invoice_prefix, quotation_prefix, gate_pass_prefix, next_invoice_no, next_quotation_no, next_gate_pass_no, is_active)
       VALUES ($1, 'Stock Test Co', 'Stock Test Co', '9876543210', 'Vellore', 'Tamil Nadu', '33AAAAA0000A1Z5', 'AAAAA0000A', 'NON_GST',
         '123456789012', 'SBIN0001234', 'TNS-STK-', 'TNQ-STK-', 'TNGP-STK-', 1, 1, 1, true)`,
      [COMPANY_ID]
    );
    await pool.query(
      `INSERT INTO public.customers (id, name, mobile, billing_address, state, is_active) VALUES ($1, 'Stock Test Customer', '9876511111', 'Vellore', 'Tamil Nadu', true)`,
      [CUSTOMER_ID]
    );
    // PROD_ZERO: recorded available is 0 although the shop owns 10 (inventory not recorded accurately)
    await pool.query(
      `INSERT INTO public.products (id, name, sku, unit, default_rental_rate, total_owned_quantity, available_quantity, rented_quantity, is_active) VALUES
        ($1, 'Stock Test Dabara', 'SKU-STK-Z', 'Nos', 10, 10, 0, 0, true),
        ($2, 'Stock Test Chair', 'SKU-STK-P', 'Nos', 5, 10, 3, 0, true)`,
      [PROD_ZERO, PROD_PARTIAL]
    );
  });

  after(async () => {
    try {
      await clean();
    } finally {
      await closePostgresPool();
      await pool.end();
      delete process.env.DB_PROVIDER;
      delete process.env.DATABASE_URL;
    }
  });

  async function seedBill(id: string, number: string) {
    await pool.query(
      `INSERT INTO public.bills (id, bill_number, company_id, company_snapshot, customer_id, customer_name, customer_phone, customer_address,
         bill_date, rental_start_date, rental_end_date, rental_days, status, tax_type, subtotal, grand_total, balance_due, amount_in_words)
       VALUES ($1, $2, $3, '{}'::jsonb, $4, 'Stock Test Customer', '9876511111', 'Vellore', CURRENT_DATE, '2026-11-01', '2026-11-03', 2,
         'ISSUED', 'NON_GST', 0, 0, 0, 'Zero')`,
      [id, number, COMPANY_ID, CUSTOMER_ID]
    );
  }

  const prod = async (id: string) =>
    (
      await pool.query(
        `SELECT available_quantity a, rented_quantity r, damaged_quantity d, missing_quantity m, total_owned_quantity t FROM public.products WHERE id = $1`,
        [id]
      )
    ).rows[0];

  const dispatchBody = (billId: string, items: any[], extra: any = {}, actor: any = admin) => ({
    companyId: COMPANY_ID,
    customerId: CUSTOMER_ID,
    customerName: "Stock Test Customer",
    billId,
    actor,
    items,
    ...extra,
  });

  const billId = `${P}bill-1`;

  it("1. zero available stock blocks a normal dispatch and nothing changes", async () => {
    await seedBill(billId, "TNS-STK-0001");
    await assert.rejects(
      () => store.createGatePass(dispatchBody(billId, [{ productId: PROD_ZERO, itemName: "Stock Test Dabara", quantityDispatched: 4 }])),
      /Insufficient stock for "Stock Test Dabara": requested 4, available 0/
    );
    assert.deepEqual(await prod(PROD_ZERO), { a: 0, r: 0, d: 0, m: 0, t: 10 });
    const gps = await pool.query(`SELECT 1 FROM public.gate_passes WHERE bill_id = $1`, [billId]);
    assert.equal(gps.rows.length, 0);
  });

  it("2. a non-admin cannot use the exception, even by sending the flag", async () => {
    await assert.rejects(
      () =>
        store.createGatePass(
          dispatchBody(billId, [{ productId: PROD_ZERO, itemName: "x", quantityDispatched: 4 }], { allowStockShortfall: true, stockShortfallReason: "stock not entered yet" }, biller)
        ),
      /Insufficient stock/
    );
    assert.deepEqual(await prod(PROD_ZERO), { a: 0, r: 0, d: 0, m: 0, t: 10 });
  });

  it("3. an administrator needs a reason to use the exception", async () => {
    await assert.rejects(
      () => store.createGatePass(dispatchBody(billId, [{ productId: PROD_ZERO, itemName: "x", quantityDispatched: 4 }], { allowStockShortfall: true })),
      /reason/i
    );
    assert.deepEqual(await prod(PROD_ZERO), { a: 0, r: 0, d: 0, m: 0, t: 10 });
  });

  it("4. admin exception dispatches: available never below 0, rented counts the goods, audit and movement are written", async () => {
    const gp = await store.createGatePass(
      dispatchBody(
        billId,
        [
          { productId: PROD_ZERO, itemName: "Stock Test Dabara", quantityDispatched: 4 },
          { productId: PROD_PARTIAL, itemName: "Stock Test Chair", quantityDispatched: 5 }, // 3 recorded, 2 short
        ],
        { allowStockShortfall: true, stockShortfallReason: "Opening stock was never entered" }
      )
    );
    assert.equal(gp.items.length, 2);
    assert.deepEqual(await prod(PROD_ZERO), { a: 0, r: 4, d: 0, m: 0, t: 10 }, "total owned untouched, no invented stock");
    assert.deepEqual(await prod(PROD_PARTIAL), { a: 0, r: 5, d: 0, m: 0, t: 10 });
    const audit = await pool.query(`SELECT details FROM public.audit_logs WHERE action = 'STOCK_SHORTFALL_DISPATCH' AND entity_id = $1`, [billId]);
    assert.equal(audit.rows.length, 1);
    assert.match(JSON.stringify(audit.rows[0].details), /Opening stock was never entered/);
    assert.match(JSON.stringify(audit.rows[0].details), /"shortfall":4/);
    const mv = await pool.query(`SELECT quantity_change, notes FROM public.inventory_movements WHERE reference_id = $1 AND product_id = $2`, [gp.id, PROD_PARTIAL]);
    assert.equal(mv.rows[0].quantity_change, -3);
    assert.match(mv.rows[0].notes, /STOCK EXCEPTION for 2/);
  });

  it("5. repeated dispatch of the same bill is still rejected", async () => {
    await assert.rejects(
      () =>
        store.createGatePass(
          dispatchBody(billId, [{ productId: PROD_ZERO, itemName: "x", quantityDispatched: 1 }], { allowStockShortfall: true, stockShortfallReason: "second try" })
        ),
      /already been dispatched/
    );
  });

  async function gpItemIds() {
    const rows = (
      await pool.query(
        `SELECT gi.id, gi.product_id FROM public.gate_pass_items gi JOIN public.gate_passes g ON g.id = gi.gate_pass_id WHERE g.bill_id = $1`,
        [billId]
      )
    ).rows;
    return {
      dabara: rows.find((g) => g.product_id === PROD_ZERO),
      chair: rows.find((g) => g.product_id === PROD_PARTIAL),
    };
  }

  it("6. partial return: good units raise available, damaged and missing stay apart, bill cannot close with items outstanding", async () => {
    const { dabara, chair } = await gpItemIds();
    await store.recordBillReturn(
      billId,
      {
        items: [
          { gatePassItemId: dabara.id, productId: PROD_ZERO, itemName: "Stock Test Dabara", goodQuantity: 2, damagedQuantity: 1, missingQuantity: 0 },
          { gatePassItemId: chair.id, productId: PROD_PARTIAL, itemName: "Stock Test Chair", goodQuantity: 3, damagedQuantity: 0, missingQuantity: 1 },
        ],
      },
      admin
    );
    assert.deepEqual(await prod(PROD_ZERO), { a: 2, r: 1, d: 1, m: 0, t: 10 });
    assert.deepEqual(await prod(PROD_PARTIAL), { a: 3, r: 1, d: 0, m: 1, t: 10 });

    const types = (
      await pool.query(`SELECT movement_type, product_id FROM public.inventory_movements WHERE reference_type = 'RETURN' ORDER BY movement_type, product_id`)
    ).rows.filter((r) => String(r.product_id).startsWith(P));
    assert.deepEqual(
      types.map((t) => t.movement_type),
      ["RETURN_DAMAGED", "RETURN_GOOD", "RETURN_GOOD", "RETURN_MISSING"]
    );

    // pending damage/missing decisions block closing first, so resolve them to reach the outstanding-goods check
    const mid = await store.getBill(billId);
    for (const inc of mid!.incidents || []) {
      await store.resolveDamageMissingIncident(billId, inc.id, { action: "NO_CHARGE" }, admin);
    }
    await assert.rejects(() => store.closeBill(billId, { allowOutstandingClose: true }, admin), /not yet accounted for/);
    const status = (await pool.query(`SELECT status FROM public.bills WHERE id = $1`, [billId])).rows[0].status;
    assert.notEqual(status, "PAID");
  });

  it("7. a return cannot be recorded twice; the remainder is accepted and the bill can then close", async () => {
    const { dabara, chair } = await gpItemIds();

    await assert.rejects(
      () => store.recordBillReturn(billId, { items: [{ gatePassItemId: dabara.id, productId: PROD_ZERO, itemName: "d", goodQuantity: 4 }] }, admin),
      /Over-return rejected/
    );
    assert.deepEqual(await prod(PROD_ZERO), { a: 2, r: 1, d: 1, m: 0, t: 10 });

    await store.recordBillReturn(
      billId,
      {
        items: [
          { gatePassItemId: dabara.id, productId: PROD_ZERO, itemName: "d", goodQuantity: 1 },
          { gatePassItemId: chair.id, productId: PROD_PARTIAL, itemName: "c", goodQuantity: 0, damagedQuantity: 0, missingQuantity: 1 },
        ],
      },
      admin
    );
    assert.deepEqual(await prod(PROD_ZERO), { a: 3, r: 0, d: 1, m: 0, t: 10 });
    assert.deepEqual(await prod(PROD_PARTIAL), { a: 3, r: 0, d: 0, m: 2, t: 10 });

    const bill = await store.getBill(billId);
    for (const inc of (bill!.incidents || []).filter((i: any) => i.chargeApprovalStatus === "PENDING_DECISION")) {
      await store.resolveDamageMissingIncident(billId, inc.id, { action: "NO_CHARGE" }, admin);
    }
    const closed = await store.closeBill(billId, {}, admin);
    assert.equal(closed.status, "CLOSED");

    const items = (
      await pool.query(
        `SELECT quantity_dispatched d, quantity_returned r, quantity_damaged x, quantity_missing m FROM public.gate_pass_items WHERE id = ANY($1)`,
        [[dabara.id, chair.id]]
      )
    ).rows;
    for (const i of items) assert.equal(i.d, i.r + i.x + i.m, "dispatched = good + damaged + missing on every line");
  });
});
