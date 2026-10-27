// ============================================================================
// TAMILNADU SUPPLIERS - INITIAL SUPER ADMIN SETUP SCRIPT
// Secure server-side one-time setup process
// ============================================================================

import fs from "fs";
import path from "path";

// Load .env file manually if needed
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim().replace(/^['"](.*)['"]$/, "$1");
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

loadEnv();

import store from "../src/lib/db/store";

async function main() {
  console.log("===============================================================");
  console.log("  TAMILNADU SUPPLIERS - INITIAL SUPER ADMIN PROVISIONING");
  console.log("===============================================================\n");

  const username = process.env.INITIAL_SUPER_ADMIN_USERNAME;
  const password = process.env.INITIAL_SUPER_ADMIN_PASSWORD;
  const name = process.env.INITIAL_SUPER_ADMIN_NAME || "Super Administrator";
  const phone = process.env.INITIAL_SUPER_ADMIN_PHONE || "9842345678";

  if (!username || !password) {
    console.error("❌ ERROR: Setup configuration missing!");
    console.error("Please configure the following environment variables in .env:");
    console.error("  INITIAL_SUPER_ADMIN_USERNAME=<your-super-admin-email>");
    console.error("  INITIAL_SUPER_ADMIN_PASSWORD=<your-secure-temporary-password>\n");
    process.exit(1);
  }

  // Check if Super Admin is already initialized
  if (await store.isSuperAdminInitialized()) {
    console.log("⚠️  NOTICE: A Super Admin account is ALREADY INITIALIZED.");
    console.log("Only one active Super Admin account is permitted.");
    console.log("Duplicate initialization has been blocked to protect the system.\n");
    const superAdmin = await store.getSuperAdmin();
    console.log(`Current Super Admin Login ID: ${superAdmin?.email}`);
    process.exit(0);
  }

  try {
    const admin = await store.setupInitialSuperAdmin({
      username,
      password,
      name,
      phone,
    });

    console.log("✅ Super Admin Account Successfully Created!");
    console.log("---------------------------------------------------------------");
    console.log(`Account ID        : ${admin.id}`);
    console.log(`Login Identifier  : ${admin.email}`);
    console.log(`Full Name         : ${admin.name}`);
    console.log(`Role              : ${admin.role} (Strict Single Super Admin)`);
    console.log(`First-Login Action: Password change is REQUIRED on first login`);
    console.log("---------------------------------------------------------------");
    console.log("\n🔒 SECURITY NOTICE:");
    console.log("The temporary password has been hashed with bcrypt.");
    console.log("Credentials are not stored in plaintext.");
    console.log("Please log in at http://localhost:3000 to set a permanent password.\n");
  } catch (error: any) {
    console.error("❌ Failed to setup Super Admin:", error.message || error);
    process.exit(1);
  }
}

main().then(() => process.exit(0));
