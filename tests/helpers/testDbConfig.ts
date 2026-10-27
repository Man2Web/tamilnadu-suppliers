// ============================================================================
// TAMILNADU SUPPLIERS - REAL POSTGRESQL TEST DATABASE CONFIGURATION HELPER
// Centralized resolution, strict loopback safety validation, and skip semantics
// ============================================================================

import assert from "node:assert/strict";
import { ALLOWED_SUPABASE_PROJECT_ID, FORBIDDEN_PROJECT_IDS } from "../../src/lib/db/guard";

export interface TestDbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  adminUser?: string;
  adminPassword?: string;
}

export interface TestDbResolution {
  isConfigured: boolean;
  skipReason?: string;
  config?: TestDbConfig;
  getPoolConfig: (overrides?: Record<string, any>) => {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    [key: string]: any;
  };
  getAdminPoolConfig: (overrides?: Record<string, any>) => {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    [key: string]: any;
  };
  getDatabaseUrl: () => string;
  assertLiveConnection: (appPool: { query: (sql: string) => Promise<any> }, expectedUser?: string) => Promise<void>;
}

/**
 * Resolves test database configuration strictly from environment variables.
 * Never hardcodes or prints credentials.
 * Enforces strict local loopback isolation to prevent accidental execution against production.
 */
export function getTestDbConfig(): TestDbResolution {
  const rawHost = (process.env.TEST_DB_HOST || "127.0.0.1").trim();
  const rawPort = (process.env.TEST_DB_PORT || "5432").trim();
  const rawDatabase = (process.env.TEST_DB_NAME || "tns_disposable_test_2026").trim();
  const rawUser = (process.env.TEST_DB_USER || "tns_app_user").trim();
  const password = process.env.TEST_DB_PASSWORD || "";

  // 1. Check if required credentials are provided
  if (!password) {
    // Release verification and CI gate: If REQUIRE_REAL_DB_TESTS is true, skipping is a fatal error
    const isMandatory =
      process.env.REQUIRE_REAL_DB_TESTS === "true" ||
      process.env.MANDATORY_REAL_DB_TESTS === "true";

    if (isMandatory) {
      throw new Error(
        "[FATAL RELEASE/CI VERIFICATION FAILURE] Real PostgreSQL database tests are MANDATORY (REQUIRE_REAL_DB_TESTS is set), but TEST_DB_PASSWORD is not provided. Real-database tests cannot be skipped in release verification."
      );
    }

    return {
      isConfigured: false,
      skipReason: "TEST_DB_PASSWORD environment variable is not set. Real PostgreSQL database tests skipped.",
      getPoolConfig: () => {
        throw new Error("Cannot getPoolConfig: TEST_DB_PASSWORD is not set.");
      },
      getAdminPoolConfig: () => {
        throw new Error("Cannot getAdminPoolConfig: TEST_DB_PASSWORD is not set.");
      },
      getDatabaseUrl: () => {
        throw new Error("Cannot getDatabaseUrl: TEST_DB_PASSWORD is not set.");
      },
      assertLiveConnection: async () => {
        throw new Error("Cannot assertLiveConnection: TEST_DB_PASSWORD is not set.");
      },
    };
  }

  // 2. Host validation: strictly allow loopback names/addresses only.
  // CRITICAL: Reject 0.0.0.0 (INADDR_ANY bind address; ambiguous client target).
  const normalizedHost = rawHost.toLowerCase().replace(/^\[|\]$/g, "");
  const isLoopback =
    normalizedHost === "127.0.0.1" ||
    normalizedHost === "localhost" ||
    normalizedHost === "::1";

  if (!isLoopback) {
    throw new Error(
      `[CRITICAL TEST SAFETY VIOLATION] Real-database tests can ONLY run against local loopback (127.0.0.1, localhost, ::1). Target host '${rawHost}' is rejected to prevent accidental production impact.`
    );
  }

  // Reject any host matching Supabase or forbidden legacy IDs
  if (
    normalizedHost.includes("supabase") ||
    normalizedHost.includes(ALLOWED_SUPABASE_PROJECT_ID) ||
    FORBIDDEN_PROJECT_IDS.some((id) => normalizedHost.includes(id))
  ) {
    throw new Error(
      `[CRITICAL TEST SAFETY VIOLATION] Real-database tests cannot connect to Supabase Cloud host '${rawHost}'.`
    );
  }

  // 3. Port validation: Must be an explicit valid TCP port (1-65535)
  if (!/^\d+$/.test(rawPort)) {
    throw new Error(
      `[CRITICAL TEST SAFETY VIOLATION] Invalid TEST_DB_PORT '${rawPort}'. Port must be a numeric integer.`
    );
  }
  const port = parseInt(rawPort, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(
      `[CRITICAL TEST SAFETY VIOLATION] TEST_DB_PORT '${rawPort}' out of range. Must be between 1 and 65535.`
    );
  }

  // 4. Database name safety check: Must never target production database
  const normalizedDb = rawDatabase.toLowerCase();
  if (
    normalizedDb.includes("prod") ||
    normalizedDb.includes("production") ||
    normalizedDb === "tamilnadu_suppliers" ||
    normalizedDb === "postgres" ||
    normalizedDb === "template0" ||
    normalizedDb === "template1" ||
    (!normalizedDb.includes("test") && !normalizedDb.includes("disposable"))
  ) {
    throw new Error(
      `[CRITICAL TEST SAFETY VIOLATION] Real-database tests must target a disposable test database containing 'test' or 'disposable' and must not contain 'prod' or point to production/system databases. Found: '${rawDatabase}'.`
    );
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(rawDatabase)) {
    throw new Error(
      `[CRITICAL TEST SAFETY VIOLATION] TEST_DB_NAME '${rawDatabase}' contains invalid characters. Must be alphanumeric with underscores or dashes.`
    );
  }

  const config: TestDbConfig = {
    host: rawHost,
    port,
    database: rawDatabase,
    user: rawUser,
    password,
    adminUser: (process.env.TEST_DB_ADMIN_USER || "postgres").trim(),
    adminPassword: process.env.TEST_DB_ADMIN_PASSWORD || password,
  };

  return {
    isConfigured: true,
    config,
    getPoolConfig: (overrides = {}) => ({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ...overrides,
    }),
    getAdminPoolConfig: (overrides = {}) => ({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.adminUser || "postgres",
      password: config.adminPassword || config.password,
      ...overrides,
    }),
    getDatabaseUrl: () =>
      `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}`,
    assertLiveConnection: async (pool, expectedUser) => {
      const guard = await pool.query(
        "SELECT current_database() as db, inet_server_addr() as addr, inet_server_port() as port, current_user as usr;"
      );
      assert.equal(guard.rows[0].db, config.database, `Must be connected to disposable DB '${config.database}'`);
      const serverAddr = guard.rows[0].addr ? String(guard.rows[0].addr) : "";
      assert.ok(
        serverAddr === "127.0.0.1" || serverAddr === "::1" || serverAddr === "",
        `Must be connected to loopback address (got '${serverAddr}')`
      );
      assert.equal(guard.rows[0].port, config.port, `Must be connected to port ${config.port}`);
      const targetUser = expectedUser || config.user;
      assert.equal(guard.rows[0].usr, targetUser, `Must be authenticated as '${targetUser}'`);
    },
  };
}
