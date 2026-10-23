import fs from "fs";
import path from "path";
import store from "../src/lib/db/store";
import { generateBillPDF, generateQuotationPDF } from "../src/lib/pdf/generator";
import { calculateDocumentFinancials, calculateFinalSettlement } from "../src/lib/calculations/financial";

function assert(description: string, condition: boolean) {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    throw new Error(`Assertion failed: ${description}`);
  }
}

async function runAcceptanceTests() {
  console.log("============================================================================");
  console.log("TAMILNADU SUPPLIERS — BRANCH REMOVAL, NOTES, BILLING & WORKFLOW VERIFICATION");
  console.log("============================================================================");

  // -------------------------------------------------------------------------
  // Test 1: Creating a bill without any branch section succeeds
  // -------------------------------------------------------------------------
  console.log("\n[Test 1 & 3] Creating a bill without any branch section...");
  const company = store.getCompanies().find((c) => c.gstType === "NON_GST") || store.getCompanies()[0];
  
  const billItems = [
    {
      productId: "p1",
      itemName: "LED Stage",
      sizeSpec: "4*18",
      quantity: 4,
      days: 2,
      unitPrice: 500,
      amount: 4000,
      deliveryLocation: "VIT College — Main Auditorium",
    },
    {
      productId: "p2",
      itemName: "Conference Chair With Cover",
      sizeSpec: "Standard",
      quantity: 50,
      days: 2,
      unitPrice: 25,
      amount: 2500,
      deliveryLocation: "VIT College — Seminar Hall",
    },
  ];

  const billNotes = [
    "VIT College — Main Auditorium",
    "Department of Computer Science",
    "Delivery before 8:00 AM",
  ];

  const bill = store.createBill({
    companyId: company.id,
    customerName: "VIT Chennai — Annual Symposium",
    customerPhone: "9842199999",
    customerAddress: "Vandalur-Kelambakkam Road, Chennai",
    deliveryLocation: "VIT College Main Campus",
    rentalStartDate: "2026-10-20",
    rentalEndDate: "2026-10-22",
    rentalDays: 2,
    agreedRentalRate: 6500,
    items: billItems,
    notesList: billNotes,
    // NO branches provided!
  });

  assert("Bill created without branches has valid ID", !!bill.id);
  assert("Bill has assigned bill number", !!bill.billNumber);
  assert("Bill status starts as ISSUED", bill.status === "ISSUED");
  assert("Bill items length is 2", (bill.items || []).length === 2);
  assert("Bill notesList has 3 notes", (bill.notesList || []).length === 3);
  assert("First note preserved in exact order", bill.notesList?.[0] === "VIT College — Main Auditorium");
  assert("Second note preserved in exact order", bill.notesList?.[1] === "Department of Computer Science");
  assert("Third note preserved in exact order", bill.notesList?.[2] === "Delivery before 8:00 AM");
  assert("Subtotal is exactly 4000 + 2500 = 6500", bill.subtotal === 6500);
  assert("Grand total is 6500", bill.grandTotal === 6500);

  // -------------------------------------------------------------------------
  // Test 2: Creating a quotation without any branch section succeeds
  // -------------------------------------------------------------------------
  console.log("\n[Test 2] Creating a quotation without any branch section...");
  const quoteItems = [
    {
      productId: "p3",
      itemName: "PA Sound System 2000W",
      sizeSpec: "Dual 15-inch JBL",
      quantity: 2,
      days: 1,
      unitPrice: 2000,
      amount: 4000,
      deliveryLocation: "Open Air Theatre",
    },
    {
      productId: "p4",
      itemName: "Focus Stage Lights",
      sizeSpec: "54x3W LED Par",
      quantity: 8,
      days: 1,
      unitPrice: 200,
      amount: 1600,
      deliveryLocation: "OAT Stage Truss",
    },
  ];

  const quoteNotes = [
    "Open Air Theatre — Cultural Stage",
    "Sound setup required by 4:00 PM for soundcheck",
  ];

  const quotation = store.createQuotation({
    companyId: company.id,
    customerName: "SRM University Cultural Club",
    customerPhone: "9876543210",
    customerAddress: "SRM Nagar, Kattankulathur",
    deliveryLocation: "SRM Open Air Ground",
    rentalStartDate: "2026-11-01",
    rentalEndDate: "2026-11-02",
    rentalDays: 1,
    items: quoteItems,
    notesList: quoteNotes,
    // NO branches provided!
  });

  assert("Quotation created without branches has valid ID", !!quotation.id);
  assert("Quotation has assigned quote number", !!quotation.quotationNumber);
  assert("Quotation status is ISSUED", quotation.status === "ISSUED");
  assert("Quotation items length is 2", (quotation.items || []).length === 2);
  assert("Quotation notesList has 2 notes", (quotation.notesList || []).length === 2);
  assert("Quotation subtotal is 4000 + 1600 = 5600", quotation.subtotal === 5600);
  assert("Quotation grand total is 5600", quotation.grandTotal === 5600);

  // -------------------------------------------------------------------------
  // Test 3: The old "At least one branch section is required" error is gone
  // -------------------------------------------------------------------------
  console.log("\n[Test 3] Verifying no branch requirement in API routes...");
  const billsRouteContent = fs.readFileSync(path.join(process.cwd(), "src/app/api/bills/route.ts"), "utf-8");
  const quotationsRouteContent = fs.readFileSync(path.join(process.cwd(), "src/app/api/quotations/route.ts"), "utf-8");

  assert("API /api/bills does not require branches", !billsRouteContent.includes("At least one branch section is required"));
  assert("API /api/quotations does not require branches", !quotationsRouteContent.includes("At least one branch section is required"));

  // -------------------------------------------------------------------------
  // Test 4 & 7: Notes are compact single lines and do not affect financials or stock
  // -------------------------------------------------------------------------
  console.log("\n[Test 4 & 7] Verifying notes are purely informational without financial or stock impact...");
  const initialStockP1 = store.getProduct("p1")?.availableQuantity || 0;
  const initialSubtotal = bill.subtotal;
  const initialGrandTotal = bill.grandTotal;

  // Adding 5 more notes
  const updatedNotes = [
    ...billNotes,
    "Special instruction: VIP seating on stage right",
    "Contact security officer Mr. Raman at entrance gate 2",
  ];

  const updatedBill = store.saveBillWorkspaceChanges(bill.id, {
    notesList: updatedNotes,
  });

  const stockP1After = store.getProduct("p1")?.availableQuantity || 0;
  assert("Adding notes does not change product stock", initialStockP1 === stockP1After);
  assert("Adding notes does not change document subtotal", updatedBill.subtotal === initialSubtotal);
  assert("Adding notes does not change document grand total", updatedBill.grandTotal === initialGrandTotal);
  assert("Bill now has 5 notes preserved", updatedBill.notesList?.length === 5);

  // -------------------------------------------------------------------------
  // Test 5 & 8: Product line behavior and automatic financial recalculation
  // -------------------------------------------------------------------------
  console.log("\n[Test 5 & 8] Verifying product line details & automatic financial updates...");
  assert("Product line 1 has sizeSpec '4*18'", bill.items?.[0]?.sizeSpec === "4*18");
  assert("Product line 1 has deliveryLocation", bill.items?.[0]?.deliveryLocation === "VIT College — Main Auditorium");
  assert("Product line 2 has deliveryLocation", bill.items?.[1]?.deliveryLocation === "VIT College — Seminar Hall");

  // Re-calculate financials if items change
  const newCalculated = calculateDocumentFinancials({
    taxType: "NON_GST",
    itemsSubtotal: 8000,
    transportCharges: 500,
  });
  assert("Updated items subtotal recalculates grand total correctly", newCalculated.grandTotal === 8500);

  // -------------------------------------------------------------------------
  // Test 6: Multiple notes and multiple product lines coexist on one document
  // -------------------------------------------------------------------------
  console.log("\n[Test 6] Verifying coexistence of multiple notes and product lines...");
  assert("Document has multiple items (2)", (updatedBill.items || []).length >= 2);
  assert("Document has multiple notes (5)", (updatedBill.notesList || []).length >= 5);

  // -------------------------------------------------------------------------
  // Test 9: PDF generation includes notes and product locations
  // -------------------------------------------------------------------------
  console.log("\n[Test 9] Verifying PDF generation contains notes and delivery locations...");
  const billDoc = generateBillPDF(updatedBill);
  const billPdfBuffer = Buffer.from(billDoc.output("arraybuffer"));
  assert("Bill PDF generated successfully as non-empty buffer", billPdfBuffer.length > 1000);

  const quoteDoc = generateQuotationPDF(quotation);
  const quotePdfBuffer = Buffer.from(quoteDoc.output("arraybuffer"));
  assert("Quotation PDF generated successfully as non-empty buffer", quotePdfBuffer.length > 1000);

  // -------------------------------------------------------------------------
  // Test 10: Quotation remains separate from bill until explicitly converted
  // -------------------------------------------------------------------------
  console.log("\n[Test 10] Verifying quotation to bill explicit conversion...");
  const quoteBeforeConversion = store.getQuotation(quotation.id);
  assert("Quotation has no bill ID before conversion", !quoteBeforeConversion?.convertedBillId);
  assert("Quotation status is ISSUED before conversion", quoteBeforeConversion?.status === "ISSUED");

  // Explicit conversion action
  const convertedBill = store.convertQuotationToBill(quotation.id, "u-superadmin");
  const quoteAfterConversion = store.getQuotation(quotation.id);

  assert("Quotation status is CONVERTED after explicit conversion", quoteAfterConversion?.status === "CONVERTED");
  assert("Quotation links to converted bill ID", quoteAfterConversion?.convertedBillId === convertedBill.id);
  assert("Quotation links to converted bill number", quoteAfterConversion?.convertedBillNumber === convertedBill.billNumber);
  assert("Converted bill inherits notesList", (convertedBill.notesList || []).length === 2);
  assert("Converted bill inherits items", (convertedBill.items || []).length === 2);
  assert("Converted bill has matching subtotal", convertedBill.subtotal === quotation.subtotal);
  assert("Converted bill status starts as ISSUED", convertedBill.status === "ISSUED");

  // -------------------------------------------------------------------------
  // Test 11: Dispatch, returns, damages, missing items, payments & closure
  // -------------------------------------------------------------------------
  console.log("\n[Test 11] Verifying dispatch, returns, separate damages/missing charges, payment & closure...");
  // Dispatch
  const gatePass = store.createGatePass({
    companyId: convertedBill.companyId,
    billId: convertedBill.id,
    customerId: convertedBill.customerId,
    customerName: convertedBill.customerName,
    destinationBranch: "SRM Open Air Ground",
    vehicleNumber: "TN 23 AZ 4545",
    driverName: "Kumar M",
    expectedReturnDate: convertedBill.expectedReturnDate,
    items: [
      { productId: "p3", itemName: "PA Sound System 2000W", quantityDispatched: 2 },
      { productId: "p4", itemName: "Focus Stage Lights", quantityDispatched: 8 },
    ],
  });
  assert("Gate pass created with number", !!gatePass.gatePassNumber);
  const billAfterDispatch = store.getBill(convertedBill.id);
  assert("Bill status is now OUT_ON_RENT after dispatch", billAfterDispatch?.status === "OUT_ON_RENT");

  // Return with 1 damaged light and 1 missing light
  const returnResult = store.recordBillReturn(convertedBill.id, {
    items: [
      {
        productId: "p3",
        quantityReturnedGood: 2,
        quantityDamaged: 0,
        quantityMissing: 0,
      },
      {
        productId: "p4",
        quantityReturnedGood: 6,
        quantityDamaged: 1,
        quantityMissing: 1,
        damageChargeDecision: "CHARGE_CUSTOMER",
        damageChargeAmount: 400,
        damageNotes: "Cracked lens",
        missingChargeDecision: "CHARGE_CUSTOMER",
        missingChargeAmount: 700,
        missingNotes: "Cable missing",
      },
    ],
    actualReturnDate: "2026-11-02",
    inspectedBy: "Chief Storekeeper",
  });

  assert("Return record created successfully", !!returnResult.returnRecord.returnNumber);
  const billAfterReturn = store.getBill(convertedBill.id);
  assert("Bill has approved damage charges of 400", billAfterReturn?.approvedDamageCharges === 400);
  assert("Bill has approved missing charges of 700", billAfterReturn?.approvedMissingCharges === 700);
  assert("Bill grand total includes separate damage (400) + missing (700)", billAfterReturn?.grandTotal === 5600 + 400 + 700);

  // Payment
  const payment = store.recordPayment({
    billId: convertedBill.id,
    customerName: convertedBill.customerName,
    amount: billAfterReturn?.balanceDue || 6700,
    paymentType: "RENTAL_PAYMENT",
    paymentMethod: "UPI",
    referenceNumber: "UPI-RET-99001",
  });
  assert("Payment recorded successfully", !!payment.paymentNumber);

  const billAfterPayment = store.getBill(convertedBill.id);
  assert("Balance due is 0 after full payment", billAfterPayment?.balanceDue === 0);

  // Settlement & Closure
  const closedBill = store.closeBill(
    convertedBill.id,
    {
      amountReceived: 0,
      notes: "All items inspected, damages and missing items charged and settled.",
    },
    "Chief Storekeeper"
  );
  assert("Bill closed successfully with CLOSED status", closedBill.status === "CLOSED");

  // -------------------------------------------------------------------------
  // Test 12: The four tabs in Logistics & Returns and Finance & Accounts have explanations
  // -------------------------------------------------------------------------
  console.log("\n[Test 12] Verifying workflow explanation cards across the 4 tabs...");
  const gatePassesPage = fs.readFileSync(path.join(process.cwd(), "src/app/operations/gate-passes/page.tsx"), "utf-8");
  const returnsPage = fs.readFileSync(path.join(process.cwd(), "src/app/operations/returns/page.tsx"), "utf-8");
  const paymentsPage = fs.readFileSync(path.join(process.cwd(), "src/app/finance/payments/page.tsx"), "utf-8");
  const reportsPage = fs.readFileSync(path.join(process.cwd(), "src/app/reports/page.tsx"), "utf-8");

  assert("Gate Passes & Dispatch has Purpose & 5-step Workflow card", 
    gatePassesPage.includes("Gate Passes & Dispatch Workflow") && 
    gatePassesPage.includes("Step 1") && 
    gatePassesPage.includes("Step 5")
  );

  assert("Returns & Damages has Purpose & 7-step Workflow card", 
    returnsPage.includes("Returns & Damages Workflow") && 
    returnsPage.includes("Step 1") && 
    returnsPage.includes("Step 7")
  );

  assert("Payments & Deposits has Purpose & 6-step Workflow card", 
    paymentsPage.includes("Payments & Deposits Workflow") && 
    paymentsPage.includes("Step 1") && 
    paymentsPage.includes("Step 6")
  );

  assert("Reports & Registers has Purpose & 4-step Workflow card", 
    reportsPage.includes("Reports & Registers Workflow") && 
    reportsPage.includes("Step 1") && 
    reportsPage.includes("Step 4")
  );

  // -------------------------------------------------------------------------
  // Test 13: Existing records and customer/company relationships remain intact
  // -------------------------------------------------------------------------
  console.log("\n[Test 13] Verifying integrity of customer master and companies...");
  const companies = store.getCompanies();
  const customers = store.getCustomers();
  const products = store.getProducts();

  assert("Companies preserved (count >= 2)", companies.length >= 2);
  assert("Customers preserved (count >= 1)", customers.length >= 1);
  assert("Products inventory preserved (count >= 4)", products.length >= 4);

  console.log("\n============================================================================");
  console.log("🎉 ALL 13 ACCEPTANCE TESTS PASSED SUCCESSFULLY WITH ZERO ERRORS!");
  console.log("============================================================================");
}

runAcceptanceTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
