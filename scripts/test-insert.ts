import dotenv from "dotenv";
dotenv.config();
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_BILL_COLUMNS = new Set([
  "id",
  "bill_number",
  "company_id",
  "company_snapshot",
  "source_quotation_id",
  "customer_id",
  "customer_name",
  "customer_phone",
  "customer_address",
  "customer_gstin",
  "bill_date",
  "supply_date",
  "place_of_supply",
  "rental_start_date",
  "rental_end_date",
  "rental_days",
  "status",
  "tax_type",
  "subtotal",
  "transport_charges",
  "loading_charges",
  "labor_charges",
  "other_charges",
  "discount_amount",
  "taxable_amount",
  "cgst_rate",
  "cgst_amount",
  "sgst_rate",
  "sgst_amount",
  "igst_rate",
  "igst_amount",
  "total_tax",
  "grand_total",
  "advance_paid",
  "security_deposit_held",
  "amount_paid",
  "balance_due",
  "amount_in_words",
  "notes",
  "terms_and_conditions",
  "created_by",
  "created_at",
  "updated_at",
  "document_lines"
]);

async function testValidColumns() {
  const { data: comp } = await supabase.from("companies").select("*").limit(1).single();
  const { data: cust } = await supabase.from("customers").select("*").limit(1).single();

  const testRow: any = {
    id: crypto.randomUUID(),
    bill_number: "TEST-B-VALID-01",
    company_id: comp.id,
    company_snapshot: comp,
    source_quotation_id: null,
    customer_id: cust.id,
    customer_name: cust.name,
    customer_phone: cust.mobile || "9999999999",
    customer_address: cust.billing_address || "Tamil Nadu",
    customer_gstin: null,
    bill_date: "2026-10-15",
    supply_date: "2026-10-15",
    place_of_supply: comp.place_of_supply || "Vellore",
    rental_start_date: "2026-10-15",
    rental_end_date: "2026-10-20",
    rental_days: 5,
    status: "ISSUED",
    tax_type: "NON_GST",
    subtotal: 1000,
    transport_charges: 0,
    loading_charges: 0,
    labor_charges: 0,
    other_charges: 0,
    discount_amount: 0,
    taxable_amount: 1000,
    cgst_rate: 0,
    cgst_amount: 0,
    sgst_rate: 0,
    sgst_amount: 0,
    igst_rate: 0,
    igst_amount: 0,
    total_tax: 0,
    grand_total: 1000,
    advance_paid: 0,
    security_deposit_held: 0,
    amount_paid: 0,
    balance_due: 1000,
    amount_in_words: "Rupees One Thousand Only",
    notes: "Test notes",
    terms_and_conditions: "Test terms",
    created_by: null,
    document_lines: []
  };

  const { data, error } = await supabase.from("bills").insert(testRow).select().single();
  if (error) {
    console.error("Insert error:", error.message);
  } else {
    console.log("Insert SUCCESS! Clean bill ID:", data?.id);
    await supabase.from("bills").delete().eq("id", data.id);
  }
}

testValidColumns();
