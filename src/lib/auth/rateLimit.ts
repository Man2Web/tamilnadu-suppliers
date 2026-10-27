// ============================================================================
// TAMILNADU SUPPLIERS - SHARED LOGIN RATE LIMITING (PostgreSQL / Supabase)
// Counters live in public.login_rate_limits (see migration 20261023) and are
// updated by atomic RPCs, so limits survive restarts and apply across instances.
// Fails CLOSED: if the store is unavailable the caller must refuse the login.
// ============================================================================

import { createHash } from "crypto";

export const MAX_FAILED_ATTEMPTS = 5; // per IP + username
export const MAX_FAILED_ATTEMPTS_PER_IP = 30; // per trusted IP across usernames
const WINDOW_SECONDS = 15 * 60;
const LOCKOUT_SECONDS = 15 * 60;

export class RateLimitUnavailableError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly endpoint?: string;

  constructor(
    message = "Login rate-limit store is unavailable",
    options?: { cause?: unknown; code?: string; status?: number; endpoint?: string }
  ) {
    super(message);
    this.name = "RateLimitUnavailableError";
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
    if (options?.code !== undefined) {
      this.code = options.code;
    }
    if (options?.status !== undefined) {
      this.status = options.status;
    }
    if (options?.endpoint !== undefined) {
      this.endpoint = options.endpoint;
    }
  }
}

/** Minimal RPC surface so the limiter can be tested without a live database. */
export type RpcCaller = (
  fn: string,
  args: Record<string, unknown>
) => Promise<{
  data: unknown;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
  status?: number;
  statusText?: string;
  endpoint?: string;
}>;

export interface RateLimitResult {
  allowed: boolean;
  isBlocked: boolean;
  retryAfterSeconds?: number;
  retryAfterMinutes?: number;
}

interface LimitKey {
  key: string;
  max: number;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Builds the limiter keys. Only hashes are persisted. `ip` is null when no trusted
 * proxy is configured, in which case the limit is keyed by username alone.
 */
function buildKeys(ip: string | null, username?: string): LimitKey[] {
  const user = (username || "").trim().toLowerCase();
  if (ip) {
    return [
      { key: `iu:${hash(`${ip}|${user}`)}`, max: MAX_FAILED_ATTEMPTS },
      { key: `ip:${hash(ip)}`, max: MAX_FAILED_ATTEMPTS_PER_IP },
    ];
  }
  return [{ key: `u:${hash(user)}`, max: MAX_FAILED_ATTEMPTS }];
}

function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return (data[0] as Record<string, unknown>) || null;
  return (data as Record<string, unknown>) || null;
}

function toResult(blocked: boolean, retrySeconds: number): RateLimitResult {
  if (!blocked) return { allowed: true, isBlocked: false };
  const seconds = Math.max(1, retrySeconds || LOCKOUT_SECONDS);
  return {
    allowed: false,
    isBlocked: true,
    retryAfterSeconds: seconds,
    retryAfterMinutes: Math.ceil(seconds / 60),
  };
}

function worse(a: RateLimitResult, b: RateLimitResult): RateLimitResult {
  if (!b.isBlocked) return a;
  if (!a.isBlocked) return b;
  return (b.retryAfterSeconds || 0) > (a.retryAfterSeconds || 0) ? b : a;
}

export function createRateLimiter(rpc: RpcCaller) {
  async function call(fn: string, args: Record<string, unknown>) {
    let res;
    try {
      res = await rpc(fn, args);
    } catch (err) {
      if (err instanceof RateLimitUnavailableError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new RateLimitUnavailableError(
        `Login rate-limit store unavailable: RPC invocation for '${fn}' failed (${message})`,
        { cause: err }
      );
    }
    if (res.error) {
      const errCode = res.error.code;
      const errMsg = res.error.message || "Unknown error";
      const hint = res.error.hint;
      const status = res.status;
      const statusText = res.statusText;
      const endpoint = res.endpoint || `RPC '${fn}'`;

      const statusPart = status ? ` HTTP ${status}${statusText ? ` (${statusText})` : ""}` : "";
      const codePart = errCode ? ` [${errCode}]` : "";
      const hintPart = hint ? ` (hint: ${hint})` : "";

      throw new RateLimitUnavailableError(
        `Login rate-limit store unavailable: RPC call to '${endpoint}' failed with${statusPart}:${codePart} ${errMsg}${hintPart}`,
        {
          cause: res.error,
          code: errCode,
          status,
          endpoint,
        }
      );
    }
    return res.data;
  }

  return {
    async check(ip: string | null, username?: string): Promise<RateLimitResult> {
      let result: RateLimitResult = { allowed: true, isBlocked: false };
      for (const { key } of buildKeys(ip, username)) {
        const row = firstRow(await call("login_rate_limit_status", { p_key: key }));
        result = worse(result, toResult(!!row?.blocked, Number(row?.retry_after_seconds || 0)));
      }
      return result;
    },

    async recordFailure(ip: string | null, username?: string): Promise<RateLimitResult> {
      let result: RateLimitResult = { allowed: true, isBlocked: false };
      for (const { key, max } of buildKeys(ip, username)) {
        const row = firstRow(
          await call("login_rate_limit_record_failure", {
            p_key: key,
            p_max: max,
            p_window_seconds: WINDOW_SECONDS,
            p_lockout_seconds: LOCKOUT_SECONDS,
          })
        );
        result = worse(result, toResult(!!row?.blocked, Number(row?.retry_after_seconds || 0)));
      }
      return result;
    },

    /** Clears the per-account key after a successful login (the per-IP counter keeps running). */
    async clear(ip: string | null, username?: string): Promise<void> {
      const [first] = buildKeys(ip, username);
      await call("login_rate_limit_clear", { p_key: first.key });
    },
  };
}

// Default limiter backed by the configured database provider (Supabase by default, or standalone PostgreSQL).
const defaultLimiter = createRateLimiter(async (fn, args) => {
  const { resolveDbProvider } = await import("@/lib/db/provider");
  const provider = resolveDbProvider();

  if (provider === "postgres") {
    const { postgresExecutor } = await import("@/lib/db/postgresClient");
    const endpoint = `postgres:rpc:${fn}`;
    try {
      const res = await postgresExecutor.rpc(fn, args);
      return {
        data: res.data,
        error: res.error,
        status: res.status,
        statusText: res.statusText,
        endpoint,
      };
    } catch (err: unknown) {
      throw new RateLimitUnavailableError(
        `Login rate-limit store unavailable: PostgreSQL RPC call to '${fn}' threw error: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err, endpoint }
      );
    }
  }

  // Default provider: Supabase
  const { getSupabaseAdminClient, getSupabaseUrl } = await import("@/lib/db/supabaseClient");
  const endpoint = `${getSupabaseUrl() || "https://lznyejowgqwbavtnqqns.supabase.co"}/rest/v1/rpc/${fn}`;
  try {
    const res = await getSupabaseAdminClient().rpc(fn, args);
    const postgrestErr = res.error
      ? {
          message: res.error.message,
          code: (res.error as { code?: string }).code,
          details: (res.error as { details?: string }).details,
          hint: (res.error as { hint?: string }).hint,
        }
      : null;
    return {
      data: res.data,
      error: postgrestErr,
      status: res.status,
      statusText: res.statusText,
      endpoint,
    };
  } catch (err: unknown) {
    throw new RateLimitUnavailableError(
      `Login rate-limit store unavailable: RPC call to '${endpoint}' threw error: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err, endpoint }
    );
  }
});

export const checkRateLimit = defaultLimiter.check;
export const recordFailedAttempt = defaultLimiter.recordFailure;
export const clearRateLimit = defaultLimiter.clear;
