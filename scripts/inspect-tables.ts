import dotenv from "dotenv";
dotenv.config();
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function inspect() {
  // Let's do an insert with empty object to see what required columns or unknown columns there are, or check an existing record
  const { data: qData, error: qErr } = await supabase.from("quotations").select("*").limit(1);
  if (qErr) console.error("Quotation select error:", qErr);
  else if (qData && qData.length > 0) {
    console.log("Quotations table columns:", Object.keys(qData[0]));
  } else {
    console.log("Quotations table is empty. Let's inspect by inserting dummy to see error");
  }

  const { data: bData, error: bErr } = await supabase.from("bills").select("*").limit(1);
  if (bErr) console.error("Bills select error:", bErr);
  else if (bData && bData.length > 0) {
    console.log("Bills table columns:", Object.keys(bData[0]));
  } else {
    console.log("Bills table is empty.");
  }
}

inspect();
