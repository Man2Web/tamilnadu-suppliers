import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { TEST_SESSION_SECRET, FAKE_USERS } from "./helpers";
import { getSessionSecret, createSessionToken, verifySessionToken } from "../../src/lib/auth/session";

const env = process.env as Record<string, string | undefined>;

describe("SESSION_SECRET configuration (no hard-coded fallback)", () => {
  afterEach(() => {
    env.SESSION_SECRET = TEST_SESSION_SECRET;
    env.NODE_ENV = "test";
  });

  it("1. production with a missing SESSION_SECRET fails securely", async () => {
    env.NODE_ENV = "production";
    delete env.SESSION_SECRET;
    delete env.JWT_SECRET;
    assert.throws(() => getSessionSecret(), /SESSION_SECRET is not set/);
    await assert.rejects(createSessionToken(FAKE_USERS["u-admin"]), /SESSION_SECRET is not set/);
    await assert.rejects(verifySessionToken("anything"), /SESSION_SECRET is not set/);
  });

  it("does not fall back to JWT_SECRET or a built-in value", () => {
    delete env.SESSION_SECRET;
    env.JWT_SECRET = "x".repeat(64);
    assert.throws(() => getSessionSecret(), /SESSION_SECRET is not set/);
    delete env.JWT_SECRET;
  });

  it("rejects short and placeholder secrets, without echoing them", () => {
    env.SESSION_SECRET = "short";
    assert.throws(() => getSessionSecret(), (e: Error) => /invalid/.test(e.message) && !e.message.includes("short\""));
    env.SESSION_SECRET = "change-this-to-a-cryptographically-secure-random-string-in-production";
    assert.throws(() => getSessionSecret(), /invalid/);
  });

  it("2. a valid configured secret creates and verifies sessions (format unchanged)", async () => {
    const token = await createSessionToken(FAKE_USERS["u-admin"], "sid-1");
    const payload = await verifySessionToken(token);
    assert.equal(payload?.sub, "u-admin");
    assert.equal(payload?.role, "ADMIN");
    assert.equal(payload?.sid, "sid-1");
    assert.equal(token.split(".").length, 3); // standard HS256 JWT
  });

  it("a token signed with a different secret is rejected (re-login required after secret change)", async () => {
    const token = await createSessionToken(FAKE_USERS["u-admin"], "sid-1");
    env.SESSION_SECRET = "a-completely-different-secret-value-0123456789abcdef";
    assert.equal(await verifySessionToken(token), null);
  });

  it("session cookie stays HttpOnly + SameSite=Lax and is Secure in production", async () => {
    const mod = await import("../../src/lib/auth/session");
    assert.equal(mod.SESSION_COOKIE_OPTIONS.httpOnly, true);
    assert.equal(mod.SESSION_COOKIE_OPTIONS.sameSite, "lax");
    assert.equal(mod.SESSION_COOKIE_OPTIONS.secure, process.env.NODE_ENV === "production");
  });

  it("isCookieSecureForRequest adapts to HTTPS, plain HTTP, and COOKIE_SECURE override", async () => {
    const { isCookieSecureForRequest } = await import("../../src/lib/auth/session");
    const origEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "production";

      // Standard HTTPS via reverse proxy
      assert.equal(isCookieSecureForRequest({ headers: { get: () => "https" } }), true);

      // Plain HTTP (direct IP access without SSL)
      assert.equal(isCookieSecureForRequest({ headers: { get: () => "http" } }), false);

      // Explicit COOKIE_SECURE override
      process.env.COOKIE_SECURE = "false";
      assert.equal(isCookieSecureForRequest({ headers: { get: () => "https" } }), false);

      process.env.COOKIE_SECURE = "true";
      assert.equal(isCookieSecureForRequest({ headers: { get: () => "http" } }), true);
    } finally {
      (process.env as any).NODE_ENV = origEnv;
      delete process.env.COOKIE_SECURE;
    }
  });
});
