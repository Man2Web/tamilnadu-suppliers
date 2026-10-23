import dotenv from "dotenv";
dotenv.config();

import { getSupabaseAdminClient } from "../src/lib/db/supabaseClient";

async function inspectSchema() {
  const supabase = getSupabaseAdminClient();
  const tables = ["users", "companies", "customers", "quotations", "bills", "payments", "gate_passes", "returns"];

  for (const t of tables) {
    const { error: insertErr } = await supabase.from(t).insert({} as any);
    console.log(`Table '${t}' insert test error:`, insertErr?.message);
  }
}

inspectSchema();
