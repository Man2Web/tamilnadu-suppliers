import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import os from "os";
import path from "path";
import fs from "fs";
import "./helpers";
import { createFakeRateLimitRpc } from "./helpers";
import { createRateLimiter, RateLimitUnavailableError, MAX_FAILED_ATTEMPTS } from "../../src/lib/auth/rateLimit";
import { getTrustedClientIp } from "../../src/lib/auth/clientIp";

// NOTE: these tests exercise the TypeScript limiter against a JS model of the SQL functions.
// The SQL itself is verified by the optional live test below (RATE_LIMIT_IT=1, after the migration is applied).

const stateFile = path.join(os.tmpdir(), `tns-ratelimit-${process.pid}.json`);
afterEach(() => fs.rmSync(stateFile, { force: true }));

describe("shared login rate limiting", () => {
  it("7. blocks after the maximum failures, across separate limiter instances (shared store)", async () => {
    const fake = createFakeRateLimitRpc({ file: stateFile });
    const instanceA = createRateLimiter(fake.rpc);
    const instanceB = createRateLimiter(fake.rpc); // a second app instance

    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) {
      const r = await (i % 2 ? instanceA : instanceB).recordFailure("10.0.0.5", "Victim");
      assert.equal(r.isBlocked, false);
    }
    assert.equal((await instanceA.check("10.0.0.5", "victim")).isBlocked, false);
    const last = await instanceB.recordFailure("10.0.0.5", "victim"); // case-insensitive username
    assert.equal(last.isBlocked, true);
    assert.ok((last.retryAfterSeconds || 0) > 0);
    assert.equal((await instanceA.check("10.0.0.5", "victim")).isBlocked, true);
  });

  it("7. the limit survives an application restart (state is persisted, not in process memory)", async () => {
    const before = createRateLimiter(createFakeRateLimitRpc({ file: stateFile }).rpc);
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await before.recordFailure("10.0.0.6", "bob");
    // "Restart": brand-new limiter and RPC objects, only the persisted store remains
    const afterRestart = createRateLimiter(createFakeRateLimitRpc({ file: stateFile }).rpc);
    assert.equal((await afterRestart.check("10.0.0.6", "bob")).isBlocked, true);
  });

  it("lockout is scoped: other users / IPs are unaffected, and success clears the account key", async () => {
    const rl = createRateLimiter(createFakeRateLimitRpc({ file: stateFile }).rpc);
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await rl.recordFailure("10.0.0.7", "carol");
    assert.equal((await rl.check("10.0.0.7", "dave")).isBlocked, false);
    assert.equal((await rl.check("10.0.0.8", "carol")).isBlocked, false);
    await rl.clear("10.0.0.7", "carol");
    assert.equal((await rl.check("10.0.0.7", "carol")).isBlocked, false);
  });

  it("without a trusted IP the limit is keyed by username (forwarded headers cannot be used to dodge it)", async () => {
    const rl = createRateLimiter(createFakeRateLimitRpc({ file: stateFile }).rpc);
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await rl.recordFailure(null, "erin");
    assert.equal((await rl.check(null, "erin")).isBlocked, true);
  });

  it("stores only hashes (no plaintext username or IP) in the persisted keys", async () => {
    const rl = createRateLimiter(createFakeRateLimitRpc({ file: stateFile }).rpc);
    await rl.recordFailure("203.0.113.9", "SecretUser");
    const raw = fs.readFileSync(stateFile, "utf8");
    assert.ok(!/secretuser/i.test(raw) && !raw.includes("203.0.113.9"));
  });

  it("fails CLOSED when the store errors", async () => {
    const rl = createRateLimiter(createFakeRateLimitRpc({ failWith: "boom" }).rpc);
    await assert.rejects(rl.check("10.0.0.9", "x"), RateLimitUnavailableError);
    await assert.rejects(rl.recordFailure("10.0.0.9", "x"), RateLimitUnavailableError);
    const throwing = createRateLimiter(async () => {
      throw new Error("network down");
    });
    await assert.rejects(throwing.check("10.0.0.9", "x"), RateLimitUnavailableError);
  });
});

describe("trusted client IP resolution", () => {
  const withProxies = (n: string, fn: () => void) => {
    const prev = process.env.TRUSTED_PROXY_COUNT;
    process.env.TRUSTED_PROXY_COUNT = n;
    try {
      fn();
    } finally {
      process.env.TRUSTED_PROXY_COUNT = prev;
    }
  };
  const r = (xff: string) => new Request("http://x/", { headers: { "x-forwarded-for": xff } });

  it("ignores forwarded headers unless TRUSTED_PROXY_COUNT is set", () => {
    withProxies("0", () => assert.equal(getTrustedClientIp(r("1.2.3.4")), null));
  });
  it("uses the entry appended by the trusted proxy, not client-forged leftmost values", () => {
    withProxies("1", () => assert.equal(getTrustedClientIp(r("6.6.6.6, 198.51.100.4")), "198.51.100.4"));
    withProxies("2", () => assert.equal(getTrustedClientIp(r("6.6.6.6, 198.51.100.4, 10.0.0.1")), "198.51.100.4"));
  });
  it("rejects malformed configuration and malformed addresses", () => {
    withProxies("abc", () => assert.throws(() => getTrustedClientIp(r("1.1.1.1"))));
    withProxies("1", () => assert.equal(getTrustedClientIp(r("<script>")), null));
  });
});

// Optional: runs against the REAL RPCs once the migration has been applied (writes + removes one random key).
describe("live Supabase RPC (optional)", { skip: process.env.RATE_LIMIT_IT !== "1" }, () => {
  it("atomic lockout and clear against the real database", async () => {
    const { getSupabaseAdminClient } = await import("../../src/lib/db/supabaseClient");
    const db = getSupabaseAdminClient();
    const rl = createRateLimiter(async (fn, args) => (await db.rpc(fn, args)) as any);
    const user = `it-${Math.random().toString(36).slice(2)}`;
    await Promise.all(Array.from({ length: MAX_FAILED_ATTEMPTS }, () => rl.recordFailure(null, user)));
    assert.equal((await rl.check(null, user)).isBlocked, true);
    await rl.clear(null, user);
    assert.equal((await rl.check(null, user)).isBlocked, false);
  });
});
