# Standalone PostgreSQL Schema Decisions & Architectural Resolutions

**Project:** Tamilnadu Suppliers Rental ERP  
**Baseline Commit:** `0e9d2ee`  
**Status:** Updated for Batch 3.1 Review  
**Purpose:** Formal resolution of schema architecture, type consistency, foreign keys, insert defaults, and call-site discrepancies prior to authoring standalone PostgreSQL initialization SQL.

---

## 1. Categorized Evidence Framework

To ensure complete clarity and traceability, all statements in this document are strictly classified as follows:
* **[VERIFIED FACT]**: Directly established by explicit code lines, SQL statements, or compiler outputs in this repository.
* **[INFERENCE]**: Derived from architectural patterns or historical migration comments; documented with supporting rationale.
* **[APPROVED DECISION]**: Formally agreed with the User for standalone schema preparation.
* **[UNRESOLVED DECISION]**: Awaiting User direction before final initialization DDL authoring.

---

## 2. Core Architectural Decisions & Evidence

### Topic 1: Table Preservation & Scope
* **[VERIFIED FACT]**: The six migration files define exactly 26 tables (`20261012` defined 24 tables; `20261016` added `activity_notifications`; `20261023` added `login_rate_limits`).
* **[VERIFIED FACT]**: `supabaseStore.ts` queries 20 tables. `postgresClient.ts` allowlists 22 tables (the 20 store tables + `login_rate_limits` + `customer_branches`).
* **[VERIFIED FACT]**: The 4 legacy tables (`product_imports`, `reservations`, `reservation_items`, `whatsapp_logs`) have 0 references in `src/`.
* **[APPROVED DECISION]**: **Preserve all 26 migration-defined tables in the standalone schema initially.**
  * *Rationale:* Preserving all 26 tables guarantees 100% parity with existing Supabase Cloud backups, prevents table-missing errors during automated data extraction/restoration, and eliminates risk if legacy data exists in Supabase.

---

### Topic 2: Identifier Datatypes & PK/FK Pair Uniformity
* **[VERIFIED FACT]**: In `20261012`, all primary keys and foreign keys were `UUID`.
* **[VERIFIED FACT]**: In `20261017_full_supabase_migration.sql` (lines 51–129), 14 primary keys and 22 foreign key columns were changed to `VARCHAR(100)` with default `uuid_generate_v4()::text`.
* **[VERIFIED FACT]**: Migration `20261017` left several child table foreign key columns as `UUID` (`quotation_branches.quotation_id`, `bill_branches.bill_id`, `gate_pass_items.gate_pass_id`, `return_items.return_id`, `bills.source_quotation_id`, `categories.parent_id`, `customer_branches.customer_id`, `sessions.rejected_by_user_id`).
* **[VERIFIED FACT]**: PostgreSQL rejects foreign key constraints between mismatched types (`character varying` and `uuid`) with `ERROR: Key columns are of incompatible types`.
* **[VERIFIED FACT]**: In `src/lib/types/index.ts`, all entity IDs are typed as TypeScript `string`. In `src/lib/db/supabaseStore.ts:79-84`, `toValidUuid()` outputs 36-character UUID strings (`crypto.randomUUID()`). Seed IDs in `20261012` (e.g. `'c0000001-0000-0000-0000-000000000001'`) are also 36-character UUID-formatted strings.
* **[DECISION TABLE: IDENTIFIER TYPING STRATEGY]**:

| Option | Strategy | Pros | Cons / Requirements | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Option A (Pair-by-Pair VARCHAR Uniformity)** | Set every related PK and FK column to `VARCHAR(100) DEFAULT gen_random_uuid()::text`. | 100% compatible with migration 4 (`20261017`); accommodates both standard UUIDs and string IDs; eliminates all type-mismatch errors. | Slightly larger storage footprint than native UUID (100 bytes vs 16 bytes per key). | **Recommended** |
| **Option B (Strict Native UUID Uniformity)** | Set every related PK and FK column to `UUID DEFAULT gen_random_uuid()`. | Native PostgreSQL 16-byte UUID indexing; highest database efficiency. | Fails if Supabase Cloud contains any non-UUID legacy string IDs (requires data pre-audit). | Feasible pending data inspection |
| **Option C (Partial As-Is Migration 4 State)** | Keep the exact types from migration 4 (14 tables VARCHAR, others UUID). | Matches migration 4 text. | **Cannot create foreign keys** between parent and child on mismatched pairs (e.g. `quotation_branches -> quotations`). | **Rejected** |

---

### Topic 3: Resolution of `invoice_number` vs `bill_number` Discrepancy
* **[VERIFIED FACT]**: In `20261012_init_tamilnadu_suppliers.sql` line 240, the invoice number column is `bill_number VARCHAR(100) NOT NULL UNIQUE`.
* **[VERIFIED FACT]**: In `src/lib/db/mappers.ts` lines 446 and 533, the mapped column is strictly `bill_number`.
* **[VERIFIED FACT]**: In `src/lib/db/supabaseStore.ts` line 229:
  ```typescript
  const { data } = await this.supabase
    .from("bills")
    .select("id")
    .eq("invoice_number", candidate)
    .maybeSingle();
  ```
  This is the **only line in the entire repository** that references `invoice_number`.
* **[VERIFIED FACT]**: In Supabase PostgREST, querying a non-existent column returns an error and `data: null`. Because the loop evaluates `if (!data) break;`, the collision check silently breaks on the first iteration, masking the typo.
* **[APPROVED DECISION]**: **Do not add a generated `invoice_number` column to standalone PostgreSQL.**
  * *Rationale:* Adding a generated column in PostgreSQL alone conceals an application code defect rather than fixing it consistently across providers.
  * *Provider-Independent Resolution (Implemented in Batch 3.2):* Updated line 229 of `supabaseStore.ts` from `.eq("invoice_number", candidate)` to `.eq("bill_number", candidate)`. Added dedicated regression tests in `tests/security/document-number.test.ts` proving `getNextDocumentNumber("INVOICE")` queries `bill_number` and continues checking when collisions exist.

---

### Topic 4: Adapter Insert Call Sites, Missing Keys & Column Defaults
* **[VERIFIED FACT]**: A complete repository audit identified exactly 28 `.insert(...)` call sites in `src/lib/db/supabaseStore.ts`.
* **[VERIFIED FACT]**: 25 of the 28 call sites are **single-row inserts** (`insert(row)`). In single-row inserts, `postgresClient.ts` extracts only the keys present on that object. Columns omitted from the object are **not** in the SQL column list, so PostgreSQL evaluates column `DEFAULT` values normally.
* **[VERIFIED FACT]**: Exactly 3 call sites are **bulk inserts** (arrays of objects):
  1. `quotation_items` (lines 860 & 933): Every row is generated by a `.map()` callback (lines 839–856) that assigns a fixed, identical set of 16 keys. `created_at` is explicitly provided as `new Date().toISOString()`.
  2. `bill_items` (line 1532): Every row is generated by a `.map()` callback (lines 1510–1528) that assigns an identical set of 17 keys. `created_at` is explicitly provided.
  3. `return_items` (line 2618): Every row is constructed with identical keys (`id`, `return_id`, `product_id`, `gate_pass_item_id`, `item_name`, `quantity_expected`, `quantity_returned_good`, `quantity_damaged`, `quantity_missing`, `damage_notes`). `created_at` is omitted from **all** rows.
* **[VERIFIED FACT]**: In `return_items`, because `created_at` is omitted from all rows, it is omitted from the key union. The generated SQL does not mention `created_at`, so PostgreSQL evaluates `DEFAULT NOW()` properly.
* **[INFERENCE / CONCLUSION]**: Zero insert call sites in the current application supply heterogeneous row keys that would cause `postgresClient.ts` to replace column defaults with `NULL`.

---

### Topic 5: Foreign-Key Deletion Behavior & Note-Line Support
* **[VERIFIED FACT]**: Migration 2 (`20261015`) added note entries to `quotation_items` and `bill_items` (`entry_type = 'note'`, `text TEXT`), relaxed `product_id` to nullable, and relaxed non-zero quantity checks (`CHECK (entry_type = 'note' OR quantity >= 0)`).
* **[VERIFIED FACT]**: Migration 4 (`20261017`) dropped `quotation_items_product_id_fkey` and `bill_items_product_id_fkey`.
* **[VERIFIED FACT]**: Migration 4 re-established cascading foreign keys on document structure:
  * `quotation_items -> quotations` (`ON DELETE CASCADE`)
  * `bill_items -> bills` (`ON DELETE CASCADE`)
  * `quotations -> companies` (`ON DELETE CASCADE`)
  * `bills -> companies` (`ON DELETE CASCADE`)
  * `payments -> bills` (`ON DELETE SET NULL`)
  * `products -> categories` (`ON DELETE SET NULL`)
* **[VERIFIED FACT]**: Migration 4 dropped `quotations_customer_id_fkey` and `bills_customer_id_fkey` so deleting or deactivating a customer record does not cascade-delete financial invoices.
* **[APPROVED DECISION]**:
  * Preserve strict cascading on parent-child document lines (`quotation_items -> quotations`, `bill_items -> bills`, `quotation_branches -> quotations`, `bill_branches -> bills`, `gate_pass_items -> gate_passes`, `return_items -> returns`).
  * Preserve nullable `product_id` on items with optional/no FK constraint to ensure note lines without catalog products function without foreign key constraint violations.
  * Preserve document retention on customer deletion: customer foreign keys on `bills`, `quotations`, and `payments` must NOT cascade-delete records (`ON DELETE SET NULL` or left unconstrained).

---

### Topic 6: Stored Functions & RPC Compatibility
* **[VERIFIED FACT]**:
  1. `login_rate_limit_status(p_key TEXT)`: Expects `p_key`. Returns `(blocked BOOLEAN, retry_after_seconds INTEGER)`.
  2. `login_rate_limit_record_failure(p_key TEXT, p_max INTEGER, p_window_seconds INTEGER, p_lockout_seconds INTEGER)`: Expects 4 named parameters. Returns `(blocked BOOLEAN, retry_after_seconds INTEGER, attempts INTEGER)`.
  3. `login_rate_limit_clear(p_key TEXT)`: Expects `p_key`. Returns `VOID`.
  4. `adjust_product_stock_quantities(p_product_id VARCHAR, p_rented_delta INT, p_available_delta INT, p_damaged_delta INT, p_missing_delta INT)`: Defined in `20261017`.
* **[VERIFIED FACT]**: `rateLimit.ts` invokes functions 1, 2, and 3 using exact parameter names matching the SQL signatures. `postgresClient.ts` generates named parameter calls (`"p_key" => $1`), which PostgreSQL executes with 100% parameter fidelity.
* **[VERIFIED FACT]**: `adjust_product_stock_quantities` is currently not called by application code (store updates products via `updateProduct`).
* **[APPROVED DECISION]**:
  * Include all 3 `login_rate_limit_*` functions in the standalone schema with `SECURITY DEFINER` and `SET search_path = public`.
  * Include `adjust_product_stock_quantities` in the standalone schema for future concurrency-safe stock updates.
  * Grant execution privileges to `tns_app_user` (and revoke from public). Do not reference Supabase roles (`service_role`, `anon`, `authenticated`).

---

## 3. Summary Decision Matrix

| Issue | Source Evidence | Approved Decision for Standalone Schema | Next Action |
| :--- | :--- | :--- | :--- |
| **Table Parity** | 26 tables in migrations; 20 in store; 4 legacy in migrations. | **Include all 26 tables.** | Author DDL for all 26 tables in Batch 4. |
| **Identifier Types** | 14 tables altered to `VARCHAR(100)` in 20261017; child FKs un-altered creating mismatches. | **Standardize pair-by-pair to matching types.** Option A (`VARCHAR(100)`) recommended for safety. | Confirm Option A vs Option B with User before DDL authoring. |
| **`invoice_number` Query** | 1 call site in `supabaseStore.ts:229`. Column in schema is `bill_number`. | **Do not add generated column to PostgreSQL.** Fix code in future batch. | Maintain schema purity. Plan code correction. |
| **Bulk Insert Defaults** | 3 bulk insert call sites audited. All rows are homogeneous. | **Keep adapter bulk insert key union.** | Verified safe. No schema modification needed. |
| **Note-Line Items** | Note items have `product_id: null`. | **Keep `product_id` nullable in items.** | Ensure `quotation_items` and `bill_items` allow null product_id. |
| **Rate Limit Functions** | Exact signature match in `rateLimit.ts` and `20261023`. | **Deploy all 3 functions with `search_path = public`.** | Include in initialization DDL; grant to `tns_app_user`. |
| **Stock RPC** | `adjust_product_stock_quantities` defined in 20261017. | **Include in standalone schema.** | Add definition in Batch 4 DDL. |
