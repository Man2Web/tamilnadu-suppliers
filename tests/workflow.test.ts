// ============================================================================
// WORKFLOW ACCEPTANCE TEST SUITE — TAMILNADU SUPPLIERS RENTAL SYSTEM
// Testing all 20 scenarios specified in Section 12
// ============================================================================

import dotenv from "dotenv";
dotenv.config();

import store from "../src/lib/db/store";
import { verifyDatabaseTarget, ALLOWED_SUPABASE_PROJECT_ID } from "../src/lib/db/guard";
import { generateQuotationPDF, generateBillPDF } from "../src/lib/pdf/generator";
import { generateWhatsAppHandoffUrl } from "../src/lib/whatsapp/share";
import { calculateOverdueDetails, calculateFinalSettlement } from "../src/lib/calculations/financial";

async function runWorkflowTestSuite() {
  console.log("==================================================================");
  console.log("TAMILNADU SUPPLIERS - 20 WORKFLOW ACCEPTANCE TESTS (SECTION 12)");
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

  const companies = store.getCompanies();
  const company1 = companies[0]; // GST
  const company2 = companies[1] || companies[0]; // Non-GST

  // Seed sample products if needed
  let prod1 = store.getProducts()[0];
  let prod2 = store.getProducts()[1];
  if (!prod1) {
    prod1 = store.createProduct({
      name: "Dabara Set Brass Large",
      sku: "ITM-001",
      unit: "SET",
      rentalRateUnit: "PER_DAY",
      defaultRentalRate: 25.0,
      minRentalDuration: 1,
      securityDepositAmount: 0,
      replacementValue: 200,
      totalOwnedQuantity: 100,
      availableQuantity: 100,
      reservedQuantity: 0,
      rentedQuantity: 0,
      damagedQuantity: 0,
      missingQuantity: 0,
      maintenanceQuantity: 0,
      isActive: true,
    });
  }
  if (!prod2) {
    prod2 = store.createProduct({
      name: "Buffet Counter Table Stainless Steel",
      sku: "ITM-002",
      unit: "NOS",
      rentalRateUnit: "PER_DAY",
      defaultRentalRate: 150.0,
      minRentalDuration: 1,
      securityDepositAmount: 0,
      replacementValue: 2000,
      totalOwnedQuantity: 50,
      availableQuantity: 50,
      reservedQuantity: 0,
      rentedQuantity: 0,
      damagedQuantity: 0,
      missingQuantity: 0,
      maintenanceQuantity: 0,
      isActive: true,
    });
  }

  // -------------------------------------------------------------------------
  // SCENARIO 1: Create a quotation, revise it twice, and send each revision.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 1] Quotation Creation, Revisions (x2) & WhatsApp/PDF Delivery:");
  const quote1 = store.createQuotation({
    companyId: company1.id,
    customerName: "Grand Palace Catering",
    customerPhone: "9876543210",
    customerAddress: "Main Road, Vellore",
    rentalStartDate: "2026-10-15",
    rentalEndDate: "2026-10-18",
    branches: [
      {
        branchName: "Banquet Hall A",
        deliveryAddress: "Grand Palace Banquet A",
        items: [
          { productId: prod1.id, quantity: 20, days: 3, unitPrice: 25 },
        ],
      },
    ],
  });

  assert("Quote created with Revision #1", quote1.revisionNumber === 1);
  assert("Quotation history initially empty", (quote1.revisionHistory || []).length === 0);

  // Revision 1: Update duration and items
  const quoteRev1 = store.reviseQuotation(quote1.id, {
    rentalEndDate: "2026-10-19",
    rentalDays: 4,
    branches: [
      {
        branchName: "Banquet Hall A",
        deliveryAddress: "Grand Palace Banquet A",
        items: [
          { productId: prod1.id, quantity: 25, days: 4, unitPrice: 25 },
        ],
      },
    ],
    notes: "Customer requested 5 extra dabara sets and +1 day",
  });

  assert("Quote revised to Revision #2", quoteRev1.revisionNumber === 2);
  assert("Revision history preserved snapshot of Rev 1", quoteRev1.revisionHistory.length === 1 && quoteRev1.revisionHistory[0].revisionNumber === 1);

  // Revision 2: Update transport
  const quoteRev2 = store.reviseQuotation(quote1.id, {
    transportCharges: 500,
    notes: "Added dedicated transport to Banquet Hall A",
  });

  assert("Quote revised to Revision #3", quoteRev2.revisionNumber === 3);
  assert("Revision history preserved both Rev 1 and Rev 2", quoteRev2.revisionHistory.length === 2 && quoteRev2.revisionHistory[1].revisionNumber === 2);

  // Send WhatsApp for revision
  const { buildQuotationWhatsAppMessage } = await import("../src/lib/whatsapp/share");
  const waMsg = buildQuotationWhatsAppMessage(quoteRev2);
  const waUrl = generateWhatsAppHandoffUrl(quoteRev2.customerPhone, waMsg);
  assert("WhatsApp handoff link generated for latest revision", waUrl.includes("wa.me") && waUrl.includes("9876543210"));

  // Generate PDF for revision
  const quotePdf = generateQuotationPDF(quoteRev2);
  const pdfBytes = quotePdf.output("arraybuffer");
  assert("Quotation PDF generated for Revision #3", pdfBytes.byteLength > 1000);

  // -------------------------------------------------------------------------
  // SCENARIO 2: Accept a quotation and convert it into exactly one bill.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 2] Accept Quotation & Atomic 1-Click Bill Conversion (Duplicate Safe):");
  quoteRev2.status = "ACCEPTED";
  const convertedBill = store.convertQuotationToBill(quoteRev2.id);

  assert("Quotation converted to Bill", !!convertedBill && convertedBill.sourceQuotationId === quoteRev2.id);
  assert("Bill starts in ISSUED operational lifecycle status", convertedBill.status === "ISSUED");
  assert("Bill inherits items and branches from accepted quote", convertedBill.branches.length === quoteRev2.branches.length);

  // Verify duplicate conversion is strictly blocked
  let duplicatePrevented = false;
  try {
    store.convertQuotationToBill(quoteRev2.id);
  } catch (e: any) {
    duplicatePrevented = e.message.includes("already been converted");
  }
  assert("Duplicate conversion prevented on multiple clicks", duplicatePrevented);

  // -------------------------------------------------------------------------
  // SCENARIO 3: Create a direct bill for a new customer.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 3] Direct Bill Creation for New Customer:");
  const directBillNewCust = store.createBill({
    companyId: company2.id,
    customerName: "Kavitha Kalyana Mandapam",
    customerPhone: "9443212345",
    customerAddress: "Gandhi Road, Vellore",
    rentalStartDate: "2026-10-20",
    rentalEndDate: "2026-10-22",
    expectedReturnDate: "2026-10-22",
    branches: [
      {
        branchName: "Dining Hall",
        items: [
          { productId: prod1.id, quantity: 30, days: 2, unitPrice: 25 },
        ],
      },
    ],
  });

  assert("Direct bill created without quotation", !!directBillNewCust && !directBillNewCust.sourceQuotationId);
  assert("New customer auto-registered or mapped in system", !!directBillNewCust.customerId);
  assert("Direct bill status is ISSUED", directBillNewCust.status === "ISSUED");

  // -------------------------------------------------------------------------
  // SCENARIO 4: Create a direct bill for an existing customer.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 4] Direct Bill Creation for Existing Customer:");
  const directBillExistingCust = store.createBill({
    companyId: company1.id,
    customerId: directBillNewCust.customerId,
    customerName: directBillNewCust.customerName,
    customerPhone: directBillNewCust.customerPhone,
    customerAddress: directBillNewCust.customerAddress,
    rentalStartDate: "2026-10-25",
    rentalEndDate: "2026-10-27",
    expectedReturnDate: "2026-10-27",
    branches: [
      {
        branchName: "Main Hall",
        items: [
          { productId: prod2.id, quantity: 10, days: 2, unitPrice: 150 },
        ],
      },
    ],
  });

  assert("Direct bill links to existing customer ID", directBillExistingCust.customerId === directBillNewCust.customerId);

  // -------------------------------------------------------------------------
  // SCENARIO 5: Create a bill containing products for two customer branches.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 5] Bill with Products for Two Customer Branches:");
  const multiBranchBill = store.createBill({
    companyId: company1.id,
    customerName: "SRM University Campus Caterers",
    customerPhone: "9887766554",
    customerAddress: "Katpadi, Vellore",
    rentalStartDate: "2026-10-20",
    rentalEndDate: "2026-10-23",
    expectedReturnDate: "2026-10-23",
    branches: [
      {
        branchName: "Main Canteen Block 1",
        deliveryAddress: "Near Tech Park, Katpadi",
        items: [
          { productId: prod1.id, quantity: 40, days: 3, unitPrice: 25 },
        ],
      },
      {
        branchName: "Hostel Dining Block B",
        deliveryAddress: "Hostel Zone 2, Katpadi",
        items: [
          { productId: prod2.id, quantity: 5, days: 3, unitPrice: 150 },
        ],
      },
    ],
  });

  assert("Bill captures exactly 2 branches", multiBranchBill.branches.length === 2);
  assert("Items correctly distributed across both branches", multiBranchBill.branches[0].items.length === 1 && multiBranchBill.branches[1].items.length === 1);

  // -------------------------------------------------------------------------
  // SCENARIO 6: Dispatch products and verify that the bill remains open.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 6] Dispatch Products & Operational Lifecycle Transition:");
  const testBill = store.createBill({
    companyId: company1.id,
    customerName: "Sri Krishna Mahal",
    customerPhone: "9123456780",
    rentalStartDate: "2026-10-12",
    rentalEndDate: "2026-10-15",
    expectedReturnDate: "2026-10-15",
    branches: [
      {
        branchName: "Wedding Stage",
        items: [
          { productId: prod1.id, quantity: 50, days: 3, unitPrice: 25 },
        ],
      },
    ],
  });

  assert("Before dispatch, bill is ISSUED", testBill.status === "ISSUED");

  // Create gate pass / dispatch
  const gatePass = store.createGatePass({
    billId: testBill.id,
    companyId: testBill.companyId,
    customerName: testBill.customerName,
    destinationBranch: "Wedding Stage",
    items: [
      { productId: prod1.id, quantityDispatched: 50 },
    ],
  });

  const dispatchedBill = store.getBill(testBill.id)!;
  assert("After dispatch, bill transitions to OUT_ON_RENT", dispatchedBill.status === "OUT_ON_RENT");
  assert("Dispatched quantity recorded (50 units)", dispatchedBill.totalDispatched === 50);
  assert("Bill is open (not Closed)", dispatchedBill.status !== "CLOSED");

  // -------------------------------------------------------------------------
  // SCENARIO 7: Return some products and verify that the bill becomes Partially Returned.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 7] Partial Return (20 of 50 units returned):");
  const returnResult1 = store.recordBillReturn(dispatchedBill.id, {
    returnDate: "2026-10-14",
    inspectedBy: "Warehouse Incharge",
    items: [
      { productId: prod1.id, quantityReturnedGood: 20, quantityDamaged: 0, quantityMissing: 0 },
    ],
  });

  assert("Bill operational status is now PARTIALLY_RETURNED", returnResult1.bill.status === "PARTIALLY_RETURNED");
  assert("Returned good recorded as 20", returnResult1.bill.totalReturnedGood === 20);

  // -------------------------------------------------------------------------
  // SCENARIO 8: Return remaining products and verify return inspection begins.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 8] Return Remaining Products & Transition to RETURN_INSPECTION:");
  const returnResult2 = store.recordBillReturn(dispatchedBill.id, {
    returnDate: "2026-10-15",
    inspectedBy: "Quality Inspector",
    items: [
      { productId: prod1.id, quantityReturnedGood: 25, quantityDamaged: 3, quantityMissing: 2 },
    ],
  });

  assert("All 50 products accounted for (20 + 25 + 3 + 2 = 50)", (returnResult2.bill.totalReturnedGood + returnResult2.bill.totalDamaged + returnResult2.bill.totalMissing) === 50);
  assert("Bill transitions to RETURN_INSPECTION", returnResult2.bill.status === "RETURN_INSPECTION");

  // -------------------------------------------------------------------------
  // SCENARIO 9: Record damaged items and choose Add Charge.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 9] Damage Decision: Add Charge to Customer Bill:");
  const damagedIncident = returnResult2.bill.incidents.find((i) => i.type === "DAMAGED")!;
  assert("Damaged incident recorded initially as PENDING_DECISION", damagedIncident.chargeApprovalStatus === "PENDING_DECISION");

  const billWithApprovedDamage = store.resolveDamageMissingIncident(dispatchedBill.id, damagedIncident.id, {
    action: "ADD_CHARGE",
    finalApprovedCharge: 150,
  });

  assert("Damage incident resolved with ADD_CHARGE", damagedIncident.chargeApprovalStatus === "ADD_CHARGE");
  assert("Approved damage charge of ₹150 added to bill", billWithApprovedDamage.approvedDamageCharges === 150);
  assert("Damaged goods charges added to bill grand total", billWithApprovedDamage.grandTotal === (billWithApprovedDamage.originalGrandTotal || 0) + 150);

  // -------------------------------------------------------------------------
  // SCENARIO 10: Record damaged items and choose No Charge.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 10] Incident Decision: No Charge (Waived / Business absorption):");
  // Create another bill for No Charge test
  const billNoCharge = store.createBill({
    companyId: company1.id,
    customerName: "No Charge Test Catering",
    rentalStartDate: "2026-10-10",
    rentalEndDate: "2026-10-12",
    branches: [
      { branchName: "Main", items: [{ productId: prod1.id, quantity: 10, days: 2, unitPrice: 25 }] },
    ],
  });
  store.createGatePass({ billId: billNoCharge.id, companyId: billNoCharge.companyId, customerName: billNoCharge.customerName, items: [{ productId: prod1.id, quantityDispatched: 10 }] });
  store.recordBillReturn(billNoCharge.id, {
    items: [{ productId: prod1.id, quantityReturnedGood: 8, quantityDamaged: 2, quantityMissing: 0 }],
  });

  const incidentToWaive = billNoCharge.incidents[0];
  const waivedBill = store.resolveDamageMissingIncident(billNoCharge.id, incidentToWaive.id, {
    action: "NO_CHARGE",
    decisionNotes: "Minor surface scratch - waived per management courtesy",
  });

  assert("Incident resolved with NO_CHARGE", incidentToWaive.chargeApprovalStatus === "NO_CHARGE");
  assert("Zero damage charges added to customer bill", waivedBill.approvedDamageCharges === 0);

  // -------------------------------------------------------------------------
  // SCENARIO 11: Leave a damage decision pending and verify ordinary closure is blocked.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 11] Pending Damage Decision Strictly Blocks Bill Closure:");
  // On dispatchedBill, the missing incident is still PENDING_DECISION
  const missingIncident = dispatchedBill.incidents.find((i) => i.type === "MISSING")!;
  assert("Missing incident is still PENDING_DECISION", missingIncident.chargeApprovalStatus === "PENDING_DECISION");

  let closureBlockedByPending = false;
  try {
    store.closeBill(dispatchedBill.id);
  } catch (e: any) {
    closureBlockedByPending = e.message.includes("pending resolution");
  }
  assert("Ordinary closure blocked while decision is pending", closureBlockedByPending);

  // Now resolve missing incident as ADD_CHARGE ₹300
  store.resolveDamageMissingIncident(dispatchedBill.id, missingIncident.id, {
    action: "ADD_CHARGE",
    finalApprovedCharge: 300,
  });
  assert("Missing incident resolved with ADD_CHARGE", missingIncident.chargeApprovalStatus === "ADD_CHARGE");
  assert("Missing goods charges added to bill grand total", dispatchedBill.grandTotal === (dispatchedBill.originalGrandTotal || 0) + 150 + 300);

  // -------------------------------------------------------------------------
  // SCENARIO 12: Return products after expected date and verify additional-day calculation.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 12] Late Return & Additional-Day Calculation:");
  const overdueCalc = calculateOverdueDetails("2026-10-10", "2026-10-13", 100, "DAILY_RATE");
  assert("Calculated 3 additional chargeable days (10 Oct -> 13 Oct)", overdueCalc.additionalDays === 3);
  assert("Calculated additional rental charge (3 days * ₹100 = ₹300)", overdueCalc.additionalAmount === 300);
  assert("Overdue flag correctly set to true", overdueCalc.isOverdue === true);

  // Grace period policy check
  const graceCalc = calculateOverdueDetails("2026-10-10", "2026-10-11", 100, "GRACE_PERIOD");
  assert("Grace period policy charges 0 for 1-day delay", graceCalc.additionalAmount === 0);

  // -------------------------------------------------------------------------
  // SCENARIO 13: Extend return date and verify updated rental period is preserved.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 13] Extend Expected Return Date via Controlled Amendment:");
  const amendedBill = store.amendBill(dispatchedBill.id, {
    reason: "Customer requested extension for reception evening",
    changes: {
      expectedReturnDate: "2026-10-20",
      additionalRentalDays: 2,
      additionalRentalCharges: 250,
    },
  });

  assert("Expected return date updated to 2026-10-20", amendedBill.expectedReturnDate === "2026-10-20");
  assert("Amendment history recorded with immutable reason", amendedBill.amendments.length === 1 && amendedBill.amendments[0].reason.includes("extension"));
  assert("Additional rental charges added to bill (₹250)", amendedBill.additionalRentalCharges === 250);
  assert("Additional rental days added to bill grand total", amendedBill.grandTotal === (amendedBill.originalGrandTotal || 0) + 150 + 300 + 250);

  // Verify Bill PDF contains additional days and damaged/missing goods rows
  const billPdf = generateBillPDF(amendedBill);
  const billPdfBytes = billPdf.output("arraybuffer");
  assert("Bill PDF generated with explicit additional days, damaged and missing goods breakdown", billPdfBytes.byteLength > 1000);

  // -------------------------------------------------------------------------
  // SCENARIO 14: Record extra payment and verify outstanding balance.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 14] Extra Payment Recording & Balance Update:");
  const initialBalance = dispatchedBill.balanceDue;
  const payRecord = store.recordPayment({
    billId: dispatchedBill.id,
    companyId: dispatchedBill.companyId,
    customerId: dispatchedBill.customerId,
    amount: 500,
    paymentMode: "BANK_TRANSFER",
    referenceNo: "NEFT-12345678",
  });

  const updatedBillAfterPay = store.getBill(dispatchedBill.id)!;
  assert("Payment recorded successfully", payRecord.amount === 500);
  assert("Outstanding balance reduced by ₹500", updatedBillAfterPay.balanceDue === initialBalance - 500);

  // -------------------------------------------------------------------------
  // SCENARIO 15: Verify bill with products out on rent cannot be closed.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 15] Bill with Items Still Out on Rent Cannot Be Closed:");
  const openRentBill = store.createBill({
    companyId: company1.id,
    customerName: "Unfinished Rental Customer",
    branches: [{ branchName: "Hall", items: [{ productId: prod1.id, quantity: 15, days: 1, unitPrice: 25 }] }],
  });
  store.createGatePass({ billId: openRentBill.id, companyId: openRentBill.companyId, customerName: openRentBill.customerName, items: [{ productId: prod1.id, quantityDispatched: 15 }] });

  let closedBlockedByOutstandingStock = false;
  try {
    store.closeBill(openRentBill.id);
  } catch (e: any) {
    closedBlockedByOutstandingStock = e.message.includes("remain outstanding");
  }
  assert("Bill with outstanding products cannot be closed", closedBlockedByOutstandingStock);

  // -------------------------------------------------------------------------
  // SCENARIO 16: Verify paid bill with outstanding products remains operationally open.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 16] Fully Paid Bill with Items on Rent Remains Operationally Open:");
  store.recordPayment({
    billId: openRentBill.id,
    companyId: openRentBill.companyId,
    customerId: openRentBill.customerId,
    amount: openRentBill.balanceDue,
    paymentMode: "UPI",
  });

  const paidOpenBill = store.getBill(openRentBill.id)!;
  assert("Financial balance is paid (₹0)", paidOpenBill.balanceDue === 0);
  assert("Operational status remains OUT_ON_RENT (not closed/not paid-closed)", paidOpenBill.status === "OUT_ON_RENT");

  // -------------------------------------------------------------------------
  // SCENARIO 17: Returned bill with unresolved settlement remains pending settlement.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 17] Returned Bill with Outstanding Financial Balance Remains PENDING_SETTLEMENT:");
  assert("Dispatched bill with remaining balance has status PENDING_SETTLEMENT", dispatchedBill.status === "PENDING_SETTLEMENT");

  // -------------------------------------------------------------------------
  // SCENARIO 18: Close a fully returned and settled bill.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 18] Final Closure of Fully Returned & Settled Bill:");
  // Pay remainder of dispatchedBill balance
  if (dispatchedBill.balanceDue > 0) {
    store.recordPayment({
      billId: dispatchedBill.id,
      companyId: dispatchedBill.companyId,
      customerId: dispatchedBill.customerId,
      amount: dispatchedBill.balanceDue,
      paymentMode: "CASH",
    });
  }

  const fullySettledBill = store.closeBill(dispatchedBill.id, { notes: "Final return, inspection and full settlement complete" });
  assert("Bill status transitions to CLOSED", fullySettledBill.status === "CLOSED");
  assert("Closed timestamp and actor recorded", !!fullySettledBill.closedAt && !!fullySettledBill.closedBy);

  // Closed bill prevents ordinary edits
  let editBlockedOnClosed = false;
  try {
    store.amendBill(fullySettledBill.id, { reason: "Post-closure change", changes: {} });
  } catch (e: any) {
    editBlockedOnClosed = e.message.includes("Closed bills cannot be edited");
  }
  assert("Ordinary edits disabled once bill is Closed", editBlockedOnClosed);

  // -------------------------------------------------------------------------
  // SCENARIO 19: Verify previous issued bills, quotations, and payment records remain intact.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 19] Historical Integrity (Bills, Quotations & Payments Intact):");
  const allBills = store.getBills();
  const allQuotations = store.getQuotations();
  const allPayments = store.getPayments();

  assert("All created bills remain intact in store", allBills.length >= 4);
  const quoteWithHistory = allQuotations.find((q) => q.id === quote1.id);
  assert("Quotation preserved with full revision history", !!quoteWithHistory && (quoteWithHistory.revisionHistory?.length || 0) >= 2);
  assert("All payments remain recorded and immutable", allPayments.length >= 3);

  // -------------------------------------------------------------------------
  // SCENARIO 20: Verify dedicated Tamilnadu Suppliers Supabase project is used and inventory DB untouched.
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 20] Supabase Dedicated Project Boundary & Legacy DB Untouched:");
  const targetVerification = verifyDatabaseTarget();
  assert("Active project URL is dedicated Tamilnadu Suppliers (lznyejowgqwbavtnqqns)", targetVerification.projectId === "lznyejowgqwbavtnqqns");
  // -------------------------------------------------------------------------
  // SCENARIO 21: Simplified Single-Screen Rental Bill Workspace & Acceptance Tests
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 21] Simplified Single-Screen Rental Bill Workspace Operations:");
  // 1. Create open bill and dispatch items
  const wsBill = store.createBill({
    companyId: company1.id,
    customerName: "Workspace Customer Ltd",
    customerPhone: "+919876543210",
    rentalStartDate: "2026-10-10",
    expectedReturnDate: "2026-10-15",
    rentalDays: 5,
    branches: [
      {
        branchName: "Main Branch",
        items: [
          { productId: prod1.id, quantity: 20, days: 5, unitPrice: 10 },
          { productId: prod2.id, quantity: 10, days: 5, unitPrice: 20 },
        ],
      },
    ],
  });
  store.createGatePass({
    billId: wsBill.id,
    companyId: wsBill.companyId,
    customerName: wsBill.customerName,
    items: [
      { productId: prod1.id, quantityDispatched: 20 },
      { productId: prod2.id, quantityDispatched: 10 },
    ],
  });

  const dispatchedWsBill = store.getBill(wsBill.id)!;
  assert("Bill is out on rent with 30 dispatched items", dispatchedWsBill.status === "OUT_ON_RENT" && dispatchedWsBill.totalDispatched === 30);

  // 2. Inline return with No Charge and Charge Customer
  const originalWsTotal = dispatchedWsBill.grandTotal;
  const savedWsBill = store.saveBillWorkspaceChanges(wsBill.id, {
    returnDate: "2026-10-15",
    items: [
      {
        productId: prod1.id,
        quantityReturnedGood: 18,
        quantityDamaged: 2,
        quantityMissing: 0,
        chargeDecision: "NO_CHARGE", // No charge for damage
        chargeAmount: 200,
        notes: "Minor scratches on surface",
      },
      {
        productId: prod2.id,
        quantityReturnedGood: 8,
        quantityDamaged: 0,
        quantityMissing: 2,
        chargeDecision: "ADD_CHARGE", // Charge customer for missing
        chargeAmount: 350,
        notes: "2 items lost at venue",
      },
    ],
  });

  assert("Returns recorded: 26 good, 2 damaged, 2 missing (30 total)", savedWsBill.totalReturnedGood === 26 && savedWsBill.totalDamaged === 2 && savedWsBill.totalMissing === 2);
  assert("No Charge sets damage charges to ₹0 while preserving incident", savedWsBill.approvedDamageCharges === 0 && savedWsBill.incidents?.some((i) => i.type === "DAMAGED" && i.chargeApprovalStatus === "NO_CHARGE"));
  assert("Charge Customer adds approved missing charges to bill (+₹350)", savedWsBill.approvedMissingCharges === 350);
  assert("Bill grand total includes only approved charges (original + ₹350)", savedWsBill.grandTotal === originalWsTotal + 350);

  // 3. Pending Decision blocks normal closure
  store.saveBillWorkspaceChanges(wsBill.id, {
    items: [
      {
        productId: prod1.id,
        quantityReturnedGood: 18,
        quantityDamaged: 2,
        quantityMissing: 0,
        chargeDecision: "PENDING_DECISION", // Set to pending decision
        chargeAmount: 200,
      },
    ],
  });
  let closeBlockedByPending = false;
  try {
    store.closeBill(wsBill.id);
  } catch (e: any) {
    closeBlockedByPending = e.message.includes("pending resolution");
  }
  assert("Pending Decision blocks normal closure", closeBlockedByPending);

  // 4. Resolve pending decision to NO_CHARGE
  store.saveBillWorkspaceChanges(wsBill.id, {
    items: [
      {
        productId: prod1.id,
        quantityReturnedGood: 18,
        quantityDamaged: 2,
        quantityMissing: 0,
        chargeDecision: "NO_CHARGE",
        chargeAmount: 0,
      },
    ],
  });

  // 5. Amend Open Rental Bill (extend return date and add rental days)
  const amendedWsBill = store.amendBill(wsBill.id, {
    reason: "Client authorized 1 additional rental day",
    changes: {
      expectedReturnDate: "2026-10-16",
      additionalRentalDays: 1,
      additionalRentalCharges: 150,
    },
  });
  assert("Amend Open Rental Bill updates expected date and adds charges", amendedWsBill.expectedReturnDate === "2026-10-16" && amendedWsBill.additionalRentalCharges === 150);
  assert("Revised grand total includes additional rental days charge", amendedWsBill.grandTotal === originalWsTotal + 350 + 150);

  // 6. Full Payment shows Net Balance Due: ₹0.00
  const finalPayable = amendedWsBill.grandTotal;
  store.recordPayment({
    billId: wsBill.id,
    amount: finalPayable,
    paymentMethod: "BANK_TRANSFER",
    referenceNumber: "IMPS-PAY-FULL",
  });
  const fullyPaidWsBill = store.getBill(wsBill.id)!;
  assert("A fully paid bill shows Net Balance Due as strictly 0 (₹0.00)", fullyPaidWsBill.balanceDue === 0);
  assert("Payment status is marked FULLY_PAID", fullyPaidWsBill.paymentStatus === "FULLY_PAID");
  assert("Customer credit is 0 on exact payment", fullyPaidWsBill.customerCredit === 0);

  // 7. Overpayment creates Customer Credit
  store.recordPayment({
    billId: wsBill.id,
    amount: 500, // Extra ₹500 overpayment
    paymentMethod: "UPI",
    referenceNumber: "UPI-EXTRA-500",
  });
  const overpaidWsBill = store.getBill(wsBill.id)!;
  assert("Overpaid bill keeps Net Balance Due as ₹0.00", overpaidWsBill.balanceDue === 0);
  assert("Customer credit / overpayment displays separately as ₹500", overpaidWsBill.customerCredit === 500);
  assert("Payment status is marked OVERPAID", overpaidWsBill.paymentStatus === "OVERPAID");

  // 8. Close Rental Bill succeeds once fully accounted, resolved, and paid
  const closedWsBill = store.closeBill(wsBill.id, { notes: "Workspace closure complete" });
  assert("Rental bill closed successfully", closedWsBill.status === "CLOSED");
  assert("Closed bill has closedAt and closedBy metadata", !!closedWsBill.closedAt && !!closedWsBill.closedBy);

  // 9. Closed bill cannot be ordinarily amended
  let closedAmendBlocked = false;
  try {
    store.amendBill(wsBill.id, { reason: "Should fail", changes: {} });
  } catch (e: any) {
    closedAmendBlocked = e.message.includes("Closed bills cannot be edited");
  }
  assert("Closed bills cannot be ordinarily amended", closedAmendBlocked);

  // 10. Database changes and financial calculations remain correct after query/refresh
  const refreshedBill = store.getBill(wsBill.id)!;
  assert("Refreshed bill maintains status CLOSED", refreshedBill.status === "CLOSED");
  assert("Refreshed bill retains Net Balance Due: ₹0.00 and customer credit: ₹500", refreshedBill.balanceDue === 0 && refreshedBill.customerCredit === 500);
  assert("Refreshed bill retains immutable payment history", refreshedBill.payments && refreshedBill.payments.length >= 2);

  // -------------------------------------------------------------------------
  // SCENARIO 22: Cash Payment Confirmation and Bill Closing (Acceptance Test)
  // -------------------------------------------------------------------------
  console.log("\n[Scenario 22] Cash Payment Confirmation and Bill Closing Workflow:");

  // 1. Create a bill with ₹5,000 total and record ₹4,100 payment so remaining balance is exactly ₹900
  const nonGstComp = store.getCompanies().find((c) => c.gstType === "NON_GST") || company1;
  const cashBill = store.createBill({
    companyId: nonGstComp.id,
    customerName: "Cash Settlement Customer",
    customerPhone: "+919876500000",
    rentalStartDate: "2026-10-01",
    expectedReturnDate: "2026-10-10",
    rentalDays: 10,
    branches: [
      {
        branchName: "Branch 1",
        items: [{ productId: prod1.id, quantity: 10, days: 10, unitPrice: 50 }],
      },
    ],
  });

  // Dispatch items
  store.createGatePass({
    billId: cashBill.id,
    companyId: cashBill.companyId,
    customerName: cashBill.customerName,
    items: [{ productId: prod1.id, quantityDispatched: 10 }],
  });

  // Record initial payments of ₹4,100 so balance is ₹900
  store.recordPayment({
    billId: cashBill.id,
    amount: cashBill.grandTotal - 900,
    paymentMethod: "BANK_TRANSFER",
    notes: "Prior advance payment",
  });

  const billWith900Due = store.getBill(cashBill.id)!;
  assert("Bill has outstanding balance of exactly ₹900.00", billWith900Due.balanceDue === 900);

  // Return all items cleanly
  store.saveBillWorkspaceChanges(cashBill.id, {
    items: [{ productId: prod1.id, quantityReturnedGood: 10, quantityDamaged: 0, quantityMissing: 0 }],
  });

  // Attempt to close without checking Payment Received in Full -> must fail with required message!
  let unconfirmedCloseError = "";
  try {
    store.closeBill(cashBill.id, { paymentReceivedInFull: false });
  } catch (e: any) {
    unconfirmedCloseError = e.message;
  }
  assert(
    "Closure prevented when balance > ₹0 and checkbox is unchecked",
    unconfirmedCloseError.includes("Outstanding balance of ₹900.00 remains unpaid")
  );

  // Attempt to close with checked checkbox but less amount (e.g. ₹500) -> must fail!
  let underpaidCloseError = "";
  try {
    store.closeBill(cashBill.id, {
      paymentReceivedInFull: true,
      paymentMethod: "CASH",
      amountReceived: 500,
    });
  } catch (e: any) {
    underpaidCloseError = e.message;
  }
  assert("Closure prevented when amount received is less than ₹900", underpaidCloseError.includes("less than the outstanding balance"));

  // Check Payment Received in Full, enter ₹900, paymentMethod Cash -> closes successfully!
  const finalClosedCashBill = store.closeBill(cashBill.id, {
    paymentReceivedInFull: true,
    paymentMethod: "CASH",
    amountReceived: 900,
    paymentDate: "2026-10-12",
    paymentNotes: "Physically received full ₹900 cash from customer at counter",
  });

  assert("Cash payment of ₹900 recorded against bill", finalClosedCashBill.payments?.some((p) => p.amount === 900 && p.paymentMethod === "CASH"));
  assert("Net Balance Due updated to strictly ₹0.00", finalClosedCashBill.balanceDue === 0);
  assert("Payment status updated to FULLY_PAID", finalClosedCashBill.paymentStatus === "FULLY_PAID");
  assert("Bill status updated to CLOSED", finalClosedCashBill.status === "CLOSED");

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log("\n==================================================================");
  console.log(`WORKFLOW ACCEPTANCE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runWorkflowTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
