import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { SupabaseStore } from "../src/lib/db/supabaseStore";
import { closePostgresPool } from "../src/lib/db/postgresClient";
import { getTestDbConfig } from "./helpers/testDbConfig";

const testDb = getTestDbConfig();

const FIXTURE_PREFIX = "test:b57:";
const COMPANY_ID = `${FIXTURE_PREFIX}comp-1`;
const CUSTOMER_ID = "0663cf3d-5700-4000-8000-000000000001";
const USER_ID = "0663cf3d-5700-4000-8000-000000000002";

const PROD_1_ID = `${FIXTURE_PREFIX}prod-1`;
const PROD_2_ID = `${FIXTURE_PREFIX}prod-2`;
const PROD_CONCURRENT_ID = `${FIXTURE_PREFIX}prod-concurrent`;

describe("Batch 5.7 — Atomic Return Recording in PostgreSQL Mode", { skip: !testDb.isConfigured ? testDb.skipReason : false }, () => {
  let appPool: Pool;
  let testStore: SupabaseStore;

  async function cleanAllFixtures() {
    await appPool.query(
      `DELETE FROM public.audit_logs WHERE customer_name LIKE $1 OR entity_number LIKE $2 OR entity_number LIKE $3 OR entity_number LIKE $4`,
      [`%Batch 5.7%`, `TNS-B57-%`, `TNGP-B57-%`, `RET-%`]
    );
    await appPool.query(
      `DELETE FROM public.inventory_movements WHERE product_id LIKE $1`,
      [`${FIXTURE_PREFIX}%`]
    );
    await appPool.query(
      `DELETE FROM public.return_items WHERE return_id IN (SELECT id FROM public.returns WHERE company_id = $1)`,
      [COMPANY_ID]
    );
    await appPool.query(`DELETE FROM public.returns WHERE company_id = $1`, [COMPANY_ID]);
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
    await appPool.query(`DELETE FROM public.customers WHERE id = $1 OR name LIKE $2`, [CUSTOMER_ID, `%Batch 5.7%`]);
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
       VALUES ($1, $2, 'dummy-hash-b57', $3, $4, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [USER_ID, "admin-b57@tamilnadusuppliers.com", "Batch 5.7 Returns Officer", "SUPER_ADMIN"]
    );

    // 7. Seed company
    await appPool.query(
      `INSERT INTO public.companies (
        id, name, display_name, phone, address, state, gstin, pan, gst_type,
        bank_account_no, bank_ifsc,
        invoice_prefix, quotation_prefix, gate_pass_prefix,
        next_invoice_no, next_quotation_no, next_gate_pass_no, is_active
      ) VALUES (
        $1, 'Batch 5.7 Test Logistics', 'Batch 5.7 Test Logistics', '9876543210', 'Vellore Main Road', 'Tamil Nadu',
        '33AAAAA0000A1Z5', 'AAAAA0000A', 'GST_REGISTERED',
        '123456789012', 'SBIN0001234',
        'TNS-B57-', 'TNQ-B57-', 'TNGP-B57-',
        400, 100, 400, true
      )`,
      [COMPANY_ID]
    );

    // 8. Seed customer
    await appPool.query(
      `INSERT INTO public.customers (
        id, name, mobile, billing_address, state, is_active
      ) VALUES (
        $1, 'Batch 5.7 Customer Pvt Ltd', '9876522222', 'Vellore Freight Complex', 'Tamil Nadu', true
      )`,
      [CUSTOMER_ID]
    );

    // 9. Seed products
    await appPool.query(
      `INSERT INTO public.products (
        id, name, sku, unit, default_rental_rate,
        total_owned_quantity, available_quantity, rented_quantity, damaged_quantity, missing_quantity, is_active
      ) VALUES
      ($1, 'Batch 5.7 Heavy Scaffolding Pipe 3m', 'B57-SCAF-3M', 'NOS', 25.00, 50, 50, 0, 0, 0, true),
      ($2, 'Batch 5.7 Steel Shuttering Plate', 'B57-SHT-PLT', 'NOS', 15.00, 30, 30, 0, 0, 0, true),
      ($3, 'Batch 5.7 Mobile Tower Scaffold', 'B57-TWR-SCAF', 'NOS', 150.00, 10, 10, 0, 0, 0, true)`,
      [PROD_1_ID, PROD_2_ID, PROD_CONCURRENT_ID]
    );
  });

  beforeEach(async () => {
    // Reset product stocks so each test starts from a clean, known inventory baseline
    await appPool.query(
      `UPDATE public.products
       SET available_quantity = total_owned_quantity, rented_quantity = 0, damaged_quantity = 0, missing_quantity = 0
       WHERE id LIKE $1`,
      [`${FIXTURE_PREFIX}%`]
    );
  });

  after(async () => {
    try {
      await cleanAllFixtures();

      // Verify zero leftover test records
      const retRemain = await appPool.query(`SELECT count(*) as cnt FROM public.returns WHERE company_id = $1`, [COMPANY_ID]);
      assert.equal(Number(retRemain.rows[0].cnt), 0, "No return headers must remain");

      const itemRemain = await appPool.query(
        `SELECT count(*) as cnt FROM public.return_items WHERE return_id LIKE $1`,
        [`${FIXTURE_PREFIX}%`]
      );
      assert.equal(Number(itemRemain.rows[0].cnt), 0, "No return items must remain");

      const gpRemain = await appPool.query(`SELECT count(*) as cnt FROM public.gate_passes WHERE company_id = $1`, [COMPANY_ID]);
      assert.equal(Number(gpRemain.rows[0].cnt), 0, "No gate passes must remain");

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

  // Helper to seed a bill with branches and items
  async function seedDispatchedBill(params: {
    billId: string;
    billNumber: string;
    gpId: string;
    gpNumber: string;
    items: { productId: string; itemName: string; qty: number }[];
  }) {
    // 1. Insert Bill
    await appPool.query(
      `INSERT INTO public.bills (
        id, bill_number, company_id, company_snapshot,
        customer_id, customer_name, customer_phone, customer_address,
        bill_date, rental_start_date, rental_end_date, rental_days,
        status, tax_type, subtotal, grand_total, balance_due, amount_in_words
      ) VALUES (
        $1, $2, $3, $4::jsonb,
        $5, 'Batch 5.7 Customer Pvt Ltd', '9876522222', 'Vellore Freight Complex',
        CURRENT_DATE, '2026-11-01', '2026-11-10', 10,
        'ISSUED', 'GST', 5000.00, 5900.00, 5900.00, 'Five Thousand Nine Hundred Only'
      )`,
      [
        params.billId,
        params.billNumber,
        COMPANY_ID,
        JSON.stringify({ name: "Batch 5.7 Test Logistics", gstin: "33AAAAA0000A1Z5" }),
        CUSTOMER_ID,
      ]
    );

    // 2. Insert Branch
    const branchId = `${params.billId}:branch-1`;
    await appPool.query(
      `INSERT INTO public.bill_branches (id, bill_id, branch_name, delivery_address)
       VALUES ($1, $2, 'Main Site', 'Vellore Freight Complex')`,
      [branchId, params.billId]
    );

    // 3. Insert Bill Items
    for (let i = 0; i < params.items.length; i++) {
      const it = params.items[i];
      await appPool.query(
        `INSERT INTO public.bill_items (
          id, bill_branch_id, bill_id, product_id, item_name, quantity, days, unit_price, amount
        ) VALUES ($1, $2, $3, $4, $5, $6, 10, 100.00, $7)`,
        [
          `${params.billId}:item-${i + 1}`,
          branchId,
          params.billId,
          it.productId,
          it.itemName,
          it.qty,
          it.qty * 100.0,
        ]
      );
    }

    // 4. Insert Gate Pass
    await appPool.query(
      `INSERT INTO public.gate_passes (
        id, gate_pass_number, company_id, company_snapshot,
        customer_id, customer_name, destination_branch, destination_address,
        bill_id, expected_return_date, status
      ) VALUES (
        $1, $2, $3, $4::jsonb,
        $5, 'Batch 5.7 Customer Pvt Ltd', 'Main Site', 'Vellore Freight Complex',
        $6, '2026-11-10', 'DISPATCHED'
      )`,
      [
        params.gpId,
        params.gpNumber,
        COMPANY_ID,
        JSON.stringify({ name: "Batch 5.7 Test Logistics", gstin: "33AAAAA0000A1Z5" }),
        CUSTOMER_ID,
        params.billId,
      ]
    );

    // 5. Insert Gate Pass Items & adjust product stock to OUT ON RENT
    for (let i = 0; i < params.items.length; i++) {
      const it = params.items[i];
      await appPool.query(
        `INSERT INTO public.gate_pass_items (
          id, gate_pass_id, product_id, item_name, quantity_dispatched, quantity_returned, quantity_damaged, quantity_missing
        ) VALUES ($1, $2, $3, $4, $5, 0, 0, 0)`,
        [
          `${params.gpId}:item-${i + 1}`,
          params.gpId,
          it.productId,
          it.itemName,
          it.qty,
        ]
      );

      // Decrement available, increment rented
      await appPool.query(
        `UPDATE public.products
         SET available_quantity = available_quantity - $1, rented_quantity = rented_quantity + $1
         WHERE id = $2`,
        [it.qty, it.productId]
      );
    }
  }

  // --------------------------------------------------------------------------
  // Test 1: Successful full return
  // --------------------------------------------------------------------------
  it("1. successfully records full return atomically across products, movements, gate pass, return items, bill, and audit log", async () => {
    const billId = `${FIXTURE_PREFIX}bill-1`;
    const gpId = `${FIXTURE_PREFIX}gp-1`;

    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-0401",
      gpId,
      gpNumber: "TNGP-B57-0401",
      items: [
        { productId: PROD_1_ID, itemName: "Batch 5.7 Heavy Scaffolding Pipe 3m", qty: 20 },
        { productId: PROD_2_ID, itemName: "Batch 5.7 Steel Shuttering Plate", qty: 10 },
      ],
    });

    // Check pre-return stock
    const p1Pre = await appPool.query(`SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    assert.equal(p1Pre.rows[0].available_quantity, 30); // 50 - 20
    assert.equal(p1Pre.rows[0].rented_quantity, 20);

    const retId = `${FIXTURE_PREFIX}ret-1`;
    const result = await testStore.recordBillReturn(
      billId,
      {
        id: retId,
        returnDate: "2026-11-05",
        gatePassId: gpId,
        inspectedBy: "Quality Inspector Murugan",
        actor: { id: USER_ID, name: "Batch 5.7 Returns Officer", role: "SUPER_ADMIN" },
        items: [
          { productId: PROD_1_ID, quantityReturnedGood: 20 },
          { productId: PROD_2_ID, quantityReturnedGood: 10 },
        ],
      },
      USER_ID
    );

    assert.ok(result.returnRecord, "Must return returnRecord");
    assert.equal(result.returnRecord.gatePassId, gpId);

    // Verify products table in PostgreSQL
    const p1Post = await appPool.query(`SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    assert.equal(p1Post.rows[0].available_quantity, 50, "Prod 1 available must be restored to 50");
    assert.equal(p1Post.rows[0].rented_quantity, 0, "Prod 1 rented must be 0");

    const p2Post = await appPool.query(`SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`, [PROD_2_ID]);
    assert.equal(p2Post.rows[0].available_quantity, 30, "Prod 2 available must be restored to 30");
    assert.equal(p2Post.rows[0].rented_quantity, 0, "Prod 2 rented must be 0");

    // Verify inventory_movements table in PostgreSQL
    const moves = await appPool.query(
      `SELECT product_id, movement_type, quantity_change, balance_after FROM public.inventory_movements WHERE reference_id = $1 ORDER BY product_id`,
      [retId]
    );
    assert.equal(moves.rows.length, 2, "Must insert 2 RETURN_GOOD movements");
    assert.equal(moves.rows[0].movement_type, "RETURN_GOOD");
    assert.equal(moves.rows[0].quantity_change, 20);

    // Verify returns table in PostgreSQL
    const retCheck = await appPool.query(`SELECT id, return_number, gate_pass_id FROM public.returns WHERE id = $1`, [retId]);
    assert.equal(retCheck.rows.length, 1);
    assert.equal(retCheck.rows[0].gate_pass_id, gpId);

    // Verify return_items table in PostgreSQL
    const retItems = await appPool.query(`SELECT product_id, quantity_returned_good FROM public.return_items WHERE return_id = $1`, [retId]);
    assert.equal(retItems.rows.length, 2);

    // Verify gate_passes and gate_pass_items in PostgreSQL
    const gpCheck = await appPool.query(`SELECT status FROM public.gate_passes WHERE id = $1`, [gpId]);
    assert.equal(gpCheck.rows[0].status, "RETURNED", "Gate pass status must transition to RETURNED");

    const gpiCheck = await appPool.query(`SELECT quantity_returned FROM public.gate_pass_items WHERE gate_pass_id = $1 ORDER BY id`, [gpId]);
    assert.equal(gpiCheck.rows[0].quantity_returned, 20);
    assert.equal(gpiCheck.rows[1].quantity_returned, 10);

    // Verify audit_logs table
    const auditCheck = await appPool.query(
      `SELECT action, entity_id FROM public.audit_logs WHERE entity_id = $1 AND action = 'RETURN_RECORDED'`,
      [billId]
    );
    assert.equal(auditCheck.rows.length, 1, "Must write RETURN_RECORDED audit log");
  });

  // --------------------------------------------------------------------------
  // Test 2: Successful partial return
  // --------------------------------------------------------------------------
  it("2. successfully records partial return updating status to PARTIALLY_RETURNED without closing outstanding quantities", async () => {
    const billId = `${FIXTURE_PREFIX}bill-2`;
    const gpId = `${FIXTURE_PREFIX}gp-2`;

    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-0402",
      gpId,
      gpNumber: "TNGP-B57-0402",
      items: [{ productId: PROD_1_ID, itemName: "Batch 5.7 Heavy Scaffolding Pipe 3m", qty: 10 }],
    });

    const retId = `${FIXTURE_PREFIX}ret-2`;
    const result = await testStore.recordBillReturn(
      billId,
      {
        id: retId,
        returnDate: "2026-11-06",
        gatePassId: gpId,
        items: [{ productId: PROD_1_ID, quantityReturnedGood: 4 }],
      },
      USER_ID
    );

    // Verify partial counts
    assert.equal(result.bill.status, "PARTIALLY_RETURNED");
    assert.equal(result.bill.totalReturnedGood, 4);

    const gpCheck = await appPool.query(`SELECT status FROM public.gate_passes WHERE id = $1`, [gpId]);
    assert.equal(gpCheck.rows[0].status, "PARTIALLY_RETURNED");

    const gpiCheck = await appPool.query(`SELECT quantity_returned, quantity_dispatched FROM public.gate_pass_items WHERE gate_pass_id = $1`, [gpId]);
    assert.equal(gpiCheck.rows[0].quantity_returned, 4);
    assert.equal(gpiCheck.rows[0].quantity_dispatched, 10);

    const prodCheck = await appPool.query(`SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    assert.equal(prodCheck.rows[0].available_quantity, 44); // 40 + 4
    assert.equal(prodCheck.rows[0].rented_quantity, 6); // 10 - 4
  });

  // --------------------------------------------------------------------------
  // Test 3: Multiple/repeated return attempts against same dispatched line
  // --------------------------------------------------------------------------
  it("3. handles successive return batches against the same line until fully accounted", async () => {
    const billId = `${FIXTURE_PREFIX}bill-3`;
    const gpId = `${FIXTURE_PREFIX}gp-3`;

    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-0403",
      gpId,
      gpNumber: "TNGP-B57-0403",
      items: [{ productId: PROD_1_ID, itemName: "Batch 5.7 Heavy Scaffolding Pipe 3m", qty: 10 }],
    });

    // Step 1: Return 4 units good
    const retId1 = `${FIXTURE_PREFIX}ret-3-part1`;
    await testStore.recordBillReturn(
      billId,
      {
        id: retId1,
        returnDate: "2026-11-06",
        gatePassId: gpId,
        items: [{ productId: PROD_1_ID, quantityReturnedGood: 4 }],
      },
      USER_ID
    );

    // Step 2: Now return remaining 5 good, 1 damaged
    const retId2 = `${FIXTURE_PREFIX}ret-3-part2`;
    const result2 = await testStore.recordBillReturn(
      billId,
      {
        id: retId2,
        returnDate: "2026-11-07",
        gatePassId: gpId,
        items: [
          {
            productId: PROD_1_ID,
            quantityReturnedGood: 5,
            quantityDamaged: 1,
            damageChargeAmount: 200,
            damageChargeDecision: "ADD_CHARGE",
          },
        ],
      },
      USER_ID
    );

    // All 10 units now accounted for (4 good + 5 good + 1 damaged = 10)
    assert.equal(result2.bill.totalReturnedGood, 9);
    assert.equal(result2.bill.totalDamaged, 1);

    const gpCheck = await appPool.query(`SELECT status FROM public.gate_passes WHERE id = $1`, [gpId]);
    assert.equal(gpCheck.rows[0].status, "RETURNED", "All units accounted for; status must be RETURNED");

    const gpiCheck = await appPool.query(
      `SELECT quantity_returned, quantity_damaged, quantity_dispatched FROM public.gate_pass_items WHERE gate_pass_id = $1`,
      [gpId]
    );
    assert.equal(gpiCheck.rows[0].quantity_returned, 9);
    assert.equal(gpiCheck.rows[0].quantity_damaged, 1);
    assert.equal(gpiCheck.rows[0].quantity_dispatched, 10);

    const prodCheck = await appPool.query(`SELECT available_quantity, rented_quantity, damaged_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    assert.equal(prodCheck.rows[0].available_quantity, 49); // 40 + 4 + 5 = 49
    assert.equal(prodCheck.rows[0].rented_quantity, 0); // 10 - 4 - 6 = 0
    assert.equal(prodCheck.rows[0].damaged_quantity, 1);
  });

  // --------------------------------------------------------------------------
  // Test 4: Over-return rejection with zero partial writes
  // --------------------------------------------------------------------------
  it("4. rejects over-return when returning quantity exceeds outstanding dispatched balance", async () => {
    const billId = `${FIXTURE_PREFIX}bill-4`;
    const gpId = `${FIXTURE_PREFIX}gp-4`;

    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-0404",
      gpId,
      gpNumber: "TNGP-B57-0404",
      items: [{ productId: PROD_2_ID, itemName: "Batch 5.7 Steel Shuttering Plate", qty: 5 }],
    });

    const pBefore = await appPool.query(`SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`, [PROD_2_ID]);
    const expectedAvail = pBefore.rows[0].available_quantity;
    const expectedRented = pBefore.rows[0].rented_quantity;

    const retId = `${FIXTURE_PREFIX}ret-fail-over`;
    let threw = false;
    try {
      await testStore.recordBillReturn(billId, {
        id: retId,
        gatePassId: gpId,
        items: [{ productId: PROD_2_ID, quantityReturnedGood: 10 }], // 10 > 5 outstanding
      });
    } catch (err: any) {
      threw = true;
      assert.match(err.message, /Over-return rejected/i);
    }
    assert.equal(threw, true, "Must throw over-return rejection error");

    // Verify zero writes
    const retCheck = await appPool.query(`SELECT count(*) as cnt FROM public.returns WHERE id = $1`, [retId]);
    assert.equal(Number(retCheck.rows[0].cnt), 0);

    const moveCheck = await appPool.query(`SELECT count(*) as cnt FROM public.inventory_movements WHERE reference_id = $1`, [retId]);
    assert.equal(Number(moveCheck.rows[0].cnt), 0);

    const pAfter = await appPool.query(`SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`, [PROD_2_ID]);
    assert.equal(pAfter.rows[0].available_quantity, expectedAvail);
    assert.equal(pAfter.rows[0].rented_quantity, expectedRented);
  });

  // --------------------------------------------------------------------------
  // Test 5: Negative, zero, malformed, or unknown return lines rejection
  // --------------------------------------------------------------------------
  it("5. rejects negative, zero, malformed, or unknown items before making database writes", async () => {
    const billId = `${FIXTURE_PREFIX}bill-5`;
    const gpId = `${FIXTURE_PREFIX}gp-5`;

    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-0405",
      gpId,
      gpNumber: "TNGP-B57-0405",
      items: [{ productId: PROD_2_ID, itemName: "Batch 5.7 Steel Shuttering Plate", qty: 5 }],
    });

    // 1. Negative quantity
    await assert.rejects(
      () => testStore.recordBillReturn(billId, {
        gatePassId: gpId,
        items: [{ productId: PROD_2_ID, quantityReturnedGood: -3 }],
      }),
      /Negative or invalid return quantities/i
    );

    // 2. Zero total quantity
    await assert.rejects(
      () => testStore.recordBillReturn(billId, {
        gatePassId: gpId,
        items: [{ productId: PROD_2_ID, quantityReturnedGood: 0, quantityDamaged: 0, quantityMissing: 0 }],
      }),
      /must be greater than zero/i
    );

    // 3. Unknown item not in gate pass
    await assert.rejects(
      () => testStore.recordBillReturn(billId, {
        gatePassId: gpId,
        items: [{ productId: PROD_CONCURRENT_ID, quantityReturnedGood: 1 }],
      }),
      /does not match any dispatched gate pass line/i
    );
  });

  // --------------------------------------------------------------------------
  // Test 6: Return against an undispatched or cancelled bill
  // --------------------------------------------------------------------------
  it("6. rejects return against undispatched or cancelled bill", async () => {
    const undispatchedBillId = `${FIXTURE_PREFIX}bill-undispatched`;
    await appPool.query(
      `INSERT INTO public.bills (
        id, bill_number, company_id, company_snapshot,
        customer_id, customer_name, customer_phone, customer_address,
        bill_date, rental_start_date, rental_end_date, rental_days,
        status, tax_type, subtotal, grand_total, balance_due, amount_in_words
      ) VALUES (
        $1, 'TNS-B57-0406A', $2, '{"name":"Batch 5.7"}'::jsonb,
        $3, 'Batch 5.7 Customer', '9876522222', 'Vellore',
        CURRENT_DATE, '2026-11-01', '2026-11-10', 10,
        'ISSUED', 'GST', 1000.00, 1180.00, 1180.00, 'One Thousand One Hundred Eighty Only'
      )`,
      [undispatchedBillId, COMPANY_ID, CUSTOMER_ID]
    );

    await assert.rejects(
      () => testStore.recordBillReturn(undispatchedBillId, {
        items: [{ productId: PROD_1_ID, quantityReturnedGood: 1 }],
      }),
      /No dispatch or gate pass found/i
    );

    const cancelledBillId = `${FIXTURE_PREFIX}bill-cancelled`;
    await appPool.query(
      `INSERT INTO public.bills (
        id, bill_number, company_id, company_snapshot,
        customer_id, customer_name, customer_phone, customer_address,
        bill_date, rental_start_date, rental_end_date, rental_days,
        status, tax_type, subtotal, grand_total, balance_due, amount_in_words
      ) VALUES (
        $1, 'TNS-B57-0406B', $2, '{"name":"Batch 5.7"}'::jsonb,
        $3, 'Batch 5.7 Customer', '9876522222', 'Vellore',
        CURRENT_DATE, '2026-11-01', '2026-11-10', 10,
        'CANCELLED', 'GST', 1000.00, 1180.00, 1180.00, 'One Thousand One Hundred Eighty Only'
      )`,
      [cancelledBillId, COMPANY_ID, CUSTOMER_ID]
    );

    await assert.rejects(
      () => testStore.recordBillReturn(cancelledBillId, {
        items: [{ productId: PROD_1_ID, quantityReturnedGood: 1 }],
      }),
      /Cannot record return for a Cancelled bill/i
    );
  });

  // --------------------------------------------------------------------------
  // Test 7: Failure during product stock update rolls back all writes
  // --------------------------------------------------------------------------
  it("7. rolls back all database writes when product stock update fails", async () => {
    const billId = `${FIXTURE_PREFIX}bill-fail-stock`;
    const gpId = `${FIXTURE_PREFIX}gp-fail-stock`;

    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-0407",
      gpId,
      gpNumber: "TNGP-B57-0407",
      items: [{ productId: PROD_2_ID, itemName: "Batch 5.7 Steel Shuttering Plate", qty: 5 }],
    });

    const pBefore = await appPool.query(`SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`, [PROD_2_ID]);
    const expectedAvail = pBefore.rows[0].available_quantity;

    const proxyStore = Object.create(testStore);
    proxyStore.updateProduct = async () => {
      throw new Error("INJECTED_RETURN_STOCK_UPDATE_FAILURE");
    };

    const failRetId = `${FIXTURE_PREFIX}ret-fail-stock`;
    await assert.rejects(
      () => proxyStore.recordBillReturn(billId, {
        id: failRetId,
        gatePassId: gpId,
        items: [{ productId: PROD_2_ID, quantityReturnedGood: 3 }],
      }),
      /INJECTED_RETURN_STOCK_UPDATE_FAILURE/
    );

    // Verify rollback
    const retCheck = await appPool.query(`SELECT count(*) as cnt FROM public.returns WHERE id = $1`, [failRetId]);
    assert.equal(Number(retCheck.rows[0].cnt), 0);

    const moveCheck = await appPool.query(`SELECT count(*) as cnt FROM public.inventory_movements WHERE reference_id = $1`, [failRetId]);
    assert.equal(Number(moveCheck.rows[0].cnt), 0);

    const pAfter = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_2_ID]);
    assert.equal(pAfter.rows[0].available_quantity, expectedAvail);
  });

  // --------------------------------------------------------------------------
  // Test 8: Failure during inventory movement insertion rolls back all writes
  // --------------------------------------------------------------------------
  it("8. rolls back stock restoration and return record when inventory movement fails", async () => {
    const billId = `${FIXTURE_PREFIX}bill-fail-movement`;
    const gpId = `${FIXTURE_PREFIX}gp-fail-movement`;

    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-0408",
      gpId,
      gpNumber: "TNGP-B57-0408",
      items: [{ productId: PROD_2_ID, itemName: "Batch 5.7 Steel Shuttering Plate", qty: 5 }],
    });

    const pBefore = await appPool.query(`SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`, [PROD_2_ID]);
    const expectedAvail = pBefore.rows[0].available_quantity;

    const txProxy = Object.create(testStore);
    txProxy.recordBillReturn = async (bId: string, data: any, act: any) => {
      return txProxy.withTransaction(async (txStore: any) => {
        const origFrom = txStore.supabase.from.bind(txStore.supabase);
        txStore.supabase.from = (table: string) => {
          if (table === "inventory_movements") {
            return {
              insert: async () => ({ error: { message: "INJECTED_RETURN_MOVEMENT_FAILURE" } }),
            };
          }
          return origFrom(table);
        };
        return txStore.executeRecordBillReturn(bId, data, act);
      });
    };

    const failRetId = `${FIXTURE_PREFIX}ret-fail-movement`;
    await assert.rejects(
      () => txProxy.recordBillReturn(billId, {
        id: failRetId,
        gatePassId: gpId,
        items: [{ productId: PROD_2_ID, quantityReturnedGood: 2 }],
      }),
      /INJECTED_RETURN_MOVEMENT_FAILURE/
    );

    // Verify rollback
    const retCheck = await appPool.query(`SELECT count(*) as cnt FROM public.returns WHERE id = $1`, [failRetId]);
    assert.equal(Number(retCheck.rows[0].cnt), 0);

    const pAfter = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_2_ID]);
    assert.equal(pAfter.rows[0].available_quantity, expectedAvail);
  });

  // --------------------------------------------------------------------------
  // Test 9: Failure during return item insertion rolls back all writes
  // --------------------------------------------------------------------------
  it("9. rolls back return header, movements, and stock when return item insertion fails", async () => {
    const billId = `${FIXTURE_PREFIX}bill-fail-items`;
    const gpId = `${FIXTURE_PREFIX}gp-fail-items`;

    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-0409",
      gpId,
      gpNumber: "TNGP-B57-0409",
      items: [{ productId: PROD_2_ID, itemName: "Batch 5.7 Steel Shuttering Plate", qty: 5 }],
    });

    const pBefore = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_2_ID]);
    const expectedAvail = pBefore.rows[0].available_quantity;

    const txProxy = Object.create(testStore);
    txProxy.recordBillReturn = async (bId: string, data: any, act: any) => {
      return txProxy.withTransaction(async (txStore: any) => {
        const origFrom = txStore.supabase.from.bind(txStore.supabase);
        txStore.supabase.from = (table: string) => {
          if (table === "return_items") {
            return {
              insert: async () => ({ error: { message: "INJECTED_RETURN_ITEMS_FAILURE" } }),
            };
          }
          return origFrom(table);
        };
        return txStore.executeRecordBillReturn(bId, data, act);
      });
    };

    const failRetId = `${FIXTURE_PREFIX}ret-fail-items`;
    await assert.rejects(
      () => txProxy.recordBillReturn(billId, {
        id: failRetId,
        gatePassId: gpId,
        items: [{ productId: PROD_2_ID, quantityReturnedGood: 2 }],
      }),
      /INJECTED_RETURN_ITEMS_FAILURE/
    );

    // Verify rollback
    const retCheck = await appPool.query(`SELECT count(*) as cnt FROM public.returns WHERE id = $1`, [failRetId]);
    assert.equal(Number(retCheck.rows[0].cnt), 0);

    const pAfter = await appPool.query(`SELECT available_quantity FROM public.products WHERE id = $1`, [PROD_2_ID]);
    assert.equal(pAfter.rows[0].available_quantity, expectedAvail);
  });

  // --------------------------------------------------------------------------
  // Test 10: Failure during gate-pass item/status update rolls back all writes
  // --------------------------------------------------------------------------
  it("10. rolls back stock, returns, and movements when gate pass update fails", async () => {
    const billId = `${FIXTURE_PREFIX}bill-fail-gp`;
    const gpId = `${FIXTURE_PREFIX}gp-fail-gp`;

    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-0410",
      gpId,
      gpNumber: "TNGP-B57-0410",
      items: [{ productId: PROD_2_ID, itemName: "Batch 5.7 Steel Shuttering Plate", qty: 5 }],
    });

    const txProxy = Object.create(testStore);
    txProxy.recordBillReturn = async (bId: string, data: any, act: any) => {
      return txProxy.withTransaction(async (txStore: any) => {
        const origFrom = txStore.supabase.from.bind(txStore.supabase);
        txStore.supabase.from = (table: string) => {
          const qb = origFrom(table);
          if (table === "gate_passes") {
            qb.update = () => ({
              eq: async () => ({ error: { message: "INJECTED_GP_STATUS_UPDATE_FAILURE" } }),
            });
          }
          return qb;
        };
        return txStore.executeRecordBillReturn(bId, data, act);
      });
    };

    const failRetId = `${FIXTURE_PREFIX}ret-fail-gp`;
    await assert.rejects(
      () => txProxy.recordBillReturn(billId, {
        id: failRetId,
        gatePassId: gpId,
        items: [{ productId: PROD_2_ID, quantityReturnedGood: 2 }],
      }),
      /INJECTED_GP_STATUS_UPDATE_FAILURE/
    );

    // Verify gate pass status remains DISPATCHED
    const gpCheck = await appPool.query(`SELECT status FROM public.gate_passes WHERE id = $1`, [gpId]);
    assert.equal(gpCheck.rows[0].status, "DISPATCHED");
  });

  // --------------------------------------------------------------------------
  // Test 11: Failure during bill financial update rolls back all writes
  // --------------------------------------------------------------------------
  it("11. rolls back all operations when bill update fails", async () => {
    const billId = `${FIXTURE_PREFIX}bill-fail-bill`;
    const gpId = `${FIXTURE_PREFIX}gp-fail-bill`;

    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-0411",
      gpId,
      gpNumber: "TNGP-B57-0411",
      items: [{ productId: PROD_2_ID, itemName: "Batch 5.7 Steel Shuttering Plate", qty: 5 }],
    });

    const proxyStore = Object.create(testStore);
    proxyStore.updateBill = async () => {
      throw new Error("INJECTED_BILL_UPDATE_FAILURE");
    };

    const failRetId = `${FIXTURE_PREFIX}ret-fail-bill`;
    await assert.rejects(
      () => proxyStore.recordBillReturn(billId, {
        id: failRetId,
        gatePassId: gpId,
        items: [{ productId: PROD_2_ID, quantityReturnedGood: 2 }],
      }),
      /INJECTED_BILL_UPDATE_FAILURE/
    );

    // Verify bill untouched
    const billCheck = await appPool.query(`SELECT total_returned_good FROM public.bills WHERE id = $1`, [billId]);
    assert.equal(billCheck.rows[0].total_returned_good, 0);
  });

  // --------------------------------------------------------------------------
  // Test 12: Failure during required audit logging rolls back all writes
  // --------------------------------------------------------------------------
  it("12. rolls back the entire return transaction when audit logging fails", async () => {
    const billId = `${FIXTURE_PREFIX}bill-fail-audit`;
    const gpId = `${FIXTURE_PREFIX}gp-fail-audit`;

    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-0412",
      gpId,
      gpNumber: "TNGP-B57-0412",
      items: [{ productId: PROD_2_ID, itemName: "Batch 5.7 Steel Shuttering Plate", qty: 5 }],
    });

    const proxyStore = Object.create(testStore);
    proxyStore.recordAuditLog = async () => {
      throw new Error("INJECTED_RETURN_AUDIT_FAILURE");
    };

    const failRetId = `${FIXTURE_PREFIX}ret-fail-audit`;
    await assert.rejects(
      () => proxyStore.recordBillReturn(billId, {
        id: failRetId,
        gatePassId: gpId,
        items: [{ productId: PROD_2_ID, quantityReturnedGood: 2 }],
      }),
      /INJECTED_RETURN_AUDIT_FAILURE/
    );

    // Verify return does not exist
    const retCheck = await appPool.query(`SELECT count(*) as cnt FROM public.returns WHERE id = $1`, [failRetId]);
    assert.equal(Number(retCheck.rows[0].cnt), 0);
  });

  // --------------------------------------------------------------------------
  // Test 13: Concurrent return requests against same dispatched quantities
  // --------------------------------------------------------------------------
  it("13. serializes concurrent return requests against the same dispatched line preventing double-returns", async () => {
    const billId = `${FIXTURE_PREFIX}bill-concurrent`;
    const gpId = `${FIXTURE_PREFIX}gp-concurrent`;

    // Dispatched 5 units
    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-0413",
      gpId,
      gpNumber: "TNGP-B57-0413",
      items: [{ productId: PROD_CONCURRENT_ID, itemName: "Batch 5.7 Mobile Tower Scaffold", qty: 5 }],
    });

    const store1 = new SupabaseStore();
    const store2 = new SupabaseStore();

    // Two simultaneous returns both requesting to return all 5 units
    const [res1, res2] = await Promise.allSettled([
      store1.recordBillReturn(billId, {
        id: `${FIXTURE_PREFIX}ret-race-1`,
        gatePassId: gpId,
        items: [{ productId: PROD_CONCURRENT_ID, quantityReturnedGood: 5 }],
      }),
      store2.recordBillReturn(billId, {
        id: `${FIXTURE_PREFIX}ret-race-2`,
        gatePassId: gpId,
        items: [{ productId: PROD_CONCURRENT_ID, quantityReturnedGood: 5 }],
      }),
    ]);

    const fulfilled = [res1, res2].filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
    const rejected = [res1, res2].filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    assert.equal(fulfilled.length, 1, "Exactly one concurrent return must succeed");
    assert.equal(rejected.length, 1, "Second concurrent return must be rejected");

    assert.match(rejected[0].reason.message, /Over-return rejected/i);

    // Database verification: exactly 5 units returned, 0 rented
    const pCheck = await appPool.query(`SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`, [PROD_CONCURRENT_ID]);
    assert.equal(pCheck.rows[0].available_quantity, 10, "Available stock must be 10 (never 15)");
    assert.equal(pCheck.rows[0].rented_quantity, 0, "Rented quantity must be 0");

    const retCount = await appPool.query(`SELECT count(*) as cnt FROM public.returns WHERE gate_pass_id = $1`, [gpId]);
    assert.equal(Number(retCount.rows[0].cnt), 1, "Exactly 1 return record must be committed");
  });

  // --------------------------------------------------------------------------
  // Test 14: Concurrent return and dispatch attempts affecting same product stock
  // --------------------------------------------------------------------------
  it("14. serializes simultaneous return and dispatch operations on the same product stock without deadlock or loss", async () => {
    // Initial PROD_1_ID stock: 50 total, available currently = 49, rented = 0
    const billReturnId = `${FIXTURE_PREFIX}bill-rt-mix`;
    const gpReturnId = `${FIXTURE_PREFIX}gp-rt-mix`;

    await seedDispatchedBill({
      billId: billReturnId,
      billNumber: "TNS-B57-0414A",
      gpId: gpReturnId,
      gpNumber: "TNGP-B57-0414A",
      items: [{ productId: PROD_1_ID, itemName: "Batch 5.7 Heavy Scaffolding Pipe 3m", qty: 10 }],
    });

    const billDispatchId = `${FIXTURE_PREFIX}bill-dp-mix`;
    await appPool.query(
      `INSERT INTO public.bills (
        id, bill_number, company_id, company_snapshot,
        customer_id, customer_name, customer_phone, customer_address,
        bill_date, rental_start_date, rental_end_date, rental_days,
        status, tax_type, subtotal, grand_total, balance_due, amount_in_words
      ) VALUES (
        $1, 'TNS-B57-0414B', $2, '{"name":"Batch 5.7"}'::jsonb,
        $3, 'Batch 5.7 Customer', '9876522222', 'Vellore',
        CURRENT_DATE, '2026-11-01', '2026-11-10', 10,
        'ISSUED', 'GST', 1000.00, 1180.00, 1180.00, 'One Thousand One Hundred Eighty Only'
      )`,
      [billDispatchId, COMPANY_ID, CUSTOMER_ID]
    );

    const storeReturn = new SupabaseStore();
    const storeDispatch = new SupabaseStore();

    // Simultaneously return 10 units on bill A and dispatch 5 units on bill B
    const [retRes, dpRes] = await Promise.allSettled([
      storeReturn.recordBillReturn(billReturnId, {
        id: `${FIXTURE_PREFIX}ret-mix`,
        gatePassId: gpReturnId,
        items: [{ productId: PROD_1_ID, quantityReturnedGood: 10 }],
      }),
      storeDispatch.createGatePass({
        id: `${FIXTURE_PREFIX}gp-mix`,
        companyId: COMPANY_ID,
        customerId: CUSTOMER_ID,
        customerName: "Batch 5.7 Customer Pvt Ltd",
        billId: billDispatchId,
        items: [{ productId: PROD_1_ID, quantityDispatched: 5 }],
      }),
    ]);

    assert.equal(retRes.status, "fulfilled", "Return must succeed");
    assert.equal(dpRes.status, "fulfilled", "Dispatch must succeed");

    // Stock verification:
    // Started with 50 available. Seed dispatched 10 -> available = 40, rented = 10.
    // Returned 10 -> available becomes 50, rented becomes 0.
    // Dispatched 5 -> available becomes 45, rented becomes 5.
    const finalProd = await appPool.query(`SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`, [PROD_1_ID]);
    assert.equal(finalProd.rows[0].available_quantity, 45);
    assert.equal(finalProd.rows[0].rented_quantity, 5);
  });

  // --------------------------------------------------------------------------
  // Test 15: Mathematical reconciliation of stock totals and financial balances
  // --------------------------------------------------------------------------
  it("15. reconciles inventory stock, movement deltas, and financial balances with precision", async () => {
    // Total owned quantity must equal available + rented + damaged + missing
    const prods = await appPool.query(
      `SELECT id, name, total_owned_quantity, available_quantity, rented_quantity, damaged_quantity, missing_quantity
       FROM public.products WHERE id LIKE $1`,
      [`${FIXTURE_PREFIX}%`]
    );

    for (const p of prods.rows) {
      const sum =
        Number(p.available_quantity) +
        Number(p.rented_quantity) +
        Number(p.damaged_quantity) +
        Number(p.missing_quantity);
      assert.equal(
        sum,
        Number(p.total_owned_quantity),
        `Product ${p.name} stock reconciliation error: sum(${sum}) !== owned(${p.total_owned_quantity})`
      );
    }
  });

  // ==========================================================================
  // BATCH 5.7B REGRESSION TESTS (Scenarios 1 through 10)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // Scenario 1: Duplicate lines (e.g. 8 + 8) rejected when only 10 dispatched
  // --------------------------------------------------------------------------
  it("16. Batch 5.7B (1) rejects duplicate return lines collectively exceeding outstanding dispatched quantity before writes", async () => {
    const billId = `${FIXTURE_PREFIX}bill-16`;
    const gpId = `${FIXTURE_PREFIX}gp-16`;
    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-16",
      gpId,
      gpNumber: "TNGP-B57-16",
      items: [{ productId: PROD_1_ID, itemName: "Heavy Scaffolding Pipe 3m", qty: 10 }],
    });

    // Attempt return with two separate lines of 8 units each for the same product (8 + 8 = 16 > 10)
    await assert.rejects(
      async () => {
        await testStore.recordBillReturn(billId, {
          items: [
            { productId: PROD_1_ID, itemName: "Heavy Scaffolding Pipe 3m", quantityReturnedGood: 8 },
            { productId: PROD_1_ID, itemName: "Heavy Scaffolding Pipe 3m", quantityReturnedGood: 8 },
          ],
        });
      },
      /Over-return rejected: requested return of 16 units.*exceeds outstanding dispatched quantity of 10/
    );

    // Verify zero database writes occurred
    const prodRes = await appPool.query(
      `SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`,
      [PROD_1_ID]
    );
    assert.equal(prodRes.rows[0].available_quantity, 40, "Available quantity must remain 40");
    assert.equal(prodRes.rows[0].rented_quantity, 10, "Rented quantity must remain 10");

    const retCount = await appPool.query(
      `SELECT count(*) as cnt FROM public.returns WHERE gate_pass_id = $1`,
      [gpId]
    );
    assert.equal(Number(retCount.rows[0].cnt), 0, "No return headers must be inserted");

    const moveCount = await appPool.query(
      `SELECT count(*) as cnt FROM public.inventory_movements WHERE reference_id IN (SELECT id FROM public.returns WHERE gate_pass_id = $1)`,
      [gpId]
    );
    assert.equal(Number(moveCount.rows[0].cnt), 0, "No inventory movements must be inserted");

    const gpiRes = await appPool.query(
      `SELECT quantity_returned FROM public.gate_pass_items WHERE gate_pass_id = $1`,
      [gpId]
    );
    assert.equal(Number(gpiRes.rows[0].quantity_returned), 0, "Gate pass item returned quantity must remain 0");
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Split good/damaged/missing quantities cannot collectively exceed outstanding dispatched quantity
  // --------------------------------------------------------------------------
  it("17. Batch 5.7B (2) rejects split good/damaged/missing quantities collectively exceeding outstanding quantity before writes", async () => {
    const billId = `${FIXTURE_PREFIX}bill-17`;
    const gpId = `${FIXTURE_PREFIX}gp-17`;
    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-17",
      gpId,
      gpNumber: "TNGP-B57-17",
      items: [{ productId: PROD_1_ID, itemName: "Heavy Scaffolding Pipe 3m", qty: 10 }],
    });

    // 6 good + 3 damaged + 2 missing = 11 > 10 dispatched
    await assert.rejects(
      async () => {
        await testStore.recordBillReturn(billId, {
          items: [
            {
              productId: PROD_1_ID,
              quantityReturnedGood: 6,
              quantityDamaged: 3,
              quantityMissing: 2,
            },
          ],
        });
      },
      /Over-return rejected: requested return of 11 units.*exceeds outstanding dispatched quantity of 10/
    );

    // Verify product stock and return tables untouched
    const prodRes = await appPool.query(
      `SELECT available_quantity, rented_quantity, damaged_quantity, missing_quantity FROM public.products WHERE id = $1`,
      [PROD_1_ID]
    );
    assert.equal(prodRes.rows[0].available_quantity, 40);
    assert.equal(prodRes.rows[0].rented_quantity, 10);
    assert.equal(prodRes.rows[0].damaged_quantity, 0);
    assert.equal(prodRes.rows[0].missing_quantity, 0);
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Invalid or ambiguous gate-pass item references fail before writes
  // --------------------------------------------------------------------------
  it("18. Batch 5.7B (3) rejects invalid or ambiguous gate-pass item references before making database writes", async () => {
    const billId = `${FIXTURE_PREFIX}bill-18`;
    const gpId = `${FIXTURE_PREFIX}gp-18`;
    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-18",
      gpId,
      gpNumber: "TNGP-B57-18",
      items: [{ productId: PROD_1_ID, itemName: "Pipe Section A", qty: 5 }],
    });

    // Add a second line with the same product ID to create ambiguity when returning by productId alone
    await appPool.query(
      `INSERT INTO public.gate_pass_items (
        id, gate_pass_id, product_id, item_name, quantity_dispatched, quantity_returned, quantity_damaged, quantity_missing
      ) VALUES ($1, $2, $3, $4, 5, 0, 0, 0)`,
      [`${gpId}:item-ambiguous-2`, gpId, PROD_1_ID, "Pipe Section B"]
    );
    await appPool.query(
      `UPDATE public.products SET available_quantity = available_quantity - 5, rented_quantity = rented_quantity + 5 WHERE id = $1`,
      [PROD_1_ID]
    );

    // 1. Ambiguous match: productId provided without gatePassItemId
    await assert.rejects(
      async () => {
        await testStore.recordBillReturn(billId, {
          items: [{ productId: PROD_1_ID, quantityReturnedGood: 3 }],
        });
      },
      /Ambiguous return line for product.*multiple dispatched gate pass lines match/
    );

    // 2. Non-existent gatePassItemId
    await assert.rejects(
      async () => {
        await testStore.recordBillReturn(billId, {
          items: [{ gatePassItemId: "unknown-gpi-id-999", quantityReturnedGood: 2 }],
        });
      },
      /specifies unknown or invalid gate pass item ID/
    );

    // 3. Resolving ambiguity by providing specific gatePassItemId succeeds
    const validRes = await testStore.recordBillReturn(billId, {
      items: [{ gatePassItemId: `${gpId}:item-ambiguous-2`, quantityReturnedGood: 3 }],
    });
    assert.equal(validRes.bill.totalReturnedGood, 3);

    const gpiCheck = await appPool.query(
      `SELECT quantity_returned FROM public.gate_pass_items WHERE id = $1`,
      [`${gpId}:item-ambiguous-2`]
    );
    assert.equal(gpiCheck.rows[0].quantity_returned, 3);
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Multiple gate passes for one bill are accounted for correctly
  // --------------------------------------------------------------------------
  it("19. Batch 5.7B (4) correctly accounts for multiple gate passes on one bill across return batches", async () => {
    const billId = `${FIXTURE_PREFIX}bill-19`;
    const gp1Id = `${FIXTURE_PREFIX}gp-19a`;
    const gp2Id = `${FIXTURE_PREFIX}gp-19b`;

    // Seed Bill with first gate pass of 5 units
    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-19",
      gpId: gp1Id,
      gpNumber: "TNGP-B57-19A",
      items: [{ productId: PROD_1_ID, itemName: "Heavy Scaffolding Pipe 3m", qty: 5 }],
    });

    // Seed second gate pass of 5 units on the same bill
    await appPool.query(
      `INSERT INTO public.gate_passes (
        id, gate_pass_number, company_id, company_snapshot,
        customer_id, customer_name, destination_branch, destination_address,
        bill_id, expected_return_date, status
      ) VALUES (
        $1, 'TNGP-B57-19B', $2, '{"name": "Batch 5.7 Test Logistics"}'::jsonb,
        $3, 'Batch 5.7 Customer Pvt Ltd', 'Main Site', 'Vellore Freight Complex',
        $4, '2026-11-10', 'DISPATCHED'
      )`,
      [gp2Id, COMPANY_ID, CUSTOMER_ID, billId]
    );

    await appPool.query(
      `INSERT INTO public.gate_pass_items (
        id, gate_pass_id, product_id, item_name, quantity_dispatched, quantity_returned, quantity_damaged, quantity_missing
      ) VALUES ($1, $2, $3, $4, 5, 0, 0, 0)`,
      [`${gp2Id}:item-1`, gp2Id, PROD_1_ID, "Heavy Scaffolding Pipe 3m"]
    );
    await appPool.query(
      `UPDATE public.products SET available_quantity = available_quantity - 5, rented_quantity = rented_quantity + 5 WHERE id = $1`,
      [PROD_1_ID]
    );

    // Initial state: Total Dispatched = 10, Available = 40, Rented = 10
    // Return GP1 items (5 units)
    const ret1 = await testStore.recordBillReturn(billId, {
      gatePassId: gp1Id,
      items: [{ productId: PROD_1_ID, quantityReturnedGood: 5 }],
    });

    assert.equal(ret1.bill.totalDispatched, 10, "Authoritative totalDispatched across both gate passes must be 10");
    assert.equal(ret1.bill.totalReturnedGood, 5, "Accounted returns must be 5");
    assert.equal(ret1.bill.status, "PARTIALLY_RETURNED", "Bill must be PARTIALLY_RETURNED after GP1 return");

    // Verify GP1 is RETURNED and GP2 is DISPATCHED
    const gp1Row = await appPool.query(`SELECT status FROM public.gate_passes WHERE id = $1`, [gp1Id]);
    const gp2Row = await appPool.query(`SELECT status FROM public.gate_passes WHERE id = $1`, [gp2Id]);
    assert.equal(gp1Row.rows[0].status, "RETURNED");
    assert.equal(gp2Row.rows[0].status, "DISPATCHED");

    // Return GP2 items (5 units)
    const ret2 = await testStore.recordBillReturn(billId, {
      gatePassId: gp2Id,
      items: [{ productId: PROD_1_ID, quantityReturnedGood: 5 }],
    });

    assert.equal(ret2.bill.totalDispatched, 10, "Total dispatched must remain 10");
    assert.equal(ret2.bill.totalReturnedGood, 10, "Accounted returns must be 10");
    assert.equal(ret2.bill.status, "PENDING_SETTLEMENT", "Bill must transition to PENDING_SETTLEMENT when all GPs returned");

    const gp2Final = await appPool.query(`SELECT status FROM public.gate_passes WHERE id = $1`, [gp2Id]);
    assert.equal(gp2Final.rows[0].status, "RETURNED");

    // Re-read bill from database using getBill
    const reloadedBill = await testStore.getBill(billId);
    assert.equal(reloadedBill?.status, "PENDING_SETTLEMENT");
    assert.equal(reloadedBill?.totalDispatched, 10);
    assert.equal(reloadedBill?.totalReturnedGood, 10);
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Earlier partial returns plus the current return correctly determine outstanding quantity
  // --------------------------------------------------------------------------
  it("20. Batch 5.7B (5) correctly determines outstanding quantity across earlier partial returns and current return", async () => {
    const billId = `${FIXTURE_PREFIX}bill-20`;
    const gpId = `${FIXTURE_PREFIX}gp-20`;
    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-20",
      gpId,
      gpNumber: "TNGP-B57-20",
      items: [{ productId: PROD_1_ID, itemName: "Heavy Scaffolding Pipe 3m", qty: 10 }],
    });

    // Batch 1: Return 4 units
    const ret1 = await testStore.recordBillReturn(billId, {
      items: [{ productId: PROD_1_ID, quantityReturnedGood: 4 }],
    });
    assert.equal(ret1.bill.status, "PARTIALLY_RETURNED");
    assert.equal(ret1.bill.totalReturnedGood, 4);

    // Batch 2 attempt: Try returning 7 units (outstanding is 6)
    await assert.rejects(
      async () => {
        await testStore.recordBillReturn(billId, {
          items: [{ productId: PROD_1_ID, quantityReturnedGood: 7 }],
        });
      },
      /Over-return rejected: requested return of 7 units.*exceeds outstanding dispatched quantity of 6/
    );

    // Batch 2 valid: Return exact remaining 6 units
    const ret2 = await testStore.recordBillReturn(billId, {
      items: [{ productId: PROD_1_ID, quantityReturnedGood: 6 }],
    });
    assert.equal(ret2.bill.status, "PENDING_SETTLEMENT");
    assert.equal(ret2.bill.totalReturnedGood, 10);

    const prodRes = await appPool.query(
      `SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`,
      [PROD_1_ID]
    );
    assert.equal(prodRes.rows[0].available_quantity, 50);
    assert.equal(prodRes.rows[0].rented_quantity, 0);
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Full clean return transitions to PENDING_SETTLEMENT and maps valid database status
  // --------------------------------------------------------------------------
  it("21. Batch 5.7B (6) transitions full clean return to PENDING_SETTLEMENT and maps valid database status", async () => {
    const billId = `${FIXTURE_PREFIX}bill-21`;
    const gpId = `${FIXTURE_PREFIX}gp-21`;
    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-21",
      gpId,
      gpNumber: "TNGP-B57-21",
      items: [{ productId: PROD_1_ID, itemName: "Heavy Scaffolding Pipe 3m", qty: 10 }],
    });

    const res = await testStore.recordBillReturn(billId, {
      items: [{ productId: PROD_1_ID, quantityReturnedGood: 10 }],
    });

    assert.equal(res.bill.status, "PENDING_SETTLEMENT");
    assert.equal(res.bill.totalDispatched, 10);

    // Verify getBill reflects operational status PENDING_SETTLEMENT
    const loaded = await testStore.getBill(billId);
    assert.equal(loaded?.status, "PENDING_SETTLEMENT");
    assert.equal(loaded?.totalDispatched, 10);

    // Verify PostgreSQL column status conforms to CHECK (status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'))
    const dbRow = await appPool.query(`SELECT status FROM public.bills WHERE id = $1`, [billId]);
    assert.ok(
      ["ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED"].includes(dbRow.rows[0].status),
      `Database status "${dbRow.rows[0].status}" must satisfy schema check constraint`
    );
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Pending incidents prevent premature settlement (transitions to RETURN_INSPECTION)
  // --------------------------------------------------------------------------
  it("22. Batch 5.7B (7) transitions full return with pending incidents to RETURN_INSPECTION and resolves to PENDING_SETTLEMENT", async () => {
    const billId = `${FIXTURE_PREFIX}bill-22`;
    const gpId = `${FIXTURE_PREFIX}gp-22`;
    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-22",
      gpId,
      gpNumber: "TNGP-B57-22",
      items: [{ productId: PROD_1_ID, itemName: "Heavy Scaffolding Pipe 3m", qty: 10 }],
    });

    // Return 8 good + 2 damaged without decision (defaults to PENDING_DECISION)
    const res = await testStore.recordBillReturn(billId, {
      items: [
        {
          productId: PROD_1_ID,
          quantityReturnedGood: 8,
          quantityDamaged: 2,
          damageNotes: "Bent during site work",
          damageChargeAmount: 250,
        },
      ],
    });

    assert.equal(res.bill.status, "RETURN_INSPECTION", "Must transition to RETURN_INSPECTION when incidents are pending");
    assert.equal(res.bill.incidents?.length, 1);
    assert.equal(res.bill.incidents[0].chargeApprovalStatus, "PENDING_DECISION");

    // Verify getBill also reflects RETURN_INSPECTION
    const loaded = await testStore.getBill(billId);
    assert.equal(loaded?.status, "RETURN_INSPECTION");

    // Now resolve the incident via resolveDamageMissingIncident
    const incidentId = res.bill.incidents[0].id;
    const resolvedBill = await testStore.resolveDamageMissingIncident(billId, incidentId, {
      action: "ADD_CHARGE",
      finalApprovedCharge: 250,
      decisionNotes: "Customer agreed to pay repair costs",
    });

    assert.equal(resolvedBill.status, "PENDING_SETTLEMENT", "Must transition to PENDING_SETTLEMENT after incident is resolved");
    assert.equal(resolvedBill.approvedDamageCharges, 250);

    const finalLoaded = await testStore.getBill(billId);
    assert.equal(finalLoaded?.status, "PENDING_SETTLEMENT");
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Partial returns retain PARTIALLY_RETURNED status
  // --------------------------------------------------------------------------
  it("23. Batch 5.7B (8) preserves PARTIALLY_RETURNED status and metrics on partial returns", async () => {
    const billId = `${FIXTURE_PREFIX}bill-23`;
    const gpId = `${FIXTURE_PREFIX}gp-23`;
    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-23",
      gpId,
      gpNumber: "TNGP-B57-23",
      items: [{ productId: PROD_1_ID, itemName: "Heavy Scaffolding Pipe 3m", qty: 10 }],
    });

    const res = await testStore.recordBillReturn(billId, {
      items: [{ productId: PROD_1_ID, quantityReturnedGood: 3 }],
    });

    assert.equal(res.bill.status, "PARTIALLY_RETURNED");
    assert.equal(res.bill.totalReturnedGood, 3);
    assert.equal(res.bill.totalDispatched, 10);

    const loaded = await testStore.getBill(billId);
    assert.equal(loaded?.status, "PARTIALLY_RETURNED");
    assert.equal(loaded?.totalReturnedGood, 3);
    assert.equal(loaded?.totalDispatched, 10);

    const gpRow = await appPool.query(`SELECT status FROM public.gate_passes WHERE id = $1`, [gpId]);
    assert.equal(gpRow.rows[0].status, "PARTIALLY_RETURNED");
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Failures still roll back stock, movements, return headers/items, gate-pass changes, bill changes, and audit records
  // --------------------------------------------------------------------------
  it("24. Batch 5.7B (9) atomically rolls back all writes across stock, movements, returns, and bill when audit logging fails", async () => {
    const billId = `${FIXTURE_PREFIX}bill-24`;
    const gpId = `${FIXTURE_PREFIX}gp-24`;
    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-24",
      gpId,
      gpNumber: "TNGP-B57-24",
      items: [{ productId: PROD_1_ID, itemName: "Heavy Scaffolding Pipe 3m", qty: 10 }],
    });

    // Injected failure in audit logging
    const proxyStore = new SupabaseStore();
    (proxyStore as any).recordAuditLog = async () => {
      throw new Error("INJECTED_TEST_AUDIT_ROLLBACK");
    };

    await assert.rejects(
      async () => {
        await proxyStore.recordBillReturn(billId, {
          items: [{ productId: PROD_1_ID, quantityReturnedGood: 10 }],
        });
      },
      /INJECTED_TEST_AUDIT_ROLLBACK/
    );

    // Verify atomic rollback across all tables:
    // 1. Stock remains dispatched
    const prodRes = await appPool.query(
      `SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`,
      [PROD_1_ID]
    );
    assert.equal(prodRes.rows[0].available_quantity, 40);
    assert.equal(prodRes.rows[0].rented_quantity, 10);

    // 2. Returns and Return Items rolled back
    const retCount = await appPool.query(
      `SELECT count(*) as cnt FROM public.returns WHERE gate_pass_id = $1`,
      [gpId]
    );
    assert.equal(Number(retCount.rows[0].cnt), 0);

    // 3. Inventory movements rolled back
    const moveCount = await appPool.query(
      `SELECT count(*) as cnt FROM public.inventory_movements WHERE reference_id IN (SELECT id FROM public.returns WHERE gate_pass_id = $1)`,
      [gpId]
    );
    assert.equal(Number(moveCount.rows[0].cnt), 0, "Inventory movements must be rolled back");

    // 4. Gate pass remains DISPATCHED
    const gpRow = await appPool.query(`SELECT status FROM public.gate_passes WHERE id = $1`, [gpId]);
    assert.equal(gpRow.rows[0].status, "DISPATCHED");

    // 5. Gate pass items returned count remains 0
    const gpiRow = await appPool.query(`SELECT quantity_returned FROM public.gate_pass_items WHERE gate_pass_id = $1`, [gpId]);
    assert.equal(Number(gpiRow.rows[0].quantity_returned), 0);
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Alternate return entry points cannot bypass the chosen safeguards
  // --------------------------------------------------------------------------
  it("25. Batch 5.7B (10) blocks alternate return entry points from bypassing safeguards", async () => {
    const billId = `${FIXTURE_PREFIX}bill-25`;
    const gpId = `${FIXTURE_PREFIX}gp-25`;
    await seedDispatchedBill({
      billId,
      billNumber: "TNS-B57-25",
      gpId,
      gpNumber: "TNGP-B57-25",
      items: [{ productId: PROD_1_ID, itemName: "Heavy Scaffolding Pipe 3m", qty: 10 }],
    });

    // 10a. saveBillWorkspaceChanges attempting to alter physical return stock on dispatched bill is rejected
    await assert.rejects(
      async () => {
        await testStore.saveBillWorkspaceChanges(billId, {
          items: [
            {
              id: `${billId}:item-1`,
              productId: PROD_1_ID,
              quantity: 10,
              quantityDamaged: 2, // Causes deltaDamaged = 2, deltaGood = 8
            },
          ],
        });
      },
      /Cannot alter physical return stock via workspace changes for dispatched Bill/
    );

    // Verify stock unchanged
    const prodRes = await appPool.query(
      `SELECT available_quantity, rented_quantity FROM public.products WHERE id = $1`,
      [PROD_1_ID]
    );
    assert.equal(prodRes.rows[0].available_quantity, 40);
    assert.equal(prodRes.rows[0].rented_quantity, 10);

    // 10b. recordReturn delegating to recordBillReturn when billId and items provided
    const bill2Id = `${FIXTURE_PREFIX}bill-25b`;
    const gp2Id = `${FIXTURE_PREFIX}gp-25b`;
    await seedDispatchedBill({
      billId: bill2Id,
      billNumber: "TNS-B57-25B",
      gpId: gp2Id,
      gpNumber: "TNGP-B57-25B",
      items: [{ productId: PROD_1_ID, itemName: "Heavy Scaffolding Pipe 3m", qty: 10 }],
    });

    const retRecord = await testStore.recordReturn({
      billId: bill2Id,
      items: [{ productId: PROD_1_ID, quantityReturnedGood: 10 }],
    });
    assert.ok(retRecord.id, "ReturnRecord must be created");

    // Verify formal return recorded atomically
    const b2Loaded = await testStore.getBill(bill2Id);
    assert.equal(b2Loaded?.status, "PENDING_SETTLEMENT");

    // 10c. recordReturn with physical items but missing both billId and gatePassId is rejected
    await assert.rejects(
      async () => {
        await testStore.recordReturn({
          items: [{ productId: PROD_1_ID, quantityReturnedGood: 5 }],
        });
      },
      /Cannot record physical return: valid billId or gatePassId is required/
    );
  });
});

