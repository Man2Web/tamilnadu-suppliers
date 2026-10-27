import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { SupabaseStore } from "../src/lib/db/supabaseStore";
import { closePostgresPool } from "../src/lib/db/postgresClient";
import { getTestDbConfig } from "./helpers/testDbConfig";

const testDb = getTestDbConfig();

const FIXTURE_PREFIX = "test:b58:";
const COMPANY_ID = `${FIXTURE_PREFIX}comp-1`;
const CUSTOMER_ID = "0663cf3d-5800-4000-8000-000000000001";
const ADMIN_USER_ID = "0663cf3d-5800-4000-8000-000000000002";
const BILLING_USER_ID = "0663cf3d-5800-4000-8000-000000000003";

const PROD_1_ID = `${FIXTURE_PREFIX}prod-1`;
const PROD_2_ID = `${FIXTURE_PREFIX}prod-2`;

describe("Batch 5.8 — Operational Status Consistency and Dispatch Authorization", { skip: !testDb.isConfigured ? testDb.skipReason : false }, () => {
  let appPool: Pool;
  let testStore: SupabaseStore;

  async function cleanAllFixtures() {
    await appPool.query(
      `DELETE FROM public.audit_logs WHERE customer_name LIKE $1 OR entity_number LIKE $2 OR entity_number LIKE $3 OR entity_number LIKE $4`,
      [`%Batch 5.8%`, `TNS-B58-%`, `TNGP-B58-%`, `RET-%`]
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
      `DELETE FROM public.payments WHERE bill_id IN (SELECT id FROM public.bills WHERE company_id = $1)`,
      [COMPANY_ID]
    );
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
    await appPool.query(`DELETE FROM public.customers WHERE id = $1 OR name LIKE $2`, [CUSTOMER_ID, `%Batch 5.8%`]);
    await appPool.query(`DELETE FROM public.users WHERE id IN ($1, $2)`, [ADMIN_USER_ID, BILLING_USER_ID]);
    await appPool.query(`DELETE FROM public.companies WHERE id = $1`, [COMPANY_ID]);
  }

  before(async () => {
    appPool = new Pool(testDb.getPoolConfig());

    await testDb.assertLiveConnection(appPool);

    process.env.DB_PROVIDER = "postgres";
    process.env.DATABASE_URL = testDb.getDatabaseUrl();

    testStore = new SupabaseStore();
    await cleanAllFixtures();

    // Seed company
    await appPool.query(
      `INSERT INTO public.companies (
        id, name, display_name, gst_type, gstin, phone, address, state, state_code,
        bank_name, bank_account_no, bank_ifsc, bank_branch, invoice_prefix,
        quotation_prefix, gate_pass_prefix, next_invoice_no, next_quotation_no, next_gate_pass_no,
        terms_and_conditions, authorized_signatory_title, is_active
      ) VALUES (
        $1, 'Batch 5.8 Logistics Ltd', 'Batch 5.8 Logistics', 'GST_REGISTERED', '33AAAAA0000A1Z5', '+91 9876543210',
        'Vellore Bypass', 'Tamil Nadu', '33', 'Indian Bank', '1234567890', 'IDIB000V001',
        'Main', 'TNS-B58-', 'TNQ-B58-', 'TNGP-B58-', 1, 1, 1,
        'Standard Terms', 'Managing Director', true
      )`,
      [COMPANY_ID]
    );

    // Seed customer
    await appPool.query(
      `INSERT INTO public.customers (id, name, mobile, billing_address, state, is_active)
       VALUES ($1, 'Batch 5.8 Customer Ltd', '+91 9123456789', 'Chennai Highway, Vellore', 'Tamil Nadu', true)`,
      [CUSTOMER_ID]
    );

    // Seed users: Admin and Billing
    await appPool.query(
      `INSERT INTO public.users (id, email, password_hash, name, role, status, permissions)
       VALUES ($1, 'admin@batch58.local', 'dummy-hash-b58', 'Admin Actor', 'ADMIN', 'ACTIVE', '["dispatch:manage", "bills:create", "bills:amend"]'::jsonb)`,
      [ADMIN_USER_ID]
    );

    await appPool.query(
      `INSERT INTO public.users (id, email, password_hash, name, role, status, permissions)
       VALUES ($1, 'billing@batch58.local', 'dummy-hash-b58', 'Billing Actor', 'BILLING', 'ACTIVE', '["dispatch:manage", "bills:create", "bills:amend"]'::jsonb)`,
      [BILLING_USER_ID]
    );

    // Seed products
    await appPool.query(
      `INSERT INTO public.products (
        id, name, sku, unit, default_rental_rate, replacement_value,
        total_owned_quantity, available_quantity, rented_quantity, damaged_quantity, missing_quantity, is_active
      ) VALUES
        ($1, 'Heavy Scaffolding Pipe 3m', 'TEST-B58-PIPE', 'Nos', 15.00, 450.00, 100, 100, 0, 0, 0, true),
        ($2, 'Steel Coupler Heavy Duty', 'TEST-B58-COUPLER', 'Nos', 5.00, 80.00, 200, 200, 0, 0, 0, true)`,
      [PROD_1_ID, PROD_2_ID]
    );
  });

  after(async () => {
    await cleanAllFixtures();
    await appPool.end();
    await closePostgresPool();
  });

  // Helper to seed a bill
  async function seedTestBill(billId: string, billNumber: string, status = "ISSUED") {
    await appPool.query(
      `INSERT INTO public.bills (
        id, bill_number, company_id, company_snapshot,
        customer_id, customer_name, customer_phone, customer_address,
        bill_date, supply_date, place_of_supply, rental_start_date, rental_end_date,
        rental_days, status, grand_total, balance_due, amount_in_words,
        document_lines, created_at, updated_at
      ) VALUES (
        $1, $2, $3, '{"name": "Batch 5.8 Logistics Ltd"}'::jsonb,
        $4, 'Batch 5.8 Customer Ltd', '+91 9123456789', 'Chennai Highway, Vellore',
        CURRENT_DATE, CURRENT_DATE, 'Vellore', CURRENT_DATE, CURRENT_DATE + 5,
        5, $5, 750.00, 750.00, 'Seven Hundred Fifty Rupees Only',
        '[{"id": "item-1", "productId": "${PROD_1_ID}", "itemName": "Heavy Scaffolding Pipe 3m", "quantity": 10, "unitPrice": 15, "amount": 750}]'::jsonb,
        NOW(), NOW()
      )`,
      [billId, billNumber, COMPANY_ID, CUSTOMER_ID, status]
    );

    const branchId = `${billId}:branch-1`;
    await appPool.query(
      `INSERT INTO public.bill_branches (id, bill_id, branch_name, delivery_address)
       VALUES ($1, $2, 'Main Site', 'Chennai Highway, Vellore')`,
      [branchId, billId]
    );

    await appPool.query(
      `INSERT INTO public.bill_items (
        id, bill_branch_id, bill_id, product_id, item_name, quantity, days, unit_price, amount
      ) VALUES ($1, $2, $3, $4, 'Heavy Scaffolding Pipe 3m', 10, 5, 15.00, 750.00)`,
      [`${billId}:item-1`, branchId, billId, PROD_1_ID]
    );
  }

  // Helper to dispatch a bill
  async function dispatchBill(billId: string, gpId: string, gpNumber: string, actor: any) {
    return testStore.createGatePass({
      id: gpId,
      gatePassNumber: gpNumber,
      companyId: COMPANY_ID,
      customerId: CUSTOMER_ID,
      customerName: "Batch 5.8 Customer Ltd",
      billId,
      expectedReturnDate: "2026-11-15",
      destinationBranch: "Main Site",
      destinationAddress: "Vellore Complex",
      items: [{ productId: PROD_1_ID, itemName: "Heavy Scaffolding Pipe 3m", quantityDispatched: 10 }],
      actor,
    });
  }

  // --------------------------------------------------------------------------
  // Step 2 Tests — Operational Status Consistency
  // --------------------------------------------------------------------------

  it("1. getBill(id) and getBills() agree on ACTIVE for undispatched bills", async () => {
    const billId = `${FIXTURE_PREFIX}bill-1`;
    await seedTestBill(billId, "TNS-B58-01");

    const single = await testStore.getBill(billId);
    assert.ok(single);
    assert.equal(single.status, "ACTIVE", "Undispatched bill must have status ACTIVE in getBill");

    const list = await testStore.getBills();
    const fromList = list.find((b) => b.id === billId);
    assert.ok(fromList);
    assert.equal(fromList.status, "ACTIVE", "Undispatched bill must have status ACTIVE in getBills()");
  });

  it("2. getBill(id) and getBills() agree on OUT_ON_RENT after dispatch", async () => {
    const billId = `${FIXTURE_PREFIX}bill-2`;
    const gpId = `${FIXTURE_PREFIX}gp-2`;
    await seedTestBill(billId, "TNS-B58-02");

    await dispatchBill(billId, gpId, "TNGP-B58-02", { id: ADMIN_USER_ID, name: "Admin Actor", role: "ADMIN" });

    const single = await testStore.getBill(billId);
    assert.ok(single);
    assert.equal(single.status, "OUT_ON_RENT", "Dispatched bill must have status OUT_ON_RENT in getBill");
    assert.equal(single.totalDispatched, 10);

    const list = await testStore.getBills();
    const fromList = list.find((b) => b.id === billId);
    assert.ok(fromList);
    assert.equal(fromList.status, "OUT_ON_RENT", "Dispatched bill must have status OUT_ON_RENT in getBills()");
    assert.equal(fromList.totalDispatched, 10);
  });

  it("3. getBill(id) and getBills() agree on PARTIALLY_RETURNED after partial return", async () => {
    const billId = `${FIXTURE_PREFIX}bill-3`;
    const gpId = `${FIXTURE_PREFIX}gp-3`;
    await seedTestBill(billId, "TNS-B58-03");
    await dispatchBill(billId, gpId, "TNGP-B58-03", { id: ADMIN_USER_ID, name: "Admin Actor", role: "ADMIN" });

    await testStore.recordBillReturn(billId, {
      items: [{ productId: PROD_1_ID, quantityReturnedGood: 4 }],
    });

    const single = await testStore.getBill(billId);
    assert.ok(single);
    assert.equal(single.status, "PARTIALLY_RETURNED");
    assert.equal(single.totalReturnedGood, 4);
    assert.equal(single.totalDispatched, 10);

    const list = await testStore.getBills();
    const fromList = list.find((b) => b.id === billId);
    assert.ok(fromList);
    assert.equal(fromList.status, "PARTIALLY_RETURNED", "List response must derive PARTIALLY_RETURNED consistently");
    assert.equal(fromList.totalReturnedGood, 4);
    assert.equal(fromList.totalDispatched, 10);
  });

  it("4. getBill(id) and getBills() agree on RETURN_INSPECTION when full return has pending incidents", async () => {
    const billId = `${FIXTURE_PREFIX}bill-4`;
    const gpId = `${FIXTURE_PREFIX}gp-4`;
    await seedTestBill(billId, "TNS-B58-04");
    await dispatchBill(billId, gpId, "TNGP-B58-04", { id: ADMIN_USER_ID, name: "Admin Actor", role: "ADMIN" });

    await testStore.recordBillReturn(billId, {
      items: [
        {
          productId: PROD_1_ID,
          quantityReturnedGood: 8,
          quantityDamaged: 2,
          damageChargeAmount: 300,
          // Omitting explicit decision defaults to PENDING_DECISION
        },
      ],
    });

    const single = await testStore.getBill(billId);
    assert.ok(single);
    assert.equal(single.status, "RETURN_INSPECTION");

    const list = await testStore.getBills();
    const fromList = list.find((b) => b.id === billId);
    assert.ok(fromList);
    assert.equal(fromList.status, "RETURN_INSPECTION", "List response must derive RETURN_INSPECTION consistently");
  });

  it("5. getBill(id) and getBills() agree on PENDING_SETTLEMENT when full return has no pending incidents", async () => {
    const billId = `${FIXTURE_PREFIX}bill-5`;
    const gpId = `${FIXTURE_PREFIX}gp-5`;
    await seedTestBill(billId, "TNS-B58-05");
    await dispatchBill(billId, gpId, "TNGP-B58-05", { id: ADMIN_USER_ID, name: "Admin Actor", role: "ADMIN" });

    await testStore.recordBillReturn(billId, {
      items: [{ productId: PROD_1_ID, quantityReturnedGood: 10 }],
    });

    const single = await testStore.getBill(billId);
    assert.ok(single);
    assert.equal(single.status, "PENDING_SETTLEMENT");

    const list = await testStore.getBills();
    const fromList = list.find((b) => b.id === billId);
    assert.ok(fromList);
    assert.equal(fromList.status, "PENDING_SETTLEMENT", "List response must derive PENDING_SETTLEMENT consistently");
  });

  it("6. incident resolution transitions RETURN_INSPECTION to PENDING_SETTLEMENT across reloads and lists", async () => {
    const billId = `${FIXTURE_PREFIX}bill-6`;
    const gpId = `${FIXTURE_PREFIX}gp-6`;
    await seedTestBill(billId, "TNS-B58-06");
    await dispatchBill(billId, gpId, "TNGP-B58-06", { id: ADMIN_USER_ID, name: "Admin Actor", role: "ADMIN" });

    const ret = await testStore.recordBillReturn(billId, {
      items: [
        {
          productId: PROD_1_ID,
          quantityReturnedGood: 9,
          quantityDamaged: 1,
          damageChargeAmount: 150,
        },
      ],
    });
    assert.equal(ret.bill.status, "RETURN_INSPECTION");

    // Resolve the incident
    const incidentId = ret.bill.incidents![0].id;
    const resolved = await testStore.resolveDamageMissingIncident(billId, incidentId, {
      action: "ADD_CHARGE",
      finalApprovedCharge: 150,
      decisionNotes: "Customer accepted damage charge",
    });
    assert.equal(resolved.status, "PENDING_SETTLEMENT");

    // Verify singular getBill
    const single = await testStore.getBill(billId);
    assert.equal(single?.status, "PENDING_SETTLEMENT");

    // Verify plural getBills
    const list = await testStore.getBills();
    const fromList = list.find((b) => b.id === billId);
    assert.equal(fromList?.status, "PENDING_SETTLEMENT");
  });

  it("7. recording a payment preserves operational status without erasing return lifecycle state", async () => {
    const billId = `${FIXTURE_PREFIX}bill-7`;
    const gpId = `${FIXTURE_PREFIX}gp-7`;
    await seedTestBill(billId, "TNS-B58-07");
    await dispatchBill(billId, gpId, "TNGP-B58-07", { id: ADMIN_USER_ID, name: "Admin Actor", role: "ADMIN" });

    await testStore.recordBillReturn(billId, {
      items: [{ productId: PROD_1_ID, quantityReturnedGood: 10 }],
    });

    // Record payment
    await testStore.recordPayment({
      billId,
      customerId: CUSTOMER_ID,
      companyId: COMPANY_ID,
      amount: 750.00,
      paymentMethod: "CASH",
      paymentType: "RENTAL_PAYMENT",
    });

    const single = await testStore.getBill(billId);
    assert.equal(single?.paymentStatus, "FULLY_PAID");
    assert.equal(single?.balanceDue, 0);
    assert.equal(single?.status, "PENDING_SETTLEMENT", "Payment must not overwrite operational status PENDING_SETTLEMENT");

    const list = await testStore.getBills();
    const fromList = list.find((b) => b.id === billId);
    assert.equal(fromList?.paymentStatus, "FULLY_PAID");
    assert.equal(fromList?.status, "PENDING_SETTLEMENT", "getBills() must preserve PENDING_SETTLEMENT after payment");
  });

  it("8. CLOSED and CANCELLED bills retain their status in getBill and getBills", async () => {
    const closedBillId = `${FIXTURE_PREFIX}bill-8-closed`;
    const cancelledBillId = `${FIXTURE_PREFIX}bill-8-canc`;

    await seedTestBill(closedBillId, "TNS-B58-08A", "PAID"); // in DB 'PAID' maps to CLOSED
    await seedTestBill(cancelledBillId, "TNS-B58-08B", "CANCELLED");

    const singleClosed = await testStore.getBill(closedBillId);
    assert.equal(singleClosed?.status, "CLOSED");

    const singleCanc = await testStore.getBill(cancelledBillId);
    assert.equal(singleCanc?.status, "CANCELLED");

    const list = await testStore.getBills();
    const fromListClosed = list.find((b) => b.id === closedBillId);
    assert.equal(fromListClosed?.status, "CLOSED");

    const fromListCanc = list.find((b) => b.id === cancelledBillId);
    assert.equal(fromListCanc?.status, "CANCELLED");
  });

  // --------------------------------------------------------------------------
  // Step 3 Tests — Additional Dispatch Authorization
  // --------------------------------------------------------------------------

  it("9. First dispatch succeeds for any user with dispatch permission", async () => {
    const billId = `${FIXTURE_PREFIX}bill-9`;
    const gpId = `${FIXTURE_PREFIX}gp-9`;
    await seedTestBill(billId, "TNS-B58-09");

    // BILLING role dispatching for the first time
    const gp = await dispatchBill(billId, gpId, "TNGP-B58-09", {
      id: BILLING_USER_ID,
      name: "Billing Actor",
      role: "BILLING",
    });
    assert.ok(gp.id);

    const gpDb = await appPool.query(`SELECT status FROM public.gate_passes WHERE id = $1`, [gp.id]);
    assert.equal(gpDb.rows[0].status, "DISPATCHED");
  });

  it("10. Duplicate dispatch without allowAdditionalDispatch is rejected for all users", async () => {
    const billId = `${FIXTURE_PREFIX}bill-10`;
    const gp1Id = `${FIXTURE_PREFIX}gp-10a`;
    const gp2Id = `${FIXTURE_PREFIX}gp-10b`;
    await seedTestBill(billId, "TNS-B58-10");

    await dispatchBill(billId, gp1Id, "TNGP-B58-10A", { id: ADMIN_USER_ID, name: "Admin Actor", role: "ADMIN" });

    // Attempt second dispatch without flag (even as ADMIN)
    await assert.rejects(
      async () => {
        await dispatchBill(billId, gp2Id, "TNGP-B58-10B", {
          id: ADMIN_USER_ID,
          name: "Admin Actor",
          role: "ADMIN",
        });
      },
      /Duplicate dispatch rejected/
    );

    // Verify second gate pass was NOT created
    const count = await appPool.query(`SELECT count(*) as cnt FROM public.gate_passes WHERE id = $1`, [gp2Id]);
    assert.equal(Number(count.rows[0].cnt), 0);
  });

  it("11. Unauthorized user (BILLING / STAFF) cannot bypass guard with allowAdditionalDispatch: true", async () => {
    const billId = `${FIXTURE_PREFIX}bill-11`;
    const gp1Id = `${FIXTURE_PREFIX}gp-11a`;
    const gp2Id = `${FIXTURE_PREFIX}gp-11b`;
    await seedTestBill(billId, "TNS-B58-11");

    await dispatchBill(billId, gp1Id, "TNGP-B58-11A", { id: BILLING_USER_ID, name: "Billing Actor", role: "BILLING" });

    // Attempt second dispatch with allowAdditionalDispatch: true as BILLING role
    await assert.rejects(
      async () => {
        await testStore.createGatePass({
          id: gp2Id,
          gatePassNumber: "TNGP-B58-11B",
          companyId: COMPANY_ID,
          customerId: CUSTOMER_ID,
          customerName: "Batch 5.8 Customer Ltd",
          billId,
          expectedReturnDate: "2026-11-15",
          destinationBranch: "Main Site",
          destinationAddress: "Vellore Complex",
          items: [{ productId: PROD_1_ID, itemName: "Heavy Scaffolding Pipe 3m", quantityDispatched: 5 }],
          allowAdditionalDispatch: true,
          actor: { id: BILLING_USER_ID, name: "Billing Actor", role: "BILLING" },
        });
      },
      /Additional dispatches require ADMIN or OWNER authorization/
    );

    const count = await appPool.query(`SELECT count(*) as cnt FROM public.gate_passes WHERE id = $1`, [gp2Id]);
    assert.equal(Number(count.rows[0].cnt), 0);
  });

  it("12. Malformed allowAdditionalDispatch (string 'true' or truthy object) is rejected", async () => {
    const billId = `${FIXTURE_PREFIX}bill-12`;
    const gp1Id = `${FIXTURE_PREFIX}gp-12a`;
    const gp2Id = `${FIXTURE_PREFIX}gp-12b`;
    await seedTestBill(billId, "TNS-B58-12");

    await dispatchBill(billId, gp1Id, "TNGP-B58-12A", { id: ADMIN_USER_ID, name: "Admin Actor", role: "ADMIN" });

    // Attempt second dispatch with string "true" instead of boolean true
    await assert.rejects(
      async () => {
        await testStore.createGatePass({
          id: gp2Id,
          gatePassNumber: "TNGP-B58-12B",
          companyId: COMPANY_ID,
          customerId: CUSTOMER_ID,
          customerName: "Batch 5.8 Customer Ltd",
          billId,
          expectedReturnDate: "2026-11-15",
          destinationBranch: "Main Site",
          destinationAddress: "Vellore Complex",
          items: [{ productId: PROD_1_ID, itemName: "Heavy Scaffolding Pipe 3m", quantityDispatched: 5 }],
          allowAdditionalDispatch: "true" as any,
          actor: { id: ADMIN_USER_ID, name: "Admin Actor", role: "ADMIN" },
        });
      },
      /Additional dispatches require ADMIN or OWNER authorization with explicit allowAdditionalDispatch flag/
    );

    const count = await appPool.query(`SELECT count(*) as cnt FROM public.gate_passes WHERE id = $1`, [gp2Id]);
    assert.equal(Number(count.rows[0].cnt), 0);
  });

  it("13. Authorized user (ADMIN / SUPER_ADMIN) with strict allowAdditionalDispatch: true succeeds", async () => {
    const billId = `${FIXTURE_PREFIX}bill-13`;
    const gp1Id = `${FIXTURE_PREFIX}gp-13a`;
    const gp2Id = `${FIXTURE_PREFIX}gp-13b`;
    await seedTestBill(billId, "TNS-B58-13");

    await dispatchBill(billId, gp1Id, "TNGP-B58-13A", { id: ADMIN_USER_ID, name: "Admin Actor", role: "ADMIN" });

    // Authorized second dispatch
    const gp2 = await testStore.createGatePass({
      id: gp2Id,
      gatePassNumber: "TNGP-B58-13B",
      companyId: COMPANY_ID,
      customerId: CUSTOMER_ID,
      customerName: "Batch 5.8 Customer Ltd",
      billId,
      expectedReturnDate: "2026-11-15",
      destinationBranch: "Main Site",
      destinationAddress: "Vellore Complex",
      items: [{ productId: PROD_1_ID, itemName: "Heavy Scaffolding Pipe 3m", quantityDispatched: 5 }],
      allowAdditionalDispatch: true,
      actor: { id: ADMIN_USER_ID, name: "Admin Actor", role: "ADMIN" },
    });

    assert.ok(gp2.id);
    const count = await appPool.query(`SELECT count(*) as cnt FROM public.gate_passes WHERE bill_id = $1`, [billId]);
    assert.equal(Number(count.rows[0].cnt), 2, "Bill must now have 2 gate passes");
  });

  // --------------------------------------------------------------------------
  // Step 4 Tests — Empty Return Record Rejection
  // --------------------------------------------------------------------------

  it("14. recordReturn with missing or empty items is rejected and inserts zero records", async () => {
    const billId = `${FIXTURE_PREFIX}bill-14`;
    await seedTestBill(billId, "TNS-B58-14");

    const countBefore = await appPool.query(`SELECT count(*) as cnt FROM public.returns`);

    // Empty array
    await assert.rejects(
      async () => {
        await testStore.recordReturn({
          billId,
          items: [],
        });
      },
      /Cannot record return: At least one return item must be provided/
    );

    // Missing items property
    await assert.rejects(
      async () => {
        await testStore.recordReturn({
          billId,
        });
      },
      /Cannot record return: At least one return item must be provided/
    );

    // Verify public.returns table contains zero new records
    const countAfter = await appPool.query(`SELECT count(*) as cnt FROM public.returns`);
    assert.equal(Number(countAfter.rows[0].cnt), Number(countBefore.rows[0].cnt), "No return headers must be inserted for empty returns");
  });
});
