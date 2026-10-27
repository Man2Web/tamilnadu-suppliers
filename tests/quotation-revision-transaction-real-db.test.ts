// ============================================================================
// BATCH 5.3B — REAL POSTGRESQL QUOTATION REVISION TRANSACTION TESTS
// Target: strictly 127.0.0.1:5432 / tns_disposable_test_2026
// Verifies atomic rollback on failure injection during quotation revision
// ============================================================================

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { closePostgresPool, PostgresExecutor } from "../src/lib/db/postgresClient";
import { SupabaseStore } from "../src/lib/db/supabaseStore";
import { getTestDbConfig } from "./helpers/testDbConfig";

const testDb = getTestDbConfig();

const FIXTURE_PREFIX = "test:b53b:";
const COMPANY_ID = `${FIXTURE_PREFIX}comp-1`;
const CUSTOMER_ID = `${FIXTURE_PREFIX}cust-1`;
const QUOTE_ID = `${FIXTURE_PREFIX}quote-1`;
const BRANCH_ID = `${FIXTURE_PREFIX}branch-1`;

describe("Batch 5.3B — Stage 3: Real PostgreSQL Quotation Revision Transaction Tests", { skip: !testDb.isConfigured ? testDb.skipReason : false }, () => {
  let appPool: Pool;
  let testStore: SupabaseStore;

  before(async () => {
    // 1. Establish connection pool to disposable test database
    appPool = new Pool(testDb.getPoolConfig());

    // 2. Strict live server guard assertion
    await testDb.assertLiveConnection(appPool);

    // 3. Set temporary environment variables for this test process only
    process.env.DB_PROVIDER = "postgres";
    process.env.DATABASE_URL = testDb.getDatabaseUrl();

    // 4. Instantiate store
    testStore = new SupabaseStore();

    // 5. Clean up any existing fixtures from previous runs
    await appPool.query(`DELETE FROM public.quotation_items WHERE quotation_id = $1`, [QUOTE_ID]);
    await appPool.query(`DELETE FROM public.quotation_branches WHERE quotation_id = $1`, [QUOTE_ID]);
    await appPool.query(`DELETE FROM public.quotations WHERE id = $1`, [QUOTE_ID]);
    await appPool.query(`DELETE FROM public.customers WHERE id = $1`, [CUSTOMER_ID]);
    await appPool.query(`DELETE FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    await appPool.query(`DELETE FROM public.audit_logs WHERE entity_id = $1`, [QUOTE_ID]);

    // 6. Seed company
    await appPool.query(
      `INSERT INTO public.companies (
        id, name, display_name, phone, address, state, gstin, pan, gst_type,
        bank_account_no, bank_ifsc,
        invoice_prefix, quotation_prefix, gate_pass_prefix,
        next_invoice_no, next_quotation_no, next_gate_pass_no, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        COMPANY_ID,
        "Batch 5.3B Test Corp",
        "Batch 5.3B Test Corp Pvt Ltd",
        "9876543210",
        "123 Test St, Vellore",
        "Tamil Nadu",
        "33AAAAA0000A1Z5",
        "AAAAA0000A",
        "GST_REGISTERED",
        "1234567890",
        "CIUB0000123",
        "TNSB53B-",
        "TNQB53B-",
        "TNGPB53B-",
        1,
        1,
        1,
        true,
      ]
    );

    // 7. Seed customer
    await appPool.query(
      `INSERT INTO public.customers (
        id, name, mobile, billing_address, state, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        CUSTOMER_ID,
        "Batch 5.3B Test Customer",
        "9988776655",
        "456 Client Road, Chennai",
        "Tamil Nadu",
        true,
      ]
    );

    // 8. Seed quotation header
    await appPool.query(
      `INSERT INTO public.quotations (
        id, quotation_number, company_id, company_snapshot,
        customer_id, customer_name, customer_phone, customer_address,
        quotation_date, rental_start_date, rental_end_date, rental_days,
        status, tax_type, subtotal, grand_total, amount_in_words
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        QUOTE_ID,
        "TNQ-B53B-0001",
        COMPANY_ID,
        JSON.stringify({ name: "Batch 5.3B Test Corp" }),
        CUSTOMER_ID,
        "Batch 5.3B Test Customer",
        "9988776655",
        "456 Client Road, Chennai",
        "2026-10-27",
        "2026-10-28",
        "2026-10-31",
        3,
        "ISSUED",
        "GST",
        1500.0,
        1770.0,
        "One Thousand Seven Hundred Seventy Rupees Only",
      ]
    );

    // 9. Seed quotation branch
    await appPool.query(
      `INSERT INTO public.quotation_branches (
        id, quotation_id, branch_name, delivery_address, section_order, branch_subtotal
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [BRANCH_ID, QUOTE_ID, "Main Branch", "456 Client Road, Chennai", 1, 1500.0]
    );

    // 10. Seed 3 initial line items
    await appPool.query(
      `INSERT INTO public.quotation_items (
        id, quotation_id, quotation_branch_id, item_name, quantity, days, unit_price, amount, position, entry_type
      ) VALUES
        ($1, $4, $5, 'Initial Item Alpha', 10, 3, 50.00, 1500.00, 1, 'product'),
        ($2, $4, $5, 'Initial Item Beta', 5, 3, 100.00, 1500.00, 2, 'product'),
        ($3, $4, $5, 'Initial Item Gamma', 2, 3, 250.00, 1500.00, 3, 'product')`,
      [
        `${FIXTURE_PREFIX}item-1`,
        `${FIXTURE_PREFIX}item-2`,
        `${FIXTURE_PREFIX}item-3`,
        QUOTE_ID,
        BRANCH_ID,
      ]
    );
  });

  after(async () => {
    // Clean up all fixtures created by this test suite
    if (appPool) {
      await appPool.query(`DELETE FROM public.quotation_items WHERE quotation_id = $1`, [QUOTE_ID]);
      await appPool.query(`DELETE FROM public.quotation_branches WHERE quotation_id = $1`, [QUOTE_ID]);
      await appPool.query(`DELETE FROM public.quotations WHERE id = $1`, [QUOTE_ID]);
      await appPool.query(`DELETE FROM public.customers WHERE id = $1`, [CUSTOMER_ID]);
      await appPool.query(`DELETE FROM public.companies WHERE id = $1`, [COMPANY_ID]);
      await appPool.query(`DELETE FROM public.audit_logs WHERE entity_id = $1`, [QUOTE_ID]);
      await appPool.end();
    }

    // Clean up environment variables & pool instance
    delete process.env.DB_PROVIDER;
    delete process.env.DATABASE_URL;
    await closePostgresPool();
  });

  it("1. successfully updates a quotation atomically inside a transaction", async () => {
    const updated = await testStore.updateQuotation(
      QUOTE_ID,
      {
        rentalDays: 5,
        grandTotal: 2500.0,
        subtotal: 2500.0,
        documentLines: [
          {
            id: `${FIXTURE_PREFIX}item-revised-1`,
            itemName: "Revised Product One",
            quantity: 15,
            days: 5,
            unitPrice: 100.0,
            amount: 1500.0,
            entryType: "product",
            position: 1,
          },
          {
            id: `${FIXTURE_PREFIX}item-revised-2`,
            itemName: "Revised Product Two",
            quantity: 10,
            days: 5,
            unitPrice: 100.0,
            amount: 1000.0,
            entryType: "product",
            position: 2,
          },
        ],
      },
      { id: "test-actor", name: "Billing Clerk", role: "BILLING" }
    );

    assert.equal(updated.id, QUOTE_ID);
    assert.equal(Number(updated.rentalDays), 5);
    // Totals are derived on the server from the lines: 2500 subtotal + 18% GST (GST-registered fixture company)
    assert.equal(Number(updated.grandTotal), 2950.0);

    // Verify database state directly via separate client
    const itemsRes = await appPool.query(
      `SELECT id, item_name, quantity, amount FROM public.quotation_items WHERE quotation_id = $1 ORDER BY position`,
      [QUOTE_ID]
    );

    assert.equal(itemsRes.rows.length, 2, "Must have exactly 2 line items");
    assert.equal(itemsRes.rows[0].item_name, "Revised Product One");
    assert.equal(itemsRes.rows[0].quantity, 15);
    assert.equal(itemsRes.rows[1].item_name, "Revised Product Two");
    assert.equal(itemsRes.rows[1].quantity, 10);

    // Verify initial items were replaced
    assert.ok(!itemsRes.rows.some((r) => r.id === `${FIXTURE_PREFIX}item-1`));
    assert.ok(!itemsRes.rows.some((r) => r.id === `${FIXTURE_PREFIX}item-2`));
    assert.ok(!itemsRes.rows.some((r) => r.id === `${FIXTURE_PREFIX}item-3`));

    // Verify audit log
    const auditRes = await appPool.query(
      `SELECT action, actor_name FROM public.audit_logs WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [QUOTE_ID]
    );
    assert.equal(auditRes.rows.length, 1);
    assert.equal(auditRes.rows[0].action, "QUOTATION_UPDATED");
  });

  it("2. rolls back atomically when line-item insertion fails (preserves existing lines and header)", async () => {
    // Current database state has 2 items: "Revised Product One" and "Revised Product Two", grandTotal = 2950 (2500 + 18% GST)
    const beforeItems = await appPool.query(
      `SELECT id, item_name, quantity, amount FROM public.quotation_items WHERE quotation_id = $1 ORDER BY position`,
      [QUOTE_ID]
    );
    assert.equal(beforeItems.rows.length, 2);

    const beforeQuote = await appPool.query(
      `SELECT grand_total, rental_days FROM public.quotations WHERE id = $1`,
      [QUOTE_ID]
    );
    assert.equal(Number(beforeQuote.rows[0].grand_total), 2950.0);
    assert.equal(beforeQuote.rows[0].rental_days, 5);

    // Attempt quotation update with an item that deliberately violates PostgreSQL CHECK constraint
    // quotation_items_quantity_check enforces (entry_type = 'note' OR quantity >= 0)
    await assert.rejects(
      async () => {
        await testStore.updateQuotation(
          QUOTE_ID,
          {
            rentalDays: 10,
            grandTotal: 9999.0,
            documentLines: [
              {
                id: `${FIXTURE_PREFIX}item-valid-3`,
                itemName: "Good Item",
                quantity: 5,
                days: 10,
                unitPrice: 50.0,
                amount: 250.0,
                entryType: "product",
                position: 1,
              },
              {
                id: `${FIXTURE_PREFIX}item-failing-4`,
                itemName: "Invalid Negative Quantity Item",
                quantity: -50, // VIOLATES CHECK CONSTRAINT: quotation_items_quantity_check
                days: 10,
                unitPrice: 50.0,
                amount: -2500.0,
                entryType: "product",
                position: 2,
              },
            ],
          },
          { id: "test-actor", name: "Billing Clerk", role: "BILLING" }
        );
      },
      (err: any) => {
        // Assert error is from constraint violation
        assert.ok(
          err.message.includes("check constraint") || err.message.includes("violates check constraint") || err.message.includes("quotation_items"),
          `Expected constraint violation error, got: ${err.message}`
        );
        return true;
      }
    );

    // CRITICAL ATOMICITY VERIFICATION:
    // In un-transactioned code, DELETE ran and committed, leaving 0 items when INSERT failed.
    // In our transaction-scoped code, the entire transaction rolls back:
    const afterItems = await appPool.query(
      `SELECT id, item_name, quantity, amount FROM public.quotation_items WHERE quotation_id = $1 ORDER BY position`,
      [QUOTE_ID]
    );

    assert.equal(
      afterItems.rows.length,
      2,
      "CRITICAL: Both original line items must be preserved after insert failure!"
    );
    assert.equal(afterItems.rows[0].id, beforeItems.rows[0].id);
    assert.equal(afterItems.rows[0].item_name, beforeItems.rows[0].item_name);
    assert.equal(afterItems.rows[1].id, beforeItems.rows[1].id);
    assert.equal(afterItems.rows[1].item_name, beforeItems.rows[1].item_name);

    // Header must remain unchanged
    const afterQuote = await appPool.query(
      `SELECT grand_total, rental_days FROM public.quotations WHERE id = $1`,
      [QUOTE_ID]
    );
    assert.equal(Number(afterQuote.rows[0].grand_total), 2950.0, "Grand total must not be modified");
    assert.equal(afterQuote.rows[0].rental_days, 5, "Rental days must not be modified");
  });

  it("3. verifies cleanup leaves zero fixture remnants in the database", async () => {
    // Explicitly delete fixtures
    await appPool.query(`DELETE FROM public.quotation_items WHERE quotation_id = $1`, [QUOTE_ID]);
    await appPool.query(`DELETE FROM public.quotation_branches WHERE quotation_id = $1`, [QUOTE_ID]);
    await appPool.query(`DELETE FROM public.quotations WHERE id = $1`, [QUOTE_ID]);
    await appPool.query(`DELETE FROM public.customers WHERE id = $1`, [CUSTOMER_ID]);
    await appPool.query(`DELETE FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    await appPool.query(`DELETE FROM public.audit_logs WHERE entity_id = $1`, [QUOTE_ID]);

    const check = await appPool.query(
      `SELECT count(*)::int as count FROM public.quotation_items WHERE quotation_id = $1`,
      [QUOTE_ID]
    );
    assert.equal(check.rows[0].count, 0, "No fixture records must remain");
  });
});
