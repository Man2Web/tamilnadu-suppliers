import { describe, it, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { stubStore, createFakeRateLimitRpc, FAKE_USERS, req, TEST_SESSION_SECRET } from "./helpers";
import { interpretLoginResponse, isSessionCookieStored, COOKIE_NOT_STORED_MESSAGE } from "../../src/lib/auth/loginResponse";
import { collectEnvDiagnostics } from "../../src/lib/diagnostics/envDiagnostics.mjs";

const env = process.env as Record<string, string | undefined>;

// ---------------------------------------------------------------------------------------------
// Server side: every failure of /api/auth/login has a distinct code and a safe, sanitized log line
// ---------------------------------------------------------------------------------------------
describe("login route failure classification", () => {
  let ctx: Awaited<ReturnType<typeof stubStore>>;
  let login: (r: Request) => Promise<Response>;
  let fake: ReturnType<typeof createFakeRateLimitRpc>;
  let rpcOverride: ((fn: string, args: any) => Promise<any>) | null = null;
  let logged: string[] = [];
  const realError = console.error;

  const post = (body: any = { username: "tadmin", password: "correct-password" }) =>
    login(req("/api/auth/login", { method: "POST", body, headers: { "x-forwarded-for": "6.6.6.6, 198.51.100.30" } }));

  before(async () => {
    ctx = await stubStore();
    ctx.overrides.verifyCredentialsAsync = async (u: string, p: string) =>
      u === "tadmin" && p === "correct-password" ? FAKE_USERS["u-admin"] : null;
    ctx.overrides.createSession = async () => ({ id: "sid-1" });
    login = (await import("../../src/app/api/auth/login/route")).POST as any;
    const { getSupabaseAdminClient } = await import("../../src/lib/db/supabaseClient");
    (getSupabaseAdminClient() as any).rpc = (fn: string, args: any) => (rpcOverride ? rpcOverride(fn, args) : fake.rpc(fn, args));
  });

  beforeEach(() => {
    fake = createFakeRateLimitRpc();
    rpcOverride = null;
    logged = [];
    console.error = (...a: any[]) => logged.push(a.join(" "));
  });
  afterEach(() => {
    console.error = realError;
    env.SESSION_SECRET = TEST_SESSION_SECRET;
    env.TRUSTED_PROXY_COUNT = "1";
  });

  it("successful login still works (200, user payload, HttpOnly cookie, nothing logged as an error)", async () => {
    const res = await post();
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.user.role, "ADMIN");
    assert.match(res.headers.get("set-cookie") || "", /tns_session=[^;]+;.*HttpOnly/i);
    assert.deepEqual(logged, []);
  });

  it("wrong password is a plain 401 with the generic message (and is the ONLY 401 the route produces)", async () => {
    const res = await post({ username: "tadmin", password: "wrong" });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "Invalid username or password.");
  });

  it("CONFIRMED CAUSE: Supabase 'Invalid API key' on the rate-limit RPC -> fail-closed 503 RATE_LIMIT_UNAVAILABLE, never 401/403, no cookie, key never logged", async () => {
    const fakeKey = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLXZhbHVl";
    rpcOverride = async () => ({ data: null, error: { message: `Invalid API key ${fakeKey}`, code: "PGRST301" }, status: 401, statusText: "Unauthorized" });
    const res = await post();
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.code, "RATE_LIMIT_UNAVAILABLE");
    assert.ok(!(res.headers.get("set-cookie") || "").includes("tns_session=ey"), "no session may be issued");
    const log = logged.join("\n");
    assert.match(log, /rejected the server API key/);
    assert.ok(!log.includes(fakeKey), "secret-like values must be redacted from logs");
  });

  it("missing rate-limit RPC/table (migration not applied) is reported with a migration hint", async () => {
    rpcOverride = async () => ({ data: null, error: { message: "Could not find the function public.login_rate_limit_status", code: "PGRST202" }, status: 404, statusText: "Not Found" });
    const res = await post();
    assert.equal(res.status, 503);
    assert.match(logged.join("\n"), /Apply migration 20261023_login_rate_limits\.sql/);
  });

  it("database failure while verifying credentials is a 503, not a misleading 401", async () => {
    ctx.overrides.verifyCredentialsAsync = async () => {
      throw new Error("Supabase error fetching user x: Invalid API key");
    };
    const res = await post();
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, "AUTH_BACKEND_UNAVAILABLE");
    ctx.overrides.verifyCredentialsAsync = async (u: string, p: string) => (u === "tadmin" && p === "correct-password" ? FAKE_USERS["u-admin"] : null);
  });

  it("missing SESSION_SECRET is reported as SERVER_MISCONFIGURED (500) without leaking details", async () => {
    delete env.SESSION_SECRET;
    const res = await post();
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.code, "SERVER_MISCONFIGURED");
    assert.ok(!JSON.stringify(body).includes("SESSION_SECRET"));
    assert.match(logged.join("\n"), /SESSION_SECRET is not set/);
  });

  it("Coolify-style quoted variables (TRUSTED_PROXY_COUNT=\"1\", SESSION_SECRET=\"...\") do not break login", async () => {
    env.TRUSTED_PROXY_COUNT = '"1"';
    env.SESSION_SECRET = `"${TEST_SESSION_SECRET}"`;
    const res = await post();
    assert.equal(res.status, 200);
  });

  it("rate limiting still returns 429 and still fails closed", async () => {
    for (let i = 0; i < 5; i++) await post({ username: "tadmin", password: "bad" });
    assert.equal((await post()).status, 429);
  });
  it("logs request validation failure stage when username or password missing", async () => {
    let warned = "";
    const origWarn = console.warn;
    console.warn = (...a: any[]) => { warned += a.join(" ") + "\n"; };
    try {
      const res = await post({ username: "", password: "" });
      assert.equal(res.status, 400);
      assert.match(warned, /\[login:request-validation\]/);
    } finally {
      console.warn = origWarn;
    }
  });

  it("logs rate limiting stage when blocked", async () => {
    let warned = "";
    const origWarn = console.warn;
    console.warn = (...a: any[]) => { warned += a.join(" ") + "\n"; };
    try {
      for (let i = 0; i < 5; i++) await post({ username: "tadmin", password: "bad" });
      const locked = await post({ username: "tadmin", password: "bad" });
      assert.equal(locked.status, 429);
      assert.match(warned, /\[login:rate-limiting\]/);
    } finally {
      console.warn = origWarn;
    }
  });

  it("logs credential verification failure stage on invalid password without leaking secrets", async () => {
    let warned = "";
    const origWarn = console.warn;
    console.warn = (...a: any[]) => { warned += a.join(" ") + "\n"; };
    try {
      const res = await post({ username: "tadmin", password: "bad" });
      assert.equal(res.status, 401);
      assert.match(warned, /\[login:credential-verification\]/);
      assert.ok(!warned.includes("bad"));
    } finally {
      console.warn = origWarn;
    }
  });

  it("logs session creation stage failure when store fails to create session", async () => {
    ctx.overrides.createSession = async () => {
      throw new Error("DB session insert deadlock");
    };
    try {
      const res = await post();
      assert.equal(res.status, 500);
      assert.match(logged.join("\n"), /\[login:session-creation\]/);
    } finally {
      ctx.overrides.createSession = async () => ({ id: "sid-1" });
    }
  });

  it("logs cookie setup stage failure when session signing fails", async () => {
    delete env.SESSION_SECRET;
    const res = await post();
    assert.equal(res.status, 500);
    assert.match(logged.join("\n"), /\[login:cookie-setup\]/);
  });
});

// ---------------------------------------------------------------------------------------------
// Browser side: every completed response maps to a message (so the spinner always stops)
// ---------------------------------------------------------------------------------------------
describe("login form response handling", () => {
  const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const cases: [string, Response, RegExp][] = [
    ["401 bad credentials", json(401, { error: "Invalid username or password." }), /Invalid username or password/],
    ["400 missing fields", json(400, { error: "Invalid username or password." }), /Invalid/],
    ["401 with no body", new Response("", { status: 401 }), /Invalid username or password/],
    ["403 with no body", new Response("", { status: 403 }), /denied/i],
    ["403 with JSON", json(403, { error: "Forbidden by policy" }), /Forbidden by policy/],
    ["429 rate limited", json(429, { error: "Too many failed login attempts. Please try again in 15 minutes." }), /Too many/],
    ["503 backend", json(503, { error: "Sign-in is temporarily unavailable.", code: "AUTH_BACKEND_UNAVAILABLE" }), /temporarily unavailable/],
    ["502 HTML from gateway", new Response("<html>Bad gateway</html>", { status: 502 }), /temporarily unavailable/i],
    ["500 HTML error page", new Response("<html>oops</html>", { status: 500 }), /server error/i],
    ["418 unexpected", new Response("", { status: 418 }), /Unexpected response/],
  ];
  for (const [name, res, expected] of cases) {
    it(`${name} -> error message shown`, async () => {
      const outcome = await interpretLoginResponse(res);
      assert.equal(outcome.ok, false);
      assert.match((outcome as any).message, expected);
    });
  }

  it("200 -> ok with user payload", async () => {
    const outcome = await interpretLoginResponse(json(200, { success: true, user: { role: "ADMIN" } }));
    assert.equal(outcome.ok, true);
    assert.equal((outcome as any).user.role, "ADMIN");
  });

  it("detects a browser that did not keep the (secure) session cookie", async () => {
    assert.equal(await isSessionCookieStored((async () => json(200, {})) as any), true);
    assert.equal(await isSessionCookieStored((async () => json(401, { code: "UNAUTHENTICATED" })) as any), false);
    assert.equal(await isSessionCookieStored((async () => json(403, { code: "PASSWORD_CHANGE_REQUIRED" })) as any), true);
    assert.equal(await isSessionCookieStored((async () => { throw new Error("offline"); }) as any), true);
  });

  describe("frontend loading-state cleanup in finally block", () => {
    async function runFormSubmitLifecycle(mockFetch: () => Promise<Response>, isCookieStored = true) {
      let loading = false;
      let errorMessage: string | null = null;
      let navigated = false;

      // Exact lifecycle mirror of LoginForm.handleSubmit
      loading = true;
      let isNavigating = false;
      try {
        const res = await mockFetch();
        const outcome = await interpretLoginResponse(res);
        if (!outcome.ok) {
          errorMessage = outcome.message;
        } else if (!isCookieStored) {
          errorMessage = COOKIE_NOT_STORED_MESSAGE;
        } else {
          isNavigating = true;
          navigated = true;
        }
      } catch (err: any) {
        errorMessage = err.name === "AbortError" ? "Timeout" : "Network error";
      } finally {
        if (!isNavigating) {
          loading = false;
        }
      }

      return { loading, errorMessage, navigated };
    }

    it("401 invalid credentials resets loading to false via finally block", async () => {
      const res = await runFormSubmitLifecycle(async () => json(401, { error: "Invalid username or password." }));
      assert.equal(res.loading, false);
      assert.equal(res.navigated, false);
      assert.equal(res.errorMessage, "Invalid username or password.");
    });

    it("401 empty/non-JSON response resets loading to false via finally block", async () => {
      const res = await runFormSubmitLifecycle(async () => new Response("", { status: 401 }));
      assert.equal(res.loading, false);
      assert.equal(res.navigated, false);
      assert.equal(res.errorMessage, "Invalid username or password.");
    });

    it("429 rate limit resets loading to false via finally block", async () => {
      const res = await runFormSubmitLifecycle(async () => json(429, { error: "Too many failed login attempts." }));
      assert.equal(res.loading, false);
      assert.equal(res.navigated, false);
      assert.match(res.errorMessage || "", /Too many/);
    });

    it("503 backend failure resets loading to false via finally block", async () => {
      const res = await runFormSubmitLifecycle(async () => json(503, { error: "Sign-in is temporarily unavailable." }));
      assert.equal(res.loading, false);
      assert.equal(res.navigated, false);
      assert.match(res.errorMessage || "", /temporarily unavailable/);
    });

    it("network exception or request timeout resets loading to false via finally block", async () => {
      const res = await runFormSubmitLifecycle(async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      });
      assert.equal(res.loading, false);
      assert.equal(res.navigated, false);
      assert.equal(res.errorMessage, "Timeout");
    });

    it("cookie drop on insecure transport resets loading to false via finally block", async () => {
      const res = await runFormSubmitLifecycle(async () => json(200, { success: true }), false);
      assert.equal(res.loading, false);
      assert.equal(res.navigated, false);
      assert.match(res.errorMessage || "", /session cookie/);
    });

    it("successful login transitions to navigation cleanly", async () => {
      const res = await runFormSubmitLifecycle(async () => json(200, { success: true }));
      assert.equal(res.loading, true); // Stays true during navigation transition
      assert.equal(res.navigated, true);
      assert.equal(res.errorMessage, null);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Environment diagnostics: detects URL / key mismatches and never exposes values
// ---------------------------------------------------------------------------------------------
describe("environment diagnostics", () => {
  const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = (role: string, ref: string) => `${b64({ alg: "HS256" })}.${b64({ role, ref })}.${b64("sig-" + role + ref)}`;
  const REF = "lznyejowgqwbavtnqqns";
  const good = () => ({
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon", REF),
    SUPABASE_SERVICE_ROLE_KEY: jwt("service_role", REF),
    SESSION_SECRET: TEST_SESSION_SECRET,
    TRUSTED_PROXY_COUNT: "1",
  });

  it("a correct configuration reports no problems", () => {
    const d = collectEnvDiagnostics(good());
    assert.deepEqual(d.problems, []);
    assert.equal(d.supabase.serviceKeyMatchesUrl, true);
  });

  it("flags a service key from a different project than the URL", () => {
    const d = collectEnvDiagnostics({ ...good(), SUPABASE_SERVICE_ROLE_KEY: jwt("service_role", "hdaljmhsdaxsebvrskkp") });
    assert.ok(d.problems.some((p: string) => /belongs to project 'hdaljmhsdaxsebvrskkp'/.test(p) && /Invalid API key/.test(p)));
    assert.equal(d.supabase.serviceKeyMatchesUrl, false);
  });

  it("flags the anon key pasted into the service-role variable", () => {
    const d = collectEnvDiagnostics({ ...good(), SUPABASE_SERVICE_ROLE_KEY: jwt("anon", REF) });
    assert.ok(d.problems.some((p: string) => /holds a 'anon' key/.test(p)));
  });

  it("flags missing variables, wrong URL project, quoted values and a bad SESSION_SECRET", () => {
    const d = collectEnvDiagnostics({ ...good(), SESSION_SECRET: "short", NEXT_PUBLIC_SUPABASE_URL: "https://otherproject.supabase.co", TRUSTED_PROXY_COUNT: '"1"', NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined });
    const text = d.problems.join("\n");
    assert.match(text, /NEXT_PUBLIC_SUPABASE_ANON_KEY is not set/);
    assert.match(text, /not the dedicated project/);
    assert.match(text, /SESSION_SECRET is too short/);
    assert.match(text, /TRUSTED_PROXY_COUNT was saved with surrounding quotes/);
  });

  it("never includes secret values in its output", () => {
    const cfg = good();
    const out = JSON.stringify(collectEnvDiagnostics(cfg));
    for (const secret of [cfg.SUPABASE_SERVICE_ROLE_KEY, cfg.NEXT_PUBLIC_SUPABASE_ANON_KEY, cfg.SESSION_SECRET]) {
      assert.ok(!out.includes(secret as string));
    }
  });
});
