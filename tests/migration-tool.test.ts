// ============================================================================
// TAMILNADU SUPPLIERS RENTAL ERP - DATA MIGRATION TOOL UNIT & INTEGRATION TESTS
// File: tests/migration-tool.test.ts
// ============================================================================

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import {
  AUTHORITATIVE_TABLE_GRAPH,
  getTopologicalOrder,
} from "../scripts/migration/dependencyGraph";
import {
  validateTargetSafety,
  validateEnvironmentIsolation,
  assertLiveTargetConnection,
  redactUrl,
  redactSecrets,
  sanitizeError,
} from "../scripts/migration/safety";
import {
  formatDecimalMoney,
  normalizeTimestamp,
  normalizeJsonb,
  normalizeNullableString,
  transformTableRecords,
} from "../scripts/migration/transformer";
import {
  InMemoryFixtureExtractor,
} from "../scripts/migration/extractor";
import {
  formatReconciliationSummary,
  MigrationReconciler,
} from "../scripts/migration/reconciler";
import { DataMigrator } from "../scripts/migration/migrator";
import { getTestDbConfig } from "./helpers/testDbConfig";

const testDb = getTestDbConfig();

describe("Batch 6.3 — Supabase-to-PostgreSQL Data Migration Tool", () => {
  // ==========================================================================
  // PART 1: DEPENDENCY GRAPH & TOPOLOGICAL ORDERING
  // ==========================================================================
  describe("1. Dependency Graph & Cycle Detection", () => {
    it("authoritative graph defines exactly 26 tables", () => {
      assert.equal(AUTHORITATIVE_TABLE_GRAPH.length, 26);
    });

    it("topological order places parent tables strictly before dependent children", () => {
      const order = getTopologicalOrder();
      assert.equal(order.length, 26);

      // Verify essential topological precedence rules
      const idxOf = (name: string) => order.indexOf(name);

      assert.ok(idxOf("companies") < idxOf("quotations"), "companies must precede quotations");
      assert.ok(idxOf("companies") < idxOf("bills"), "companies must precede bills");
      assert.ok(idxOf("users") < idxOf("quotations"), "users must precede quotations");
      assert.ok(idxOf("users") < idxOf("bills"), "users must precede bills");
      assert.ok(idxOf("customers") < idxOf("customer_branches"), "customers must precede customer_branches");
      assert.ok(idxOf("categories") < idxOf("products"), "categories must precede products");
      assert.ok(idxOf("quotations") < idxOf("quotation_branches"), "quotations must precede quotation_branches");
      assert.ok(idxOf("quotation_branches") < idxOf("quotation_items"), "quotation_branches must precede quotation_items");
      assert.ok(idxOf("bills") < idxOf("bill_branches"), "bills must precede bill_branches");
      assert.ok(idxOf("bill_branches") < idxOf("bill_items"), "bill_branches must precede bill_items");
      assert.ok(idxOf("bills") < idxOf("payments"), "bills must precede payments");
      assert.ok(idxOf("bills") < idxOf("gate_passes"), "bills must precede gate_passes");
      assert.ok(idxOf("gate_passes") < idxOf("gate_pass_items"), "gate_passes must precede gate_pass_items");
      assert.ok(idxOf("gate_passes") < idxOf("returns"), "gate_passes must precede returns");
      assert.ok(idxOf("returns") < idxOf("return_items"), "returns must precede return_items");
      assert.ok(idxOf("gate_pass_items") < idxOf("return_items"), "gate_pass_items must precede return_items");
      assert.ok(idxOf("products") < idxOf("inventory_movements"), "products must precede inventory_movements");
    });

    it("detects cyclic foreign key dependencies and throws an informative error", () => {
      const cyclicGraph = [
        {
          name: "table_a",
          tier: 0,
          primaryKey: "id",
          foreignKeys: [{ column: "b_id", foreignTable: "table_b", foreignColumn: "id", nullable: false }],
        },
        {
          name: "table_b",
          tier: 0,
          primaryKey: "id",
          foreignKeys: [{ column: "a_id", foreignTable: "table_a", foreignColumn: "id", nullable: false }],
        },
      ];

      assert.throws(
        () => getTopologicalOrder(cyclicGraph as any),
        /CYCLIC DEPENDENCY DETECTED/
      );
    });
  });

  // ==========================================================================
  // PART 2: SAFETY GUARDS & ISOLATION CHECKS
  // ==========================================================================
  describe("2. Safety Guards & Isolation Rules", () => {
    it("rejects non-loopback target hosts (remote endpoints)", () => {
      assert.throws(
        () =>
          validateTargetSafety(
            { host: "postgres.production.aws.internal", port: 5432, database: "tns_test", user: "u", password: "p" },
            "dry-run"
          ),
        /CRITICAL TARGET SAFETY VIOLATION.*local loopback/
      );
    });

    it("rejects 0.0.0.0 as client database host", () => {
      assert.throws(
        () =>
          validateTargetSafety(
            { host: "0.0.0.0", port: 5432, database: "tns_test", user: "u", password: "p" },
            "dry-run"
          ),
        /CRITICAL TARGET SAFETY VIOLATION.*local loopback/
      );
    });

    it("rejects Supabase Cloud target hosts", () => {
      assert.throws(
        () =>
          validateTargetSafety(
            { host: "db.lznyejowgqwbavtnqqns.supabase.co", port: 5432, database: "postgres", user: "u", password: "p" },
            "dry-run"
          ),
        /CRITICAL TARGET SAFETY VIOLATION.*Supabase Cloud/
      );
    });

    it("rejects production database names (prod, production, tamilnadu_suppliers)", () => {
      assert.throws(
        () =>
          validateTargetSafety(
            { host: "127.0.0.1", port: 5432, database: "tamilnadu_suppliers", user: "u", password: "p" },
            "dry-run"
          ),
        /CRITICAL TARGET SAFETY VIOLATION.*disposable/
      );

      assert.throws(
        () =>
          validateTargetSafety(
            { host: "127.0.0.1", port: 5432, database: "tns_prod_test", user: "u", password: "p" },
            "dry-run"
          ),
        /CRITICAL TARGET SAFETY VIOLATION.*disposable/
      );
    });

    it("rejects identical source and target connection strings (collision detection)", () => {
      assert.throws(
        () =>
          validateEnvironmentIsolation(
            { type: "postgres", connectionString: "postgresql://u:p@127.0.0.1:5432/tns_disposable_test_2026" },
            { host: "127.0.0.1", port: 5432, database: "tns_disposable_test_2026", user: "u", password: "p" }
          ),
        /CRITICAL ISOLATION VIOLATION.*EXACT same database/
      );
    });

    it("rejects unusual host formats such as IPv4-mapped IPv6", () => {
      assert.throws(
        () =>
          validateTargetSafety(
            { host: "::ffff:127.0.0.1", port: 5432, database: "tns_disposable_test_2026", user: "u", password: "p" },
            "dry-run"
          ),
        /CRITICAL TARGET SAFETY VIOLATION.*Unusual host format/
      );
    });

    it("assertLiveTargetConnection rejects non-loopback runtime socket IP addresses", async () => {
      const mockClient = {
        query: async () => ({
          rows: [
            {
              server_addr: "54.21.32.1",
              server_port: 5432,
              current_db: "tns_disposable_test_2026",
              current_user: "tns_app_user",
            },
          ],
        }),
      };

      await assert.rejects(
        () =>
          assertLiveTargetConnection(mockClient, {
            host: "127.0.0.1",
            port: 5432,
            database: "tns_disposable_test_2026",
            user: "tns_app_user",
            password: "p",
          }),
        /non-loopback IP address '54.21.32.1'/
      );
    });

    it("assertLiveTargetConnection rejects mismatched database name", async () => {
      const mockClient = {
        query: async () => ({
          rows: [
            {
              server_addr: "127.0.0.1",
              server_port: 5432,
              current_db: "wrong_db",
              current_user: "tns_app_user",
            },
          ],
        }),
      };

      await assert.rejects(
        () =>
          assertLiveTargetConnection(mockClient, {
            host: "127.0.0.1",
            port: 5432,
            database: "tns_disposable_test_2026",
            user: "tns_app_user",
            password: "p",
          }),
        /does not match expected target/
      );
    });

    it("assertLiveTargetConnection rejects connected production database names", async () => {
      const mockClient = {
        query: async () => ({
          rows: [
            {
              server_addr: "127.0.0.1",
              server_port: 5432,
              current_db: "tamilnadu_suppliers",
              current_user: "tns_app_user",
            },
          ],
        }),
      };

      await assert.rejects(
        () =>
          assertLiveTargetConnection(mockClient, {
            host: "127.0.0.1",
            port: 5432,
            database: "tamilnadu_suppliers",
            user: "tns_app_user",
            password: "p",
          }),
        /not an authorized test\/disposable database/
      );
    });

    it("assertLiveTargetConnection approves valid loopback connection", async () => {
      const mockClient = {
        query: async () => ({
          rows: [
            {
              server_addr: "127.0.0.1",
              server_port: 5432,
              current_db: "tns_disposable_test_2026",
              current_user: "tns_app_user",
            },
          ],
        }),
      };

      const res = await assertLiveTargetConnection(mockClient, {
        host: "127.0.0.1",
        port: 5432,
        database: "tns_disposable_test_2026",
        user: "tns_app_user",
        password: "p",
      });

      assert.equal(res.serverAddr, "127.0.0.1");
      assert.equal(res.currentDb, "tns_disposable_test_2026");
    });
  });

  // ==========================================================================
  // PART 3: DATA EXTRACTION & KEYSET PAGINATION
  // ==========================================================================
  describe("3. Data Extraction & Keyset Pagination", () => {
    it("extracts multiple pages cleanly across batch limits", async () => {
      const fakeCompanies = Array.from({ length: 25 }, (_, i) => ({
        id: `comp-${String(i + 1).padStart(3, "0")}`,
        name: `Company ${i + 1}`,
      }));

      const extractor = new InMemoryFixtureExtractor({
        companies: fakeCompanies,
      });

      const res = await extractor.extractTable("companies", 10);
      assert.equal(res.totalCount, 25);
      assert.equal(res.extractedPages, 3);
      assert.equal(res.records[0].id, "comp-001");
      assert.equal(res.records[24].id, "comp-025");
    });
  });

  // ==========================================================================
  // PART 4: DATA TRANSFORMATION & DECIMAL PRECISION
  // ==========================================================================
  describe("4. Data Transformation, Money Formatting & Timestamps", () => {
    it("formats monetary values to exact two-decimal strings without floating-point drift", () => {
      assert.equal(formatDecimalMoney(100), "100.00");
      assert.equal(formatDecimalMoney("150.5"), "150.50");
      assert.equal(formatDecimalMoney(0), "0.00");
      assert.equal(formatDecimalMoney(null), "0.00");
      assert.equal(formatDecimalMoney(""), "0.00");
      assert.equal(formatDecimalMoney(19.999), "20.00");
      assert.throws(() => formatDecimalMoney("invalid-amount"), /invalid numeric representation/);
      assert.throws(() => formatDecimalMoney(Infinity), /non-finite value/);
    });

    it("normalizes timestamps into valid ISO-8601 strings and rejects corrupted dates", () => {
      const now = new Date();
      assert.equal(normalizeTimestamp(now.toISOString()), now.toISOString());
      assert.equal(normalizeTimestamp(null), null);
      assert.throws(() => normalizeTimestamp("not-a-date"), /Invalid date format/);
    });

    it("normalizes JSONB objects into valid JSON strings", () => {
      assert.equal(normalizeJsonb([1, 2, 3]), "[1,2,3]");
      assert.equal(normalizeJsonb({ role: "ADMIN" }), '{"role":"ADMIN"}');
      assert.equal(normalizeJsonb(null, "[]"), "[]");
      assert.equal(normalizeJsonb("", "{}"), "{}");
      assert.throws(() => normalizeJsonb("{ invalid json }"), /Malformed JSON string/);
    });

    it("coerces empty strings to NULL for nullable foreign key fields", () => {
      assert.equal(normalizeNullableString(""), null);
      assert.equal(normalizeNullableString("   "), null);
      assert.equal(normalizeNullableString(null), null);
      assert.equal(normalizeNullableString("valid-id"), "valid-id");
    });

    it("transforms bills preserving all monetary fields and mapping to schema columns", () => {
      const rawBills = [
        {
          id: "bill-001",
          company_id: "comp-1",
          bill_number: "TNS-001",
          subtotal: "1000",
          tax_amount: "180",
          discount_amount: "0",
          grand_total: "1180",
          balance_amount: "680",
          paid_amount: "500",
          advance_amount: "100",
          document_lines: [{ line: 1 }],
          created_at: "2026-10-01T10:00:00.000Z",
        },
      ];

      const res = transformTableRecords("bills", rawBills);
      assert.equal(res.validationErrors.length, 0);
      assert.equal(res.transformedRecords.length, 1);
      const b = res.transformedRecords[0];
      assert.equal(b.subtotal, "1000.00");
      assert.equal(b.total_tax, "180.00");
      assert.equal(b.discount_amount, "0.00");
      assert.equal(b.grand_total, "1180.00");
      assert.equal(b.balance_due, "680.00");
      assert.equal(b.amount_paid, "500.00");
      assert.equal(b.advance_paid, "100.00");
      assert.equal(b.tax_amount, undefined, "Legacy tax_amount column must be removed");
      assert.equal(b.balance_amount, undefined, "Legacy balance_amount column must be removed");
      assert.equal(b.paid_amount, undefined, "Legacy paid_amount column must be removed");
      assert.equal(b.advance_amount, undefined, "Legacy advance_amount column must be removed");
      assert.equal(b.document_lines, '[{"line":1}]');
    });

    it("transforms products mapping to authoritative schema columns", () => {
      const rawProducts = [
        {
          id: "prod-001",
          name: "Generator 5kVA",
          category_id: "cat-1",
          daily_rental_rate: "500",
          replacement_cost: "25000",
          quantity_available: 5,
          quantity_on_rent: 2,
          quantity_maintenance: 1,
          quantity_reserved: 0,
        },
      ];

      const res = transformTableRecords("products", rawProducts);
      assert.equal(res.validationErrors.length, 0);
      assert.equal(res.transformedRecords.length, 1);
      const p = res.transformedRecords[0];
      assert.equal(p.default_rental_rate, "500.00");
      assert.equal(p.replacement_value, "25000.00");
      assert.equal(p.available_quantity, 5);
      assert.equal(p.rented_quantity, 2);
      assert.equal(p.maintenance_quantity, 1);
      assert.equal(p.reserved_quantity, 0);
      assert.equal(p.total_owned_quantity, 8);
      assert.equal(p.daily_rental_rate, undefined);
      assert.equal(p.replacement_cost, undefined);
      assert.equal(p.quantity_available, undefined);
      assert.equal(p.quantity_on_rent, undefined);
    });

    it("transforms gate_pass_items mapping quantity_dispatched and stripping invalid columns", () => {
      const rawGatePassItems = [
        {
          id: "gpi-001",
          gate_pass_id: "gp-001",
          product_id: "prod-001",
          item_name: "Generator",
          quantity: 2,
          bill_item_id: "bi-001",
        },
      ];

      const res = transformTableRecords("gate_pass_items", rawGatePassItems);
      assert.equal(res.validationErrors.length, 0);
      assert.equal(res.transformedRecords.length, 1);
      const gpi = res.transformedRecords[0];
      assert.equal(gpi.quantity_dispatched, 2);
      assert.equal(gpi.quantity, undefined);
      assert.equal(gpi.bill_item_id, undefined);
    });

    it("enforces session exclusion policy when skipSessions is enabled", () => {
      const rawSessions = [
        { id: "sess-1", user_id: "u-1", token: "tok1" },
        { id: "sess-2", user_id: "u-2", token: "tok2" },
      ];

      const res = transformTableRecords("sessions", rawSessions, { skipSessions: true });
      assert.equal(res.transformedRecords.length, 0, "All sessions must be excluded under cutover policy");
    });
  });

  // ==========================================================================
  // PART 5: RECONCILIATION & SECRET REDACTION
  // ==========================================================================
  describe("5. Reconciliation & Secret Redaction", () => {
    it("redacts sensitive database credentials and URLs", () => {
      const raw = "postgresql://tns_app_user:SuperSecretPassword123!@127.0.0.1:5432/tns_disposable_test_2026";
      const redacted = redactUrl(raw);
      assert.ok(!redacted.includes("SuperSecretPassword123!"));
      assert.ok(redacted.includes(":***@"));
    });

    it("redacts JWT service role keys and secrets from objects", () => {
      const payload = {
        name: "Admin User",
        password: "secretPassword",
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
        nested: {
          apiKey: "my-super-secret-key",
          phone: "9842345678",
        },
      };

      const sanitized = redactSecrets(payload);
      assert.equal(sanitized.password, "[REDACTED]");
      assert.equal(sanitized.token, "[REDACTED_JWT_TOKEN]");
      assert.equal(sanitized.nested.apiKey, "[REDACTED]");
    });

    it("formats human-readable reconciliation report accurately", () => {
      const mockReport: any = {
        timestamp: "2026-10-27T10:00:00.000Z",
        mode: "dry-run",
        overallStatus: "PASSED",
        tableReconciliation: [
          { tableName: "companies", sourceCount: 8, targetCount: 8, difference: 0, match: true },
          { tableName: "products", sourceCount: 45, targetCount: 45, difference: 0, match: true },
        ],
        financialReconciliation: {
          isBalanced: true,
          billsCount: 10,
          paymentsCount: 15,
          totalSubtotal: "100000.00",
          totalTax: "18000.00",
          totalDiscount: "0.00",
          totalGrandTotal: "118000.00",
          totalPaid: "118000.00",
          totalOutstandingBalance: "0.00",
          calculatedExpectedGrandTotal: "118000.00",
          grandTotalDiscrepancy: "0.00",
          balanceDiscrepancy: "0.00",
          unbalancedBills: [],
        },
        orphanCheck: [],
        sequenceReconciliation: [
          {
            companyId: "c-1",
            companyName: "TNS Vellore",
            currentNextInvoiceNo: 50,
            maxAllocatedInvoiceNo: 49,
            alignedNextInvoiceNo: 50,
          },
        ],
        errors: [],
        warnings: [],
      };

      const markdown = formatReconciliationSummary(mockReport);
      assert.ok(markdown.includes("✅ MATCH"));
      assert.ok(markdown.includes("✅ EXACT PARITY"));
      assert.ok(markdown.includes("₹118000.00"));
      assert.ok(markdown.includes("All Foreign Keys Satisfied"));
    });
  });

  // ==========================================================================
  // PART 6: REAL DATABASE DISPOSABLE TARGET VERIFICATION (DRY-RUN ROLLBACK)
  // ==========================================================================
  describe(
    "6. Disposable Target Dry-Run Rollback Verification",
    { skip: !testDb.isConfigured ? testDb.skipReason : false },
    () => {
      let appPool: Pool;

      before(async () => {
        appPool = new Pool(testDb.getPoolConfig());
        await testDb.assertLiveConnection(appPool);
      });

      after(async () => {
        if (appPool) await appPool.end();
      });

      it("executes inspect mode cleanly returning schema parity", async () => {
        const migrator = new DataMigrator(
          {
            mode: "inspect",
            source: { type: "supabase-api", url: "https://synthetic-source.local", serviceRoleKey: "dummy" },
            target: {
              host: testDb.config!.host,
              port: testDb.config!.port,
              database: testDb.config!.database,
              user: testDb.config!.user,
              password: testDb.config!.password,
            },
          },
          new InMemoryFixtureExtractor()
        );

        const res = await migrator.execute();
        assert.ok(res.success);
        assert.ok(res.summary.includes("Target Public Tables Count"));
        await migrator.close();
      });

      it("guarantees dry-run rolls back completely with zero target data committed", async () => {
        const countBefore = await appPool.query("SELECT COUNT(*)::int as cnt FROM public.companies;");

        // Supply a synthetic company fixture
        const fixtures = {
          companies: [
            {
              id: "comp-dryrun-test",
              name: "Dry Run Test Corp",
              display_name: "Dry Run Test Corp",
              gst_type: "NON_GST",
              address: "Vellore",
              state: "Tamil Nadu",
              state_code: "33",
              place_of_supply: "Vellore",
              bank_name: "City Union Bank",
              bank_account_no: "123456",
              bank_ifsc: "CIUB0000065",
              bank_branch: "Vellore",
              invoice_prefix: "TNS-",
              quotation_prefix: "TNQ-",
              gate_pass_prefix: "TNGP-",
              next_invoice_no: 1,
              next_quotation_no: 1,
              next_gate_pass_no: 1,
              terms_and_conditions: "Terms",
              authorized_signatory_title: "Signatory",
              is_active: true,
            },
          ],
        };

        const migrator = new DataMigrator(
          {
            mode: "dry-run",
            source: { type: "supabase-api", url: "https://synthetic-source.local", serviceRoleKey: "dummy" },
            target: {
              host: testDb.config!.host,
              port: testDb.config!.port,
              database: testDb.config!.database,
              user: testDb.config!.user,
              password: testDb.config!.password,
            },
          },
          new InMemoryFixtureExtractor(fixtures)
        );

        const res = await migrator.execute();
        assert.ok(res.summary.includes("Dry-Run Verification"));

        // Verify target database is 100% UNMUTATED
        const countAfter = await appPool.query("SELECT COUNT(*)::int as cnt FROM public.companies;");
        assert.equal(
          countAfter.rows[0].cnt,
          countBefore.rows[0].cnt,
          "Target database count must be identical before and after dry-run"
        );

        const specificCheck = await appPool.query(
          "SELECT id FROM public.companies WHERE id = 'comp-dryrun-test';"
        );
        assert.equal(specificCheck.rows.length, 0, "Dry-run record must not exist on target database");

        await migrator.close();
      });
    }
  );
});
