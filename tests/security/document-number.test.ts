import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./helpers"; // Set up safe test env variables
import { SupabaseStore } from "../../src/lib/db/supabaseStore";
import type { Company } from "../../src/lib/types";

describe("Document Number Generation & Bill Number Collision Check (Batch 3.2 Regression)", () => {
  let store: SupabaseStore;
  let queries: { table: string; selectCol: string; filterCol: string; filterVal: any }[];
  let companyUpdates: { id: string; updates: Partial<Company> }[];
  let existingRecords: Record<string, Set<string>>;

  beforeEach(() => {
    store = new SupabaseStore();
    queries = [];
    companyUpdates = [];
    existingRecords = {
      bills: new Set<string>(),
      quotations: new Set<string>(),
      gate_passes: new Set<string>(),
    };

    // Construct mock Supabase client to observe queries without any DB connection
    const mockSupabase = {
      from(table: string) {
        return {
          select(selectCol: string) {
            return {
              eq(filterCol: string, filterVal: any) {
                queries.push({ table, selectCol, filterCol, filterVal });
                return {
                  maybeSingle: async () => {
                    const tableSet = existingRecords[table];
                    if (tableSet && tableSet.has(String(filterVal))) {
                      return { data: { id: `existing-row-for-${filterVal}` }, error: null };
                    }
                    return { data: null, error: null };
                  },
                };
              },
            };
          },
        };
      },
    };

    Object.defineProperty(store, "supabase", {
      get: () => mockSupabase,
      configurable: true,
    });
  });

  it("queries 'bill_number' (not 'invoice_number') on 'bills' table when docType is INVOICE", async () => {
    const mockCompany: Company = {
      id: "comp-001",
      name: "Tamilnadu Suppliers",
      invoicePrefix: "TNS-",
      quotationPrefix: "TNQ-",
      gatePassPrefix: "TNGP-",
      nextInvoiceNo: 1,
      nextQuotationNo: 1,
      nextGatePassNo: 1,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    (store as any).getCompany = async (id: string) => (id === mockCompany.id ? mockCompany : undefined);
    (store as any).updateCompany = async (id: string, updates: Partial<Company>) => {
      companyUpdates.push({ id, updates });
      return { ...mockCompany, ...updates };
    };

    const docNumber = await store.getNextDocumentNumber("comp-001", "INVOICE");

    assert.equal(docNumber, "TNS-0001");
    assert.equal(queries.length, 1);
    assert.equal(queries[0].table, "bills");
    assert.equal(queries[0].selectCol, "id");
    assert.equal(queries[0].filterCol, "bill_number", "Must query 'bill_number' column, NOT 'invoice_number'");
    assert.notEqual(queries[0].filterCol, "invoice_number", "Must NOT reference obsolete 'invoice_number'");
    assert.equal(queries[0].filterVal, "TNS-0001");

    assert.equal(companyUpdates.length, 1);
    assert.equal(companyUpdates[0].id, "comp-001");
    assert.equal(companyUpdates[0].updates.nextInvoiceNo, 2);
  });

  it("loops and continues checking bill_number when a collision exists", async () => {
    const mockCompany: Company = {
      id: "comp-002",
      name: "Tamilnadu Suppliers",
      invoicePrefix: "TNS-",
      quotationPrefix: "TNQ-",
      gatePassPrefix: "TNGP-",
      nextInvoiceNo: 10,
      nextQuotationNo: 1,
      nextGatePassNo: 1,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Pre-seed collisions for candidate numbers 10 and 11
    existingRecords.bills.add("TNS-0010");
    existingRecords.bills.add("TNS-0011");

    (store as any).getCompany = async (id: string) => (id === mockCompany.id ? mockCompany : undefined);
    (store as any).updateCompany = async (id: string, updates: Partial<Company>) => {
      companyUpdates.push({ id, updates });
      return { ...mockCompany, ...updates };
    };

    const docNumber = await store.getNextDocumentNumber("comp-002", "INVOICE");

    // Must skip 10 and 11, and resolve to 12
    assert.equal(docNumber, "TNS-0012");
    assert.equal(queries.length, 3, "Must have checked 3 candidates (10, 11, 12)");

    // Candidate 1 (collision)
    assert.equal(queries[0].table, "bills");
    assert.equal(queries[0].filterCol, "bill_number");
    assert.equal(queries[0].filterVal, "TNS-0010");

    // Candidate 2 (collision)
    assert.equal(queries[1].table, "bills");
    assert.equal(queries[1].filterCol, "bill_number");
    assert.equal(queries[1].filterVal, "TNS-0011");

    // Candidate 3 (available)
    assert.equal(queries[2].table, "bills");
    assert.equal(queries[2].filterCol, "bill_number");
    assert.equal(queries[2].filterVal, "TNS-0012");

    // Company counter updated to num + 1 = 13
    assert.equal(companyUpdates.length, 1);
    assert.equal(companyUpdates[0].id, "comp-002");
    assert.equal(companyUpdates[0].updates.nextInvoiceNo, 13);
  });

  it("preserves company-specific custom prefix and zero-padded formatting", async () => {
    const mockCompany: Company = {
      id: "comp-custom",
      name: "Branch Alpha",
      invoicePrefix: "ALPHA-INV-",
      quotationPrefix: "ALPHA-QTN-",
      gatePassPrefix: "ALPHA-GP-",
      nextInvoiceNo: 500,
      nextQuotationNo: 1,
      nextGatePassNo: 1,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    existingRecords.bills.add("ALPHA-INV-0500");

    (store as any).getCompany = async (id: string) => (id === mockCompany.id ? mockCompany : undefined);
    (store as any).updateCompany = async (id: string, updates: Partial<Company>) => {
      companyUpdates.push({ id, updates });
      return { ...mockCompany, ...updates };
    };

    const docNumber = await store.getNextDocumentNumber("comp-custom", "INVOICE");

    assert.equal(docNumber, "ALPHA-INV-0501");
    assert.equal(queries.length, 2);
    assert.equal(queries[0].filterCol, "bill_number");
    assert.equal(queries[0].filterVal, "ALPHA-INV-0500");
    assert.equal(queries[1].filterCol, "bill_number");
    assert.equal(queries[1].filterVal, "ALPHA-INV-0501");
    assert.equal(companyUpdates[0].updates.nextInvoiceNo, 502);
  });

  it("verifies QUOTATION collision checking against 'quotations' table and 'quotation_number'", async () => {
    const mockCompany: Company = {
      id: "comp-003",
      name: "Tamilnadu Suppliers",
      invoicePrefix: "TNS-",
      quotationPrefix: "TNQ-",
      gatePassPrefix: "TNGP-",
      nextInvoiceNo: 1,
      nextQuotationNo: 20,
      nextGatePassNo: 1,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    existingRecords.quotations.add("TNQ-0020");

    (store as any).getCompany = async (id: string) => (id === mockCompany.id ? mockCompany : undefined);
    (store as any).updateCompany = async (id: string, updates: Partial<Company>) => {
      companyUpdates.push({ id, updates });
      return { ...mockCompany, ...updates };
    };

    const docNumber = await store.getNextDocumentNumber("comp-003", "QUOTATION");

    assert.equal(docNumber, "TNQ-0021");
    assert.equal(queries.length, 2);
    assert.equal(queries[0].table, "quotations");
    assert.equal(queries[0].filterCol, "quotation_number");
    assert.equal(queries[0].filterVal, "TNQ-0020");
    assert.equal(queries[1].table, "quotations");
    assert.equal(queries[1].filterCol, "quotation_number");
    assert.equal(queries[1].filterVal, "TNQ-0021");
    assert.equal(companyUpdates[0].updates.nextQuotationNo, 22);
  });

  it("verifies GATE_PASS collision checking against 'gate_passes' table and 'gate_pass_number'", async () => {
    const mockCompany: Company = {
      id: "comp-004",
      name: "Tamilnadu Suppliers",
      invoicePrefix: "TNS-",
      quotationPrefix: "TNQ-",
      gatePassPrefix: "TNGP-",
      nextInvoiceNo: 1,
      nextQuotationNo: 1,
      nextGatePassNo: 7,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    existingRecords.gate_passes.add("TNGP-0007");

    (store as any).getCompany = async (id: string) => (id === mockCompany.id ? mockCompany : undefined);
    (store as any).updateCompany = async (id: string, updates: Partial<Company>) => {
      companyUpdates.push({ id, updates });
      return { ...mockCompany, ...updates };
    };

    const docNumber = await store.getNextDocumentNumber("comp-004", "GATE_PASS");

    assert.equal(docNumber, "TNGP-0008");
    assert.equal(queries.length, 2);
    assert.equal(queries[0].table, "gate_passes");
    assert.equal(queries[0].filterCol, "gate_pass_number");
    assert.equal(queries[0].filterVal, "TNGP-0007");
    assert.equal(queries[1].table, "gate_passes");
    assert.equal(queries[1].filterCol, "gate_pass_number");
    assert.equal(queries[1].filterVal, "TNGP-0008");
    assert.equal(companyUpdates[0].updates.nextGatePassNo, 9);
  });

  it("throws clear error when issuing company is not found", async () => {
    (store as any).getCompany = async () => undefined;

    await assert.rejects(
      () => store.getNextDocumentNumber("non-existent-company", "INVOICE"),
      /Issuing company not found/
    );
  });
});
