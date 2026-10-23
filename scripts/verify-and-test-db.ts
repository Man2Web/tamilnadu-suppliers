import { verifyDatabaseTarget, ALLOWED_SUPABASE_PROJECT_ID } from "../src/lib/db/guard";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("=================================================");
  console.log("TAMILNADU SUPPLIERS - DATABASE VERIFICATION CHECK");
  console.log("=================================================");

  // 1. Target Isolation Check
  const check = verifyDatabaseTarget();
  console.log("Target Verification:", check);

  if (!check.isSafe) {
    console.error("❌ SAFETY VIOLATION: Database target is NOT safe!");
    process.exit(1);
  }

  console.log(`✅ Safe Target Confirmed: Project ID '${ALLOWED_SUPABASE_PROJECT_ID}'`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const databaseUrl = process.env.DATABASE_URL;

  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log(`Has Supabase Key: ${Boolean(serviceKey)}`);
  console.log(`Has Direct Database URL: ${Boolean(databaseUrl)}`);

  if (!serviceKey && !databaseUrl) {
    console.log("\nℹ️ Target is isolated and verified. To connect directly to the live Supabase project, provide the SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY and/or DATABASE_URL in .env");
    console.log("Remember: Never expose secrets in git or browser code.\n");
    return;
  }

  if (serviceKey && supabaseUrl) {
    console.log("\nTesting Supabase API connection...");
    try {
      const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const { data, error } = await supabase.from("companies").select("id, name, gst_type").limit(5);
      if (error) {
        console.log("API Query Result:", error.message);
      } else {
        console.log(`✅ Connected successfully! Found ${data.length} companies in database.`);
      }
    } catch (err: any) {
      console.error("Connection attempt error:", err.message);
    }
  }
}

main().catch(console.error);
