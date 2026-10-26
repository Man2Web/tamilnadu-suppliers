import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert";
import { stubStore, FAKE_USERS, cookieFor, createFakeRateLimitRpc } from "./helpers";
import { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, createSessionToken } from "../../src/lib/auth/session";

describe("Production Authentication, Logout & Live Server Audit", () => {
  let ctx: Awaited<ReturnType<typeof stubStore>>;
  let logoutHandler: (req: NextRequest) => Promise<Response>;
  let proxyHandler: (req: NextRequest) => Promise<Response>;
  let getActor: (req: Request) => Promise<any>;
  let signedOutSessionId: string | null = null;
  let auditLogsRecorded: any[] = [];

  before(async () => {
    ctx = await stubStore();
    ctx.overrides.markSessionSignedOut = async (sid: string) => {
      signedOutSessionId = sid;
      return { id: sid, status: "SIGNED_OUT" };
    };
    ctx.overrides.recordAuditLog = async (log: any) => {
      auditLogsRecorded.push(log);
      return log;
    };

    logoutHandler = (await import("../../src/app/api/auth/logout/route")).POST as any;
    proxyHandler = (await import("../../src/proxy")).proxy as any;
    getActor = (await import("../../src/lib/auth/serverAuth")).getActorFromRequestAsync as any;

    const { getSupabaseAdminClient } = await import("../../src/lib/db/supabaseClient");
    const fake = createFakeRateLimitRpc();
    (getSupabaseAdminClient() as any).rpc = fake.rpc;
  });

  beforeEach(() => {
    signedOutSessionId = null;
    auditLogsRecorded = [];
  });

  describe("Issue 1: Server-side Logout & Cookie Clearing", () => {
    it("1. calls server logout, marks session signed out in DB, and records audit log", async () => {
      const token = await createSessionToken(FAKE_USERS["u-admin"], "sid-admin-123");
      const req = new NextRequest("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });

      const res = await logoutHandler(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(signedOutSessionId, "sid-admin-123");
      assert.ok(auditLogsRecorded.some((l) => l.action === "SIGN_OUT"));
    });

    it("2. clears authentication cookie matching HTTP unencrypted transport without Secure flag", async () => {
      const token = await createSessionToken(FAKE_USERS["u-admin"], "sid-admin-http");
      const req = new NextRequest("http://jnaa7okvzakcjd0te1qwg2fj.82.29.165.177.sslip.io/api/auth/logout", {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
          "x-forwarded-proto": "http",
        },
      });

      const res = await logoutHandler(req);
      assert.equal(res.status, 200);
      const setCookie = res.headers.get("set-cookie") || "";
      assert.match(setCookie, /tns_session=/);
      assert.match(setCookie, /Max-Age=0|Expires=/i);
      // On plain HTTP, the cookie clearing header MUST NOT have Secure attribute or browsers drop it
      assert.ok(!setCookie.includes("Secure"), "Cookie clearing on plain HTTP must not contain Secure flag");
    });

    it("3. clears authentication cookie with Secure flag when on HTTPS", async () => {
      const token = await createSessionToken(FAKE_USERS["u-admin"], "sid-admin-https");
      const req = new NextRequest("https://tamilnadusuppliers.com/api/auth/logout", {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
          "x-forwarded-proto": "https",
        },
      });

      const res = await logoutHandler(req);
      assert.equal(res.status, 200);
      const setCookie = res.headers.get("set-cookie") || "";
      assert.match(setCookie, /tns_session=/);
      assert.match(setCookie, /Max-Age=0|Expires=/i);
      assert.match(setCookie, /Secure/i, "Cookie clearing on HTTPS must contain Secure flag");
    });
  });

  describe("Issue 2: Session Invalidation & Rejection", () => {
    it("4. rejects signed-out session in getActorFromRequestAsync (fails closed)", async () => {
      const token = await createSessionToken(FAKE_USERS["u-admin"], "sid-signed-out-1");
      ctx.overrides.getSession = async () => ({ id: "sid-signed-out-1", status: "SIGNED_OUT" });

      const req = new Request("http://localhost:3000/api/dashboard/summary", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });

      const actor = await getActor(req);
      assert.equal(actor.isAuthenticated, false);
      assert.equal(actor.user, null);
      assert.equal(actor.hasPermission("dashboard:view"), false);
    });

    it("5. rejects session when session record is missing from database", async () => {
      const token = await createSessionToken(FAKE_USERS["u-admin"], "sid-deleted-999");
      ctx.overrides.getSession = async () => null;

      const req = new Request("http://localhost:3000/api/dashboard/summary", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });

      const actor = await getActor(req);
      assert.equal(actor.isAuthenticated, false);
      assert.equal(actor.user, null);
    });

    it("6. rejects rejected session with isSessionRejected = true", async () => {
      const token = await createSessionToken(FAKE_USERS["u-admin"], "sid-rejected-1");
      ctx.overrides.getSession = async () => ({ id: "sid-rejected-1", status: "REJECTED" });

      const req = new Request("http://localhost:3000/api/dashboard/summary", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });

      const actor = await getActor(req);
      assert.equal(actor.isAuthenticated, false);
      assert.equal(actor.isSessionRejected, true);
    });

    it("7. allows active session and touches last_activity_at", async () => {
      let touched = false;
      const token = await createSessionToken(FAKE_USERS["u-admin"], "sid-active-1");
      ctx.overrides.getSession = async () => ({ id: "sid-active-1", status: "ACTIVE" });
      ctx.overrides.touchSession = async () => { touched = true; };

      const req = new Request("http://localhost:3000/api/dashboard/summary", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });

      const actor = await getActor(req);
      assert.equal(actor.isAuthenticated, true);
      assert.equal(actor.user.id, "u-admin");
      assert.equal(touched, true);
    });
  });

  describe("Issue 3: Next.js Proxy & Redirect Behavior", () => {
    it("8. direct request to protected /dashboard without session cookie redirects to /login", async () => {
      const req = new NextRequest("http://localhost:3000/dashboard");
      const res = await proxyHandler(req);
      assert.equal(res.status, 307);
      const location = res.headers.get("location") || "";
      assert.match(location, /\/login/);
    });

    it("9. request to /login?logged_out=1 renders login page and does NOT redirect to dashboard", async () => {
      // Even if a client mistakenly sends an old cookie with the logout redirect
      const token = await createSessionToken(FAKE_USERS["u-admin"], "sid-admin-1");
      const req = new NextRequest("http://localhost:3000/login?logged_out=1", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });

      const res = await proxyHandler(req);
      // Must not redirect to /dashboard
      assert.notEqual(res.headers.get("location"), "http://localhost:3000/dashboard");
      assert.equal(res.status, 200);
      assert.match(res.headers.get("set-cookie") || "", /tns_session=/);
    });

    it("10. protected pages have Cache-Control: no-store to prevent browser Back button data exposure", async () => {
      const cookie = await cookieFor("u-admin");
      const req = new NextRequest("http://localhost:3000/dashboard", {
        headers: { cookie },
      });

      const res = await proxyHandler(req);
      assert.equal(res.status, 200);
      const cacheControl = res.headers.get("cache-control") || "";
      assert.match(cacheControl, /no-store/i);
      assert.match(cacheControl, /no-cache/i);
      assert.match(cacheControl, /must-revalidate/i);
    });

    it("11. public paths (/login, /api/auth/login) are accessible without session", async () => {
      const req = new NextRequest("http://localhost:3000/login");
      const res = await proxyHandler(req);
      assert.equal(res.status, 200);
    });
  });
});
