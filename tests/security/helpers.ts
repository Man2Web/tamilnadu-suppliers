// Shared helpers for the DB-independent security tests.
// These tests NEVER touch real business data: the Supabase store is stubbed and the
// rate-limit RPCs are replaced by a JS model of the SQL functions in
// supabase/migrations/20261023_login_rate_limits.sql.

import fs from "fs";

// Safe, fake configuration (no real credentials). Must be set before importing app modules.
export const TEST_SESSION_SECRET = "test-only-session-secret-0123456789-abcdefghijklmnop";
process.env.SESSION_SECRET = TEST_SESSION_SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://lznyejowgqwbavtnqqns.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key-not-real";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key-not-real";
process.env.TRUSTED_PROXY_COUNT = "1";

import { ADMIN_PRESET_PERMISSIONS, BILLING_PRESET_PERMISSIONS, ALL_PERMISSIONS } from "../../src/lib/types/permissions";

export const FAKE_USERS: Record<string, any> = {
  "u-super": { id: "u-super", name: "Test Super", email: "super@test.local", username: "super", role: "SUPER_ADMIN", status: "ACTIVE", permissions: ALL_PERMISSIONS },
  "u-admin": { id: "u-admin", name: "Test Admin", email: "admin@test.local", username: "tadmin", role: "ADMIN", status: "ACTIVE", permissions: ADMIN_PRESET_PERMISSIONS },
  "u-billing": { id: "u-billing", name: "Test Billing", email: "billing@test.local", username: "tbilling", role: "BILLING", status: "ACTIVE", permissions: BILLING_PRESET_PERMISSIONS },
  "u-employee": { id: "u-employee", name: "Test Employee", email: "emp@test.local", username: "temp", role: "EMPLOYEE", status: "ACTIVE", permissions: [] },
  "u-inactive": { id: "u-inactive", name: "Test Inactive", email: "off@test.local", username: "toff", role: "ADMIN", status: "INACTIVE", permissions: ADMIN_PRESET_PERMISSIONS },
};

const AUTH_METHODS = new Set(["getUser", "getSession", "touchSession"]);

/**
 * Replaces every store method with a stub. Auth lookups are served from FAKE_USERS;
 * any other call is recorded in `dataCalls` so tests can prove a denied request never reached data access.
 */
export async function stubStore() {
  const { default: store } = await import("../../src/lib/db/store");
  const dataCalls: string[] = [];
  const overrides: Record<string, (...a: any[]) => any> = {};
  const proto = Object.getPrototypeOf(store);
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === "constructor" || typeof (store as any)[name] !== "function") continue;
    (store as any)[name] = async (...args: any[]) => {
      if (name === "getUser") return FAKE_USERS[args[0]];
      if (name === "getSession") return { id: args[0], status: "ACTIVE" };
      if (AUTH_METHODS.has(name)) return undefined;
      dataCalls.push(name);
      if (overrides[name]) return overrides[name](...args);
      return undefined;
    };
  }
  return { store: store as any, dataCalls, overrides };
}

export async function cookieFor(userId: string): Promise<string> {
  const { createSessionToken, SESSION_COOKIE_NAME } = await import("../../src/lib/auth/session");
  const token = await createSessionToken(FAKE_USERS[userId], `sid-${userId}`);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

/** JS model of the SQL rate-limit functions (same windowing / lock semantics), optionally file-persisted. */
export function createFakeRateLimitRpc(opts: { file?: string; failWith?: string } = {}) {
  let memory: any = {};
  const load = () => (opts.file ? (fs.existsSync(opts.file) ? JSON.parse(fs.readFileSync(opts.file, "utf8")) : {}) : memory);
  const save = (t: any) => {
    if (opts.file) fs.writeFileSync(opts.file, JSON.stringify(t));
    else memory = t;
  };
  let now = () => Date.now();
  const rpc = async (fn: string, args: any) => {
    if (opts.failWith) return { data: null, error: { message: opts.failWith } };
    const t = load();
    const k = args.p_key as string;
    const row = t[k];
    const nowMs = now();
    if (fn === "login_rate_limit_status") {
      const blocked = !!row?.lockedUntil && row.lockedUntil > nowMs;
      return { data: [{ blocked, retry_after_seconds: blocked ? Math.ceil((row.lockedUntil - nowMs) / 1000) : 0 }], error: null };
    }
    if (fn === "login_rate_limit_clear") {
      delete t[k];
      save(t);
      return { data: null, error: null };
    }
    if (fn === "login_rate_limit_record_failure") {
      const lockoutMs = args.p_lockout_seconds * 1000;
      const windowMs = args.p_window_seconds * 1000;
      let r = row;
      const unlocked = !r || !r.lockedUntil || r.lockedUntil <= nowMs;
      if (!r || (unlocked && r.windowStart < nowMs - windowMs)) {
        r = { attempts: 1, windowStart: nowMs, lockedUntil: 1 >= args.p_max ? nowMs + lockoutMs : null };
      } else {
        r.attempts += 1;
        if (r.attempts >= args.p_max) r.lockedUntil = nowMs + lockoutMs;
      }
      t[k] = r;
      save(t);
      const blocked = !!r.lockedUntil && r.lockedUntil > nowMs;
      return { data: [{ blocked, retry_after_seconds: blocked ? Math.ceil((r.lockedUntil - nowMs) / 1000) : 0, attempts: r.attempts }], error: null };
    }
    return { data: null, error: { message: "unknown fn" } };
  };
  return { rpc, setNow: (fnNow: () => number) => (now = fnNow) };
}

export function req(url: string, init: { method?: string; cookie?: string; headers?: Record<string, string>; body?: any } = {}): Request {
  const headers: Record<string, string> = { ...(init.headers || {}) };
  if (init.cookie) headers.cookie = init.cookie;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost:3000${url}`, {
    method: init.method || "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}
