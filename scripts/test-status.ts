import dotenv from "dotenv";
dotenv.config();
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testStatuses() {
  const { data: comp } = await supabase.from("companies").select("id").limit(1).single();
  const { data: cust } = await supabase.from("customers").select("id").limit(1).single();

  for (const st of ["ISSUED", "ACTIVE", "CLOSED", "PARTIALLY_PAID", "PAID", "CANCELLED", "SETTLED"]) {
    const id = crypto.randomUUID();
    const { error } = await supabase.from("bills").insert({
      id,
      bill_number: "TEST-ST-" + st + "-" + Date.now().toString().slice(-4),
      company_id: comp!.id,
      company_snapshot: {},
      customer_id: cust!.id,
      customer_name: "Test",
      customer_phone: "1234567890",
      customer_address: "Addr",
      rental_start_date: "2026-10-15",
      rental_end_date: "2026-10-20",
      amount_in_words: "Words",
      status: st,
    });
    if (error) {
      console.log("Status", st, "FAILED:", error.message);
    } else {
      console.log("Status", st, "ALLOWED!");
      await supabase.from("bills").delete().eq("id", id);
    }
  }
}

testStatuses();
