// ============================================================================
// TAMILNADU SUPPLIERS RENTAL ERP - DATA MIGRATION SAFETY & ISOLATION GUARDS
// File: scripts/migration/safety.ts
// ============================================================================

import { ALLOWED_SUPABASE_PROJECT_ID, FORBIDDEN_PROJECT_IDS } from "../../src/lib/db/guard";
import { SourceConfig, TargetConfig, MigrationMode, MigrationOptions } from "./types";

const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /jwt/i,
  /service_role_key/i,
  /bearer/i,
  /key/i,
  /credential/i,
  /auth/i,
];

/**
 * Sanitizes URLs to prevent credentials from appearing in logs or error messages.
 * Example: postgresql://user:pass@127.0.0.1:5432/db -> postgresql://user:***@127.0.0.1:5432/db
 */
export function redactUrl(rawUrl?: string | null): string {
  if (!rawUrl) return "[UNSET]";
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    // If not a standard URL, regex replace password segment if present
    return rawUrl.replace(/:([^@\s:]+)@/, ":***@");
  }
}

/**
 * Recursively redacts sensitive keys from an object before logging.
 */
export function redactSecrets(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    if (/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/.test(obj)) {
      return "[REDACTED_JWT_TOKEN]";
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(redactSecrets);
  }
  if (typeof obj === "object") {
    const copy: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" && /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/.test(v)) {
        copy[k] = "[REDACTED_JWT_TOKEN]";
      } else if (SENSITIVE_PATTERNS.some((p) => p.test(k))) {
        copy[k] = "[REDACTED]";
      } else {
        copy[k] = redactSecrets(v);
      }
    }
    return copy;
  }
  return obj;
}

/**
 * Strips credentials and internal path structures from error objects.
 */
export function sanitizeError(err: any): string {
  if (!err) return "Unknown error";
  let msg = err instanceof Error ? err.message : String(err);
  msg = msg.replace(/:([^@\s:]+)@/, ":***@");
  msg = msg.replace(/([C-Z]:\\[^\s]+\\)(?:[^\\]+\.(?:ts|js|mjs))/gi, "[INTERNAL_PATH]");
  return msg;
}

/**
 * Strictly verifies target isolation and prevents execution against production systems.
 */
export const PRODUCTION_TARGET_DATABASE = "tamilnadu_suppliers";
export const PRODUCTION_CONFIRM_PREFIX = "IMPORT-INTO-";

export function isProductionProfile(mode: MigrationMode, options?: MigrationOptions): boolean {
  return mode === "import-production" || !!options?.productionTarget;
}

/**
 * Guarded production profile. The loopback/disposable rules above stay the default; this profile only
 * unlocks ONE named database and still rejects Supabase hosts, bad ports and a missing/incorrect confirmation.
 * import-production additionally requires an empty target (enforced by the migrator).
 */
function validateProductionTargetSafety(target: TargetConfig, mode: MigrationMode, options?: MigrationOptions): void {
  const host = target.host.trim().toLowerCase();
  const database = target.database.trim().toLowerCase();

  if (
    host.includes("supabase") ||
    host.includes(ALLOWED_SUPABASE_PROJECT_ID) ||
    FORBIDDEN_PROJECT_IDS.some((id) => host.includes(id))
  ) {
    throw new Error(
      `[CRITICAL TARGET SAFETY VIOLATION] Target host '${target.host}' points to a Supabase Cloud host. Standalone target must be independent.`
    );
  }
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host) || host.includes("..") || host === "0.0.0.0") {
    throw new Error(`[CRITICAL TARGET SAFETY VIOLATION] Unusual host format '${target.host}' rejected.`);
  }
  if (isNaN(target.port) || target.port < 1 || target.port > 65535) {
    throw new Error(`[CRITICAL TARGET SAFETY VIOLATION] Invalid target port '${target.port}'.`);
  }
  if (database !== PRODUCTION_TARGET_DATABASE) {
    throw new Error(
      `[CRITICAL TARGET SAFETY VIOLATION] Production profile only permits database '${PRODUCTION_TARGET_DATABASE}'. Found: '${target.database}'.`
    );
  }
  const expected = PRODUCTION_CONFIRM_PREFIX + PRODUCTION_TARGET_DATABASE;
  if (options?.productionTarget?.confirm !== expected) {
    throw new Error(
      `[CRITICAL TARGET SAFETY VIOLATION] Production target requires --confirm-production ${expected} (mode '${mode}').`
    );
  }
}

export function validateTargetSafety(target: TargetConfig, mode: MigrationMode, options?: MigrationOptions): void {
  if (isProductionProfile(mode, options)) {
    validateProductionTargetSafety(target, mode, options);
    return;
  }
  const host = target.host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const database = target.database.trim().toLowerCase();
  const port = target.port;

  // 1. Reject Supabase Cloud endpoints first
  if (
    host.includes("supabase") ||
    host.includes(ALLOWED_SUPABASE_PROJECT_ID) ||
    FORBIDDEN_PROJECT_IDS.some((id) => host.includes(id))
  ) {
    throw new Error(
      `[CRITICAL TARGET SAFETY VIOLATION] Target host '${target.host}' points to a Supabase Cloud host. Standalone target must be independent.`
    );
  }

  // 2. Loopback only check for local/disposable mode
  if (host.startsWith("::ffff:") || host === "0.0.0.0" || host.includes("..")) {
    throw new Error(
      `[CRITICAL TARGET SAFETY VIOLATION] Unusual host format '${target.host}' rejected. Migration tool can ONLY target local loopback (127.0.0.1, localhost, ::1) in this batch.`
    );
  }

  const isLoopback =
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === "::1";

  if (!isLoopback) {
    throw new Error(
      `[CRITICAL TARGET SAFETY VIOLATION] Migration tool can ONLY target local loopback (127.0.0.1, localhost, ::1) in this batch. Target host '${target.host}' is strictly rejected.`
    );
  }

  // 3. Port check
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(
      `[CRITICAL TARGET SAFETY VIOLATION] Invalid target port '${port}'. Must be between 1 and 65535.`
    );
  }

  // 4. Database Name Validation
  if (
    database.includes("prod") ||
    database.includes("production") ||
    database === "tamilnadu_suppliers" ||
    database === "postgres" ||
    database === "template0" ||
    database === "template1" ||
    (!database.includes("test") && !database.includes("disposable"))
  ) {
    throw new Error(
      `[CRITICAL TARGET SAFETY VIOLATION] Target database '${target.database}' is rejected. Must contain 'test' or 'disposable' and must not contain 'prod' or point to production/system databases.`
    );
  }

  // 5. In import-disposable mode, require explicit disposable naming
  if (mode === "import-disposable") {
    if (!database.includes("disposable") && !database.includes("test")) {
      throw new Error(
        `[CRITICAL TARGET SAFETY VIOLATION] import-disposable mode requires a target database with 'disposable' or 'test' in its name. Found: '${target.database}'`
      );
    }
  }
}

/**
 * Validates source configuration and verifies source and target identity cannot collide.
 */
export function validateEnvironmentIsolation(
  source: SourceConfig,
  target: TargetConfig,
  options?: MigrationOptions,
  mode?: MigrationMode
): void {
  // Check for source/target collision
  if (source.type === "postgres" && source.connectionString) {
    try {
      const srcParsed = new URL(source.connectionString);
      const srcHost = srcParsed.hostname.toLowerCase();
      const srcPort = parseInt(srcParsed.port || "5432", 10);
      const srcDb = srcParsed.pathname.replace(/^\//, "").toLowerCase();

      const tgtHost = target.host.toLowerCase();
      const tgtPort = target.port;
      const tgtDb = target.database.toLowerCase();

      if (srcHost === tgtHost && srcPort === tgtPort && srcDb === tgtDb) {
        throw new Error(
          `[CRITICAL ISOLATION VIOLATION] Source and target point to the EXACT same database (${srcHost}:${srcPort}/${srcDb}). Migration cannot overwrite source with target.`
        );
      }
    } catch (e: any) {
      if (e.message.includes("CRITICAL ISOLATION VIOLATION")) throw e;
      // Not a valid URL, ignore parse check
    }
  }

  // Ensure remote production endpoints are rejected for target in this batch
  if (mode && isProductionProfile(mode, options)) return; // host already validated by the production profile
  const normalizedTargetHost = target.host.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1"].includes(normalizedTargetHost)) {
    throw new Error(
      `[SAFETY VIOLATION] Target host '${target.host}' is not an authorized local disposable environment.`
    );
  }
}

/**
 * Active runtime socket and identity verification.
 * Directly queries the connected PostgreSQL server via SQL to verify:
 * 1. inet_server_addr() is strictly loopback (127.0.0.1, ::1, or null for unix domain socket).
 *    Prevents local DNS spoofing or silent resolution of 'localhost' to a remote address.
 * 2. current_database() matches target.database exactly.
 * 3. current_database() does not contain 'prod' or 'production' and contains 'test' or 'disposable'.
 * 4. current_user matches target.user.
 */
export async function assertLiveTargetConnection(
  clientOrPool: { query: (sql: string, params?: any[]) => Promise<any> },
  expectedTarget: TargetConfig,
  productionProfile = false
): Promise<{ serverAddr: string | null; serverPort: number; currentDb: string; currentUser: string }> {
  const res = await clientOrPool.query(`
    SELECT
      inet_server_addr()::text AS server_addr,
      inet_server_port()::int AS server_port,
      current_database() AS current_db,
      current_user AS current_user,
      session_user AS session_user;
  `);

  if (!res.rows || res.rows.length === 0) {
    throw new Error(`[CRITICAL TARGET SAFETY VIOLATION] Unable to query target database identity at runtime.`);
  }

  const row = res.rows[0];
  const serverAddr = row.server_addr ? String(row.server_addr).trim() : null;
  const currentDb = String(row.current_db).trim().toLowerCase();
  const currentUser = String(row.current_user).trim().toLowerCase();
  const expectedDb = expectedTarget.database.trim().toLowerCase();
  const expectedUser = expectedTarget.user.trim().toLowerCase();

  // 1. Verify Socket Address is Loopback or Local Domain Socket (disposable profile only)
  if (!productionProfile && serverAddr !== null) {
    const isLoopbackAddr =
      serverAddr === "127.0.0.1" ||
      serverAddr === "::1" ||
      serverAddr === "127.0.0.1/32" ||
      serverAddr === "::1/128";
    if (!isLoopbackAddr) {
      throw new Error(
        `[CRITICAL TARGET SAFETY VIOLATION] Target connection resolved to non-loopback IP address '${serverAddr}'. Migration tool is strictly restricted to local loopback in this batch.`
      );
    }
  }

  // 2. Verify Database Identity
  if (currentDb !== expectedDb) {
    throw new Error(
      `[CRITICAL TARGET SAFETY VIOLATION] Connected database '${currentDb}' does not match expected target '${expectedDb}'.`
    );
  }

  // 3. Reject Production Patterns (disposable profile only)
  if (
    !productionProfile &&
    (currentDb.includes("prod") ||
    currentDb.includes("production") ||
    currentDb === "tamilnadu_suppliers" ||
    currentDb === "postgres" ||
    currentDb === "template0" ||
    currentDb === "template1" ||
    (!currentDb.includes("test") && !currentDb.includes("disposable")))
  ) {
    throw new Error(
      `[CRITICAL TARGET SAFETY VIOLATION] Connected database '${currentDb}' is not an authorized test/disposable database.`
    );
  }

  if (productionProfile && currentDb !== PRODUCTION_TARGET_DATABASE) {
    throw new Error(
      `[CRITICAL TARGET SAFETY VIOLATION] Production profile connected to '${currentDb}', expected '${PRODUCTION_TARGET_DATABASE}'.`
    );
  }

  // 4. Verify User
  if (currentUser !== expectedUser) {
    throw new Error(
      `[CRITICAL TARGET SAFETY VIOLATION] Connected user '${currentUser}' does not match expected user '${expectedUser}'.`
    );
  }

  return {
    serverAddr,
    serverPort: row.server_port || expectedTarget.port,
    currentDb,
    currentUser,
  };
}

