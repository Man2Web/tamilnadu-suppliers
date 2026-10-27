# Application Workflow and Transaction-Safety Audit (Batch 5.3A)
**Project:** Tamilnadu Suppliers ERP (`D:\tamilnadu-suppliers`)  
**Scope:** Read-only architectural audit of multi-write application workflows, transaction boundaries, failure injection scenarios, and PostgreSQL transaction adapter design.  
**Date:** October 2026  
**Status:** Audit Complete — No Application Code or Database State Modified

---

## 1. Executive Summary

### 1.1 Context and Problem Statement
Following the successful validation of the standalone PostgreSQL 18.4 schema (Batch 5.1: 25/25 integration tests passed) and local concurrency controls (Batch 5.2: 12/12 rate-limiting and stock-locking tests passed), this audit addresses the central remaining architectural concern: **application-level workflow atomicity**.

Currently, the production database provider is **Supabase Cloud**, accessed through `@supabase/supabase-js` (PostgREST HTTP REST API). In parallel, Batch 5.1 introduced `PostgresExecutor` (`src/lib/db/postgresClient.ts`), which connects directly to PostgreSQL via `pg.Pool`.

**Critical Finding:** In both the current Supabase implementation and the current `PostgresExecutor` implementation, every query builder operation (`.insert()`, `.update()`, `.delete()`) runs in **autocommit mode**:
1. Under **Supabase PostgREST**, each query is an independent HTTP request to the PostgREST server. PostgREST does not support multi-table, cross-request database transactions without writing custom PostgreSQL stored procedures (`RPC`).
2. Under the current **`PostgresExecutor`**, every operation calls `runner(sql, params)`, which checks out a client from the pool (or executes against the pool), runs the single SQL statement, and immediately commits.

Consequently, **none of the multi-step business workflows in Tamilnadu Suppliers ERP currently execute inside an atomic database transaction**.

### 1.2 Impact of Workflow Non-Atomicity
If an error occurs halfway through a multi-step workflow (e.g. database constraint violation, network socket reset, application exception, server process crash, or invalid input on subsequent items):
- **Bill Creation:** Master bill header is committed, but line items fail to insert, leaving an empty "ghost" bill in the database with unallocated receivables.
- **Quotation Conversion:** A bill is created and committed, but updating the quotation status to `CONVERTED` fails. An operator retrying the conversion creates duplicate bills and duplicate receivables.
- **Equipment Dispatch:** A gate pass is created and some items are deducted from warehouse inventory, but a later item fails. Warehouse inventory is left out of sync with gate pass line items.
- **Equipment Returns:** Usable equipment is restored to product inventory, but updating the bill's financial settlement fails. The customer remains billed for returned equipment.
- **Payment Collection:** A payment receipt is inserted into `payments`, but updating `bills.amount_paid` and `bills.balance_due` fails. The payment is recorded, but the customer still shows an outstanding balance.

### 1.3 Audit Scope and Safety Guarantee
This audit was performed in **READ-ONLY mode**:
- Zero database connections were opened.
- No SQL statements were executed.
- No schema, configuration, `.env`, or `.env.local` files were altered.
- All existing uncommitted changes in Git were strictly preserved.
- The disposable local database (`tns_disposable_test_2026`) and application role (`tns_app_user`) remain intact for Batch 5.3B/5.3C.

---

## 2. Comprehensive Workflow Inventory

Below is the complete inventory of all application workflows that perform multiple related database writes, analyzed at the source-code level.

---

### Workflow 1: Direct Bill Creation and Line-Item Persistence
- **API Route:** `POST /api/bills` ([`src/app/api/bills/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/bills/route.ts))
- **Source Locations:**
  - Method: `createBill(data)` in [`src/lib/db/supabaseStore.ts:1234-1598`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L1234-L1598)
  - Document Numbering: `getNextDocumentNumber()` in [`src/lib/db/supabaseStore.ts:213-269`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L213-L269)
  - Customer Resolution: `ensureCustomerId()` in [`src/lib/db/supabaseStore.ts:482-547`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L482-L547)
  - Advance Payment: `recordPayment()` in [`src/lib/db/supabaseStore.ts:2664-2740`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L2664-L2740)
- **Exact Sequence of Reads and Writes:**
  1. `READ`: `companies` via `getCompany(companyId)` (line 1235).
  2. `READ & WRITE`: `getNextDocumentNumber(companyId, "INVOICE")`: reads `companies`, checks `bills.bill_number` collisions, then `UPDATE companies SET next_invoice_no = num + 1` (**Autocommitted Write 1**, line 234).
  3. `READ & OPTIONAL WRITE`: `ensureCustomerId()`: checks `customers` by phone/name; if not found, `INSERT INTO customers` (**Autocommitted Write 2**, line 536).
  4. `WRITE`: `INSERT INTO bills` (master header row) (**Autocommitted Write 3**, line 1436).
  5. `WRITE`: Loop `INSERT INTO bill_branches` (**Autocommitted Write 4..N**, line 1463).
  6. `WRITE`: Batch `INSERT INTO bill_items` (**Autocommitted Write N+1**, line 1532).
  7. `WRITE (Conditional)`: If `initialAdvance > 0`, calls `recordPayment()`:
     - `INSERT INTO payments` (**Autocommitted Write N+2**, line 2684).
     - `READ`: `bills` via `getBill(billId)` (line 2693).
     - `UPDATE bills SET amount_paid = ..., advance_paid = ..., balance_due = ..., payment_status = ...` (**Autocommitted Write N+3**, line 2705).
     - `INSERT INTO audit_logs` (payment recorded) (**Autocommitted Write N+4**, line 2714).
  8. `WRITE`: If `!sourceQuotationId`, `INSERT INTO audit_logs` (bill created) (**Autocommitted Write N+5**, line 1575).
- **Separate Autocommitted Operations?** **YES**. Up to 8+ separate operations commit independently.
- **What Remains Committed on Later Failure?**
  - If `bill_items` fails (e.g. price negative, check constraint violation, or network timeout): The master `bills` header and `bill_branches` are permanently committed. The system now contains a bill with ₹0 items or missing items.
  - If `recordPayment` fails on initial advance: The bill exists with full balance due; customer's advance payment record is lost.
  - If bill creation fails after step 2: `companies.next_invoice_no` was already bumped, creating an irreversible number sequence gap.
- **Already Uses Database Transaction or Stored Function?** **NO**.
- **Supabase vs. PostgreSQL Implementation Difference:**
  - Supabase executes 5–8 discrete HTTP requests. Higher latency increases the window for client aborts or network timeouts.
  - PostgreSQL runs over TCP connection pool, lower latency, but still commits each statement independently without explicit transaction boundaries.
- **Minimum Transaction Boundary:**
  - `BEGIN`
  - `INSERT INTO bills`
  - `INSERT INTO bill_branches`
  - `INSERT INTO bill_items`
  - `INSERT INTO payments` (if advance > 0)
  - `UPDATE bills` (payment status / advance balance)
  - `COMMIT`
  *(Customer creation can either precede the transaction or be rolled into it. Audit logs can be written post-commit or within transaction).*
- **External Side Effects:** None in route (PDF and WhatsApp are on-demand endpoints).
- **Concrete Failure-Injection Test:**
  - Create bill with 3 items where the 3rd item has an invalid foreign key or violates a NOT NULL constraint.
  - Assert that `SELECT * FROM bills WHERE id = :id` returns 0 rows (rolled back).

---

### Workflow 2: Quotation Creation, Editing, and Revision
- **API Routes:**
  - `POST /api/quotations` ([`src/app/api/quotations/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/quotations/route.ts))
  - `PUT /api/quotations/[id]` / `PATCH /api/quotations/[id]` ([`src/app/api/quotations/[id]/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/quotations/[id]/route.ts))
  - `POST /api/quotations/[id]/revise` ([`src/app/api/quotations/[id]/revise/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/quotations/[id]/revise/route.ts))
- **Source Locations:**
  - Creation: `createQuotation(data)` in [`src/lib/db/supabaseStore.ts:602-901`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L602-L901)
  - Update / Revision: `updateQuotation(id, updates)` in [`src/lib/db/supabaseStore.ts:902-1023`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L902-L1023)
- **Exact Sequence of Reads and Writes:**
  - **Quotation Creation (`createQuotation`):**
    1. `READ & WRITE`: `getNextDocumentNumber()` -> `UPDATE companies SET next_quotation_no = num + 1` (**Autocommitted Write 1**).
    2. `READ & OPTIONAL WRITE`: `ensureCustomerId()` (**Autocommitted Write 2**).
    3. `WRITE`: `INSERT INTO quotations` (**Autocommitted Write 3**, line 777).
    4. `WRITE`: Loop `INSERT INTO quotation_branches` (**Autocommitted Write 4..N**, line 803).
    5. `WRITE`: Batch `INSERT INTO quotation_items` (**Autocommitted Write N+1**, line 860).
    6. `WRITE`: `INSERT INTO audit_logs` (**Autocommitted Write N+2**, line 880).
  - **Quotation Update / Revision (`updateQuotation`):**
    1. `READ`: `quotations` via `getQuotation(id)` (line 903).
    2. `WRITE`: If items provided, `DELETE FROM quotation_items WHERE quotation_id = :id` (**Autocommitted Write 1**, line 912).
    3. `WRITE`: `INSERT INTO quotation_items` (new items) (**Autocommitted Write 2**, line 933).
    4. `WRITE`: `UPDATE quotations SET ... WHERE id = :id` (**Autocommitted Write 3**, line 941).
    5. `WRITE`: `UPDATE` or `INSERT INTO audit_logs` (**Autocommitted Write 4**, line 997 or 1006).
- **Separate Autocommitted Operations?** **YES**.
- **What Remains Committed on Later Failure?**
  - **CRITICAL DATA LOSS BUG IN UPDATE:** In `updateQuotation`, the `DELETE FROM quotation_items` commits immediately (line 912). If the subsequent `INSERT INTO quotation_items` fails (e.g. malformed item data or DB disconnect), all existing quotation items have been permanently deleted from the database! The quotation header remains with zero line items.
- **Already Uses Database Transaction or Stored Function?** **NO**.
- **Supabase vs. PostgreSQL Implementation Difference:** Identical vulnerability.
- **Minimum Transaction Boundary:**
  - Creation: Wrap `quotations` + `quotation_branches` + `quotation_items`.
  - Update/Revision: Wrap `DELETE FROM quotation_items` + `INSERT INTO quotation_items` + `UPDATE quotations`.
- **External Side Effects:** None.
- **Concrete Failure-Injection Test:**
  - Update an existing quotation having 5 line items with a payload where item 3 has an unmapped or invalid property that triggers an insert failure.
  - Assert that after the failure, the original 5 quotation items are intact (not deleted).

---

### Workflow 3: Quotation Conversion to Rental Bill
- **API Route:** `POST /api/quotations/[id]/convert` ([`src/app/api/quotations/[id]/convert/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/quotations/%5Bid%5D/convert/route.ts))
- **Source Locations:**
  - Method: `convertQuotationToBill(quoteId, customData, opts)` in [`src/lib/db/supabaseStore.ts:1599-1684`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L1599-L1684)
- **Exact Sequence of Reads and Writes:**
  1. `READ`: `quotations` via `getQuotation(quoteId)` (line 1600). Checks `status !== "CONVERTED"`.
  2. `READ`: `companies` via `getCompany(...)` (line 1607).
  3. `EXECUTE`: `createBill(...)` (all 5–8 operations of Workflow 1 are executed and committed) (line 1610).
  4. `WRITE`: `updateQuotation(quoteId, { status: "CONVERTED", convertedBillId, convertedBillNumber, convertedAt })` (**Autocommitted Write**, line 1635).
  5. `WRITE`: `recordAuditLog` for quotation conversion (**Autocommitted Write**, line 1645).
  6. `WRITE`: `recordAuditLog` for bill created from quote (**Autocommitted Write**, line 1662).
- **Separate Autocommitted Operations?** **YES**. Bill creation and quotation conversion status commit independently.
- **What Remains Committed on Later Failure?**
  - If step 4 fails (e.g. quotation lock conflict or network drop): The bill is already committed in `bills`! However, the quotation remains in status `APPROVED` or `ISSUED` with `converted_bill_id = NULL`.
  - The billing clerk, seeing the error screen, presses "Convert to Bill" again. This generates a **second duplicate bill**, double-reserving inventory and creating duplicate customer debits.
- **Already Uses Database Transaction or Stored Function?** **NO**.
- **Supabase vs. PostgreSQL Implementation Difference:** Identical.
- **Minimum Transaction Boundary:**
  - `BEGIN`
  - Bill creation (`bills`, `bill_branches`, `bill_items`, advance payment)
  - `UPDATE quotations SET status = 'CONVERTED', converted_bill_id = ..., converted_bill_number = ..., converted_at = ... WHERE id = :quoteId AND status != 'CONVERTED'`
  - `COMMIT`
- **External Side Effects:** None in the route.
- **Concrete Failure-Injection Test:**
  - Convert a quotation while simulating an error during the quotation status update.
  - Assert that NO bill was created in `bills` with `source_quotation_id = :quoteId` (atomic rollback).

---

### Workflow 4: Equipment Dispatch, Gate-Pass Generation & Inventory Deductions
- **API Routes:**
  - `POST /api/bills/[id]/dispatch` ([`src/app/api/bills/[id]/dispatch/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/bills/%5Bid%5D/dispatch/route.ts))
  - `POST /api/operations/gate-passes` ([`src/app/api/operations/gate-passes/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/operations/gate-passes/route.ts))
- **Source Locations:**
  - Method: `createGatePass(data)` in [`src/lib/db/supabaseStore.ts:2800-2913`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L2800-L2913)
  - Method: `dispatchBillItems(billId, payload)` in [`src/lib/db/supabaseStore.ts:2114-2116`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L2114-L2116)
- **Exact Sequence of Reads and Writes:**
  1. In route: `READ` `bills` and check existing gate passes via `getGatePassesByBillId(id)` (line 21).
  2. `READ & WRITE`: `getNextDocumentNumber()` -> `UPDATE companies SET next_gate_pass_no = num + 1` (**Autocommitted Write 1**).
  3. `WRITE`: `INSERT INTO gate_passes` (master row) (**Autocommitted Write 2**, line 2825).
  4. Loop over dispatch items (`data.items`):
     a. `WRITE`: `INSERT INTO gate_pass_items` (**Autocommitted Write 3a**, line 2842).
     b. `READ`: `products` via `getProduct(productId)` (**Unprotected Read-Modify-Write**, line 2862).
     c. Calculate `newAvail = Math.max(0, prod.availableQuantity - qty)` and `newRented = prod.rentedQuantity + qty`.
     d. `WRITE`: `UPDATE products SET available_quantity = :newAvail, rented_quantity = :newRented WHERE id = :productId` (**Autocommitted Write 3b**, line 2866).
     e. `WRITE`: `INSERT INTO inventory_movements` (type `DISPATCH`, `quantity_change = -qty`, `balance_after = newAvail`) (**Autocommitted Write 3c**, line 2871).
  5. If `billId`: `INSERT INTO audit_logs` (**Autocommitted Write 4**, line 2890).
- **Separate Autocommitted Operations?** **YES**. A gate pass with 5 items executes 2 + (5 * 3) + 1 = 18 independent database writes!
- **What Remains Committed on Later Failure?**
  - If item 4 fails: Items 1–3 have committed gate pass item records, product stock decrements, and inventory movement logs. Items 4–5 have none. The gate pass header exists, but contains partial items and partial inventory deductions.
  - **Concurrency Bug:** Lines 2862–2866 perform non-atomic read-modify-write without row locks (`SELECT ... UPDATE`). Two simultaneous dispatches for the same item will overwrite each other's stock balance, causing permanent inventory drift.
  - *Note:* Batch 4/5 created the stored function `adjust_product_stock_safe` in `standalone-postgres-init.sql`, but `supabaseStore.ts` does NOT yet call it.
- **Already Uses Database Transaction or Stored Function?** **NO**.
- **Supabase vs. PostgreSQL Implementation Difference:**
  - Supabase makes 18 HTTP requests across the public internet, creating an enormous race condition window.
  - PostgreSQL runs over the local pool, but without a transaction, partial writes still persist on failure.
- **Minimum Transaction Boundary:**
  - `BEGIN`
  - `INSERT INTO gate_passes`
  - All `INSERT INTO gate_pass_items`
  - All product stock decrements (`UPDATE products` or `adjust_product_stock_safe`)
  - All `INSERT INTO inventory_movements`
  - `UPDATE bills SET status = 'OUT_ON_RENT'`
  - `COMMIT`
- **External Side Effects:** None in route.
- **Concrete Failure-Injection Test:**
  - Dispatch 4 items. Force an error on item 3 during the stock adjustment.
  - Assert that:
    1. Zero records exist in `gate_passes` for this pass.
    2. Zero records exist in `gate_pass_items`.
    3. Product available/rented quantities for items 1 and 2 are completely unchanged.
    4. Zero movement rows exist in `inventory_movements`.

---

### Workflow 5: Equipment Returns, Physical Inspection & Final Settlement
- **API Routes:**
  - `POST /api/bills/[id]/returns` ([`src/app/api/bills/[id]/returns/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/bills/%5Bid%5D/returns/route.ts))
  - `POST /api/operations/returns` ([`src/app/api/operations/returns/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/operations/returns/route.ts))
  - `PUT /api/bills/[id]` ([`src/app/api/bills/[id]/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/bills/%5Bid%5D/route.ts) -> `saveBillWorkspaceChanges`)
- **Source Locations:**
  - Method: `recordBillReturn(billId, data, actorId)` in [`src/lib/db/supabaseStore.ts:2341-2648`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L2341-L2648)
  - Method: `saveBillWorkspaceChanges(billId, payload)` in [`src/lib/db/supabaseStore.ts:1713-2009`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L1713-L2009)
  - Method: `recordReturn(data)` in [`src/lib/db/supabaseStore.ts:2924-2944`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L2924-L2944)
- **Exact Sequence of Reads and Writes (`recordBillReturn`):**
  1. `READ`: `bills` via `getBill(billId)` (line 2346).
  2. Loop over return items (`data.items`):
     a. `READ`: `products` via `getProduct(productId)` (line 2380).
     b. `WRITE`: `UPDATE products` (restore `available_quantity += good`, decrement `rented_quantity`, increment `damaged_quantity` or `missing_quantity`) (**Autocommitted Write 1a**, line 2383).
     c. `WRITE`: `INSERT INTO inventory_movements` (type `RETURN_GOOD`) (**Autocommitted Write 1b**, line 2391).
     d. `WRITE (Conditional)`: `INSERT INTO inventory_movements` (type `RETURN_DAMAGED`) (line 2402).
     e. `WRITE (Conditional)`: `INSERT INTO inventory_movements` (type `RETURN_MISSING`) (line 2413).
  3. `READ`: `gate_passes` (line 2542). If none found, calls `createGatePass` (another 3+ writes!).
  4. `WRITE`: `INSERT INTO returns` via `recordReturn` (**Autocommitted Write 2**, line 2588 / 2937).
  5. `READ`: `gate_pass_items` (line 2593).
  6. `WRITE`: Batch `INSERT INTO return_items` (**Autocommitted Write 3**, line 2618).
  7. `READ`: `payments` via `getPayments(billId)` (line 2534). Recalculates financials.
  8. `WRITE`: `UPDATE bills` (totals, incidents, approved damages, balance due, status) (**Autocommitted Write 4**, line 2623).
  9. `WRITE`: `INSERT INTO audit_logs` (**Autocommitted Write 5**, line 2630).
- **Exact Sequence of Reads and Writes (`saveBillWorkspaceChanges`):**
  1. `READ`: `bills` via `getBill(billId)` (line 1714).
  2. Compute delta between previous and newly submitted item quantities.
  3. Loop over delta products:
     a. `READ`: `products` via `getProduct(...)`.
     b. `WRITE`: `UPDATE products` (**Autocommitted Write**).
     c. `WRITE`: `INSERT INTO inventory_movements` (**Autocommitted Write**).
  4. `WRITE`: Concurrent `Promise.all` updating `bill_items.quantity_physically_returned` (**Autocommitted Writes**, line 1933).
  5. `READ`: `payments` via `getPayments(billId)`.
  6. `WRITE`: `UPDATE bills` (totals, financial recalculation, status) (**Autocommitted Write**, line 1977).
  7. `WRITE`: `INSERT INTO audit_logs` (**Autocommitted Write**, line 1988).
- **Separate Autocommitted Operations?** **YES**. This is the most complex write workflow in the application, executing between 15 and 40 separate queries without a transaction.
- **What Remains Committed on Later Failure?**
  - If step 8 (`UPDATE bills`) fails: Usable equipment has already been restored to warehouse inventory, damaged items marked, and return records inserted. However, the bill does NOT reflect the return! The customer continues to be billed for rental days on items they already handed over to the warehouse.
  - In `saveBillWorkspaceChanges`: If `Promise.all(billItemUpdates)` throws halfway through, some line items show returned quantities and others do not, leaving line item totals conflicting with master bill totals.
- **Already Uses Database Transaction or Stored Function?** **NO**.
- **Supabase vs. PostgreSQL Implementation Difference:** Identical.
- **Minimum Transaction Boundary:**
  - `BEGIN`
  - All product stock restorations / adjustments (`products`)
  - All `inventory_movements`
  - `INSERT INTO returns`
  - All `INSERT INTO return_items`
  - All `UPDATE bill_items`
  - `UPDATE bills` (financial settlement & status)
  - `COMMIT`
- **External Side Effects:** None.
- **Concrete Failure-Injection Test:**
  - Record a return where the bill update throws an error at the end.
  - Assert that product stock quantities revert to their pre-test values and no return record exists in `returns`.

---

### Workflow 6: Payment Recording, Financial Status & Audit Records
- **API Routes:**
  - `POST /api/bills/[id]/payments` ([`src/app/api/bills/[id]/payments/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/bills/%5Bid%5D/payments/route.ts))
  - `POST /api/finance/payments` ([`src/app/api/finance/payments/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/finance/payments/route.ts))
- **Source Locations:**
  - Method: `recordPayment(data)` in [`src/lib/db/supabaseStore.ts:2664-2740`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L2664-L2740)
- **Exact Sequence of Reads and Writes:**
  1. `WRITE`: `INSERT INTO payments` (**Autocommitted Write 1**, line 2684).
  2. If `data.billId`:
     a. `READ`: `bills` via `getBill(data.billId)` (**Unprotected Read**, line 2693).
     b. Compute `newPaid = amountPaid + payment.amount`, `newBalance = grandTotal - totalPaid`.
     c. `WRITE`: `UPDATE bills SET amount_paid = :newPaid, balance_due = :newBalance, payment_status = :status WHERE id = :billId` (**Autocommitted Write 2**, line 2705).
     d. `WRITE`: `INSERT INTO audit_logs` (**Autocommitted Write 3**, line 2714).
- **Separate Autocommitted Operations?** **YES**.
- **What Remains Committed on Later Failure?**
  - If step 2c (`UPDATE bills`) fails: A payment receipt is committed in `payments`, but the bill's `amount_paid` and `balance_due` are NOT updated. Accounts receivable reports will falsely show the customer in default.
  - **Concurrency / Race Condition:** If two payments for the same bill are processed concurrently, both read the same initial `amountPaid` (step 2a), compute `amountPaid + payment.amount`, and the second update overwrites the first. One payment amount is lost from the bill's ledger balance!
- **Already Uses Database Transaction or Stored Function?** **NO**.
- **Supabase vs. PostgreSQL Implementation Difference:** Identical. Under PostgreSQL, row-level locking (`SELECT ... FOR UPDATE`) is easily possible.
- **Minimum Transaction Boundary:**
  - `BEGIN`
  - `SELECT id, grand_total, amount_paid, advance_paid FROM bills WHERE id = :billId FOR UPDATE` (row lock)
  - `INSERT INTO payments`
  - `UPDATE bills SET amount_paid = ..., balance_due = ..., payment_status = ...`
  - `COMMIT`
- **External Side Effects:** None in route.
- **Concrete Failure-Injection Test:**
  - Inject an error into `UPDATE bills` during `recordPayment`.
  - Assert that `payments` contains no record of the payment (atomic rollback).

---

### Workflow 7: Bill Closure, Incident Finalization & Reopening
- **API Routes:**
  - `POST /api/bills/[id]/close` ([`src/app/api/bills/[id]/close/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/bills/%5Bid%5D/close/route.ts))
  - `POST /api/bills/[id]/reopen` ([`src/app/api/bills/[id]/reopen/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/bills/%5Bid%5D/reopen/route.ts))
  - `POST /api/bills/[id]/amend` ([`src/app/api/bills/[id]/amend/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/bills/%5Bid%5D/amend/route.ts))
  - `POST /api/bills/[id]/incidents/[incidentId]` ([`src/app/api/bills/[id]/incidents/[incidentId]/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/bills/%5Bid%5D/incidents/%5BincidentId%5D/route.ts))
- **Source Locations:**
  - Method: `closeBill(billId, payload)` in [`src/lib/db/supabaseStore.ts:2011-2086`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L2011-L2086)
  - Method: `reopenBill(billId, reason)` in [`src/lib/db/supabaseStore.ts:2088-2112`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L2088-L2112)
  - Method: `amendBill(billId, amendment)` in [`src/lib/db/supabaseStore.ts:2182-2258`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L2182-L2258)
  - Method: `resolveDamageMissingIncident(billId, incidentId, decision)` in [`src/lib/db/supabaseStore.ts:2260-2327`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L2260-L2327)
- **Exact Sequence (`closeBill`):**
  1. `READ`: `bills` via `getBill(billId)` (checks for unresolved incidents).
  2. If `payload.paymentReceivedInFull`: calls `recordPayment` (`INSERT INTO payments` + `UPDATE bills`).
  3. `WRITE`: `UPDATE bills SET status = 'CLOSED'`.
  4. `WRITE`: `INSERT INTO audit_logs`.
- **Separate Autocommitted Operations?** **YES**.
- **What Remains Committed on Later Failure?**
  - Payment is recorded and committed, but the bill remains open.
- **Minimum Transaction Boundary:** Wrap final payment and bill status update in a single transaction.

---

### Workflow 8: Bulk Product Import
- **API Route:** `POST /api/products/import` ([`src/app/api/products/import/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/products/import/route.ts))
- **Source Locations:**
  - Route: [`src/app/api/products/import/route.ts:44-73`](file:///D:/tamilnadu-suppliers/src/app/api/products/import/route.ts#L44-L73)
  - Category Creation: `createCategory()` in [`src/lib/db/supabaseStore.ts:285-300`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L285-L300)
  - Product Creation: `createProduct()` in [`src/lib/db/supabaseStore.ts:341-375`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L341-L375)
- **Exact Sequence:**
  1. Parse Excel buffer.
  2. For missing categories: `INSERT INTO categories` (loop, separate autocommits).
  3. For each valid row: `INSERT INTO products` (loop, separate autocommits).
- **Separate Autocommitted Operations?** **YES**. 100 products imported via loop of 100 individual `INSERT` statements.
- **What Remains Committed on Later Failure?**
  - If row 60 violates a unique constraint on SKU, rows 1–59 remain committed in the database. The client receives a 500 error, and subsequent re-imports fail due to SKU collisions on the first 59 rows.
- **Minimum Transaction Boundary:** Wrap all category and product inserts in a single transaction.

---

### Workflow 9: Document Sequence Number Generation
- **Source Location:** `getNextDocumentNumber()` in [`src/lib/db/supabaseStore.ts:213-269`](file:///D:/tamilnadu-suppliers/src/lib/db/supabaseStore.ts#L213-L269)
- **Exact Sequence:**
  1. `READ`: `companies` (line 214).
  2. In while loop: `SELECT id FROM bills WHERE bill_number = :candidate` (line 226).
  3. `WRITE`: `UPDATE companies SET next_invoice_no = num + 1` (**Autocommitted Write**, line 234).
- **Separate Autocommitted Operations?** **YES**.
- **Vulnerability:** The company's `next_invoice_no` counter is committed before the document is ever created. If bill creation subsequently fails, a sequence gap is created. Furthermore, two concurrent requests can check the same candidate before either commits, resulting in a unique constraint violation for one user.
- **Minimum Transaction Boundary:** Wrap document number reservation inside the document creation transaction, or use a PostgreSQL sequence / row lock on the company record (`SELECT ... FOR UPDATE`).

---

## 3. Ranked Risk Classification

| Level | Workflows Affected | Why It Is Dangerous | Business Invariant Threatened |
| :--- | :--- | :--- | :--- |
| **CRITICAL** | **Workflow 4 (Dispatch & Gate Passes)**<br>**Workflow 5 (Returns & Settlements)** | Dispatches and returns directly alter physical warehouse stock counts across `products`, `gate_pass_items`, `return_items`, and `inventory_movements`. A partial failure causes **physical inventory divergence** (software says 20 items in warehouse, but only 10 physically exist). | **Physical Stock Balance = Owned − Rented − Damaged − Missing.** Non-atomic updates corrupt physical asset accounting. |
| **HIGH** | **Workflow 1 (Bill Creation)**<br>**Workflow 3 (Quotation Conversion)**<br>**Workflow 6 (Payments)** | Partial bill creation leaves orphan headers without items. Quotation conversion failure leaves quotes unconverted, triggering duplicate billing. Payment failure leaves money collected without decrementing bill balance. | **Document Integrity & AR Accuracy.** Master documents must never exist without their corresponding line items or unapplied cash receipts. |
| **MEDIUM** | **Workflow 2 (Quotation Revision)**<br>**Workflow 7 (Bill Close/Reopen)**<br>**Workflow 8 (Bulk Product Import)** | In quotation revision, deleting lines before inserting new lines risks wiping line items entirely if insert throws. In product import, partial failure requires manual database cleanup. | **Operational Continuity & Data Loss Prevention.** Modifications must never discard existing state before replacement state is verified. |
| **LOW** | **Audit Logging**<br>**Activity Notifications** | Failure to insert an audit log record does not corrupt business invariants or financial ledgers. | **Compliance & Traceability.** Handled gracefully via non-fatal try/catch blocks. |

---

## 4. Recommended Transaction Boundaries

To avoid prolonged database lock contention, transaction boundaries must be strictly scoped to the database operations necessary to preserve consistency, keeping external I/O strictly outside the boundary.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RECOMMENDED TRANSACTION BOUNDARY                      │
│                                                                             │
│  1. Fast in-memory validation (Zod / TypeScript guards)                     │
│  2. Read external prerequisites (Company settings, tax profiles)            │
│                                                                             │
│  ╔═══════════════════════ ATOMIC DB TRANSACTION ═════════════════════════╗  │
│  ║                                                                       ║  │
│  ║  BEGIN                                                                ║  │
│  ║  - Acquire row locks if updating existing balances (FOR UPDATE)       ║  │
│  ║  - Write master record (Bill / Return / Gate Pass / Payment)          ║  │
│  ║  - Write child line items (Items / Branches)                          ║  │
│  ║  - Apply inventory balance changes (Atomic adjustment function)       ║  │
│  ║  - Insert movement audit ledger (inventory_movements)                 ║  │
│  ║  - Update linked parent status (e.g. Quotation status = 'CONVERTED')  ║  │
│  ║  COMMIT                                                               ║  │
│  ║                                                                       ║  │
│  ╚════════════════════════════════════════════════════════════════════════╝  │
│                                                                             │
│  3. Non-transactional post-commit tasks (OUTSIDE TRANSACTION):              │
│     - Generate PDF document                                                 │
│     - Format WhatsApp handoff URL / send notifications                      │
│     - Best-effort audit logging (if not in transaction)                     │
│     - Return HTTP 201 response to client                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Critical Side-Effect Isolation Rule
**PDF generation and WhatsApp messaging MUST NEVER occur inside a database transaction:**
- In [`src/app/api/documents/bill/[id]/pdf/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/documents/bill/%5Bid%5D/pdf/route.ts), jsPDF renders a PDF buffer in memory. Doing this inside a transaction holds PostgreSQL row locks during CPU-intensive PDF rendering.
- In [`src/app/api/whatsapp/share/route.ts`](file:///D:/tamilnadu-suppliers/src/app/api/whatsapp/share/route.ts), WhatsApp handoff URL generation is already an isolated, non-transactional GET/POST.
- Keeping these outside database transactions prevents connection starvation under load.

---

## 5. Proposed Backward-Compatible Transaction API

To implement transaction support without breaking existing application code, Supabase compatibility, or test harnesses, we propose extending `PostgresExecutor` with a dedicated `.transaction()` helper.

### 5.1 Architecture Design

```
                          ┌───────────────────────────┐
                          │       SupabaseStore       │
                          │   (Application Service)   │
                          └─────────────┬─────────────┘
                                        │
                         withTransaction(async (tx) => ...)
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 ▼                                             ▼
       DB_PROVIDER = "postgres"                      DB_PROVIDER = "supabase"
  ┌─────────────────────────────┐               ┌─────────────────────────────┐
  │      PostgresExecutor       │               │      Supabase Admin Client  │
  │     .transaction(fn)        │               │      (PostgREST Fallback)   │
  └──────────────┬──────────────┘               └──────────────┬──────────────┘
                 │                                             │
      Acquire dedicated client                         Sequential execution
      client.query("BEGIN")                            (or stored function)
      tx = new PostgresExecutor(client)
      await fn(tx)
      client.query("COMMIT") / ROLLBACK
      client.release()
```

### 5.2 Extended `PostgresExecutor` Interface (`src/lib/db/postgresClient.ts`)

In `PostgresExecutor`:
```typescript
export class PostgresExecutor {
  private runner: QueryRunner;
  private client: PoolClient | null = null;

  constructor(clientOrPoolOrRunner?: PoolClient | Pool | QueryRunner) {
    if (typeof clientOrPoolOrRunner === "function") {
      this.runner = clientOrPoolOrRunner;
    } else if (clientOrPoolOrRunner && "query" in clientOrPoolOrRunner && "release" in clientOrPoolOrRunner) {
      // Dedicated client checkout for an active transaction
      this.client = clientOrPoolOrRunner as PoolClient;
      this.runner = (sql, params) => (clientOrPoolOrRunner as PoolClient).query(sql, params);
    } else if (clientOrPoolOrRunner) {
      this.runner = (sql, params) => (clientOrPoolOrRunner as Pool).query(sql, params);
    } else {
      this.runner = (sql, params) => getPostgresPool().query(sql, params);
    }
  }

  from(tableName: string): PostgresQueryBuilder {
    return new PostgresQueryBuilder(tableName, this.runner);
  }

  rpc(fn: string, args: Record<string, any> = {}): Promise<PostgresQueryResult<any>> {
    ...
  }

  /**
   * Executes a callback within an atomic PostgreSQL transaction.
   * Checks out a dedicated client from the pool, begins a transaction,
   * passes a scoped PostgresExecutor bound to that client, and commits on success.
   * Automatically executes ROLLBACK and releases the client on any thrown error.
   */
  async transaction<T>(callback: (tx: PostgresExecutor) => Promise<T>): Promise<T> {
    if (this.client) {
      // Already running within a dedicated transaction client
      return callback(this);
    }

    const pool = getPostgresPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const scopedExecutor = new PostgresExecutor(client);
      const result = await callback(scopedExecutor);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        console.error("[POSTGRES TRANSACTION ROLLBACK ERROR]", rollbackErr);
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
```

### 5.3 Service-Layer Transaction Adapter (`SupabaseStore`)
To ensure compatibility with Supabase Cloud during migration:
```typescript
export class SupabaseStore {
  /**
   * Universal transaction wrapper:
   * When DB_PROVIDER='postgres', executes atomically inside PostgresExecutor.transaction.
   * When DB_PROVIDER='supabase', executes sequentially (preserving current production behavior).
   */
  async withTransaction<T>(
    callback: (storeOrExecutor: any) => Promise<T>
  ): Promise<T> {
    if (resolveDbProvider() === "postgres") {
      const { postgresExecutor } = await import("./postgresClient");
      return postgresExecutor.transaction((tx) => callback(tx));
    }
    // Supabase fallback: execute using existing PostgREST client
    return callback(this.supabase);
  }
}
```

---

## 6. Required Rollback and Concurrency Tests

For implementation in Batch 5.3B, the following automated integration tests must be created in `tests/transaction-postgres-real-db.test.ts` against the disposable local PostgreSQL database:

### Test Scenario 1: Bill Creation Atomicity on Child Failure
- **Action:** Call `createBill` with 3 items, where item 3 has an invalid product foreign key or fails a check constraint.
- **Verification:**
  1. `createBill` throws error.
  2. Query `SELECT count(*) FROM bills WHERE id = :id` -> must return 0.
  3. Query `SELECT count(*) FROM bill_items WHERE bill_id = :id` -> must return 0.
  4. Query `SELECT count(*) FROM payments WHERE bill_id = :id` -> must return 0.

### Test Scenario 2: Quotation Conversion Atomicity on Quote Lock Failure
- **Action:** Convert a quotation, but inject an artificial failure or constraint error during the quotation status update.
- **Verification:**
  1. Conversion throws error.
  2. Quotation status remains `APPROVED`.
  3. No orphan bill exists in `bills`.

### Test Scenario 3: Dispatch and Stock Adjustment Rollback
- **Action:** Dispatch equipment with 3 line items; fail the 3rd item's stock deduction.
- **Verification:**
  1. `createGatePass` throws error.
  2. Gate pass row does not exist.
  3. Products 1 and 2 available/rented quantities remain completely unchanged.
  4. Zero records inserted into `inventory_movements`.

### Test Scenario 4: Return and Settlement Rollback
- **Action:** Record return; simulate a database error during the final `bills` settlement update.
- **Verification:**
  1. `recordBillReturn` throws error.
  2. Product inventory quantities remain at their pre-return values.
  3. No return record exists in `returns`.

### Test Scenario 5: Concurrent Payment Serialization (`SELECT FOR UPDATE`)
- **Action:** Launch 20 concurrent payment recordings of ₹100 each against a single bill with grand total ₹5,000.
- **Verification:**
  1. All 20 payments succeed without deadlocks.
  2. `bills.amount_paid` precisely equals ₹2,000.00 (zero lost updates).
  3. `bills.balance_due` precisely equals ₹3,000.00.

---

## 7. Migration Risks and Recommended Implementation Sequence

### 7.1 Risks and Mitigations

| Risk | Probability | Severity | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Connection Pool Starvation** | Medium | High | Keep transactions short (< 50ms). Never perform PDF generation, bcrypt hashing, or network requests inside a transaction. Set statement timeout to 5,000ms. |
| **Deadlocks between Concurrent Operations** | Low | High | Ensure consistent table access order across all workflows (e.g. Always lock `bills` before `payments`; always sort product IDs alphabetically before locking products). |
| **Breaking Supabase Cloud in Production** | Zero | Critical | Use `resolveDbProvider()` guard. When provider is `supabase`, fallback gracefully to current autocommit behavior. Supabase production is untouched. |
| **Uncommitted Code Drift** | Zero | High | All Batch 5.3 work is segregated. No application changes until Batch 5.3B approval. |

### 7.2 Recommended Step-by-Step Sequence

```
  [COMPLETED] Batch 5.1: Standalone schema & basic query adapter validated
         │
  [COMPLETED] Batch 5.2: Rate-limit & stock adjustment concurrency validated
         │
  [COMPLETED] Batch 5.3A: Application workflow & transaction safety audit
         │
         ▼  (Requires User Approval to Proceed)
  [NEXT STEP] Batch 5.3B: Design & Implement Transaction Support
         - Add .transaction() to PostgresExecutor
         - Add unit & rollback tests in tests/transaction-postgres-real-db.test.ts
         - Wrap priority workflows (Dispatch, Returns, Bill Creation, Payments)
         │
         ▼
  [STAGE 3]   Batch 5.3C: Local Next.js Application Full End-to-End Test
         - Run Next.js against tns_disposable_test_2026 without touching .env
         │
         ▼
  [STAGE 4]   Batch 6: Coolify Staging Provisioning & Production Migration
```

---

## 8. Explicitly Unverified Assumptions

1. **Supabase PostgREST Production Architecture:** It is assumed that current production Supabase has tolerated non-atomic writes because current traffic is relatively low and concurrent collisions have been rare. Production has been relying on application-level try/catch blocks rather than database ACID boundaries.
2. **Third-Party Payment Gateways:** The audit found no automated payment gateway webhooks (Razorpay/Stripe); all payment entries in `src/app/api/finance/payments` and `bills/[id]/payments` are manually initiated by users. If asynchronous webhooks are introduced in the future, idempotent webhooks and transactions will be strictly mandatory.
3. **Default Isolation Level:** The local test database uses PostgreSQL's default `READ COMMITTED` isolation level. For stock adjustments and payments, explicit row locks (`SELECT ... FOR UPDATE` or stored procedures) are required to avoid lost updates under `READ COMMITTED`.
4. **Disposable Database Preservation:** It is assumed that `tns_disposable_test_2026` and `tns_app_user` on `127.0.0.1:5432` remain available for Batch 5.3B without requiring recreation.

---
**End of Audit Report — Batch 5.3A Complete.**
