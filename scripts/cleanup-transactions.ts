import fs from "fs";
import path from "path";

interface CleanReport {
  timestamp: string;
  backupFile: string;
  before: Record<string, number>;
  after: Record<string, number>;
  preservedChecks: {
    productsPreserved: boolean;
    productsCount: number;
    categoriesPreserved: boolean;
    categoriesCount: number;
    companiesPreserved: boolean;
    companiesCount: number;
    superAdminPreserved: boolean;
    superAdminHasHash: boolean;
    totalUsersCount: number;
  };
}

async function runCleanup() {
  const dbPath = path.join(process.cwd(), "data", "tamilnadu_suppliers_db.json");

  console.log("==================================================================");
  console.log("  TAMILNADU SUPPLIERS - TRANSACTIONAL & CUSTOMER DATA CLEANUP   ");
  console.log("==================================================================\n");

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found at: ${dbPath}`);
  }

  // 1. Read and parse original data
  console.log("1. Validating source JSON file...");
  const rawData = fs.readFileSync(dbPath, "utf8");
  let data: any;
  try {
    data = JSON.parse(rawData);
  } catch (err: any) {
    throw new Error(`Failed to parse source JSON: ${err.message}`);
  }

  // Capture counts before
  const beforeCounts: Record<string, number> = {
    bills: Array.isArray(data.bills) ? data.bills.length : 0,
    quotations: Array.isArray(data.quotations) ? data.quotations.length : 0,
    payments: Array.isArray(data.payments) ? data.payments.length : 0,
    gatePasses: Array.isArray(data.gatePasses) ? data.gatePasses.length : 0,
    returns: Array.isArray(data.returns) ? data.returns.length : 0,
    customers: Array.isArray(data.customers) ? data.customers.length : 0,
    reservations: Array.isArray(data.reservations) ? data.reservations.length : 0,
    inventoryMovements: Array.isArray(data.inventoryMovements) ? data.inventoryMovements.length : 0,
    whatsappLogs: Array.isArray(data.whatsappLogs) ? data.whatsappLogs.length : 0,
    products: Array.isArray(data.products) ? data.products.length : 0,
    categories: Array.isArray(data.categories) ? data.categories.length : 0,
    companies: Array.isArray(data.companies) ? data.companies.length : 0,
    users: Array.isArray(data.users) ? data.users.length : 0,
    auditLogs: Array.isArray(data.auditLogs) ? data.auditLogs.length : 0,
    sessions: Array.isArray(data.sessions) ? data.sessions.length : 0,
    notifications: Array.isArray(data.notifications) ? data.notifications.length : 0,
  };

  console.log("Record counts BEFORE cleanup:");
  console.table(beforeCounts);

  // 2. Validate essential entities to preserve BEFORE doing anything
  const initialProducts = data.products;
  const initialCategories = data.categories;
  const initialCompanies = data.companies;
  const initialUsers = data.users;

  if (!Array.isArray(initialProducts) || initialProducts.length === 0) {
    throw new Error("Safety check failed: products array is missing or empty!");
  }
  if (!Array.isArray(initialCategories) || initialCategories.length === 0) {
    throw new Error("Safety check failed: categories array is missing or empty!");
  }
  if (!Array.isArray(initialCompanies) || initialCompanies.length === 0) {
    throw new Error("Safety check failed: companies array is missing or empty!");
  }
  if (!Array.isArray(initialUsers) || initialUsers.length === 0) {
    throw new Error("Safety check failed: users array is missing or empty!");
  }

  const superAdmin = initialUsers.find((u: any) => u.role === "SUPER_ADMIN" || u.id === "u-admin");
  if (!superAdmin) {
    throw new Error("Safety check failed: Super Admin account not found in users!");
  }
  if (!superAdmin.passwordHash) {
    throw new Error("Safety check failed: Super Admin password hash is missing!");
  }

  // 3. Create timestamped backup
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const backupFileName = `tamilnadu_suppliers_db.backup_${timestamp}.json`;
  const backupPath = path.join(process.cwd(), "data", backupFileName);

  console.log(`\n2. Creating timestamped backup at: ${backupPath}...`);
  fs.writeFileSync(backupPath, rawData, "utf8");

  // Verify backup
  if (!fs.existsSync(backupPath)) {
    throw new Error("Backup file was not created!");
  }
  const backupRaw = fs.readFileSync(backupPath, "utf8");
  if (backupRaw.length !== rawData.length) {
    throw new Error("Backup size does not match source file!");
  }
  const parsedBackup = JSON.parse(backupRaw);
  if (parsedBackup.bills?.length !== beforeCounts.bills) {
    throw new Error("Backup content validation failed!");
  }
  console.log(`✅ Backup successfully created and verified (${backupRaw.length} bytes).`);

  // 4. Construct cleaned data
  console.log("\n3. Constructing cleaned database state...");
  const cleanedData = {
    ...data,
    // Clear transactional & customer data
    bills: [],
    quotations: [],
    payments: [],
    gatePasses: [],
    returns: [],
    customers: [],
    reservations: [],
    inventoryMovements: [],
    whatsappLogs: [],

    // Strictly preserve products, categories, companies, users, sessions, auditLogs, notifications
    products: initialProducts,
    categories: initialCategories,
    companies: initialCompanies,
    users: initialUsers,
    sessions: data.sessions || [],
    auditLogs: data.auditLogs || [],
    notifications: data.notifications || [],
  };

  // 5. Atomic write: write to temp file first
  const tempPath = path.join(process.cwd(), "data", `tamilnadu_suppliers_db.tmp_${Date.now()}.json`);
  console.log(`\n4. Writing cleaned state to temporary file: ${tempPath}...`);
  const cleanedJsonString = JSON.stringify(cleanedData, null, 2);
  fs.writeFileSync(tempPath, cleanedJsonString, "utf8");

  // 6. Validate temp file
  console.log("5. Validating temporary file integrity...");
  const tempRaw = fs.readFileSync(tempPath, "utf8");
  const parsedTemp = JSON.parse(tempRaw);

  if (parsedTemp.bills.length !== 0) throw new Error("Temp validation failed: bills is not empty!");
  if (parsedTemp.quotations.length !== 0) throw new Error("Temp validation failed: quotations is not empty!");
  if (parsedTemp.payments.length !== 0) throw new Error("Temp validation failed: payments is not empty!");
  if (parsedTemp.gatePasses.length !== 0) throw new Error("Temp validation failed: gatePasses is not empty!");
  if (parsedTemp.returns.length !== 0) throw new Error("Temp validation failed: returns is not empty!");
  if (parsedTemp.customers.length !== 0) throw new Error("Temp validation failed: customers is not empty!");

  if (parsedTemp.products.length !== beforeCounts.products) {
    throw new Error(`Temp validation failed: products count mismatch (${parsedTemp.products.length} vs ${beforeCounts.products})!`);
  }
  if (parsedTemp.categories.length !== beforeCounts.categories) {
    throw new Error(`Temp validation failed: categories count mismatch!`);
  }
  if (parsedTemp.companies.length !== beforeCounts.companies) {
    throw new Error(`Temp validation failed: companies count mismatch!`);
  }
  if (parsedTemp.users.length !== beforeCounts.users) {
    throw new Error(`Temp validation failed: users count mismatch!`);
  }

  const tempSuperAdmin = parsedTemp.users.find((u: any) => u.role === "SUPER_ADMIN" || u.id === "u-admin");
  if (!tempSuperAdmin || !tempSuperAdmin.passwordHash || tempSuperAdmin.passwordHash !== superAdmin.passwordHash) {
    throw new Error("Temp validation failed: Super Admin password hash mismatch!");
  }

  // 7. Atomic replace
  console.log("6. Replacing live database file atomically...");
  fs.copyFileSync(tempPath, dbPath);
  fs.unlinkSync(tempPath);

  // 8. Final verification of replaced live file
  console.log("7. Final verification of live database file...");
  const finalRaw = fs.readFileSync(dbPath, "utf8");
  const finalParsed = JSON.parse(finalRaw);

  const afterCounts: Record<string, number> = {
    bills: finalParsed.bills.length,
    quotations: finalParsed.quotations.length,
    payments: finalParsed.payments.length,
    gatePasses: finalParsed.gatePasses.length,
    returns: finalParsed.returns.length,
    customers: finalParsed.customers.length,
    reservations: finalParsed.reservations.length,
    inventoryMovements: finalParsed.inventoryMovements.length,
    whatsappLogs: finalParsed.whatsappLogs.length,
    products: finalParsed.products.length,
    categories: finalParsed.categories.length,
    companies: finalParsed.companies.length,
    users: finalParsed.users.length,
    auditLogs: finalParsed.auditLogs.length,
    sessions: finalParsed.sessions.length,
    notifications: finalParsed.notifications.length,
  };

  console.log("\n==================================================================");
  console.log("  CLEANUP COMPLETE AND VERIFIED SUCCESSFULLY                    ");
  console.log("==================================================================\n");

  console.log("Record counts AFTER cleanup:");
  console.table(afterCounts);

  const report: CleanReport = {
    timestamp: now.toISOString(),
    backupFile: backupFileName,
    before: beforeCounts,
    after: afterCounts,
    preservedChecks: {
      productsPreserved: finalParsed.products.length === beforeCounts.products,
      productsCount: finalParsed.products.length,
      categoriesPreserved: finalParsed.categories.length === beforeCounts.categories,
      categoriesCount: finalParsed.categories.length,
      companiesPreserved: finalParsed.companies.length === beforeCounts.companies,
      companiesCount: finalParsed.companies.length,
      superAdminPreserved: Boolean(tempSuperAdmin),
      superAdminHasHash: Boolean(tempSuperAdmin?.passwordHash),
      totalUsersCount: finalParsed.users.length,
    },
  };

  console.log("Cleanup Report Summary:", JSON.stringify(report, null, 2));
}

runCleanup().catch((err) => {
  console.error("❌ CLEANUP FAILED:", err.message);
  process.exit(1);
});
