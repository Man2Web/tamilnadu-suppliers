import dotenv from "dotenv";
dotenv.config();
import { getSupabaseAdminClient } from "../src/lib/db/supabaseClient";

async function safeCleanup() {
  const sb = getSupabaseAdminClient();
  console.log("=== STARTING PRECISE CASCADE CLEANUP OF TEST RECORDS ===");

  // 1. Identify test bills
  const { data: testBills } = await sb
    .from("bills")
    .select("id, bill_number")
    .or("bill_number.like.GERE%,bill_number.like.NEE%,bill_number.like.TRC%");
  const bIds = (testBills || []).map((b) => b.id);
  console.log(`Found ${bIds.length} test bills.`);

  // 2. Identify test quotations
  const { data: testQuotations } = await sb
    .from("quotations")
    .select("id, quotation_number")
    .or("quotation_number.like.GERE%,quotation_number.like.TRC%");
  const qIds = (testQuotations || []).map((q) => q.id);
  console.log(`Found ${qIds.length} test quotations.`);

  // 3. Break circular references between quotations and bills
  if (bIds.length > 0) {
    console.log("Unlinking quotations <-> bills circular references...");
    await sb.from("quotations").update({ converted_bill_id: null }).in("converted_bill_id", bIds);
    await sb.from("bills").update({ source_quotation_id: null }).in("id", bIds);
  }

  // 4. Find all test gate passes
  const { data: gpRows } = await sb
    .from("gate_passes")
    .select("id, bill_id")
    .or("gate_pass_number.like.GERE%,gate_pass_number.like.NEE%,gate_pass_number.like.TRC%");
  const gpIds = (gpRows || []).map((g) => g.id);
  console.log(`Found ${gpIds.length} test gate passes.`);

  // 5. Find returns linked to these gate passes
  if (gpIds.length > 0) {
    const { data: retRows } = await sb.from("returns").select("id").in("gate_pass_id", gpIds);
    const retIds = (retRows || []).map((r) => r.id);
    console.log(`Found ${retIds.length} test returns.`);

    if (retIds.length > 0) {
      console.log("Deleting return items and returns...");
      await sb.from("return_items").delete().in("return_id", retIds);
      await sb.from("returns").delete().in("id", retIds);
    }

    console.log("Deleting gate pass items and gate passes...");
    await sb.from("gate_pass_items").delete().in("gate_pass_id", gpIds);
    await sb.from("gate_passes").delete().in("id", gpIds);
  }

  // 6. Delete payments, inventory movements, bill items, bill branches, and bills
  if (bIds.length > 0) {
    console.log("Deleting test payments...");
    await sb.from("payments").delete().in("bill_id", bIds);

    console.log("Deleting inventory movements for test bills...");
    await sb.from("inventory_movements").delete().in("reference_id", bIds);

    console.log("Deleting bill items & branches...");
    await sb.from("bill_items").delete().in("bill_id", bIds);
    await sb.from("bill_branches").delete().in("bill_id", bIds);

    console.log("Deleting bills...");
    const { error: bErr } = await sb.from("bills").delete().in("id", bIds);
    if (bErr) console.error("Error deleting bills:", bErr.message);
    else console.log("✅ Successfully deleted test bills.");
  }

  // 7. Delete quotation items, branches, and quotations
  if (qIds.length > 0) {
    console.log("Deleting quotation items, branches, and quotations...");
    await sb.from("quotation_items").delete().in("quotation_id", qIds);
    await sb.from("quotation_branches").delete().in("quotation_id", qIds);
    const { error: qErr } = await sb.from("quotations").delete().in("id", qIds);
    if (qErr) console.error("Error deleting quotations:", qErr.message);
    else console.log("✅ Successfully deleted test quotations.");
  }

  // 8. Delete test customers
  const { data: testCusts } = await sb
    .from("customers")
    .select("id")
    .or("name.like.E2E Infrastructure Projects E2E_%,name.like.Test Construction Corp%");
  const custIds = (testCusts || []).map((c) => c.id);
  if (custIds.length > 0) {
    console.log(`Deleting ${custIds.length} test customers...`);
    await sb.from("customers").delete().in("id", custIds);
  }

  // 9. Delete test products
  const { data: testProds } = await sb
    .from("products")
    .select("id")
    .or("name.like.Acro Spans 4M Heavy Duty E2E_%,name.like.Test Scaffolding Coupler%");
  const prodIds = (testProds || []).map((p) => p.id);
  if (prodIds.length > 0) {
    console.log(`Deleting ${prodIds.length} test products...`);
    await sb.from("inventory_movements").delete().in("product_id", prodIds);
    await sb.from("products").delete().in("id", prodIds);
  }

  // 10. Delete test categories
  const { data: testCats } = await sb
    .from("categories")
    .select("id")
    .or("name.like.Props & Scaffolds E2E_%,name.like.Test Category%");
  const catIds = (testCats || []).map((c) => c.id);
  if (catIds.length > 0) {
    console.log(`Deleting ${catIds.length} test categories...`);
    await sb.from("categories").delete().in("id", catIds);
  }

  // 11. Delete test companies
  const { data: testComps } = await sb
    .from("companies")
    .select("id")
    .or("name.like.GST Equipment Rentals E2E_%,name.like.Non-GST Enterprise E2E_%,name.like.Test Rentals Co%");
  const compIds = (testComps || []).map((c) => c.id);
  if (compIds.length > 0) {
    console.log(`Deleting ${compIds.length} test companies...`);
    await sb.from("companies").delete().in("id", compIds);
  }

  console.log("=== PRECISE CASCADE CLEANUP FINISHED ===");
}

safeCleanup().catch(console.error);
