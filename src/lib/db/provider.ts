// ============================================================================
// TAMILNADU SUPPLIERS - DATABASE PROVIDER RESOLUTION & VALIDATION
// Controlled migration selector: Supabase Cloud vs. Standalone PostgreSQL
// ============================================================================

import { cleanEnvValue, FORBIDDEN_PROJECT_IDS, ALLOWED_SUPABASE_PROJECT_ID } from "./guard";

export type DbProvider = "supabase" | "postgres";

export const VALID_DB_PROVIDERS: readonly DbProvider[] = ["supabase", "postgres"] as const;

export interface PostgresUrlSanitizedSummary {
  protocol: string;
  host: string;
  port: number;
  database: string;
}

export interface PostgresUrlValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedSummary?: PostgresUrlSanitizedSummary;
}

export interface ProviderResolutionResult {
  provider: DbProvider;
  rawProvider: string | null;
  isPostgres: boolean;
  isSupabase: boolean;
  sanitizedTarget?: PostgresUrlSanitizedSummary;
}

/**
 * Validates whether a given string is a valid standalone PostgreSQL URL.
 * Strictly enforces that:
 * 1. The URL is non-empty and well-formed.
 * 2. Protocol is 'postgres:' or 'postgresql:'.
 * 3. Hostname is present.
 * 4. Target is NOT a Supabase database (rejects .supabase.co, Supabase project IDs).
 * 5. Target does not point to forbidden legacy projects.
 * 
 * SECURITY: Never echoes the raw connection string or credentials in error messages or logs.
 */
export function validatePostgresDatabaseUrl(rawUrl?: string | null): PostgresUrlValidationResult {
  const urlStr = cleanEnvValue(rawUrl);

  if (!urlStr) {
    return {
      isValid: false,
      error: "DATABASE_URL is missing or empty. A valid PostgreSQL connection URL is required when DB_PROVIDER='postgres'.",
    };
  }

  // 1. Reject Supabase URLs: Standalone PostgreSQL must not point to Supabase Cloud
  if (
    urlStr.includes(".supabase.co") ||
    urlStr.includes("supabase.co") ||
    urlStr.includes("supabase") ||
    urlStr.includes(ALLOWED_SUPABASE_PROJECT_ID)
  ) {
    return {
      isValid: false,
      error: "DATABASE_URL points to a Supabase host or project. Standalone PostgreSQL provider requires an independent PostgreSQL instance, not a Supabase URL.",
    };
  }

  // 2. Reject forbidden legacy projects
  for (const forbidden of FORBIDDEN_PROJECT_IDS) {
    if (urlStr.includes(forbidden)) {
      return {
        isValid: false,
        error: `DATABASE_URL points to forbidden legacy database reference '${forbidden}'.`,
      };
    }
  }

  // 3. Basic protocol check before URL constructor
  if (!urlStr.startsWith("postgres://") && !urlStr.startsWith("postgresql://")) {
    return {
      isValid: false,
      error: "DATABASE_URL has invalid protocol. Connection string must start with 'postgres://' or 'postgresql://'.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return {
      isValid: false,
      error: "DATABASE_URL is not a well-formed URL. Check format (e.g. postgresql://user:pass@host:5432/dbname).",
    };
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return {
      isValid: false,
      error: "DATABASE_URL protocol must be 'postgres:' or 'postgresql:'.",
    };
  }

  const hostname = (parsed.hostname || "").trim().toLowerCase();
  if (!hostname) {
    return {
      isValid: false,
      error: "DATABASE_URL is missing a valid hostname.",
    };
  }

  // Reject Supabase URLs: Standalone PostgreSQL must not point to Supabase Cloud
  if (
    hostname.endsWith(".supabase.co") ||
    hostname === "supabase.co" ||
    hostname.includes("supabase") ||
    urlStr.includes(ALLOWED_SUPABASE_PROJECT_ID)
  ) {
    return {
      isValid: false,
      error: "DATABASE_URL points to a Supabase host or project. Standalone PostgreSQL provider requires an independent PostgreSQL instance, not a Supabase URL.",
    };
  }

  // Reject forbidden legacy projects
  for (const forbidden of FORBIDDEN_PROJECT_IDS) {
    if (urlStr.includes(forbidden)) {
      return {
        isValid: false,
        error: `DATABASE_URL points to forbidden legacy database reference '${forbidden}'.`,
      };
    }
  }

  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
  const database = (parsed.pathname || "").replace(/^\//, "");

  return {
    isValid: true,
    sanitizedSummary: {
      protocol: parsed.protocol.replace(/:$/, ""),
      host: hostname,
      port,
      database,
    },
  };
}

/**
 * Resolves which database provider to use based strictly on server environment variables.
 * 
 * Rules:
 * 1. If DB_PROVIDER is unset or blank: returns "supabase" (even if DATABASE_URL is set).
 * 2. If DB_PROVIDER="supabase": returns "supabase".
 * 3. If DB_PROVIDER="postgres": requires a valid PostgreSQL URL (rejects missing/Supabase URLs).
 * 4. Any other value: throws a descriptive Configuration Error (fail-closed, never silently fall back).
 * 
 * SECURITY:
 * - Server-side only: never reads NEXT_PUBLIC_* variables for provider resolution.
 * - Never prints passwords or full connection strings.
 */
export function resolveDbProvider(env: Record<string, string | undefined> = process.env): DbProvider {
  const raw = cleanEnvValue(env.DB_PROVIDER).toLowerCase();

  // Rule 1: DB_PROVIDER unset or blank defaults strictly to Supabase (even if DATABASE_URL is present)
  if (!raw) {
    return "supabase";
  }

  // Rule 2: DB_PROVIDER=supabase explicitly selects Supabase
  if (raw === "supabase") {
    return "supabase";
  }

  // Rule 3: DB_PROVIDER=postgres requires a valid standalone PostgreSQL DATABASE_URL
  if (raw === "postgres") {
    const validation = validatePostgresDatabaseUrl(env.DATABASE_URL);
    if (!validation.isValid) {
      throw new Error(`[DB PROVIDER CONFIGURATION ERROR] ${validation.error}`);
    }
    return "postgres";
  }

  // Rule 4: Fail-closed on invalid provider value (never silently fall back)
  throw new Error(
    `[DB PROVIDER CONFIGURATION ERROR] Invalid DB_PROVIDER='${raw}'. Allowed values are 'supabase' (or left unset) or 'postgres'.`
  );
}

/**
 * Returns a safe, non-sensitive summary of the database provider configuration.
 * Safe to include in logs, health checks, or instrumentation without leaking credentials.
 */
export function getSafeProviderSummary(
  env: Record<string, string | undefined> = process.env
): ProviderResolutionResult {
  const raw = cleanEnvValue(env.DB_PROVIDER);
  const provider = resolveDbProvider(env);
  const isPostgres = provider === "postgres";
  const isSupabase = provider === "supabase";

  let sanitizedTarget: PostgresUrlSanitizedSummary | undefined;
  if (isPostgres && env.DATABASE_URL) {
    const validation = validatePostgresDatabaseUrl(env.DATABASE_URL);
    if (validation.isValid) {
      sanitizedTarget = validation.sanitizedSummary;
    }
  }

  return {
    provider,
    rawProvider: raw || null,
    isPostgres,
    isSupabase,
    sanitizedTarget,
  };
}
