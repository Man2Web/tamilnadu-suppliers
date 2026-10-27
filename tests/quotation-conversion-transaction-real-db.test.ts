// ============================================================================
// BATCH 5.5 — REAL POSTGRESQL ATOMIC QUOTATION CONVERSION TESTS
// Target: strictly 127.0.0.1:5432 / tns_disposable_test_2026 / tns_app_user
// Verifies atomic quotation-to-bill conversion, row locking, rollback, and concurrency
// ============================================================================

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { closePostgresPool } from "../src/lib/db/postgresClient";
import { SupabaseStore } from "../src/lib/db/supabaseStore";
import { getTestDbConfig } from "./helpers/testDbConfig";

const testDb = getTestDbConfig();

const FIXTURE_PREFIX = "test:b55:";
const COMPANY_ID = `${FIXTURE_PREFIX}comp-1`;
const CUSTOMER_ID = "0663cf3d-5500-4000-8000-000000000001";
const USER_ID = "0663cf3d-5500-4000-8000-000000000002";

describe("Batch 5.5 — Atomic Quotation-to-Bill Conversion in PostgreSQL Mode", { skip: !testDb.isConfigured ? testDb.skipReason : false }, () => {
  let appPool: Pool;
  let testStore: SupabaseStore;

  async function cleanAllFixtures() {
    await appPool.query(
      `DELETE FROM public.audit_logs WHERE customer_name LIKE $1 OR entity_number LIKE $2 OR entity_number LIKE $3`,
      [`%Batch 5.5%`, `TNS-B55-%`, `TNQ-B55-%`]
    );
    await appPool.query(
      `DELETE FROM public.payments WHERE company_id = $1 OR reference_number LIKE $2`,
      [COMPANY_ID, `%TNS-B55-%`]
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
    await appPool.query(
      `DELETE FROM public.quotation_items WHERE quotation_id IN (SELECT id FROM public.quotations WHERE company_id = $1)`,
      [COMPANY_ID]
    );
    await appPool.query(
      `DELETE FROM public.quotation_branches WHERE quotation_id IN (SELECT id FROM public.quotations WHERE company_id = $1)`,
      [COMPANY_ID]
    );
    await appPool.query(`DELETE FROM public.quotations WHERE company_id = $1`, [COMPANY_ID]);
    await appPool.query(`DELETE FROM public.customers WHERE id = $1 OR name LIKE $2`, [CUSTOMER_ID, `%Batch 5.5%`]);
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
       VALUES ($1, $2, 'dummy-hash-b55', $3, $4, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [USER_ID, "admin-b55@tamilnadusuppliers.com", "Batch 5.5 Admin", "SUPER_ADMIN"]
    );

    // 7. Seed company
    await appPool.query(
      `INSERT INTO public.companies (
        id, name, display_name, phone, address, state, gstin, pan, gst_type,
        bank_account_no, bank_ifsc,
        invoice_prefix, quotation_prefix, gate_pass_prefix,
        next_invoice_no, next_quotation_no, next_gate_pass_no, is_active
      ) VALUES (
        $1, 'Batch 5.5 Test Rentals', 'Batch 5.5 Test Rentals', '9876543210', 'Vellore Main Road', 'Tamil Nadu',
        '33AAAAA0000A1Z5', 'AAAAA0000A', 'GST_REGISTERED',
        '123456789012', 'SBIN0001234',
        'TNS-B55-', 'TNQ-B55-', 'TNGP-B55-',
        200, 100, 100, true
      )`,
      [COMPANY_ID]
    );

    // 8. Seed customer
    await appPool.query(
      `INSERT INTO public.customers (
        id, name, mobile, billing_address, state, is_active
      ) VALUES (
        $1, 'Batch 5.5 Customer Pvt Ltd', '9876511111', 'Vellore Industrial Estate Phase 2', 'Tamil Nadu', true
      )`,
      [CUSTOMER_ID]
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

  // Helper to seed quotations in test database
  async function seedQuotation(params: {
    id: string;
    quotationNumber: string;
    status?: string;
    advanceRequired?: number;
    lines?: any[];
  }) {
    const qStatus = params.status || "ACCEPTED";
    const adv = params.advanceRequired !== undefined ? params.advanceRequired : 500;
    const branchId = `${params.id}:branch-1`;

    await appPool.query(
      `INSERT INTO public.quotations (
        id, quotation_number, company_id, company_snapshot,
        customer_id, customer_name, customer_phone, customer_address,
        quotation_date, rental_start_date, rental_end_date, rental_days,
        status, tax_type, subtotal, grand_total, advance_required, amount_in_words
      ) VALUES (
        $1, $2, $3, $4::jsonb,
        $5, 'Batch 5.5 Customer Pvt Ltd', '9876511111', 'Vellore Industrial Estate Phase 2',
        CURRENT_DATE, '2026-11-01', '2026-11-10', 10,
        $6, 'GST', 4500.00, 5310.00, $7, 'Five Thousand Three Hundred Ten Only'
      )`,
      [
        params.id,
        params.quotationNumber,
        COMPANY_ID,
        JSON.stringify({ name: "Batch 5.5 Test Rentals", gstin: "33AAAAA0000A1Z5" }),
        CUSTOMER_ID,
        qStatus,
        adv,
      ]
    );

    await appPool.query(
      `INSERT INTO public.quotation_branches (
        id, quotation_id, branch_name, delivery_address, section_order, branch_subtotal
      ) VALUES (
        $1, $2, 'Main Site', 'Vellore Industrial Estate Phase 2', 1, 4500.00
      )`,
      [branchId, params.id]
    );

    const lines = params.lines || [
      {
        id: `${params.id}:item-1`,
        productId: "test:b55:prod-1",
        entryType: "product",
        itemName: "Heavy Duty Scaffolding",
        quantity: 5,
        days: 10,
        unitPrice: 50,
        amount: 2500,
      },
      {
        id: `${params.id}:item-2`,
        productId: "test:b55:prod-2",
        entryType: "product",
        itemName: "Steel Acrow Span",
        quantity: 10,
        days: 10,
        unitPrice: 20,
        amount: 2000,
      },
      {
        id: `${params.id}:note-1`,
        entryType: "note",
        itemName: "Installation manual enclosed",
        text: "Installation manual enclosed",
        quantity: 0,
        days: 0,
        unitPrice: 0,
        amount: 0,
      },
    ];

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await appPool.query(
        `INSERT INTO public.quotation_items (
          id, quotation_id, quotation_branch_id, product_id, item_name,
          quantity, days, unit_price, amount, entry_type, position, text
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )`,
        [
          l.id || `${params.id}:line-${i + 1}`,
          params.id,
          branchId,
          l.productId || null,
          l.itemName,
          l.quantity,
          l.days,
          l.unitPrice,
          l.amount,
          l.entryType || "product",
          i + 1,
          l.text || null,
        ]
      );
    }
  }

  // --------------------------------------------------------------------------
  // Test 1: Successful conversion
  // --------------------------------------------------------------------------
  it("1. successfully converts quotation to bill atomically with items, payment, and audit logs", async () => {
    const quoteId = `${FIXTURE_PREFIX}quote-success-1`;
    await seedQuotation({
      id: quoteId,
      quotationNumber: "TNQ-B55-0101",
      status: "ACCEPTED",
      advanceRequired: 1000,
    });

    const bill = await testStore.convertQuotationToBill(quoteId, undefined, {
      advancePaid: 1000,
      paymentMethod: "CASH",
      actor: { id: USER_ID, name: "Batch 5.5 Admin", role: "SUPER_ADMIN" },
    });

    assert.ok(bill.id, "Bill ID must be returned");
    assert.equal(bill.billNumber, "TNS-B55-0200", "Must receive company next_invoice_no");
    assert.equal(bill.sourceQuotationId, quoteId, "Bill must link back to source quotation");
    assert.equal(bill.advancePaid, 1000, "Advance paid must match");

    // Verify quotation row in PostgreSQL
    const quoteRes = await appPool.query(
      `SELECT status, converted_bill_id, converted_bill_number, converted_at FROM public.quotations WHERE id = $1`,
      [quoteId]
    );
    assert.equal(quoteRes.rows.length, 1);
    assert.equal(quoteRes.rows[0].status, "CONVERTED", "Quotation status must be CONVERTED");
    assert.equal(quoteRes.rows[0].converted_bill_id, bill.id, "converted_bill_id must match bill.id");
    assert.equal(quoteRes.rows[0].converted_bill_number, bill.billNumber, "converted_bill_number must match");
    assert.ok(quoteRes.rows[0].converted_at, "converted_at must be populated");

    // Verify bill row in PostgreSQL
    const billRes = await appPool.query(
      `SELECT id, bill_number, source_quotation_id, advance_paid FROM public.bills WHERE id = $1`,
      [bill.id]
    );
    assert.equal(billRes.rows.length, 1);
    assert.equal(billRes.rows[0].source_quotation_id, quoteId);

    // Verify bill items in PostgreSQL
    const itemsRes = await appPool.query(
      `SELECT id, item_name, entry_type, quantity FROM public.bill_items WHERE bill_id = $1 ORDER BY position`,
      [bill.id]
    );
    assert.equal(itemsRes.rows.length, 3, "Must insert all 3 document lines");
    assert.equal(itemsRes.rows[2].entry_type, "note", "Note line must be preserved");

    // Verify advance payment in PostgreSQL
    const paymentRes = await appPool.query(
      `SELECT payment_type, amount, payment_method FROM public.payments WHERE bill_id = $1`,
      [bill.id]
    );
    assert.equal(paymentRes.rows.length, 1, "Must record advance payment");
    assert.equal(Number(paymentRes.rows[0].amount), 1000);

    // Verify company next_invoice_no was incremented
    const compRes = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compRes.rows[0].next_invoice_no, 201, "next_invoice_no must increment by 1");

    // Verify audit logs
    const auditRes = await appPool.query(
      `SELECT action, entity_type, entity_id FROM public.audit_logs WHERE entity_id IN ($1, $2) ORDER BY created_at ASC`,
      [quoteId, bill.id]
    );
    const actions = auditRes.rows.map((r) => r.action);
    assert.ok(actions.includes("QUOTATION_CONVERTED"), "Must include QUOTATION_CONVERTED audit log");
    assert.ok(actions.includes("BILL_CREATED_FROM_QUOTE"), "Must include BILL_CREATED_FROM_QUOTE audit log");
    assert.ok(actions.includes("PAYMENT_RECORDED"), "Must include PAYMENT_RECORDED audit log for advance payment");
  });

  // --------------------------------------------------------------------------
  // Test 2: Failure during bill creation rolls back quotation status & invoice sequence
  // --------------------------------------------------------------------------
  it("2. rolls back quotation status and numbering when bill creation fails database constraint", async () => {
    const quoteId = `${FIXTURE_PREFIX}quote-fail-bill`;
    await seedQuotation({
      id: quoteId,
      quotationNumber: "TNQ-B55-0102",
      status: "ACCEPTED",
    });

    const compBefore = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const expectedSeq = compBefore.rows[0].next_invoice_no;

    // Inject invalid document lines violating bill_items_quantity_check (negative quantity on product)
    let threw = false;
    try {
      await testStore.convertQuotationToBill(quoteId, {
        branches: [
          {
            id: `${quoteId}:bad-branch`,
            branchName: "Failing Branch",
            items: [
              {
                id: `${quoteId}:bad-item`,
                productId: "test:b55:prod-neg",
                entryType: "product",
                itemName: "Violating Scaffolding Line",
                quantity: -999, // triggers CHECK (entry_type = 'note' OR quantity >= 0)
                days: 10,
                unitPrice: 50,
                amount: -49950,
              },
            ],
          },
        ],
      });
    } catch (err: any) {
      threw = true;
      assert.match(err.message, /check constraint|quantity_check|violat/i, "Must fail on quantity constraint");
    }
    assert.equal(threw, true, "Must throw on invalid bill item constraint");

    // Assert quotation was NOT marked CONVERTED
    const quoteCheck = await appPool.query(
      `SELECT status, converted_bill_id FROM public.quotations WHERE id = $1`,
      [quoteId]
    );
    assert.equal(quoteCheck.rows[0].status, "ACCEPTED", "Quotation status must remain ACCEPTED after rollback");
    assert.equal(quoteCheck.rows[0].converted_bill_id, null, "converted_bill_id must remain null");

    // Assert no bill was created
    const billCheck = await appPool.query(
      `SELECT count(*) as cnt FROM public.bills WHERE source_quotation_id = $1`,
      [quoteId]
    );
    assert.equal(Number(billCheck.rows[0].cnt), 0, "No bill must exist for failed quotation");

    // Assert company next_invoice_no was rolled back
    const compAfter = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_invoice_no, expectedSeq, "next_invoice_no must roll back to original value");
  });

  // --------------------------------------------------------------------------
  // Test 3: Failure during quotation status update rolls back newly created bill and items
  // --------------------------------------------------------------------------
  it("3. rolls back newly created bill and items when quotation status update fails", async () => {
    const quoteId = `${FIXTURE_PREFIX}quote-fail-update`;
    await seedQuotation({
      id: quoteId,
      quotationNumber: "TNQ-B55-0103",
      status: "ACCEPTED",
    });

    const compBefore = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const expectedSeq = compBefore.rows[0].next_invoice_no;

    // Use a proxy store to inject failure at the updateQuotation step
    const proxyStore = Object.create(testStore);
    proxyStore.updateQuotation = async () => {
      throw new Error("INJECTED_STATUS_UPDATE_FAILURE");
    };

    let threw = false;
    try {
      await proxyStore.convertQuotationToBill(quoteId);
    } catch (err: any) {
      threw = true;
      assert.match(err.message, /INJECTED_STATUS_UPDATE_FAILURE/);
    }
    assert.equal(threw, true, "Must throw on injected status update failure");

    // Assert bill was rolled back completely
    const billCheck = await appPool.query(
      `SELECT count(*) as cnt FROM public.bills WHERE source_quotation_id = $1`,
      [quoteId]
    );
    assert.equal(Number(billCheck.rows[0].cnt), 0, "Bill must be rolled back");

    // Assert quotation status remains ACCEPTED
    const quoteCheck = await appPool.query(
      `SELECT status, converted_bill_id FROM public.quotations WHERE id = $1`,
      [quoteId]
    );
    assert.equal(quoteCheck.rows[0].status, "ACCEPTED", "Quotation status must remain ACCEPTED");
    assert.equal(quoteCheck.rows[0].converted_bill_id, null);

    // Assert invoice sequence rolled back
    const compAfter = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_invoice_no, expectedSeq, "Invoice sequence must be preserved");
  });

  // --------------------------------------------------------------------------
  // Test 4: Failure during required audit logging rolls back the conversion
  // --------------------------------------------------------------------------
  it("4. rolls back the entire conversion when audit logging fails in transaction mode", async () => {
    const quoteId = `${FIXTURE_PREFIX}quote-fail-audit`;
    await seedQuotation({
      id: quoteId,
      quotationNumber: "TNQ-B55-0104",
      status: "ACCEPTED",
    });

    const compBefore = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const expectedSeq = compBefore.rows[0].next_invoice_no;

    // Use a proxy store to inject failure in recordAuditLog
    const proxyStore = Object.create(testStore);
    proxyStore.recordAuditLog = async () => {
      throw new Error("INJECTED_AUDIT_LOG_FAILURE");
    };

    let threw = false;
    try {
      await proxyStore.convertQuotationToBill(quoteId);
    } catch (err: any) {
      threw = true;
      assert.match(err.message, /INJECTED_AUDIT_LOG_FAILURE/);
    }
    assert.equal(threw, true, "Must throw on audit log failure");

    // Assert bill was rolled back
    const billCheck = await appPool.query(
      `SELECT count(*) as cnt FROM public.bills WHERE source_quotation_id = $1`,
      [quoteId]
    );
    assert.equal(Number(billCheck.rows[0].cnt), 0, "Bill must be rolled back on audit failure");

    // Assert quotation was NOT marked CONVERTED
    const quoteCheck = await appPool.query(
      `SELECT status, converted_bill_id FROM public.quotations WHERE id = $1`,
      [quoteId]
    );
    assert.equal(quoteCheck.rows[0].status, "ACCEPTED");
    assert.equal(quoteCheck.rows[0].converted_bill_id, null);

    // Assert sequence rolled back
    const compAfter = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_invoice_no, expectedSeq);
  });

  // --------------------------------------------------------------------------
  // Test 5: Two concurrent requests converting the same quotation produce exactly one bill
  // --------------------------------------------------------------------------
  it("5. serializes concurrent conversion requests for the same quotation producing exactly one bill", async () => {
    const quoteId = `${FIXTURE_PREFIX}quote-concurrent`;
    await seedQuotation({
      id: quoteId,
      quotationNumber: "TNQ-B55-0105",
      status: "ACCEPTED",
      advanceRequired: 500,
    });

    // Two independent store instances
    const store1 = new SupabaseStore();
    const store2 = new SupabaseStore();

    // Launch simultaneous conversions
    const [res1, res2] = await Promise.allSettled([
      store1.convertQuotationToBill(quoteId, undefined, {
        advancePaid: 500,
        actor: { id: USER_ID, name: "Worker 1", role: "BILLING" },
      }),
      store2.convertQuotationToBill(quoteId, undefined, {
        advancePaid: 500,
        actor: { id: USER_ID, name: "Worker 2", role: "BILLING" },
      }),
    ]);

    const fulfilled = [res1, res2].filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
    const rejected = [res1, res2].filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    assert.equal(fulfilled.length, 1, "Exactly one conversion request must succeed");
    assert.equal(rejected.length, 1, "Exactly one conversion request must be rejected");

    assert.match(
      rejected[0].reason.message,
      /already converted/i,
      "Second request must receive clean 'already converted' error message"
    );

    // Verify database state: exactly ONE bill exists
    const billRes = await appPool.query(
      `SELECT id, bill_number, source_quotation_id FROM public.bills WHERE source_quotation_id = $1`,
      [quoteId]
    );
    assert.equal(billRes.rows.length, 1, "Exactly one bill must be persisted for this quotation");
    assert.equal(billRes.rows[0].id, fulfilled[0].value.id);

    // Verify quotation state in PostgreSQL
    const quoteRes = await appPool.query(
      `SELECT status, converted_bill_id FROM public.quotations WHERE id = $1`,
      [quoteId]
    );
    assert.equal(quoteRes.rows[0].status, "CONVERTED");
    assert.equal(quoteRes.rows[0].converted_bill_id, fulfilled[0].value.id);
  });

  // --------------------------------------------------------------------------
  // Test 6: Repeated conversion after success does not create another bill
  // --------------------------------------------------------------------------
  it("6. rejects repeated conversion of an already-converted quotation without creating another bill", async () => {
    const quoteId = `${FIXTURE_PREFIX}quote-success-1`; // Already converted in Test 1

    const compBefore = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const seqBefore = compBefore.rows[0].next_invoice_no;

    let threw = false;
    try {
      await testStore.convertQuotationToBill(quoteId);
    } catch (err: any) {
      threw = true;
      assert.match(err.message, /already converted/i);
    }
    assert.equal(threw, true, "Must reject converting already converted quotation");

    // Verify bill count remains exactly 1
    const billsCount = await appPool.query(
      `SELECT count(*) as cnt FROM public.bills WHERE source_quotation_id = $1`,
      [quoteId]
    );
    assert.equal(Number(billsCount.rows[0].cnt), 1, "Bill count must remain 1");

    // Verify sequence was not incremented
    const compAfter = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_invoice_no, seqBefore, "Sequence must not change on duplicate conversion");
  });

  // --------------------------------------------------------------------------
  // Test 7: Invoice numbering remains consistent after rollback
  // --------------------------------------------------------------------------
  it("7. maintains consistent invoice numbering without gaps after conversion rollback", async () => {
    const compBefore = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const expectedNumber = compBefore.rows[0].next_invoice_no;

    // Trigger rollback via failing quotation conversion
    const failQuoteId = `${FIXTURE_PREFIX}quote-seq-fail`;
    await seedQuotation({
      id: failQuoteId,
      quotationNumber: "TNQ-B55-0107-FAIL",
      status: "ACCEPTED",
    });

    const proxyStore = Object.create(testStore);
    proxyStore.updateQuotation = async () => {
      throw new Error("INJECTED_ROLLBACK_FOR_SEQ_TEST");
    };

    await assert.rejects(
      () => proxyStore.convertQuotationToBill(failQuoteId),
      /INJECTED_ROLLBACK_FOR_SEQ_TEST/
    );

    // Verify sequence is still expectedNumber
    const compMid = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compMid.rows[0].next_invoice_no, expectedNumber, "Sequence must not increment on rollback");

    // Now convert a valid quotation and assert it receives expectedNumber without gap
    const validQuoteId = `${FIXTURE_PREFIX}quote-seq-valid`;
    await seedQuotation({
      id: validQuoteId,
      quotationNumber: "TNQ-B55-0107-VALID",
      status: "ACCEPTED",
    });

    const bill = await testStore.convertQuotationToBill(validQuoteId);
    const expectedBillNumber = `TNS-B55-${String(expectedNumber).padStart(4, "0")}`;
    assert.equal(bill.billNumber, expectedBillNumber, "Bill must receive exact preserved sequence number");

    // Verify next sequence is expectedNumber + 1
    const compFinal = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compFinal.rows[0].next_invoice_no, expectedNumber + 1);
  });

  // --------------------------------------------------------------------------
  // Test 8: Ineligible quotation status (CANCELLED) is rejected cleanly
  // --------------------------------------------------------------------------
  it("8. rejects converting a CANCELLED quotation without allocating invoice numbers", async () => {
    const quoteId = `${FIXTURE_PREFIX}quote-cancelled`;
    await seedQuotation({
      id: quoteId,
      quotationNumber: "TNQ-B55-0108",
      status: "CANCELLED",
    });

    const compBefore = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    const seqBefore = compBefore.rows[0].next_invoice_no;

    let threw = false;
    try {
      await testStore.convertQuotationToBill(quoteId);
    } catch (err: any) {
      threw = true;
      assert.match(err.message, /cancelled and cannot be converted/i);
    }
    assert.equal(threw, true, "Must throw on cancelled quotation");

    // Verify no bill created
    const billsCount = await appPool.query(
      `SELECT count(*) as cnt FROM public.bills WHERE source_quotation_id = $1`,
      [quoteId]
    );
    assert.equal(Number(billsCount.rows[0].cnt), 0, "No bill must be created");

    // Verify company sequence unchanged
    const compAfter = await appPool.query(`SELECT next_invoice_no FROM public.companies WHERE id = $1`, [COMPANY_ID]);
    assert.equal(compAfter.rows[0].next_invoice_no, seqBefore);
  });
});
