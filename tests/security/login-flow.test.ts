import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert";
import { stubStore, cookieFor, createFakeRateLimitRpc, FAKE_USERS, req } from "./helpers";
import { NextRequest } from "next/server";

// Exercises the real login / logout route handlers with a stubbed store and a modelled rate-limit RPC.

describe("login + logout behaviour with shared rate limiting", () => {
  let ctx: Awaited<ReturnType<typeof stubStore>>;
  let login: (r: Request) => Promise<Response>;
  let logout: (r: NextRequest) => Promise<Response>;
  let fake: ReturnType<typeof createFakeRateLimitRpc>;
  let rpcFailure: string | undefined;

  const post = (body: any, ip = "198.51.100.20") =>
    login(req("/api/auth/login", { method: "POST", body, headers: { "x-forwarded-for": `6.6.6.6, ${ip}` } }));

  before(async () => {
    ctx = await stubStore();
    ctx.overrides.verifyCredentialsAsync = async (u: string, p: string) =>
      u === "tadmin" && p === "correct-password" ? FAKE_USERS["u-admin"] : null;
    ctx.overrides.createSession = async () => ({ id: "sid-login-1" });
    ctx.overrides.markSessionSignedOut = async () => undefined;
    login = (await import("../../src/app/api/auth/login/route")).POST as any;
    logout = (await import("../../src/app/api/auth/logout/route")).POST as any;

    // Route the limiter's RPCs through the model (the real Supabase client singleton is monkeypatched).
    const { getSupabaseAdminClient } = await import("../../src/lib/db/supabaseClient");
    (getSupabaseAdminClient() as any).rpc = (fn: string, args: any) =>
      rpcFailure ? Promise.resolve({ data: null, error: { message: rpcFailure } }) : fake.rpc(fn, args);
  });

  beforeEach(() => {
    fake = createFakeRateLimitRpc();
    rpcFailure = undefined;
  });

  it("8. valid login succeeds, returns the unchanged payload and sets an HttpOnly signed cookie", async () => {
    const res = await post({ username: "tadmin", password: "correct-password" });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.user.role, "ADMIN");
    // The sidebar renders from these immediately after login (regression: it stayed empty until the next /me refresh)
    assert.equal(json.user.status, "ACTIVE");
    assert.ok("permissions" in json.user, "login response must carry permissions");
    assert.ok(!("passwordHash" in json.user) && !("password" in json.user), "login response must not leak credentials");
    const cookie = res.headers.get("set-cookie") || "";
    assert.match(cookie, /tns_session=[^;]+/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=lax/i);
  });

  it("8. wrong password returns the generic 401", async () => {
    const res = await post({ username: "tadmin", password: "nope" });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "Invalid username or password.");
  });

  it("7. after 5 failures the account is locked (429 + Retry-After), even for the correct password", async () => {
    for (let i = 0; i < 5; i++) assert.equal((await post({ username: "tadmin", password: "bad" })).status, 401);
    const locked = await post({ username: "tadmin", password: "correct-password" });
    assert.equal(locked.status, 429);
    assert.ok(Number(locked.headers.get("retry-after")) > 0);
  });

  it("7. a client-forged leftmost X-Forwarded-For does not reset the throttle", async () => {
    for (let i = 0; i < 5; i++) {
      await login(req("/api/auth/login", { method: "POST", body: { username: "tadmin", password: "bad" }, headers: { "x-forwarded-for": `9.9.9.${i}, 198.51.100.20` } }));
    }
    assert.equal((await post({ username: "tadmin", password: "correct-password" })).status, 429);
  });

  it("fails closed with 503 (never allows the attempt) when the rate-limit store is down", async () => {
    rpcFailure = "relation does not exist";
    const res = await post({ username: "tadmin", password: "correct-password" });
    assert.equal(res.status, 503);
    const json = await res.json();
    assert.equal(json.code, "RATE_LIMIT_UNAVAILABLE");
    assert.equal(json.error, "Sign-in is temporarily unavailable. Please try again shortly.");
    assert.ok(!(res.headers.get("set-cookie") || "").includes("tns_session=ey"));
  });

  it("fails closed with 503 and refuses login when rate-limit RPC function is missing (PGRST202)", async () => {
    rpcFailure = "Could not find the function public.login_rate_limit_status(p_key) in the schema cache";
    const res = await post({ username: "tadmin", password: "correct-password" });
    assert.equal(res.status, 503);
    const json = await res.json();
    assert.equal(json.code, "RATE_LIMIT_UNAVAILABLE");
    assert.ok(!(res.headers.get("set-cookie") || "").includes("tns_session="));
  });

  it("fails closed with 503 and refuses login when API key is invalid (401)", async () => {
    rpcFailure = "Invalid API key";
    const res = await post({ username: "tadmin", password: "correct-password" });
    assert.equal(res.status, 503);
    const json = await res.json();
    assert.equal(json.code, "RATE_LIMIT_UNAVAILABLE");
    assert.equal(json.error, "Sign-in is temporarily unavailable. Please try again shortly.");
    assert.ok(!(res.headers.get("set-cookie") || "").includes("tns_session="));
  });

  it("8. logout clears the cookie", async () => {
    const cookie = await cookieFor("u-admin");
    const nreq = new NextRequest("http://localhost:3000/api/auth/logout", { method: "POST", headers: { cookie } });
    const res = await logout(nreq);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("set-cookie") || "", /tns_session=;|tns_session=\s*;|Max-Age=0|Expires=/i);
  });
});
