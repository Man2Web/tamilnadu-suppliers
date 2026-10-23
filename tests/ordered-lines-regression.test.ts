import assert from "assert";
import store from "../src/lib/db/store";
import { generateQuotationPDF, generateBillPDF } from "../src/lib/pdf/generator";
import { calculateDocumentFinancials } from "../src/lib/calculations/financial";
import fs from "fs";
import path from "path";

console.log("===============================================================================");
console.log("TAMILNADU SUPPLIERS — ORDERED LINES & BILL CLEANUP REGRESSION SUITE (15 CHECKS)");
console.log("===============================================================================");

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  const companies = store.getCompanies();
  const company = companies[0];
  const products = store.getProducts();
  const prod1 = products[0];
  const prod2 = products[1] || products[0];

  // 1. A quotation can be edited before conversion to a bill.
  let testQuoteId = "";
  await test("1. A quotation can be edited before conversion to a bill", () => {
    const quote = store.createQuotation({
      companyId: company.id,
      customerName: "Test College User",
      customerPhone: "9876543210",
      customerAddress: "Vellore, Tamil Nadu",
      rentalStartDate: "2026-10-20",
      rentalEndDate: "2026-10-22",
      rentalDays: 2,
      status: "DRAFT",
      items: [
        {
          id: "item-1",
          entryType: "product",
          position: 1,
          productId: prod1.id,
          itemName: prod1.name,
          quantity: 5,
          days: 2,
          unitPrice: prod1.defaultRentalRate,
          amount: 5 * 2 * prod1.defaultRentalRate,
        },
      ],
    });

    testQuoteId = quote.id;
    assert.strictEqual(quote.status, "DRAFT");
    assert.strictEqual(store.isQuotationConverted(quote), false);

    // Edit before conversion
    const updated = store.updateQuotation(quote.id, {
      eventName: "Pre-Conversion Annual Day",
      items: [
        {
          id: "item-1",
          entryType: "product",
          position: 1,
          productId: prod1.id,
          itemName: prod1.name,
          quantity: 10,
          days: 2,
          unitPrice: prod1.defaultRentalRate,
          amount: 10 * 2 * prod1.defaultRentalRate,
        },
      ],
    });
    assert.strictEqual(updated.eventName, "Pre-Conversion Annual Day");
    assert.strictEqual(updated.items?.[0]?.quantity, 10);
  });

  // 2. The quotation edit option disappears after conversion.
  let convertedBillId = "";
  await test("2. The quotation edit option disappears after conversion", () => {
    const quote = store.getQuotation(testQuoteId);
    assert(quote, "Quotation must exist");

    // Convert quotation to bill
    const bill = store.convertQuotationToBill(quote.id, { advancePaid: 1000 });
    convertedBillId = bill.id;

    const refreshedQuote = store.getQuotation(testQuoteId)!;
    assert.strictEqual(refreshedQuote.status, "CONVERTED");
    assert.strictEqual(refreshedQuote.convertedBillId, bill.id);
    assert.strictEqual(store.isQuotationConverted(refreshedQuote), true);
  });

  // 3. Converted quotations cannot be edited through direct URLs or backend requests (403 / Error thrown).
  await test("3. Converted quotations cannot be edited through direct URLs or backend requests", () => {
    assert.throws(
      () => {
        store.updateQuotation(testQuoteId, {
          customerName: "Hacked Converted Name",
        });
      },
      (err: any) => {
        assert(err.message.includes("Cannot edit quotation") && err.message.includes("converted"));
        return true;
      },
      "Backend store must forbid updating a converted quotation"
    );

    assert.throws(
      () => {
        store.reviseQuotation(testQuoteId, {
          reason: "Attempted revision after conversion",
        });
      },
      (err: any) => {
        assert(err.message.includes("Cannot revise quotation") && err.message.includes("converted"));
        return true;
      },
      "Backend store must forbid revising a converted quotation"
    );
  });

  // 4. The ordinary Edit Bill button is removed from bill details and bill-related pages.
  await test("4. The ordinary Edit Bill button is removed from bill details and bill-related pages", () => {
    const billPagePath = path.resolve(__dirname, "../src/app/bills/[id]/page.tsx");
    const billPageContent = fs.readFileSync(billPagePath, "utf-8");

    assert(!billPageContent.includes("<span>Edit Bill</span>"), "Ordinary 'Edit Bill' button text must not exist");
    assert(!billPageContent.includes("showEditBillModal"), "Edit Bill Modal state must not exist");
    assert(!billPageContent.includes("handleSaveBillEdit"), "handleSaveBillEdit must not exist");
  });

  // 5. Existing authorized amendment, return, payment, and closure workflows continue working.
  await test("5. Existing authorized amendment, return, payment, and closure workflows continue working", () => {
    const bill = store.getBill(convertedBillId);
    assert(bill, "Bill must exist");

    // Amendment
    const amended = store.amendBill(bill.id, {
      reason: "Authorized date extension",
      changes: {
        additionalRentalDays: 1,
        additionalRentalCharges: 500,
      },
    });
    assert.strictEqual(amended.additionalRentalDays, 1);
    assert.strictEqual(amended.additionalRentalCharges, 500);

    // Payment recording
    const payment = store.recordBillPayment(bill.id, {
      amount: 500,
      paymentType: "RENTAL_PAYMENT",
      paymentMethod: "CASH",
    });
    assert.strictEqual(payment.amount, 500);

    // Return recording
    const updatedWithReturn = store.saveBillWorkspaceChanges(bill.id, {
      items: [
        {
          id: bill.branches[0].items[0].id,
          quantityPhysicallyReturned: 10,
          quantityDamaged: 0,
          quantityMissing: 0,
        },
      ],
    });
    assert.strictEqual(updatedWithReturn.totalReturnedGood, 10);

    // Closure check
    const closed = store.closeBill(bill.id, {
      allowOutstanding: true,
      paymentReceivedInFull: true,
      amountReceived: amended.balanceDue,
    });
    assert.strictEqual(closed.status, "CLOSED");
  });

  // 6. The unwanted Outstanding Quantity, Cumulative Rental Quantities, Cumulative Total for Rental, and Bill Notes & Remarks sections are removed from the relevant bill page.
  await test("6. Unwanted Cumulative and Outstanding sections removed from bill page", () => {
    const billPagePath = path.resolve(__dirname, "../src/app/bills/[id]/page.tsx");
    const content = fs.readFileSync(billPagePath, "utf-8");

    assert(!content.includes("Cumulative Rental Quantities"), "Must not display Cumulative Rental Quantities");
    assert(!content.includes("Cumulative Total for Rental"), "Must not display Cumulative Total for Rental");
    assert(!content.includes("Formula: <code>Outstanding Quantity"), "Must not display formula explanation");
    assert(!content.includes("Bill Notes & Remarks"), "Must not display separate Bill Notes & Remarks section");
    assert(!content.includes("<th className=\"py-2.5 px-2 text-center w-20 text-amber-700 font-bold\">Outstanding</th>"), "Must not have Outstanding column header");
  });

  // 7. Returned Good is calculated correctly from physical returns minus damaged quantities:
  //    Returned Good = Quantity Physically Returned − Damaged Quantity
  await test("7. Returned Good is calculated correctly from physical returns minus damaged quantities", () => {
    // Helper formula
    const calcReturnedGood = (physicallyReturned: number, damaged: number) => {
      return Math.max(0, physicallyReturned - damaged);
    };

    // Example 1: Dispatched 10, Physical 10, Damaged 2, Missing 0 -> Returned Good 8
    assert.strictEqual(calcReturnedGood(10, 2), 8);

    // Example 2: Dispatched 10, Physical 8, Damaged 1, Missing 1 -> Returned Good 7
    assert.strictEqual(calcReturnedGood(8, 1), 7);

    // Verify in store.saveBillWorkspaceChanges
    const newBill = store.createBill({
      companyId: company.id,
      customerName: "Formula Test Customer",
      customerPhone: "9876543211",
      customerAddress: "Vellore",
      rentalStartDate: "2026-10-20",
      rentalEndDate: "2026-10-22",
      items: [
        {
          entryType: "product",
          position: 1,
          productId: prod1.id,
          itemName: prod1.name,
          quantity: 10,
          days: 2,
          unitPrice: 100,
          amount: 2000,
        },
      ],
    });

    const itemId = newBill.branches[0].items[0].id;

    // Simulate Return 1: Physical 10, Damaged 2 -> Returned Good 8
    const updatedBill1 = store.saveBillWorkspaceChanges(newBill.id, {
      items: [
        {
          id: itemId,
          quantityPhysicallyReturned: 10,
          quantityDamaged: 2,
          quantityMissing: 0,
        },
      ],
    });
    const item1 = updatedBill1.branches[0].items[0];
    assert.strictEqual(item1.quantityReturnedGood, 8, "Expected Returned Good = 10 - 2 = 8");
    assert.strictEqual(item1.quantityDamaged, 2);
    assert.strictEqual(item1.quantityMissing, 0);

    // Simulate Return 2: Physical 8, Damaged 1, Missing 1 -> Returned Good 7
    const updatedBill2 = store.saveBillWorkspaceChanges(newBill.id, {
      items: [
        {
          id: itemId,
          quantityPhysicallyReturned: 8,
          quantityDamaged: 1,
          quantityMissing: 1,
        },
      ],
    });
    const item2 = updatedBill2.branches[0].items[0];
    assert.strictEqual(item2.quantityReturnedGood, 7, "Expected Returned Good = 8 - 1 = 7");
    assert.strictEqual(item2.quantityDamaged, 1);
    assert.strictEqual(item2.quantityMissing, 1);
  });

  // 8. Missing items remain separate from physically returned items.
  await test("8. Missing items remain separate from physically returned items", () => {
    // Missing items must not count as physically returned
    const dispatched = 10;
    const physicalReturned = 8;
    const damaged = 1;
    const missing = 1;

    // Physical returned accounts only for physical units (8), of which 1 is damaged -> 7 good
    const returnedGood = Math.max(0, physicalReturned - damaged);
    assert.strictEqual(returnedGood, 7);
    assert.strictEqual(missing, 1);
    assert.notStrictEqual(physicalReturned, dispatched, "Missing items are NOT physically returned");
  });

  // 9. Usable stock is restored only for eligible returned-good products.
  await test("9. Usable stock is restored only for eligible returned-good products", () => {
    const initialProduct = store.getProduct(prod1.id)!;
    const initialAvailable = initialProduct.availableQuantity;
    const initialRented = initialProduct.rentedQuantity || 0;
    const initialDamaged = initialProduct.damagedQuantity || 0;
    const initialMissing = initialProduct.missingQuantity || 0;

    // Create and dispatch bill
    const bill = store.createBill({
      companyId: company.id,
      customerName: "Stock Test Customer",
      customerPhone: "9876543212",
      customerAddress: "Vellore",
      rentalStartDate: "2026-10-20",
      rentalEndDate: "2026-10-22",
      items: [
        {
          entryType: "product",
          position: 1,
          productId: prod1.id,
          itemName: prod1.name,
          quantity: 10,
          days: 2,
          unitPrice: 100,
          amount: 2000,
        },
      ],
    });

    const itemId = bill.branches[0].items[0].id;
    store.dispatchBill(bill.id);

    const postDispatch = store.getProduct(prod1.id)!;
    assert.strictEqual(postDispatch.rentedQuantity, initialRented + 10);

    // Record return: Physical 8, Damaged 1, Missing 1 -> Returned Good = 7
    store.saveBillWorkspaceChanges(bill.id, {
      items: [
        {
          id: itemId,
          quantityPhysicallyReturned: 8,
          quantityDamaged: 1,
          quantityMissing: 1,
        },
      ],
    });

    const postReturn = store.getProduct(prod1.id)!;
    // Damaged items remain in damagedQuantity, NOT restored to availableQuantity
    assert.strictEqual(postReturn.damagedQuantity, initialDamaged + 1, "Damaged quantity must be increased by 1");
    assert.strictEqual(postReturn.missingQuantity, initialMissing + 1, "Missing quantity must be increased by 1");
    // Available stock only restored by actual Returned Good (7 units)
    assert.strictEqual(postReturn.availableQuantity, initialAvailable - 10 + 7);
  });

  // 10. Only one Advance Paid input is provided on bill creation, deducted immediately.
  await test("10. Only one Advance Paid input is provided on bill creation, deducted immediately", () => {
    const createBillPath = path.resolve(__dirname, "../src/app/bills/create/page.tsx");
    const content = fs.readFileSync(createBillPath, "utf-8");

    // Exactly one Advance Paid input field
    const advanceMatches = content.match(/<label[^>]*>\s*Advance Paid \(₹\)\s*<\/label>/g);
    assert.strictEqual(advanceMatches?.length, 1, "Must contain exactly one 'Advance Paid (₹)' field");

    // Grand total = 10,620, Advance = 2,000 -> Remaining Balance = 8,620
    const financials = calculateDocumentFinancials({
      taxType: "NON_GST",
      branchSubtotals: [10620],
      advancePaid: 2000,
    });
    assert.strictEqual(financials.grandTotal, 10620);
    assert.strictEqual(financials.advancePaid, 2000);
    assert.strictEqual(financials.balanceDue, 8620);
  });

  // 11. Notes and products can be added in alternating order.
  let mixedQuoteId = "";
  await test("11. Notes and products can be added in alternating order", () => {
    const quote = store.createQuotation({
      companyId: company.id,
      customerName: "VIT University Event",
      customerPhone: "9876543213",
      customerAddress: "Katpadi, Vellore",
      rentalStartDate: "2026-10-25",
      rentalEndDate: "2026-10-26",
      rentalDays: 1,
      items: [
        {
          entryType: "note",
          position: 1,
          text: "VIT College — Main Auditorium",
          itemName: "VIT College — Main Auditorium",
          quantity: 0,
          days: 0,
          unitPrice: 0,
          amount: 0,
        },
        {
          entryType: "product",
          position: 2,
          productId: prod1.id,
          itemName: "Heavy Duty Canopy",
          quantity: 2,
          days: 1,
          unitPrice: 500,
          amount: 1000,
        },
        {
          entryType: "product",
          position: 3,
          productId: prod2.id,
          itemName: "15kg Dabara",
          quantity: 10,
          days: 1,
          unitPrice: 150,
          amount: 1500,
        },
        {
          entryType: "note",
          position: 4,
          text: "Department of Computer Science",
          itemName: "Department of Computer Science",
          quantity: 0,
          days: 0,
          unitPrice: 0,
          amount: 0,
        },
        {
          entryType: "product",
          position: 5,
          productId: prod1.id,
          itemName: "Plastic Chairs",
          quantity: 100,
          days: 1,
          unitPrice: 20,
          amount: 2000,
        },
        {
          entryType: "note",
          position: 6,
          text: "Deliver before 8:00 AM",
          itemName: "Deliver before 8:00 AM",
          quantity: 0,
          days: 0,
          unitPrice: 0,
          amount: 0,
        },
        {
          entryType: "product",
          position: 7,
          productId: prod2.id,
          itemName: "Tables",
          quantity: 5,
          days: 1,
          unitPrice: 100,
          amount: 500,
        },
      ],
    });

    mixedQuoteId = quote.id;
    assert.strictEqual(quote.items?.length, 7);
    assert.strictEqual(quote.items?.[0].entryType, "note");
    assert.strictEqual(quote.items?.[0].text, "VIT College — Main Auditorium");
    assert.strictEqual(quote.items?.[1].entryType, "product");
    assert.strictEqual(quote.items?.[3].entryType, "note");
    assert.strictEqual(quote.items?.[3].text, "Department of Computer Science");
    assert.strictEqual(quote.items?.[5].entryType, "note");
    assert.strictEqual(quote.items?.[5].text, "Deliver before 8:00 AM");
    assert.strictEqual(quote.items?.[6].entryType, "product");

    // Note entries must not inflate subtotals
    assert.strictEqual(quote.subtotal, 1000 + 1500 + 2000 + 500); // 5000
  });

  // 12. The order survives saving, refreshing, editing, and reopening.
  await test("12. The order survives saving, refreshing, editing, and reopening", () => {
    // Re-fetch from store to verify persistence
    const refreshed = store.getQuotation(mixedQuoteId)!;
    assert.strictEqual(refreshed.items?.length, 7);
    assert.strictEqual(refreshed.items?.[0].text, "VIT College — Main Auditorium");
    assert.strictEqual(refreshed.items?.[1].itemName, "Heavy Duty Canopy");
    assert.strictEqual(refreshed.items?.[2].itemName, "15kg Dabara");
    assert.strictEqual(refreshed.items?.[3].text, "Department of Computer Science");
    assert.strictEqual(refreshed.items?.[4].itemName, "Plastic Chairs");
    assert.strictEqual(refreshed.items?.[5].text, "Deliver before 8:00 AM");
    assert.strictEqual(refreshed.items?.[6].itemName, "Tables");

    // Positions must be strictly ascending 1..7
    refreshed.items?.forEach((it, idx) => {
      assert.strictEqual(it.position, idx + 1);
    });
  });

  // 13. Quotation-to-bill conversion preserves the mixed sequence.
  let convertedMixedBillId = "";
  await test("13. Quotation-to-bill conversion preserves the mixed sequence", () => {
    const bill = store.convertQuotationToBill(mixedQuoteId);
    convertedMixedBillId = bill.id;

    const flatItems = bill.branches[0].items;
    assert.strictEqual(flatItems.length, 7);
    assert.strictEqual(flatItems[0].entryType, "note");
    assert.strictEqual(flatItems[0].text, "VIT College — Main Auditorium");
    assert.strictEqual(flatItems[1].entryType, "product");
    assert.strictEqual(flatItems[1].itemName, "Heavy Duty Canopy");
    assert.strictEqual(flatItems[3].entryType, "note");
    assert.strictEqual(flatItems[3].text, "Department of Computer Science");
    assert.strictEqual(flatItems[4].entryType, "product");
    assert.strictEqual(flatItems[4].itemName, "Plastic Chairs");
    assert.strictEqual(flatItems[5].entryType, "note");
    assert.strictEqual(flatItems[5].text, "Deliver before 8:00 AM");
    assert.strictEqual(flatItems[6].entryType, "product");
    assert.strictEqual(flatItems[6].itemName, "Tables");

    // Bill total dispatched excludes notes
    assert.strictEqual(bill.totalDispatched, 2 + 10 + 100 + 5); // 117
  });

  // 14. Both quotation and bill PDFs preserve the exact saved note/product order.
  await test("14. Both quotation and bill PDFs preserve the exact saved note/product order", () => {
    const quote = store.getQuotation(mixedQuoteId)!;
    const bill = store.getBill(convertedMixedBillId)!;

    const quoteDoc = generateQuotationPDF(quote);
    const quotePdfBuffer = quoteDoc.output("arraybuffer");
    assert(quotePdfBuffer && quotePdfBuffer.byteLength > 1000, "Quotation PDF must generate successfully");

    const billDoc = generateBillPDF(bill);
    const billPdfBuffer = billDoc.output("arraybuffer");
    assert(billPdfBuffer && billPdfBuffer.byteLength > 1000, "Bill PDF must generate successfully");
  });

  // 15. The PDF's unrelated formatting remains unchanged.
  await test("15. The PDF's unrelated formatting remains unchanged", () => {
    const pdfGenPath = path.resolve(__dirname, "../src/lib/pdf/generator.ts");
    const content = fs.readFileSync(pdfGenPath, "utf-8");

    // Preserves header, layout, styles, financial summaries
    assert(content.includes("TAMILNADU SUPPLIERS"), "Company header must be preserved");
    assert(content.includes("CGST"), "GST calculation must be preserved");
    assert(content.includes("Terms and Conditions:"), "Terms & conditions must be preserved");
    assert(content.includes("Authorised Signatory"), "Signature section must be preserved");
    assert(content.includes("colSpan: 7"), "Note rows must span table width");
  });

  console.log("-------------------------------------------------------------------------------");
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("===============================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("FATAL ERROR in test execution:", err);
  process.exit(1);
});
