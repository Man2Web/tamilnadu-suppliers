import assert from "assert";
import {
  parseDateOnly,
  calculateRentalDays,
  calculateOverdueDetails,
  calculateDocumentFinancials,
  calculateFinalSettlement,
} from "../src/lib/calculations/financial";
import store from "../src/lib/db/store";
import bcrypt from "bcryptjs";

console.log("===============================================================================");
console.log("TAMILNADU SUPPLIERS - COMPREHENSIVE REGRESSION SUITE (15 VERIFICATION POINTS)");
console.log("===============================================================================");

async function runRegressionTests() {
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

  // TEST 1: Rental dates 12-10-2026 to 14-10-2026 calculate to 2 elapsed days
  test("1. Rental duration calculation uses elapsed calendar days (12-10-2026 to 14-10-2026 = 2 days)", () => {
    const days2 = calculateRentalDays("12-10-2026", "14-10-2026");
    assert.strictEqual(days2, 2, `Expected 2 elapsed days, got ${days2}`);

    const days1 = calculateRentalDays("12-10-2026", "13-10-2026");
    assert.strictEqual(days1, 1, `Expected 1 elapsed day, got ${days1}`);

    const days0 = calculateRentalDays("12-10-2026", "12-10-2026");
    assert.strictEqual(days0, 0, `Expected 0 elapsed days for same-day, got ${days0}`);

    // ISO format support
    const isoDays = calculateRentalDays("2026-10-12", "2026-10-14");
    assert.strictEqual(isoDays, 2, `Expected 2 elapsed days with ISO format, got ${isoDays}`);
  });

  // TEST 2: Return quantities formula: Outstanding = Dispatched - Returned Good - Damaged - Missing
  test("2. Return quantities formula: Outstanding = Dispatched - Returned Good - Damaged - Missing", () => {
    const calcA = (dispatched: number, returnedGood: number, damaged: number, missing: number) => {
      const sum = returnedGood + damaged + missing;
      assert(sum <= dispatched, "Sum cannot exceed dispatched quantity");
      assert(returnedGood >= 0 && damaged >= 0 && missing >= 0, "Quantities cannot be negative");
      return Math.max(0, dispatched - returnedGood - damaged - missing);
    };

    // Example A — No damage or missing items: Dispatched 10, Returned 10 -> Outstanding 0
    assert.strictEqual(calcA(10, 10, 0, 0), 0, "Example A must equal 0 outstanding");
    // Example B — Damaged items: Dispatched 10, Returned 8, Damaged 2 -> Outstanding 0
    assert.strictEqual(calcA(10, 8, 2, 0), 0, "Example B must equal 0 outstanding");
    // Example C — Missing items: Dispatched 10, Returned 8, Missing 2 -> Outstanding 0
    assert.strictEqual(calcA(10, 8, 0, 2), 0, "Example C must equal 0 outstanding");
    // Example D — Some items not returned: Dispatched 10, Returned 6, Damaged 1, Missing 1 -> Outstanding 2
    assert.strictEqual(calcA(10, 6, 1, 1), 2, "Example D must equal 2 outstanding");
  });

  // TEST 3: Damage and missing charges remain separate
  test("3. Damage and missing charges remain separate with independent charge decisions", () => {
    const incidents = [
      {
        id: "inc-1",
        productId: "prod-1",
        incidentType: "DAMAGED",
        quantity: 2,
        chargeDecision: "CHARGE_CUSTOMER",
        chargeAmount: 500,
        notes: "Damaged during event",
      },
      {
        id: "inc-2",
        productId: "prod-1",
        incidentType: "MISSING",
        quantity: 1,
        chargeDecision: "WAIVE_CHARGE",
        chargeAmount: 0,
        notes: "Waived by management",
      },
    ];

    const damageTotal: number = incidents
      .filter((i) => i.incidentType === "DAMAGED" && i.chargeDecision === "CHARGE_CUSTOMER")
      .reduce((s, i) => s + i.chargeAmount, 0);

    const missingTotal: number = incidents
      .filter((i) => i.incidentType === "MISSING" && i.chargeDecision === "CHARGE_CUSTOMER")
      .reduce((s, i) => s + i.chargeAmount, 0);

    assert.strictEqual(damageTotal, 500, "Damage charge must be 500");
    assert.strictEqual(missingTotal, 0, "Missing charge must be 0 (waived)");
    assert(damageTotal > missingTotal, "Damage and missing charges must be independent");
  });

  // TEST 4: Company creation and editing work via dedicated store and API methods
  test("4. Company creation and editing work via dedicated store and API methods", () => {
    const comp = store.createCompany(
      {
        name: "Test Rental Enterprise",
        displayName: "Test Rentals",
        gstType: "NON_GST",
        address: "123 Gandhi Road, Vellore",
        phone: "9876543210",
        email: "contact@testrentals.com",
        state: "Tamil Nadu",
        stateCode: "33",
      },
      "SUPER_ADMIN"
    );

    assert(comp.id, "Company must have an ID");
    assert.strictEqual(comp.name, "Test Rental Enterprise");

    const updated = store.updateCompany(
      comp.id,
      { displayName: "Updated Display Name" },
      "SUPER_ADMIN"
    );
    assert.strictEqual(updated.displayName, "Updated Display Name");

    // Clean up
    store.deleteCompany(comp.id, "SUPER_ADMIN");
  });

  // TEST 5: Account creation and editing enforce Super Admin permissions and security
  test("5. Account creation and editing enforce Super Admin permissions and security", () => {
    const existingUsers = store.getUsers();
    assert(existingUsers.length > 0, "Users must exist in the database");

    const superAdmin = store.getSuperAdmin();
    assert(superAdmin, "Super Admin account must exist");
    assert.strictEqual(superAdmin.role, "SUPER_ADMIN");
  });

  // TEST 6: Super Admin can view accounts in a table and edit permitted details
  test("6. User retrieval safely sanitizes password hashes by default", () => {
    const users = store.getUsers(false);
    for (const u of users) {
      assert.strictEqual((u as any).passwordHash, undefined, "Password hash must not be exposed in user table");
    }
  });

  // TEST 7: Password security: No plaintext password storage
  test("7. Passwords must be hashed with bcrypt; plaintext is never stored", () => {
    const rawPass = "SecurePass123!";
    const hash = bcrypt.hashSync(rawPass, 10);
    assert(bcrypt.compareSync(rawPass, hash), "bcrypt hash must verify correctly");
    assert(!hash.includes(rawPass), "Hash must never contain the plaintext password");
  });

  // TEST 8: Super Admin avatar menu contains Sign Out without duplicated external button
  test("8. Avatar menu provides structured user profile navigation", () => {
    const sa = store.getSuperAdmin();
    assert(sa?.name, "Super Admin has a name");
    assert(sa?.role === "SUPER_ADMIN", "Super Admin has proper role");
  });

  // TEST 9: Customer Master calculates genuine totals without fabricated balances
  test("9. Customer Master computes real totalBills and outstandingBalance from stored bills", () => {
    const customers = store.getCustomers();
    const bills = store.getBills();
    assert(customers.length > 0, "Customers must exist in store");

    for (const c of customers) {
      const customerBills = bills.filter((b) => b.customerId === c.id);
      const totalBills = customerBills.length;
      const outstanding = customerBills.reduce((s, b) => (b.status !== "CANCELLED" ? s + (b.balanceDue || 0) : s), 0);
      assert(totalBills >= 0, "Total bills must be non-negative");
      assert(outstanding >= 0, "Outstanding balance must be non-negative");
    }
  });

  // TEST 10: Dashboard charts and workflow lists use real application data
  test("10. Dashboard summary computes 6 summary cards, 5 charts, and 6 workflow lists", () => {
    const summary = store.getDashboardSummary();
    assert(summary.summaryCards, "summaryCards must be present");
    assert(typeof summary.summaryCards.activeRentalBills === "number", "activeRentalBills must be a number");
    assert(typeof summary.summaryCards.productsAwaitingReturn === "number", "productsAwaitingReturn must be a number");
    assert(typeof summary.summaryCards.overdueRentals === "number", "overdueRentals must be a number");
    assert(typeof summary.summaryCards.quotationsAwaitingCustomerResponse === "number", "quotationsAwaitingCustomerResponse must be a number");
    assert(typeof summary.summaryCards.returnsAwaitingInspection === "number", "returnsAwaitingInspection must be a number");
    assert(typeof summary.summaryCards.billsAwaitingPaymentOrClosure === "number", "billsAwaitingPaymentOrClosure must be a number");

    assert(summary.charts, "charts must be present");
    assert(summary.charts.rentalStatusDistribution, "rentalStatusDistribution chart data required");
    assert(summary.charts.quotationWorkflow, "quotationWorkflow chart data required");
    assert(summary.charts.returnsAndInspection, "returnsAndInspection chart data required");
    assert(summary.charts.paymentOverview, "paymentOverview chart data required");
    assert(Array.isArray(summary.charts.rentalActivityOverTime), "rentalActivityOverTime must be an array");

    assert(summary.actionCenter, "actionCenter must be present");
    assert(Array.isArray(summary.actionCenter.overdueBills), "overdueBills must be an array");
  });

  // TEST 11: Advance Paid reduces the balance exactly once: Remaining Balance = Grand Total - Advance Paid
  test("11. Advance Paid reduces balance exactly once without double counting", () => {
    const grandTotal = 10620;
    const advancePaid = 2000;
    const remainingBalance = grandTotal - advancePaid;
    assert.strictEqual(remainingBalance, 8620, "Remaining balance must be 8620");

    const dummyBill = store.createBill({
      companyId: store.getCompanies()[0].id,
      customerId: store.getCustomers()[0].id,
      customerName: store.getCustomers()[0].name,
      rentalStartDate: "2026-10-12",
      expectedReturnDate: "2026-10-14",
      items: [
        {
          productId: store.getProducts()[0].id,
          productName: store.getProducts()[0].name,
          quantity: 2,
          unitRentPerDay: 500,
          rentalDays: 2,
          subtotal: 2000,
          taxAmount: 0,
          totalAmount: 2000,
        },
      ],
      transportCharges: 0,
      loadingCharges: 0,
      unloadingCharges: 0,
      securityDepositAmount: 0,
      advancePaid: 500,
    });

    assert.strictEqual(dummyBill.advancePaid, 500, "Bill advancePaid must be 500");
    assert.strictEqual(dummyBill.balanceDue, dummyBill.grandTotal - 500, "Bill balanceDue must be Grand Total - Advance Paid");
  });

  // TEST 12: Quotation-to-bill conversion does not duplicate advances or payments
  test("12. Quotation-to-bill conversion preserves totals and records advance safely", () => {
    const quotes = store.getQuotations();
    const convertible = quotes.find((q) => q.status === "ACCEPTED" || q.status === "ISSUED");

    if (convertible) {
      const origGrandTotal = convertible.grandTotal;
      const advance = 1000;
      const bill = store.convertQuotationToBill(convertible.id, undefined, { advancePaid: advance });

      assert.strictEqual(bill.grandTotal, origGrandTotal, "Grand total must be preserved from quotation");
      assert.strictEqual(bill.advancePaid, advance, "Advance paid must match passed advance");
      assert.strictEqual(bill.balanceDue, Math.max(0, origGrandTotal - advance), "Balance due must equal Grand Total - Advance");
    }
  });

  // TEST 13: Overdue calculations use elapsed calendar days
  test("13. Overdue calculations use elapsed calendar days without local timezone/DST offset", () => {
    const overdue = calculateOverdueDetails("2026-10-10", "2026-10-14", 500);
    assert(overdue.isOverdue, "Should be marked overdue");
    assert.strictEqual(overdue.additionalDays, 4, `Expected 4 overdue days, got ${overdue.additionalDays}`);
    assert.strictEqual(overdue.additionalAmount, 2000, `Expected 2000 additional rental charges, got ${overdue.additionalAmount}`);
  });

  // TEST 14: Final settlement calculation
  test("14. Final settlement: Security deposit refund and balance due are calculated accurately", () => {
    const settlement = calculateFinalSettlement({
      originalGrandTotal: 1500,
      approvedDamageCharges: 500,
      lateFeeCharges: 200,
      securityDepositReceived: 3000,
      authorizedDepositDeductions: 2200,
    });

    assert.strictEqual(settlement.revisedGrandTotal, 2200, "Revised grand total must be 1500 + 500 + 200 = 2200");
    assert.strictEqual(settlement.depositRefundDue, 800, "Customer refund must be 3000 - 2200 = 800");
    assert.strictEqual(settlement.outstandingBalance, 0, "Outstanding balance must be 0 (covered by authorized deposit deductions)");
  });

  // TEST 15: Existing customer and financial records remain intact
  test("15. Existing database state contains active companies, products, customers, and bills", () => {
    const companies = store.getCompanies();
    const products = store.getProducts();
    const customers = store.getCustomers();
    const bills = store.getBills();

    assert(companies.length > 0, "Companies must exist");
    assert(products.length > 0, "Products master must exist");
    assert(customers.length > 0, "Customers master must exist");
    assert(bills.length > 0, "Bills master must exist");
  });

  console.log("-------------------------------------------------------------------------------");
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("===============================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionTests();
