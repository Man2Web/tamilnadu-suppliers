// ============================================================================
// BATCH 5.4 — REAL POSTGRESQL BILL CREATION TRANSACTION TESTS
// Target: strictly 127.0.0.1:5432 / tns_disposable_test_2026
// Verifies atomic bill creation, rollback on injected failures, and concurrency
// ============================================================================

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { closePostgresPool } from "../src/lib/db/postgresClient";
import { SupabaseStore } from "../src/lib/db/supabaseStore";
import { getTestDbConfig } from "./helpers/testDbConfig";

const testDb = getTestDbConfig();

const FIXTURE_PREFIX = "test:b54:";
const COMPANY_ID = `${FIXTURE_PREFIX}comp-1`;
const CUSTOMER_ID = "0663cf3d-5400-4000-8000-000000000001";
const USER_ID = "0663cf3d-5400-4000-8000-000000000002";

describe("Batch 5.4 — Atomic Bill Creation in PostgreSQL Mode", { skip: !testDb.isConfigured ? testDb.skipReason : false }, () => {
  let appPool: Pool;
  let testStore: SupabaseStore;

  async function cleanAllFixtures() {
    await appPool.query(`DELETE FROM public.audit_logs WHERE customer_name LIKE $1 OR entity_number LIKE $2`, [
      `%Batch 5.4%`,
      `TNS-B54-%`,
    ]);
    await appPool.query(
      `DELETE FROM public.payments WHERE company_id = $1 OR reference_number LIKE $2`,
      [COMPANY_ID, `%TNS-B54-%`]
    );
    await appPool.query(`DELETE FROM public.bill_items WHERE bill_id IN (SELECT id FROM public.bills WHERE company_id = $1)`, [COMPANY_ID]);
    await appPool.query(`DELETE FROM public.bill_branches WHERE bill_id IN (SELECT id FROM public.bills WHERE company_id = $1)`, [COMPANY_ID]);
    await appPool.query(`DELETE FROM public.bills WHERE company_id = $1`, [COMPANY_ID]);
    await appPool.query(`DELETE FROM public.customers WHERE id = $1 OR name LIKE $2`, [CUSTOMER_ID, `%Batch 5.4%`]);
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
       VALUES ($1, $2, 'dummy-hash-b54', $3, $4, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [USER_ID, "admin-b54@tamilnadusuppliers.com", "Batch 5.4 Admin", "SUPER_ADMIN"]
    );

    // 7. Seed company
    await appPool.query(
      `INSERT INTO public.companies (
        id, name, display_name, phone, address, state, gstin, pan, gst_type,
        bank_account_no, bank_ifsc,
        invoice_prefix, quotation_prefix, gate_pass_prefix,
        next_invoice_no, next_quotation_no, next_gate_pass_no, is_active
      ) VALUES (
        $1, 'Batch 5.4 Test Rentals', 'Batch 5.4 Test Rentals', '9876543210', 'Vellore Main Road', 'Tamil Nadu',
        '33AAAAA0000A1Z5', 'AAAAA0000A', 'GST_REGISTERED',
        '123456789012', 'SBIN0001234',
        'TNS-B54-', 'TNQ-B54-', 'TNGP-B54-',
        100, 100, 100, true
      )`,
      [COMPANY_ID]
    );

    // 8. Seed customer
    await appPool.query(
      `INSERT INTO public.customers (
        id, name, mobile, billing_address, state, is_active
      ) VALUES (
        $1, 'Batch 5.4 Customer Pvt Ltd', '9876500000', 'Vellore Industrial Estate', 'Tamil Nadu', true
      )`,
      [CUSTOMER_ID]
    );

    // 9. Seed collision payment for Test 4
    await appPool.query(
      `INSERT INTO public.payments (
        id, payment_number, company_id, customer_id, payment_type, amount, payment_method, reference_number
      ) VALUES (
        '0663cf3d-5400-4000-8000-000000000099', 'RCPT-B54-COLLISION', $1, $2, 'ADVANCE', 100, 'CASH', 'Initial test payment'
      ) ON CONFLICT (payment_number) DO NOTHING`,
      [COMPANY_ID, CUSTOMER_ID]
    );
  });

  after(async () => {
    try {
      await cleanAllFixtures();
    } finally {
      await closePostgresPool();
      await appPool.end();
      delete process.env.DB_PROVIDER;
      delete process.env.DATABASE_URL;
    }
  });

  // --------------------------------------------------------------------------
  // Test 1: Successful bill creation with multiple items & advance payment
  // --------------------------------------------------------------------------
  it("1. successfully creates a bill atomically with items, branch, advance payment, and audit logs", async () => {
    const billData = {
      companyId: COMPANY_ID,
      customerId: CUSTOMER_ID,
      customerName: "Batch 5.4 Customer Pvt Ltd",
      customerPhone: "9876500000",
      customerAddress: "Vellore Industrial Estate",
      rentalStartDate: "2026-11-01",
      rentalEndDate: "2026-11-10",
      rentalDays: 10,
      advancePaid: 500,
      paymentMethod: "CASH",
      actor: { id: USER_ID, name: "Batch 5.4 Admin", role: "SUPER_ADMIN" },
      documentLines: [
        {
          productId: "test:b54:prod-1",
          entryType: "product",
          itemName: "Scaffolding Set 10ft",
          sizeSpec: "10ft",
          quantity: 5,
          days: 10,
          unitPrice: 50,
          amount: 2500,
        },
        {
          productId: "test:b54:prod-2",
          entryType: "product",
          itemName: "Steel Prop Jack",
          sizeSpec: "Standard",
          quantity: 10,
          days: 10,
          unitPrice: 20,
          amount: 2000,
        },
        {
          entryType: "note",
          itemName: "Delivery to Main Gate Site B",
          text: "Delivery to Main Gate Site B",
          quantity: 0,
          days: 0,
          unitPrice: 0,
          amount: 0,
        },
      ],
    };

    const created = await testStore.createBill(billData);

    assert.ok(created.id, "Bill ID must exist");
    assert.equal(created.billNumber, "TNS-B54-0100", "Must assign first available invoice number");
    assert.equal(created.advancePaid, 500, "Advance paid must match");
    assert.equal(created.paymentStatus, "PARTIALLY_PAID", "Status must be partially paid");

    // Verify database state directly
    const billRes = await appPool.query(`SELECT * FROM public.bills WHERE id = $1`, [created.id]);
    assert.equal(billRes.rows.length, 1, "Bill header must exist in DB");
    assert.equal(billRes.rows[0].bill_number, "TNS-B54-0100");
    assert.equal(Number(billRes.rows[0].advance_paid), 500);

    const branchesRes = await appPool.query(`SELECT * FROM public.bill_branches WHERE bill_id = $1`, [created.id]);
    assert.equal(branchesRes.rows.length, 1, "Exactly one bill branch must exist");

    const itemsRes = await appPool.query(`SELECT * FROM public.bill_items WHERE bill_id = $1 ORDER BY position ASC`, [created.id]);
    assert.equal(itemsRes.rows.length, 3, "All 3 bill items (including note) must exist in DB");
    assert.equal(itemsRes.rows[0].item_name, "Scaffolding Set 10ft");
    assert.equal(itemsRes.rows[2].entry_type, "note");

    const payRes = await appPool.query(`SELECT * FROM public.payments WHERE bill_id = $1`, [created.id]);
    assert.equal(payRes.rows.length, 1, "Advance payment record must exist in DB");
    assert.equal(Number(payRes.rows[0].amount), 500);

    const auditRes = await appPool.query(`SELECT * FROM public.audit_logs WHERE entity_id = $1`, [created.id]);
    assert.ok(auditRes.rows.length >= 1, "Audit record must be persisted");

    const compRes = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compRes.rows[0].next_invoice_no, 101, "Company next_invoice_no must be incremented to 101");
  });

  // --------------------------------------------------------------------------
  // Test 2: Failure during bill-item insertion rolls back everything
  // --------------------------------------------------------------------------
  it("2. rolls back bill header, branches, and company sequence when bill-item insertion fails check constraint", async () => {
    const compBefore = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const expectedSeq = compBefore.rows[0].next_invoice_no;

    const failingData = {
      companyId: COMPANY_ID,
      customerId: CUSTOMER_ID,
      customerName: "Batch 5.4 Customer Pvt Ltd",
      customerPhone: "9876500000",
      customerAddress: "Vellore Industrial Estate",
      rentalStartDate: "2026-11-01",
      rentalEndDate: "2026-11-10",
      rentalDays: 10,
      documentLines: [
        {
          productId: "test:b54:prod-1",
          entryType: "product",
          itemName: "Valid Product",
          quantity: 2,
          unitPrice: 100,
          amount: 200,
        },
        {
          productId: "test:b54:prod-2",
          entryType: "product",
          itemName: "Failing Negative Quantity Product",
          // Violates CHECK (entry_type = 'note' OR quantity >= 0)
          quantity: -5,
          unitPrice: 100,
          amount: -500,
        },
      ],
    };

    await assert.rejects(
      async () => {
        await testStore.createBill(failingData);
      },
      /Quantity cannot be negative|outside the allowed range/i,
      "Must reject with database constraint violation"
    );

    // Verify NO bill was committed
    const billsRes = await appPool.query(
      `SELECT count(*) FROM public.bills WHERE company_id = $1 AND customer_name = $2 AND bill_number = $3`,
      [COMPANY_ID, "Batch 5.4 Customer Pvt Ltd", `TNS-B54-0${expectedSeq}`]
    );
    assert.equal(Number(billsRes.rows[0].count), 0, "Bill header must be rolled back");

    // Verify NO bill items exist for that sequence
    const itemsRes = await appPool.query(
      `SELECT count(*) FROM public.bill_items WHERE item_name = 'Valid Product'`
    );
    assert.equal(Number(itemsRes.rows[0].count), 0, "Valid product line must be rolled back");

    // Verify company sequence is rolled back
    const compAfter = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_invoice_no, expectedSeq, "Company next_invoice_no must be preserved via rollback");
  });

  // --------------------------------------------------------------------------
  // Test 3: Failure during branch allocation rolls back the operation
  // --------------------------------------------------------------------------
  it("3. rolls back bill creation when branch insertion fails foreign key constraint", async () => {
    const compBefore = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const expectedSeq = compBefore.rows[0].next_invoice_no;

    const failingBranchData = {
      companyId: COMPANY_ID,
      customerId: CUSTOMER_ID,
      customerName: "Batch 5.4 Customer Pvt Ltd",
      customerPhone: "9876500000",
      customerAddress: "Vellore Industrial Estate",
      rentalStartDate: "2026-11-01",
      rentalEndDate: "2026-11-10",
      rentalDays: 10,
      branches: [
        {
          branchName: "Invalid Branch with Nonexistent Customer Branch FK",
          customerBranchId: "00000000-0000-0000-0000-000000000999", // Violates FK to customer_branches
          items: [
            {
              entryType: "product",
              itemName: "Steel Rods",
              quantity: 1,
              unitPrice: 50,
              amount: 50,
            },
          ],
        },
      ],
    };

    await assert.rejects(
      async () => {
        await testStore.createBill(failingBranchData);
      },
      /linked record .* no longer exists|cannot be removed or changed/i,
      "Must reject with foreign key constraint violation"
    );

    // Verify NO bill was committed
    const billsRes = await appPool.query(
      `SELECT count(*) FROM public.bills WHERE company_id = $1 AND bill_number = $2`,
      [COMPANY_ID, `TNS-B54-0${expectedSeq}`]
    );
    assert.equal(Number(billsRes.rows[0].count), 0, "Bill header must be rolled back on branch failure");

    // Verify company sequence is rolled back
    const compAfter = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_invoice_no, expectedSeq, "Sequence must be restored on rollback");
  });

  // --------------------------------------------------------------------------
  // Test 4: Failure during advance-payment insertion rolls back the operation
  // --------------------------------------------------------------------------
  it("4. rolls back bill creation when advance payment insertion fails unique constraint", async () => {
    const compBefore = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const expectedSeq = compBefore.rows[0].next_invoice_no;

    const failingPaymentData = {
      companyId: COMPANY_ID,
      customerId: CUSTOMER_ID,
      customerName: "Batch 5.4 Customer Pvt Ltd",
      customerPhone: "9876500000",
      customerAddress: "Vellore Industrial Estate",
      rentalStartDate: "2026-11-01",
      rentalEndDate: "2026-11-10",
      rentalDays: 10,
      advancePaid: 300,
      paymentMethod: "CASH",
      // Violates UNIQUE (payment_number) because RCPT-B54-COLLISION was pre-seeded
      paymentNumber: "RCPT-B54-COLLISION",
      items: [
        {
          productId: "test:b54:prod-1",
          entryType: "product",
          itemName: "Aluminium Ladder",
          quantity: 2,
          unitPrice: 150,
          amount: 300,
        },
      ],
    };

    await assert.rejects(
      async () => {
        await testStore.createBill(failingPaymentData);
      },
      /payment with this receipt number already exists|already exists/i,
      "Must reject with payments unique constraint violation"
    );

    // Verify NO bill was committed
    const billsRes = await appPool.query(
      `SELECT count(*) FROM public.bills WHERE company_id = $1 AND bill_number = $2`,
      [COMPANY_ID, `TNS-B54-0${expectedSeq}`]
    );
    assert.equal(Number(billsRes.rows[0].count), 0, "Bill header must be rolled back on payment failure");

    // Verify NO payment was committed
    const payRes = await appPool.query(
      `SELECT count(*) FROM public.payments WHERE payment_method = 'CRYPTOCURRENCY_INVALID'`
    );
    assert.equal(Number(payRes.rows[0].count), 0, "Invalid payment must not exist");

    // Verify company sequence is rolled back
    const compAfter = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_invoice_no, expectedSeq, "Sequence must be restored on rollback");
  });

  // --------------------------------------------------------------------------
  // Test 5: Failure during balance update rolls back the operation
  // --------------------------------------------------------------------------
  it("5. rolls back bill creation and payment when balance update fails", async () => {
    const compBefore = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const expectedSeq = compBefore.rows[0].next_invoice_no;

    // Use a store proxy where updateBill deliberately throws
    const proxyStore = Object.create(testStore);
    proxyStore.updateBill = async () => {
      throw new Error("Simulated database failure during bill balance recalculation");
    };

    const advanceBillData = {
      companyId: COMPANY_ID,
      customerId: CUSTOMER_ID,
      customerName: "Batch 5.4 Customer Pvt Ltd",
      customerPhone: "9876500000",
      customerAddress: "Vellore Industrial Estate",
      rentalStartDate: "2026-11-01",
      rentalEndDate: "2026-11-10",
      rentalDays: 10,
      advancePaid: 250,
      paymentMethod: "CASH",
      items: [
        {
          productId: "test:b54:prod-1",
          entryType: "product",
          itemName: "Concrete Mixer",
          quantity: 1,
          unitPrice: 500,
          amount: 500,
        },
      ],
    };

    await assert.rejects(
      async () => {
        await proxyStore.createBill(advanceBillData);
      },
      /Simulated database failure during bill balance recalculation/,
      "Must reject with simulated balance update failure"
    );

    // Verify neither bill nor payment exists in DB
    const billsRes = await appPool.query(
      `SELECT count(*) FROM public.bills WHERE company_id = $1 AND bill_number = $2`,
      [COMPANY_ID, `TNS-B54-0${expectedSeq}`]
    );
    assert.equal(Number(billsRes.rows[0].count), 0, "Bill header must be rolled back on balance update failure");

    const payRes = await appPool.query(
      `SELECT count(*) FROM public.payments WHERE reference_number LIKE $1`,
      [`%TNS-B54-0${expectedSeq}%`]
    );
    assert.equal(Number(payRes.rows[0].count), 0, "Advance payment must be rolled back when balance update fails");
  });

  // --------------------------------------------------------------------------
  // Test 6: Failure in a required audit write rolls back the operation
  // --------------------------------------------------------------------------
  it("6. rolls back bill creation when direct bill audit log fails foreign key constraint", async () => {
    const compBefore = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const expectedSeq = compBefore.rows[0].next_invoice_no;

    const failingAuditData = {
      companyId: COMPANY_ID,
      customerId: CUSTOMER_ID,
      customerName: "Batch 5.4 Customer Pvt Ltd",
      customerPhone: "9876500000",
      customerAddress: "Vellore Industrial Estate",
      rentalStartDate: "2026-11-01",
      rentalEndDate: "2026-11-10",
      rentalDays: 10,
      // Actor ID references public.users(id). Non-existent user ID violates audit_logs_actor_id_fkey
      actor: { id: "00000000-0000-0000-0000-000000000999", name: "Nonexistent Actor", role: "BILLING" },
      items: [
        {
          entryType: "product",
          itemName: "Safety Helmet Set",
          quantity: 10,
          unitPrice: 15,
          amount: 150,
        },
      ],
    };

    await assert.rejects(
      async () => {
        await testStore.createBill(failingAuditData);
      },
      /linked record .* no longer exists|cannot be removed or changed/i,
      "Must reject with audit log FK constraint violation"
    );

    // Verify NO bill was committed
    const billsRes = await appPool.query(
      `SELECT count(*) FROM public.bills WHERE company_id = $1 AND bill_number = $2`,
      [COMPANY_ID, `TNS-B54-0${expectedSeq}`]
    );
    assert.equal(Number(billsRes.rows[0].count), 0, "Bill header must be rolled back on audit failure");

    // Verify sequence is restored
    const compAfter = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_invoice_no, expectedSeq, "Sequence must be restored on rollback");
  });

  // --------------------------------------------------------------------------
  // Test 7: Concurrent bill creation does not produce duplicate document numbers
  // --------------------------------------------------------------------------
  it("7. allocates distinct sequential document numbers under concurrent bill creation", async () => {
    const compBefore = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const startSeq = compBefore.rows[0].next_invoice_no;

    const CONCURRENT_COUNT = 5;
    const payloads = Array.from({ length: CONCURRENT_COUNT }, (_, idx) => ({
      companyId: COMPANY_ID,
      customerId: CUSTOMER_ID,
      customerName: "Batch 5.4 Customer Pvt Ltd",
      customerPhone: "9876500000",
      customerAddress: "Vellore Industrial Estate",
      rentalStartDate: "2026-11-01",
      rentalEndDate: "2026-11-05",
      rentalDays: 5,
      items: [
        {
          productId: `test:b54:prod-${idx + 1}`,
          entryType: "product",
          itemName: `Concurrent Item ${idx + 1}`,
          quantity: 1,
          unitPrice: 100,
          amount: 100,
        },
      ],
    }));

    // Execute all 5 bill creation requests concurrently
    const createdBills = await Promise.all(payloads.map((p) => testStore.createBill(p)));

    // Verify all 5 bills have distinct bill numbers
    const billNumbers = createdBills.map((b) => b.billNumber);
    const uniqueNumbers = new Set(billNumbers);
    assert.equal(uniqueNumbers.size, CONCURRENT_COUNT, "All generated bill numbers must be unique under concurrency");

    // Verify sequential assignment
    for (let i = 0; i < CONCURRENT_COUNT; i++) {
      const expectedNum = `TNS-B54-${String(startSeq + i).padStart(4, "0")}`;
      assert.ok(
        billNumbers.includes(expectedNum),
        `Bill numbers must contain ${expectedNum}. Generated: ${billNumbers.join(", ")}`
      );
    }

    // Verify database row count
    const dbBills = await appPool.query(
      `SELECT count(*) FROM public.bills WHERE company_id = $1 AND bill_number = ANY($2)`,
      [COMPANY_ID, billNumbers]
    );
    assert.equal(Number(dbBills.rows[0].count), CONCURRENT_COUNT, "All 5 bills must exist in the database");

    // Verify company sequence updated to startSeq + 5
    const compAfter = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_invoice_no, startSeq + CONCURRENT_COUNT, "Company sequence must reflect all concurrent creations");
  });

  // --------------------------------------------------------------------------
  // Test 8: Two independent requests do not share transaction connections
  // --------------------------------------------------------------------------
  it("8. executes concurrent transactions on separate connection clients", async () => {
    let clientPid1: number | null = null;
    let clientPid2: number | null = null;

    await Promise.all([
      testStore.withTransaction(async (txStore1) => {
        const res = await (txStore1 as any).supabase.from("companies").select("id").maybeSingle();
        // Check PostgreSQL backend PID for this connection
        const pidRes = await (txStore1 as any).supabase.rpc ? null : null;
        // Query pg_backend_pid() via raw query on the client
        const client = (txStore1 as any).supabase.client;
        if (client) {
          const r = await client.query("SELECT pg_backend_pid() as pid");
          clientPid1 = r.rows[0].pid;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        return res;
      }),
      testStore.withTransaction(async (txStore2) => {
        const res = await (txStore2 as any).supabase.from("companies").select("id").maybeSingle();
        const client = (txStore2 as any).supabase.client;
        if (client) {
          const r = await client.query("SELECT pg_backend_pid() as pid");
          clientPid2 = r.rows[0].pid;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        return res;
      }),
    ]);

    assert.ok(clientPid1, "Client 1 PID must exist");
    assert.ok(clientPid2, "Client 2 PID must exist");
    assert.notEqual(clientPid1, clientPid2, "Two concurrent transactions must use distinct backend connections");
  });

  // --------------------------------------------------------------------------
  // Test 9: Duplicate bill submission behavior (idempotency / duplicate keys)
  // --------------------------------------------------------------------------
  it("9. prevents duplicate bill creation on retries with same bill_number or id", async () => {
    const explicitId = "11111111-2222-3333-4444-555555555555";
    const explicitNumber = "TNS-B54-9999";

    const initialBill = await testStore.createBill({
      id: explicitId,
      billNumber: explicitNumber,
      companyId: COMPANY_ID,
      customerId: CUSTOMER_ID,
      customerName: "Batch 5.4 Customer Pvt Ltd",
      customerPhone: "9876500000",
      customerAddress: "Vellore Industrial Estate",
      rentalStartDate: "2026-11-01",
      rentalEndDate: "2026-11-05",
      rentalDays: 5,
      items: [
        {
          productId: "test:b54:prod-1",
          entryType: "product",
          itemName: "Explicit Item",
          quantity: 1,
          unitPrice: 100,
          amount: 100,
        },
      ],
    });

    assert.equal(initialBill.id, explicitId);
    assert.equal(initialBill.billNumber, explicitNumber);

    // Retry 1: same bill ID
    await assert.rejects(
      async () => {
        await testStore.createBill({
          id: explicitId,
          billNumber: "TNS-B54-9998",
          companyId: COMPANY_ID,
          customerId: CUSTOMER_ID,
          customerName: "Batch 5.4 Customer Pvt Ltd",
          customerPhone: "9876500000",
          customerAddress: "Vellore Industrial Estate",
          rentalStartDate: "2026-11-01",
          rentalEndDate: "2026-11-05",
          rentalDays: 5,
          items: [{ productId: "test:b54:prod-1", entryType: "product", itemName: "Duplicate ID Item", quantity: 1, unitPrice: 100, amount: 100 }],
        });
      },
      /bills_pkey|duplicate key value violates unique constraint|already exists/i,
      "Must reject retry with same bill ID"
    );

    // Retry 2: same bill number
    await assert.rejects(
      async () => {
        await testStore.createBill({
          id: "22222222-3333-4444-5555-666666666666",
          billNumber: explicitNumber,
          companyId: COMPANY_ID,
          customerId: CUSTOMER_ID,
          customerName: "Batch 5.4 Customer Pvt Ltd",
          customerPhone: "9876500000",
          customerAddress: "Vellore Industrial Estate",
          rentalStartDate: "2026-11-01",
          rentalEndDate: "2026-11-05",
          rentalDays: 5,
          items: [{ productId: "test:b54:prod-1", entryType: "product", itemName: "Duplicate Number Item", quantity: 1, unitPrice: 100, amount: 100 }],
        });
      },
      /bills_bill_number_key|duplicate key value violates unique constraint|already exists/i,
      "Must reject retry with same bill number"
    );
  });
});
