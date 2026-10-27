// ============================================================================
// REAL POSTGRESQL END-TO-END TEST: EXCEL IMPORT OF OLDER RECORDS
// Target: the disposable loopback test database only (skipped when TEST_DB_PASSWORD is not set).
// ============================================================================

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import * as XLSX from "xlsx";
import { closePostgresPool } from "../src/lib/db/postgresClient";
import { SupabaseStore } from "../src/lib/db/supabaseStore";
import { parseRecordsWorkbook, type ImportContext } from "../src/lib/excel/records-importer";
import { executeImport } from "../src/lib/excel/records-import-executor";
import { getTestDbConfig } from "./helpers/testDbConfig";

const testDb = getTestDbConfig();
const P = "IMP-T-";
const COMPANY_ID = `${P}company`;

function book(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("Excel import of older records on real PostgreSQL", { skip: !testDb.isConfigured ? testDb.skipReason : false }, () => {
  let pool: Pool;
  let store: SupabaseStore;

  const cleanup = async () => {
    await pool.query(`DELETE FROM public.audit_logs WHERE entity_number LIKE $1`, [`${P}%`]);
    await pool.query(`DELETE FROM public.payments WHERE payment_number LIKE $1 OR company_id = $2`, [`${P}%`, COMPANY_ID]);
    await pool.query(`DELETE FROM public.bill_items WHERE bill_id IN (SELECT id FROM public.bills WHERE company_id = $1)`, [COMPANY_ID]);
    await pool.query(`DELETE FROM public.bill_branches WHERE bill_id IN (SELECT id FROM public.bills WHERE company_id = $1)`, [COMPANY_ID]);
    await pool.query(`DELETE FROM public.bills WHERE company_id = $1`, [COMPANY_ID]);
    await pool.query(`DELETE FROM public.customers WHERE name LIKE $1`, [`${P}%`]);
    await pool.query(`DELETE FROM public.products WHERE name LIKE $1`, [`${P}%`]);
    await pool.query(`DELETE FROM public.categories WHERE name LIKE $1`, [`${P}%`]);
    await pool.query(`DELETE FROM public.companies WHERE id = $1`, [COMPANY_ID]);
  };

  const context = async (): Promise<ImportContext> => {
    const [companies, customers, bills, products, categories] = await Promise.all([
      store.getCompanies(), store.getCustomers(), store.getBills(), store.getProducts(), store.getCategories(),
    ]);
    return {
      companies: companies.filter((c) => c.id === COMPANY_ID).map((c) => ({ id: c.id, name: c.name, displayName: c.displayName, invoicePrefix: c.invoicePrefix, gstType: c.gstType, placeOfSupply: c.placeOfSupply })),
      defaultCompanyId: COMPANY_ID,
      existingCustomers: customers.map((c) => ({ id: c.id, name: c.name, mobile: c.mobile })),
      existingBillNumbers: bills.map((b) => b.billNumber),
      existingProducts: products.map((p) => ({ id: p.id, name: p.name })),
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
    };
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
       VALUES ($1, 'IMP-T Rentals', 'IMP-T Rentals', '9876543210', 'Vellore', 'Tamil Nadu', '33AAAAA0000A1Z5', 'AAAAA0000A', 'GST_REGISTERED',
         '123456789012', 'SBIN0001234', 'IMP-T-INV-', 'IMP-T-Q-', 'IMP-T-GP-', 1, 1, 1, true)`,
      [COMPANY_ID]
    );
    await pool.query(`INSERT INTO public.categories (id, name) VALUES ('${P}cat', '${P}Utensils')`);
    await pool.query(
      `INSERT INTO public.products (id, name, unit, default_rental_rate, total_owned_quantity, available_quantity)
       VALUES ('${P}prod-plate', '${P}Plate', 'pcs', 1, 100, 100)`
    );
  });

  after(async () => {
    if (pool) {
      await cleanup();
      await pool.end();
    }
    await closePostgresPool();
  });

  const HEADER = ["Bill Number", "Bill Date", "Customer Name", "Customer Mobile", "Item Name", "Quantity", "Days", "Unit Price", "Discount"];

  const workbook = () =>
    book({
      Customers: [["Name", "Mobile", "Address"], [`${P}Walk In Cust`, "9500000001", "Some street"]],
      Bills: [
        HEADER,
        [`${P}0001`, "15/03/2025", `${P}Ravi Traders`, "9500000002", `${P}Plate`, 50, 2, 2, 0],
        [`${P}0001`, "15/03/2025", `${P}Ravi Traders`, "9500000002", "Loose Spoon", 10, 2, 1, 0],
      ],
      Payments: [
        ["Bill Number", "Payment Date", "Amount", "Method", "Type"],
        [`${P}0001`, "15/03/2025", 100, "UPI", "Advance"],
        [`${P}0001`, "30/03/2025", 100, "Cash", ""],
      ],
      Products: [["Name", "Category", "Rental Rate", "Total Stock"], [`${P}Plate`, `${P}Utensils`, 3, 250]],
    });

  it("imports bills, payments, customers and product updates; totals, balances and stock are right", async () => {
    const movementsBefore = (await pool.query(`SELECT count(*)::int AS n FROM public.inventory_movements`)).rows[0].n;
    const preview = parseRecordsWorkbook(workbook(), await context());
    assert.equal(preview.summary.importable, true, JSON.stringify(preview.summary));
    assert.equal(preview.bills[0].computedGrandTotal, 260); // 220 + 18% GST = 259.60, rounded to whole rupees by the app's engine

    const result = await executeImport(store as never, preview, { id: "system", name: "Import Test", role: "SUPER_ADMIN" });
    assert.deepEqual(result.failures, []);
    assert.equal(result.billsCreated, 1);
    assert.equal(result.paymentsCreated, 2);
    assert.equal(result.customersCreated, 1);
    assert.equal(result.productsUpdated, 1);

    const bill = (await pool.query(
      `SELECT bill_number, bill_date::text AS bill_date, grand_total, amount_paid, advance_paid, balance_due, payment_status, customer_name
         FROM public.bills WHERE bill_number = $1`, [`${P}0001`])).rows[0];
    assert.equal(bill.bill_date, "2025-03-15");
    assert.equal(Number(bill.grand_total), 260);
    assert.equal(Number(bill.advance_paid) + Number(bill.amount_paid), 200);
    assert.equal(Number(bill.balance_due), 60);
    assert.equal(bill.payment_status, "PARTIALLY_PAID");
    const st = (await pool.query(`SELECT status FROM public.bills WHERE bill_number = $1`, [`${P}0001`])).rows[0].status;
    assert.equal(st, "ISSUED", "an imported bill with a balance stays open as a receivable");

    const items = (await pool.query(
      `SELECT item_name, product_id, entry_type, quantity, days, unit_price, amount FROM public.bill_items i
         JOIN public.bills b ON b.id = i.bill_id WHERE b.bill_number = $1 ORDER BY item_name`, [`${P}0001`])).rows;
    assert.equal(items.length, 2);
    assert.ok(items.every((r) => r.entry_type === "product"), "unknown items must be saved as product lines, not notes");
    assert.equal(items.find((r) => r.item_name === "Loose Spoon").product_id, null);
    assert.equal(Number(items.find((r) => r.item_name === "Loose Spoon").amount), 20);

    const pays = (await pool.query(`SELECT payment_number, amount, payment_method, payment_type FROM public.payments WHERE bill_id = (SELECT id FROM public.bills WHERE bill_number = $1) ORDER BY payment_date`, [`${P}0001`])).rows;
    assert.deepEqual(pays.map((p) => [p.payment_method, p.payment_type]), [["UPI", "ADVANCE"], ["CASH", "RENTAL_PAYMENT"]]);

    const prod = (await pool.query(`SELECT default_rental_rate, total_owned_quantity, available_quantity, category_id FROM public.products WHERE id = '${P}prod-plate'`)).rows[0];
    assert.equal(Number(prod.default_rental_rate), 3);
    assert.equal(prod.total_owned_quantity, 250);
    assert.equal(prod.available_quantity, 250);

    const custs = (await pool.query(`SELECT name FROM public.customers WHERE name LIKE $1 ORDER BY name`, [`${P}%`])).rows.map((r) => r.name);
    assert.deepEqual(custs, [`${P}Ravi Traders`, `${P}Walk In Cust`]); // one created from the sheet, one auto-created from the bill

    const movementsAfter = (await pool.query(`SELECT count(*)::int AS n FROM public.inventory_movements`)).rows[0].n;
    assert.equal(movementsAfter, movementsBefore, "importing historical bills must not create stock movements");
  });

  it("a fully paid imported bill is closed and keeps its derived rental end date", async () => {
    const buf = book({
      Bills: [
        [...HEADER, "Amount Paid"],
        [`${P}0003`, "10/02/2025", `${P}Ravi Traders`, "9500000002", "Spoon", 10, 3, 10, 0, 354],
      ],
    });
    const preview = parseRecordsWorkbook(buf, await context());
    const result = await executeImport(store as never, preview, undefined);
    assert.deepEqual(result.failures, []);
    const row = (await pool.query(`SELECT status, balance_due, rental_start_date::text AS s, rental_end_date::text AS e FROM public.bills WHERE bill_number = $1`, [`${P}0003`])).rows[0];
    assert.equal(row.status, "PAID"); // the app stores CLOSED as PAID
    assert.equal(Number(row.balance_due), 0);
    assert.equal(row.s, "2025-02-10");
    assert.equal(row.e, "2025-02-12");
  });

  it("running the same file again changes nothing (bills and customers are skipped)", async () => {
    const preview = parseRecordsWorkbook(workbook(), await context());
    assert.equal(preview.summary.billsToCreate, 0);
    assert.equal(preview.summary.billsSkipped, 1);
    assert.equal(preview.summary.customersToCreate, 0);
    const billsBefore = (await pool.query(`SELECT count(*)::int n FROM public.bills WHERE company_id = $1`, [COMPANY_ID])).rows[0].n;
    await executeImport(store as never, preview, undefined);
    const billsAfter = (await pool.query(`SELECT count(*)::int n FROM public.bills WHERE company_id = $1`, [COMPANY_ID])).rows[0].n;
    assert.equal(billsAfter, billsBefore);
  });

  it("a bill is atomic: if one of its payments fails, the bill is not left behind", async () => {
    const buf = book({
      Bills: [HEADER, [`${P}0002`, "01/04/2025", `${P}Ravi Traders`, "9500000002", "Spoon", 1, 1, 100, 0]],
      Payments: [
        ["Bill Number", "Payment Date", "Amount", "Method", "Payment Number"],
        [`${P}0002`, "01/04/2025", 50, "Cash", `${P}DUP`],
        [`${P}0002`, "02/04/2025", 50, "Cash", `${P}DUP`], // violates the unique payment number
      ],
    });
    const preview = parseRecordsWorkbook(buf, await context());
    const result = await executeImport(store as never, preview, undefined);
    assert.equal(result.billsCreated, 0);
    assert.equal(result.failures.length, 1);
    const left = (await pool.query(`SELECT count(*)::int n FROM public.bills WHERE bill_number = $1`, [`${P}0002`])).rows[0].n;
    assert.equal(left, 0, "failed import must roll the whole bill back");
    const pays = (await pool.query(`SELECT count(*)::int n FROM public.payments WHERE payment_number = $1`, [`${P}DUP`])).rows[0].n;
    assert.equal(pays, 0);
  });
});
