// Unit tests for the Excel import of older records (pure parsing/validation, no database).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  parseRecordsWorkbook,
  parseDateCell,
  parseMoney,
  buildImportTemplate,
  type ImportContext,
} from "../src/lib/excel/records-importer";

const ctx: ImportContext = {
  companies: [
    { id: "c-gst", name: "Tamilnadu Suppliers (GST Main)", displayName: "Tamilnadu Suppliers (GST Main)", invoicePrefix: "TNS-GST1-", gstType: "GST_REGISTERED", placeOfSupply: "Vellore" },
    { id: "c-ret", name: "Tamilnadu Suppliers (Retail)", displayName: "Tamilnadu Suppliers (Retail)", invoicePrefix: "TNS-RET-", gstType: "NON_GST", placeOfSupply: "Vellore" },
  ],
  defaultCompanyId: "c-ret",
  existingCustomers: [{ id: "u1", name: "Old Customer", mobile: "9000000001" }],
  existingBillNumbers: ["TNS-RET-0001"],
  existingProducts: [{ id: "p-plate", name: "Steel Plate" }],
  categories: [{ id: "cat-1", name: "Utensils" }],
};

function book(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const BILL_HEADER = ["Bill Number", "Bill Date", "Company", "Customer Name", "Customer Mobile", "Item Name", "Quantity", "Days", "Unit Price", "Discount", "Grand Total", "Amount Paid"];

describe("cell parsing", () => {
  it("parses Indian dates, ISO dates and Excel serials; rejects nonsense", () => {
    assert.equal(parseDateCell("15/03/2025"), "2025-03-15");
    assert.equal(parseDateCell("5-3-25"), "2025-03-05");
    assert.equal(parseDateCell("2025-03-15"), "2025-03-15");
    assert.equal(parseDateCell(45731), "2025-03-15");
    assert.equal(parseDateCell("31/02/2025"), null);
    assert.equal(parseDateCell("hello"), null);
  });

  it("parses money with symbols and commas", () => {
    assert.equal(parseMoney("₹1,234.50"), 1234.5);
    assert.equal(parseMoney("Rs. 500"), 500);
    assert.equal(parseMoney(""), null);
    assert.equal(parseMoney("abc"), null);
  });
});

describe("bills import", () => {
  it("groups item rows into one bill, recalculates totals and builds the paid shortcut payment", () => {
    const buf = book({
      Bills: [
        BILL_HEADER,
        ["TNS-RET-0100", "15/03/2025", "TNS-RET-", "Ravi Traders", "9876543210", "Steel Plate", 50, 3, 2, 0, 300, 300],
        ["TNS-RET-0100", "15/03/2025", "TNS-RET-", "Ravi Traders", "9876543210", "Spoon", 10, 3, 1, 0, 300, 300],
      ],
    });
    const p = parseRecordsWorkbook(buf, ctx);
    assert.equal(p.fatalErrors.length, 0);
    assert.equal(p.bills.length, 1);
    const b = p.bills[0];
    assert.deepEqual(b.errors, []);
    assert.equal(b.items.length, 2);
    assert.equal(b.items[0].productId, "p-plate");
    assert.equal(b.items[1].productId, null);
    assert.equal(b.computedGrandTotal, 330); // 50*3*2 + 10*3*1, NON_GST company
    assert.ok(b.warnings.some((w) => /differs from the calculated total/.test(w)));
    assert.equal(b.payments.length, 1);
    assert.equal(b.payments[0].amount, 300);
    assert.equal(p.summary.billsToCreate, 1);
    assert.equal(p.summary.importable, true);
  });

  it("uses the default company when the Company column is empty and adds GST for GST companies", () => {
    const buf = book({
      Bills: [
        BILL_HEADER,
        ["B-1", "01/04/2025", "TNS-GST1-", "Cust", "9111111111", "Steel Plate", 10, 1, 100, 0, "", ""],
        ["B-2", "01/04/2025", "", "Cust", "9111111111", "Steel Plate", 10, 1, 100, 0, "", ""],
      ],
    });
    const p = parseRecordsWorkbook(buf, ctx);
    const gst = p.bills.find((b) => b.billNumber === "B-1")!;
    const def = p.bills.find((b) => b.billNumber === "B-2")!;
    assert.equal(gst.computedGrandTotal, 1180); // 1000 + 18% GST
    assert.equal(def.companyId, "c-ret");
    assert.equal(def.computedGrandTotal, 1000);
  });

  it("skips bills that already exist and reports row-level errors", () => {
    const buf = book({
      Bills: [
        BILL_HEADER,
        ["TNS-RET-0001", "01/01/2025", "", "Cust", "9111111111", "Steel Plate", 1, 1, 10, 0, "", ""],
        ["BAD-1", "not a date", "NoSuchCo", "", "12", "Steel Plate", 0, 1, "abc", 0, "", ""],
      ],
    });
    const p = parseRecordsWorkbook(buf, ctx);
    const dup = p.bills.find((b) => b.billNumber === "TNS-RET-0001")!;
    assert.equal(dup.action, "skip");
    const bad = p.bills.find((b) => b.billNumber === "BAD-1")!;
    assert.ok(bad.errors.length >= 4, bad.errors.join(" | "));
    assert.equal(p.summary.billsToCreate, 0);
    assert.equal(p.summary.importable, false);
  });

  it("attaches Payments-sheet rows to their bill and flags unknown bills and overpayment", () => {
    const buf = book({
      Bills: [BILL_HEADER, ["B-9", "01/05/2025", "", "Cust", "9222222222", "Steel Plate", 10, 1, 100, 0, "", ""]],
      Payments: [
        ["Bill Number", "Payment Date", "Amount", "Method", "Type"],
        ["B-9", "02/05/2025", 600, "gpay", "Advance"],
        ["B-9", "10/05/2025", 600, "Cash", ""],
        ["NOPE", "10/05/2025", 50, "Cash", ""],
      ],
    });
    const p = parseRecordsWorkbook(buf, ctx);
    const b = p.bills[0];
    assert.equal(b.payments.length, 2);
    assert.equal(b.payments[0].method, "UPI");
    assert.equal(b.payments[0].type, "ADVANCE");
    assert.equal(b.totalPaid, 1200);
    assert.ok(b.warnings.some((w) => /exceed/.test(w)));
    assert.equal(p.orphanPayments.length, 1);
    assert.ok(p.orphanPayments[0].errors[0].includes("not in the Bills sheet"));
  });
});

describe("customers and products import", () => {
  it("skips customers whose mobile already exists or repeats in the file", () => {
    const buf = book({
      Customers: [
        ["Name", "Mobile", "Address"],
        ["Old Customer", "+91 90000 00001", "x"],
        ["New One", "9333333333", "Addr"],
        ["New One Again", "93333 33333", "Addr"],
        ["No Mobile", "", "Addr"],
      ],
    });
    const p = parseRecordsWorkbook(buf, ctx);
    assert.deepEqual(p.customers.map((c) => c.action), ["skip", "create", "skip", "create"]);
    assert.ok(p.customers[3].errors.length > 0);
    assert.equal(p.summary.customersToCreate, 1);
  });

  it("creates new products, updates existing ones by name and warns on unknown categories", () => {
    const buf = book({
      Products: [
        ["Name", "Category", "Rental Rate", "Total Stock"],
        ["Steel Plate", "", 3, 600],
        ["Brand New Chair", "Furniture", 5, 40],
        ["Steel Plate", "", 9, 1],
        ["Ghost", "", -1, ""],
      ],
    });
    const p = parseRecordsWorkbook(buf, ctx);
    assert.equal(p.products[0].action, "update");
    assert.equal(p.products[0].existingProductId, "p-plate");
    assert.equal(p.products[1].action, "create");
    assert.ok(p.products[1].warnings.some((w) => /does not exist/.test(w)));
    assert.equal(p.products[2].action, "skip");
    assert.ok(p.products[3].errors.length > 0);
    assert.equal(p.summary.productsToCreate, 1);
    assert.equal(p.summary.productsToUpdate, 1);
  });
});

describe("file level behaviour", () => {
  it("rejects a workbook without any recognised sheet and a non-Excel buffer", () => {
    const noSheets = parseRecordsWorkbook(book({ Random: [["a"], [1]] }), ctx);
    assert.equal(noSheets.summary.importable, false);
    assert.ok(noSheets.fatalErrors[0].includes("No recognised sheet"));
    const garbage = parseRecordsWorkbook(Buffer.from("not an excel file at all"), ctx);
    assert.equal(garbage.summary.importable, false);
  });

  it("the downloadable template parses cleanly and its example rows are ignored", () => {
    const p = parseRecordsWorkbook(buildImportTemplate(), ctx);
    assert.deepEqual(p.fatalErrors, [] as string[]);
    assert.deepEqual(p.sheetsFound.sort(), ["Bills", "Customers", "Payments", "Products"]);
    assert.equal(p.bills.length + p.customers.length + p.products.length + p.orphanPayments.length, 0);
  });
});
