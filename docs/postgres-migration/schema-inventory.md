# Authoritative Standalone PostgreSQL Schema Inventory

**Project:** Tamilnadu Suppliers Rental ERP  
**Baseline Commit:** `0e9d2ee`  
**Status:** Updated for Batch 3.1 Review  
**Purpose:** Verified, chronological inventory of every table, column, datatype, default, constraint, index, stored function, and extension across all six repository migrations in `supabase/migrations/`.

---

## 1. Migration Sequence & Cumulative Schema Evolution

The authoritative schema is defined by six sequential SQL files in `supabase/migrations/`:

| # | Migration File | Date | Verified Structural State |
| :--- | :--- | :--- | :--- |
| **1** | `20261012_init_tamilnadu_suppliers.sql` | 2026-10-12 | Defines 24 initial tables with `UUID PRIMARY KEY DEFAULT uuid_generate_v4()`, 48 inline foreign keys, B-tree indexes, extensions (`uuid-ossp`, `pgcrypto`), and seed data for 8 issuing companies and 6 product categories. |
| **2** | `20261015_ordered_lines_and_bill_cleanup.sql` | 2026-10-15 | Adds `document_lines JSONB` to `quotations` and `bills`. Adds `entry_type`, `position`, `text`, `quantity_physically_returned` to `quotation_items` and `bill_items`. Relaxes `product_id` to nullable and adjusts `CHECK` constraints to support note lines. |
| **3** | `20261016_audit_history_and_session_management.sql` | 2026-10-16 | Adds administrative session-tracking columns (`user_name`, `username`, `user_role`, `ip_address`, `user_agent`, `last_activity_at`, `status`, `rejected_at`, `rejected_by`, `rejected_by_user_id`) to `sessions`. Adds actor/entity columns to `audit_logs`. Creates Table #25: `activity_notifications`. |
| **4** | `20261017_full_supabase_migration.sql` | 2026-10-17 | Relaxes 14 parent primary keys and 22 foreign key columns to `VARCHAR(100)` with `DEFAULT uuid_generate_v4()::text`. Drops 12 foreign keys; re-establishes 6. Adds financial lifecycle columns (`original_grand_total`, `amendments`, `incidents`, `branches` JSONB). Defines stored function `adjust_product_stock_quantities`. |
| **5** | `20261017_users_role_constraint.sql` | 2026-10-17 | Replaces `users_role_check` constraint to strictly allow `('SUPER_ADMIN', 'ADMIN', 'BILLING', 'EMPLOYEE')`. |
| **6** | `20261023_login_rate_limits.sql` | 2026-10-23 | Creates Table #26: `login_rate_limits`. Defines 3 atomic stored functions (`login_rate_limit_status`, `login_rate_limit_record_failure`, `login_rate_limit_clear`). |

---

## 2. Comprehensive Column-by-Column PK/FK Identifier Mapping

The audit revealed that migration 4 (`20261017`) changed 14 parent tables to `VARCHAR(100)`, but did not update foreign key columns in several child tables, leaving datatype mismatches in the migration history. In standard PostgreSQL, foreign keys between `UUID` and `VARCHAR` fail DDL compilation.

The following table documents every relationship across the schema:

| Parent Table & PK | Parent PK Type (Final Mig.) | Child Table & FK Column | Child FK Type (Final Mig.) | Valid PG Match? | FK Constraint Status in Migration History |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `companies.id` | `VARCHAR(100)` | `quotations.company_id` | `VARCHAR(100)` | **YES** | Re-added in 20261017 (`ON DELETE CASCADE`) |
| `companies.id` | `VARCHAR(100)` | `bills.company_id` | `VARCHAR(100)` | **YES** | Re-added in 20261017 (`ON DELETE CASCADE`) |
| `companies.id` | `VARCHAR(100)` | `payments.company_id` | `VARCHAR(100)` | **YES** | Defined in 20261012, altered in 20261017 |
| `companies.id` | `VARCHAR(100)` | `gate_passes.company_id` | `VARCHAR(100)` | **YES** | Defined in 20261012, altered in 20261017 |
| `companies.id` | `VARCHAR(100)` | `returns.company_id` | `VARCHAR(100)` | **YES** | Defined in 20261012, altered in 20261017 |
| `companies.id` | `VARCHAR(100)` | `reservations.company_id` | `UUID` | **NO (Mismatch)** | Defined in 20261012; child FK un-altered in 20261017 |
| `categories.id` | `VARCHAR(100)` | `products.category_id` | `VARCHAR(100)` | **YES** | Re-added in 20261017 (`ON DELETE SET NULL`) |
| `categories.id` | `VARCHAR(100)` | `categories.parent_id` | `UUID` | **NO (Mismatch)** | Defined in 20261012; child FK un-altered in 20261017 |
| `customers.id` | `VARCHAR(100)` | `customer_branches.customer_id` | `UUID` | **NO (Mismatch)** | Defined in 20261012; child FK un-altered in 20261017 |
| `customers.id` | `VARCHAR(100)` | `quotations.customer_id` | `VARCHAR(100)` | **YES** | Dropped in 20261017 (preserves invoices on customer delete) |
| `customers.id` | `VARCHAR(100)` | `bills.customer_id` | `VARCHAR(100)` | **YES** | Dropped in 20261017 (preserves invoices on customer delete) |
| `customers.id` | `VARCHAR(100)` | `payments.customer_id` | `VARCHAR(100)` | **YES** | Dropped in 20261017 |
| `customers.id` | `VARCHAR(100)` | `gate_passes.customer_id` | `VARCHAR(100)` | **YES** | Dropped in 20261017 |
| `customers.id` | `VARCHAR(100)` | `returns.customer_id` | `VARCHAR(100)` | **YES** | Dropped in 20261017 |
| `customers.id` | `VARCHAR(100)` | `reservations.customer_id` | `UUID` | **NO (Mismatch)** | Defined in 20261012; child FK un-altered in 20261017 |
| `quotations.id` | `VARCHAR(100)` | `quotation_items.quotation_id` | `VARCHAR(100)` | **YES** | Re-added in 20261017 (`ON DELETE CASCADE`) |
| `quotations.id` | `VARCHAR(100)` | `quotation_branches.quotation_id`| `UUID` | **NO (Mismatch)** | Defined in 20261012; child FK un-altered in 20261017 |
| `quotations.id` | `VARCHAR(100)` | `bills.source_quotation_id` | `UUID` | **NO (Mismatch)** | Defined in 20261012; child FK un-altered in 20261017 |
| `quotations.id` | `VARCHAR(100)` | `reservations.quotation_id` | `UUID` | **NO (Mismatch)** | Defined in 20261012; child FK un-altered in 20261017 |
| `quotation_branches.id`| `UUID` | `quotation_items.quotation_branch_id`| `VARCHAR(100)` | **NO (Mismatch)** | Parent left UUID; child altered to VARCHAR in 20261017 |
| `bills.id` | `VARCHAR(100)` | `bill_items.bill_id` | `VARCHAR(100)` | **YES** | Re-added in 20261017 (`ON DELETE CASCADE`) |
| `bills.id` | `VARCHAR(100)` | `bill_branches.bill_id` | `UUID` | **NO (Mismatch)** | Defined in 20261012; child FK un-altered in 20261017 |
| `bills.id` | `VARCHAR(100)` | `payments.bill_id` | `VARCHAR(100)` | **YES** | Re-added in 20261017 (`ON DELETE SET NULL`) |
| `bills.id` | `VARCHAR(100)` | `gate_passes.bill_id` | `VARCHAR(100)` | **YES** | Defined in 20261012, altered in 20261017 |
| `bills.id` | `VARCHAR(100)` | `reservations.bill_id` | `UUID` | **NO (Mismatch)** | Defined in 20261012; child FK un-altered in 20261017 |
| `bills.id` | `VARCHAR(100)` | `quotations.converted_bill_id` | `UUID` | **NO (Mismatch)** | Reference column only; no FK constraint exists |
| `bill_branches.id` | `UUID` | `bill_items.bill_branch_id` | `VARCHAR(100)` | **NO (Mismatch)** | Parent left UUID; child altered to VARCHAR in 20261017 |
| `products.id` | `VARCHAR(100)` | `quotation_items.product_id` | `VARCHAR(100)` | **YES** | Dropped in 20261017 (supports note lines without products) |
| `products.id` | `VARCHAR(100)` | `bill_items.product_id` | `VARCHAR(100)` | **YES** | Dropped in 20261017 (supports note lines without products) |
| `products.id` | `VARCHAR(100)` | `gate_pass_items.product_id` | `UUID` | **NO (Mismatch)** | Defined in 20261012; child FK un-altered in 20261017 |
| `products.id` | `VARCHAR(100)` | `return_items.product_id` | `UUID` | **NO (Mismatch)** | Defined in 20261012; child FK un-altered in 20261017 |
| `products.id` | `VARCHAR(100)` | `inventory_movements.product_id` | `UUID` | **NO (Mismatch)** | Dropped in 20261017 |
| `products.id` | `VARCHAR(100)` | `reservation_items.product_id` | `UUID` | **NO (Mismatch)** | Defined in 20261012; child FK un-altered in 20261017 |
| `gate_passes.id` | `VARCHAR(100)` | `gate_pass_items.gate_pass_id` | `UUID` | **NO (Mismatch)** | Defined in 20261012; child FK un-altered in 20261017 |
| `gate_passes.id` | `VARCHAR(100)` | `returns.gate_pass_id` | `VARCHAR(100)` | **YES** | Defined in 20261012, altered in 20261017 |
| `gate_pass_items.id` | `UUID` | `return_items.gate_pass_item_id` | `UUID` | **YES** | Active from 20261012 |
| `returns.id` | `VARCHAR(100)` | `return_items.return_id` | `UUID` | **NO (Mismatch)** | Defined in 20261012; child FK un-altered in 20261017 |
| `users.id` | `VARCHAR(100)` | `sessions.user_id` | `VARCHAR(100)` | **YES** | Dropped in 20261017 |
| `users.id` | `VARCHAR(100)` | `sessions.rejected_by_user_id` | `UUID` | **NO (Mismatch)** | Added in 20261016; child FK un-altered in 20261017 |
| `users.id` | `VARCHAR(100)` | `activity_notifications.user_id` | `VARCHAR(100)` | **YES** | Dropped in 20261017 |
| `users.id` | `VARCHAR(100)` | `audit_logs.actor_id` | `UUID` | **NO (Mismatch)** | Defined in 20261012; child FK un-altered in 20261017 |
| `customer_branches.id`| `UUID` | `quotation_branches.customer_branch_id`| `UUID` | **YES** | Active from 20261012 |
| `customer_branches.id`| `UUID` | `bill_branches.customer_branch_id` | `UUID` | **YES** | Active from 20261012 |

---

## 3. All 26 Tables — Final Schema State

### 1. `companies`
* `id`: `VARCHAR(100) PRIMARY KEY DEFAULT uuid_generate_v4()::text`
* `name`: `VARCHAR(255) NOT NULL`, `display_name`: `VARCHAR(255) NOT NULL`
* `gst_type`: `VARCHAR(20) NOT NULL CHECK (gst_type IN ('GST_REGISTERED', 'NON_GST'))`
* `gstin`: `VARCHAR(15)`, `pan`: `VARCHAR(10)`, `email`: `VARCHAR(255)`, `phone`: `VARCHAR(50)`
* `address`: `TEXT NOT NULL`, `state`: `VARCHAR(100) NOT NULL DEFAULT 'Tamil Nadu'`, `state_code`: `VARCHAR(10) NOT NULL DEFAULT '33'`, `place_of_supply`: `VARCHAR(100) NOT NULL DEFAULT 'Vellore'`
* `bank_name`: `VARCHAR(255) NOT NULL DEFAULT 'City Union Bank'`, `bank_account_no`: `VARCHAR(100) NOT NULL`, `bank_ifsc`: `VARCHAR(50) NOT NULL`, `bank_branch`: `VARCHAR(100) NOT NULL DEFAULT 'Vellore Branch'`
* `invoice_prefix`: `VARCHAR(20) NOT NULL DEFAULT 'TNS-'`, `quotation_prefix`: `VARCHAR(20) NOT NULL DEFAULT 'TNQ-'`, `gate_pass_prefix`: `VARCHAR(20) NOT NULL DEFAULT 'TNGP-'`
* `next_invoice_no`: `INTEGER NOT NULL DEFAULT 1`, `next_quotation_no`: `INTEGER NOT NULL DEFAULT 1`, `next_gate_pass_no`: `INTEGER NOT NULL DEFAULT 1`
* `logo_url`: `TEXT`, `terms_and_conditions`: `TEXT NOT NULL DEFAULT '...'`, `authorized_signatory_title`: `VARCHAR(100) NOT NULL DEFAULT 'Authorised Signatory'`, `notes`: `TEXT`, `is_active`: `BOOLEAN NOT NULL DEFAULT true`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 2. `users`
* `id`: `VARCHAR(100) PRIMARY KEY DEFAULT uuid_generate_v4()::text`
* `email`: `VARCHAR(255) UNIQUE NOT NULL`, `password_hash`: `VARCHAR(255) NOT NULL`, `name`: `VARCHAR(255) NOT NULL`
* `username`: `VARCHAR(100)` *(unique index where not null)*, `phone`: `VARCHAR(50)`
* `role`: `VARCHAR(50) NOT NULL DEFAULT 'EMPLOYEE' CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'BILLING', 'EMPLOYEE'))`
* `status`: `VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE'))`
* `permissions`: `JSONB NOT NULL DEFAULT '[]'::jsonb`, `must_change_password`: `BOOLEAN NOT NULL DEFAULT false`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 3. `sessions`
* `id`: `VARCHAR(100) PRIMARY KEY DEFAULT uuid_generate_v4()::text`
* `user_id`: `VARCHAR(100) NOT NULL`
* `token`: `VARCHAR(255) UNIQUE NOT NULL`
* `user_name`: `VARCHAR(255)`, `username`: `VARCHAR(100)`, `user_role`: `VARCHAR(50)`, `ip_address`: `VARCHAR(50)`, `user_agent`: `TEXT`
* `last_activity_at`: `TIMESTAMPTZ DEFAULT NOW()`, `status`: `VARCHAR(50) NOT NULL DEFAULT 'ACTIVE'`
* `rejected_at`: `TIMESTAMPTZ`, `rejected_by`: `VARCHAR(255)`, `rejected_by_user_id`: `UUID REFERENCES public.users(id) ON DELETE SET NULL`
* `expires_at`: `TIMESTAMPTZ NOT NULL`, `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 4. `categories`
* `id`: `VARCHAR(100) PRIMARY KEY DEFAULT uuid_generate_v4()::text`
* `name`: `VARCHAR(255) NOT NULL UNIQUE`, `code`: `VARCHAR(50)`, `description`: `TEXT`
* `parent_id`: `UUID REFERENCES public.categories(id) ON DELETE SET NULL`
* `is_active`: `BOOLEAN NOT NULL DEFAULT true`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 5. `products`
* `id`: `VARCHAR(100) PRIMARY KEY DEFAULT uuid_generate_v4()::text`
* `name`: `VARCHAR(255) NOT NULL`, `alias`: `VARCHAR(255)`, `sku`: `VARCHAR(100) UNIQUE`
* `category_id`: `VARCHAR(100) REFERENCES public.categories(id) ON DELETE SET NULL`
* `category_name`: `VARCHAR(255)`, `description`: `TEXT`, `size_spec`: `VARCHAR(100)`, `unit`: `VARCHAR(50) NOT NULL DEFAULT 'Nos'`
* `default_rental_rate`: `NUMERIC(12, 2) NOT NULL DEFAULT 0.00`, `rental_rate_unit`: `VARCHAR(50) NOT NULL DEFAULT 'PER_DAY' CHECK (rental_rate_unit IN ('PER_DAY', 'PER_EVENT', 'PER_SQFT'))`, `min_rental_duration`: `INTEGER NOT NULL DEFAULT 1`
* `security_deposit_amount`: `NUMERIC(12, 2) NOT NULL DEFAULT 0.00`, `replacement_value`: `NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
* `total_owned_quantity`: `INTEGER NOT NULL DEFAULT 0 CHECK (total_owned_quantity >= 0)`
* `available_quantity`: `INTEGER NOT NULL DEFAULT 0 CHECK (available_quantity >= 0)`
* `reserved_quantity`: `INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0)`
* `rented_quantity`: `INTEGER NOT NULL DEFAULT 0 CHECK (rented_quantity >= 0)`
* `damaged_quantity`: `INTEGER NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0)`
* `missing_quantity`: `INTEGER NOT NULL DEFAULT 0 CHECK (missing_quantity >= 0)`
* `maintenance_quantity`: `INTEGER NOT NULL DEFAULT 0 CHECK (maintenance_quantity >= 0)`
* `is_active`: `BOOLEAN NOT NULL DEFAULT true`, `notes`: `TEXT`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 6. `customers`
* `id`: `VARCHAR(100) PRIMARY KEY DEFAULT uuid_generate_v4()::text`
* `name`: `VARCHAR(255) NOT NULL`, `contact_person`: `VARCHAR(255)`, `mobile`: `VARCHAR(50) NOT NULL`, `phone`: `VARCHAR(50)`, `whatsapp`: `VARCHAR(50)`, `email`: `VARCHAR(255)`
* `billing_address`: `TEXT NOT NULL`, `gstin`: `VARCHAR(15)`, `state`: `VARCHAR(100) NOT NULL DEFAULT 'Tamil Nadu'`, `postal_code`: `VARCHAR(20)`, `notes`: `TEXT`
* `is_active`: `BOOLEAN NOT NULL DEFAULT true`, `branches`: `JSONB DEFAULT '[]'::jsonb`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 7. `customer_branches` (Legacy / Parity Table)
* `id`: `UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
* `customer_id`: `UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE`
* `branch_name`: `VARCHAR(255) NOT NULL`, `contact_person`: `VARCHAR(255)`, `phone`: `VARCHAR(50)`, `address`: `TEXT NOT NULL`, `city`: `VARCHAR(100) NOT NULL DEFAULT 'Vellore'`, `state`: `VARCHAR(100) NOT NULL DEFAULT 'Tamil Nadu'`, `postal_code`: `VARCHAR(20)`, `delivery_instructions`: `TEXT`, `is_active`: `BOOLEAN NOT NULL DEFAULT true`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 8. `quotations`
* `id`: `VARCHAR(100) PRIMARY KEY DEFAULT uuid_generate_v4()::text`
* `quotation_number`: `VARCHAR(100) NOT NULL UNIQUE`
* `company_id`: `VARCHAR(100) NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE`
* `company_snapshot`: `JSONB NOT NULL`, `customer_id`: `VARCHAR(100) NOT NULL`, `customer_name`: `VARCHAR(255) NOT NULL`, `customer_phone`: `VARCHAR(50) NOT NULL`, `customer_address`: `TEXT NOT NULL`, `customer_gstin`: `VARCHAR(15)`
* `quotation_date`: `DATE NOT NULL DEFAULT CURRENT_DATE`, `supply_date`: `DATE`, `place_of_supply`: `VARCHAR(255) NOT NULL DEFAULT 'Vellore'`
* `rental_start_date`: `DATE NOT NULL`, `rental_end_date`: `DATE NOT NULL`, `rental_days`: `INTEGER NOT NULL DEFAULT 1 CHECK (rental_days >= 1)`
* `status`: `VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ISSUED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED'))`
* `tax_type`: `VARCHAR(20) NOT NULL DEFAULT 'NON_GST' CHECK (tax_type IN ('GST', 'NON_GST'))`
* `subtotal`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `transport_charges`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `loading_charges`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `labor_charges`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `other_charges`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `discount_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `taxable_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
* `cgst_rate`: `NUMERIC(5, 2) NOT NULL DEFAULT 0.00`, `cgst_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `sgst_rate`: `NUMERIC(5, 2) NOT NULL DEFAULT 0.00`, `sgst_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `igst_rate`: `NUMERIC(5, 2) NOT NULL DEFAULT 0.00`, `igst_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `total_tax`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `grand_total`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
* `advance_required`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `security_deposit_required`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `amount_in_words`: `TEXT NOT NULL`
* `notes`: `TEXT`, `terms_and_conditions`: `TEXT`
* `converted_bill_id`: `UUID` *(unconstrained reference)*, `converted_bill_number`: `VARCHAR(100)`, `converted_at`: `TIMESTAMPTZ`
* `document_lines`: `JSONB DEFAULT '[]'::jsonb`, `notes_list`: `JSONB DEFAULT '[]'::jsonb`, `branches`: `JSONB DEFAULT '[]'::jsonb`
* `created_by`: `UUID REFERENCES public.users(id)`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 9. `quotation_branches`
* `id`: `UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
* `quotation_id`: `UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE`
* `customer_branch_id`: `UUID REFERENCES public.customer_branches(id)`
* `branch_name`: `VARCHAR(255) NOT NULL`, `delivery_address`: `TEXT`, `section_order`: `INTEGER NOT NULL DEFAULT 0`, `branch_subtotal`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 10. `quotation_items`
* `id`: `VARCHAR(100) PRIMARY KEY DEFAULT uuid_generate_v4()::text`
* `quotation_branch_id`: `VARCHAR(100) NOT NULL`
* `quotation_id`: `VARCHAR(100) NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE`
* `product_id`: `VARCHAR(100)` *(nullable)*
* `item_name`: `VARCHAR(255) NOT NULL`, `size_spec`: `VARCHAR(100)`, `quantity`: `INTEGER NOT NULL DEFAULT 1`, `days`: `INTEGER NOT NULL DEFAULT 1`, `unit_price`: `NUMERIC(12, 2) NOT NULL DEFAULT 0.00`, `amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `item_order`: `INTEGER NOT NULL DEFAULT 0`
* `entry_type`: `VARCHAR(20) DEFAULT 'product'`, `position`: `INTEGER DEFAULT 0`, `text`: `TEXT`, `notes`: `TEXT`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
* `CONSTRAINTS`: `CHECK (entry_type = 'note' OR quantity >= 0)`, `CHECK (entry_type = 'note' OR days >= 0)`

### 11. `bills`
* `id`: `VARCHAR(100) PRIMARY KEY DEFAULT uuid_generate_v4()::text`
* `bill_number`: `VARCHAR(100) NOT NULL UNIQUE`
* `company_id`: `VARCHAR(100) NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE`
* `company_snapshot`: `JSONB NOT NULL`, `source_quotation_id`: `UUID UNIQUE REFERENCES public.quotations(id)`, `customer_id`: `VARCHAR(100) NOT NULL`, `customer_name`: `VARCHAR(255) NOT NULL`, `customer_phone`: `VARCHAR(50) NOT NULL`, `customer_address`: `TEXT NOT NULL`, `customer_gstin`: `VARCHAR(15)`
* `bill_date`: `DATE NOT NULL DEFAULT CURRENT_DATE`, `supply_date`: `DATE`, `place_of_supply`: `VARCHAR(255) NOT NULL DEFAULT 'Vellore'`
* `rental_start_date`: `DATE NOT NULL`, `rental_end_date`: `DATE NOT NULL`, `rental_days`: `INTEGER NOT NULL DEFAULT 1 CHECK (rental_days >= 1)`
* `status`: `VARCHAR(50) NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'))`
* `tax_type`: `VARCHAR(20) NOT NULL DEFAULT 'NON_GST' CHECK (tax_type IN ('GST', 'NON_GST'))`
* `subtotal`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `transport_charges`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `loading_charges`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `labor_charges`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `other_charges`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `discount_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `taxable_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
* `cgst_rate`: `NUMERIC(5, 2) NOT NULL DEFAULT 0.00`, `cgst_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `sgst_rate`: `NUMERIC(5, 2) NOT NULL DEFAULT 0.00`, `sgst_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `igst_rate`: `NUMERIC(5, 2) NOT NULL DEFAULT 0.00`, `igst_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `total_tax`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `grand_total`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
* `advance_paid`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `security_deposit_held`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `amount_paid`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `balance_due`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `amount_in_words`: `TEXT NOT NULL`
* `notes`: `TEXT`, `terms_and_conditions`: `TEXT`
* `document_lines`: `JSONB DEFAULT '[]'::jsonb`
* `original_grand_total`: `NUMERIC(12, 2)`, `additional_rental_charges`: `NUMERIC(12, 2) DEFAULT 0.00`, `approved_damage_charges`: `NUMERIC(12, 2) DEFAULT 0.00`, `approved_missing_charges`: `NUMERIC(12, 2) DEFAULT 0.00`, `late_fee_charges`: `NUMERIC(12, 2) DEFAULT 0.00`, `deposit_adjustment`: `NUMERIC(12, 2) DEFAULT 0.00`, `deposit_refund_due`: `NUMERIC(12, 2) DEFAULT 0.00`, `customer_credit`: `NUMERIC(12, 2) DEFAULT 0.00`
* `payment_status`: `VARCHAR(50) DEFAULT 'UNPAID'`, `is_overdue`: `BOOLEAN DEFAULT false`
* `total_returned_good`: `INTEGER DEFAULT 0`, `total_damaged`: `INTEGER DEFAULT 0`, `total_missing`: `INTEGER DEFAULT 0`, `actual_return_date`: `DATE`, `expected_return_date`: `DATE`
* `incidents`: `JSONB DEFAULT '[]'::jsonb`, `amendments`: `JSONB DEFAULT '[]'::jsonb`, `notes_list`: `JSONB DEFAULT '[]'::jsonb`, `branches`: `JSONB DEFAULT '[]'::jsonb`
* `created_by`: `UUID REFERENCES public.users(id)`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 12. `bill_branches`
* `id`: `UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
* `bill_id`: `UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE`
* `customer_branch_id`: `UUID REFERENCES public.customer_branches(id)`
* `branch_name`: `VARCHAR(255) NOT NULL`, `delivery_address`: `TEXT`, `section_order`: `INTEGER NOT NULL DEFAULT 0`, `branch_subtotal`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 13. `bill_items`
* `id`: `VARCHAR(100) PRIMARY KEY DEFAULT uuid_generate_v4()::text`
* `bill_branch_id`: `VARCHAR(100) NOT NULL`
* `bill_id`: `VARCHAR(100) NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE`
* `product_id`: `VARCHAR(100)` *(nullable)*
* `item_name`: `VARCHAR(255) NOT NULL`, `size_spec`: `VARCHAR(100)`, `quantity`: `INTEGER NOT NULL DEFAULT 1`, `days`: `INTEGER NOT NULL DEFAULT 1`, `unit_price`: `NUMERIC(12, 2) NOT NULL DEFAULT 0.00`, `amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`, `item_order`: `INTEGER NOT NULL DEFAULT 0`
* `entry_type`: `VARCHAR(20) DEFAULT 'product'`, `position`: `INTEGER DEFAULT 0`, `text`: `TEXT`, `quantity_physically_returned`: `INTEGER DEFAULT 0`, `notes`: `TEXT`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
* `CONSTRAINTS`: `CHECK (entry_type = 'note' OR quantity >= 0)`, `CHECK (entry_type = 'note' OR days >= 0)`

### 14. `gate_passes`
* `id`: `VARCHAR(100) PRIMARY KEY DEFAULT uuid_generate_v4()::text`
* `gate_pass_number`: `VARCHAR(100) NOT NULL UNIQUE`, `company_id`: `VARCHAR(100) NOT NULL`, `company_snapshot`: `JSONB NOT NULL`, `customer_id`: `VARCHAR(100) NOT NULL`, `customer_name`: `VARCHAR(255) NOT NULL`, `destination_branch`: `VARCHAR(255) NOT NULL`, `destination_address`: `TEXT NOT NULL`
* `reservation_id`: `UUID REFERENCES public.reservations(id)`, `bill_id`: `VARCHAR(100)`
* `dispatch_date`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `expected_return_date`: `DATE NOT NULL`
* `vehicle_number`: `VARCHAR(100)`, `driver_name`: `VARCHAR(100)`, `driver_phone`: `VARCHAR(50)`, `authorized_by`: `VARCHAR(100) NOT NULL DEFAULT 'Store Manager'`, `notes`: `TEXT`
* `status`: `VARCHAR(50) NOT NULL DEFAULT 'DISPATCHED' CHECK (status IN ('DISPATCHED', 'PARTIALLY_RETURNED', 'RETURNED', 'CLOSED'))`
* `created_by`: `UUID REFERENCES public.users(id)`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 15. `gate_pass_items`
* `id`: `UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
* `gate_pass_id`: `UUID NOT NULL REFERENCES public.gate_passes(id) ON DELETE CASCADE`
* `product_id`: `UUID NOT NULL REFERENCES public.products(id)`, `item_name`: `VARCHAR(255) NOT NULL`, `size_spec`: `VARCHAR(100)`
* `quantity_dispatched`: `INTEGER NOT NULL DEFAULT 1 CHECK (quantity_dispatched > 0)`
* `quantity_returned`: `INTEGER NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0)`
* `quantity_damaged`: `INTEGER NOT NULL DEFAULT 0 CHECK (quantity_damaged >= 0)`
* `quantity_missing`: `INTEGER NOT NULL DEFAULT 0 CHECK (quantity_missing >= 0)`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 16. `returns`
* `id`: `VARCHAR(100) PRIMARY KEY DEFAULT uuid_generate_v4()::text`
* `return_number`: `VARCHAR(100) NOT NULL UNIQUE`, `gate_pass_id`: `VARCHAR(100) NOT NULL`, `company_id`: `VARCHAR(100) NOT NULL`, `customer_id`: `VARCHAR(100) NOT NULL`
* `return_date`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `inspected_by`: `VARCHAR(100) NOT NULL`
* `damage_charges`: `NUMERIC(12, 2) NOT NULL DEFAULT 0.00`, `late_fee_charges`: `NUMERIC(12, 2) NOT NULL DEFAULT 0.00`, `deposit_adjustment`: `NUMERIC(12, 2) NOT NULL DEFAULT 0.00`, `notes`: `TEXT`
* `created_by`: `UUID REFERENCES public.users(id)`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 17. `return_items`
* `id`: `UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
* `return_id`: `UUID NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE`
* `product_id`: `UUID NOT NULL REFERENCES public.products(id)`, `gate_pass_item_id`: `UUID NOT NULL REFERENCES public.gate_pass_items(id)`
* `item_name`: `VARCHAR(255) NOT NULL`, `quantity_expected`: `INTEGER NOT NULL`
* `quantity_returned_good`: `INTEGER NOT NULL DEFAULT 0`, `quantity_damaged`: `INTEGER NOT NULL DEFAULT 0`, `quantity_missing`: `INTEGER NOT NULL DEFAULT 0`, `damage_notes`: `TEXT`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 18. `inventory_movements`
* `id`: `UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
* `product_id`: `UUID NOT NULL`
* `movement_type`: `VARCHAR(50) NOT NULL CHECK (movement_type IN ('OPENING', 'MANUAL_ADJUSTMENT', 'IMPORT', 'RESERVATION_HOLD', 'RESERVATION_RELEASE', 'DISPATCH', 'RETURN_GOOD', 'RETURN_DAMAGED', 'RETURN_MISSING', 'REPAIR_RESTORE'))`
* `quantity_change`: `INTEGER NOT NULL`, `reference_type`: `VARCHAR(50) NOT NULL`, `reference_id`: `VARCHAR(100)`, `balance_after`: `INTEGER NOT NULL`, `notes`: `TEXT`
* `created_by`: `UUID REFERENCES public.users(id)`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 19. `payments`
* `id`: `VARCHAR(100) PRIMARY KEY DEFAULT uuid_generate_v4()::text`
* `payment_number`: `VARCHAR(100) NOT NULL UNIQUE`
* `bill_id`: `VARCHAR(100) REFERENCES public.bills(id) ON DELETE SET NULL`
* `company_id`: `VARCHAR(100) NOT NULL`, `customer_id`: `VARCHAR(100) NOT NULL`
* `payment_type`: `VARCHAR(50) NOT NULL CHECK (payment_type IN ('RENTAL_PAYMENT', 'ADVANCE', 'SECURITY_DEPOSIT', 'DEPOSIT_REFUND', 'DAMAGE_SETTLEMENT'))`
* `amount`: `NUMERIC(14, 2) NOT NULL CHECK (amount > 0)`, `payment_date`: `DATE NOT NULL DEFAULT CURRENT_DATE`
* `payment_method`: `VARCHAR(50) NOT NULL CHECK (payment_method IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE'))`
* `reference_number`: `VARCHAR(100)`, `notes`: `TEXT`, `is_reversed`: `BOOLEAN NOT NULL DEFAULT false`, `reversed_at`: `TIMESTAMPTZ`, `reversal_reason`: `TEXT`
* `created_by`: `UUID REFERENCES public.users(id)`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 20. `audit_logs`
* `id`: `UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
* `actor_id`: `UUID`, `actor_name`: `VARCHAR(255) NOT NULL DEFAULT 'System'`, `actor_username`: `VARCHAR(100)`, `actor_role`: `VARCHAR(50)`
* `action`: `VARCHAR(100) NOT NULL`, `action_label`: `VARCHAR(255)`, `entity_type`: `VARCHAR(100) NOT NULL`, `entity_id`: `VARCHAR(100) NOT NULL`, `entity_number`: `VARCHAR(100)`, `customer_name`: `VARCHAR(255)`
* `details`: `JSONB DEFAULT '{}'::jsonb`, `ip_address`: `VARCHAR(50)`, `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 21. `activity_notifications`
* `id`: `VARCHAR(100) PRIMARY KEY DEFAULT uuid_generate_v4()::text`
* `type`: `VARCHAR(50) NOT NULL`, `user_id`: `VARCHAR(100) NOT NULL`, `user_name`: `VARCHAR(255) NOT NULL`, `username`: `VARCHAR(100) NOT NULL`, `role`: `VARCHAR(50) NOT NULL`, `session_id`: `VARCHAR(100) NOT NULL`
* `title`: `VARCHAR(255) NOT NULL`, `message`: `TEXT NOT NULL`, `is_read`: `BOOLEAN NOT NULL DEFAULT false`, `read_at`: `TIMESTAMPTZ`, `is_rejected`: `BOOLEAN NOT NULL DEFAULT false`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 22. `login_rate_limits`
* `key`: `TEXT PRIMARY KEY`
* `attempts`: `INTEGER NOT NULL DEFAULT 0`, `window_start`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `locked_until`: `TIMESTAMPTZ`

### 23. `product_imports` (Legacy / Parity Table)
* `id`: `UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
* `filename`: `VARCHAR(255) NOT NULL`, `total_rows`: `INTEGER NOT NULL DEFAULT 0`, `imported_count`: `INTEGER NOT NULL DEFAULT 0`, `skipped_count`: `INTEGER NOT NULL DEFAULT 0`, `errors`: `JSONB DEFAULT '[]'::jsonb`
* `created_by`: `UUID REFERENCES public.users(id)`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 24. `reservations` (Legacy / Parity Table)
* `id`: `UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
* `reservation_number`: `VARCHAR(100) NOT NULL UNIQUE`, `quotation_id`: `UUID REFERENCES public.quotations(id)`, `bill_id`: `UUID REFERENCES public.bills(id)`, `company_id`: `UUID NOT NULL REFERENCES public.companies(id)`, `customer_id`: `UUID NOT NULL REFERENCES public.customers(id)`
* `rental_start_date`: `DATE NOT NULL`, `rental_end_date`: `DATE NOT NULL`, `status`: `VARCHAR(50) NOT NULL DEFAULT 'PENDING'`
* `advance_required`: `NUMERIC(12, 2) NOT NULL DEFAULT 0.00`, `deposit_required`: `NUMERIC(12, 2) NOT NULL DEFAULT 0.00`, `notes`: `TEXT`
* `created_by`: `UUID REFERENCES public.users(id)`, `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 25. `reservation_items` (Legacy / Parity Table)
* `id`: `UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
* `reservation_id`: `UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE`, `product_id`: `UUID NOT NULL REFERENCES public.products(id)`
* `branch_name`: `VARCHAR(255)`, `quantity_reserved`: `INTEGER NOT NULL DEFAULT 1 CHECK (quantity_reserved > 0)`, `quantity_dispatched`: `INTEGER NOT NULL DEFAULT 0`, `quantity_returned`: `INTEGER NOT NULL DEFAULT 0`, `quantity_damaged`: `INTEGER NOT NULL DEFAULT 0`, `quantity_missing`: `INTEGER NOT NULL DEFAULT 0`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 26. `whatsapp_logs` (Legacy / Parity Table)
* `id`: `UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
* `document_type`: `VARCHAR(50) NOT NULL CHECK (document_type IN ('QUOTATION', 'BILL', 'GATE_PASS', 'RECEIPT'))`, `document_id`: `UUID NOT NULL`, `document_number`: `VARCHAR(100) NOT NULL`, `recipient_phone`: `VARCHAR(50) NOT NULL`, `recipient_name`: `VARCHAR(255) NOT NULL`, `share_method`: `VARCHAR(50) NOT NULL DEFAULT 'HANDOFF_WEB'`, `status`: `VARCHAR(50) NOT NULL DEFAULT 'PREPARED'`, `message_payload`: `TEXT`, `error_message`: `TEXT`
* `created_by`: `UUID REFERENCES public.users(id)`
* `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

---

## 4. Stored Functions Inventory

### 1. `login_rate_limit_status(p_key TEXT)`
* **Returns:** `TABLE (blocked BOOLEAN, retry_after_seconds INTEGER)`
* **Language:** SQL, `SECURITY DEFINER`, `SET search_path = public`

### 2. `login_rate_limit_record_failure(p_key TEXT, p_max INTEGER, p_window_seconds INTEGER, p_lockout_seconds INTEGER)`
* **Returns:** `TABLE (blocked BOOLEAN, retry_after_seconds INTEGER, attempts INTEGER)`
* **Language:** PLPGSQL, `SECURITY DEFINER`, `SET search_path = public`

### 3. `login_rate_limit_clear(p_key TEXT)`
* **Returns:** `VOID`
* **Language:** SQL, `SECURITY DEFINER`, `SET search_path = public`

### 4. `adjust_product_stock_quantities(p_product_id VARCHAR(100), p_rented_delta INTEGER DEFAULT 0, p_available_delta INTEGER DEFAULT 0, p_damaged_delta INTEGER DEFAULT 0, p_missing_delta INTEGER DEFAULT 0)`
* **Returns:** `public.products`
* **Language:** PLPGSQL, `SECURITY DEFINER`
* **Status:** Defined in migration `20261017`. Unused by current store code, but verified syntactically sound.
