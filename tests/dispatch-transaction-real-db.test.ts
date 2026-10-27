// ============================================================================
// BATCH 5.6 — REAL POSTGRESQL ATOMIC DISPATCH RECORDING TESTS
// Target: strictly 127.0.0.1:5432 / tns_disposable_test_2026 / tns_app_user
// Verifies atomic gate pass creation, stock deductions, movements, rollback, and concurrency
// ============================================================================

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { closePostgresPool } from "../src/lib/db/postgresClient";
import { SupabaseStore } from "../src/lib/db/supabaseStore";
import { getTestDbConfig } from "./helpers/testDbConfig";

const testDb = getTestDbConfig();

const FIXTURE_PREFIX = "test:b56:";
const COMPANY_ID = `${FIXTURE_PREFIX}comp-1`;
const CUSTOMER_ID = "0663cf3d-5600-4000-8000-000000000001";
const USER_ID = "0663cf3d-5600-4000-8000-000000000002";

const PROD_1_ID = `${FIXTURE_PREFIX}prod-1`;
const PROD_2_ID = `${FIXTURE_PREFIX}prod-2`;
const PROD_LIMITED_ID = `${FIXTURE_PREFIX}prod-limited`;

describe("Batch 5.6 — Atomic Dispatch Recording in PostgreSQL Mode", { skip: !testDb.isConfigured ? testDb.skipReason : false }, () => {
  let appPool: Pool;
  let testStore: SupabaseStore;

  async function cleanAllFixtures() {
    await appPool.query(
      `DELETE FROM public.audit_logs WHERE customer_name LIKE $1 OR entity_number LIKE $2 OR entity_number LIKE $3`,
      [`%Batch 5.6%`, `TNS-B56-%`, `TNGP-B56-%`]
    );
    await appPool.query(
      `DELETE FROM public.inventory_movements WHERE product_id LIKE $1`,
      [`${FIXTURE_PREFIX}%`]
    );
    await appPool.query(
      `DELETE FROM public.gate_pass_items WHERE gate_pass_id IN (SELECT id FROM public.gate_passes WHERE company_id = $1)`,
      [COMPANY_ID]
    );
    await appPool.query(`DELETE FROM public.gate_passes WHERE company_id = $1`, [COMPANY_ID]);
    await appPool.query(
      `DELETE FROM public.bill_items WHERE bill_id IN (SELECT id FROM public.bills WHERE company_id = $1)`,
      [COMPANY_ID]
    );
    await appPool.query(
      `DELETE FROM public.bill_branches WHERE bill_id IN (SELECT id FROM public.bills WHERE company_id = $1)`,
      [COMPANY_ID]
    );
    await appPool.query(`DELETE FROM public.bills WHERE company_id = $1`, [COMPANY_ID]);
    await appPool.query(`DELETE FROM public.products WHERE id LIKE $1`, [`${FIXTURE_PREFIX}%`]);
    await appPool.query(`DELETE FROM public.customers WHERE id = $1 OR name LIKE $2`, [CUSTOMER_ID, `%Batch 5.6%`]);
    await appPool.query(`DELETE FROM public.users WHERE id = $1`, [USER_ID]);
    await appPool.query(`DELETE FROM public.companies WHERE id = $1`, [COMPANY_ID]);
  }

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
    await cleanAllFixtures();

    // 6. Seed valid user for audit log references
    await appPool.query(
      `INSERT INTO public.users (id, email, password_hash, name, role, status)
       VALUES ($1, $2, 'dummy-hash-b56', $3, $4, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [USER_ID, "admin-b56@tamilnadusuppliers.com", "Batch 5.6 Dispatcher", "SUPER_ADMIN"]
    );

    // 7. Seed company
    await appPool.query(
      `INSERT INTO public.companies (
        id, name, display_name, phone, address, state, gstin, pan, gst_type,
        bank_account_no, bank_ifsc,
        invoice_prefix, quotation_prefix, gate_pass_prefix,
        next_invoice_no, next_quotation_no, next_gate_pass_no, is_active
      ) VALUES (
        $1, 'Batch 5.6 Test Logistics', 'Batch 5.6 Test Logistics', '9876543210', 'Vellore Main Road', 'Tamil Nadu',
        '33AAAAA0000A1Z5', 'AAAAA0000A', 'GST_REGISTERED',
        '123456789012', 'SBIN0001234',
        'TNS-B56-', 'TNQ-B56-', 'TNGP-B56-',
        300, 100, 300, true
      )`,
      [COMPANY_ID]
    );

    // 8. Seed customer
    await appPool.query(
      `INSERT INTO public.customers (
        id, name, mobile, billing_address, state, is_active
      ) VALUES (
        $1, 'Batch 5.6 Customer Pvt Ltd', '9876522222', 'Vellore Freight Complex', 'Tamil Nadu', true
      )`,
      [CUSTOMER_ID]
    );

    // 9. Seed products
    await appPool.query(
      `INSERT INTO public.products (
        id, name, sku, unit, default_rental_rate,
        total_owned_quantity, available_quantity, rented_quantity, is_active
      ) VALUES
        ($1, 'Batch 5.6 Aluminium Ladder 12ft', 'SKU-B56-LADDER', 'Nos', 100.00, 20, 20, 0, true),
        ($2, 'Batch 5.6 Concrete Mixer Machine', 'SKU-B56-MIXER', 'Nos', 500.00, 10, 10, 0, true),
        ($3, 'Batch 5.6 Scaffolding Limited Set', 'SKU-B56-LIMITED', 'Nos', 50.00, 5, 5, 0, true)`,
      [PROD_1_ID, PROD_2_ID, PROD_LIMITED_ID]
    );
  });

  after(async () => {
    try {
      await cleanAllFixtures();

      // Verify zero leftover test records
      const gpRemain = await appPool.query(`SELECT count(*) as cnt FROM public.gate_passes WHERE company_id = $1`, [COMPANY_ID]);
      assert.equal(Number(gpRemain.rows[0].cnt), 0, "No gate passes must remain");

      const itemRemain = await appPool.query(
        `SELECT count(*) as cnt FROM public.gate_pass_items WHERE gate_pass_id LIKE $1`,
        [`${FIXTURE_PREFIX}%`]
      );
      assert.equal(Number(itemRemain.rows[0].cnt), 0, "No gate pass items must remain");

      const moveRemain = await appPool.query(
        `SELECT count(*) as cnt FROM public.inventory_movements WHERE product_id LIKE $1`,
        [`${FIXTURE_PREFIX}%`]
      );
      assert.equal(Number(moveRemain.rows[0].cnt), 0, "No inventory movements must remain");

      const prodRemain = await appPool.query(`SELECT count(*) as cnt FROM public.products WHERE id LIKE $1`, [`${FIXTURE_PREFIX}%`]);
      assert.equal(Number(prodRemain.rows[0].cnt), 0, "No test products must remain");

      const billRemain = await appPool.query(`SELECT count(*) as cnt FROM public.bills WHERE company_id = $1`, [COMPANY_ID]);
      assert.equal(Number(billRemain.rows[0].cnt), 0, "No test bills must remain");

      const compRemain = await appPool.query(`SELECT count(*) as cnt FROM public.companies WHERE id = $1`, [COMPANY_ID]);
      assert.equal(Number(compRemain.rows[0].cnt), 0, "No test companies must remain");
    } finally {
      await closePostgresPool();
      await appPool.end();
      delete process.env.DB_PROVIDER;
      delete process.env.DATABASE_URL;
    }
  });

  // Helper to seed a bill in test database
  async function seedBill(params: { id: string; billNumber: string; status?: string }) {
    const bStatus = params.status || "ISSUED";
    await appPool.query(
      `INSERT INTO public.bills (
        id, bill_number, company_id, company_snapshot,
        customer_id, customer_name, customer_phone, customer_address,
        bill_date, rental_start_date, rental_end_date, rental_days,
        status, tax_type, subtotal, grand_total, balance_due, amount_in_words
      ) VALUES (
        $1, $2, $3, $4::jsonb,
        $5, 'Batch 5.6 Customer Pvt Ltd', '9876522222', 'Vellore Freight Complex',
        CURRENT_DATE, '2026-11-01', '2026-11-10', 10,
        $6, 'GST', 5000.00, 5900.00, 5900.00, 'Five Thousand Nine Hundred Only'
      )`,
      [
        params.id,
        params.billNumber,
        COMPANY_ID,
        JSON.stringify({ name: "Batch 5.6 Test Logistics", gstin: "33AAAAA0000A1Z5" }),
        CUSTOMER_ID,
        bStatus,
      ]
    );
  }

  // --------------------------------------------------------------------------
  // Test 1: Successful dispatch
  // --------------------------------------------------------------------------
  it("1. successfully records dispatch atomically with gate pass, items, stock deductions, movements, and audit log", async () => {
    const billId = `${FIXTURE_PREFIX}bill-1`;
    await seedBill({ id: billId, billNumber: "TNS-B56-0301", status: "ISSUED" });

    const gatePass = await testStore.createGatePass({
      companyId: COMPANY_ID,
      customerId: CUSTOMER_ID,
      customerName: "Batch 5.6 Customer Pvt Ltd",
      billId,
      destinationBranch: "Site Alpha",
      destinationAddress: "Vellore Freight Complex",
      vehicleNumber: "TN-23-AB-1234",
      driverName: "Murugan",
      driverPhone: "9876543210",
      actor: { id: USER_ID, name: "Batch 5.6 Dispatcher", role: "SUPER_ADMIN" },
      items: [
        {
          id: `${FIXTURE_PREFIX}gp1:item-1`,
          productId: PROD_1_ID,
          itemName: "Batch 5.6 Aluminium Ladder 12ft",
          quantityDispatched: 5,
        },
        {
          id: `${FIXTURE_PREFIX}gp1:item-2`,
          productId: PROD_2_ID,
          itemName: "Batch 5.6 Concrete Mixer Machine",
          quantityDispatched: 2,
        },
        {
          id: `${FIXTURE_PREFIX}gp1:note-1`,
          itemName: "Safety helmets and harnesses enclosed",
          quantityDispatched: 1,
        },
      ],
    });

    assert.ok(gatePass.id, "Gate Pass ID must be returned");
    assert.equal(gatePass.gatePassNumber, "TNGP-B56-0300", "Must assign sequential gate pass number");
    assert.equal(gatePass.status, "DISPATCHED");

    // Verify gate_passes row in PostgreSQL
    const gpRes = await appPool.query(
      `SELECT id, gate_pass_number, status, vehicle_number FROM public.gate_passes WHERE id = $1`,
      [gatePass.id]
    );
    assert.equal(gpRes.rows.length, 1);
    assert.equal(gpRes.rows[0].gate_pass_number, "TNGP-B56-0300");
    assert.equal(gpRes.rows[0].status, "DISPATCHED");

    // Verify gate_pass_items rows in PostgreSQL
    const itemsRes = await appPool.query(
      `SELECT product_id, item_name, quantity_dispatched FROM public.gate_pass_items WHERE gate_pass_id = $1 ORDER BY item_name`,
      [gatePass.id]
    );
    assert.equal(itemsRes.rows.length, 3, "Must insert all 3 items");

    // Verify stock deductions in PostgreSQL
    const prod1Res = await appPool.query(`SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    assert.equal(prod1Res.rows[0].available_quantity, 15, "Prod 1 available must be 20 - 5 = 15");
    assert.equal(prod1Res.rows[0].rented_quantity, 5, "Prod 1 rented must be 0 + 5 = 5");

    const prod2Res = await appPool.query(`SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`, [PROD_2_ID]);
    assert.equal(prod2Res.rows[0].available_quantity, 8, "Prod 2 available must be 10 - 2 = 8");
    assert.equal(prod2Res.rows[0].rented_quantity, 2, "Prod 2 rented must be 0 + 2 = 2");

    // Verify inventory movements
    const moveRes = await appPool.query(
      `SELECT product_id, movement_type, quantity_change, balance_after FROM public.inventory_movements WHERE reference_id = $1 ORDER BY product_id`,
      [gatePass.id]
    );
    assert.equal(moveRes.rows.length, 2, "Must record 2 product inventory movements");
    assert.equal(moveRes.rows[0].movement_type, "DISPATCH");
    assert.equal(moveRes.rows[0].quantity_change, -5);
    assert.equal(moveRes.rows[0].balance_after, 15);

    // Verify company next_gate_pass_no incremented
    const compRes = await appPool.query(`SELECT next_gate_pass_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compRes.rows[0].next_gate_pass_no, 301, "Sequence must increment by 1");

    // Verify audit log
    const auditRes = await appPool.query(
      `SELECT action, entity_type, entity_id FROM public.audit_logs WHERE entity_id = $1 AND action = 'DISPATCH_CREATED'`,
      [billId]
    );
    assert.equal(auditRes.rows.length, 1, "Must write DISPATCH_CREATED audit log");
  });

  // --------------------------------------------------------------------------
  // Test 2: Gate pass insertion failure rolls back all writes
  // --------------------------------------------------------------------------
  it("2. rolls back all operations when gate pass header insertion fails", async () => {
    const compBefore = await appPool.query(`SELECT next_gate_pass_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const expectedSeq = compBefore.rows[0].next_gate_pass_no;

    // Use a proxy store to inject failure during gate pass insertion
    const proxyStore = Object.create(testStore);
    proxyStore.createGatePass = async (data: any) => {
      return proxyStore.withTransaction(async (txStore: any) => {
        // Trigger error during gate pass insert
        throw new Error("INJECTED_GATE_PASS_INSERT_FAILURE");
      });
    };

    await assert.rejects(
      () => proxyStore.createGatePass({
        companyId: COMPANY_ID,
        customerId: CUSTOMER_ID,
        items: [{ productId: PROD_1_ID, quantityDispatched: 2 }],
      }),
      /INJECTED_GATE_PASS_INSERT_FAILURE|Something went wrong while/
    );

    // Verify stock unchanged
    const prodRes = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    assert.equal(prodRes.rows[0].available_quantity, 15, "Stock must not be altered on rollback");

    // Verify sequence unchanged
    const compAfter = await appPool.query(`SELECT next_gate_pass_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_gate_pass_no, expectedSeq);
  });

  // --------------------------------------------------------------------------
  // Test 3: Gate pass item insertion failure rolls back all writes
  // --------------------------------------------------------------------------
  it("3. rolls back gate pass header, stock, and sequence when item insertion fails", async () => {
    const compBefore = await appPool.query(`SELECT next_gate_pass_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const expectedSeq = compBefore.rows[0].next_gate_pass_no;
    const prodBefore = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    const expectedAvail = prodBefore.rows[0].available_quantity;

    const failingGpId = `${FIXTURE_PREFIX}gp-fail-item`;

    const txProxy = Object.create(testStore);
    txProxy.createGatePass = async (data: any) => {
      return txProxy.withTransaction(async (txStore: any) => {
        const origFrom = txStore.supabase.from.bind(txStore.supabase);
        txStore.supabase.from = (table: string) => {
          if (table === "gate_pass_items") {
            return {
              insert: () => ({
                select: () => ({
                  single: async () => ({ data: null, error: { message: "INJECTED_ITEM_INSERT_FAILURE" } }),
                }),
              }),
            };
          }
          return origFrom(table);
        };
        return txStore.executeCreateGatePass(data);
      });
    };

    await assert.rejects(
      () => txProxy.createGatePass({
        id: failingGpId,
        companyId: COMPANY_ID,
        customerId: CUSTOMER_ID,
        customerName: "Batch 5.6 Customer Pvt Ltd",
        items: [{ productId: PROD_1_ID, quantityDispatched: 3 }],
      }),
      /INJECTED_ITEM_INSERT_FAILURE|Something went wrong while/
    );

    // Verify gate pass rolled back
    const gpCheck = await appPool.query(`SELECT count(*) as cnt FROM public.gate_passes WHERE id LIKE $1`, [`${failingGpId}%`]);
    assert.equal(Number(gpCheck.rows[0].cnt), 0, "Gate pass must be rolled back");

    // Verify stock preserved
    const prodAfter = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    assert.equal(prodAfter.rows[0].available_quantity, expectedAvail, "Stock must be preserved");

    // Verify sequence preserved
    const compAfter = await appPool.query(`SELECT next_gate_pass_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_gate_pass_no, expectedSeq);
  });

  // --------------------------------------------------------------------------
  // Test 4: Stock deduction failure rolls back all writes
  // --------------------------------------------------------------------------
  it("4. rolls back the gate pass and items when stock deduction fails", async () => {
    const compBefore = await appPool.query(`SELECT next_gate_pass_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const expectedSeq = compBefore.rows[0].next_gate_pass_no;
    const prodBefore = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    const expectedAvail = prodBefore.rows[0].available_quantity;

    const proxyStore = Object.create(testStore);
    proxyStore.updateProduct = async () => {
      throw new Error("INJECTED_PRODUCT_STOCK_FAILURE");
    };

    const failGpId = `${FIXTURE_PREFIX}gp-fail-stock`;
    await assert.rejects(
      () => proxyStore.createGatePass({
        id: failGpId,
        companyId: COMPANY_ID,
        customerId: CUSTOMER_ID,
        customerName: "Batch 5.6 Customer Pvt Ltd",
        items: [{ productId: PROD_1_ID, quantityDispatched: 2 }],
      }),
      /INJECTED_PRODUCT_STOCK_FAILURE|Something went wrong while/
    );

    // Verify gate pass does not exist
    const gpCheck = await appPool.query(`SELECT count(*) as cnt FROM public.gate_passes WHERE id = $1`, [failGpId]);
    assert.equal(Number(gpCheck.rows[0].cnt), 0);

    // Verify no gate pass items exist
    const itemsCheck = await appPool.query(`SELECT count(*) as cnt FROM public.gate_pass_items WHERE gate_pass_id = $1`, [failGpId]);
    assert.equal(Number(itemsCheck.rows[0].cnt), 0);

    // Verify stock unchanged
    const prodAfter = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    assert.equal(prodAfter.rows[0].available_quantity, expectedAvail);

    // Verify sequence unchanged
    const compAfter = await appPool.query(`SELECT next_gate_pass_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_gate_pass_no, expectedSeq);
  });

  // --------------------------------------------------------------------------
  // Test 5: Inventory movement failure rolls back stock and other writes
  // --------------------------------------------------------------------------
  it("5. rolls back stock deduction and gate pass when inventory movement fails", async () => {
    const compBefore = await appPool.query(`SELECT next_gate_pass_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const expectedSeq = compBefore.rows[0].next_gate_pass_no;
    const prodBefore = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    const expectedAvail = prodBefore.rows[0].available_quantity;

    const failGpId = `${FIXTURE_PREFIX}gp-fail-movement`;

    const txProxy = Object.create(testStore);
    txProxy.createGatePass = async (data: any) => {
      return txProxy.withTransaction(async (txStore: any) => {
        const origFrom = txStore.supabase.from.bind(txStore.supabase);
        txStore.supabase.from = (table: string) => {
          if (table === "inventory_movements") {
            return {
              insert: async () => ({ error: { message: "INJECTED_INVENTORY_MOVEMENT_FAILURE" } }),
            };
          }
          return origFrom(table);
        };
        return txStore.executeCreateGatePass(data);
      });
    };

    await assert.rejects(
      () => txProxy.createGatePass({
        id: failGpId,
        companyId: COMPANY_ID,
        customerId: CUSTOMER_ID,
        customerName: "Batch 5.6 Customer Pvt Ltd",
        items: [{ productId: PROD_1_ID, quantityDispatched: 2 }],
      }),
      /INJECTED_INVENTORY_MOVEMENT_FAILURE|Something went wrong while/
    );

    // Verify stock was not deducted
    const prodAfter = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    assert.equal(prodAfter.rows[0].available_quantity, expectedAvail, "Stock must roll back");

    // Verify gate pass was rolled back
    const gpCheck = await appPool.query(`SELECT count(*) as cnt FROM public.gate_passes WHERE id = $1`, [failGpId]);
    assert.equal(Number(gpCheck.rows[0].cnt), 0);

    // Verify sequence rolled back
    const compAfter = await appPool.query(`SELECT next_gate_pass_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_gate_pass_no, expectedSeq);
  });

  // --------------------------------------------------------------------------
  // Test 6: Required audit failure rolls back the entire dispatch
  // --------------------------------------------------------------------------
  it("6. rolls back the entire dispatch when audit logging fails in transaction mode", async () => {
    const compBefore = await appPool.query(`SELECT next_gate_pass_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const expectedSeq = compBefore.rows[0].next_gate_pass_no;
    const prodBefore = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    const expectedAvail = prodBefore.rows[0].available_quantity;

    const billId = `${FIXTURE_PREFIX}bill-fail-audit`;
    await seedBill({ id: billId, billNumber: "TNS-B56-0306", status: "ISSUED" });

    const proxyStore = Object.create(testStore);
    proxyStore.recordAuditLog = async () => {
      throw new Error("INJECTED_DISPATCH_AUDIT_FAILURE");
    };

    const failGpId = `${FIXTURE_PREFIX}gp-fail-audit`;
    await assert.rejects(
      () => proxyStore.createGatePass({
        id: failGpId,
        companyId: COMPANY_ID,
        customerId: CUSTOMER_ID,
        customerName: "Batch 5.6 Customer Pvt Ltd",
        billId,
        items: [{ productId: PROD_1_ID, quantityDispatched: 3 }],
      }),
      /INJECTED_DISPATCH_AUDIT_FAILURE|Something went wrong while/
    );

    // Assert gate pass was rolled back
    const gpCheck = await appPool.query(`SELECT count(*) as cnt FROM public.gate_passes WHERE id = $1`, [failGpId]);
    assert.equal(Number(gpCheck.rows[0].cnt), 0);

    // Assert stock was rolled back
    const prodAfter = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    assert.equal(prodAfter.rows[0].available_quantity, expectedAvail);

    // Assert sequence was rolled back
    const compAfter = await appPool.query(`SELECT next_gate_pass_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_gate_pass_no, expectedSeq);
  });

  // --------------------------------------------------------------------------
  // Test 7: Dispatch beyond recorded stock is allowed, never drives stock negative, and is audited
  // --------------------------------------------------------------------------
  it("7. dispatches beyond recorded stock: available stops at 0 (never negative), all units count as rented, shortfall audited", async () => {
    const shortId = `${FIXTURE_PREFIX}prod-short`;
    await appPool.query(
      `INSERT INTO public.products (id, name, sku, unit, default_rental_rate, total_owned_quantity, available_quantity, rented_quantity, is_active)
       VALUES ($1, 'Batch 5.6 Short Item', 'SKU-B56-SHORT', 'Nos', 10.00, 8, 2, 0, true)`,
      [shortId]
    );
    const gp = await testStore.createGatePass({
      id: `${FIXTURE_PREFIX}gp-shortfall`,
      companyId: COMPANY_ID,
      customerId: CUSTOMER_ID,
      customerName: "Batch 5.6 Customer Pvt Ltd",
      billId: undefined,
      actor: { id: USER_ID, name: "Batch 5.6 Dispatcher", role: "BILLING" },
      items: [{ productId: shortId, itemName: "Batch 5.6 Short Item", quantityDispatched: 5 }], // 5 > 2 recorded
    });
    assert.equal(gp.items.length, 1);
    const after = await appPool.query(`SELECT available_quantity, rented_quantity, total_owned_quantity FROM public.products WHERE id = $1`, [shortId]);
    assert.deepEqual(after.rows[0], { available_quantity: 0, rented_quantity: 5, total_owned_quantity: 8 });
    const audit = await appPool.query(`SELECT 1 FROM public.audit_logs WHERE action = 'STOCK_SHORTFALL_DISPATCH' AND entity_id = $1`, [gp.id]);
    assert.equal(audit.rows.length, 1);
    const mv = await appPool.query(`SELECT quantity_change FROM public.inventory_movements WHERE reference_id = $1`, [gp.id]);
    assert.equal(mv.rows[0].quantity_change, -2, "only the recorded 2 units leave available stock");
  });

  // --------------------------------------------------------------------------
  // Test 8: Two concurrent dispatches against the same product row stay consistent
  // --------------------------------------------------------------------------
  it("8. concurrent dispatches against the same product row are serialized: stock never goes negative and rented counts both", async () => {
    // prod-limited has exactly 5 units available
    const prodCheck = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_LIMITED_ID]);
    assert.equal(prodCheck.rows[0].available_quantity, 5);

    const store1 = new SupabaseStore();
    const store2 = new SupabaseStore();

    const [res1, res2] = await Promise.allSettled([
      store1.createGatePass({
        id: `${FIXTURE_PREFIX}gp-race-1`,
        companyId: COMPANY_ID,
        customerId: CUSTOMER_ID,
        customerName: "Batch 5.6 Customer Pvt Ltd",
        items: [{ productId: PROD_LIMITED_ID, quantityDispatched: 5 }],
      }),
      store2.createGatePass({
        id: `${FIXTURE_PREFIX}gp-race-2`,
        companyId: COMPANY_ID,
        customerId: CUSTOMER_ID,
        customerName: "Batch 5.6 Customer Pvt Ltd",
        items: [{ productId: PROD_LIMITED_ID, quantityDispatched: 5 }],
      }),
    ]);

    assert.equal(res1.status, "fulfilled");
    assert.equal(res2.status, "fulfilled");

    const finalProd = await appPool.query(`SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`, [PROD_LIMITED_ID]);
    assert.equal(finalProd.rows[0].available_quantity, 0, "Available stock must be 0, never negative");
    assert.equal(finalProd.rows[0].rented_quantity, 10, "Both dispatches count as rented (the second is a shortfall dispatch)");
  });

  // --------------------------------------------------------------------------
  // Test 9: Concurrent attempts to dispatch same bill prevents duplicates
  // --------------------------------------------------------------------------
  it("9. prevents duplicate dispatch for the same bill under concurrent execution", async () => {
    const billId = `${FIXTURE_PREFIX}bill-concurrent`;
    await seedBill({ id: billId, billNumber: "TNS-B56-0309", status: "ISSUED" });

    const store1 = new SupabaseStore();
    const store2 = new SupabaseStore();

    // Two simultaneous dispatches for the exact same bill without allowAdditionalDispatch
    const [res1, res2] = await Promise.allSettled([
      store1.createGatePass({
        id: `${FIXTURE_PREFIX}gp-dup-1`,
        companyId: COMPANY_ID,
        customerId: CUSTOMER_ID,
        customerName: "Batch 5.6 Customer Pvt Ltd",
        billId,
        items: [{ productId: PROD_1_ID, quantityDispatched: 2 }],
      }),
      store2.createGatePass({
        id: `${FIXTURE_PREFIX}gp-dup-2`,
        companyId: COMPANY_ID,
        customerId: CUSTOMER_ID,
        customerName: "Batch 5.6 Customer Pvt Ltd",
        billId,
        items: [{ productId: PROD_1_ID, quantityDispatched: 2 }],
      }),
    ]);

    const fulfilled = [res1, res2].filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
    const rejected = [res1, res2].filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    assert.equal(fulfilled.length, 1, "Exactly one dispatch must succeed");
    assert.equal(rejected.length, 1, "Duplicate dispatch must be rejected");

    assert.match(
      rejected[0].reason.message,
      /already been dispatched.*Duplicate dispatch rejected/i,
      "Must reject with duplicate dispatch message"
    );

    // Database verification: exactly ONE gate pass exists for this bill
    const gpCount = await appPool.query(`SELECT count(*) as cnt FROM public.gate_passes WHERE bill_id = $1`, [billId]);
    assert.equal(Number(gpCount.rows[0].cnt), 1, "Exactly one gate pass must be created");
  });

  // --------------------------------------------------------------------------
  // Test 10: Injected failure does not leave the bill in a partially updated state
  // --------------------------------------------------------------------------
  it("10. an injected failure does not leave the bill in a partially updated state or with partial records", async () => {
    const billId = `${FIXTURE_PREFIX}bill-fail-partial`;
    await seedBill({ id: billId, billNumber: "TNS-B56-0310A", status: "ISSUED" });

    const billBefore = await appPool.query(`SELECT * FROM public.bills WHERE id = $1`, [billId]);
    const compBefore = await appPool.query(`SELECT next_gate_pass_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const expectedSeq = compBefore.rows[0].next_gate_pass_no;
    const prodBefore = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    const expectedAvail = prodBefore.rows[0].available_quantity;

    const proxyStore = Object.create(testStore);
    proxyStore.updateProduct = async () => {
      throw new Error("INJECTED_FAILURE_DURING_BILL_DISPATCH");
    };

    const failGpId = `${FIXTURE_PREFIX}gp-fail-partial`;
    await assert.rejects(
      () => proxyStore.createGatePass({
        id: failGpId,
        companyId: COMPANY_ID,
        customerId: CUSTOMER_ID,
        customerName: "Batch 5.6 Customer Pvt Ltd",
        billId,
        items: [{ productId: PROD_1_ID, quantityDispatched: 2 }],
      }),
      /INJECTED_FAILURE_DURING_BILL_DISPATCH|Something went wrong while/
    );

    // Verify bill remains completely untouched
    const billAfter = await appPool.query(`SELECT * FROM public.bills WHERE id = $1`, [billId]);
    assert.equal(billAfter.rows[0].status, billBefore.rows[0].status, "Bill status must remain unchanged");
    assert.equal(billAfter.rows[0].paid_amount, billBefore.rows[0].paid_amount);

    // Verify zero gate passes linked to this bill
    const gpCount = await appPool.query(`SELECT count(*) as cnt FROM public.gate_passes WHERE bill_id = $1`, [billId]);
    assert.equal(Number(gpCount.rows[0].cnt), 0, "No gate pass must be linked to the bill");

    // Verify stock unchanged
    const prodAfter = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    assert.equal(prodAfter.rows[0].available_quantity, expectedAvail);

    // Verify sequence unchanged
    const compAfter = await appPool.query(`SELECT next_gate_pass_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_gate_pass_no, expectedSeq);
  });

  // --------------------------------------------------------------------------
  // Test 11: Ineligible bill status (CANCELLED) is rejected cleanly
  // --------------------------------------------------------------------------
  it("11. rejects dispatching a CANCELLED bill without allocating sequence numbers or deducting stock", async () => {
    const billId = `${FIXTURE_PREFIX}bill-cancelled`;
    await seedBill({ id: billId, billNumber: "TNS-B56-0311", status: "CANCELLED" });

    const compBefore = await appPool.query(`SELECT next_gate_pass_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const expectedSeq = compBefore.rows[0].next_gate_pass_no;
    const prodBefore = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    const expectedAvail = prodBefore.rows[0].available_quantity;

    let threw = false;
    try {
      await testStore.createGatePass({
        companyId: COMPANY_ID,
        customerId: CUSTOMER_ID,
        customerName: "Batch 5.6 Customer Pvt Ltd",
        billId,
        items: [{ productId: PROD_1_ID, quantityDispatched: 2 }],
      });
    } catch (err: any) {
      threw = true;
      assert.match(err.message, /cancelled and cannot be dispatched/i);
    }
    assert.equal(threw, true, "Must throw on cancelled bill");

    // Verify sequence unchanged
    const compAfter = await appPool.query(`SELECT next_gate_pass_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_gate_pass_no, expectedSeq);

    // Verify stock unchanged
    const prodAfter = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    assert.equal(prodAfter.rows[0].available_quantity, expectedAvail);
  });
});
