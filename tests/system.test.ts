// ============================================================================
// COMPREHENSIVE AUTOMATED VERIFICATION SUITE
// Tamilnadu Suppliers Rental Inventory Management System
// ============================================================================

import dotenv from "dotenv";
dotenv.config();

import { verifyDatabaseTarget, ALLOWED_SUPABASE_PROJECT_ID } from "../src/lib/db/guard";
import store, { INITIAL_COMPANIES } from "../src/lib/db/store";
import { previewProductExcel } from "../src/lib/excel/product-importer";
import {
  calculateRentalDays,
  calculateDocumentFinancials,
  numberToIndianWords,
} from "../src/lib/calculations/financial";
import { generateBillPDF, generateQuotationPDF } from "../src/lib/pdf/generator";
import { formatWhatsAppPhone, generateWhatsAppHandoffUrl } from "../src/lib/whatsapp/share";

async function runTestSuite() {
  console.log("==================================================================");
  console.log("TAMILNADU SUPPLIERS - FULL SYSTEM VERIFICATION SUITE");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;

  function assert(testName: string, condition: boolean, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} - ${detail || "Condition not met"}`);
      failed++;
    }
  }

  // TEST 1: Database Target Isolation
  console.log("\n[1] Database Target Isolation & Safety:");
  const dbCheck = verifyDatabaseTarget();
  assert("Dedicated project ID verified", dbCheck.projectId === ALLOWED_SUPABASE_PROJECT_ID);
  assert("Dedicated target is safe", dbCheck.isSafe === true);

  let blockedLegacy = false;
  try {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://hdaljmhsdaxsebvrskkp.supabase.co";
    verifyDatabaseTarget();
  } catch (e: any) {
    blockedLegacy = e.message.includes("CRITICAL SECURITY ALERT");
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://lznyejowgqwbavtnqqns.supabase.co";
  }
  assert("Blocked forbidden legacy database (hdaljmhsdaxsebvrskkp)", blockedLegacy);

  // TEST 2: Two Initial Companies & Super Admin Company Management
  console.log("\n[2] Company Management (Super Admin Only):");
  const initialCompanies = store.getCompanies();
  assert("At least two initial companies configured", initialCompanies.length >= 2);
  const gstCompany = initialCompanies.find((c) => c.gstType === "GST_REGISTERED");
  const nonGstCompany = initialCompanies.find((c) => c.gstType === "NON_GST");
  assert("One company configurable as GST Registered", !!gstCompany && !!gstCompany.gstin);
  assert("One company configurable as Non-GST Registered", !!nonGstCompany);

  // Super Admin adds a new test company
  const createdComp = store.createCompany(
    {
      name: "Tamilnadu Sound & Stage Works",
      displayName: "Tamilnadu Sound & Stage",
      gstType: "NON_GST",
      address: "Anna Salai, Vellore",
    },
    "SUPER_ADMIN"
  );
  assert("Super Admin can add new company", !!createdComp.id);

  // Super Admin edits and toggles GST registration property
  const updatedComp = store.updateCompany(
    createdComp.id,
    {
      gstType: "GST_REGISTERED",
      gstin: "33ZZZZZ9999Z1Z1",
    },
    "SUPER_ADMIN"
  );
  assert("GST registration is a configurable property (toggled to GST)", updatedComp.gstType === "GST_REGISTERED");

  // Deactivate company
  const deactivatedComp = store.deactivateCompany(createdComp.id, "SUPER_ADMIN");
  assert("Super Admin can deactivate company", deactivatedComp.isActive === false);

  // Employee authorization check
  let employeeBlocked = false;
  try {
    store.createCompany({ name: "Rogue Company" }, "EMPLOYEE");
  } catch (e: any) {
    employeeBlocked = e.message.includes("Unauthorized");
  }
  assert("Employees blocked from adding companies", employeeBlocked);

  // Delete unused company safely
  const deleteResult = store.deleteCompany(createdComp.id, "SUPER_ADMIN");
  assert("Unused company deleted safely", deleteResult.success === true);

  // Deletion blocked if company has historical transactions
  let unsafeDeleteBlocked = false;
  try {
    store.deleteCompany(initialCompanies[0].id, "SUPER_ADMIN");
  } catch (e: any) {
    unsafeDeleteBlocked = e.message.includes("Cannot delete company");
  }
  assert("Unsafe deletion prevented for company with transactions", unsafeDeleteBlocked);

  // TEST 3: Shared Product Master & Excel Parser
  console.log("\n[3] Excel Importer & Shared Catalog:");
  const excelResult = previewProductExcel("./data/Comp0006_ListofItems.xlsx", "Comp0006_ListofItems.xlsx");
  assert("True header detected on row 5", excelResult.detectedHeaderRow === 5);
  assert("496 valid items extracted from Comp0006 workbook", excelResult.validRowsCount === 496);
  assert("Zero duplicates in original catalog", excelResult.duplicateRowsCount === 0);

  // Stock formula verification
  const testProduct = store.createProduct({
    name: "Heavy Duty Canopy 20x20",
    sizeSpec: "20x20 Ft",
    unit: "Nos",
    defaultRentalRate: 2500,
    rentalRateUnit: "PER_DAY",
    minRentalDuration: 1,
    securityDepositAmount: 5000,
    replacementValue: 35000,
    totalOwnedQuantity: 10,
    availableQuantity: 10,
    reservedQuantity: 0,
    rentedQuantity: 0,
    damagedQuantity: 0,
    missingQuantity: 0,
    maintenanceQuantity: 0,
    isActive: true,
  });

  const updatedProd = store.updateProduct(testProduct.id, {
    rentedQuantity: 3,
    damagedQuantity: 1,
  });
  // available = 10 - (3 + 1) = 6
  assert("Available stock formula: Owned - (Rented + Damaged) = 6", updatedProd.availableQuantity === 6);

  // TEST 4: Financial Calculations & Indian Words
  console.log("\n[4] Financial Calculations & Number to Words:");
  const words742 = numberToIndianWords(78730);
  assert(
    "Sample Bill 742 amount in words matches reference PDF",
    words742 === "Rupees Seventy Eight Thousand Seven Hundred Thirty Only",
    `Got: ${words742}`
  );

  const testFinancials = calculateDocumentFinancials({
    taxType: "GST_REGISTERED",
    branchSubtotals: [10000, 20000],
    transportCharges: 2000,
    loadingCharges: 1000,
    discountAmount: 1000,
  });
  // Net Taxable = 30000 + 3000 - 1000 = 32000
  // CGST (9%) = 2880, SGST (9%) = 2880, Total = 37760
  assert("Taxable amount calculation correct", testFinancials.taxableAmount === 32000);
  assert("CGST 9% calculated correctly", testFinancials.cgstAmount === 2880);
  assert("SGST 9% calculated correctly", testFinancials.sgstAmount === 2880);
  assert("Grand total calculation correct", testFinancials.grandTotal === 37760);

  // TEST 5: Multi-Branch Quotation Creation & 1-Click Bill Conversion
  console.log("\n[5] Multi-Branch Quotation & 1-Click Bill Conversion:");
  const quote = store.createQuotation({
    companyId: store.getCompanies()[0].id,
    customerId: "cust-2",
    customerName: "ABC Hotels & Resorts",
    customerPhone: "9840198401",
    customerAddress: "Chennai",
    rentalStartDate: "2026-11-01",
    rentalEndDate: "2026-11-03",
    rentalDays: 3,
    branches: [
      {
        branchName: "Vellore Branch",
        items: [
          { productId: "p2", quantity: 100, days: 3, unitPrice: 20 },
          { productId: "p3", quantity: 10, days: 3, unitPrice: 150 },
        ],
      },
      {
        branchName: "Chennai Branch",
        items: [
          { productId: "p2", quantity: 50, days: 3, unitPrice: 20 },
          { productId: "p6", quantity: 20, days: 3, unitPrice: 400 },
        ],
      },
    ],
    transportCharges: 6000,
    loadingCharges: 4000,
  });

  assert("Multi-branch quotation created with sequential number", Boolean(quote.quotationNumber.startsWith("TNQ-")));
  assert("Quotation contains 2 branch sections", quote.branches.length === 2);

  const bill = store.convertQuotationToBill(quote.id);
  assert("Quotation successfully converted to Bill", Boolean(bill.billNumber));
  assert("Bill retains source quotation reference", bill.sourceQuotationId === quote.id);
  assert("Quotation status marked as CONVERTED", store.getQuotation(quote.id)?.status === "CONVERTED");

  // Prevent duplicate conversion
  let duplicateBlocked = false;
  try {
    store.convertQuotationToBill(quote.id);
  } catch (err: any) {
    duplicateBlocked = err.message.includes("already been converted");
  }
  assert("Concurrency lock: Duplicate quotation conversion prevented", duplicateBlocked);

  // TEST 6: PDF Generation Engine
  console.log("\n[6] PDF Document Generation (Sample 742 Layout):");
  const billPdf = generateBillPDF(bill);
  const pdfBytes = billPdf.output("arraybuffer").byteLength;
  assert("Bill PDF generated successfully (> 10KB valid PDF)", pdfBytes > 10000);

  const quotePdf = generateQuotationPDF(quote);
  const quoteBytes = quotePdf.output("arraybuffer").byteLength;
  assert("Quotation PDF generated successfully (> 10KB valid PDF)", quoteBytes > 10000);

  // TEST 7: WhatsApp Sharing Link
  console.log("\n[7] WhatsApp Document Sharing:");
  const cleanPhone = formatWhatsAppPhone("98401-98401");
  assert("Normalized Indian phone to E.164: 919840198401", cleanPhone === "919840198401");
  const waUrl = generateWhatsAppHandoffUrl("9840198401", "Rental Bill 742");
  assert("Generated valid wa.me click-to-chat URL", waUrl.startsWith("https://wa.me/919840198401?text="));

  console.log("\n==================================================================");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(console.error);
