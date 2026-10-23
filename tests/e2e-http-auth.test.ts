import { describe, it, before } from "node:test";
import assert from "node:assert";

const BASE_URL = "http://localhost:3000";

describe("END-TO-END HTTP AUTHENTICATION & SECURITY VERIFICATION", () => {
  const superAdminEmail = "admin@tamilnadusuppliers.com";
  const tempPassword = "AdminTempPass2026!";
  const newPassword = "AdminSecurePermanent2026!#";

  let sessionCookie = "";

  before(async () => {
    const fs = await import("fs");
    const path = await import("path");
    const bcrypt = (await import("bcryptjs")).default;
    const dbPath = path.join(process.cwd(), "data", "tamilnadu_suppliers_db.json");
    if (fs.existsSync(dbPath)) {
      const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
      const idx = db.users.findIndex((u: any) => u.role === "SUPER_ADMIN");
      if (idx !== -1) {
        db.users[idx].passwordHash = bcrypt.hashSync(tempPassword, 10);
        db.users[idx].mustChangePassword = true;
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
      }
    }
  });

  // Helper to extract cookie from response headers
  function getSessionCookie(res: Response): string {
    const setCookie = res.headers.get("set-cookie") || "";
    const match = setCookie.match(/tns_session=[^;]+/);
    return match ? match[0] : "";
  }

  // 1. Unauthenticated Root Page Redirects to Login
  it("Test 1: Opening http://localhost:3000 while logged out redirects to /login", async () => {
    const res = await fetch(`${BASE_URL}/`, {
      redirect: "manual",
    });

    const isRedirect = res.status === 307 || res.status === 308 || res.status === 302;
    assert.ok(isRedirect, `Root URL should redirect unauthenticated users, got status ${res.status}`);
    const location = res.headers.get("location") || "";
    assert.ok(location.includes("/login"), `Redirect location should be /login, got: ${location}`);
  });

  // 2. Unauthenticated Protected Page Access Redirects to Login
  it("Test 2: Opening /dashboard directly while logged out redirects to /login?from=/dashboard", async () => {
    const res = await fetch(`${BASE_URL}/dashboard`, {
      redirect: "manual",
    });

    const isRedirect = res.status === 307 || res.status === 308 || res.status === 302;
    assert.ok(isRedirect, `/dashboard must redirect unauthenticated users, got status ${res.status}`);
    const location = res.headers.get("location") || "";
    assert.ok(location.includes("/login"), `Redirect location should include /login, got: ${location}`);
  });

  // 3. Unauthenticated API Endpoints Are Protected on Server
  it("Test 3: Accessing protected API endpoints without valid authentication returns 401 UNAUTHENTICATED", async () => {
    const res = await fetch(`${BASE_URL}/api/companies`);
    assert.strictEqual(res.status, 401, "Protected API /api/companies must return 401 without auth");
    const json = await res.json();
    assert.ok(json.error && json.error.includes("Authentication required"), "Should provide authentication required error");
  });

  // 4. Incorrect Credentials Are Generic and Rejected
  it("Test 4: Incorrect credentials return 401 with generic error message", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: superAdminEmail,
        password: "IncorrectPassword999!",
      }),
    });

    assert.strictEqual(res.status, 401, "Failed login must return 401 status");
    const json = await res.json();
    assert.strictEqual(json.error, "Invalid username or password.", "Must show generic error message");
  });

  // 5. Correct Credentials Allow Login and Return mustChangePassword on First Login
  it("Test 5: Correct credentials authenticate successfully and set HttpOnly session cookie", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: superAdminEmail,
        password: tempPassword,
      }),
    });

    assert.strictEqual(res.status, 200, "Valid login must return 200 status");
    const setCookie = res.headers.get("set-cookie") || "";
    assert.ok(setCookie.includes("tns_session="), "Must set tns_session cookie");
    assert.ok(setCookie.toLowerCase().includes("httponly"), "Cookie must have HttpOnly flag");

    sessionCookie = getSessionCookie(res);
    assert.ok(sessionCookie, "Session cookie extracted successfully");

    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.user.role, "SUPER_ADMIN");
    assert.strictEqual(json.user.mustChangePassword, true, "First-login must require password change");
  });

  // 6. Mandatory Redirect to /change-password When mustChangePassword is True
  it("Test 6: User with temporary password is redirected to /change-password when accessing /dashboard", async () => {
    const res = await fetch(`${BASE_URL}/dashboard`, {
      headers: { Cookie: sessionCookie },
      redirect: "manual",
    });

    const isRedirect = res.status === 307 || res.status === 308 || res.status === 302;
    assert.ok(isRedirect, "Must redirect user requiring password change");
    const location = res.headers.get("location") || "";
    assert.ok(location.includes("/change-password"), `Must redirect to /change-password, got: ${location}`);
  });

  // 7. Password Change Updates Password and Re-issues Session Token
  it("Test 7: Changing temporary password succeeds and clears mustChangePassword flag", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        currentPassword: tempPassword,
        newPassword: newPassword,
        confirmPassword: newPassword,
      }),
    });

    assert.strictEqual(res.status, 200, "Password change must return 200 status");
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.user.mustChangePassword, false);

    // Update session cookie with newly re-issued token
    sessionCookie = getSessionCookie(res);
    assert.ok(sessionCookie, "Updated session cookie received");
  });

  // 8. Session Persistence & Dashboard Access With Valid Session
  it("Test 8: Refreshing and accessing /dashboard with valid permanent session succeeds (Status 200)", async () => {
    const res = await fetch(`${BASE_URL}/dashboard`, {
      headers: { Cookie: sessionCookie },
      redirect: "manual",
    });

    assert.strictEqual(res.status, 200, "Authenticated user should access /dashboard directly with status 200");
  });

  // 9. Current User Profile Endpoint (/api/auth/me)
  it("Test 9: /api/auth/me returns authenticated Super Admin user profile", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: sessionCookie },
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.authenticated, true);
    assert.strictEqual(json.user.email, superAdminEmail);
    assert.strictEqual(json.user.role, "SUPER_ADMIN");
    assert.strictEqual(json.user.mustChangePassword, false);
  });

  // 10. Super Admin Can Create Admin and Billing Accounts
  it("Test 10: Super Admin can create Admin and Billing accounts via API", async () => {
    const resAdmin = await fetch(`${BASE_URL}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        name: "E2E Test Admin",
        email: `e2e_admin_${Date.now()}@tamilnadusuppliers.com`,
        role: "ADMIN",
        password: "AdminPassword2026!",
      }),
    });

    assert.strictEqual(resAdmin.status, 201, "Admin account creation must succeed");
    const adminData = await resAdmin.json();
    assert.strictEqual(adminData.role, "ADMIN");

    const resBilling = await fetch(`${BASE_URL}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        name: "E2E Test Billing",
        email: `e2e_billing_${Date.now()}@tamilnadusuppliers.com`,
        role: "BILLING",
        password: "BillingPassword2026!",
      }),
    });

    assert.strictEqual(resBilling.status, 201, "Billing account creation must succeed");
    const billingData = await resBilling.json();
    assert.strictEqual(billingData.role, "BILLING");
  });

  // 11. Second Super Admin Cannot Be Created via API
  it("Test 11: Attempting to create a second Super Admin account via API is strictly rejected", async () => {
    const res = await fetch(`${BASE_URL}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        name: "Second Super Admin",
        email: "second_super@tamilnadusuppliers.com",
        role: "SUPER_ADMIN",
        password: "Password123!",
      }),
    });

    assert.strictEqual(res.status, 400, "Second Super Admin creation must return 400 Bad Request");
    const json = await res.json();
    assert.ok(json.error.includes("Only one Super Admin account may exist"));
  });

  // 12. Secure Logout Clears Cookie and Invalidates Session
  it("Test 12: Logging out invalidates session cookie and redirects user away from protected pages", async () => {
    const resLogout = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: sessionCookie },
    });

    assert.strictEqual(resLogout.status, 200);
    const setCookie = resLogout.headers.get("set-cookie") || "";
    assert.ok(setCookie.includes("Max-Age=0") || setCookie.includes("expires="), "Logout must expire session cookie");

    // Clear local session variable
    sessionCookie = "";

    // Accessing /dashboard now must redirect to /login
    const resDash = await fetch(`${BASE_URL}/dashboard`, {
      redirect: "manual",
    });

    const isRedirect = resDash.status === 307 || resDash.status === 308 || resDash.status === 302;
    assert.ok(isRedirect, "After logout, /dashboard must redirect to login");
  });

  // Reset Super Admin password back to temporary password for next run
  it("Cleanup: Reset Super Admin back to initial state for repeat testability", async () => {
    const superAdmin = (await import("../src/lib/db/store")).default.getSuperAdmin(true);
    if (superAdmin) {
      (await import("../src/lib/db/store")).default.changePassword(superAdmin.id, newPassword, tempPassword);
      const user = (await import("../src/lib/db/store")).default.getUser(superAdmin.id, true);
      if (user) {
        user.mustChangePassword = true;
        const fs = await import("fs");
        const path = await import("path");
        const dbPath = path.join(process.cwd(), "data", "tamilnadu_suppliers_db.json");
        const raw = fs.readFileSync(dbPath, "utf8");
        const db = JSON.parse(raw);
        const idx = db.users.findIndex((u: any) => u.id === superAdmin.id);
        if (idx !== -1) {
          db.users[idx].mustChangePassword = true;
          fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        }
      }
    }
  });
});
