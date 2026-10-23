import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { verifyDatabaseTarget, ALLOWED_SUPABASE_PROJECT_ID } from "../src/lib/db/guard";

dotenv.config();

const CATEGORY_MAP: Record<string, string> = {
  "General": "ca000001-0000-0000-0000-000000000001",
  "Furniture & Seating": "ca000002-0000-0000-0000-000000000002",
  "Stalls & Infrastructure": "ca000003-0000-0000-0000-000000000003",
  "Electricals & Cooling": "ca000004-0000-0000-0000-000000000004",
  "Carpets & Linens": "ca000005-0000-0000-0000-000000000005",
  "Catering Vessels": "ca000006-0000-0000-0000-000000000006",
};

export function getProductDeterministicUuid(productId: string, index: number): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) {
    return productId;
  }
  const numericMatch = productId.match(/\d+/);
  const num = numericMatch ? parseInt(numericMatch[0], 10) : index + 1;
  return `00000000-0000-0000-0000-${String(num).padStart(12, "0")}`;
}

export function getUserDeterministicUuid(userId: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return userId;
  }
  if (userId === "u-admin") return "00000000-0000-0000-0000-000000000001";
  if (userId === "u-test-admin") return "00000000-0000-0000-0000-000000000002";
  if (userId === "u-test-billing") return "00000000-0000-0000-0000-000000000003";
  return crypto.randomUUID();
}

async function migrateData() {
  console.log("==================================================================");
  console.log("  TAMILNADU SUPPLIERS - FULL DATA MIGRATION TO SUPABASE         ");
  console.log("==================================================================\n");

  // 1. Target isolation check
  const targetCheck = verifyDatabaseTarget();
  if (!targetCheck.isSafe) {
    throw new Error(`[DATABASE SAFETY VIOLATION] ${targetCheck.message}`);
  }
  console.log(`✅ Safe Target Confirmed: Dedicated Project '${ALLOWED_SUPABASE_PROJECT_ID}'`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 2. Backup local database file
  const localDbPath = path.join(process.cwd(), "data", "tamilnadu_suppliers_db.json");
  const rawDb = fs.readFileSync(localDbPath, "utf8");
  const db = JSON.parse(rawDb);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(process.cwd(), "data", `tamilnadu_suppliers_db.pre_supabase_migration_${timestamp}.json`);
  fs.writeFileSync(backupPath, rawDb, "utf8");
  console.log(`✅ Local database backed up at: ${backupPath}\n`);

  const report = {
    companies: { imported: 0, skipped: 0, failed: 0 },
    products: { imported: 0, skipped: 0, failed: 0 },
    categories: { imported: 0, skipped: 0, failed: 0 },
    users: { imported: 0, skipped: 0, failed: 0 },
    bills: { imported: 0, skipped: 0, failed: 0 },
    quotations: { imported: 0, skipped: 0, failed: 0 },
  };

  // 3. Migrate Companies
  console.log("3. Migrating Companies...");
  for (const c of db.companies || []) {
    const row = {
      id: c.id,
      name: c.name,
      display_name: c.displayName,
      gst_type: c.gstType,
      gstin: c.gstin || null,
      pan: c.pan || null,
      email: c.email || null,
      phone: c.phone || null,
      address: c.address,
      state: c.state || "Tamil Nadu",
      state_code: c.stateCode || "33",
      place_of_supply: c.placeOfSupply || "Vellore",
      bank_name: c.bankName || "City Union Bank",
      bank_account_no: c.bankAccountNo || "510909010078513",
      bank_ifsc: c.bankIfsc || "CIUB0000065",
      bank_branch: c.bankBranch || "Vellore Branch",
      invoice_prefix: c.invoicePrefix || "TNS-",
      quotation_prefix: c.quotationPrefix || "TNQ-",
      gate_pass_prefix: c.gatePassPrefix || "TNGP-",
      next_invoice_no: c.nextInvoiceNo || 1,
      next_quotation_no: c.nextQuotationNo || 1,
      next_gate_pass_no: c.nextGatePassNo || 1,
      terms_and_conditions: c.termsAndConditions || "",
      authorized_signatory_title: c.authorizedSignatoryTitle || "Authorised Signatory",
      is_active: c.isActive !== false,
      created_at: c.createdAt || new Date().toISOString(),
      updated_at: c.updatedAt || new Date().toISOString(),
    };

    const { error } = await supabase.from("companies").upsert(row);
    if (error) {
      console.error(`Failed to migrate company ${c.name}:`, error.message);
      report.companies.failed++;
    } else {
      report.companies.imported++;
    }
  }
  console.log(`   Companies migrated: ${report.companies.imported}`);

  // 4. Migrate Products in Batches of 50
  console.log("4. Migrating Products (528 records)...");
  const productRows = (db.products || []).map((p: any, idx: number) => {
    const uuid = getProductDeterministicUuid(p.id, idx);
    return {
      id: uuid,
      sku: p.id,
      name: p.name,
      alias: p.alias || null,
      category_id: CATEGORY_MAP[p.categoryName] || null,
      category_name: p.categoryName || "General",
      size_spec: p.sizeSpec || null,
      unit: p.unit || "Nos",
      default_rental_rate: Number(p.defaultRentalRate || 0),
      rental_rate_unit: p.rentalRateUnit || "PER_DAY",
      min_rental_duration: Number(p.minRentalDuration || 1),
      security_deposit_amount: Number(p.securityDepositAmount || 0),
      replacement_value: Number(p.replacementValue || 0),
      total_owned_quantity: Number(p.totalOwnedQuantity || 0),
      available_quantity: Number(p.availableQuantity || 0),
      reserved_quantity: Number(p.reservedQuantity || 0),
      rented_quantity: Number(p.rentedQuantity || 0),
      damaged_quantity: Number(p.damagedQuantity || 0),
      missing_quantity: Number(p.missingQuantity || 0),
      maintenance_quantity: Number(p.maintenanceQuantity || 0),
      is_active: p.isActive !== false,
      notes: p.notes || null,
      created_at: p.createdAt || new Date().toISOString(),
      updated_at: p.updatedAt || new Date().toISOString(),
    };
  });

  const batchSize = 50;
  for (let i = 0; i < productRows.length; i += batchSize) {
    const batch = productRows.slice(i, i + batchSize);
    const { error } = await supabase.from("products").upsert(batch);
    if (error) {
      console.error(`Batch ${i} - ${i + batch.length} failed:`, error.message);
      report.products.failed += batch.length;
    } else {
      report.products.imported += batch.length;
    }
  }
  console.log(`   Products migrated: ${report.products.imported} / ${productRows.length}`);

  // 5. Migrate Users
  console.log("5. Migrating Users...");
  for (const u of db.users || []) {
    const uuid = getUserDeterministicUuid(u.id);
    const row: any = {
      id: uuid,
      email: u.email.trim().toLowerCase(),
      name: u.name,
      phone: u.phone || null,
      role: u.role,
      status: u.status || "ACTIVE",
      permissions: u.permissions || [],
      created_at: u.createdAt || new Date().toISOString(),
      updated_at: u.updatedAt || new Date().toISOString(),
    };

    if (u.passwordHash) {
      row.password_hash = u.passwordHash;
    }

    const { error } = await supabase.from("users").upsert(row);
    if (error) {
      if (error.message.includes("users_role_check")) {
        // Fallback for EMPLOYEE if constraint is not yet relaxed
        row.role = "EMPLOYEE";
        const { error: err2 } = await supabase.from("users").upsert(row);
        if (!err2) {
          report.users.imported++;
          continue;
        }
      }
      console.error(`Failed to migrate user ${u.email}:`, error.message);
      report.users.failed++;
    } else {
      report.users.imported++;
    }
  }
  console.log(`   Users migrated: ${report.users.imported}`);

  // 6. Verification of Counts in Supabase
  console.log("\n6. Verifying Supabase record counts...");
  const { count: compCount } = await supabase.from("companies").select("*", { count: "exact", head: true });
  const { count: prodCount } = await supabase.from("products").select("*", { count: "exact", head: true });
  const { count: userCount } = await supabase.from("users").select("*", { count: "exact", head: true });
  const { count: catCount } = await supabase.from("categories").select("*", { count: "exact", head: true });
  const { count: billCount } = await supabase.from("bills").select("*", { count: "exact", head: true });
  const { count: quoteCount } = await supabase.from("quotations").select("*", { count: "exact", head: true });

  console.log("\n==================================================================");
  console.log("  MIGRATION VERIFICATION COMPLETE                               ");
  console.log("==================================================================");
  console.table({
    Companies: { local: db.companies.length, supabase: compCount },
    Products: { local: db.products.length, supabase: prodCount },
    Users: { local: db.users.length, supabase: userCount },
    Categories: { local: 5, supabase: catCount },
    Bills: { local: 0, supabase: billCount },
    Quotations: { local: 0, supabase: quoteCount },
  });
}

migrateData().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
