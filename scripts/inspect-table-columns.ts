import dotenv from "dotenv";
dotenv.config();

import { supabaseStore } from "../src/lib/db/supabaseStore";
import { getSupabaseAdminClient } from "../src/lib/db/supabaseClient";

async function inspectColumns() {
  const supabase = getSupabaseAdminClient();
  const tables = [
    "users",
    "companies",
    "categories",
    "products",
    "customers",
    "customer_branches",
    "quotations",
    "quotation_items",
    "quotation_branches",
    "bills",
    "bill_items",
    "bill_branches",
    "payments",
    "gate_passes",
    "returns",
    "sessions",
    "audit_logs",
    "activity_notifications",
  ];

  for (const t of tables) {
    const { data, error } = await supabase.from(t).select("*").limit(1);
    if (error) {
      console.log(`Table '${t}' ERROR:`, error.message);
    } else {
      const cols = data && data[0] ? Object.keys(data[0]) : "NO ROWS (empty table)";
      console.log(`Table '${t}' cols:`, cols);
    }
  }
}

inspectColumns();
