# Standalone PostgreSQL Schema Validation & Cutover Plan

**Project:** Tamilnadu Suppliers Rental ERP  
**Baseline Commit:** `0e9d2ee`  
**Status:** Updated for Batch 3.1 Review  
**Purpose:** Staged protocol for validating standalone PostgreSQL schema, verifying data integrity, testing RPC performance, and defining safe rollback strategies prior to any production traffic cutover.  
**Mode:** Planning & Verification Protocol (no database execution authorized in this batch).

---

## 1. Validation Overview & Phase Gates

The migration from Supabase Cloud to standalone PostgreSQL on Coolify must proceed through distinct, non-overlapping phase gates. No phase may begin until the preceding phase satisfies all acceptance criteria:

```
[Phase 1: Isolated Environment Setup]
                 │
                 ▼
[Phase 2: Schema DDL & Structure Verification]
                 │
                 ▼
[Phase 3: Rate Limiting & Stored RPC Tests]
                 │
                 ▼
[Phase 4: Staged Data Migration & Row Reconciliation]
                 │
                 ▼
[Phase 5: Application Adapter & Security Verification]
                 │
                 ▼
[Phase 6: Backup, Restore & Rollback Drill]
                 │
                 ▼
[Production Cutover Decision Gate]
```

---

## 2. Phase 1: Isolated Test Database Provisioning (Coolify)

1. **Network Isolation:**
   * Database container deployed on Coolify's internal Docker network (`bridge` or dedicated overlay).
   * **Public Port Unexposed:** The external database port (5432) must remain unchecked/unexposed to the public Internet.
   * Access restricted exclusively to internal container communication and private SSH bastion tunnels for administrator access.
2. **Dedicated User & Database:**
   * Dedicated database: `tamilnadu_suppliers`
   * Dedicated non-superuser: `tns_app_user`
   * Password stored securely in Coolify application environment variables (`DATABASE_URL`).
3. **No Production Impact:**
   * Production traffic remains on Supabase Cloud.
   * `DB_PROVIDER` remains unset or `'supabase'` in the production environment.

---

## 3. Phase 2: Schema DDL, Constraints & Index Validation

1. **DDL Initialization:**
   * Execute the standalone schema initialization SQL script inside the isolated container using `psql`.
2. **Automated Schema Audit Queries:**
   * **Table Count Audit:** Verify all 26 tables exist in `information_schema.tables` under schema `'public'`:
     ```sql
     SELECT COUNT(*) FROM information_schema.tables 
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
     ```
   * **Primary Key Audit:** Confirm every table has an active primary key constraint (`conrelid` in `pg_constraint` with `contype = 'p'`).
   * **Foreign Key Audit:** Verify that cascading delete constraints (`ON DELETE CASCADE`) are active for document lines (`quotation_items`, `bill_items`, `quotation_branches`, `bill_branches`, `gate_pass_items`, `return_items`).
   * **Index Verification:** Validate that all performance and search indexes exist in `pg_indexes`.
   * **Identifier Type Uniformity:** Confirm that parent-child foreign key reference pairs share matching datatypes.

---

## 4. Phase 3: Stored Functions & RPC Behavior Tests

1. **Security Definer & Search Path Audit:**
   * Confirm that all three rate-limit functions (`login_rate_limit_status`, `login_rate_limit_record_failure`, `login_rate_limit_clear`) have `search_path = public` set in `pg_proc` to prevent path hijacking.
2. **RPC Functional Verification:**
   * **Status Check:** Call `login_rate_limit_status('test-key')` and verify it returns `blocked = false, retry_after_seconds = 0`.
   * **Atomic Increment:** Call `login_rate_limit_record_failure('test-key', 5, 900, 900)` repeatedly:
     * Attempts 1 through 4: Verify `blocked = false`.
     * Attempt 5: Verify `blocked = true, retry_after_seconds > 0, attempts = 5`.
   * **Clear:** Call `login_rate_limit_clear('test-key')` and verify subsequent status call returns `blocked = false`.
3. **Permission Grants:**
   * Verify that `tns_app_user` has `EXECUTE` privileges on all functions and full CRUD privileges on `public.login_rate_limits`.
   * Confirm no references to non-existent Supabase roles (`service_role`, `anon`, `authenticated`).

---

## 5. Phase 4: Staged Data Migration & Reconciliation

1. **Zero-Downtime Data Extraction:**
   * Extract historical rows from Supabase Cloud using clean JSON or CSV table dumps.
   * Preserve original created/updated timestamps without letting defaults overwrite them.
2. **Automated Row-Count Reconciliation Matrix:**
   * Compare row counts between Supabase and PostgreSQL for every table:
     $$\Delta = \text{Count}_{\text{PostgreSQL}} - \text{Count}_{\text{Supabase}} = 0$$
3. **Foreign Key Integrity Verification:**
   * Execute orphan-detection queries across parent-child relationships:
     * Quotations vs Quotation Items
     * Bills vs Bill Items
     * Bills vs Payments
     * Gate Passes vs Gate Pass Items
     * Returns vs Return Items
4. **Document Financial Checksums:**
   * Sum `grand_total` and `balance_due` across all bills on Supabase vs PostgreSQL to confirm zero precision loss during data migration:
     $$\sum \text{grand\_total}_{\text{PostgreSQL}} == \sum \text{grand\_total}_{\text{Supabase}}$$

---

## 6. Phase 5: Permission & Connection Pool Validation

1. **Principle of Least Privilege:**
   * `tns_app_user` must possess `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `REFERENCES` on all public tables and `USAGE` on all sequences (if any).
   * Superuser permissions (`SUPERUSER`, `CREATEROLE`, `CREATEDB`) must be denied to the runtime user.
2. **Connection Pool Stress Check:**
   * Configure pool bounds (`DATABASE_POOL_MIN=2`, `DATABASE_POOL_MAX=10`).
   * Test simulated concurrent load using `pg` client to verify connection timeout handling, idle connection cleanup (30s), and resilience against dropped TCP sockets.
3. **Document Numbering Call-Site Test:**
   * Execute `getNextDocumentNumber(companyId, "INVOICE")`, `getNextDocumentNumber(companyId, "QUOTATION")`, and `getNextDocumentNumber(companyId, "GATE_PASS")` against standalone PostgreSQL to verify document counter incrementation and collision checks without runtime errors.

---

## 7. Phase 6: Backup, Restore & Rollback Strategy

### Backup & Restore Verification Drill
Before any production cutover, a full backup and restore drill must be executed on Coolify:
1. **Automated Dump Execution:**
   ```bash
   pg_dump -U tns_app_user -d tamilnadu_suppliers -F c -b -v -f /backups/tns_pre_cutover.dump
   ```
2. **Restore Test on Clean Database:**
   * Restore the dump to a temporary database `tns_restore_verify`:
     ```bash
     pg_restore -U tns_app_user -d tns_restore_verify -v /backups/tns_pre_cutover.dump
     ```
   * Confirm that table counts, row counts, and indexes match the source.

### Production Rollback Strategy
If post-cutover operational anomalies occur (e.g. unexpected connection saturation, query timeouts, application errors):
1. **Instant Application Rollback:**
   * In Coolify environment settings, update `DB_PROVIDER`:
     ```env
     DB_PROVIDER=supabase
     ```
   * Trigger a container restart. Within 30 seconds, the application immediately routes all queries back to Supabase Cloud.
2. **Delta Data Reconciliation:**
   * If writes occurred on PostgreSQL prior to rollback, execute an export query on `created_at > [cutover_timestamp]` across `bills`, `quotations`, `payments`, `gate_passes`, and `returns`.
   * Re-import new records back into Supabase Cloud to ensure no business transactions are lost.

---

## 8. Final Acceptance Criteria for Production Cutover

Production cutover to standalone PostgreSQL (`DB_PROVIDER=postgres`) is authorized **only** when all of the following conditions are satisfied:

- [ ] Standalone PostgreSQL container provisioned privately on Coolify with port 5432 unexposed.
- [ ] Schema DDL initialized with zero errors and all 26 tables, constraints, and indexes verified.
- [ ] All 3 rate-limit stored functions verified via direct test calls.
- [ ] Data migration completed with 100% row-count equality across all tables.
- [ ] Financial checksums (`grand_total`, `balance_due`) match exactly between Supabase and PostgreSQL.
- [ ] Backup and restore drill successfully executed on Coolify.
- [x] Provider-independent code correction for bill-number collision check in `supabaseStore.ts` implemented and regression-tested (Batch 3.2).
- [ ] Non-database test suites (`npm run test:security`, `npx tsc --noEmit`, `npm run build`) passing cleanly.
- [ ] User sign-off obtained on final schema review.
