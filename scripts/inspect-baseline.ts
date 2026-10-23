import dotenv from "dotenv";
dotenv.config();
import { getSupabaseAdminClient } from "../src/lib/db/supabaseClient";

async function check() {
  const sb = getSupabaseAdminClient();
  const tables = [
    "users",
    "sessions",
    "companies",
    "categories",
    "products",
    "customers",
    "quotations",
    "quotation_items",
    "quotation_branches",
    "bills",
    "bill_items",
    "bill_branches",
    "payments",
    "gate_passes",
    "gate_pass_items",
    "returns",
    "return_items",
    "audit_logs",
    "activity_notifications",
    "inventory_movements",
  ];
  const counts: Record<string, any> = {};
  for (const t of tables) {
    const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
    counts[t] = error ? error.message : count;
  }
  console.log("BASELINE SUPABASE COUNTS:", JSON.stringify(counts, null, 2));
}

check();
