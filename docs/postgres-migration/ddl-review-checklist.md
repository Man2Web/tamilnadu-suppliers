# Standalone PostgreSQL Initialization DDL Review Checklist (Batch 4)

**Project:** Tamilnadu Suppliers Rental ERP  
**Target File:** [`supabase/standalone-postgres-init.sql`](file:///D:/tamilnadu-suppliers/supabase/standalone-postgres-init.sql)  
**Baseline Commit:** `0e9d2ee`  
**Review Status:** **FOR CODE REVIEW ONLY — NOT EXECUTED AGAINST ANY DATABASE**  
**Active Application Provider:** Supabase Cloud (`DB_PROVIDER` remains unset)

---

## 1. Categorized Verification Framework

Every item in this review checklist is explicitly classified using one of three formal categories:
* **`[VERIFIED FROM SOURCE]`**: Proved directly by SQL statements in `supabase/migrations/`, TypeScript models in `src/lib/types/`, or mapper functions in `src/lib/db/mappers.ts`.
* **`[INFERRED ARCHITECTURAL DECISION]`**: Derived from system behavior, security hardening best practices, or call-site conventions; documented with full rationale.
* **`[REQUIRES RUNTIME VALIDATION]`**: Cannot be confirmed purely by static inspection; must be tested against an active, isolated PostgreSQL 16+ instance in a future phase.

---

## 2. All 26 Tables Coverage Matrix

| # | Table Name | PK Column | PK Type & Default | Migration Origin | Application Usage Status | Disposition in DDL | Verification Level |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `companies` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012`, `20261017` | Active in Store (8 issuing entities) | Defined with all 28 columns | `[VERIFIED FROM SOURCE]` |
| **2** | `users` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012`, `20261016`, `20261017` | Active in Store & Auth | Defined with role constraint & username index | `[VERIFIED FROM SOURCE]` |
| **3** | `categories` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012`, `20261017` | Active in Store (6 categories) | Defined with `name UNIQUE`, `code VARCHAR(50)`, self-referencing `parent_id` (Batch 4.2: restored `code` & `name UNIQUE`, removed `display_order`) | `[VERIFIED FROM SOURCE]` |
| **4** | `products` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012`, `20261017` | Active in Store | Defined with all 24 columns, `sku UNIQUE`, `rental_rate_unit` check, non-negative stock checks (Batch 4.2: restored 10 missing/misnamed columns) | `[VERIFIED FROM SOURCE]` |
| **5** | `product_imports` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012` | Legacy / Batch Uploads (0 app calls) | Retained for schema parity | `[VERIFIED FROM SOURCE]` |
| **6** | `customers` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012`, `20261017` | Active in Store | Defined with `branches JSONB` & `phone` | `[VERIFIED FROM SOURCE]` |
| **7** | `customer_branches` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012` | Active in Store (allowlisted) | Defined with `ON DELETE CASCADE` | `[VERIFIED FROM SOURCE]` |
| **8** | `quotations` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012`, `20261015`, `20261017` | Active in Store | Defined with `document_lines`, `notes_list` | `[VERIFIED FROM SOURCE]` |
| **9** | `quotation_branches` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012`, `20261017` | Active in Store | Defined with `ON DELETE CASCADE` | `[VERIFIED FROM SOURCE]` |
| **10** | `quotation_items` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012`, `20261015`, `20261017` | Active in Store | Defined with `entry_type`, note checks | `[VERIFIED FROM SOURCE]` |
| **11** | `bills` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012`, `20261015`, `20261017` | Active in Store | Defined with `bill_number UNIQUE`, financials | `[VERIFIED FROM SOURCE]` |
| **12** | `bill_branches` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012`, `20261017` | Active in Store | Defined with `ON DELETE CASCADE` | `[VERIFIED FROM SOURCE]` |
| **13** | `bill_items` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012`, `20261015`, `20261017` | Active in Store | Defined with physical return qty, note checks | `[VERIFIED FROM SOURCE]` |
| **14** | `reservations` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012` | Legacy / Future Booking (0 app calls) | Retained for schema parity | `[VERIFIED FROM SOURCE]` |
| **15** | `reservation_items` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012` | Legacy / Future Booking (0 app calls) | Retained for schema parity | `[VERIFIED FROM SOURCE]` |
| **16** | `gate_passes` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012`, `20261017` | Active in Store & Dispatch | Defined with company/bill links | `[VERIFIED FROM SOURCE]` |
| **17** | `gate_pass_items` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012` | Active in Store & Dispatch | Defined with `ON DELETE CASCADE` | `[VERIFIED FROM SOURCE]` |
| **18** | `returns` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012`, `20261017` | Active in Store & Inspection | Defined with gate pass link | `[VERIFIED FROM SOURCE]` |
| **19** | `return_items` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012` | Active in Store & Inspection | Defined with `ON DELETE CASCADE` | `[VERIFIED FROM SOURCE]` |
| **20** | `inventory_movements` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012` | Active in Store (Audit trail) | Defined with `movement_type` check | `[VERIFIED FROM SOURCE]` |
| **21** | `payments` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012`, `20261017` | Active in Store (Financials) | Defined with `bill_id ON DELETE SET NULL` | `[VERIFIED FROM SOURCE]` |
| **22** | `sessions` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012`, `20261016`, `20261017` | Active in Auth Service | Defined with `token VARCHAR(255) UNIQUE NOT NULL`, rejection tracking & status (Batch 4.2: restored `token` over `token_hash`) | `[VERIFIED FROM SOURCE]` |
| **23** | `whatsapp_logs` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012` | Legacy / Direct Web Handoff | Retained for schema parity | `[VERIFIED FROM SOURCE]` |
| **24** | `audit_logs` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261012`, `20261016` | Active in Store & Security Audit | Defined with entity/actor columns | `[VERIFIED FROM SOURCE]` |
| **25** | `activity_notifications` | `id` | `VARCHAR(100) DEFAULT gen_random_uuid()::text` | `20261016`, `20261017` | Active in Store (Super Admin alerts) | Defined with `user_id ON DELETE CASCADE` | `[VERIFIED FROM SOURCE]` |
| **26** | `login_rate_limits` | `key` | `TEXT PRIMARY KEY` | `20261023` | Active in Auth Rate Limiter | Defined with window indexing & attempts | `[VERIFIED FROM SOURCE]` |

---

## 3. Explicit PK/FK Relationship Mapping & Deletion Semantics

In Migration 4 (`20261017`), 14 parent tables were altered to `VARCHAR(100)`, while several child tables were left as `UUID`, creating datatype incompatibilities in PostgreSQL. In [`supabase/standalone-postgres-init.sql`](file:///D:/tamilnadu-suppliers/supabase/standalone-postgres-init.sql), all entity primary keys and related foreign keys are standardized to `VARCHAR(100)`.

The table below documents all 43 schema relationships, their exact constraints, and deletion semantics:

| # | Parent Table & PK | Child Table & FK Column | Standardized Datatype | Foreign Key Constraint | On Delete Action | Business Semantics & Rationale | Verification Level |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `companies(id)` | `quotations(company_id)` | `VARCHAR(100)` | Yes (`quotations_company_id_fkey`) | `CASCADE` | Company owns quotation documents | `[VERIFIED FROM SOURCE]` |
| 2 | `companies(id)` | `bills(company_id)` | `VARCHAR(100)` | Yes (`bills_company_id_fkey`) | `CASCADE` | Company owns billing documents | `[VERIFIED FROM SOURCE]` |
| 3 | `companies(id)` | `payments(company_id)` | `VARCHAR(100)` | Yes (`payments_company_id_fkey`) | `CASCADE` | Financial receipts belonging to company entity | `[VERIFIED FROM SOURCE]` |
| 4 | `companies(id)` | `gate_passes(company_id)` | `VARCHAR(100)` | Yes (`gate_passes_company_id_fkey`) | `CASCADE` | Dispatch passes issued under company header | `[VERIFIED FROM SOURCE]` |
| 5 | `companies(id)` | `returns(company_id)` | `VARCHAR(100)` | Yes (`returns_company_id_fkey`) | `CASCADE` | Return intake forms tied to company entity | `[VERIFIED FROM SOURCE]` |
| 6 | `companies(id)` | `reservations(company_id)` | `VARCHAR(100)` | Yes (`reservations_company_id_fkey`) | `CASCADE` | Inventory reservations under company | `[VERIFIED FROM SOURCE]` |
| 7 | `categories(id)` | `products(category_id)` | `VARCHAR(100)` | Yes (`products_category_id_fkey`) | `SET NULL` | Deleting category unclassifies product without deleting inventory | `[VERIFIED FROM SOURCE]` |
| 8 | `categories(id)` | `categories(parent_id)` | `VARCHAR(100)` | Yes (`categories_parent_id_fkey`) | `SET NULL` | Self-referencing tree hierarchy | `[VERIFIED FROM SOURCE]` |
| 9 | `customers(id)` | `customer_branches(customer_id)` | `VARCHAR(100)` | Yes (`customer_branches_customer_id_fkey`) | `CASCADE` | Delivery branches are sub-entities of customer | `[VERIFIED FROM SOURCE]` |
| 10 | `customers(id)` | `quotations(customer_id)` | `VARCHAR(100)` | **NONE** (Unconstrained) | **NONE** | **Preserves historical quotation**: Dropped in migration 4. Quotes snapshot customer details and must never delete or lose customer ID attribution if customer profile is deleted. | `[VERIFIED FROM SOURCE]` |
| 11 | `customers(id)` | `bills(customer_id)` | `VARCHAR(100)` | **NONE** (Unconstrained) | **NONE** | **Preserves tax invoices**: Dropped in migration 4. Invoices snapshot GST, address, and mobile. Deleting or deactivating customer master must never delete or blank invoice history. | `[VERIFIED FROM SOURCE]` |
| 12 | `customers(id)` | `payments(customer_id)` | `VARCHAR(100)` | **NONE** (Unconstrained) | **NONE** | **Preserves payment ledger**: Dropped in migration 4. Customer payment receipts remain intact. | `[VERIFIED FROM SOURCE]` |
| 13 | `customers(id)` | `gate_passes(customer_id)` | `VARCHAR(100)` | **NONE** (Unconstrained) | **NONE** | **Preserves dispatch history**: Dropped in migration 4. Dispatch records remain intact. | `[VERIFIED FROM SOURCE]` |
| 14 | `customers(id)` | `returns(customer_id)` | `VARCHAR(100)` | **NONE** (Unconstrained) | **NONE** | **Preserves return history**: Dropped in migration 4. Return intake records remain intact. | `[VERIFIED FROM SOURCE]` |
| 15 | `customers(id)` | `reservations(customer_id)` | `VARCHAR(100)` | **NONE** (Unconstrained) | **NONE** | Legacy reservations preserve customer reference | `[INFERRED ARCHITECTURAL DECISION]` |
| 16 | `quotations(id)` | `quotation_branches(quotation_id)` | `VARCHAR(100)` | Yes (`quotation_branches_quotation_id_fkey`) | `CASCADE` | Branches are internal sections of quotation | `[VERIFIED FROM SOURCE]` |
| 17 | `quotations(id)` | `quotation_items(quotation_id)` | `VARCHAR(100)` | Yes (`quotation_items_quotation_id_fkey`) | `CASCADE` | Items are lines of quotation | `[VERIFIED FROM SOURCE]` |
| 18 | `quotations(id)` | `bills(source_quotation_id)` | `VARCHAR(100)` | Yes (`bills_source_quotation_id_fkey`) | `SET NULL` | Deleting draft quote unlinks bill without deleting final tax invoice | `[VERIFIED FROM SOURCE]` |
| 19 | `quotations(id)` | `reservations(quotation_id)` | `VARCHAR(100)` | Yes (`reservations_quotation_id_fkey`) | `SET NULL` | Unlinks reservation reference on quote deletion | `[VERIFIED FROM SOURCE]` |
| 20 | `quotation_branches(id)` | `quotation_items(quotation_branch_id)` | `VARCHAR(100)` | Yes (`quotation_items_quotation_branch_id_fkey`) | `CASCADE` | Branch deletion cascades to its section items | `[VERIFIED FROM SOURCE]` |
| 21 | `bills(id)` | `bill_branches(bill_id)` | `VARCHAR(100)` | Yes (`bill_branches_bill_id_fkey`) | `CASCADE` | Branches are internal sections of bill | `[VERIFIED FROM SOURCE]` |
| 22 | `bills(id)` | `bill_items(bill_id)` | `VARCHAR(100)` | Yes (`bill_items_bill_id_fkey`) | `CASCADE` | Items are lines of tax invoice | `[VERIFIED FROM SOURCE]` |
| 23 | `bills(id)` | `payments(bill_id)` | `VARCHAR(100)` | Yes (`payments_bill_id_fkey`) | `SET NULL` | Deleting bill unlinks payment ledger row without deleting payment record | `[VERIFIED FROM SOURCE]` |
| 24 | `bills(id)` | `gate_passes(bill_id)` | `VARCHAR(100)` | Yes (`gate_passes_bill_id_fkey`) | `SET NULL` | Unlinks gate pass reference if bill cancelled | `[VERIFIED FROM SOURCE]` |
| 25 | `bills(id)` | `reservations(bill_id)` | `VARCHAR(100)` | Yes (`reservations_bill_id_fkey`) | `SET NULL` | Unlinks reservation reference | `[VERIFIED FROM SOURCE]` |
| 26 | `bill_branches(id)` | `bill_items(bill_branch_id)` | `VARCHAR(100)` | Yes (`bill_items_bill_branch_id_fkey`) | `CASCADE` | Section deletion cascades to section items | `[VERIFIED FROM SOURCE]` |
| 27 | `products(id)` | `quotation_items(product_id)` | `VARCHAR(100)` | **NONE** (Nullable, unconstrained) | **NONE** | **Supports document notes**: Dropped in migration 4. Allows note lines and freeform item descriptions without catalog product link. | `[VERIFIED FROM SOURCE]` |
| 28 | `products(id)` | `bill_items(product_id)` | `VARCHAR(100)` | **NONE** (Nullable, unconstrained) | **NONE** | **Supports document notes**: Dropped in migration 4. Allows note lines and custom rental items without catalog product link. | `[VERIFIED FROM SOURCE]` |
| 29 | `products(id)` | `gate_pass_items(product_id)` | `VARCHAR(100)` | Yes (`gate_pass_items_product_id_fkey`) | `SET NULL` | Product link for physical dispatch line | `[VERIFIED FROM SOURCE]` |
| 30 | `products(id)` | `return_items(product_id)` | `VARCHAR(100)` | Yes (`return_items_product_id_fkey`) | `SET NULL` | Product link for physical return line | `[VERIFIED FROM SOURCE]` |
| 31 | `products(id)` | `inventory_movements(product_id)` | `VARCHAR(100)` | Yes (`inventory_movements_product_id_fkey`) | `CASCADE` | Double-entry stock ledger movements tied to product | `[VERIFIED FROM SOURCE]` |
| 32 | `products(id)` | `reservation_items(product_id)` | `VARCHAR(100)` | Yes (`reservation_items_product_id_fkey`) | `SET NULL` | Legacy reservation line product link | `[VERIFIED FROM SOURCE]` |
| 33 | `gate_passes(id)` | `gate_pass_items(gate_pass_id)` | `VARCHAR(100)` | Yes (`gate_pass_items_gate_pass_id_fkey`) | `CASCADE` | Dispatch pass lines owned by pass header | `[VERIFIED FROM SOURCE]` |
| 34 | `gate_passes(id)` | `returns(gate_pass_id)` | `VARCHAR(100)` | Yes (`returns_gate_pass_id_fkey`) | `CASCADE` | Return intake form tied to originating dispatch pass | `[VERIFIED FROM SOURCE]` |
| 35 | `gate_pass_items(id)` | `return_items(gate_pass_item_id)` | `VARCHAR(100)` | Yes (`return_items_gate_pass_item_id_fkey`) | `SET NULL` | Reconciles returned physical line back to dispatch line | `[VERIFIED FROM SOURCE]` |
| 36 | `returns(id)` | `return_items(return_id)` | `VARCHAR(100)` | Yes (`return_items_return_id_fkey`) | `CASCADE` | Return lines owned by return inspection form | `[VERIFIED FROM SOURCE]` |
| 37 | `users(id)` | `sessions(user_id)` | `VARCHAR(100)` | Yes (`sessions_user_id_fkey`) | `CASCADE` | Deleting user invalidates and deletes active user sessions | `[VERIFIED FROM SOURCE]` |
| 38 | `users(id)` | `sessions(rejected_by_user_id)` | `VARCHAR(100)` | Yes (`sessions_rejected_by_user_id_fkey`) | `SET NULL` | Preserves rejection timestamp/name even if admin user deleted | `[VERIFIED FROM SOURCE]` |
| 39 | `users(id)` | `activity_notifications(user_id)` | `VARCHAR(100)` | Yes (`activity_notifications_user_id_fkey`) | `CASCADE` | Security notifications linked to user lifecycle | `[VERIFIED FROM SOURCE]` |
| 40 | `users(id)` | `audit_logs(actor_id)` | `VARCHAR(100)` | Yes (`audit_logs_actor_id_fkey`) | `SET NULL` | Immutable audit log: preserves actor_name/action even if actor user deleted | `[VERIFIED FROM SOURCE]` |
| 41 | `users(id)` | `product_imports(created_by)` | `VARCHAR(100)` | Yes (`product_imports_created_by_fkey`) | `SET NULL` | Import history retained | `[VERIFIED FROM SOURCE]` |
| 42 | `customer_branches(id)` | `quotation_branches(customer_branch_id)` | `VARCHAR(100)` | Yes (`quotation_branches_customer_branch_id_fkey`) | `SET NULL` | Unlinks branch profile without destroying quote section | `[VERIFIED FROM SOURCE]` |
| 43 | `customer_branches(id)` | `bill_branches(customer_branch_id)` | `VARCHAR(100)` | Yes (`bill_branches_customer_branch_id_fkey`) | `SET NULL` | Unlinks branch profile without destroying bill section | `[VERIFIED FROM SOURCE]` |

---

## 4. Constraints, Indexes, Triggers & Extensions Audit

### Check Constraints
- `companies.gst_type`: `CHECK (gst_type IN ('GST_REGISTERED', 'NON_GST'))` (`[VERIFIED FROM SOURCE]`)
- `users.role`: `CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'BILLING', 'EMPLOYEE'))` (`[VERIFIED FROM SOURCE]`)
- `users.status`: `CHECK (status IN ('ACTIVE', 'INACTIVE'))` (`[VERIFIED FROM SOURCE]`)
- `products`: Non-negative constraints on `default_daily_rate`, `default_security_deposit`, `total_stock`, `available_quantity`, `reserved_quantity`, `rented_quantity`, `damaged_quantity`, `missing_quantity`, `maintenance_quantity` (`[VERIFIED FROM SOURCE]`)
- `quotations.status`: `CHECK (status IN ('DRAFT', 'ISSUED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED'))` (`[VERIFIED FROM SOURCE]`)
- `quotations.tax_type`: `CHECK (tax_type IN ('GST', 'NON_GST'))` (`[VERIFIED FROM SOURCE]`)
- `quotations.rental_days`: `CHECK (rental_days >= 1)` (`[VERIFIED FROM SOURCE]`)
- `quotation_items.quantity & days`: `CHECK (entry_type = 'note' OR quantity >= 0)` and `CHECK (entry_type = 'note' OR days >= 0)` (`[VERIFIED FROM SOURCE]`)
- `bills.status`: `CHECK (status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'))` (`[VERIFIED FROM SOURCE]`)
- `bills.tax_type`: `CHECK (tax_type IN ('GST', 'NON_GST'))` (`[VERIFIED FROM SOURCE]`)
- `bills.rental_days`: `CHECK (rental_days >= 1)` (`[VERIFIED FROM SOURCE]`)
- `bill_items.quantity & days`: `CHECK (entry_type = 'note' OR quantity >= 0)` and `CHECK (entry_type = 'note' OR days >= 0)` (`[VERIFIED FROM SOURCE]`)
- `payments.payment_type`: `CHECK (payment_type IN ('RENTAL_PAYMENT', 'ADVANCE', 'SECURITY_DEPOSIT', 'DEPOSIT_REFUND', 'DAMAGE_SETTLEMENT'))` (`[VERIFIED FROM SOURCE]`)
- `payments.payment_method`: `CHECK (payment_method IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE'))` (`[VERIFIED FROM SOURCE]`)
- `payments.amount`: `CHECK (amount > 0)` (`[VERIFIED FROM SOURCE]`)
- `sessions.status`: `CHECK (status IN ('ACTIVE', 'INACTIVE', 'REJECTED'))` (`[VERIFIED FROM SOURCE]`)

### Unique Constraints & Natural Keys
- `users.email`: `UNIQUE NOT NULL` (`[VERIFIED FROM SOURCE]`)
- `users.username`: `CREATE UNIQUE INDEX idx_users_username ON public.users(username) WHERE username IS NOT NULL;` (`[VERIFIED FROM SOURCE]`)
- `categories.name`: `UNIQUE NOT NULL` (restored in Batch 4.2 per `20261012:75`) (`[VERIFIED FROM SOURCE]`)
- `products.sku`: `UNIQUE` (restored in Batch 4.2 per `20261012:88`) (`[VERIFIED FROM SOURCE]`)
- `quotations.quotation_number`: `UNIQUE NOT NULL` (`[VERIFIED FROM SOURCE]`)
- `bills.bill_number`: `UNIQUE NOT NULL` (`[VERIFIED FROM SOURCE]`)
- `gate_passes.gate_pass_number`: `UNIQUE NOT NULL` (`[VERIFIED FROM SOURCE]`)
- `returns.return_number`: `UNIQUE NOT NULL` (`[VERIFIED FROM SOURCE]`)
- `payments.payment_number`: `UNIQUE NOT NULL` (`[VERIFIED FROM SOURCE]`)
- `reservations.reservation_number`: `UNIQUE NOT NULL` (`[VERIFIED FROM SOURCE]`)
- `sessions.token`: `UNIQUE NOT NULL` (restored in Batch 4.2 per `20261012:65` and `mappers.ts:778`) (`[VERIFIED FROM SOURCE]`)
- `login_rate_limits.key`: `PRIMARY KEY` (`[VERIFIED FROM SOURCE]`)

### Extensions & UUID Defaults
- `uuid-ossp` and `pgcrypto` enabled via `CREATE EXTENSION IF NOT EXISTS` (`[VERIFIED FROM SOURCE]`)
- Primary keys default to `gen_random_uuid()::text` (PostgreSQL 13+ native, supported without external extensions, compatible with `uuid_generate_v4()::text`) (`[INFERRED ARCHITECTURAL DECISION]`)

---

## 5. Role Privileges & Stored Function Security

### Individual Security Review of Privileged Functions

| Stored Function | Return Signature | Language | Security Context | search_path | Ownership & Execution Privileges | Audit Assessment | Verification Level |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `login_rate_limit_status(p_key TEXT)` | `TABLE (blocked BOOLEAN, retry_after_seconds INTEGER)` | `SQL` | `SECURITY DEFINER` | `public, pg_catalog` | `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO tns_app_user;` | **Approved Least Privilege**: Executes as schema owner with fixed search_path `public, pg_catalog` (Batch 4.2 hardened; `pg_temp` eliminated). Restricts caller to read-only rate status. | `[VERIFIED FROM SOURCE]` |
| `login_rate_limit_record_failure(p_key TEXT, p_max INTEGER, p_window_seconds INTEGER, p_lockout_seconds INTEGER)` | `TABLE (blocked BOOLEAN, retry_after_seconds INTEGER, attempts INTEGER)` | `PLPGSQL` | `SECURITY DEFINER` | `public, pg_catalog` | `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO tns_app_user;` | **Approved Atomic Throttling**: Mutation uses `INSERT ... ON CONFLICT DO UPDATE`. Rate limit table is not exposed to direct user mutations. search_path fixed to `public, pg_catalog`. | `[VERIFIED FROM SOURCE]` |
| `login_rate_limit_clear(p_key TEXT)` | `VOID` | `SQL` | `SECURITY DEFINER` | `public, pg_catalog` | `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO tns_app_user;` | **Approved Reset Procedure**: Executes only on successful authenticated login. Key is SHA-256 hash. search_path fixed to `public, pg_catalog`. | `[VERIFIED FROM SOURCE]` |
| `adjust_product_stock_quantities(...)` | `public.products` | `PLPGSQL` | `SECURITY DEFINER` | `public, pg_catalog` | `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO tns_app_user;` | **Approved Atomic Concurrency**: Uses `SELECT ... FOR UPDATE` row lock and `GREATEST(0, ...)` bounds. search_path fixed to `public, pg_catalog`. | `[VERIFIED FROM SOURCE]` |

### Role Configuration & Defense-in-Depth Rules
- **No Role Creation or Passwords in Script**: The initialization script assumes `tns_app_user` is provisioned by Coolify or the DBA. The script does not contain `CREATE ROLE` or plaintext passwords (`[VERIFIED FROM SOURCE]`).
- **Unconditional Public Revocations (Batch 4.2 Hardening)**: `REVOKE CREATE ON SCHEMA public FROM PUBLIC;` and `REVOKE ALL ON FUNCTION ... FROM PUBLIC;` are placed unconditionally outside the role check so that public execution and temporary-object creation permissions are always stripped (`[VERIFIED FROM SOURCE]`).
- **Visible Role Warning**: The conditional `DO $$ ...` block grants privileges to `tns_app_user` if present, but raises a prominent `WARNING` if the role is missing, ensuring ungranted state is never silent (`[INFERRED ARCHITECTURAL DECISION]`).

---

## 6. Document Number Uniqueness & Application Alignment

- **Batch 3.2 Bug Resolution**: Confirmed that `getNextDocumentNumber()` in `src/lib/db/supabaseStore.ts:229` queries `bill_number` directly on `bills`.
- **Database Purity**: No generated `invoice_number` column or view alias is created in `standalone-postgres-init.sql`. The column is purely `bill_number VARCHAR(100) NOT NULL UNIQUE` (`[VERIFIED FROM SOURCE]`).

---

## 7. Standalone PostgreSQL Validation Plan (Future Phase — Review Only)

The following tests **must** be executed on an isolated test container before any production migration:

1. **DDL Syntax & Clean Compilation Test**:
   - Run `psql -f supabase/standalone-postgres-init.sql` on a fresh PostgreSQL 16 container.
   - Assert return code is 0 and output contains zero warnings or errors.
2. **Constraint Verification Test**:
   - Attempt invalid inserts (e.g. invalid `users.role`, negative product stock, mismatched FKs). Assert PostgreSQL raises expected constraint violations.
3. **Note Line Document Test**:
   - Insert quotation item and bill item rows with `entry_type = 'note'`, `product_id = null`, and `quantity = 0`. Assert successful insertion.
4. **Customer Deletion Retention Test**:
   - Create customer, quotation, bill, payment, and customer branch.
   - Delete customer.
   - Assert customer branches are cascade deleted (`customer_branches`).
   - Assert quotation, bill, and payment remain intact with their original `customer_id` and snapshot values.
5. **Rate-Limit Function Concurrency Test**:
   - Invoke `login_rate_limit_record_failure` with 5 concurrent threads for the same key. Assert atomic increment without race conditions.
6. **Stock Adjustment Concurrency Test**:
   - Invoke `adjust_product_stock_quantities` across 10 concurrent transactions on the same product ID. Assert row-locking prevents inventory drift.

---

## 8. Backup / Restore & Rollback Rehearsal Plan (Future Phase — Review Only)

1. **Pre-Migration Automated Dump**:
   - `pg_dump -Fc -v -U tns_app_user -d tamilnadu_suppliers -f pre_cutover_backup.dump`
2. **Test Restoration**:
   - Restore dump into a secondary staging database: `pg_restore -d tamilnadu_suppliers_test pre_cutover_backup.dump`.
   - Verify table row counts and check constraints match source exactly.
3. **Rollback Strategy**:
   - Because `DB_PROVIDER` is cleanly decoupled, rollback requires zero database de-provisioning. If issues occur post-cutover, setting `DB_PROVIDER=supabase` in Coolify environment variables instantly routes all application traffic back to Supabase Cloud.

---

## 9. Decisions Submitted for Human Approval

The following architectural choices are documented in `supabase/standalone-postgres-init.sql` and submitted for user sign-off:

1. **Option A (Uniform `VARCHAR(100)` Identifiers)**:
   - All entity PKs and corresponding FKs are typed as `VARCHAR(100) DEFAULT gen_random_uuid()::text`.
   - *Rationale:* Resolves all 12 cross-type compiler mismatches left by Migration 4 without requiring pre-migration UUID data coercion.
2. **Customer Unconstrained Retention on Accounting Records**:
   - `bills.customer_id`, `quotations.customer_id`, `payments.customer_id`, `gate_passes.customer_id`, `returns.customer_id` are unconstrained reference columns.
   - *Rationale:* Replicates the exact state established in Migration 4 (lines 41–45) to ensure historical tax invoices and financial ledgers are never deleted or corrupted when customer masters are modified or deleted.
3. **Function Security Hardening**:
   - `SET search_path = public, pg_temp` explicitly added to `adjust_product_stock_quantities` and all 3 rate-limit functions.
   - Execution permissions strictly granted to `tns_app_user` and revoked from `PUBLIC`.
