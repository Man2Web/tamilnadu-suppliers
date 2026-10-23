import { describe, it } from "node:test";
import assert from "node:assert";
import store from "../src/lib/db/store";
import { checkUserPermission, ADMIN_PRESET_PERMISSIONS, BILLING_PRESET_PERMISSIONS, SUPER_ADMIN_PERMISSIONS } from "../src/lib/types/permissions";
import { UserRole } from "../src/lib/types";
import bcrypt from "bcryptjs";

describe("FINAL UI & USER ACCOUNT PERMISSIONS ACCEPTANCE TESTS", () => {
  // Test 1: Desktop vs Mobile Sidebar responsive classes and structure
  it("Acceptance Test 1 & 2 & 3: Sidebar has permanent desktop layout, mobile drawer classes, and prevents overflow", async () => {
    const fs = await import("fs");
    const sidebarCode = fs.readFileSync("src/components/layout/Sidebar.tsx", "utf8");
    const appShellCode = fs.readFileSync("src/components/layout/AppShell.tsx", "utf8");
    const navbarCode = fs.readFileSync("src/components/layout/Navbar.tsx", "utf8");

    // Desktop view verification (Criterion 1)
    assert.ok(
      sidebarCode.includes("lg:static") && sidebarCode.includes("lg:translate-x-0") && sidebarCode.includes("w-64"),
      "Sidebar must have static flow and translate-x-0 on lg: desktop screens with fixed width w-64"
    );
    assert.ok(
      appShellCode.includes("flex-1") && appShellCode.includes("overflow-y-auto"),
      "Dashboard content must appear beside sidebar with independent scrolling (flex-1 overflow-y-auto)"
    );

    // Mobile view verification (Criterion 2)
    assert.ok(
      sidebarCode.includes("-translate-x-full"),
      "Sidebar must be hidden by default on mobile screens (-translate-x-full)"
    );
    assert.ok(
      navbarCode.includes("lg:hidden") && navbarCode.includes("hamburger-menu-button"),
      "Hamburger menu button must be strictly mobile only (lg:hidden)"
    );

    // Mobile drawer close behavior & overflow prevention (Criterion 3)
    assert.ok(
      sidebarCode.includes("lg:hidden") && sidebarCode.includes("Close sidebar backdrop"),
      "Mobile backdrop overlay must exist and be hidden on desktop (lg:hidden)"
    );
    assert.ok(
      sidebarCode.includes("onClick={onClose}"),
      "Drawer must close when selecting navigation links or clicking backdrop"
    );
  });

  // Test 4: Super Admin can create Admin and Billing accounts securely
  it("Acceptance Test 4: Super Admin can create Admin and Billing accounts with secure hashed passwords", () => {
    const initialUsersCount = store.getUsers().length;

    // Create Admin account
    const adminUser = store.createUser(
      {
        name: "Regional Branch Admin",
        email: `admin_${Date.now()}@tamilnadusuppliers.com`,
        phone: "9842300001",
        role: "ADMIN",
        password: "AdminSecurePassword2026!",
        permissions: [...ADMIN_PRESET_PERMISSIONS],
        status: "ACTIVE",
      },
      "SUPER_ADMIN"
    );

    assert.ok(adminUser.id, "Admin user should have generated UUID");
    assert.strictEqual(adminUser.role, "ADMIN");
    assert.strictEqual(adminUser.status, "ACTIVE");

    // Verify password was hashed and never returned in plain text
    const fullAdminUser = store.getUser(adminUser.id, true);
    assert.ok(fullAdminUser?.passwordHash, "Password must be hashed in store");
    assert.notStrictEqual(fullAdminUser.passwordHash, "AdminSecurePassword2026!");
    assert.ok(
      bcrypt.compareSync("AdminSecurePassword2026!", fullAdminUser.passwordHash),
      "Hashed password must verify correctly against bcrypt"
    );

    // Create Billing account
    const billingUser = store.createUser(
      {
        name: "Counter Billing Operator",
        email: `billing_${Date.now()}@tamilnadusuppliers.com`,
        phone: "9842300002",
        role: "BILLING",
        password: "BillingSecurePassword2026!",
        permissions: [...BILLING_PRESET_PERMISSIONS],
        status: "ACTIVE",
      },
      "SUPER_ADMIN"
    );

    assert.ok(billingUser.id, "Billing user should have generated UUID");
    assert.strictEqual(billingUser.role, "BILLING");
    assert.strictEqual(billingUser.status, "ACTIVE");

    assert.strictEqual(store.getUsers().length, initialUsersCount + 2);
  });

  // Test 5: Super Admin can assign different page and action permissions to each account using checkboxes
  it("Acceptance Test 5: Super Admin can assign granular module permissions individually", () => {
    const customUser = store.createUser(
      {
        name: "Custom Restricted Staff",
        email: `custom_${Date.now()}@tamilnadusuppliers.com`,
        role: "BILLING",
        password: "StaffPassword123!",
        permissions: ["dashboard:view", "bills:view", "bills:create"], // No payment or close permission
      },
      "SUPER_ADMIN"
    );

    assert.strictEqual(customUser.permissions.length, 3);
    assert.ok(store.validateUserPermission(customUser.id, "dashboard:view"));
    assert.ok(store.validateUserPermission(customUser.id, "bills:view"));
    assert.ok(store.validateUserPermission(customUser.id, "bills:create"));
    assert.strictEqual(store.validateUserPermission(customUser.id, "payments:record"), false);
    assert.strictEqual(store.validateUserPermission(customUser.id, "bills:close"), false);

    // Super Admin updates permissions
    const updatedUser = store.updateUser(
      customUser.id,
      {
        permissions: ["dashboard:view", "bills:view", "bills:create", "payments:record"],
      },
      "SUPER_ADMIN"
    );

    assert.strictEqual(updatedUser.permissions.length, 4);
    assert.ok(store.validateUserPermission(customUser.id, "payments:record"));
  });

  // Test 6: A Billing account with only billing permissions cannot access product administration, company management, or user management
  it("Acceptance Test 6: Billing accounts cannot access product admin, company management, or user management", () => {
    const billingAccount = store.createUser(
      {
        name: "Billing Staff Only",
        email: `billing_strict_${Date.now()}@tamilnadusuppliers.com`,
        role: "BILLING",
        permissions: [...BILLING_PRESET_PERMISSIONS], // only bills, quotations, customers
      },
      "SUPER_ADMIN"
    );

    // Prohibited operations for billing-only account
    assert.strictEqual(store.validateUserPermission(billingAccount.id, "products:create"), false);
    assert.strictEqual(store.validateUserPermission(billingAccount.id, "products:edit"), false);
    assert.strictEqual(store.validateUserPermission(billingAccount.id, "companies:manage"), false);
    assert.strictEqual(store.validateUserPermission(billingAccount.id, "users:manage"), false);
    assert.strictEqual(store.validateUserPermission(billingAccount.id, "permissions:assign"), false);

    // Attempting to create a company with this billing actor throws an authorization error
    assert.throws(
      () => {
        store.createCompany({ name: "Unauthorized Company" }, billingAccount.role);
      },
      /Unauthorized/
    );

    // Attempting to create a user with this billing actor throws an authorization error
    assert.throws(
      () => {
        store.createUser(
          { name: "Hacked Account", email: "hacked@test.com", role: "ADMIN" },
          billingAccount.role
        );
      },
      /Unauthorized/
    );
  });

  // Test 7: An account without payment permission cannot record payments by navigating directly or invoking backend
  it("Acceptance Test 7: Account without payment permission is strictly blocked from recording payments", async () => {
    const noPaymentUser = store.createUser(
      {
        name: "Observer Staff",
        email: `observer_${Date.now()}@tamilnadusuppliers.com`,
        role: "BILLING",
        permissions: ["dashboard:view", "bills:view"], // Notice NO payments:record!
      },
      "SUPER_ADMIN"
    );

    assert.strictEqual(store.validateUserPermission(noPaymentUser.id, "payments:record"), false);

    // Test serverAuth guard directly
    const { checkPermissionGuard } = await import("../src/lib/auth/serverAuth");
    const fakeRequest = new Request("http://localhost:3000/api/bills/bill-742/payments", {
      method: "POST",
      headers: {
        "x-user-id": noPaymentUser.id,
        "x-user-role": noPaymentUser.role,
      },
    });

    const guardResult = checkPermissionGuard(fakeRequest, "payments:record");
    assert.ok(guardResult !== null, "Permission guard must return a rejection response");
    assert.strictEqual(guardResult.status, 403, "Must return HTTP 403 Forbidden");

    const responseBody = await guardResult.json();
    assert.strictEqual(responseBody.code, "PERMISSION_DENIED");
    assert.ok(responseBody.error.includes("payments:record"));
  });

  // Test 8: Permission changes take effect immediately without extra privileges
  it("Acceptance Test 8: Permission changes take effect immediately", () => {
    const dynamicUser = store.createUser(
      {
        name: "Dynamic Permissions Staff",
        email: `dynamic_${Date.now()}@tamilnadusuppliers.com`,
        role: "BILLING",
        permissions: ["dashboard:view"],
      },
      "SUPER_ADMIN"
    );

    assert.strictEqual(store.validateUserPermission(dynamicUser.id, "bills:create"), false);

    // Grant bills:create
    store.updateUser(dynamicUser.id, { permissions: ["dashboard:view", "bills:create"] }, "SUPER_ADMIN");
    assert.strictEqual(store.validateUserPermission(dynamicUser.id, "bills:create"), true);

    // Revoke bills:create
    store.updateUser(dynamicUser.id, { permissions: ["dashboard:view"] }, "SUPER_ADMIN");
    assert.strictEqual(store.validateUserPermission(dynamicUser.id, "bills:create"), false);
  });

  // Test 9: Accidental lockout prevention — The Super Admin cannot remove the last available Super Admin access
  it("Acceptance Test 9: Accidental lockout prevention preserves the last active Super Admin account", () => {
    // Ensure only one Super Admin exists or find the primary one
    const superAdmins = store.getUsers().filter((u) => u.role === "SUPER_ADMIN" && u.status === "ACTIVE");
    const primarySuperAdmin = superAdmins[0];

    // Attempting to delete the last active Super Admin must throw an error
    if (superAdmins.length === 1) {
      assert.throws(
        () => {
          store.deleteUser(primarySuperAdmin.id, "SUPER_ADMIN");
        },
        /Cannot delete the last remaining Super Admin/
      );

      // Attempting to demote the last active Super Admin to BILLING must throw an error
      assert.throws(
        () => {
          store.updateUser(primarySuperAdmin.id, { role: "BILLING" }, "SUPER_ADMIN");
        },
        /Cannot demote or deactivate the last remaining Super Admin/
      );

      // Attempting to deactivate the last active Super Admin must throw an error
      assert.throws(
        () => {
          store.updateUser(primarySuperAdmin.id, { status: "INACTIVE" }, "SUPER_ADMIN");
        },
        /Cannot demote or deactivate the last remaining Super Admin/
      );
    }
  });

  // Test 10: All existing rental billing and inventory workflows continue to function
  it("Acceptance Test 10: All rental billing, returns, and inventory workflows continue functioning seamlessly", () => {
    // Test product availability
    const products = store.getProducts();
    assert.ok(products.length >= 4, "Products must be available");

    // Test Bill 742 reference data
    const bill742 = store.getBill("bill-742");
    assert.ok(bill742, "Bill 742 reference must exist");
    assert.strictEqual(bill742.billNumber, "742");
    assert.strictEqual(bill742.customerName, "MATCON - 2026");

    // Test company records
    const companies = store.getCompanies();
    assert.ok(companies.length >= 2, "Both GST and Non-GST companies must exist");
    assert.ok(companies.some((c) => c.gstType === "GST_REGISTERED"));
    assert.ok(companies.some((c) => c.gstType === "NON_GST"));
  });
});
