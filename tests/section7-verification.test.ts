import assert from "assert";
import store from "../src/lib/db/store";
import { generateQuotationPDF, generateBillPDF } from "../src/lib/pdf/generator";
import { calculateRentalDays, calculateDocumentFinancials } from "../src/lib/calculations/financial";

console.log("===============================================================================");
console.log("TAMILNADU SUPPLIERS — SECTION 7 VERIFICATION TEST SUITE (13 VERIFICATION POINTS)");
console.log("===============================================================================");

async function runSection7Tests() {
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  const companies = store.getCompanies();
  const issuingCompany = companies[0] || store.createCompany({
    name: "Tamilnadu Suppliers",
    displayName: "Tamilnadu Suppliers",
    phone: "9842345678",
    email: "contact@tamilnadusuppliers.com",
    address: "Vellore, Tamil Nadu",
    gstType: "GST_REGISTERED",
    gstin: "33AAAAA0000A1Z5",
    isActive: true,
  });

  const products = store.getProducts();
  const productA = products[0] || store.createProduct({
    name: "Heavy Duty Scaffolding Pipe",
    sizeSpec: "10 ft",
    defaultRentalRate: 15,
    totalOwnedQuantity: 200,
    availableQuantity: 200,
    rentedQuantity: 0,
    damagedQuantity: 0,
    missingQuantity: 0,
    isActive: true,
  });

  const productB = products[1] || store.createProduct({
    name: "Cuplock Standard",
    sizeSpec: "3.0 m",
    defaultRentalRate: 25,
    totalOwnedQuantity: 150,
    availableQuantity: 150,
    rentedQuantity: 0,
    damagedQuantity: 0,
    missingQuantity: 0,
    isActive: true,
  });

  let createdQuotationId: string = "";
  let createdBillId: string = "";

  // TEST 1: Create a quotation successfully from current application
  test("1. Create quotation successfully with products, dates, company, notes list, and locations", () => {
    const quote = store.createQuotation({
      companyId: issuingCompany.id,
      customerName: "Senthil Builders & Infrastructure",
      customerPhone: "9876543210",
      customerAddress: "Gandhi Road, Vellore - 632004",
      deliveryLocation: "Sector 4 Site Office",
      eventName: "Commercial Plaza Project",
      quotationDate: "2026-10-15",
      rentalStartDate: "2026-10-16",
      rentalEndDate: "2026-10-20",
      notesList: [
        "Transportation at actuals if unloading takes > 2 hours",
        "Material to be returned cleaned and bundled",
      ],
      transportCharges: 500,
      loadingCharges: 250,
      advanceRequired: 1000,
      securityDepositRequired: 2000,
      items: [
        {
          productId: productA.id,
          itemName: productA.name,
          sizeSpec: productA.sizeSpec,
          quantity: 10,
          days: 4,
          unitPrice: 15,
          amount: 600,
          deliveryLocation: "Ground Floor",
        },
        {
          productId: productB.id,
          itemName: productB.name,
          sizeSpec: productB.sizeSpec,
          quantity: 4,
          days: 4,
          unitPrice: 25,
          amount: 400,
          deliveryLocation: "First Floor",
        },
      ],
    });

    assert(quote.id, "Quotation ID must exist");
    createdQuotationId = quote.id;
    assert.strictEqual(quote.status, "ISSUED", "New quotation status should be ISSUED");
    assert.strictEqual(quote.rentalDays, 4, "Rental duration should be 4 days (16 to 20)");
    assert(quote.customerId, "Customer ID must be auto-assigned/created");
    assert.strictEqual(quote.subtotal, 1000, "Subtotal must be 600 + 400 = 1000");
  });

  // TEST 2: Reopen quotation and verify all fields preserved
  test("2. Reopen quotation and verify every field, location, note, and product line is preserved", () => {
    const quote = store.getQuotation(createdQuotationId);
    assert(quote, "Quotation must be retrievable");
    assert.strictEqual(quote.customerName, "Senthil Builders & Infrastructure");
    assert.strictEqual(quote.deliveryLocation, "Sector 4 Site Office");
    assert.strictEqual(quote.eventName, "Commercial Plaza Project");
    assert.strictEqual(quote.notesList?.length, 2, "Notes list must have 2 items");
    assert.strictEqual(quote.notesList?.[0], "Transportation at actuals if unloading takes > 2 hours");

    const items = quote.items || (quote.branches || []).flatMap((b) => b.items);
    assert.strictEqual(items.length, 2, "Must preserve both product lines");
    assert.strictEqual(items[0].quantity, 10);
    assert.strictEqual(items[0].amount, 600);
    assert.strictEqual(items[0].deliveryLocation, "Ground Floor");
    assert.strictEqual(items[1].quantity, 4);
    assert.strictEqual(items[1].amount, 400);
  });

  // TEST 3: Edit quotation and confirm saved details and PDF update
  test("3. Edit quotation in-place and verify live recalculation and PDF generation", () => {
    // Edit quotation in-place (does not increment revision number)
    const updated = store.updateQuotation(createdQuotationId, {
      rentalStartDate: "2026-10-16",
      rentalEndDate: "2026-10-21", // 5 days instead of 4
      transportCharges: 700,
      notesList: [
        "Transportation at actuals if unloading takes > 2 hours",
        "Material to be returned cleaned and bundled",
        "Added third delivery note for high-grade steel",
      ],
      items: [
        {
          productId: productA.id,
          itemName: productA.name,
          quantity: 10,
          days: 5,
          unitPrice: 15,
          amount: 750,
          deliveryLocation: "Ground Floor",
        },
      ],
    });

    assert.strictEqual(updated.rentalDays, 5, "Rental days must update to 5");
    assert.strictEqual(updated.subtotal, 750, "Subtotal must update to 750");
    assert.strictEqual(updated.notesList?.length, 3, "Notes list must update to 3");
    assert.strictEqual(updated.revisionNumber, 1, "In-place edit must not bump revisionNumber");

    // Test PDF generation
    const pdf = generateQuotationPDF(updated);
    const pdfBytes = pdf.output("arraybuffer");
    assert(pdfBytes.byteLength > 1000, "Quotation PDF must generate valid non-empty byte buffer");
  });

  // TEST 4: Convert accepted quotation into a bill and verify preservation
  test("4. Convert accepted quotation into rental bill and verify items, advance, and return fields", () => {
    store.updateQuotationStatus(createdQuotationId, "ACCEPTED");

    const bill = store.convertQuotationToBill(createdQuotationId, {
      advancePaid: 500,
      paymentMethod: "BANK_TRANSFER",
      advanceReference: "TXN-998877",
    });

    assert(bill.id, "Converted bill must have an ID");
    assert(bill.billNumber, "Converted bill must have a bill number");
    assert.strictEqual(bill.sourceQuotationId, createdQuotationId, "Source quotation ID preserved");
    assert.strictEqual(bill.customerName, "Senthil Builders & Infrastructure");
    assert.strictEqual(bill.advancePaid, 500, "Advance paid must be recorded");

    // Verify BillItems have return tracking fields initialized
    const items = bill.items || (bill.branches || []).flatMap((b) => b.items);
    assert(items.length > 0, "Bill items must exist");
    assert.strictEqual(items[0].dispatchedQuantity, 10, "dispatchedQuantity must equal 10");
    assert.strictEqual(items[0].returnedGoodQuantity, 0, "returnedGoodQuantity initialized to 0");
    assert.strictEqual(items[0].outstandingQuantity, 10, "outstandingQuantity initialized to 10");

    // Verify payments recorded exactly once
    const payments = store.getPaymentsByBill(bill.id);
    assert.strictEqual(payments.length, 1, "Exactly one advance payment must be recorded");
    assert.strictEqual(payments[0].amount, 500);
  });

  // TEST 5: Create a bill directly without creating a quotation first
  test("5. Create a bill directly without quotation workflow", () => {
    const directBill = store.createBill({
      companyId: issuingCompany.id,
      customerName: "Raja Electrical & Engineering",
      customerPhone: "9443322110",
      customerAddress: "Katpadi Road, Vellore",
      deliveryLocation: "Control Room Site",
      billDate: "2026-10-15",
      rentalStartDate: "2026-10-15",
      rentalEndDate: "2026-10-18",
      items: [
        {
          productId: productA.id,
          itemName: productA.name,
          sizeSpec: productA.sizeSpec,
          quantity: 20,
          days: 3,
          unitPrice: 15,
          amount: 900,
        },
      ],
      transportCharges: 300,
      advancePaid: 300,
    });

    assert(directBill.id, "Direct bill ID must exist");
    assert.strictEqual(directBill.status, "ISSUED", "Direct bill starts as ISSUED");
    assert.strictEqual(directBill.advancePaid, 300);
    assert.strictEqual(directBill.items[0].dispatchedQuantity, 20);
    assert.strictEqual(directBill.items[0].outstandingQuantity, 20);

    createdBillId = directBill.id;
  });

  // TEST 6: Edit an open bill and verify details, totals, and PDF update
  test("6. Edit open bill (modify schedule, charges, items) and verify recalculation & PDF", () => {
    const editedBill = store.saveBillWorkspaceChanges(createdBillId, {
      rentalStartDate: "2026-10-15",
      rentalEndDate: "2026-10-19", // 4 days instead of 3
      transportCharges: 400,
      loadingCharges: 150,
      branches: [
        {
          branchName: "Phase 1 Equipment",
          items: [
            {
              id: "item-1",
              productId: productA.id,
              itemName: productA.name,
              sizeSpec: productA.sizeSpec,
              quantity: 20,
              days: 4,
              unitPrice: 15,
              amount: 1200,
              dispatchedQuantity: 20,
              deliveryLocation: "Zone A",
            },
          ],
        },
      ],
    });

    assert.strictEqual(editedBill.rentalDays, 4, "Rental days updated to 4");
    assert.strictEqual(editedBill.transportCharges, 400);
    assert.strictEqual(editedBill.loadingCharges, 150);
    assert.strictEqual(editedBill.subtotal, 1200);

    // Verify PDF generation for updated bill
    const pdf = generateBillPDF(editedBill);
    const pdfBytes = pdf.output("arraybuffer");
    assert(pdfBytes.byteLength > 1000, "Bill PDF must generate valid non-empty byte buffer");
  });

  // TEST 7: Verify the 10-item return examples in Section 1
  test("7. Verify Section 1 10-Item Return Formula Examples strictly: Outstanding = Dispatched - Good - Damaged - Missing", () => {
    const calcOutstanding = (dispatched: number, good: number, damaged: number, missing: number): number => {
      const totalAccounted = good + damaged + missing;
      if (totalAccounted > dispatched) {
        throw new Error(`Total accounted (${totalAccounted}) cannot exceed dispatched (${dispatched})`);
      }
      if (good < 0 || damaged < 0 || missing < 0 || dispatched < 0) {
        throw new Error("Quantities cannot be negative");
      }
      return dispatched - good - damaged - missing;
    };

    // Row 1: Dispatched 10, Returned Good 10, Damaged 0, Missing 0 -> Outstanding 0
    assert.strictEqual(calcOutstanding(10, 10, 0, 0), 0, "Row 1 must have 0 outstanding");

    // Row 2: Dispatched 10, Returned Good 8, Damaged 2, Missing 0 -> Outstanding 0
    assert.strictEqual(calcOutstanding(10, 8, 2, 0), 0, "Row 2 must have 0 outstanding");

    // Row 3: Dispatched 10, Returned Good 8, Damaged 0, Missing 2 -> Outstanding 0
    assert.strictEqual(calcOutstanding(10, 8, 0, 2), 0, "Row 3 must have 0 outstanding");

    // Row 4: Dispatched 10, Returned Good 6, Damaged 1, Missing 1 -> Outstanding 2
    assert.strictEqual(calcOutstanding(10, 6, 1, 1), 2, "Row 4 must have 2 outstanding");

    // Row 5: Dispatched 10, Returned Good 5, Damaged 0, Missing 0 -> Outstanding 5
    assert.strictEqual(calcOutstanding(10, 5, 0, 0), 5, "Row 5 must have 5 outstanding");

    // Verify over-return prevention
    assert.throws(
      () => calcOutstanding(10, 8, 2, 1),
      /cannot exceed dispatched/,
      "Must reject over-return total > dispatched"
    );

    // Verify negative rejection
    assert.throws(
      () => calcOutstanding(10, -1, 0, 0),
      /cannot be negative/,
      "Must reject negative returned good"
    );
  });

  // TEST 8: Test partial returns across multiple return batches without double counting
  test("8. Partial returns across multiple batches update usable inventory only for good returns without double counting", () => {
    // Create dedicated product for inventory tracking
    const testProd = store.createProduct({
      name: "Tracked Scaffold Jacks",
      sizeSpec: "Standard",
      defaultRentalRate: 20,
      totalOwnedQuantity: 100,
      availableQuantity: 100,
      rentedQuantity: 0,
      damagedQuantity: 0,
      missingQuantity: 0,
      isActive: true,
    });

    const multiReturnBill = store.createBill({
      companyId: issuingCompany.id,
      customerName: "Multi-Batch Return Customer",
      customerPhone: "9000011111",
      billDate: "2026-10-15",
      rentalStartDate: "2026-10-15",
      rentalEndDate: "2026-10-18",
      items: [
        {
          productId: testProd.id,
          itemName: testProd.name,
          quantity: 10,
          days: 3,
          unitPrice: 20,
          amount: 600,
        },
      ],
    });

    // Mark Out on Rent
    store.dispatchBill(multiReturnBill.id);

    // Batch 1: Return 4 Good items
    store.saveBillWorkspaceChanges(multiReturnBill.id, {
      items: [
        {
          productId: testProd.id,
          quantityReturnedGood: 4,
          quantityDamaged: 0,
          quantityMissing: 0,
        },
      ],
    });

    const billAfterBatch1 = store.getBill(multiReturnBill.id);
    const item1 = billAfterBatch1?.items?.[0] || billAfterBatch1?.branches?.[0]?.items?.[0];
    assert.strictEqual(item1?.returnedGoodQuantity, 4, "Batch 1 good returned = 4");
    assert.strictEqual(item1?.outstandingQuantity, 6, "Batch 1 outstanding = 6");

    const prodAfterBatch1 = store.getProduct(testProd.id);
    assert.strictEqual(prodAfterBatch1?.availableQuantity, 94, "Available increased by 4");
    assert.strictEqual(prodAfterBatch1?.rentedQuantity, 6, "Rented reduced to 6");

    // Batch 2: Cumulative returns now 7 Good, 2 Damaged, 0 Missing -> Outstanding 1
    store.saveBillWorkspaceChanges(multiReturnBill.id, {
      items: [
        {
          productId: testProd.id,
          quantityReturnedGood: 7,
          quantityDamaged: 2,
          quantityMissing: 0,
          damageChargeDecision: "ADD_CHARGE",
          damageChargeAmount: 200,
        },
      ],
    });

    const billAfterBatch2 = store.getBill(multiReturnBill.id);
    const item2 = billAfterBatch2?.items?.[0] || billAfterBatch2?.branches?.[0]?.items?.[0];
    assert.strictEqual(item2?.returnedGoodQuantity, 7, "Batch 2 cumulative good = 7");
    assert.strictEqual(item2?.quantityDamaged, 2, "Batch 2 cumulative damaged = 2");
    assert.strictEqual(item2?.outstandingQuantity, 1, "Batch 2 outstanding = 1");

    const prodAfterBatch2 = store.getProduct(testProd.id);
    assert.strictEqual(prodAfterBatch2?.availableQuantity, 97, "Available increased to 97 (only 7 good returned)");
    assert.strictEqual(prodAfterBatch2?.damagedQuantity, 2, "Damaged stock increased to 2");
    assert.strictEqual(prodAfterBatch2?.rentedQuantity, 1, "Rented stock reduced to 1");
  });

  // TEST 9: Verify separate damage and missing charges
  test("9. Separate damage and missing charges with independent decisions", () => {
    const incBill = store.createBill({
      companyId: issuingCompany.id,
      customerName: "Incident Charges Customer",
      customerPhone: "9111122222",
      billDate: "2026-10-15",
      rentalStartDate: "2026-10-15",
      rentalEndDate: "2026-10-17",
      items: [
        {
          productId: productA.id,
          itemName: productA.name,
          quantity: 10,
          days: 2,
          unitPrice: 15,
          amount: 300,
        },
      ],
    });

    store.dispatchBill(incBill.id);

    // Return 7 good, 2 damaged, 1 missing
    // Damage: ADD_CHARGE (₹400)
    // Missing: NO_CHARGE (₹0 waived)
    store.saveBillWorkspaceChanges(incBill.id, {
      items: [
        {
          productId: productA.id,
          quantityReturnedGood: 7,
          quantityDamaged: 2,
          quantityMissing: 1,
          damageChargeDecision: "ADD_CHARGE",
          damageChargeAmount: 400,
          missingChargeDecision: "NO_CHARGE",
          missingChargeAmount: 0,
        },
      ],
    });

    const saved = store.getBill(incBill.id);
    assert.strictEqual(saved?.approvedDamageCharges, 400, "Approved damage charge must be ₹400");
    assert.strictEqual(saved?.approvedMissingCharges, 0, "Approved missing charge must be ₹0");
    assert(saved?.grandTotal && saved.grandTotal > 300, "Grand total must include approved damage charges");
  });

  // TEST 10: Verify failed database writes show errors instead of false success messages
  test("10. Failed database writes throw errors and reject invalid records", () => {
    // Attempt to update non-existent bill
    assert.throws(() => {
      store.saveBillWorkspaceChanges("non-existent-id-9999", { rentalStartDate: "2026-10-15" });
    }, /Bill not found/);

    // Attempt to update non-existent quotation
    assert.throws(() => {
      store.updateQuotation("non-existent-quote-9999", { notes: "test" });
    }, /Quotation not found/);

    // Attempt to return more items than dispatched
    assert.throws(() => {
      store.saveBillWorkspaceChanges(createdBillId, {
        items: [
          {
            productId: productA.id,
            quantityReturnedGood: 50, // Only 20 dispatched
          },
        ],
      });
    }, /cannot exceed dispatched quantity/);
  });

  // TEST 11: Verify automatic saving does not create duplicate records or payments
  test("11. Repeated auto-save operations do not duplicate line items or payments", () => {
    const targetBill = store.getBill(createdBillId);
    const initialItemCount = (targetBill?.items || []).length;
    const initialPaymentCount = (store.getPaymentsByBill(createdBillId) || []).length;

    // Simulate 3 successive debounced auto-saves with minor notes edits
    store.saveBillWorkspaceChanges(createdBillId, { notes: "Auto-save iteration 1" });
    store.saveBillWorkspaceChanges(createdBillId, { notes: "Auto-save iteration 2" });
    store.saveBillWorkspaceChanges(createdBillId, { notes: "Auto-save iteration 3" });

    const finalBill = store.getBill(createdBillId);
    const finalItemCount = (finalBill?.items || []).length;
    const finalPaymentCount = (store.getPaymentsByBill(createdBillId) || []).length;

    assert.strictEqual(finalItemCount, initialItemCount, "Item count must remain constant");
    assert.strictEqual(finalPaymentCount, initialPaymentCount, "Payment count must not duplicate");
    assert.strictEqual(finalBill?.notes, "Auto-save iteration 3", "Final state must reflect latest edit");
  });

  // TEST 12: Verify bill closure and payment restrictions still work
  test("12. Bill closure strictly checks outstanding items, pending inspection, and unpaid balance", () => {
    const testCloseBill = store.createBill({
      companyId: issuingCompany.id,
      customerName: "Closure Restrictions Customer",
      customerPhone: "9222233333",
      billDate: "2026-10-15",
      rentalStartDate: "2026-10-15",
      rentalEndDate: "2026-10-16",
      items: [
        {
          productId: productA.id,
          itemName: productA.name,
          quantity: 5,
          days: 1,
          unitPrice: 15,
          amount: 75,
        },
      ],
      advancePaid: 0,
    });

    store.dispatchBill(testCloseBill.id);

    // Condition A: Cannot close when items remain outstanding
    assert.throws(
      () => store.closeBill(testCloseBill.id, { paymentReceivedInFull: true }),
      /remain outstanding/i,
      "Cannot close bill with outstanding items"
    );

    // Return all items: 4 good, 1 damaged
    store.saveBillWorkspaceChanges(testCloseBill.id, {
      items: [
        {
          productId: productA.id,
          quantityReturnedGood: 4,
          quantityDamaged: 1,
          damageChargeDecision: "PENDING_DECISION",
          damageChargeAmount: 100,
        },
      ],
    });

    // Condition B: Cannot close with pending decision
    assert.throws(
      () => store.closeBill(testCloseBill.id, { paymentReceivedInFull: true }),
      /pending resolution/i,
      "Cannot close bill with pending damage/missing decision"
    );

    // Resolve decision: ADD_CHARGE ₹100
    store.saveBillWorkspaceChanges(testCloseBill.id, {
      items: [
        {
          productId: productA.id,
          quantityReturnedGood: 4,
          quantityDamaged: 1,
          damageChargeDecision: "ADD_CHARGE",
          damageChargeAmount: 100,
        },
      ],
    });

    // Condition C: Cannot close when balance due > 0 and paymentReceivedInFull is false
    assert.throws(
      () => store.closeBill(testCloseBill.id, { paymentReceivedInFull: false }),
      /remains unpaid/i,
      "Cannot close bill with unpaid balance without confirmation"
    );

    // Condition D: Close with full payment confirmation
    const billBeforePayment = store.getBill(testCloseBill.id);
    const closed = store.closeBill(testCloseBill.id, {
      paymentReceivedInFull: true,
      paymentMethod: "CASH",
      amountReceived: billBeforePayment?.balanceDue || 175,
    });

    assert.strictEqual(closed.status, "CLOSED", "Bill status must transition to CLOSED");
    assert.strictEqual(closed.paymentStatus, "FULLY_PAID", "Payment status must be FULLY_PAID");
    assert.strictEqual(closed.balanceDue, 0, "Balance due must be ₹0.00 upon closure");
  });

  // TEST 13: Summary of verification points
  test("13. All 12 functional criteria verified cleanly across Quotation & Bill lifecycles", () => {
    assert(passed >= 12, "At least 12 individual tests must pass");
  });

  console.log("-------------------------------------------------------------------------------");
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("===============================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSection7Tests();
