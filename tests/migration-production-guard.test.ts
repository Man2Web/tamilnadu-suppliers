// Guarded production import profile: unit tests for the safety rules (no database required).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateTargetSafety,
  validateEnvironmentIsolation,
  assertLiveTargetConnection,
  PRODUCTION_CONFIRM_PREFIX,
} from "../scripts/migration/safety";

const CONFIRM = `${PRODUCTION_CONFIRM_PREFIX}tamilnadu_suppliers`;
const prodTarget = { host: "fl6ytttqsulcx5c88latzeei", port: 5432, database: "tamilnadu_suppliers", user: "tns_app_user", password: "p" };

describe("production import profile", () => {
  it("accepts the approved database with the exact confirmation phrase", () => {
    assert.doesNotThrow(() => validateTargetSafety(prodTarget, "import-production", { productionTarget: { confirm: CONFIRM } }));
    assert.doesNotThrow(() => validateTargetSafety(prodTarget, "dry-run", { productionTarget: { confirm: CONFIRM } }));
  });

  it("import-production without a confirmation is rejected", () => {
    assert.throws(() => validateTargetSafety(prodTarget, "import-production"), /requires --confirm-production/);
    assert.throws(
      () => validateTargetSafety(prodTarget, "import-production", { productionTarget: { confirm: "yes" } }),
      /requires --confirm-production/
    );
  });

  it("only permits the tamilnadu_suppliers database", () => {
    assert.throws(
      () => validateTargetSafety({ ...prodTarget, database: "postgres" }, "import-production", { productionTarget: { confirm: CONFIRM } }),
      /only permits database/
    );
  });

  it("still rejects Supabase hosts and odd host formats", () => {
    const opts = { productionTarget: { confirm: CONFIRM } };
    assert.throws(() => validateTargetSafety({ ...prodTarget, host: "db.lznyejowgqwbavtnqqns.supabase.co" }, "import-production", opts), /Supabase/);
    assert.throws(() => validateTargetSafety({ ...prodTarget, host: "0.0.0.0" }, "import-production", opts), /Unusual host/);
    assert.throws(() => validateTargetSafety({ ...prodTarget, host: "a b" }, "import-production", opts), /Unusual host/);
  });

  it("does not loosen the default disposable rules", () => {
    assert.throws(() => validateTargetSafety(prodTarget, "dry-run"), /local loopback/);
    assert.throws(() => validateTargetSafety(prodTarget, "import-disposable"), /local loopback/);
  });

  it("isolation check skips the loopback rule only for the production profile", () => {
    const src = { type: "supabase-api" as const };
    assert.doesNotThrow(() => validateEnvironmentIsolation(src, prodTarget, { productionTarget: { confirm: CONFIRM } }, "import-production"));
    assert.throws(() => validateEnvironmentIsolation(src, prodTarget, undefined, "dry-run"), /not an authorized local/);
  });

  it("live connection check verifies database identity under the production profile", async () => {
    const client = (db: string, addr: string | null) => ({
      query: async () => ({ rows: [{ server_addr: addr, server_port: 5432, current_db: db, current_user: "tns_app_user", session_user: "tns_app_user" }] }),
    });
    await assert.doesNotReject(assertLiveTargetConnection(client("tamilnadu_suppliers", "10.0.1.5"), prodTarget, true));
    await assert.rejects(assertLiveTargetConnection(client("postgres", "10.0.1.5"), prodTarget, true), /does not match/);
    await assert.rejects(assertLiveTargetConnection(client("tamilnadu_suppliers", "10.0.1.5"), prodTarget, false), /non-loopback/);
  });
});

describe("--only-tables selection", () => {
  it("selects the tables plus their foreign-key parents, in dependency order", async () => {
    const { DataMigrator } = await import("../scripts/migration/migrator");
    const mk = (onlyTables?: string[]) =>
      new DataMigrator({
        mode: "inspect",
        source: { type: "supabase-api" },
        target: { host: "127.0.0.1", port: 5432, database: "tns_test", user: "u", password: "p" },
        options: { onlyTables },
      }, { inspectSchema: async () => ({ accessible: true, tables: [] }), extractTable: async () => ({ tableName: "", records: [], totalCount: 0, extractedPages: 0, durationMs: 0 }), close: async () => {} } as any);
    const m = mk(["users", "products"]) as any;
    const order: string[] = m.getSelectedOrder();
    assert.deepEqual([...order].sort(), ["categories", "products", "users"]);
    assert.ok(order.indexOf("categories") < order.indexOf("products"));
    assert.equal((mk() as any).getSelectedOrder().length, 26);
    assert.throws(() => (mk(["nope"]) as any).getSelectedOrder(), /Unknown table/);
    await m.close();
  });
});
