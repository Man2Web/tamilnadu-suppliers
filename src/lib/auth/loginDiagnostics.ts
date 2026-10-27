// ============================================================================
// TAMILNADU SUPPLIERS - LOGIN FAILURE CLASSIFICATION
// Maps internal failures to a safe client response + a sanitized server log line, so a
// 4xx/5xx from /api/auth/login can always be traced to its real cause without leaking details.
// ============================================================================

import { RateLimitUnavailableError } from "./rateLimit";

export type LoginFailureCode =
  | "RATE_LIMIT_UNAVAILABLE" // rate-limit store unreachable / rejected the server key / RPC missing (fails closed)
  | "AUTH_BACKEND_UNAVAILABLE" // database unreachable / rejected the server key while verifying credentials
  | "SERVER_MISCONFIGURED" // SESSION_SECRET / TRUSTED_PROXY_COUNT / DB target configuration
  | "INTERNAL_ERROR";

export interface ClassifiedFailure {
  status: number;
  code: LoginFailureCode;
  clientMessage: string;
  /** Safe to log: never contains keys, passwords or cookies. */
  logDetail: string;
}

const SECRET_LIKE = /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}|sb_(secret|publishable)_[A-Za-z0-9_-]+|postgres(ql)?:\/\/\S+)/g;

export function sanitize(text: string): string {
  return text.replace(SECRET_LIKE, "[redacted]").slice(0, 300);
}

export function classifyLoginFailure(err: unknown): ClassifiedFailure {
  const message = err instanceof Error ? err.message : String(err);

  if (err instanceof RateLimitUnavailableError) {
    const keyRejected = err.status === 401 || /invalid api key|jwt|apikey/i.test(err.message);
    const missing = err.status === 404 || /could not find the function|does not exist|PGRST202|42P01/i.test(err.message);
    return {
      status: 503,
      code: "RATE_LIMIT_UNAVAILABLE",
      clientMessage: "Sign-in is temporarily unavailable. Please try again shortly.",
      logDetail: keyRejected
        ? `The database rejected the server API key for the rate-limit RPC. Check SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL belong to the same project (run scripts/check-env.mjs). ${sanitize(err.message)}`
        : missing
        ? `rate-limit table/RPC not found. Apply migration 20261023_login_rate_limits.sql. ${sanitize(err.message)}`
        : sanitize(err.message),
    };
  }

  if (message.startsWith("[CONFIG]") || message.startsWith("[DATABASE TARGET VIOLATION]") || message.startsWith("Supabase configuration missing")) {
    return {
      status: 500,
      code: "SERVER_MISCONFIGURED",
      clientMessage: "The server is not configured correctly. Please contact the administrator.",
      logDetail: sanitize(message),
    };
  }

  if (/^(Supabase|Database) error|^Something went wrong while|^The database is not reachable|invalid api key|fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|JWT/i.test(message)) {
    return {
      status: 503,
      code: "AUTH_BACKEND_UNAVAILABLE",
      clientMessage: "Sign-in is temporarily unavailable. Please try again shortly.",
      logDetail: `database access failed (${sanitize(message)})`,
    };
  }

  return {
    status: 500,
    code: "INTERNAL_ERROR",
    clientMessage: "An unexpected error occurred during login.",
    logDetail: sanitize(message),
  };
}
