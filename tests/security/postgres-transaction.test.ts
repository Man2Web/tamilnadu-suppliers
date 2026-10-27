// ============================================================================
// POSTGRESQL TRANSACTION INFRASTRUCTURE UNIT TESTS
// Verifies all 9 Batch 5.3B transaction guarantees using mock clients & pools.
// Does NOT connect to any database.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PostgresExecutor,
  PostgresClientLike,
  PostgresPoolLike,
} from "../../src/lib/db/postgresClient";

interface MockQueryLog {
  sql: string;
  params?: any[];
}

function createMockClient(options?: {
  onQuery?: (sql: string, params?: any[]) => any;
  failRollback?: boolean;
}) {
  const queryLogs: MockQueryLog[] = [];
  let released = false;

  const client: PostgresClientLike = {
    query: async (sql: string, params?: any[]) => {
      queryLogs.push({ sql, params });
      if (options?.failRollback && sql === "ROLLBACK") {
        throw new Error("Simulated database failure during ROLLBACK");
      }
      if (options?.onQuery) {
        return options.onQuery(sql, params);
      }
      return { rows: [], rowCount: 0, command: "SELECT" };
    },
    release: () => {
      released = true;
    },
  };

  return { client, queryLogs, isReleased: () => released };
}

function createMockPool(clientFactory: () => PostgresClientLike) {
  const poolQueries: MockQueryLog[] = [];
  let connectCount = 0;

  const pool: PostgresPoolLike = {
    connect: async () => {
      connectCount++;
      return clientFactory() as any;
    },
    query: async (sql: string, params?: any[]) => {
      poolQueries.push({ sql, params });
      return { rows: [], rowCount: 0, command: "SELECT" };
    },
  };

  return { pool, poolQueries, getConnectCount: () => connectCount };
}

describe("Batch 5.3B — Stage 2: Transaction Infrastructure Unit Tests", () => {
  // Test 1: Successful commit
  it("1. successfully commits a transaction and releases the dedicated client", async () => {
    const mock = createMockClient();
    const { pool, poolQueries } = createMockPool(() => mock.client);
    const executor = new PostgresExecutor(pool);

    const result = await executor.transaction(async (tx) => {
      assert.equal(tx.inTransaction, true);
      const res = await tx.from("quotations").select();
      assert.equal(res.status, 200);
      return "SUCCESS_RESULT";
    });

    assert.equal(result, "SUCCESS_RESULT");
    assert.equal(mock.isReleased(), true, "Client must be released upon successful commit");
    assert.equal(poolQueries.length, 0, "No queries should run directly against the pool");

    const sqlStatements = mock.queryLogs.map((l) => l.sql);
    assert.equal(sqlStatements[0], "BEGIN", "First statement must be BEGIN");
    assert.match(sqlStatements[1], /SELECT .* FROM public\."quotations"/, "Query must execute on dedicated client");
    assert.equal(sqlStatements[2], "COMMIT", "Final statement must be COMMIT");
  });

  // Test 2: Callback error triggers rollback
  it("2. triggers ROLLBACK when callback throws, and releases client without committing", async () => {
    const mock = createMockClient();
    const { pool, poolQueries } = createMockPool(() => mock.client);
    const executor = new PostgresExecutor(pool);

    await assert.rejects(
      async () => {
        await executor.transaction(async (tx) => {
          await tx.from("bills").select();
          throw new Error("Intentional error inside transaction");
        });
      },
      (err: any) => {
        assert.equal(err.message, "Intentional error inside transaction");
        return true;
      }
    );

    assert.equal(mock.isReleased(), true, "Client must be released on failure");
    assert.equal(poolQueries.length, 0, "Pool queries must not be called");

    const sqlStatements = mock.queryLogs.map((l) => l.sql);
    assert.equal(sqlStatements[0], "BEGIN");
    assert.match(sqlStatements[1], /SELECT .* FROM public\."bills"/);
    assert.equal(sqlStatements[2], "ROLLBACK", "Must execute ROLLBACK upon error");
    assert.ok(!sqlStatements.includes("COMMIT"), "COMMIT must never be called on failure");
  });

  // Test 3: Rollback failure preserves original callback error
  it("3. preserves and re-throws original error if ROLLBACK also fails", async () => {
    const mock = createMockClient({ failRollback: true });
    const { pool } = createMockPool(() => mock.client);
    const executor = new PostgresExecutor(pool);

    await assert.rejects(
      async () => {
        await executor.transaction(async (tx) => {
          await tx.from("payments").select();
          throw new Error("Primary operational failure");
        });
      },
      (err: any) => {
        // Assert the primary error is not masked by the rollback error
        assert.equal(err.message, "Primary operational failure");
        assert.ok(err.rollbackError, "Rollback failure must be attached to the error object");
        assert.equal(err.rollbackError.message, "Simulated database failure during ROLLBACK");
        return true;
      }
    );

    assert.equal(mock.isReleased(), true, "Client must still be released when rollback fails");
  });

  // Test 4: Client is released on success and failure (checked explicitly)
  it("4. guarantees client release in finally block under all circumstances", async () => {
    // Check success release
    const mockSuccess = createMockClient();
    const poolSuccess = createMockPool(() => mockSuccess.client).pool;
    await new PostgresExecutor(poolSuccess).transaction(async () => "ok");
    assert.equal(mockSuccess.isReleased(), true);

    // Check failure release
    const mockFailure = createMockClient();
    const poolFailure = createMockPool(() => mockFailure.client).pool;
    try {
      await new PostgresExecutor(poolFailure).transaction(async () => {
        throw new Error("err");
      });
    } catch {}
    assert.equal(mockFailure.isReleased(), true);
  });

  // Test 5: Every transactional query uses the same client
  it("5. routes all queries within transaction through the exact same client, never the pool", async () => {
    const mock = createMockClient();
    const { pool, poolQueries } = createMockPool(() => mock.client);
    const executor = new PostgresExecutor(pool);

    await executor.transaction(async (tx) => {
      await tx.from("companies").select();
      await tx.from("categories").select();
      await tx.from("products").select();
      await tx.from("customers").select();
    });

    assert.equal(poolQueries.length, 0, "Zero queries should hit pool.query");
    assert.equal(mock.queryLogs.length, 6, "Expected BEGIN + 4 queries + COMMIT");
    assert.equal(mock.queryLogs[0].sql, "BEGIN");
    assert.match(mock.queryLogs[1].sql, /public\."companies"/);
    assert.match(mock.queryLogs[2].sql, /public\."categories"/);
    assert.match(mock.queryLogs[3].sql, /public\."products"/);
    assert.match(mock.queryLogs[4].sql, /public\."customers"/);
    assert.equal(mock.queryLogs[5].sql, "COMMIT");
  });

  // Test 6: Nested behavior matches documented contract (Savepoints)
  it("6. supports nested transactions via SAVEPOINT and RELEASE / ROLLBACK TO SAVEPOINT", async () => {
    const mock = createMockClient();
    const { pool } = createMockPool(() => mock.client);
    const executor = new PostgresExecutor(pool);

    await executor.transaction(async (tx) => {
      await tx.from("quotations").select();

      // Nested transaction 1: Successful inner savepoint
      await tx.transaction(async (nestedTx) => {
        await nestedTx.from("quotation_items").select();
      });

      // Nested transaction 2: Failing inner savepoint that is caught by caller
      try {
        await tx.transaction(async (failingNestedTx) => {
          await failingNestedTx.from("quotation_branches").select();
          throw new Error("Nested branch failure");
        });
      } catch (err: any) {
        assert.equal(err.message, "Nested branch failure");
      }

      // Outer continues and succeeds
      await tx.from("audit_logs").select();
    });

    const statements = mock.queryLogs.map((l) => l.sql);

    // Verify outer BEGIN and COMMIT
    assert.equal(statements[0], "BEGIN");
    assert.equal(statements[statements.length - 1], "COMMIT");

    // Verify successful nested savepoint
    assert.ok(statements.includes("SAVEPOINT sp_1"), "Must create SAVEPOINT sp_1");
    assert.ok(statements.includes("RELEASE SAVEPOINT sp_1"), "Must release SAVEPOINT sp_1 on success");

    // Verify rolled back nested savepoint
    assert.ok(statements.includes("SAVEPOINT sp_2"), "Must create SAVEPOINT sp_2");
    assert.ok(statements.includes("ROLLBACK TO SAVEPOINT sp_2"), "Must rollback to SAVEPOINT sp_2 on nested failure");
    assert.ok(!statements.includes("RELEASE SAVEPOINT sp_2"), "Must not release failed savepoint sp_2");
  });

  // Test 7: Queries fail after the transaction has completed
  it("7. prevents transaction-scoped executors from executing queries after transaction completes", async () => {
    const mock = createMockClient();
    const { pool } = createMockPool(() => mock.client);
    const executor = new PostgresExecutor(pool);

    let capturedTx!: PostgresExecutor;

    await executor.transaction(async (tx) => {
      capturedTx = tx;
      await tx.from("quotations").select();
    });

    // Attempting to use the transaction executor after completion MUST fail
    assert.throws(
      () => {
        capturedTx.from("quotations");
      },
      /\[POSTGRES TRANSACTION ERROR\] Cannot execute query: transaction has already completed/
    );

    await assert.rejects(
      async () => {
        await capturedTx.rpc("login_rate_limit_clear");
      },
      /\[POSTGRES TRANSACTION ERROR\] Cannot execute query: transaction has already completed/
    );

    await assert.rejects(
      async () => {
        await capturedTx.transaction(async () => {});
      },
      /\[POSTGRES TRANSACTION ERROR\] Cannot execute query: transaction has already completed/
    );
  });

  // Test 8: Concurrent transactions do not share clients
  it("8. isolates concurrent transactions onto separate clients", async () => {
    const mockClient1 = createMockClient();
    const mockClient2 = createMockClient();
    let checkoutCount = 0;

    const pool: PostgresPoolLike = {
      connect: async () => {
        checkoutCount++;
        return (checkoutCount === 1 ? mockClient1.client : mockClient2.client) as any;
      },
      query: async () => ({ rows: [] }),
    };

    const executor = new PostgresExecutor(pool);

    const [res1, res2] = await Promise.all([
      executor.transaction(async (tx1) => {
        await tx1.from("bills").select();
        return "TX1_DONE";
      }),
      executor.transaction(async (tx2) => {
        await tx2.from("gate_passes").select();
        return "TX2_DONE";
      }),
    ]);

    assert.equal(res1, "TX1_DONE");
    assert.equal(res2, "TX2_DONE");

    // Client 1 had bills query only
    assert.ok(mockClient1.queryLogs.some((l) => l.sql.includes("bills")));
    assert.ok(!mockClient1.queryLogs.some((l) => l.sql.includes("gate_passes")));
    assert.equal(mockClient1.isReleased(), true);

    // Client 2 had gate_passes query only
    assert.ok(mockClient2.queryLogs.some((l) => l.sql.includes("gate_passes")));
    assert.ok(!mockClient2.queryLogs.some((l) => l.sql.includes("bills")));
    assert.equal(mockClient2.isReleased(), true);
  });

  // Test 9: PostgresQueryBuilder.forUpdate() row locking support
  it("9. appends FOR UPDATE to row-level SELECT queries and rejects non-SELECT operations", () => {
    const mockClient = createMockClient();
    const executor = new PostgresExecutor(mockClient.client, true);

    // Row-level SELECT with FOR UPDATE
    const qb = executor.from("companies").select("*").eq("id", "c1").forUpdate();
    const built = qb.buildQuery();
    assert.ok(built.sql.endsWith("FOR UPDATE"), `Query must end with FOR UPDATE: ${built.sql}`);

    // With maybeSingle() -> includes LIMIT 2 FOR UPDATE
    const qbSingle = executor.from("companies").select("*").eq("id", "c1").maybeSingle().forUpdate();
    const builtSingle = qbSingle.buildQuery();
    assert.ok(builtSingle.sql.includes("LIMIT 2 FOR UPDATE"), `Query must place FOR UPDATE after LIMIT: ${builtSingle.sql}`);

    // Rejects FOR UPDATE on non-SELECT
    assert.throws(
      () => {
        executor.from("companies").update({ name: "foo" }).forUpdate();
      },
      /\[POSTGRES ADAPTER SECURITY ERROR\] FOR UPDATE is only supported on row-level SELECT queries\./
    );

    // Rejects FOR UPDATE on count/head query
    assert.throws(
      () => {
        executor.from("companies").select("*", { head: true }).forUpdate();
      },
      /\[POSTGRES ADAPTER SECURITY ERROR\] FOR UPDATE is only supported on row-level SELECT queries\./
    );
  });
});
