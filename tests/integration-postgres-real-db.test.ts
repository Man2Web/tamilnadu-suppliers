import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { PostgresExecutor } from "../src/lib/db/postgresClient";
import { getTestDbConfig } from "./helpers/testDbConfig";

const testDb = getTestDbConfig();

describe("Batch 5.1 — Real PostgreSQL 18.4 Isolated Validation (tns_disposable_test_2026)", { skip: !testDb.isConfigured ? testDb.skipReason : false }, () => {
  let adminPool: Pool;
  let appPool: Pool;
  let appExecutor: PostgresExecutor;

  before(async () => {
    // 1. Establish administrative pool to disposable database
    adminPool = new Pool(testDb.getAdminPoolConfig());

    // 2. Establish application pool using tns_app_user
    appPool = new Pool(testDb.getPoolConfig());

    appExecutor = new PostgresExecutor(appPool);

    // Guard assertions on live connections
    await testDb.assertLiveConnection(adminPool, testDb.config!.adminUser || "postgres");
    await testDb.assertLiveConnection(appPool);

    // Clean up test user in case of previous run failure
    await appPool.query("DELETE FROM public.users WHERE email = $1", ["admin-test-real-db@tamilnadusuppliers.com"]);
  });

  after(async () => {
    if (appPool) {
      await appPool.query("DELETE FROM public.users WHERE email = $1", ["admin-test-real-db@tamilnadusuppliers.com"]);
      await appPool.end();
    }
    if (adminPool) await adminPool.end();
  });

  // ==========================================================================
  // PHASE 4: SCHEMA & METADATA VERIFICATION
  // ==========================================================================
  describe("Phase 4: Schema Parity & Table Coverage", () => {
    it("confirms all 26 tables exist in the public schema", async () => {
      const res = await adminPool.query(`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        ORDER BY tablename;
      `);
      const tableNames = res.rows.map((r) => r.tablename);
      
      const expectedTables = [
        "activity_notifications",
        "audit_logs",
        "bill_branches",
        "bill_items",
        "bills",
        "categories",
        "companies",
        "customer_branches",
        "customers",
        "gate_pass_items",
        "gate_passes",
        "inventory_movements",
        "login_rate_limits",
        "payments",
        "product_imports",
        "products",
        "quotation_branches",
        "quotation_items",
        "quotations",
        "reservation_items",
        "reservations",
        "return_items",
        "returns",
        "sessions",
        "users",
        "whatsapp_logs",
      ].sort();

      assert.deepEqual(tableNames, expectedTables);
      assert.equal(tableNames.length, 26);
    });

    it("confirms products table has all 24 columns with exact types", async () => {
      const res = await adminPool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products'
        ORDER BY ordinal_position;
      `);
      const cols = res.rows.reduce((acc, row) => {
        acc[row.column_name] = row;
        return acc;
      }, {} as Record<string, any>);

      assert.ok(cols.id, "id must exist");
      assert.ok(cols.alias, "alias must exist");
      assert.ok(cols.sku, "sku must exist");
      assert.ok(cols.category_name, "category_name must exist");
      assert.ok(cols.unit, "unit must exist");
      assert.ok(cols.default_rental_rate, "default_rental_rate must exist");
      assert.ok(cols.rental_rate_unit, "rental_rate_unit must exist");
      assert.ok(cols.min_rental_duration, "min_rental_duration must exist");
      assert.ok(cols.security_deposit_amount, "security_deposit_amount must exist");
      assert.ok(cols.replacement_value, "replacement_value must exist");
      assert.ok(cols.total_owned_quantity, "total_owned_quantity must exist");
      assert.ok(cols.available_quantity, "available_quantity must exist");

      // Verify no incorrect replacement names remain
      assert.equal(cols.default_daily_rate, undefined);
      assert.equal(cols.default_security_deposit, undefined);
      assert.equal(cols.total_stock, undefined);
    });

    it("confirms sessions table has token VARCHAR(255) UNIQUE NOT NULL", async () => {
      const res = await adminPool.query(`
        SELECT column_name, data_type, character_maximum_length, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sessions';
      `);
      const cols = res.rows.reduce((acc, row) => {
        acc[row.column_name] = row;
        return acc;
      }, {} as Record<string, any>);

      assert.ok(cols.token, "token must exist");
      assert.equal(cols.token.character_maximum_length, 255);
      assert.equal(cols.token.is_nullable, "NO");
      assert.equal(cols.token_hash, undefined, "token_hash must not exist");
    });

    it("confirms categories has code VARCHAR(50) and name UNIQUE", async () => {
      const res = await adminPool.query(`
        SELECT column_name, data_type, character_maximum_length, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'categories';
      `);
      const cols = res.rows.reduce((acc, row) => {
        acc[row.column_name] = row;
        return acc;
      }, {} as Record<string, any>);

      assert.ok(cols.name, "name must exist");
      assert.ok(cols.code, "code must exist");
      assert.equal(cols.code.character_maximum_length, 50);
      assert.equal(cols.display_order, undefined, "display_order must not exist");
    });

    it("confirms all expected indexes exist and are valid", async () => {
      const res = await adminPool.query(`
        SELECT indexname, tablename
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY indexname;
      `);
      const indexNames = new Set(res.rows.map((r) => r.indexname));

      assert.ok(indexNames.has("idx_products_sku"), "idx_products_sku must exist");
      assert.ok(indexNames.has("idx_sessions_user_id"), "idx_sessions_user_id must exist");
      assert.ok(indexNames.has("idx_bills_company"), "idx_bills_company must exist");
      assert.ok(indexNames.has("idx_quotation_items_position"), "idx_quotation_items_position must exist");
      assert.ok(indexNames.has("idx_bill_items_position"), "idx_bill_items_position must exist");
      assert.ok(indexNames.has("idx_login_rate_limits_window"), "idx_login_rate_limits_window must exist");
    });
  });

  // ==========================================================================
  // PHASE 4: CHECK CONSTRAINTS & DATA INTEGRITY
  // ==========================================================================
  describe("Phase 4: Check Constraints & Integrity Rules", () => {
    it("rejects invalid role in users table", async () => {
      await assert.rejects(
        async () => {
          await appPool.query(`
            INSERT INTO public.users (email, password_hash, name, role)
            VALUES ('invalid-role@test.com', 'hash', 'Test', 'SUPERUSER');
          `);
        },
        (err: any) => err.code === "23514" // check_violation
      );
    });

    it("rejects negative product quantities", async () => {
      await assert.rejects(
        async () => {
          await appPool.query(`
            INSERT INTO public.products (name, total_owned_quantity)
            VALUES ('Negative Stock Item', -5);
          `);
        },
        (err: any) => err.code === "23514"
      );
    });

    it("allows note lines with entry_type = 'note', product_id = NULL, quantity = 0", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN;");
        // 1. Create company
        const compRes = await client.query(`
          INSERT INTO public.companies (name, display_name, gst_type, address, bank_account_no, bank_ifsc)
          VALUES ('Test Co', 'Test Co Display', 'NON_GST', 'Vellore', '123456', 'CIUB0001')
          RETURNING id;
        `);
        const companyId = compRes.rows[0].id;

        // 2. Create quotation
        const quoteRes = await client.query(`
          INSERT INTO public.quotations (
            quotation_number, company_id, company_snapshot, customer_id, customer_name, customer_phone,
            customer_address, rental_start_date, rental_end_date, amount_in_words
          ) VALUES (
            'TNQ-TEST-001', $1, '{"name":"Test Co"}'::jsonb, 'CUST-001', 'Test Customer', '9876543210',
            'Vellore', CURRENT_DATE, CURRENT_DATE + 1, 'Zero'
          ) RETURNING id;
        `, [companyId]);
        const quoteId = quoteRes.rows[0].id;

        // 3. Create quotation branch
        const branchRes = await client.query(`
          INSERT INTO public.quotation_branches (quotation_id, branch_name)
          VALUES ($1, 'Main Stage')
          RETURNING id;
        `, [quoteId]);
        const branchId = branchRes.rows[0].id;

        // 4. Insert note line with quantity = 0 and product_id = NULL
        const noteRes = await client.query(`
          INSERT INTO public.quotation_items (
            quotation_branch_id, quotation_id, product_id, item_name, quantity, days,
            entry_type, position, text
          ) VALUES (
            $1, $2, NULL, 'Special Note Heading', 0, 0,
            'note', 1, 'Delivery strictly at 6:00 AM'
          ) RETURNING id, entry_type, quantity, product_id;
        `, [branchId, quoteId]);

        assert.equal(noteRes.rows[0].entry_type, "note");
        assert.equal(noteRes.rows[0].quantity, 0);
        assert.equal(noteRes.rows[0].product_id, null);

        await client.query("ROLLBACK;");
      } finally {
        client.release();
      }
    });
  });

  // ==========================================================================
  // PHASE 4: SECURITY PRIVILEGES & STORED FUNCTIONS
  // ==========================================================================
  describe("Phase 4: Security Privileges & Stored Functions", () => {
    it("confirms all 4 stored functions exist with SECURITY DEFINER and search_path = public, pg_catalog", async () => {
      const res = await adminPool.query(`
        SELECT p.proname, p.prosecdef, p.proconfig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN (
          'login_rate_limit_status',
          'login_rate_limit_record_failure',
          'login_rate_limit_clear',
          'adjust_product_stock_quantities'
        )
        ORDER BY p.proname;
      `);
      assert.equal(res.rows.length, 4);

      for (const fn of res.rows) {
        assert.equal(fn.prosecdef, true, `${fn.proname} must be SECURITY DEFINER`);
        assert.ok(
          Array.isArray(fn.proconfig) && fn.proconfig.some((c: string) => c === "search_path=public, pg_catalog"),
          `${fn.proname} search_path must be public, pg_catalog`
        );
      }
    });

    it("confirms execution is revoked from PUBLIC on all 4 functions", async () => {
      const res = await adminPool.query(`
        SELECT 
          has_function_privilege('public', 'public.login_rate_limit_status(text)', 'EXECUTE') as f1,
          has_function_privilege('public', 'public.login_rate_limit_record_failure(text, integer, integer, integer)', 'EXECUTE') as f2,
          has_function_privilege('public', 'public.login_rate_limit_clear(text)', 'EXECUTE') as f3,
          has_function_privilege('public', 'public.adjust_product_stock_quantities(varchar, integer, integer, integer, integer)', 'EXECUTE') as f4;
      `);
      assert.equal(res.rows[0].f1, false);
      assert.equal(res.rows[0].f2, false);
      assert.equal(res.rows[0].f3, false);
      assert.equal(res.rows[0].f4, false);
    });

    it("confirms tns_app_user CAN execute all 4 functions", async () => {
      const res = await adminPool.query(`
        SELECT 
          has_function_privilege('tns_app_user', 'public.login_rate_limit_status(text)', 'EXECUTE') as f1,
          has_function_privilege('tns_app_user', 'public.login_rate_limit_record_failure(text, integer, integer, integer)', 'EXECUTE') as f2,
          has_function_privilege('tns_app_user', 'public.login_rate_limit_clear(text)', 'EXECUTE') as f3,
          has_function_privilege('tns_app_user', 'public.adjust_product_stock_quantities(varchar, integer, integer, integer, integer)', 'EXECUTE') as f4;
      `);
      assert.equal(res.rows[0].f1, true);
      assert.equal(res.rows[0].f2, true);
      assert.equal(res.rows[0].f3, true);
      assert.equal(res.rows[0].f4, true);
    });

    it("confirms tns_app_user CANNOT create objects in schema public", async () => {
      const res = await adminPool.query(`
        SELECT has_schema_privilege('tns_app_user', 'public', 'CREATE') as can_create;
      `);
      assert.equal(res.rows[0].can_create, false);

      // Attempting to create a table as tns_app_user must fail
      await assert.rejects(
        async () => {
          await appPool.query("CREATE TABLE public.unauthorized_test_table (id INT);");
        },
        (err: any) => err.code === "42501" // insufficient_privilege
      );
    });

    it("executes rate-limit stored functions cleanly with expected return columns", async () => {
      // 1. Check initial status (should be unblocked)
      const statusRes = await appPool.query("SELECT * FROM public.login_rate_limit_status('test:key:1');");
      assert.equal(statusRes.rows.length, 1);
      assert.equal(statusRes.rows[0].blocked, false);
      assert.equal(statusRes.rows[0].retry_after_seconds, 0);

      // 2. Record failure (attempts = 1)
      const failRes = await appPool.query("SELECT * FROM public.login_rate_limit_record_failure('test:key:1', 5, 900, 1800);");
      assert.equal(failRes.rows.length, 1);
      assert.equal(failRes.rows[0].blocked, false);
      assert.equal(failRes.rows[0].attempts, 1);

      // 3. Clear rate limit
      await appPool.query("SELECT public.login_rate_limit_clear('test:key:1');");
      const postClearRes = await appPool.query("SELECT * FROM public.login_rate_limit_status('test:key:1');");
      assert.equal(postClearRes.rows[0].blocked, false);
    });
  });

  // ==========================================================================
  // PHASE 5: POSTGRESQL ADAPTER QUERY BUILDER CRUD & FEATURES
  // ==========================================================================
  describe("Phase 5: PostgreSQL Adapter Integration with Real Database", () => {
    let createdCategoryId: string;
    let createdProductId: string;

    it("inserts a record and returns full row using .insert().select().single()", async () => {
      const { data, error } = await appExecutor
        .from("categories")
        .insert({
          name: "Live Audio Visual Equipment",
          code: "LAVE",
          description: "Microphones, speakers, amplifiers",
          is_active: true,
        })
        .select()
        .single();

      assert.equal(error, null);
      assert.ok(data);
      assert.ok(data.id, "ID must be generated");
      assert.equal(typeof data.id, "string");
      assert.equal(data.name, "Live Audio Visual Equipment");
      assert.equal(data.code, "LAVE");
      createdCategoryId = data.id;
    });

    it("queries using .eq() and .single()", async () => {
      const { data, error } = await appExecutor
        .from("categories")
        .select("*")
        .eq("id", createdCategoryId)
        .single();

      assert.equal(error, null);
      assert.ok(data);
      assert.equal(data.id, createdCategoryId);
      assert.equal(data.code, "LAVE");
    });

    it("inserts product with financial precision and default UUID", async () => {
      const { data, error } = await appExecutor
        .from("products")
        .insert({
          name: "JBL EON 615 Powered Speaker",
          sku: "JBL-EON-615-001",
          category_id: createdCategoryId,
          unit: "Nos",
          default_rental_rate: 750.50,
          rental_rate_unit: "PER_DAY",
          security_deposit_amount: 5000.00,
          total_owned_quantity: 10,
          available_quantity: 10,
          is_active: true,
        })
        .select()
        .single();

      assert.equal(error, null);
      assert.ok(data);
      assert.ok(data.id);
      assert.equal(data.name, "JBL EON 615 Powered Speaker");
      assert.equal(Number(data.default_rental_rate), 750.50);
      assert.equal(Number(data.security_deposit_amount), 5000.00);
      assert.equal(data.total_owned_quantity, 10);
      createdProductId = data.id;
    });

    it("updates product stock and checks updated row", async () => {
      const { data, error } = await appExecutor
        .from("products")
        .update({ available_quantity: 8, rented_quantity: 2 })
        .eq("id", createdProductId)
        .select()
        .single();

      assert.equal(error, null);
      assert.ok(data);
      assert.equal(data.available_quantity, 8);
      assert.equal(data.rented_quantity, 2);
    });

    it("supports .in() filter", async () => {
      const { data, error } = await appExecutor
        .from("products")
        .select("id, name, sku")
        .in("sku", ["JBL-EON-615-001", "NON-EXISTENT-SKU"]);

      assert.equal(error, null);
      assert.equal(data.length, 1);
      assert.equal(data[0].sku, "JBL-EON-615-001");
    });

    it("supports .ilike() case-insensitive pattern matching", async () => {
      const { data, error } = await appExecutor
        .from("products")
        .select("id, name")
        .ilike("name", "%powered speaker%");

      assert.equal(error, null);
      assert.equal(data.length, 1);
      assert.equal(data[0].name, "JBL EON 615 Powered Speaker");
    });

    it("supports .or() complex disjunction filtering", async () => {
      const { data, error } = await appExecutor
        .from("products")
        .select("id, name, sku")
        .or("sku.eq.JBL-EON-615-001,name.ilike.%Missing Item%");

      assert.equal(error, null);
      assert.equal(data.length, 1);
      assert.equal(data[0].sku, "JBL-EON-615-001");
    });

    it("supports .maybeSingle() returning null when row does not exist", async () => {
      const { data, error } = await appExecutor
        .from("products")
        .select("*")
        .eq("id", "c0000000-0000-0000-0000-000000000000")
        .maybeSingle();

      assert.equal(error, null);
      assert.equal(data, null);
    });

    it("handles JSONB columns seamlessly with object serialization", async () => {
      const { data, error } = await appExecutor
        .from("users")
        .insert({
          email: "admin-test-real-db@tamilnadusuppliers.com",
          password_hash: "hashed_secret_test",
          name: "Real DB Admin",
          role: "ADMIN",
          status: "ACTIVE",
          permissions: ["manage_inventory", "create_bills", "view_reports"],
        })
        .select()
        .single();

      assert.equal(error, null);
      assert.ok(data);
      assert.equal(data.email, "admin-test-real-db@tamilnadusuppliers.com");
      assert.ok(Array.isArray(data.permissions));
      assert.deepEqual(data.permissions, ["manage_inventory", "create_bills", "view_reports"]);
    });

    it("executes RPC functions through postgresExecutor.rpc()", async () => {
      const res = await appExecutor.rpc("login_rate_limit_record_failure", {
        p_key: "ip:127.0.0.1",
        p_max: 5,
        p_window_seconds: 900,
        p_lockout_seconds: 1800,
      });

      assert.equal(res.error, null);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data));
      assert.equal(res.data.length, 1);
      assert.equal(res.data[0].attempts, 1);
      assert.equal(res.data[0].blocked, false);

      // Clear via RPC
      const clearRes = await appExecutor.rpc("login_rate_limit_clear", {
        p_key: "ip:127.0.0.1",
      });
      assert.equal(clearRes.error, null);
    });

    it("catches errors gracefully on constraint violation", async () => {
      const res = await appExecutor
        .from("users")
        .insert({
          email: "admin-test-real-db@tamilnadusuppliers.com", // Duplicate unique email
          password_hash: "pass2",
          name: "Duplicate User",
          role: "EMPLOYEE",
        });

      assert.ok(res.error);
      assert.equal(res.error.code, "23505"); // unique_violation
    });

    it("deletes records cleanly", async () => {
      const { error: delProdErr } = await appExecutor
        .from("products")
        .delete()
        .eq("id", createdProductId);
      assert.equal(delProdErr, null);

      const { data: verifyProd } = await appExecutor
        .from("products")
        .select("id")
        .eq("id", createdProductId)
        .maybeSingle();
      assert.equal(verifyProd, null);

      const { error: delCatErr } = await appExecutor
        .from("categories")
        .delete()
        .eq("id", createdCategoryId);
      assert.equal(delCatErr, null);
    });
  });
});
