import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { getTestDbConfig } from "./helpers/testDbConfig";

const testDb = getTestDbConfig();

// Batch 5.2 specific test identifier prefix
const BATCH_PREFIX = "test:b52:";
const BATCH_SKU_PREFIX = "SKU-B52-";

describe("Batch 5.2 — Real PostgreSQL 18.4 Concurrency Testing (tns_disposable_test_2026)", { skip: !testDb.isConfigured ? testDb.skipReason : false }, () => {
  let appPool: Pool;

  // Track results for final reporting
  const scenarioResults: Record<string, any> = {};

  before(async () => {
    // Application connection pool (tns_app_user) with high concurrency capacity
    appPool = new Pool(
      testDb.getPoolConfig({
        max: 30,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 5000,
      })
    );

    // Mandatory loopback and database safety assertions
    const guard = await appPool.query(
      "SELECT current_database() as db, inet_server_addr() as addr, inet_server_port() as port, current_user as usr, version() as ver;"
    );
    assert.equal(guard.rows[0].db, testDb.config!.database);
    assert.equal(String(guard.rows[0].addr), "127.0.0.1");
    assert.equal(guard.rows[0].port, testDb.config!.port);
    assert.equal(guard.rows[0].usr, testDb.config!.user);
    assert.ok(guard.rows[0].ver.includes("PostgreSQL 18."), "Must run on PostgreSQL 18.x");
  });

  after(async () => {
    // Clean up ONLY records created by this batch
    try {
      await appPool.query(`DELETE FROM public.login_rate_limits WHERE key LIKE '${BATCH_PREFIX}%';`);
      await appPool.query(`DELETE FROM public.products WHERE sku LIKE '${BATCH_SKU_PREFIX}%';`);
      await appPool.query(`DELETE FROM public.categories WHERE code = 'B52CAT';`);
    } catch (err: any) {
      console.error("[CLEANUP WARNING] Failed to clean Batch 5.2 test records:", err.message);
    } finally {
      if (appPool) await appPool.end();
    }
  });

  // ==========================================================================
  // PHASE B: RATE-LIMIT CONCURRENCY (5.2A)
  // ==========================================================================
  describe("Phase B: Rate-Limit Concurrency (5.2A)", () => {
    it("Scenario 1: 50 concurrent failure recordings for a single key", async () => {
      const testKey = `${BATCH_PREFIX}single_key`;
      const CONCURRENCY = 50;
      const MAX_ATTEMPTS = 100; // Above concurrency so no lockout occurs yet
      const WINDOW_SECS = 900;
      const LOCKOUT_SECS = 1800;

      // Clean start
      await appPool.query("DELETE FROM public.login_rate_limits WHERE key = $1", [testKey]);

      const operations = Array.from({ length: CONCURRENCY }, (_, i) => i + 1);
      const errors: any[] = [];
      const results: any[] = [];

      // Execute 50 concurrent failure recordings simultaneously
      await Promise.all(
        operations.map(async () => {
          try {
            const res = await appPool.query(
              "SELECT * FROM public.login_rate_limit_record_failure($1, $2, $3, $4);",
              [testKey, MAX_ATTEMPTS, WINDOW_SECS, LOCKOUT_SECS]
            );
            results.push(res.rows[0]);
          } catch (err) {
            errors.push(err);
          }
        })
      );

      // Verify in database
      const dbRow = await appPool.query("SELECT * FROM public.login_rate_limits WHERE key = $1", [testKey]);

      scenarioResults["5.2A_Scenario1"] = {
        attempted: CONCURRENCY,
        succeeded: results.length,
        rejected: errors.length,
        errors: errors.map((e) => ({ code: e.code, message: e.message })),
        finalDbAttempts: dbRow.rows[0]?.attempts,
        finalDbLockedUntil: dbRow.rows[0]?.locked_until,
      };

      assert.equal(errors.length, 0, `All ${CONCURRENCY} concurrent calls must succeed without error`);
      assert.equal(results.length, CONCURRENCY);
      assert.equal(dbRow.rows.length, 1);
      assert.equal(dbRow.rows[0].attempts, CONCURRENCY, `Database attempts counter must equal exactly ${CONCURRENCY}`);
      assert.equal(dbRow.rows[0].locked_until, null, "Should not be locked since attempts < 100");
    });

    it("Scenario 2: Concurrent failures across multiple independent keys", async () => {
      const NUM_KEYS = 5;
      const CALLS_PER_KEY = 10;
      const TOTAL_CALLS = NUM_KEYS * CALLS_PER_KEY; // 50 operations total
      const keys = Array.from({ length: NUM_KEYS }, (_, k) => `${BATCH_PREFIX}multi_key_${k}`);

      // Clean start
      for (const k of keys) {
        await appPool.query("DELETE FROM public.login_rate_limits WHERE key = $1", [k]);
      }

      // Flatten list of calls across all keys
      const tasks: { key: string }[] = [];
      for (const key of keys) {
        for (let i = 0; i < CALLS_PER_KEY; i++) {
          tasks.push({ key });
        }
      }

      // Shuffle tasks to interleave execution across keys
      tasks.sort(() => Math.random() - 0.5);

      const errors: any[] = [];
      await Promise.all(
        tasks.map(async ({ key }) => {
          try {
            await appPool.query(
              "SELECT * FROM public.login_rate_limit_record_failure($1, 50, 900, 1800);",
              [key]
            );
          } catch (err) {
            errors.push(err);
          }
        })
      );

      assert.equal(errors.length, 0);

      // Verify each key has exactly CALLS_PER_KEY attempts
      const keyStats: Record<string, number> = {};
      for (const key of keys) {
        const res = await appPool.query("SELECT attempts FROM public.login_rate_limits WHERE key = $1", [key]);
        assert.equal(res.rows.length, 1);
        assert.equal(res.rows[0].attempts, CALLS_PER_KEY, `Key ${key} must have exactly ${CALLS_PER_KEY} attempts`);
        keyStats[key] = res.rows[0].attempts;
      }

      scenarioResults["5.2A_Scenario2"] = {
        totalOperations: TOTAL_CALLS,
        keysTested: NUM_KEYS,
        callsPerKey: CALLS_PER_KEY,
        errors: errors.length,
        keyAttempts: keyStats,
      };
    });

    it("Scenario 3: Crossing maximum-attempt threshold under concurrency", async () => {
      const testKey = `${BATCH_PREFIX}lockout_key`;
      const MAX_ATTEMPTS = 5;
      const CONCURRENCY = 15; // 15 calls against a max threshold of 5

      await appPool.query("DELETE FROM public.login_rate_limits WHERE key = $1", [testKey]);

      const results: any[] = [];
      const errors: any[] = [];

      await Promise.all(
        Array.from({ length: CONCURRENCY }).map(async () => {
          try {
            const res = await appPool.query(
              "SELECT * FROM public.login_rate_limit_record_failure($1, $2, 900, 1800);",
              [testKey, MAX_ATTEMPTS]
            );
            results.push(res.rows[0]);
          } catch (err) {
            errors.push(err);
          }
        })
      );

      assert.equal(errors.length, 0);
      assert.equal(results.length, CONCURRENCY);

      const dbRow = await appPool.query("SELECT * FROM public.login_rate_limits WHERE key = $1", [testKey]);
      assert.equal(dbRow.rows.length, 1);
      assert.equal(dbRow.rows[0].attempts, CONCURRENCY);
      assert.ok(dbRow.rows[0].locked_until !== null, "locked_until must be set");
      assert.ok(new Date(dbRow.rows[0].locked_until) > new Date(), "locked_until must be in the future");

      // Verify status query confirms blocked
      const statusRes = await appPool.query("SELECT * FROM public.login_rate_limit_status($1)", [testKey]);
      assert.equal(statusRes.rows[0].blocked, true);
      assert.ok(statusRes.rows[0].retry_after_seconds > 0);

      // Verify responses: exactly (MAX_ATTEMPTS - 1) unblocked, remaining blocked
      const blockedResults = results.filter((r) => r.blocked === true);
      const unblockedResults = results.filter((r) => r.blocked === false);
      assert.equal(unblockedResults.length, MAX_ATTEMPTS - 1, `Exactly ${MAX_ATTEMPTS - 1} calls should report unblocked`);
      assert.equal(blockedResults.length, CONCURRENCY - (MAX_ATTEMPTS - 1), "Remaining calls must report blocked");

      scenarioResults["5.2A_Scenario3"] = {
        attempted: CONCURRENCY,
        threshold: MAX_ATTEMPTS,
        unblockedResponses: unblockedResults.length,
        blockedResponses: blockedResults.length,
        finalAttempts: dbRow.rows[0].attempts,
        isLocked: true,
        retryAfterSecs: statusRes.rows[0].retry_after_seconds,
      };
    });

    it("Scenario 4: Interleaved status reads during concurrent failure recording", async () => {
      const testKey = `${BATCH_PREFIX}interleaved_key`;
      const WRITES = 20;
      const READS = 20;

      await appPool.query("DELETE FROM public.login_rate_limits WHERE key = $1", [testKey]);

      const writeResults: any[] = [];
      const readResults: any[] = [];
      const errors: any[] = [];

      // Interleave simultaneous writes and reads
      const promises: Promise<void>[] = [];

      for (let i = 0; i < WRITES; i++) {
        promises.push(
          (async () => {
            try {
              const res = await appPool.query(
                "SELECT * FROM public.login_rate_limit_record_failure($1, 10, 900, 1800);",
                [testKey]
              );
              writeResults.push(res.rows[0]);
            } catch (e) {
              errors.push(e);
            }
          })()
        );
      }

      for (let i = 0; i < READS; i++) {
        promises.push(
          (async () => {
            try {
              const res = await appPool.query("SELECT * FROM public.login_rate_limit_status($1);", [testKey]);
              readResults.push(res.rows[0]);
            } catch (e) {
              errors.push(e);
            }
          })()
        );
      }

      await Promise.all(promises);

      assert.equal(errors.length, 0, "No errors, deadlocks, or lock timeouts during concurrent read/write");
      assert.equal(writeResults.length, WRITES);
      assert.equal(readResults.length, READS);

      const dbRow = await appPool.query("SELECT attempts FROM public.login_rate_limits WHERE key = $1", [testKey]);
      assert.equal(dbRow.rows[0].attempts, WRITES);

      scenarioResults["5.2A_Scenario4"] = {
        writesCompleted: writeResults.length,
        readsCompleted: readResults.length,
        errors: errors.length,
        finalAttempts: dbRow.rows[0].attempts,
      };
    });

    it("Scenario 5: Clearing a key resets attempts and unblocks immediately", async () => {
      const testKey = `${BATCH_PREFIX}clear_test_key`;

      // 1. Lock key
      await appPool.query("SELECT * FROM public.login_rate_limit_record_failure($1, 1, 900, 1800);", [testKey]);
      const statusBefore = await appPool.query("SELECT * FROM public.login_rate_limit_status($1);", [testKey]);
      assert.equal(statusBefore.rows[0].blocked, true);

      // 2. Clear key
      await appPool.query("SELECT public.login_rate_limit_clear($1);", [testKey]);

      // 3. Status immediately returns unblocked
      const statusAfter = await appPool.query("SELECT * FROM public.login_rate_limit_status($1);", [testKey]);
      assert.equal(statusAfter.rows[0].blocked, false);
      assert.equal(statusAfter.rows[0].retry_after_seconds, 0);

      // 4. Next failure starts at attempt = 1
      const nextFail = await appPool.query("SELECT * FROM public.login_rate_limit_record_failure($1, 5, 900, 1800);", [testKey]);
      assert.equal(nextFail.rows[0].attempts, 1);
      assert.equal(nextFail.rows[0].blocked, false);

      scenarioResults["5.2A_Scenario5"] = {
        lockedBefore: statusBefore.rows[0].blocked,
        unblockedAfter: !statusAfter.rows[0].blocked,
        nextAttemptAfterClear: nextFail.rows[0].attempts,
      };
    });

    it("Scenario 6: Transaction rollback does not commit failure increment", async () => {
      const testKey = `${BATCH_PREFIX}rollback_key`;
      await appPool.query("DELETE FROM public.login_rate_limits WHERE key = $1", [testKey]);

      // 1. Initial attempt
      await appPool.query("SELECT * FROM public.login_rate_limit_record_failure($1, 10, 900, 1800);", [testKey]);
      const initial = await appPool.query("SELECT attempts FROM public.login_rate_limits WHERE key = $1", [testKey]);
      assert.equal(initial.rows[0].attempts, 1);

      // 2. Run in a transaction and rollback
      const client = await appPool.connect();
      try {
        await client.query("BEGIN;");
        await client.query("SELECT * FROM public.login_rate_limit_record_failure($1, 10, 900, 1800);", [testKey]);
        await client.query("ROLLBACK;");
      } finally {
        client.release();
      }

      // 3. Assert attempt count remains 1
      const afterRollback = await appPool.query("SELECT attempts FROM public.login_rate_limits WHERE key = $1", [testKey]);
      assert.equal(afterRollback.rows[0].attempts, 1);

      scenarioResults["5.2A_Scenario6"] = {
        initialAttempts: 1,
        attemptsAfterRollback: afterRollback.rows[0].attempts,
        rollbackSucceeded: true,
      };
    });
  });

  // ==========================================================================
  // PHASE C: INVENTORY CONCURRENCY (5.2B)
  // ==========================================================================
  describe("Phase C: Inventory Concurrency (5.2B)", () => {
    let testCategoryId: string;

    before(async () => {
      // Ensure shared category exists
      const catRes = await appPool.query(`
        INSERT INTO public.categories (name, code, description)
        VALUES ('Batch 5.2 Concurrency Cat', 'B52CAT', 'Temporary test category')
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
        RETURNING id;
      `);
      testCategoryId = catRes.rows[0].id;
    });

    it("Scenario 1: 20 concurrent positive stock adjustments on a single product", async () => {
      const sku = `${BATCH_SKU_PREFIX}POS-01`;
      const INITIAL_STOCK = 0;
      const CONCURRENCY = 20;
      const DELTA_PER_TX = 2; // +2 per transaction
      const EXPECTED_FINAL = INITIAL_STOCK + (CONCURRENCY * DELTA_PER_TX); // 40

      // Create test product
      const prodRes = await appPool.query(`
        INSERT INTO public.products (
          name, sku, category_id, unit, default_rental_rate,
          total_owned_quantity, available_quantity, rented_quantity
        ) VALUES (
          'Test Speaker Concurrency Pos', $1, $2, 'Nos', 500.00, 100, $3, 0
        ) RETURNING id;
      `, [sku, testCategoryId, INITIAL_STOCK]);
      const productId = prodRes.rows[0].id;

      const errors: any[] = [];
      const successes: any[] = [];

      // Execute 20 concurrent transactions
      await Promise.all(
        Array.from({ length: CONCURRENCY }).map(async () => {
          const client = await appPool.connect();
          try {
            await client.query("BEGIN;");
            const res = await client.query(
              "SELECT * FROM public.adjust_product_stock_quantities($1, $2, $3, $4, $5);",
              [productId, 0, DELTA_PER_TX, 0, 0] // available_delta = +2
            );
            await client.query("COMMIT;");
            successes.push(res.rows[0]);
          } catch (err) {
            await client.query("ROLLBACK;");
            errors.push(err);
          } finally {
            client.release();
          }
        })
      );

      assert.equal(errors.length, 0);
      assert.equal(successes.length, CONCURRENCY);

      const finalRow = await appPool.query("SELECT available_quantity FROM public.products WHERE id = $1", [productId]);
      assert.equal(finalRow.rows[0].available_quantity, EXPECTED_FINAL, `Final stock must be exactly ${EXPECTED_FINAL}`);

      scenarioResults["5.2B_Scenario1"] = {
        initialStock: INITIAL_STOCK,
        concurrency: CONCURRENCY,
        deltaPerOp: DELTA_PER_TX,
        expectedFinal: EXPECTED_FINAL,
        actualFinal: finalRow.rows[0].available_quantity,
        errors: errors.length,
      };
    });

    it("Scenario 2: Concurrent negative stock adjustments", async () => {
      const sku = `${BATCH_SKU_PREFIX}NEG-01`;
      const INITIAL_STOCK = 50;
      const CONCURRENCY = 15;
      const DELTA_PER_TX = -2; // -2 per transaction
      const EXPECTED_FINAL = INITIAL_STOCK + (CONCURRENCY * DELTA_PER_TX); // 50 - 30 = 20

      const prodRes = await appPool.query(`
        INSERT INTO public.products (
          name, sku, category_id, unit, default_rental_rate,
          total_owned_quantity, available_quantity, rented_quantity
        ) VALUES (
          'Test Speaker Concurrency Neg', $1, $2, 'Nos', 500.00, 100, $3, 0
        ) RETURNING id;
      `, [sku, testCategoryId, INITIAL_STOCK]);
      const productId = prodRes.rows[0].id;

      const errors: any[] = [];
      await Promise.all(
        Array.from({ length: CONCURRENCY }).map(async () => {
          const client = await appPool.connect();
          try {
            await client.query("BEGIN;");
            await client.query(
              "SELECT * FROM public.adjust_product_stock_quantities($1, $2, $3, $4, $5);",
              [productId, 0, DELTA_PER_TX, 0, 0]
            );
            await client.query("COMMIT;");
          } catch (err) {
            await client.query("ROLLBACK;");
            errors.push(err);
          } finally {
            client.release();
          }
        })
      );

      assert.equal(errors.length, 0);
      const finalRow = await appPool.query("SELECT available_quantity FROM public.products WHERE id = $1", [productId]);
      assert.equal(finalRow.rows[0].available_quantity, EXPECTED_FINAL);

      scenarioResults["5.2B_Scenario2"] = {
        initialStock: INITIAL_STOCK,
        concurrency: CONCURRENCY,
        deltaPerOp: DELTA_PER_TX,
        expectedFinal: EXPECTED_FINAL,
        actualFinal: finalRow.rows[0].available_quantity,
        errors: errors.length,
      };
    });

    it("Scenario 3: Mixed concurrent positive and negative stock adjustments", async () => {
      const sku = `${BATCH_SKU_PREFIX}MIX-01`;
      const INITIAL_STOCK = 20;
      const NUM_INCREMENTS = 10;
      const INC_DELTA = 3;  // 10 * 3 = +30
      const NUM_DECREMENTS = 10;
      const DEC_DELTA = -1; // 10 * -1 = -10
      const EXPECTED_FINAL = INITIAL_STOCK + (NUM_INCREMENTS * INC_DELTA) + (NUM_DECREMENTS * DEC_DELTA); // 20 + 30 - 10 = 40

      const prodRes = await appPool.query(`
        INSERT INTO public.products (
          name, sku, category_id, unit, default_rental_rate,
          total_owned_quantity, available_quantity, rented_quantity
        ) VALUES (
          'Test Speaker Concurrency Mix', $1, $2, 'Nos', 500.00, 100, $3, 0
        ) RETURNING id;
      `, [sku, testCategoryId, INITIAL_STOCK]);
      const productId = prodRes.rows[0].id;

      // Interleave increment and decrement tasks
      const deltas = [
        ...Array(NUM_INCREMENTS).fill(INC_DELTA),
        ...Array(NUM_DECREMENTS).fill(DEC_DELTA),
      ].sort(() => Math.random() - 0.5);

      const errors: any[] = [];
      await Promise.all(
        deltas.map(async (delta) => {
          const client = await appPool.connect();
          try {
            await client.query("BEGIN;");
            await client.query(
              "SELECT * FROM public.adjust_product_stock_quantities($1, $2, $3, $4, $5);",
              [productId, 0, delta, 0, 0]
            );
            await client.query("COMMIT;");
          } catch (err) {
            await client.query("ROLLBACK;");
            errors.push(err);
          } finally {
            client.release();
          }
        })
      );

      assert.equal(errors.length, 0);
      const finalRow = await appPool.query("SELECT available_quantity FROM public.products WHERE id = $1", [productId]);
      assert.equal(finalRow.rows[0].available_quantity, EXPECTED_FINAL);

      scenarioResults["5.2B_Scenario3"] = {
        initialStock: INITIAL_STOCK,
        increments: `${NUM_INCREMENTS} x +${INC_DELTA}`,
        decrements: `${NUM_DECREMENTS} x ${DEC_DELTA}`,
        expectedFinal: EXPECTED_FINAL,
        actualFinal: finalRow.rows[0].available_quantity,
        errors: errors.length,
      };
    });

    it("Scenario 4: Lower bound clamping when decrement exceeds available stock", async () => {
      const sku = `${BATCH_SKU_PREFIX}BOUND-01`;
      const INITIAL_STOCK = 5;
      const CONCURRENCY = 10;
      const DELTA_PER_TX = -2; // Attempted total decrement = -20 from stock of 5
      // Per function implementation: available_quantity = GREATEST(0, available_quantity + p_available_delta)
      // Clamps at 0 without error

      const prodRes = await appPool.query(`
        INSERT INTO public.products (
          name, sku, category_id, unit, default_rental_rate,
          total_owned_quantity, available_quantity, rented_quantity
        ) VALUES (
          'Test Speaker Lower Bound Clamping', $1, $2, 'Nos', 500.00, 10, $3, 0
        ) RETURNING id;
      `, [sku, testCategoryId, INITIAL_STOCK]);
      const productId = prodRes.rows[0].id;

      const errors: any[] = [];
      await Promise.all(
        Array.from({ length: CONCURRENCY }).map(async () => {
          const client = await appPool.connect();
          try {
            await client.query("BEGIN;");
            await client.query(
              "SELECT * FROM public.adjust_product_stock_quantities($1, $2, $3, $4, $5);",
              [productId, 0, DELTA_PER_TX, 0, 0]
            );
            await client.query("COMMIT;");
          } catch (err) {
            await client.query("ROLLBACK;");
            errors.push(err);
          } finally {
            client.release();
          }
        })
      );

      assert.equal(errors.length, 0);
      const finalRow = await appPool.query("SELECT available_quantity FROM public.products WHERE id = $1", [productId]);
      assert.equal(finalRow.rows[0].available_quantity, 0, "Stock must clamp safely at 0 and never go negative");

      scenarioResults["5.2B_Scenario4"] = {
        initialStock: INITIAL_STOCK,
        attemptedTotalDecrement: CONCURRENCY * DELTA_PER_TX,
        finalStock: finalRow.rows[0].available_quantity,
        clampedAtZero: true,
        errors: errors.length,
      };
    });

    it("Scenario 5: Concurrent adjustments across separate products (independent row locks)", async () => {
      const skuA = `${BATCH_SKU_PREFIX}SEP-A`;
      const skuB = `${BATCH_SKU_PREFIX}SEP-B`;
      const OPS_PER_PROD = 15;

      const prodResA = await appPool.query(`
        INSERT INTO public.products (name, sku, category_id, unit, default_rental_rate, total_owned_quantity, available_quantity)
        VALUES ('Separate Prod A', $1, $2, 'Nos', 100, 50, 10) RETURNING id;
      `, [skuA, testCategoryId]);
      const prodResB = await appPool.query(`
        INSERT INTO public.products (name, sku, category_id, unit, default_rental_rate, total_owned_quantity, available_quantity)
        VALUES ('Separate Prod B', $1, $2, 'Nos', 200, 50, 20) RETURNING id;
      `, [skuB, testCategoryId]);

      const idA = prodResA.rows[0].id;
      const idB = prodResB.rows[0].id;

      // 15 ops for A (+2 each -> 10 + 30 = 40)
      // 15 ops for B (+5 each -> 20 + 75 = 95)
      const tasks = [
        ...Array(OPS_PER_PROD).fill({ id: idA, delta: 2 }),
        ...Array(OPS_PER_PROD).fill({ id: idB, delta: 5 }),
      ].sort(() => Math.random() - 0.5);

      const errors: any[] = [];
      await Promise.all(
        tasks.map(async ({ id, delta }) => {
          const client = await appPool.connect();
          try {
            await client.query("BEGIN;");
            await client.query(
              "SELECT * FROM public.adjust_product_stock_quantities($1, $2, $3, $4, $5);",
              [id, 0, delta, 0, 0]
            );
            await client.query("COMMIT;");
          } catch (err) {
            await client.query("ROLLBACK;");
            errors.push(err);
          } finally {
            client.release();
          }
        })
      );

      assert.equal(errors.length, 0);

      const rowA = await appPool.query("SELECT available_quantity FROM public.products WHERE id = $1", [idA]);
      const rowB = await appPool.query("SELECT available_quantity FROM public.products WHERE id = $1", [idB]);

      assert.equal(rowA.rows[0].available_quantity, 40);
      assert.equal(rowB.rows[0].available_quantity, 95);

      scenarioResults["5.2B_Scenario5"] = {
        prodA_initial: 10,
        prodA_expected: 40,
        prodA_actual: rowA.rows[0].available_quantity,
        prodB_initial: 20,
        prodB_expected: 95,
        prodB_actual: rowB.rows[0].available_quantity,
        errors: errors.length,
      };
    });

    it("Scenario 6: Mathematical reconciliation across all product stock deltas", async () => {
      // Validate that the FOR UPDATE row locks guaranteed 100% mathematical precision
      const s1 = scenarioResults["5.2B_Scenario1"];
      const s2 = scenarioResults["5.2B_Scenario2"];
      const s3 = scenarioResults["5.2B_Scenario3"];
      const s5 = scenarioResults["5.2B_Scenario5"];

      assert.equal(s1.actualFinal, s1.expectedFinal);
      assert.equal(s2.actualFinal, s2.expectedFinal);
      assert.equal(s3.actualFinal, s3.expectedFinal);
      assert.equal(s5.prodA_actual, s5.prodA_expected);
      assert.equal(s5.prodB_actual, s5.prodB_expected);

      scenarioResults["5.2B_Scenario6"] = {
        reconciliationPassed: true,
        zeroDriftConfirmed: true,
      };
    });
  });

  // Optional summary output for audit reporting
  after(async () => {
    const summaryPath = process.env.TEST_SUMMARY_PATH;
    if (summaryPath) {
      try {
        const fs = await import("node:fs");
        fs.writeFileSync(summaryPath, JSON.stringify(scenarioResults, null, 2), "utf-8");
      } catch {
        // Non-fatal if summary path cannot be written
      }
    }
  });
});
