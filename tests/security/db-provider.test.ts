import { describe, it } from "node:test";
import assert from "node:assert";
import {
  resolveDbProvider,
  validatePostgresDatabaseUrl,
  getSafeProviderSummary,
} from "../../src/lib/db/provider";
import { collectEnvDiagnostics } from "../../src/lib/diagnostics/envDiagnostics.mjs";

describe("Database Provider Selection & Validation (Batch 1)", () => {
  const VALID_PG_URL = "postgresql://tns_app_user:secretPass123!@postgres.internal:5432/tamilnadu_suppliers";
  const VALID_PG_URL_SHORT = "postgres://tns_app_user:secretPass123!@10.0.0.5:5432/tamilnadu_suppliers";
  const SUPABASE_PG_URL = "postgresql://postgres.lznyejowgqwbavtnqqns:SecretPass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";
  const SUPABASE_CLOUD_URL = "https://lznyejowgqwbavtnqqns.supabase.co";
  const FORBIDDEN_LEGACY_URL = "postgresql://postgres:pass@db.hdaljmhsdaxsebvrskkp.supabase.co:5432/postgres";

  // --------------------------------------------------------------------------
  // Rule 1: DB_PROVIDER unset or blank defaults to Supabase
  // --------------------------------------------------------------------------
  describe("Rule 1: DB_PROVIDER unset or blank", () => {
    it("returns 'supabase' when DB_PROVIDER is completely undefined", () => {
      const provider = resolveDbProvider({});
      assert.equal(provider, "supabase");
    });

    it("returns 'supabase' when DB_PROVIDER is empty string", () => {
      const provider = resolveDbProvider({ DB_PROVIDER: "" });
      assert.equal(provider, "supabase");
    });

    it("returns 'supabase' when DB_PROVIDER is whitespace or quotes", () => {
      assert.equal(resolveDbProvider({ DB_PROVIDER: "   " }), "supabase");
      assert.equal(resolveDbProvider({ DB_PROVIDER: '""' }), "supabase");
      assert.equal(resolveDbProvider({ DB_PROVIDER: "''" }), "supabase");
    });

    it("returns 'supabase' when DB_PROVIDER is unset even if DATABASE_URL is set", () => {
      const provider = resolveDbProvider({
        DATABASE_URL: VALID_PG_URL,
      });
      assert.equal(provider, "supabase", "Must not switch to postgres just because DATABASE_URL is present");
    });

    it("returns 'supabase' when DB_PROVIDER is blank even if DATABASE_URL is set", () => {
      const provider = resolveDbProvider({
        DB_PROVIDER: "  ",
        DATABASE_URL: VALID_PG_URL,
      });
      assert.equal(provider, "supabase");
    });
  });

  // --------------------------------------------------------------------------
  // Rule 2: DB_PROVIDER=supabase explicitly uses Supabase
  // --------------------------------------------------------------------------
  describe("Rule 2: DB_PROVIDER=supabase", () => {
    it("returns 'supabase' when DB_PROVIDER='supabase'", () => {
      assert.equal(resolveDbProvider({ DB_PROVIDER: "supabase" }), "supabase");
    });

    it("handles case insensitivity and quotes for 'supabase'", () => {
      assert.equal(resolveDbProvider({ DB_PROVIDER: "SUPABASE" }), "supabase");
      assert.equal(resolveDbProvider({ DB_PROVIDER: ' "supabase" ' }), "supabase");
    });

    it("uses 'supabase' even if a valid standalone DATABASE_URL is also set", () => {
      const provider = resolveDbProvider({
        DB_PROVIDER: "supabase",
        DATABASE_URL: VALID_PG_URL,
      });
      assert.equal(provider, "supabase");
    });
  });

  // --------------------------------------------------------------------------
  // Rule 3: DB_PROVIDER=postgres requires valid standalone PostgreSQL URL
  // --------------------------------------------------------------------------
  describe("Rule 3: DB_PROVIDER=postgres", () => {
    it("returns 'postgres' when DB_PROVIDER='postgres' and DATABASE_URL is valid", () => {
      const provider = resolveDbProvider({
        DB_PROVIDER: "postgres",
        DATABASE_URL: VALID_PG_URL,
      });
      assert.equal(provider, "postgres");
    });

    it("accepts both 'postgresql://' and 'postgres://' schemes", () => {
      assert.equal(resolveDbProvider({ DB_PROVIDER: "postgres", DATABASE_URL: VALID_PG_URL }), "postgres");
      assert.equal(resolveDbProvider({ DB_PROVIDER: "postgres", DATABASE_URL: VALID_PG_URL_SHORT }), "postgres");
    });

    it("fails clearly if DATABASE_URL is missing when DB_PROVIDER='postgres'", () => {
      assert.throws(
        () => resolveDbProvider({ DB_PROVIDER: "postgres" }),
        (err: Error) => {
          assert.match(err.message, /DATABASE_URL is missing or empty/);
          assert.match(err.message, /DB_PROVIDER='postgres'/);
          return true;
        }
      );
    });

    it("fails clearly if DATABASE_URL is empty when DB_PROVIDER='postgres'", () => {
      assert.throws(
        () => resolveDbProvider({ DB_PROVIDER: "postgres", DATABASE_URL: "  " }),
        (err: Error) => {
          assert.match(err.message, /DATABASE_URL is missing or empty/);
          return true;
        }
      );
    });

    it("rejects non-postgres protocols (mysql, http, redis)", () => {
      const invalidProtocols = [
        "mysql://user:pass@host:3306/db",
        "http://postgres.internal:5432/db",
        "redis://user:pass@host:6379",
        "mongodb://host:27017/db",
      ];
      for (const badUrl of invalidProtocols) {
        assert.throws(
          () => resolveDbProvider({ DB_PROVIDER: "postgres", DATABASE_URL: badUrl }),
          (err: Error) => {
            assert.match(err.message, /invalid protocol|must start with 'postgres:\/\/|postgresql:\/\//i);
            return true;
          }
        );
      }
    });

    it("rejects Supabase database URLs when DB_PROVIDER='postgres'", () => {
      const supabaseUrls = [
        SUPABASE_PG_URL,
        SUPABASE_CLOUD_URL,
        "postgresql://postgres:password@db.lznyejowgqwbavtnqqns.supabase.co:5432/postgres",
        "postgresql://postgres:password@supabase.co:5432/postgres",
      ];
      for (const sbUrl of supabaseUrls) {
        assert.throws(
          () => resolveDbProvider({ DB_PROVIDER: "postgres", DATABASE_URL: sbUrl }),
          (err: Error) => {
            assert.match(err.message, /points to a Supabase host or project/);
            return true;
          }
        );
      }
    });

    it("rejects forbidden legacy project URLs", () => {
      assert.throws(
        () => resolveDbProvider({ DB_PROVIDER: "postgres", DATABASE_URL: FORBIDDEN_LEGACY_URL }),
        (err: Error) => {
          assert.match(err.message, /forbidden legacy database reference|points to a Supabase/);
          return true;
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // Rule 4: Reject invalid provider values (fail closed, no silent fallback)
  // --------------------------------------------------------------------------
  describe("Rule 4: Reject invalid provider values", () => {
    it("fails clearly on unknown provider values (mysql, mongo, redis, sqlite, test)", () => {
      const badProviders = ["mysql", "mongo", "redis", "sqlite", "test", "postgresql", "custom"];
      for (const bad of badProviders) {
        assert.throws(
          () => resolveDbProvider({ DB_PROVIDER: bad }),
          (err: Error) => {
            assert.match(err.message, /Invalid DB_PROVIDER/);
            assert.match(err.message, new RegExp(bad));
            assert.match(err.message, /Allowed values are 'supabase' \(or left unset\) or 'postgres'/);
            return true;
          }
        );
      }
    });

    it("never silently falls back between providers on error", () => {
      assert.throws(
        () => resolveDbProvider({ DB_PROVIDER: "unknown", DATABASE_URL: VALID_PG_URL }),
        /Invalid DB_PROVIDER='unknown'/
      );
    });
  });

  // --------------------------------------------------------------------------
  // Rule 5: Credential Leakage Prevention
  // --------------------------------------------------------------------------
  describe("Rule 5: Zero Credential Exposure", () => {
    it("never echoes password or connection string in error messages", () => {
      const sensitiveUrl = "postgresql://my_secret_user:SUPER_SECRET_PASSWORD_XYZ@db.lznyejowgqwbavtnqqns.supabase.co:5432/mydb";
      try {
        resolveDbProvider({ DB_PROVIDER: "postgres", DATABASE_URL: sensitiveUrl });
        assert.fail("Should have thrown error");
      } catch (err: any) {
        assert.ok(!err.message.includes("SUPER_SECRET_PASSWORD_XYZ"), "Password must not appear in error message");
        assert.ok(!err.message.includes("my_secret_user"), "Username must not appear in error message");
      }
    });

    it("getSafeProviderSummary excludes password and credentials", () => {
      const summary = getSafeProviderSummary({
        DB_PROVIDER: "postgres",
        DATABASE_URL: VALID_PG_URL,
      });
      assert.equal(summary.provider, "postgres");
      assert.equal(summary.isPostgres, true);
      assert.equal(summary.isSupabase, false);
      assert.ok(summary.sanitizedTarget);
      assert.equal(summary.sanitizedTarget.host, "postgres.internal");
      assert.equal(summary.sanitizedTarget.port, 5432);
      assert.equal(summary.sanitizedTarget.database, "tamilnadu_suppliers");

      const stringified = JSON.stringify(summary);
      assert.ok(!stringified.includes("secretPass123!"), "Password must not be in summary");
      assert.ok(!stringified.includes("tns_app_user"), "Username should not be in summary");
    });
  });

  // --------------------------------------------------------------------------
  // Rule 6: Server-side only (no NEXT_PUBLIC_* provider selection)
  // --------------------------------------------------------------------------
  describe("Rule 6: Server-side only provider selection", () => {
    it("ignores NEXT_PUBLIC_DB_PROVIDER if passed in env", () => {
      const provider = resolveDbProvider({
        NEXT_PUBLIC_DB_PROVIDER: "postgres", // Must be ignored!
      } as any);
      assert.equal(provider, "supabase", "NEXT_PUBLIC_* must never dictate database provider");
    });
  });

  // --------------------------------------------------------------------------
  // Rule 7: Diagnostics integration
  // --------------------------------------------------------------------------
  describe("Rule 7: Diagnostics Integration", () => {
    const TEST_SECRET = "012345678901234567890123456789012";

    it("diagnostics accepts postgres provider without requiring Supabase keys", () => {
      const d = collectEnvDiagnostics({
        NODE_ENV: "production",
        DB_PROVIDER: "postgres",
        DATABASE_URL: VALID_PG_URL,
        SESSION_SECRET: TEST_SECRET,
        TRUSTED_PROXY_COUNT: "1",
      });
      assert.deepEqual(d.problems, []);
      assert.equal(d.provider.name, "postgres");
      assert.equal(d.provider.isPostgres, true);
      assert.ok(d.postgres);
      assert.equal(d.postgres.host, "postgres.internal");
    });

    it("diagnostics flags missing DATABASE_URL when DB_PROVIDER='postgres'", () => {
      const d = collectEnvDiagnostics({
        NODE_ENV: "production",
        DB_PROVIDER: "postgres",
        SESSION_SECRET: TEST_SECRET,
        TRUSTED_PROXY_COUNT: "1",
      });
      assert.ok(d.problems.some((p: string) => /DATABASE_URL is not set/.test(p)));
    });

    it("diagnostics rejects Supabase DATABASE_URL when DB_PROVIDER='postgres'", () => {
      const d = collectEnvDiagnostics({
        NODE_ENV: "production",
        DB_PROVIDER: "postgres",
        DATABASE_URL: SUPABASE_PG_URL,
        SESSION_SECRET: TEST_SECRET,
        TRUSTED_PROXY_COUNT: "1",
      });
      assert.ok(d.problems.some((p: string) => /points to a Supabase host or project/.test(p)));
    });

    it("diagnostics flags invalid DB_PROVIDER values", () => {
      const d = collectEnvDiagnostics({
        NODE_ENV: "production",
        DB_PROVIDER: "invalid_engine",
        SESSION_SECRET: TEST_SECRET,
        TRUSTED_PROXY_COUNT: "1",
      });
      assert.ok(d.problems.some((p: string) => /Invalid DB_PROVIDER='invalid_engine'/.test(p)));
    });

    it("diagnostics never outputs connection string or password", () => {
      const d = collectEnvDiagnostics({
        NODE_ENV: "production",
        DB_PROVIDER: "postgres",
        DATABASE_URL: VALID_PG_URL,
        SESSION_SECRET: TEST_SECRET,
        TRUSTED_PROXY_COUNT: "1",
      });
      const str = JSON.stringify(d);
      assert.ok(!str.includes("secretPass123!"));
    });
  });
});
