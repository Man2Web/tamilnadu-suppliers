import store from "../src/lib/db/store";
import { generateBillPDF } from "../src/lib/pdf/generator";
import { calculateFinalSettlement } from "../src/lib/calculations/financial";

function assert(description: string, condition: boolean) {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    throw new Error(`Assertion failed: ${description}`);
  }
}

async function runEnhancementTests() {
  console.log("==================================================================");
  console.log("TAMILNADU SUPPLIERS — RENTAL BILL ENHANCEMENTS VERIFICATION SUITE");
  console.log("==================================================================");

  // -------------------------------------------------------------------------
  // 1. Independent Damage and Missing Item Charges (₹600 + ₹900 = ₹1,500)
  // -------------------------------------------------------------------------
  const nonGstCompany = store.getCompanies().find((c) => c.gstType === "NON_GST") || store.getCompanies()[0];
  const testBill = store.createBill({
    companyId: nonGstCompany.id,
    customerName: "VIT University — Tech Fest",
    customerPhone: "9842100000",
    customerAddress: "VIT Campus, Katpadi, Vellore",
    deliveryLocation: "VIT College — Main Campus",
    eventName: "Riviera 2026",
    rentalStartDate: "2026-10-15",
    rentalEndDate: "2026-10-16",
    rentalDays: 1,
    agreedRentalRate: 3000,
    branches: [
      {
        branchName: "Riviera Main Stage",
        deliveryLocation: "VIT College — Main Auditorium",
        items: [
          {
            productId: "p1",
            itemName: "LED Stage",
            sizeSpec: "4*18",
            quantity: 5,
            days: 1,
            unitPrice: 300,
            amount: 1500,
            deliveryLocation: "VIT College — Main Auditorium",
          },
          {
            productId: "p2",
            itemName: "Chair With Cover",
            sizeSpec: "Standard",
            quantity: 75,
            days: 1,
            unitPrice: 20,
            amount: 1500,
            deliveryLocation: "VIT College — Seminar Hall",
          },
        ],
      },
    ],
  });

  assert("Test bill created successfully with base rental charges ₹3,000", testBill.grandTotal === 3000);

  // Dispatch items so they are active on rent
  const gp = store.createGatePass({
    companyId: testBill.companyId,
    billId: testBill.id,
    customerName: testBill.customerName,
    items: [
      { productId: "p1", itemName: "LED Stage", quantityDispatched: 5 },
      { productId: "p2", itemName: "Chair With Cover", quantityDispatched: 75 },
    ],
  });
  testBill.totalDispatched = 80;
  testBill.status = "OUT_ON_RENT";
  store.saveState((store as any).state);

  // Edit return row with independent damage and missing charges
  // Product 1: 5 dispatched -> 3 returned good, 1 damaged (@ ₹600), 1 missing (@ ₹900)
  const savedBill = store.saveBillWorkspaceChanges(testBill.id, {
    items: [
      {
        id: testBill.branches[0].items[0].id,
        productId: "p1",
        itemName: "LED Stage",
        quantityReturnedGood: 3,
        quantityDamaged: 1,
        damageChargeDecision: "ADD_CHARGE",
        damageChargeAmount: 600,
        damageNotes: "Edge chipped during stage disassembly",
        quantityMissing: 1,
        missingChargeDecision: "ADD_CHARGE",
        missingChargeAmount: 900,
        missingNotes: "One piece missing from stage module",
        pickupLocation: "VIT College — Main Auditorium Loading Dock",
      },
      {
        id: testBill.branches[0].items[1].id,
        productId: "p2",
        itemName: "Chair With Cover",
        quantityReturnedGood: 75,
        quantityDamaged: 0,
        damageChargeDecision: "NO_CHARGE",
        damageChargeAmount: 0,
        quantityMissing: 0,
        missingChargeDecision: "NO_CHARGE",
        missingChargeAmount: 0,
        pickupLocation: "VIT College — Seminar Hall",
      },
    ],
  });

  assert("Damage charge recorded independently as ₹600", savedBill.approvedDamageCharges === 600);
  assert("Missing charge recorded independently as ₹900", savedBill.approvedMissingCharges === 900);
  assert(
    "Combined additional charge is ₹1,500 (₹600 damage + ₹900 missing)",
    (savedBill.approvedDamageCharges || 0) + (savedBill.approvedMissingCharges || 0) === 1500
  );
  assert(
    "Revised bill grand total is ₹4,500 (₹3,000 rental + ₹600 damage + ₹900 missing)",
    savedBill.grandTotal === 4500
  );

  // -------------------------------------------------------------------------
  // 3. Independent Charge Decisions (No Charge retains record, sets amount to ₹0)
  // -------------------------------------------------------------------------
  console.log("\n[Test 3] No Charge decision waives amount but retains incident record:");
  const billWithNoCharge = store.saveBillWorkspaceChanges(testBill.id, {
    items: [
      {
        id: testBill.branches[0].items[0].id,
        productId: "p1",
        itemName: "LED Stage",
        quantityReturnedGood: 3,
        quantityDamaged: 1,
        damageChargeDecision: "NO_CHARGE", // Waived damage charge
        damageChargeAmount: 600,
        damageNotes: "Minor scrape, waived by management",
        quantityMissing: 1,
        missingChargeDecision: "ADD_CHARGE",
        missingChargeAmount: 900,
        missingNotes: "One piece missing from stage module",
      },
    ],
  });

  assert(
    "Damage charge is waived to ₹0 when decision is NO_CHARGE",
    billWithNoCharge.approvedDamageCharges === 0
  );
  assert(
    "Missing charge remains ₹900",
    billWithNoCharge.approvedMissingCharges === 900
  );
  const damageIncident = billWithNoCharge.incidents?.find(
    (i) => i.productId === "p1" && i.type === "DAMAGED"
  );
  assert("Damage incident record is preserved in bill incidents", !!damageIncident);
  assert("Incident charge approval status is NO_CHARGE", damageIncident?.chargeApprovalStatus === "NO_CHARGE");
  assert("Incident final approved charge is 0", damageIncident?.finalApprovedCharge === 0);

  // -------------------------------------------------------------------------
  // 4. Pending Charge Decision Blocks Bill Closure
  // -------------------------------------------------------------------------
  console.log("\n[Test 4] Pending Charge Decision handling during Bill Closure:");
  const billWithPending = store.saveBillWorkspaceChanges(testBill.id, {
    items: [
      {
        id: testBill.branches[0].items[0].id,
        productId: "p1",
        itemName: "LED Stage",
        quantityReturnedGood: 3,
        quantityDamaged: 1,
        damageChargeDecision: "PENDING_DECISION", // Pending
        damageChargeAmount: 600,
        damageNotes: "Under management review",
        quantityMissing: 1,
        missingChargeDecision: "ADD_CHARGE",
        missingChargeAmount: 900,
      },
    ],
  });

  assert(
    "Pending damage charge is excluded from approved damage charges",
    billWithPending.approvedDamageCharges === 0
  );

  let closureBlocked = false;
  try {
    store.closeBill(testBill.id, { paymentReceivedInFull: true, amountReceived: 3900 });
  } catch (err: any) {
    closureBlocked = true;
    assert("Normal bill closure blocked when decisions are pending", err.message.includes("pending"));
  }
  assert("Bill closure attempt was strictly prevented", closureBlocked);

  // -------------------------------------------------------------------------
  // 5. Auto-Save and Concurrency Validation (No save button required)
  // -------------------------------------------------------------------------
  console.log("\n[Test 5] Auto-save Persistence and State Consistency:");
  // Re-approve both charges to test auto-save flow
  const autoSaved = store.saveBillWorkspaceChanges(testBill.id, {
    deliveryLocation: "VIT College — Updated Campus Sector 4",
    eventName: "Riviera 2026 Cultural Fest",
    items: [
      {
        id: testBill.branches[0].items[0].id,
        productId: "p1",
        itemName: "LED Stage",
        quantityReturnedGood: 3,
        quantityDamaged: 1,
        damageChargeDecision: "ADD_CHARGE",
        damageChargeAmount: 600,
        quantityMissing: 1,
        missingChargeDecision: "ADD_CHARGE",
        missingChargeAmount: 900,
        pickupLocation: "Auditorium Side Bay",
      },
    ],
  });

  assert("Auto-save persisted updated delivery location", autoSaved.deliveryLocation === "VIT College — Updated Campus Sector 4");
  assert("Auto-save persisted updated event name", autoSaved.eventName === "Riviera 2026 Cultural Fest");
  assert("Auto-saved damage charge is ₹600", autoSaved.approvedDamageCharges === 600);
  assert("Auto-saved missing charge is ₹900", autoSaved.approvedMissingCharges === 900);

  // -------------------------------------------------------------------------
  // 6. Net Balance Due and Financial Recalculation Test
  // -------------------------------------------------------------------------
  console.log("\n[Test 6 & 10] Financial Calculation Accuracy (Rental ₹3,000 + Damage ₹600 + Missing ₹900 = ₹4,500):");
  assert("Grand total is exactly ₹4,500", autoSaved.grandTotal === 4500);

  // Record payment of ₹3,000
  store.recordPayment({
    billId: testBill.id,
    companyId: testBill.companyId,
    customerId: testBill.customerId,
    customerName: testBill.customerName,
    amount: 3000,
    paymentDate: "2026-10-15",
    paymentMethod: "BANK_TRANSFER",
    paymentType: "RENTAL_PAYMENT",
    notes: "Initial rental payment",
  });

  const refreshedBill = store.getBill(testBill.id)!;
  assert("Payments recorded total ₹3,000", refreshedBill.amountPaid === 3000);
  assert(
    "Net Balance Due is exactly ₹1,500 (₹4,500 payable - ₹3,000 paid)",
    refreshedBill.balanceDue === 1500
  );
  assert("Payment status is PARTIALLY_PAID", refreshedBill.paymentStatus === "PARTIALLY_PAID");

  // Record remaining ₹1,500 payment to test full payment
  store.recordPayment({
    billId: testBill.id,
    companyId: testBill.companyId,
    customerId: testBill.customerId,
    customerName: testBill.customerName,
    amount: 1500,
    paymentDate: "2026-10-16",
    paymentMethod: "CASH",
    paymentType: "RENTAL_PAYMENT",
    notes: "Settlement of damage and missing charges",
  });

  const fullyPaidBill = store.getBill(testBill.id)!;
  assert("Fully paid bill shows Net Balance Due strictly ₹0.00", fullyPaidBill.balanceDue === 0);
  assert("Payment status is FULLY_PAID", fullyPaidBill.paymentStatus === "FULLY_PAID");

  // Overpayment test
  store.recordPayment({
    billId: testBill.id,
    companyId: testBill.companyId,
    customerId: testBill.customerId,
    customerName: testBill.customerName,
    amount: 500,
    paymentDate: "2026-10-16",
    paymentMethod: "CASH",
    paymentType: "RENTAL_PAYMENT",
    notes: "Customer overpayment",
  });

  const overpaidBill = store.getBill(testBill.id)!;
  assert("Overpaid bill keeps Net Balance Due strictly ₹0.00", overpaidBill.balanceDue === 0);
  assert("Overpaid bill tracks customer credit of ₹500 separately", overpaidBill.customerCredit === 500);
  assert("Payment status is OVERPAID", overpaidBill.paymentStatus === "OVERPAID");

  // -------------------------------------------------------------------------
  // 7. Unit Accounting Validation (Physical unit cannot be both good and damaged/missing)
  // -------------------------------------------------------------------------
  console.log("\n[Test 7] Unit Consistency Validation (Over-accounting rejection):");
  let overAccountingCaught = false;
  try {
    store.saveBillWorkspaceChanges(testBill.id, {
      items: [
        {
          id: testBill.branches[0].items[0].id,
          productId: "p1",
          itemName: "LED Stage",
          quantityReturnedGood: 4, // 4 good + 1 damaged + 1 missing = 6 (dispatched is 5!)
          quantityDamaged: 1,
          quantityMissing: 1,
        },
      ],
    });
  } catch (err: any) {
    overAccountingCaught = true;
    assert("Over-accounting error triggered", err.message.includes("cannot exceed dispatched quantity"));
  }
  assert("System strictly rejects physical unit over-accounting", overAccountingCaught);

  // -------------------------------------------------------------------------
  // 8 & 9. Multi-location support and PDF Generation
  // -------------------------------------------------------------------------
  console.log("\n[Test 8 & 9] Multi-Location Support on Single Bill and PDF Rendering:");
  const multiLocBill = store.createBill({
    companyId: "c0000001-0000-0000-0000-000000000001",
    customerName: "CMC Hospital Vellore",
    customerPhone: "9443300000",
    customerAddress: "Ida Scudder Road, Vellore",
    deliveryLocation: "CMC Campus — Multiple Departments",
    eventName: "Annual Medical Conference",
    rentalStartDate: "2026-10-20",
    rentalEndDate: "2026-10-21",
    rentalDays: 1,
    agreedRentalRate: 8500,
    branches: [
      {
        branchName: "Medical Conference Halls",
        items: [
          {
            productId: "p1",
            itemName: "LED Stage",
            quantity: 2,
            days: 1,
            unitPrice: 1000,
            amount: 2000,
            deliveryLocation: "Auditorium A — Main Block",
          },
          {
            productId: "p2",
            itemName: "Chair With Cover",
            quantity: 100,
            days: 1,
            unitPrice: 25,
            amount: 2500,
            deliveryLocation: "Department of Cardiology — Hall 3",
          },
          {
            productId: "p3",
            itemName: "Table With Frill",
            quantity: 20,
            days: 1,
            unitPrice: 200,
            amount: 4000,
            deliveryLocation: "Administration Block — Reception",
          },
        ],
      },
    ],
  });

  assert("Multi-location bill created with 3 distinct product locations", multiLocBill.branches[0].items.length === 3);
  assert("Item 1 location is Auditorium A", multiLocBill.branches[0].items[0].deliveryLocation === "Auditorium A — Main Block");
  assert("Item 2 location is Cardiology", multiLocBill.branches[0].items[1].deliveryLocation === "Department of Cardiology — Hall 3");
  assert("Item 3 location is Admin Block", multiLocBill.branches[0].items[2].deliveryLocation === "Administration Block — Reception");

  // Verify PDF generation with separate charges and multi-locations
  multiLocBill.approvedDamageCharges = 600;
  multiLocBill.approvedMissingCharges = 900;
  multiLocBill.totalDamaged = 1;
  multiLocBill.totalMissing = 1;
  multiLocBill.grandTotal = 10000;

  const pdfDoc = generateBillPDF(multiLocBill);
  assert("PDF generated without error", !!pdfDoc);
  const pdfBytes = pdfDoc.output("arraybuffer");
  assert("Generated PDF document has valid byte length (> 5000 bytes)", pdfBytes.byteLength > 5000);

  console.log("\n==================================================================");
  console.log("🎉 ALL RENTAL BILL ENHANCEMENT ACCEPTANCE TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================================\n");
}

runEnhancementTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
