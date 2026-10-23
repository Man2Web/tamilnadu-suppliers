import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

const BASE_URL = "http://127.0.0.1:3000";

describe("FULL AUDIT LOGS, SESSION MANAGEMENT & REJECTION WORKFLOW VERIFICATION", () => {
  const superAdminEmail = "admin@tamilnadusuppliers.com";
  const superAdminPass = "AdminTempPass2026!";

  const adminEmail = "test_admin@tamilnadusuppliers.com";
  const adminPass = "AdminTest2026!#";

  const billingEmail = "test_billing@tamilnadusuppliers.com";
  const billingPass = "BillingTest2026!#";

  let superAdminCookie = "";
  let adminCookie = "";
  let billingCookie = "";
  let adminSessionId = "";
  let billingSessionId = "";

  let createdQuotationId = "";
  let createdBillId = "";

  before(() => {
    // Seed test accounts with known passwords in tamilnadu_suppliers_db.json
    const dbPath = path.join(process.cwd(), "data", "tamilnadu_suppliers_db.json");
    if (fs.existsSync(dbPath)) {
      const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));

      // Ensure Super Admin has password
      const sa = db.users.find((u: any) => u.role === "SUPER_ADMIN");
      if (sa) {
        sa.passwordHash = bcrypt.hashSync(superAdminPass, 10);
        sa.mustChangePassword = false;
      }

      // Ensure test Admin exists
      let testAdmin = db.users.find((u: any) => u.email === adminEmail);
      if (!testAdmin) {
        testAdmin = {
          id: "u-test-admin",
          name: "Test Admin User",
          email: adminEmail,
          role: "ADMIN",
          status: "ACTIVE",
          mustChangePassword: false,
          permissions: [
            "dashboard:view",
            "products:view",
            "quotations:view",
            "quotations:create",
            "quotations:edit",
            "bills:view",
            "bills:create",
            "bills:amend",
            "payments:record",
            "returns:process",
            "damages:record",
            "bills:close",
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db.users.push(testAdmin);
      }
      testAdmin.passwordHash = bcrypt.hashSync(adminPass, 10);
      testAdmin.status = "ACTIVE";
      testAdmin.mustChangePassword = false;

      // Ensure test Billing exists
      let testBilling = db.users.find((u: any) => u.email === billingEmail);
      if (!testBilling) {
        testBilling = {
          id: "u-test-billing",
          name: "Test Billing User",
          email: billingEmail,
          role: "BILLING",
          status: "ACTIVE",
          mustChangePassword: false,
          permissions: [
            "dashboard:view",
            "quotations:view",
            "quotations:create",
            "bills:view",
            "bills:create",
            "payments:record",
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db.users.push(testBilling);
      }
      testBilling.passwordHash = bcrypt.hashSync(billingPass, 10);
      testBilling.status = "ACTIVE";
      testBilling.mustChangePassword = false;

      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    }
  });

  function extractCookie(res: Response): string {
    const setCookie = res.headers.get("set-cookie") || "";
    const match = setCookie.match(/tns_session=[^;]+/);
    return match ? match[0] : "";
  }

  // --- SCENARIO 1: Super Admin Signs In ---
  it("Scenario 1: Super Admin signs in, audit log recorded, NO self-notification", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: superAdminEmail, password: superAdminPass }),
    });
    assert.strictEqual(res.status, 200, "Super Admin login should succeed");
    superAdminCookie = extractCookie(res);
    assert.ok(superAdminCookie, "Cookie should be set");

    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: superAdminCookie },
    });
    const meData = await meRes.json();
    assert.strictEqual(meData.user.role, "SUPER_ADMIN");

    // Check notifications — Super Admin should NOT receive notification for own login
    const notifsRes = await fetch(`${BASE_URL}/api/admin/notifications`, {
      headers: { Cookie: superAdminCookie },
    });
    const notifsData = await notifsRes.json();
    assert.strictEqual(notifsRes.status, 200);
    const selfNotif = (notifsData.notifications || []).find(
      (n: any) => n.userId === meData.user.id && n.type === "SIGN_IN"
    );
    assert.strictEqual(selfNotif, undefined, "Super admin must not receive self sign-in notification");
  });

  // --- SCENARIO 2: Admin Signs In & Immediate Access Granted ---
  it("Scenario 2: Admin signs in with IMMEDIATE access and Super Admin notification", async () => {
    // Record initial notification count
    const initialNotifsRes = await fetch(`${BASE_URL}/api/admin/notifications`, {
      headers: { Cookie: superAdminCookie },
    });
    const initialNotifs = await initialNotifsRes.json();
    const prevCount = initialNotifs.unreadCount;

    // Admin login
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: adminEmail, password: adminPass }),
    });
    assert.strictEqual(res.status, 200);
    const loginData = await res.json();
    adminSessionId = loginData.sessionId || loginData.session?.id;
    assert.ok(adminSessionId, "Session ID must be returned");
    adminCookie = extractCookie(res);

    // Verify Admin has IMMEDIATE access (NO approve button, NO pending status)
    const adminMeRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(adminMeRes.status, 200, "Admin must have immediate active access");
    const adminMe = await adminMeRes.json();
    assert.strictEqual(adminMe.user.role, "ADMIN");

    // Super Admin checks notifications — must see Admin sign in event
    const afterNotifsRes = await fetch(`${BASE_URL}/api/admin/notifications`, {
      headers: { Cookie: superAdminCookie },
    });
    const afterNotifs = await afterNotifsRes.json();
    assert.strictEqual(afterNotifs.unreadCount, prevCount + 1, "Unread count should increment");

    const found = afterNotifs.notifications.find(
      (n: any) => n.type === "SIGN_IN" && n.sessionId === adminSessionId
    );
    assert.ok(found, "Super Admin notification must contain the Admin sign-in event");
    assert.strictEqual(found.role, "ADMIN");
    assert.strictEqual(found.userName, "Test Admin User");
  });

  // --- SCENARIO 3: Billing User Signs In ---
  it("Scenario 3: Billing user signs in, immediate access granted, Super Admin notified", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: billingEmail, password: billingPass }),
    });
    assert.strictEqual(res.status, 200);
    const loginData = await res.json();
    billingSessionId = loginData.sessionId || loginData.session?.id;
    assert.ok(billingSessionId, "Billing session ID must be returned");
    billingCookie = extractCookie(res);

    // Immediate access
    const billMe = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: billingCookie },
    });
    assert.strictEqual(billMe.status, 200);

    // Super Admin notification check
    const notifs = await fetch(`${BASE_URL}/api/admin/notifications`, {
      headers: { Cookie: superAdminCookie },
    }).then((r) => r.json());
    const found = notifs.notifications.find(
      (n: any) => n.sessionId === billingSessionId && n.type === "SIGN_IN"
    );
    assert.ok(found, "Super Admin must receive billing login notification");
    assert.strictEqual(found.role, "BILLING");
  });

  // --- SCENARIO 4: Failed Login Attempt ---
  it("Scenario 4: Failed login attempt is logged in audit trail without creating a session", async () => {
    const fakeUsername = "malicious_user@fake.com";
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: fakeUsername, password: "WrongPassword999!" }),
    });
    assert.strictEqual(res.status, 401, "Failed login must return 401");

    // Check audit logs for FAILED_LOGIN
    const logsRes = await fetch(`${BASE_URL}/api/admin/audit-logs?action=FAILED_LOGIN`, {
      headers: { Cookie: superAdminCookie },
    });
    assert.strictEqual(logsRes.status, 200);
    const logsData = await logsRes.json();
    const found = logsData.logs.find(
      (l: any) => l.action === "FAILED_LOGIN" && l.details?.attemptedUsername === fakeUsername
    );
    assert.ok(found, "Audit log must record failed sign-in attempt with attempted username");
  });

  // --- SCENARIO 5: Super Admin Rejection from Notification ---
  it("Scenario 5: Super Admin rejects Billing session; Billing immediately receives 401 SESSION_REJECTED", async () => {
    // Super admin rejects billingSessionId
    const rejectRes = await fetch(`${BASE_URL}/api/admin/sessions/${billingSessionId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    });
    assert.strictEqual(rejectRes.status, 200, "Super Admin reject session should succeed");
    const rejectData = await rejectRes.json();
    assert.strictEqual(rejectData.session.status, "REJECTED");

    // Billing user now tries to access /api/auth/me
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: billingCookie },
    });
    assert.strictEqual(meRes.status, 401, "Rejected session must receive 401 Unauthorized");
    const meData = await meRes.json();
    assert.strictEqual(meData.code, "SESSION_REJECTED", "Must return code: SESSION_REJECTED");
  });

  // --- SCENARIO 6: Super Admin Rejection from Session Management ---
  it("Scenario 6: Super Admin rejects Admin session from session management screen", async () => {
    // Verify session is active first in session list
    const sessionsRes = await fetch(`${BASE_URL}/api/admin/sessions`, {
      headers: { Cookie: superAdminCookie },
    });
    assert.strictEqual(sessionsRes.status, 200);
    const sessionsData = await sessionsRes.json();
    const adminSess = sessionsData.sessions.find((s: any) => s.id === adminSessionId);
    assert.strictEqual(adminSess.status, "ACTIVE");

    // Super Admin rejects Admin session
    const rejectRes = await fetch(`${BASE_URL}/api/admin/sessions/${adminSessionId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
    });
    assert.strictEqual(rejectRes.status, 200);

    // Admin tries to make an API request
    const adminReq = await fetch(`${BASE_URL}/api/quotations`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(adminReq.status, 401, "Rejected admin session must be blocked with 401");
    const adminBody = await adminReq.json();
    assert.strictEqual(adminBody.code, "SESSION_REJECTED");
  });

  // --- SCENARIO 7: Independent Session Isolation ---
  it("Scenario 7: Rejection applies strictly to rejected session; user can log in with a new session", async () => {
    // Admin logs in again
    const newLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: adminEmail, password: adminPass }),
    });
    assert.strictEqual(newLoginRes.status, 200);
    const newCookie = extractCookie(newLoginRes);
    const newSession = await newLoginRes.json();
    const newSessionId = newSession.sessionId || newSession.session?.id;
    assert.ok(newSessionId, "New session ID must be returned");
    assert.notStrictEqual(newSessionId, adminSessionId, "Must create a distinct session ID");

    // New session can access the system
    const testReq = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: newCookie },
    });
    assert.strictEqual(testReq.status, 200, "New session works normally");

    // Old rejected session still fails
    const oldReq = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(oldReq.status, 401, "Old rejected session remains blocked");

    // Keep new cookie for subsequent tests
    adminCookie = newCookie;
  });

  // --- SCENARIO 8: Quotation Creation with Server Actor Attribution ---
  it("Scenario 8: Admin creates quotation; audit log records action with Admin attribution", async () => {
    const quotePayload = {
      companyId: "c0000001-0000-0000-0000-000000000001",
      customerName: "Apollo Hospitals Tech Park",
      customerPhone: "9842199880",
      customerAddress: "Main Road, Vellore",
      quotationDate: "2026-10-15",
      rentalStartDate: "2026-10-20",
      rentalEndDate: "2026-10-22",
      rentalDays: 3,
      items: [
        {
          productId: "p0000001-0000-0000-0000-000000000001",
          itemName: "Luxury Shamiana 20x40",
          quantity: 2,
          unitPrice: 2500,
          days: 3,
          amount: 15000,
        },
      ],
      transportCharges: 500,
      advanceRequired: 5000,
    };

    const res = await fetch(`${BASE_URL}/api/quotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify(quotePayload),
    });
    assert.strictEqual(res.status, 201, "Quotation creation should return 201");
    const data = await res.json();
    assert.ok(data.id, "Quotation ID must exist");
    createdQuotationId = data.id;

    // Check history endpoint
    const historyRes = await fetch(`${BASE_URL}/api/quotations/${createdQuotationId}/history`, {
      headers: { Cookie: superAdminCookie },
    });
    assert.strictEqual(historyRes.status, 200);
    const histData = await historyRes.json();
    const createLog = histData.history.find((l: any) => l.action === "QUOTATION_CREATED");
    assert.ok(createLog, "History must contain QUOTATION_CREATED");
    assert.strictEqual(createLog.actorUsername, adminEmail);
    assert.strictEqual(createLog.actorRole, "ADMIN");
  });

  // --- SCENARIO 9: Quotation Edit & Revision History ---
  it("Scenario 9: Super Admin edits quotation & creates revision with full diff captured", async () => {
    // Edit quotation
    const editRes = await fetch(`${BASE_URL}/api/quotations/${createdQuotationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
      body: JSON.stringify({
        customerName: "Apollo Hospitals Enterprise Hub",
        advanceRequired: 6000,
      }),
    });
    assert.strictEqual(editRes.status, 200);

    // Create revision
    const reviseRes = await fetch(`${BASE_URL}/api/quotations/${createdQuotationId}/revise`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
      body: JSON.stringify({
        reason: "Customer requested additional canopy and updated timing",
        rentalDays: 4,
      }),
    });
    assert.strictEqual(reviseRes.status, 200);

    // Verify history contains both QUOTATION_EDITED and QUOTATION_REVISED
    const historyRes = await fetch(`${BASE_URL}/api/quotations/${createdQuotationId}/history`, {
      headers: { Cookie: superAdminCookie },
    });
    const histData = await historyRes.json();

    const editLog = histData.history.find((l: any) => l.action === "QUOTATION_EDITED");
    assert.ok(editLog, "Must have QUOTATION_EDITED log");

    const reviseLog = histData.history.find((l: any) => l.action === "QUOTATION_REVISED");
    assert.ok(reviseLog, "Must have QUOTATION_REVISED log");
    assert.strictEqual(reviseLog.actorRole, "SUPER_ADMIN");
  });

  // --- SCENARIO 10: Quotation Conversion to Bill ---
  it("Scenario 10: Convert quotation to bill, preserving quotation history & logging conversion", async () => {
    const convertRes = await fetch(`${BASE_URL}/api/quotations/${createdQuotationId}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
      body: JSON.stringify({
        advancePaid: 3000,
        paymentMethod: "CASH",
      }),
    });
    assert.strictEqual(convertRes.status, 200);
    const convertData = await convertRes.json();
    assert.ok(convertData.bill?.id, "Converted bill must be returned");
    createdBillId = convertData.bill.id;

    // Check quotation history — must contain QUOTATION_CONVERTED_TO_BILL
    const quoteHistRes = await fetch(`${BASE_URL}/api/quotations/${createdQuotationId}/history`, {
      headers: { Cookie: superAdminCookie },
    });
    const quoteHist = await quoteHistRes.json();
    const convertLog = quoteHist.history.find((l: any) => l.action === "QUOTATION_CONVERTED_TO_BILL");
    assert.ok(convertLog, "Must record QUOTATION_CONVERTED_TO_BILL in quotation history");
    assert.strictEqual(convertLog.details?.convertedBillId, createdBillId);
  });

  // --- SCENARIO 11: Bill Lifecycle Activities ---
  it("Scenario 11: Bill return, incident decision, and payment logged in audit trail", async () => {
    // 1. Record Return
    const returnRes = await fetch(`${BASE_URL}/api/bills/${createdBillId}/returns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
      body: JSON.stringify({
        items: [
          {
            productId: "p0000001-0000-0000-0000-000000000001",
            quantityReturnedGood: 1,
            quantityDamaged: 1,
            quantityMissing: 0,
            damageChargeAmount: 800,
            damageNotes: "Torn corner fabric",
          },
        ],
        notes: "Inspection completed at yard",
      }),
    });
    assert.strictEqual(returnRes.status, 200);

    // 2. Record Payment
    const paymentRes = await fetch(`${BASE_URL}/api/bills/${createdBillId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
      body: JSON.stringify({
        amount: 2500,
        paymentType: "RENTAL_PAYMENT",
        paymentMethod: "UPI",
        referenceNumber: "UPI-TEST-12345",
        notes: "Customer paid remaining balance via UPI",
      }),
    });
    assert.ok(paymentRes.status === 200 || paymentRes.status === 201, "Payment record status 200 or 201");

    // 3. Resolve Damage Decision (Requirement 11)
    const billDetailRes = await fetch(`${BASE_URL}/api/bills/${createdBillId}`, {
      headers: { Cookie: superAdminCookie },
    });
    const billDetail = await billDetailRes.json();
    const incident = billDetail.incidents?.[0];
    if (incident) {
      const incRes = await fetch(`${BASE_URL}/api/bills/${createdBillId}/incidents/${incident.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
        body: JSON.stringify({
          action: "ADD_CHARGE",
          finalApprovedCharge: 800,
          decisionNotes: "Approved damage charge after inspection",
        }),
      });
      assert.strictEqual(incRes.status, 200, "Incident resolution should return 200");
    }

    // Verify bill history has BILL_RETURN_RECORDED, DAMAGE_DECISION_UPDATED, and PAYMENT_RECORDED
    const billHistRes = await fetch(`${BASE_URL}/api/bills/${createdBillId}/history`, {
      headers: { Cookie: superAdminCookie },
    });
    const billHist = await billHistRes.json();

    const retLog = billHist.history.find((l: any) => l.action === "BILL_RETURN_RECORDED");
    assert.ok(retLog, "Must record BILL_RETURN_RECORDED in bill history");

    const payLog = billHist.history.find((l: any) => l.action === "PAYMENT_RECORDED");
    assert.ok(payLog, "Must record PAYMENT_RECORDED in bill history");
    assert.strictEqual(payLog.details?.amount, 2500);
    assert.strictEqual(payLog.details?.method, "UPI");

    if (incident) {
      const dmgLog = billHist.history.find((l: any) => l.action === "DAMAGE_DECISION_UPDATED");
      assert.ok(dmgLog, "Must record DAMAGE_DECISION_UPDATED in bill history");
    }
  });

  // --- SCENARIO 12: Bill Closure & Reopening ---
  it("Scenario 12: Super Admin closes bill and then reopens it with reason recorded", async () => {
    // Check current balance due for closure payment
    const currentBill = await fetch(`${BASE_URL}/api/bills/${createdBillId}`, {
      headers: { Cookie: superAdminCookie },
    }).then((r) => r.json());

    // Close bill
    const closeRes = await fetch(`${BASE_URL}/api/bills/${createdBillId}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
      body: JSON.stringify({
        paymentReceivedInFull: true,
        amountReceived: currentBill.balanceDue > 0 ? currentBill.balanceDue : 0,
        allowOutstanding: true,
        notes: "Rental finished and settled",
      }),
    });
    assert.strictEqual(closeRes.status, 200);

    // Reopen bill
    const reopenRes = await fetch(`${BASE_URL}/api/bills/${createdBillId}/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
      body: JSON.stringify({
        reason: "Customer requested re-inspection of damaged canopy",
      }),
    });
    assert.strictEqual(reopenRes.status, 200);
    const reopenData = await reopenRes.json();
    assert.strictEqual(reopenData.bill.status, "PENDING_SETTLEMENT");

    // Check history
    const histRes = await fetch(`${BASE_URL}/api/bills/${createdBillId}/history`, {
      headers: { Cookie: superAdminCookie },
    });
    const histData = await histRes.json();
    const closeLog = histData.history.find((l: any) => l.action === "BILL_CLOSED");
    assert.ok(closeLog, "History must contain BILL_CLOSED");

    const reopenLog = histData.history.find((l: any) => l.action === "BILL_REOPENED");
    assert.ok(reopenLog, "History must contain BILL_REOPENED");
    assert.strictEqual(reopenLog.details?.reason, "Customer requested re-inspection of damaged canopy");
  });

  // --- SCENARIO 13: Document History Display Endpoint Verification ---
  it("Scenario 13: Bill history endpoint returns originating quotation reference and history", async () => {
    const res = await fetch(`${BASE_URL}/api/bills/${createdBillId}/history`, {
      headers: { Cookie: superAdminCookie },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.sourceQuotationId, createdQuotationId, "Originating quotation reference must match");
    assert.ok(data.sourceQuotationNumber, "Originating quotation number must exist");
    assert.ok(Array.isArray(data.sourceQuotationHistory), "Source quotation history array must exist");
    assert.ok(data.sourceQuotationHistory.length > 0, "Source quotation history must contain logs");
  });

  // --- SCENARIO 14: PDF Generation Logging ---
  it("Scenario 14: PDF download/generation routes log audit events with actor attribution", async () => {
    // Generate quotation PDF
    const qPdfRes = await fetch(`${BASE_URL}/api/documents/quotation/${createdQuotationId}/pdf`, {
      headers: { Cookie: superAdminCookie },
    });
    assert.strictEqual(qPdfRes.status, 200);
    assert.strictEqual(qPdfRes.headers.get("content-type"), "application/pdf");

    // Generate bill PDF
    const bPdfRes = await fetch(`${BASE_URL}/api/documents/bill/${createdBillId}/pdf`, {
      headers: { Cookie: superAdminCookie },
    });
    assert.strictEqual(bPdfRes.status, 200);
    assert.strictEqual(bPdfRes.headers.get("content-type"), "application/pdf");

    // Verify audit logs
    const qHist = await fetch(`${BASE_URL}/api/quotations/${createdQuotationId}/history`, {
      headers: { Cookie: superAdminCookie },
    }).then((r) => r.json());
    const qPdfLog = qHist.history.find((l: any) => l.action === "QUOTATION_PDF_GENERATED");
    assert.ok(qPdfLog, "QUOTATION_PDF_GENERATED must be recorded in audit log");

    const bHist = await fetch(`${BASE_URL}/api/bills/${createdBillId}/history`, {
      headers: { Cookie: superAdminCookie },
    }).then((r) => r.json());
    const bPdfLog = bHist.history.find((l: any) => l.action === "BILL_PDF_GENERATED");
    assert.ok(bPdfLog, "BILL_PDF_GENERATED must be recorded in audit log");
  });

  // --- SCENARIO 15: Non-Super Admin Restrictions ---
  it("Scenario 15: Admin and Billing accounts cannot access /api/admin/* endpoints", async () => {
    // Admin attempts to list sessions
    const adminSessRes = await fetch(`${BASE_URL}/api/admin/sessions`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(adminSessRes.status, 403, "Admin cannot access /api/admin/sessions");

    // Admin attempts to view Super Admin notifications
    const adminNotifRes = await fetch(`${BASE_URL}/api/admin/notifications`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(adminNotifRes.status, 403, "Admin cannot access /api/admin/notifications");

    // Admin attempts to reject a session
    const adminRejectRes = await fetch(`${BASE_URL}/api/admin/sessions/some-session/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
    });
    assert.strictEqual(adminRejectRes.status, 403, "Admin cannot reject sessions");
  });
});
