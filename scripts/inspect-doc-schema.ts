import dotenv from "dotenv";
dotenv.config();

import { getSupabaseAdminClient } from "../src/lib/db/supabaseClient";

async function testDocInsert() {
  const supabase = getSupabaseAdminClient();

  // Test inserting into quotation_branches
  const { error: qbErr } = await supabase.from("quotation_branches").insert({} as any);
  console.log("quotation_branches test error:", qbErr?.message);

  // Test inserting into quotation_items
  const { error: qiErr } = await supabase.from("quotation_items").insert({} as any);
  console.log("quotation_items test error:", qiErr?.message);

  // Test inserting into bill_branches
  const { error: bbErr } = await supabase.from("bill_branches").insert({} as any);
  console.log("bill_branches test error:", bbErr?.message);

  // Test inserting into bill_items
  const { error: biErr } = await supabase.from("bill_items").insert({} as any);
  console.log("bill_items test error:", biErr?.message);
}

testDocInsert();
