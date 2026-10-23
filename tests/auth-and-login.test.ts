import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import store from "../src/lib/db/store";
import { createSessionToken, verifySessionToken, SESSION_COOKIE_NAME } from "../src/lib/auth/session";
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from "../src/lib/auth/rateLimit";
import { checkUserPermission, ADMIN_PRESET_PERMISSIONS, BILLING_PRESET_PERMISSIONS, SUPER_ADMIN_PERMISSIONS } from "../src/lib/types/permissions";
import bcrypt from "bcryptjs";

describe("LOGIN & SECURE ACCOUNT SETUP ACCEPTANCE TESTS", () => {
  const superAdminEmail = "admin@tamilnadusuppliers.com";
  const tempPassword = "AdminTempPass2026!";
  const permanentPassword = "PermanentPass2026!#";

  const resetSuperAdminToTemp = () => {
    const users = (store as any).state.users;
    const idx = users.findIndex((u: any) => u.email.toLowerCase() === superAdminEmail.toLowerCase());
    if (idx !== -1) {
      users[idx].passwordHash = bcrypt.hashSync(tempPassword, 10);
      users[idx].mustChangePassword = true;
      store.saveState((store as any).state);
    }
  };

  before(() => {
    resetSuperAdminToTemp();
  });

  after(() => {
    resetSuperAdminToTemp();
  });

  // 1. Initial Super Admin Setup Verification
  it("Requirement 3 & 9: Initial Super Admin exists, is initialized, and duplicate setup is blocked", () => {
    assert.strictEqual(store.isSuperAdminInitialized(), true, "Super Admin should be initialized");
    const superAdmin = store.getSuperAdmin(true);
    assert.ok(superAdmin, "Super Admin account must exist");
    assert.strictEqual(superAdmin?.email, superAdminEmail);
    assert.strictEqual(superAdmin?.role, "SUPER_ADMIN");
    assert.ok(superAdmin?.passwordHash, "Password must be hashed with bcrypt");
    assert.ok(bcrypt.compareSync(tempPassword, superAdmin!.passwordHash!), "Bcrypt hash must match temporary password");

    // Attempt duplicate setup: Must throw error
    assert.throws(
      () => {
        store.setupInitialSuperAdmin({
          username: "second_admin@tamilnadusuppliers.com",
          password: "AnotherPassword123!",
        });
      },
      /Super Admin account already exists/i,
      "Duplicate Super Admin setup must throw an error"
    );
  });

  // 2. Exactly Three Account Roles & Accidental Duplicate Super Admin Prevention
  it("Requirement 2: Normal account management forbids creating a second Super Admin", () => {
    // Attempt to create a second SUPER_ADMIN: Must fail
    assert.throws(
      () => {
        store.createUser(
          {
            name: "Hacker Admin",
            email: "hacker@tamilnadusuppliers.com",
            role: "SUPER_ADMIN" as any,
            password: "password123",
          },
          "SUPER_ADMIN"
        );
      },
      /Only one Super Admin account may exist/i,
      "createUser must reject SUPER_ADMIN role"
    );

    // Non-Super Admin cannot create any account
    assert.throws(
      () => {
        store.createUser(
          {
            name: "Sub Operator",
            email: "sub@tamilnadusuppliers.com",
            role: "BILLING",
            password: "password123",
          },
          "ADMIN"
        );
      },
      /Unauthorized: Only Super Admin can create user accounts/i
    );
  });

  // 3. Super Admin can create Admin and Billing accounts and assign permissions
  it("Requirement 2 & 8: Super Admin can create Admin and Billing accounts with permissions", () => {
    const adminUser = store.createUser(
      {
        name: "Test Branch Admin",
        email: `test_admin_${Date.now()}@tamilnadusuppliers.com`,
        role: "ADMIN",
        password: "AdminPassword123!",
        permissions: [...ADMIN_PRESET_PERMISSIONS],
      },
      "SUPER_ADMIN"
    );

    assert.ok(adminUser.id, "Admin user should have an ID");
    assert.strictEqual(adminUser.role, "ADMIN");
    assert.strictEqual(adminUser.permissions.includes("products:create"), true);
    assert.strictEqual(adminUser.permissions.includes("companies:manage"), false, "Admin must not have companies:manage");

    const billingUser = store.createUser(
      {
        name: "Test Billing Clerk",
        email: `test_billing_${Date.now()}@tamilnadusuppliers.com`,
        role: "BILLING",
        password: "BillingPassword123!",
        permissions: [...BILLING_PRESET_PERMISSIONS],
      },
      "SUPER_ADMIN"
    );

    assert.ok(billingUser.id, "Billing user should have an ID");
    assert.strictEqual(billingUser.role, "BILLING");
    assert.strictEqual(billingUser.permissions.includes("bills:create"), true);
    assert.strictEqual(billingUser.permissions.includes("products:create"), false, "Billing must not have products:create");
  });

  // 4. Credential Verification & Generic Error Message on Invalid Credentials
  it("Requirement 4: Correct credentials allow login and incorrect credentials are rejected", () => {
    // Valid credentials
    const validUser = store.verifyCredentials(superAdminEmail, tempPassword);
    assert.ok(validUser, "Valid credentials should return user");
    assert.strictEqual(validUser?.email, superAdminEmail);

    // Invalid password
    const wrongPass = store.verifyCredentials(superAdminEmail, "WrongPassword123!");
    assert.strictEqual(wrongPass, null, "Incorrect password must return null");

    // Non-existent username
    const nonExistent = store.verifyCredentials("nonexistent@tamilnadusuppliers.com", "anyPass");
    assert.strictEqual(nonExistent, null, "Non-existent username must return null");
  });

  // 5. Brute Force Rate Limiting
  it("Requirement 6: Rate limiter blocks consecutive failed attempts", () => {
    const testIp = "192.168.1.100";
    const testUser = "brute_target@tamilnadusuppliers.com";

    clearRateLimit(testIp, testUser);

    for (let i = 0; i < 5; i++) {
      recordFailedAttempt(testIp, testUser);
    }

    const check = checkRateLimit(testIp, testUser);
    assert.strictEqual(check.isBlocked, true, "After 5 failed attempts, rate limiter must block");
    assert.ok((check.retryAfterMinutes || 0) > 0, "Retry-After minutes must be > 0");

    clearRateLimit(testIp, testUser);
    const postClear = checkRateLimit(testIp, testUser);
    assert.strictEqual(postClear.isBlocked, false, "Clearing rate limit must unblock");
  });

  // 6. JWT Session Creation, Signing & Verification
  it("Requirement 1 & 6: Cryptographic JWT session tokens are created and verified securely", async () => {
    const superAdmin = store.getSuperAdmin()!;
    const userWithFlag = { ...superAdmin, mustChangePassword: true };
    const token = await createSessionToken(userWithFlag);
    assert.ok(token && typeof token === "string", "Token must be a non-empty string");

    const payload = await verifySessionToken(token);
    assert.ok(payload, "Payload must be valid");
    assert.strictEqual(payload?.sub, superAdmin.id);
    assert.strictEqual(payload?.email, superAdmin.email);
    assert.strictEqual(payload?.role, "SUPER_ADMIN");
    assert.strictEqual(payload?.mustChangePassword, true);

    // Tampered token must fail
    const tampered = token.slice(0, -5) + "abcde";
    const invalidPayload = await verifySessionToken(tampered);
    assert.strictEqual(invalidPayload, null, "Tampered token must return null");
  });

  // 7. Mandatory First-Login Password Change
  it("Requirement 3: First-login password change updates password and clears mustChangePassword", () => {
    const testUser = store.createUser(
      {
        name: "Password Change Tester",
        email: `pwd_tester_${Date.now()}@tamilnadusuppliers.com`,
        role: "ADMIN",
        password: "InitialTempPassword123!",
      },
      "SUPER_ADMIN"
    );

    // Set mustChangePassword: true on test account
    const rawUser = store.getUser(testUser.id, true)!;
    rawUser.mustChangePassword = true;

    // Wrong current password
    assert.throws(() => {
      store.changePassword(testUser.id, "IncorrectTempPass", permanentPassword);
    }, /Current password is incorrect/i);

    // Valid change
    const result = store.changePassword(testUser.id, "InitialTempPassword123!", permanentPassword);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.user.mustChangePassword, false);

    // Verify login with new permanent password
    const verifyPermanent = store.verifyCredentials(testUser.email, permanentPassword);
    assert.ok(verifyPermanent, "Login must succeed with permanent password");
    assert.strictEqual(verifyPermanent?.mustChangePassword, false);

    // Old temporary password no longer works
    const verifyOld = store.verifyCredentials(testUser.email, "InitialTempPassword123!");
    assert.strictEqual(verifyOld, null, "Old temporary password must no longer work");
  });

  // 8. Server-Side Protection and Role Access Enforcement
  it("Requirement 5 & 7: Admin and Billing cannot access Super Admin features", () => {
    const adminUser = store.getUsers().find((u) => u.role === "ADMIN");
    const billingUser = store.getUsers().find((u) => u.role === "BILLING");

    assert.ok(adminUser, "Admin user exists");
    assert.ok(billingUser, "Billing user exists");

    // Companies management is Super Admin only
    assert.strictEqual(checkUserPermission(adminUser!, "companies:manage"), false);
    assert.strictEqual(checkUserPermission(billingUser!, "companies:manage"), false);

    // User management is Super Admin only
    assert.strictEqual(checkUserPermission(adminUser!, "users:manage"), false);
    assert.strictEqual(checkUserPermission(billingUser!, "users:manage"), false);
  });
});
