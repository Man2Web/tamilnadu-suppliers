import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PostgresExecutor,
  PostgresQueryBuilder,
  assertValidIdentifier,
  serializePgParam,
  safeParseTimestamp,
  splitOrExpression,
  KNOWN_APPLICATION_TABLES,
  KNOWN_RPC_FUNCTIONS,
} from "../../src/lib/db/postgresClient";
import store from "../../src/lib/db/store";

describe("PostgreSQL Adapter & Query Builder Unit Tests (Batch 2 & 2A/2B Fixes)", () => {
  // Helper to create a mock executor that captures queries and returns custom results
  function createMockExecutor(mockResponse: { rows?: any[]; rowCount?: number } = { rows: [], rowCount: 0 }) {
    const executed: { sql: string; params: any[] }[] = [];
    const runner = async (sql: string, params: any[]) => {
      executed.push({ sql, params });
      return {
        rows: mockResponse.rows || [],
        rowCount: mockResponse.rowCount ?? (mockResponse.rows?.length || 0),
        command: "MOCK",
        oid: 0,
        fields: [],
      };
    };
    const executor = new PostgresExecutor(runner);
    return { executor, executed };
  }

  // --------------------------------------------------------------------------
  // 1. Identifier Validation & SQL Injection Prevention
  // --------------------------------------------------------------------------
  describe("1. Identifier Validation & SQL Injection Prevention", () => {
    it("allows valid known table names", () => {
      for (const table of KNOWN_APPLICATION_TABLES) {
        assert.equal(assertValidIdentifier(table, "table"), table);
      }
    });

    it("rejects unallowlisted table names", () => {
      assert.throws(
        () => assertValidIdentifier("pg_shadow", "table"),
        /Unauthorized table name: "pg_shadow"/
      );
      assert.throws(
        () => assertValidIdentifier("information_schema", "table"),
        /Unauthorized table name: "information_schema"/
      );
      assert.throws(
        () => assertValidIdentifier("custom_table", "table"),
        /Unauthorized table name: "custom_table"/
      );
    });

    it("rejects table names with SQL injection characters", () => {
      assert.throws(() => assertValidIdentifier("users; DROP TABLE users;--", "table"));
      assert.throws(() => assertValidIdentifier("users' OR '1'='1", "table"));
      assert.throws(() => assertValidIdentifier("users/*comment*/", "table"));
      assert.throws(() => assertValidIdentifier("users companies", "table"));
      assert.throws(() => assertValidIdentifier("", "table"));
    });

    it("allows valid column names", () => {
      assert.equal(assertValidIdentifier("id", "column"), "id");
      assert.equal(assertValidIdentifier("created_at", "column"), "created_at");
      assert.equal(assertValidIdentifier("billing_address", "column"), "billing_address");
      assert.equal(assertValidIdentifier("col_123", "column"), "col_123");
    });

    it("rejects column names with SQL injection characters", () => {
      assert.throws(() => assertValidIdentifier("id; DROP TABLE users;", "column"));
      assert.throws(() => assertValidIdentifier("id, (SELECT 1)", "column"));
      assert.throws(() => assertValidIdentifier("id' OR 1=1--", "column"));
      assert.throws(() => assertValidIdentifier("id name", "column"));
      assert.throws(() => assertValidIdentifier("1id", "column"));
    });

    it("validates RPC function names against allowlist", () => {
      for (const fn of KNOWN_RPC_FUNCTIONS) {
        assert.equal(assertValidIdentifier(fn, "function"), fn);
      }
      assert.throws(
        () => assertValidIdentifier("unauthorized_proc", "function"),
        /Unauthorized function name/
      );
      assert.throws(
        () => assertValidIdentifier("login_rate_limit_status; DROP TABLE users;", "function")
      );
    });

    it("validates RPC argument names", () => {
      assert.equal(assertValidIdentifier("p_key", "argument"), "p_key");
      assert.equal(assertValidIdentifier("p_max", "argument"), "p_max");
      assert.throws(() => assertValidIdentifier("p_key'--", "argument"));
      assert.throws(() => assertValidIdentifier("arg 1", "argument"));
    });
  });

  // --------------------------------------------------------------------------
  // 2. Parameter Serialization & Safe Type Parsing
  // --------------------------------------------------------------------------
  describe("2. Parameter Serialization & Safe Type Parsing", () => {
    it("preserves primitives (strings, numbers, booleans)", () => {
      assert.equal(serializePgParam("hello"), "hello");
      assert.equal(serializePgParam(42), 42);
      assert.equal(serializePgParam(0), 0);
      assert.equal(serializePgParam(true), true);
      assert.equal(serializePgParam(false), false);
    });

    it("converts undefined and null to null", () => {
      assert.equal(serializePgParam(null), null);
      assert.equal(serializePgParam(undefined), null);
    });

    it("formats Date instances to ISO 8601 strings", () => {
      const d = new Date("2026-10-26T12:00:00.000Z");
      assert.equal(serializePgParam(d), "2026-10-26T12:00:00.000Z");
    });

    it("serializes plain objects to JSON strings for JSONB", () => {
      const obj = { name: "Tamilnadu Suppliers", gstin: "33AAAAA0000A1Z5" };
      assert.equal(serializePgParam(obj), JSON.stringify(obj));
    });

    it("serializes arrays to JSON strings for JSONB", () => {
      const arr = ["QUOTATIONS_VIEW", "BILLS_MANAGE"];
      assert.equal(serializePgParam(arr), JSON.stringify(arr));
    });

    // Task 3: Safe timestamp parsing tests
    it("safeParseTimestamp handles ordinary ISO timestamps", () => {
      const res = safeParseTimestamp("2026-10-26 12:00:00+00");
      assert.equal(res, "2026-10-26T12:00:00.000Z");
    });

    it("safeParseTimestamp handles infinity and -infinity without throwing RangeError", () => {
      assert.equal(safeParseTimestamp("infinity"), "infinity");
      assert.equal(safeParseTimestamp("-infinity"), "-infinity");
    });

    it("safeParseTimestamp handles null and undefined safely", () => {
      assert.equal(safeParseTimestamp(null), null);
      assert.equal(safeParseTimestamp(undefined), null);
      assert.equal(safeParseTimestamp(""), "");
    });

    it("safeParseTimestamp preserves invalid timestamp strings without throwing or converting to false date", () => {
      const raw = "not-a-valid-timestamp";
      assert.equal(safeParseTimestamp(raw), raw);
    });
  });

  // --------------------------------------------------------------------------
  // 3. SELECT Query Generation & Strict Fail-Closed .or() Parsing
  // --------------------------------------------------------------------------
  describe("3. SELECT Query Generation & Strict Fail-Closed .or() Parsing", () => {
    it("generates SELECT * FROM public.table without conditions", () => {
      const { executor } = createMockExecutor();
      const q = executor.from("products").select().buildQuery();
      assert.equal(q.sql, 'SELECT * FROM public."products"');
      assert.deepEqual(q.params, []);
    });

    it("generates SELECT with specific quoted columns", () => {
      const { executor } = createMockExecutor();
      const q = executor.from("products").select("id, name, unit_price").buildQuery();
      assert.equal(q.sql, 'SELECT "id", "name", "unit_price" FROM public."products"');
      assert.deepEqual(q.params, []);
    });

    it("parameterizes eq() conditions", () => {
      const { executor } = createMockExecutor();
      const q = executor.from("products").select("*").eq("category_id", "cat-123").buildQuery();
      assert.equal(q.sql, 'SELECT * FROM public."products" WHERE "category_id" = $1');
      assert.deepEqual(q.params, ["cat-123"]);
    });

    it("handles eq(col, null) as IS NULL without adding a parameter", () => {
      const { executor } = createMockExecutor();
      const q = executor.from("sessions").select("*").eq("rejected_at", null).buildQuery();
      assert.equal(q.sql, 'SELECT * FROM public."sessions" WHERE "rejected_at" IS NULL');
      assert.deepEqual(q.params, []);
    });

    it("parameterizes neq() conditions", () => {
      const { executor } = createMockExecutor();
      const q = executor.from("users").select("*").neq("role", "SUPER_ADMIN").buildQuery();
      assert.equal(q.sql, 'SELECT * FROM public."users" WHERE "role" != $1');
      assert.deepEqual(q.params, ["SUPER_ADMIN"]);
    });

    it("handles neq(col, null) as IS NOT NULL", () => {
      const { executor } = createMockExecutor();
      const q = executor.from("users").select("*").neq("phone", null).buildQuery();
      assert.equal(q.sql, 'SELECT * FROM public."users" WHERE "phone" IS NOT NULL');
      assert.deepEqual(q.params, []);
    });

    it("parameterizes in() with multiple values", () => {
      const { executor } = createMockExecutor();
      const q = executor.from("categories").select("*").in("id", ["c1", "c2", "c3"]).buildQuery();
      assert.equal(q.sql, 'SELECT * FROM public."categories" WHERE "id" IN ($1, $2, $3)');
      assert.deepEqual(q.params, ["c1", "c2", "c3"]);
    });

    it("handles in() with empty array safely via 1=0", () => {
      const { executor } = createMockExecutor();
      const q = executor.from("categories").select("*").in("id", []).buildQuery();
      assert.equal(q.sql, 'SELECT * FROM public."categories" WHERE 1=0');
      assert.deepEqual(q.params, []);
    });

    it("parameterizes ilike() conditions", () => {
      const { executor } = createMockExecutor();
      const q = executor.from("customers").select("*").ilike("name", "%pipe%").buildQuery();
      assert.equal(q.sql, 'SELECT * FROM public."customers" WHERE "name" ILIKE $1');
      assert.deepEqual(q.params, ["%pipe%"]);
    });

    // Task 1: Comprehensive .or() tests
    it("supports verified application .or() pattern: id.eq.<val>,sku.eq.<val>", () => {
      const { executor } = createMockExecutor();
      const q = executor.from("products").select("*").or("id.eq.p1,sku.eq.p1").buildQuery();
      assert.equal(q.sql, 'SELECT * FROM public."products" WHERE ("id" = $1 OR "sku" = $2)');
      assert.deepEqual(q.params, ["p1", "p1"]);
    });

    it("correctly handles supported quoted values containing commas inside .or()", () => {
      const { executor } = createMockExecutor();
      const q = executor
        .from("products")
        .select("*")
        .or('id.eq."VAL,WITH,COMMA",sku.eq."ANOTHER,ONE"')
        .buildQuery();
      assert.equal(q.sql, 'SELECT * FROM public."products" WHERE ("id" = $1 OR "sku" = $2)');
      assert.deepEqual(q.params, ["VAL,WITH,COMMA", "ANOTHER,ONE"]);
    });

    it("fails closed on empty or whitespace .or() expression", () => {
      const { executor } = createMockExecutor();
      assert.throws(() => executor.from("products").select("*").or(""), /Empty or missing \.or\(\) expression/);
      assert.throws(() => executor.from("products").select("*").or("   "), /Empty or missing \.or\(\) expression/);
    });

    it("fails closed on malformed subclauses or unsupported operators in .or()", () => {
      const { executor } = createMockExecutor();
      // Unsupported operator (gt)
      assert.throws(
        () => executor.from("products").select("*").or("id.gt.5,sku.eq.p1"),
        /Unsupported or malformed \.or\(\) subclause/
      );
      // Malformed without operator
      assert.throws(
        () => executor.from("products").select("*").or("not_a_valid_expression"),
        /Unsupported or malformed \.or\(\) subclause/
      );
      // Trailing comma
      assert.throws(
        () => executor.from("products").select("*").or("id.eq.p1,"),
        /Malformed \.or\(\) expression: trailing comma/
      );
      // Empty clause between commas
      assert.throws(
        () => executor.from("products").select("*").or("id.eq.p1,,sku.eq.p2"),
        /Malformed \.or\(\) expression: empty clause between commas/
      );
      // Unclosed quote
      assert.throws(
        () => executor.from("products").select("*").or('id.eq."unclosed_quote,sku.eq.p2'),
        /Malformed \.or\(\) expression: unclosed quote/
      );
    });

    it("fails closed on SQL injection attempts in .or() column names", () => {
      const { executor } = createMockExecutor();
      assert.throws(
        () => executor.from("products").select("*").or("id' OR 1=1--.eq.p1"),
        /POSTGRES ADAPTER SECURITY ERROR/
      );
      assert.throws(
        () => executor.from("products").select("*").or("id; DROP TABLE users;--.eq.p1"),
        /POSTGRES ADAPTER SECURITY ERROR/
      );
    });

    it("supports multiple .order() clauses and direction options", () => {
      const { executor } = createMockExecutor();
      const q = executor
        .from("activity_notifications")
        .select("*")
        .order("is_read", { ascending: true })
        .order("created_at", { ascending: false })
        .buildQuery();
      assert.equal(
        q.sql,
        'SELECT * FROM public."activity_notifications" ORDER BY "is_read" ASC, "created_at" DESC'
      );
    });

    it("supports nulls ordering options in .order()", () => {
      const { executor } = createMockExecutor();
      const q = executor
        .from("users")
        .select("*")
        .order("last_login_at", { ascending: false, nullsFirst: false })
        .buildQuery();
      assert.equal(q.sql, 'SELECT * FROM public."users" ORDER BY "last_login_at" DESC NULLS LAST');
    });

    it("supports limit()", () => {
      const { executor } = createMockExecutor();
      const q = executor.from("audit_logs").select("*").limit(25).buildQuery();
      assert.equal(q.sql, 'SELECT * FROM public."audit_logs" LIMIT 25');
    });

    it("supports head count query: .select('*', { count: 'exact', head: true })", async () => {
      const { executor, executed } = createMockExecutor({ rows: [{ count: "42" }] });
      const res = await executor
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("role", "SUPER_ADMIN");

      assert.equal(executed.length, 1);
      assert.equal(
        executed[0].sql,
        'SELECT COUNT(*)::int AS count FROM public."users" WHERE "role" = $1'
      );
      assert.deepEqual(executed[0].params, ["SUPER_ADMIN"]);
      assert.equal(res.count, 42);
      assert.equal(res.data, null);
      assert.equal(res.error, null);
    });
  });

  // --------------------------------------------------------------------------
  // 4. single() and maybeSingle() Semantics
  // --------------------------------------------------------------------------
  describe("4. single() and maybeSingle() Semantics", () => {
    it("single() returns the object when exactly 1 row is returned", async () => {
      const mockRow = { id: "comp-1", name: "Tamilnadu Suppliers" };
      const { executor, executed } = createMockExecutor({ rows: [mockRow] });

      const res = await executor.from("companies").select("*").eq("id", "comp-1").single();

      assert.equal(executed[0].sql, 'SELECT * FROM public."companies" WHERE "id" = $1 LIMIT 2');
      assert.deepEqual(res.data, mockRow);
      assert.equal(res.error, null);
    });

    it("single() returns PGRST116 error when 0 rows are returned", async () => {
      const { executor } = createMockExecutor({ rows: [] });

      const res = await executor.from("companies").select("*").eq("id", "missing").single();

      assert.equal(res.data, null);
      assert.ok(res.error);
      assert.equal(res.error.code, "PGRST116");
      assert.match(res.error.message, /multiple \(or no\) rows returned/i);
    });

    it("single() returns PGRST116 error when 2 or more rows are returned", async () => {
      const row1 = { id: "1", name: "A" };
      const row2 = { id: "2", name: "B" };
      const { executor } = createMockExecutor({ rows: [row1, row2] });

      const res = await executor.from("companies").select("*").single();

      assert.equal(res.data, null);
      assert.ok(res.error);
      assert.equal(res.error.code, "PGRST116");
      assert.match(res.error.details || "", /contains 2 rows/i);
    });

    it("maybeSingle() returns data when 1 row is returned", async () => {
      const mockRow = { id: "p1", name: "Product 1" };
      const { executor } = createMockExecutor({ rows: [mockRow] });

      const res = await executor.from("products").select("*").eq("id", "p1").maybeSingle();

      assert.deepEqual(res.data, mockRow);
      assert.equal(res.error, null);
    });

    it("maybeSingle() returns null data and null error when 0 rows are returned", async () => {
      const { executor } = createMockExecutor({ rows: [] });

      const res = await executor.from("products").select("*").eq("id", "missing").maybeSingle();

      assert.equal(res.data, null);
      assert.equal(res.error, null);
    });

    it("maybeSingle() returns PGRST116 error when 2 or more rows are returned", async () => {
      const row1 = { id: "1" };
      const row2 = { id: "2" };
      const { executor } = createMockExecutor({ rows: [row1, row2] });

      const res = await executor.from("products").select("*").maybeSingle();

      assert.equal(res.data, null);
      assert.ok(res.error);
      assert.equal(res.error.code, "PGRST116");
    });
  });

  // --------------------------------------------------------------------------
  // 5. INSERT Queries & Heterogeneous Bulk Inserts
  // --------------------------------------------------------------------------
  describe("5. INSERT Queries & Heterogeneous Bulk Inserts", () => {
    it("generates parameterized single-row INSERT with RETURNING *", () => {
      const { executor } = createMockExecutor();
      const q = executor
        .from("companies")
        .insert({
          id: "comp-1",
          name: "Tamilnadu Suppliers",
          gst_type: "GST_REGISTERED",
          is_active: true,
        })
        .buildQuery();

      assert.equal(
        q.sql,
        'INSERT INTO public."companies" ("id", "name", "gst_type", "is_active") VALUES ($1, $2, $3, $4) RETURNING *'
      );
      assert.deepEqual(q.params, ["comp-1", "Tamilnadu Suppliers", "GST_REGISTERED", true]);
    });

    // Task 2: Heterogeneous bulk insert union tests
    it("computes the union of keys for heterogeneous bulk inserts without dropping fields", () => {
      const { executor } = createMockExecutor();
      const items = [
        { id: "i1", quotation_id: "q1", item_name: "Item 1" }, // missing size_spec & unit_price
        { id: "i2", quotation_id: "q1", item_name: "Item 2", size_spec: "10mm", unit_price: 200 },
      ];
      const q = executor.from("quotation_items").insert(items).buildQuery();

      assert.equal(
        q.sql,
        'INSERT INTO public."quotation_items" ("id", "quotation_id", "item_name", "size_spec", "unit_price") VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10) RETURNING *'
      );
      // Row 1 gets null for size_spec and unit_price
      assert.deepEqual(q.params, [
        "i1", "q1", "Item 1", null, null,
        "i2", "q1", "Item 2", "10mm", 200,
      ]);
    });

    it("handles explicit null values in bulk insert rows", () => {
      const { executor } = createMockExecutor();
      const items = [
        { id: "i1", notes: null },
        { id: "i2", notes: "Has note" },
      ];
      const q = executor.from("quotations").insert(items).buildQuery();
      assert.equal(q.sql, 'INSERT INTO public."quotations" ("id", "notes") VALUES ($1, $2), ($3, $4) RETURNING *');
      assert.deepEqual(q.params, ["i1", null, "i2", "Has note"]);
    });

    it("safely handles an empty insert array", () => {
      const { executor } = createMockExecutor();
      const q = executor.from("quotation_items").insert([]).buildQuery();
      assert.equal(q.sql, "SELECT 1 WHERE 1=0");
      assert.deepEqual(q.params, []);
    });

    it("supports .insert().select().single() returning the created object", async () => {
      const insertedRow = { id: "comp-1", name: "Tamilnadu Suppliers" };
      const { executor, executed } = createMockExecutor({ rows: [insertedRow] });

      const res = await executor
        .from("companies")
        .insert({ name: "Tamilnadu Suppliers" })
        .select()
        .single();

      assert.equal(executed.length, 1);
      assert.equal(
        executed[0].sql,
        'INSERT INTO public."companies" ("name") VALUES ($1) RETURNING *'
      );
      assert.deepEqual(res.data, insertedRow);
      assert.equal(res.error, null);
    });

    it("serializes JSONB fields in INSERT", () => {
      const { executor } = createMockExecutor();
      const q = executor
        .from("quotations")
        .insert({
          id: "q-1",
          company_snapshot: { name: "TS", phone: "123" },
          document_lines: [{ pos: 1, text: "Note line" }],
        })
        .buildQuery();

      assert.equal(
        q.sql,
        'INSERT INTO public."quotations" ("id", "company_snapshot", "document_lines") VALUES ($1, $2, $3) RETURNING *'
      );
      assert.equal(q.params[1], JSON.stringify({ name: "TS", phone: "123" }));
      assert.equal(q.params[2], JSON.stringify([{ pos: 1, text: "Note line" }]));
    });
  });

  // --------------------------------------------------------------------------
  // 6. UPDATE Queries
  // --------------------------------------------------------------------------
  describe("6. UPDATE Queries", () => {
    it("generates parameterized UPDATE with correct parameter offsets for WHERE", () => {
      const { executor } = createMockExecutor();
      const q = executor
        .from("companies")
        .update({ name: "New Name", phone: "9876543210" })
        .eq("id", "comp-1")
        .buildQuery();

      assert.equal(
        q.sql,
        'UPDATE public."companies" SET "name" = $1, "phone" = $2 WHERE "id" = $3 RETURNING *'
      );
      assert.deepEqual(q.params, ["New Name", "9876543210", "comp-1"]);
    });

    it("supports .update().eq().select().single()", async () => {
      const updatedRow = { id: "comp-1", name: "New Name", phone: "9876543210" };
      const { executor, executed } = createMockExecutor({ rows: [updatedRow] });

      const res = await executor
        .from("companies")
        .update({ name: "New Name" })
        .eq("id", "comp-1")
        .select()
        .single();

      assert.equal(executed.length, 1);
      assert.deepEqual(res.data, updatedRow);
      assert.equal(res.error, null);
    });

    it("returns PGRST116 when update single() finds 0 affected rows", async () => {
      const { executor } = createMockExecutor({ rows: [] });

      const res = await executor
        .from("companies")
        .update({ name: "New Name" })
        .eq("id", "missing")
        .select()
        .single();

      assert.equal(res.data, null);
      assert.ok(res.error);
      assert.equal(res.error.code, "PGRST116");
    });
  });

  // --------------------------------------------------------------------------
  // 7. DELETE Queries & RETURNING Contract
  // --------------------------------------------------------------------------
  describe("7. DELETE Queries & RETURNING Contract", () => {
    // Task 4: Delete returning behavior tests
    it("plain delete() emits NO RETURNING clause and returns data: null", async () => {
      const { executor, executed } = createMockExecutor({ rowCount: 1 });
      const res = await executor.from("companies").delete().eq("id", "comp-1");

      assert.equal(executed.length, 1);
      assert.equal(executed[0].sql, 'DELETE FROM public."companies" WHERE "id" = $1');
      assert.deepEqual(executed[0].params, ["comp-1"]);
      assert.equal(res.data, null);
      assert.equal(res.error, null);
    });

    it("delete().select() emits RETURNING * and returns deleted rows array", async () => {
      const deletedRows = [{ id: "comp-1", name: "Deleted Comp" }];
      const { executor, executed } = createMockExecutor({ rows: deletedRows, rowCount: 1 });

      const res = await executor.from("companies").delete().eq("id", "comp-1").select();

      assert.equal(executed.length, 1);
      assert.equal(executed[0].sql, 'DELETE FROM public."companies" WHERE "id" = $1 RETURNING *');
      assert.deepEqual(executed[0].params, ["comp-1"]);
      assert.deepEqual(res.data, deletedRows);
      assert.equal(res.error, null);
    });

    it("delete().select('id, name') emits specific RETURNING columns", () => {
      const { executor } = createMockExecutor();
      const q = executor.from("companies").delete().eq("id", "comp-1").select("id, name").buildQuery();
      assert.equal(q.sql, 'DELETE FROM public."companies" WHERE "id" = $1 RETURNING "id", "name"');
      assert.deepEqual(q.params, ["comp-1"]);
    });

    it("zero affected rows on delete().select() returns empty array data: []", async () => {
      const { executor } = createMockExecutor({ rows: [], rowCount: 0 });
      const res = await executor.from("companies").delete().eq("id", "missing").select();

      assert.deepEqual(res.data, []);
      assert.equal(res.error, null);
    });

    it("supports DELETE with multiple WHERE conditions", () => {
      const { executor } = createMockExecutor();
      const q = executor
        .from("quotation_items")
        .delete()
        .eq("quotation_id", "q-1")
        .neq("id", "item-preserved")
        .buildQuery();

      assert.equal(
        q.sql,
        'DELETE FROM public."quotation_items" WHERE "quotation_id" = $1 AND "id" != $2'
      );
      assert.deepEqual(q.params, ["q-1", "item-preserved"]);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Stored Functions / RPC Calls
  // --------------------------------------------------------------------------
  describe("8. Stored Functions / RPC Calls", () => {
    it("invokes login_rate_limit_record_failure with explicit named parameters", async () => {
      const mockResult = [{ blocked: false, retry_after_seconds: 0, attempts: 1 }];
      const { executor, executed } = createMockExecutor({ rows: mockResult });

      const res = await executor.rpc("login_rate_limit_record_failure", {
        p_key: "ip:127.0.0.1",
        p_max: 5,
        p_window_seconds: 900,
        p_lockout_seconds: 900,
      });

      assert.equal(executed.length, 1);
      assert.equal(
        executed[0].sql,
        'SELECT * FROM public."login_rate_limit_record_failure"("p_key" => $1, "p_max" => $2, "p_window_seconds" => $3, "p_lockout_seconds" => $4)'
      );
      assert.deepEqual(executed[0].params, ["ip:127.0.0.1", 5, 900, 900]);
      assert.deepEqual(res.data, mockResult);
      assert.equal(res.error, null);
    });

    it("invokes login_rate_limit_status with named parameter", async () => {
      const mockResult = [{ blocked: true, retry_after_seconds: 450 }];
      const { executor, executed } = createMockExecutor({ rows: mockResult });

      const res = await executor.rpc("login_rate_limit_status", {
        p_key: "u:admin_hash",
      });

      assert.equal(
        executed[0].sql,
        'SELECT * FROM public."login_rate_limit_status"("p_key" => $1)'
      );
      assert.deepEqual(executed[0].params, ["u:admin_hash"]);
      assert.deepEqual(res.data, mockResult);
      assert.equal(res.error, null);
    });

    it("invokes login_rate_limit_clear", async () => {
      const { executor, executed } = createMockExecutor({ rows: [] });

      const res = await executor.rpc("login_rate_limit_clear", {
        p_key: "u:admin_hash",
      });

      assert.equal(
        executed[0].sql,
        'SELECT * FROM public."login_rate_limit_clear"("p_key" => $1)'
      );
      assert.deepEqual(executed[0].params, ["u:admin_hash"]);
      assert.equal(res.error, null);
    });

    it("rejects unauthorized RPC function names", async () => {
      const { executor } = createMockExecutor();
      const res = await executor.rpc("unauthorized_function", {});
      assert.equal(res.data, null);
      assert.ok(res.error);
      assert.match(res.error.message, /Unauthorized function name/i);
    });
  });

  // --------------------------------------------------------------------------
  // 9. Error Handling & Runner Exceptions
  // --------------------------------------------------------------------------
  describe("9. Error Handling & Runner Exceptions", () => {
    it("catches runner exceptions and formats error object without throwing", async () => {
      const failingRunner = async () => {
        const err: any = new Error("Connection terminated unexpectedly");
        err.code = "57P01";
        throw err;
      };
      const executor = new PostgresExecutor(failingRunner);

      const res = await executor.from("users").select("*");

      assert.equal(res.data, null);
      assert.ok(res.error);
      assert.equal(res.error.message, "Connection terminated unexpectedly");
      assert.equal(res.error.code, "57P01");
      assert.equal(res.status, 500);
    });
  });

  // --------------------------------------------------------------------------
  // 10. Store Interface: getGatePassesByBillId (Task 5)
  // --------------------------------------------------------------------------
  describe("10. Store Interface: getGatePassesByBillId", () => {
    it("exposes getGatePassesByBillId on store instance without direct .supabase access", () => {
      assert.equal(typeof (store as any).getGatePassesByBillId, "function");
    });
  });

  // --------------------------------------------------------------------------
  // 11. Rate Limiting Provider Routing (Task 6)
  // --------------------------------------------------------------------------
  describe("11. Rate Limiting Provider Routing", () => {
    it("preserves Supabase as default provider when DB_PROVIDER is unset", async () => {
      const { resolveDbProvider } = await import("../../src/lib/db/provider");
      assert.equal(resolveDbProvider({}), "supabase");
      assert.equal(resolveDbProvider({ DB_PROVIDER: "" }), "supabase");
      assert.equal(resolveDbProvider({ DB_PROVIDER: "supabase" }), "supabase");
    });

    it("resolves to postgres when DB_PROVIDER='postgres'", async () => {
      const { resolveDbProvider } = await import("../../src/lib/db/provider");
      const validUrl = "postgresql://user:pass@10.0.0.1:5432/tamilnadu_suppliers";
      assert.equal(
        resolveDbProvider({ DB_PROVIDER: "postgres", DATABASE_URL: validUrl }),
        "postgres"
      );
    });
  });
});
