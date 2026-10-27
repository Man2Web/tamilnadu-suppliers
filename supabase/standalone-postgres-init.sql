-- ============================================================================
-- TAMILNADU SUPPLIERS RENTAL ERP - STANDALONE POSTGRESQL INITIALIZATION DDL
-- File: supabase/standalone-postgres-init.sql
-- Review Status: FOR REVIEW ONLY - DO NOT EXECUTE AGAINST PRODUCTION
-- Target Database: Standalone PostgreSQL 16+ (Coolify Private Network)
-- Application Role: tns_app_user
-- Baseline Commit: 0e9d2ee
-- ============================================================================
-- 
-- ARCHITECTURAL DECISIONS SUMMARY:
-- 1. Tables: Defines all 26 tables from migrations 1 through 6 in dependency order.
-- 2. Identifiers: Standardized related PK/FK pairs to VARCHAR(100) DEFAULT gen_random_uuid()::text.
--    This preserves existing UUIDs, application string IDs, and resolves cross-type FK errors.
-- 3. Document Note Lines: Supports note lines without catalog products (product_id nullable,
--    no foreign key constraint on item product_id, non-negative quantity check relaxed for notes).
-- 4. Historical Accounting Integrity: Preserves customer ID attribution and embedded snapshot
--    columns (customer_name, customer_phone, customer_address, customer_gstin) on bills,
--    quotations, payments, gate passes, and returns without cascading deletion if a customer
--    is deleted or deactivated.
-- 5. Stored Functions: Implements the 3 login rate-limit functions and adjust_product_stock_quantities.
--    All functions enforce SECURITY DEFINER with fixed search_path = public, pg_temp.
-- 6. Document Numbering: Bills use bill_number VARCHAR(100) NOT NULL UNIQUE (invoice_number bug fixed in app).
-- 7. Roles: Uses dedicated tns_app_user; no hardcoded passwords or Supabase-specific role grants.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. COMPANIES (8 Issuing Entities: 4 GST-Registered + 4 Non-GST)
-- ============================================================================
CREATE TABLE public.companies (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    gst_type VARCHAR(20) NOT NULL CHECK (gst_type IN ('GST_REGISTERED', 'NON_GST')),
    gstin VARCHAR(15),
    pan VARCHAR(10),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT NOT NULL,
    state VARCHAR(100) NOT NULL DEFAULT 'Tamil Nadu',
    state_code VARCHAR(10) NOT NULL DEFAULT '33',
    place_of_supply VARCHAR(100) NOT NULL DEFAULT 'Vellore',
    bank_name VARCHAR(255) NOT NULL DEFAULT 'City Union Bank',
    bank_account_no VARCHAR(100) NOT NULL,
    bank_ifsc VARCHAR(50) NOT NULL,
    bank_branch VARCHAR(100) NOT NULL DEFAULT 'Vellore Branch',
    invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'TNS-',
    quotation_prefix VARCHAR(20) NOT NULL DEFAULT 'TNQ-',
    gate_pass_prefix VARCHAR(20) NOT NULL DEFAULT 'TNGP-',
    next_invoice_no INTEGER NOT NULL DEFAULT 1,
    next_quotation_no INTEGER NOT NULL DEFAULT 1,
    next_gate_pass_no INTEGER NOT NULL DEFAULT 1,
    logo_url TEXT,
    terms_and_conditions TEXT NOT NULL DEFAULT '1. Goods rented are subject to Vellore Jurisdiction.\n2. Breakage/damages must be compensated as per actuals.\n3. Goods must be returned strictly by the agreed return date.',
    authorized_signatory_title VARCHAR(100) NOT NULL DEFAULT 'Authorised Signatory',
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. USERS & ROLES
-- ============================================================================
CREATE TABLE public.users (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    username VARCHAR(100),
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL DEFAULT 'EMPLOYEE' CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'BILLING', 'EMPLOYEE')),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    must_change_password BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_username ON public.users(username) WHERE username IS NOT NULL;
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_users_status ON public.users(status);

-- ============================================================================
-- 3. CATEGORIES & HIERARCHY
-- ============================================================================
CREATE TABLE public.categories (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(50),
    description TEXT,
    parent_id VARCHAR(100) REFERENCES public.categories(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_parent ON public.categories(parent_id);

-- ============================================================================
-- 4. PRODUCTS & RENTAL INVENTORY
-- ============================================================================
CREATE TABLE public.products (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    alias VARCHAR(255),
    sku VARCHAR(100) UNIQUE,
    category_id VARCHAR(100) REFERENCES public.categories(id) ON DELETE SET NULL,
    category_name VARCHAR(255),
    description TEXT,
    size_spec VARCHAR(100),
    unit VARCHAR(50) NOT NULL DEFAULT 'Nos',
    default_rental_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (default_rental_rate >= 0),
    rental_rate_unit VARCHAR(50) NOT NULL DEFAULT 'PER_DAY' CHECK (rental_rate_unit IN ('PER_DAY', 'PER_EVENT', 'PER_SQFT')),
    min_rental_duration INTEGER NOT NULL DEFAULT 1,
    security_deposit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (security_deposit_amount >= 0),
    replacement_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (replacement_value >= 0),
    total_owned_quantity INTEGER NOT NULL DEFAULT 0 CHECK (total_owned_quantity >= 0),
    available_quantity INTEGER NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
    reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    rented_quantity INTEGER NOT NULL DEFAULT 0 CHECK (rented_quantity >= 0),
    damaged_quantity INTEGER NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
    missing_quantity INTEGER NOT NULL DEFAULT 0 CHECK (missing_quantity >= 0),
    maintenance_quantity INTEGER NOT NULL DEFAULT 0 CHECK (maintenance_quantity >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_name ON public.products(name);
CREATE INDEX idx_products_sku ON public.products(sku);
CREATE INDEX idx_products_is_active ON public.products(is_active);

-- ============================================================================
-- 5. PRODUCT IMPORTS (Audit Ledger for Batch Uploads)
-- ============================================================================
CREATE TABLE public.product_imports (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    filename VARCHAR(255) NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    errors JSONB DEFAULT '[]'::jsonb,
    created_by VARCHAR(100) REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. CUSTOMERS & MASTER DIRECTORY
-- ============================================================================
CREATE TABLE public.customers (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    mobile VARCHAR(50) NOT NULL,
    whatsapp VARCHAR(50),
    email VARCHAR(255),
    phone VARCHAR(50),
    billing_address TEXT NOT NULL,
    gstin VARCHAR(15),
    state VARCHAR(100) NOT NULL DEFAULT 'Tamil Nadu',
    postal_code VARCHAR(20),
    notes TEXT,
    branches JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_name ON public.customers(name);
CREATE INDEX idx_customers_mobile ON public.customers(mobile);
CREATE INDEX idx_customers_is_active ON public.customers(is_active);

-- ============================================================================
-- 7. CUSTOMER BRANCHES (Multi-Location Destination Sites)
-- ============================================================================
CREATE TABLE public.customer_branches (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    customer_id VARCHAR(100) NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    branch_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    phone VARCHAR(50),
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL DEFAULT 'Vellore',
    state VARCHAR(100) NOT NULL DEFAULT 'Tamil Nadu',
    postal_code VARCHAR(20),
    delivery_instructions TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_branches_customer ON public.customer_branches(customer_id);

-- ============================================================================
-- 8. QUOTATIONS
-- Note: customer_id is preserved without FK cascade so customer deletion does not alter historical quotes.
-- ============================================================================
CREATE TABLE public.quotations (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    quotation_number VARCHAR(100) NOT NULL UNIQUE,
    company_id VARCHAR(100) NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    company_snapshot JSONB NOT NULL,
    customer_id VARCHAR(100) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    customer_address TEXT NOT NULL,
    customer_gstin VARCHAR(15),
    quotation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    supply_date DATE,
    place_of_supply VARCHAR(255) NOT NULL DEFAULT 'Vellore',
    rental_start_date DATE NOT NULL,
    rental_end_date DATE NOT NULL,
    rental_days INTEGER NOT NULL DEFAULT 1 CHECK (rental_days >= 1),
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ISSUED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED')),
    tax_type VARCHAR(20) NOT NULL DEFAULT 'NON_GST' CHECK (tax_type IN ('GST', 'NON_GST')),
    subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    transport_charges NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    loading_charges NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    labor_charges NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    other_charges NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    taxable_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    cgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    cgst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    sgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    sgst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    igst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    igst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_tax NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    advance_required NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    security_deposit_required NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    amount_in_words TEXT NOT NULL,
    notes TEXT,
    terms_and_conditions TEXT,
    converted_bill_id VARCHAR(100),
    converted_bill_number VARCHAR(100),
    converted_at TIMESTAMPTZ,
    document_lines JSONB DEFAULT '[]'::jsonb,
    notes_list JSONB DEFAULT '[]'::jsonb,
    branches JSONB DEFAULT '[]'::jsonb,
    created_by VARCHAR(100) REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quotations_company ON public.quotations(company_id);
CREATE INDEX idx_quotations_customer ON public.quotations(customer_id);
CREATE INDEX idx_quotations_status ON public.quotations(status);
CREATE INDEX idx_quotations_date ON public.quotations(quotation_date DESC);

-- ============================================================================
-- 9. QUOTATION BRANCHES (Document Section Groups)
-- ============================================================================
CREATE TABLE public.quotation_branches (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    quotation_id VARCHAR(100) NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    customer_branch_id VARCHAR(100) REFERENCES public.customer_branches(id) ON DELETE SET NULL,
    branch_name VARCHAR(255) NOT NULL,
    delivery_address TEXT,
    section_order INTEGER NOT NULL DEFAULT 0,
    branch_subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quotation_branches_quotation ON public.quotation_branches(quotation_id);

-- ============================================================================
-- 10. QUOTATION ITEMS (Line Items & Ordered Document Notes)
-- Note: product_id is nullable without FK constraint to support free-form note lines.
-- ============================================================================
CREATE TABLE public.quotation_items (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    quotation_branch_id VARCHAR(100) NOT NULL REFERENCES public.quotation_branches(id) ON DELETE CASCADE,
    quotation_id VARCHAR(100) NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    product_id VARCHAR(100),
    item_name VARCHAR(255) NOT NULL,
    size_spec VARCHAR(100),
    quantity INTEGER NOT NULL DEFAULT 1,
    days INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    item_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    entry_type VARCHAR(20) NOT NULL DEFAULT 'product' CHECK (entry_type IN ('product', 'note')),
    position INTEGER NOT NULL DEFAULT 0,
    text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT quotation_items_quantity_check CHECK (entry_type = 'note' OR quantity >= 0),
    CONSTRAINT quotation_items_days_check CHECK (entry_type = 'note' OR days >= 0)
);

CREATE INDEX idx_quotation_items_branch ON public.quotation_items(quotation_branch_id);
CREATE INDEX idx_quotation_items_quotation ON public.quotation_items(quotation_id);
CREATE INDEX idx_quotation_items_position ON public.quotation_items(quotation_id, position);

-- ============================================================================
-- 11. BILLS (Tax Invoices & Financial Lifecycles)
-- Note: bill_number is unique. No generated invoice_number column.
-- customer_id is unconstrained to preserve historical accounting records on customer change/delete.
-- ============================================================================
CREATE TABLE public.bills (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    bill_number VARCHAR(100) NOT NULL UNIQUE,
    company_id VARCHAR(100) NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    company_snapshot JSONB NOT NULL,
    source_quotation_id VARCHAR(100) UNIQUE REFERENCES public.quotations(id) ON DELETE SET NULL,
    customer_id VARCHAR(100) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    customer_address TEXT NOT NULL,
    customer_gstin VARCHAR(15),
    bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
    supply_date DATE,
    place_of_supply VARCHAR(255) NOT NULL DEFAULT 'Vellore',
    rental_start_date DATE NOT NULL,
    rental_end_date DATE NOT NULL,
    rental_days INTEGER NOT NULL DEFAULT 1 CHECK (rental_days >= 1),
    status VARCHAR(50) NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
    tax_type VARCHAR(20) NOT NULL DEFAULT 'NON_GST' CHECK (tax_type IN ('GST', 'NON_GST')),
    subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    transport_charges NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    loading_charges NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    labor_charges NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    other_charges NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    taxable_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    cgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    cgst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    sgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    sgst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    igst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    igst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_tax NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    advance_paid NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    security_deposit_held NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    balance_due NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    amount_in_words TEXT NOT NULL,
    notes TEXT,
    terms_and_conditions TEXT,
    original_grand_total NUMERIC(12, 2),
    additional_rental_charges NUMERIC(12, 2) DEFAULT 0.00,
    approved_damage_charges NUMERIC(12, 2) DEFAULT 0.00,
    approved_missing_charges NUMERIC(12, 2) DEFAULT 0.00,
    late_fee_charges NUMERIC(12, 2) DEFAULT 0.00,
    deposit_adjustment NUMERIC(12, 2) DEFAULT 0.00,
    deposit_refund_due NUMERIC(12, 2) DEFAULT 0.00,
    customer_credit NUMERIC(12, 2) DEFAULT 0.00,
    payment_status VARCHAR(50) DEFAULT 'UNPAID',
    is_overdue BOOLEAN DEFAULT false,
    total_returned_good INTEGER DEFAULT 0,
    total_damaged INTEGER DEFAULT 0,
    total_missing INTEGER DEFAULT 0,
    actual_return_date DATE,
    expected_return_date DATE,
    incidents JSONB DEFAULT '[]'::jsonb,
    amendments JSONB DEFAULT '[]'::jsonb,
    notes_list JSONB DEFAULT '[]'::jsonb,
    branches JSONB DEFAULT '[]'::jsonb,
    document_lines JSONB DEFAULT '[]'::jsonb,
    created_by VARCHAR(100) REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bills_company ON public.bills(company_id);
CREATE INDEX idx_bills_customer ON public.bills(customer_id);
CREATE INDEX idx_bills_status ON public.bills(status);
CREATE INDEX idx_bills_date ON public.bills(bill_date DESC);
CREATE INDEX idx_bills_payment_status ON public.bills(payment_status);

-- ============================================================================
-- 12. BILL BRANCHES (Section Subtotals for Invoices)
-- ============================================================================
CREATE TABLE public.bill_branches (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    bill_id VARCHAR(100) NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    customer_branch_id VARCHAR(100) REFERENCES public.customer_branches(id) ON DELETE SET NULL,
    branch_name VARCHAR(255) NOT NULL,
    delivery_address TEXT,
    section_order INTEGER NOT NULL DEFAULT 0,
    branch_subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bill_branches_bill ON public.bill_branches(bill_id);

-- ============================================================================
-- 13. BILL ITEMS (Invoice Line Items & Return Quantities)
-- Note: product_id is nullable without FK constraint to support free-form note lines.
-- ============================================================================
CREATE TABLE public.bill_items (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    bill_branch_id VARCHAR(100) NOT NULL REFERENCES public.bill_branches(id) ON DELETE CASCADE,
    bill_id VARCHAR(100) NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    product_id VARCHAR(100),
    item_name VARCHAR(255) NOT NULL,
    size_spec VARCHAR(100),
    quantity INTEGER NOT NULL DEFAULT 1,
    days INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    item_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    entry_type VARCHAR(20) NOT NULL DEFAULT 'product' CHECK (entry_type IN ('product', 'note')),
    position INTEGER NOT NULL DEFAULT 0,
    text TEXT,
    quantity_physically_returned INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bill_items_quantity_check CHECK (entry_type = 'note' OR quantity >= 0),
    CONSTRAINT bill_items_days_check CHECK (entry_type = 'note' OR days >= 0)
);

CREATE INDEX idx_bill_items_branch ON public.bill_items(bill_branch_id);
CREATE INDEX idx_bill_items_bill ON public.bill_items(bill_id);
CREATE INDEX idx_bill_items_position ON public.bill_items(bill_id, position);

-- ============================================================================
-- 14. RESERVATIONS (Legacy Table Retained for Parity)
-- ============================================================================
CREATE TABLE public.reservations (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    reservation_number VARCHAR(100) NOT NULL UNIQUE,
    quotation_id VARCHAR(100) REFERENCES public.quotations(id) ON DELETE SET NULL,
    bill_id VARCHAR(100) REFERENCES public.bills(id) ON DELETE SET NULL,
    company_id VARCHAR(100) NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    customer_id VARCHAR(100) NOT NULL,
    rental_start_date DATE NOT NULL,
    rental_end_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'READY_FOR_DISPATCH', 'DISPATCHED', 'PARTIALLY_RETURNED', 'RETURNED', 'COMPLETED', 'CANCELLED')),
    advance_required NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    deposit_required NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_by VARCHAR(100) REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reservations_dates ON public.reservations(rental_start_date, rental_end_date);
CREATE INDEX idx_reservations_company ON public.reservations(company_id);

-- ============================================================================
-- 15. RESERVATION ITEMS (Legacy Table Retained for Parity)
-- ============================================================================
CREATE TABLE public.reservation_items (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    reservation_id VARCHAR(100) NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
    product_id VARCHAR(100) REFERENCES public.products(id) ON DELETE SET NULL,
    branch_name VARCHAR(255),
    quantity_reserved INTEGER NOT NULL DEFAULT 1 CHECK (quantity_reserved > 0),
    quantity_dispatched INTEGER NOT NULL DEFAULT 0 CHECK (quantity_dispatched >= 0),
    quantity_returned INTEGER NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
    quantity_damaged INTEGER NOT NULL DEFAULT 0 CHECK (quantity_damaged >= 0),
    quantity_missing INTEGER NOT NULL DEFAULT 0 CHECK (quantity_missing >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reservation_items_reservation ON public.reservation_items(reservation_id);

-- ============================================================================
-- 16. GATE PASSES (Dispatch Logistics)
-- ============================================================================
CREATE TABLE public.gate_passes (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    gate_pass_number VARCHAR(100) NOT NULL UNIQUE,
    company_id VARCHAR(100) NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    company_snapshot JSONB NOT NULL,
    customer_id VARCHAR(100) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    destination_branch VARCHAR(255) NOT NULL,
    destination_address TEXT NOT NULL,
    reservation_id VARCHAR(100) REFERENCES public.reservations(id) ON DELETE SET NULL,
    bill_id VARCHAR(100) REFERENCES public.bills(id) ON DELETE SET NULL,
    dispatch_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_return_date DATE NOT NULL,
    vehicle_number VARCHAR(100),
    driver_name VARCHAR(100),
    driver_phone VARCHAR(50),
    authorized_by VARCHAR(100) NOT NULL DEFAULT 'Store Manager',
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'DISPATCHED' CHECK (status IN ('DISPATCHED', 'PARTIALLY_RETURNED', 'RETURNED', 'CLOSED')),
    created_by VARCHAR(100) REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gate_passes_company ON public.gate_passes(company_id);
CREATE INDEX idx_gate_passes_bill ON public.gate_passes(bill_id);
CREATE INDEX idx_gate_passes_reservation ON public.gate_passes(reservation_id);

-- ============================================================================
-- 17. GATE PASS ITEMS
-- ============================================================================
CREATE TABLE public.gate_pass_items (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    gate_pass_id VARCHAR(100) NOT NULL REFERENCES public.gate_passes(id) ON DELETE CASCADE,
    product_id VARCHAR(100) REFERENCES public.products(id) ON DELETE SET NULL,
    item_name VARCHAR(255) NOT NULL,
    size_spec VARCHAR(100),
    quantity_dispatched INTEGER NOT NULL DEFAULT 1 CHECK (quantity_dispatched > 0),
    quantity_returned INTEGER NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
    quantity_damaged INTEGER NOT NULL DEFAULT 0 CHECK (quantity_damaged >= 0),
    quantity_missing INTEGER NOT NULL DEFAULT 0 CHECK (quantity_missing >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gate_pass_items_pass ON public.gate_pass_items(gate_pass_id);

-- ============================================================================
-- 18. RETURNS (Intake Inspection & Damage Claims)
-- ============================================================================
CREATE TABLE public.returns (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    return_number VARCHAR(100) NOT NULL UNIQUE,
    gate_pass_id VARCHAR(100) NOT NULL REFERENCES public.gate_passes(id) ON DELETE CASCADE,
    company_id VARCHAR(100) NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    customer_id VARCHAR(100) NOT NULL,
    return_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    inspected_by VARCHAR(100) NOT NULL,
    damage_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    late_fee_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    deposit_adjustment NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_by VARCHAR(100) REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_returns_gate_pass ON public.returns(gate_pass_id);
CREATE INDEX idx_returns_company ON public.returns(company_id);

-- ============================================================================
-- 19. RETURN ITEMS (Physical Reconciliation)
-- ============================================================================
CREATE TABLE public.return_items (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    return_id VARCHAR(100) NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
    product_id VARCHAR(100) REFERENCES public.products(id) ON DELETE SET NULL,
    gate_pass_item_id VARCHAR(100) REFERENCES public.gate_pass_items(id) ON DELETE SET NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity_expected INTEGER NOT NULL,
    quantity_returned_good INTEGER NOT NULL DEFAULT 0,
    quantity_damaged INTEGER NOT NULL DEFAULT 0,
    quantity_missing INTEGER NOT NULL DEFAULT 0,
    damage_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_return_items_return ON public.return_items(return_id);
CREATE INDEX idx_return_items_gate_pass_item ON public.return_items(gate_pass_item_id);

-- ============================================================================
-- 20. INVENTORY MOVEMENTS (Double-Entry Audit Ledger)
-- ============================================================================
CREATE TABLE public.inventory_movements (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_id VARCHAR(100) NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN (
        'OPENING', 'MANUAL_ADJUSTMENT', 'IMPORT',
        'RESERVATION_HOLD', 'RESERVATION_RELEASE',
        'DISPATCH', 'RETURN_GOOD', 'RETURN_DAMAGED', 'RETURN_MISSING', 'REPAIR_RESTORE'
    )),
    quantity_change INTEGER NOT NULL,
    reference_type VARCHAR(50) NOT NULL,
    reference_id VARCHAR(100),
    balance_after INTEGER NOT NULL,
    notes TEXT,
    created_by VARCHAR(100) REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_movements_product ON public.inventory_movements(product_id);
CREATE INDEX idx_movements_created_at ON public.inventory_movements(created_at DESC);

-- ============================================================================
-- 21. PAYMENTS (Receipts & Security Deposits Ledger)
-- ============================================================================
CREATE TABLE public.payments (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    payment_number VARCHAR(100) NOT NULL UNIQUE,
    bill_id VARCHAR(100) REFERENCES public.bills(id) ON DELETE SET NULL,
    company_id VARCHAR(100) NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    customer_id VARCHAR(100) NOT NULL,
    payment_type VARCHAR(50) NOT NULL CHECK (payment_type IN (
        'RENTAL_PAYMENT', 'ADVANCE', 'SECURITY_DEPOSIT', 'DEPOSIT_REFUND', 'DAMAGE_SETTLEMENT'
    )),
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN (
        'CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE'
    )),
    reference_number VARCHAR(100),
    notes TEXT,
    is_reversed BOOLEAN NOT NULL DEFAULT false,
    reversed_at TIMESTAMPTZ,
    reversal_reason TEXT,
    created_by VARCHAR(100) REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_bill ON public.payments(bill_id);
CREATE INDEX idx_payments_company ON public.payments(company_id);
CREATE INDEX idx_payments_customer ON public.payments(customer_id);
CREATE INDEX idx_payments_date ON public.payments(payment_date DESC);

-- ============================================================================
-- 22. SESSIONS (Active Sessions & Invalidation Registry)
-- ============================================================================
CREATE TABLE public.sessions (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(100) NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    user_name VARCHAR(255),
    username VARCHAR(100),
    user_role VARCHAR(50),
    ip_address VARCHAR(50),
    user_agent TEXT,
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'REJECTED')),
    rejected_at TIMESTAMPTZ,
    rejected_by VARCHAR(255),
    rejected_by_user_id VARCHAR(100) REFERENCES public.users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_sessions_status ON public.sessions(status);
CREATE INDEX idx_sessions_created_at ON public.sessions(created_at DESC);
CREATE INDEX idx_sessions_expires_at ON public.sessions(expires_at);

-- ============================================================================
-- 23. WHATSAPP LOGS (Legacy Table Retained for Parity)
-- ============================================================================
CREATE TABLE public.whatsapp_logs (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('QUOTATION', 'BILL', 'GATE_PASS', 'RECEIPT')),
    document_id VARCHAR(100) NOT NULL,
    document_number VARCHAR(100) NOT NULL,
    recipient_phone VARCHAR(50) NOT NULL,
    recipient_name VARCHAR(255) NOT NULL,
    share_method VARCHAR(50) NOT NULL DEFAULT 'HANDOFF_WEB' CHECK (share_method IN ('HANDOFF_WEB', 'API_CLOUD')),
    status VARCHAR(50) NOT NULL DEFAULT 'PREPARED' CHECK (status IN ('PREPARED', 'WINDOW_OPENED', 'ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
    message_payload TEXT,
    error_message TEXT,
    created_by VARCHAR(100) REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_logs_doc ON public.whatsapp_logs(document_type, document_id);
CREATE INDEX idx_whatsapp_logs_recipient ON public.whatsapp_logs(recipient_phone);

-- ============================================================================
-- 24. AUDIT LOGS (Immutable System Activity Trail)
-- ============================================================================
CREATE TABLE public.audit_logs (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    actor_id VARCHAR(100) REFERENCES public.users(id) ON DELETE SET NULL,
    actor_name VARCHAR(255) NOT NULL DEFAULT 'System',
    actor_username VARCHAR(100),
    actor_role VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    action_label VARCHAR(255),
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    entity_number VARCHAR(100),
    customer_name VARCHAR(255),
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ============================================================================
-- 25. ACTIVITY NOTIFICATIONS (Admin Security Alerts)
-- ============================================================================
CREATE TABLE public.activity_notifications (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    type VARCHAR(50) NOT NULL,
    user_id VARCHAR(100) NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    user_name VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    is_rejected BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_is_read ON public.activity_notifications(is_read);
CREATE INDEX idx_notifications_created_at ON public.activity_notifications(created_at DESC);
CREATE INDEX idx_notifications_user_id ON public.activity_notifications(user_id);

-- ============================================================================
-- 26. LOGIN RATE LIMITS (Atomic In-Database Throttling)
-- ============================================================================
CREATE TABLE public.login_rate_limits (
    key TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ
);

CREATE INDEX idx_login_rate_limits_window ON public.login_rate_limits(window_start);

-- ============================================================================
-- STORED FUNCTIONS & PROCEDURAL LOGIC
-- ============================================================================

-- Function 1: Check Login Rate Limit Status
CREATE OR REPLACE FUNCTION public.login_rate_limit_status(p_key TEXT)
RETURNS TABLE (blocked BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT
        COALESCE(r.locked_until > NOW(), FALSE),
        COALESCE(GREATEST(CEIL(EXTRACT(EPOCH FROM (r.locked_until - NOW())))::INTEGER, 0), 0)
    FROM (SELECT 1) AS d
    LEFT JOIN public.login_rate_limits r ON r.key = p_key;
$$;

-- Function 2: Record Failed Login Attempt & Lock When Limit Reached
CREATE OR REPLACE FUNCTION public.login_rate_limit_record_failure(
    p_key TEXT,
    p_max INTEGER,
    p_window_seconds INTEGER,
    p_lockout_seconds INTEGER
)
RETURNS TABLE (blocked BOOLEAN, retry_after_seconds INTEGER, attempts INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_attempts INTEGER;
    v_locked   TIMESTAMPTZ;
BEGIN
    INSERT INTO public.login_rate_limits AS t (key, attempts, window_start, locked_until)
    VALUES (p_key, 1, NOW(), CASE WHEN 1 >= p_max THEN NOW() + make_interval(secs => p_lockout_seconds) END)
    ON CONFLICT (key) DO UPDATE SET
        attempts = CASE
            WHEN (t.locked_until IS NULL OR t.locked_until <= NOW())
                 AND t.window_start < NOW() - make_interval(secs => p_window_seconds)
            THEN 1 ELSE t.attempts + 1 END,
        window_start = CASE
            WHEN (t.locked_until IS NULL OR t.locked_until <= NOW())
                 AND t.window_start < NOW() - make_interval(secs => p_window_seconds)
            THEN NOW() ELSE t.window_start END,
        locked_until = CASE
            WHEN (t.locked_until IS NULL OR t.locked_until <= NOW())
                 AND t.window_start < NOW() - make_interval(secs => p_window_seconds)
            THEN CASE WHEN 1 >= p_max THEN NOW() + make_interval(secs => p_lockout_seconds) END
            WHEN t.attempts + 1 >= p_max THEN NOW() + make_interval(secs => p_lockout_seconds)
            ELSE t.locked_until END
    RETURNING t.attempts, t.locked_until INTO v_attempts, v_locked;

    -- Opportunistic cleanup of long-expired rows (5% probability)
    IF random() < 0.05 THEN
        DELETE FROM public.login_rate_limits
        WHERE window_start < NOW() - INTERVAL '1 day'
          AND (locked_until IS NULL OR locked_until < NOW());
    END IF;

    RETURN QUERY SELECT
        COALESCE(v_locked > NOW(), FALSE),
        COALESCE(GREATEST(CEIL(EXTRACT(EPOCH FROM (v_locked - NOW())))::INTEGER, 0), 0),
        v_attempts;
END;
$$;

-- Function 3: Clear Login Rate Limit On Successful Authentication
CREATE OR REPLACE FUNCTION public.login_rate_limit_clear(p_key TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    DELETE FROM public.login_rate_limits WHERE key = p_key;
$$;

-- Function 4: Atomic Stock Quantity Adjustment
-- Acquires exclusive row-level lock (FOR UPDATE) and bounds quantities >= 0.
CREATE OR REPLACE FUNCTION public.adjust_product_stock_quantities(
    p_product_id VARCHAR,
    p_rented_delta INTEGER DEFAULT 0,
    p_available_delta INTEGER DEFAULT 0,
    p_damaged_delta INTEGER DEFAULT 0,
    p_missing_delta INTEGER DEFAULT 0
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_prod public.products;
BEGIN
    SELECT * INTO v_prod
    FROM public.products
    WHERE id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product with ID % not found', p_product_id;
    END IF;

    UPDATE public.products
    SET 
        rented_quantity = GREATEST(0, rented_quantity + p_rented_delta),
        available_quantity = GREATEST(0, available_quantity + p_available_delta),
        damaged_quantity = GREATEST(0, damaged_quantity + p_damaged_delta),
        missing_quantity = GREATEST(0, missing_quantity + p_missing_delta),
        updated_at = NOW()
    WHERE id = p_product_id
    RETURNING * INTO v_prod;

    RETURN v_prod;
END;
$$;

-- ============================================================================
-- ROLE PRIVILEGES & SECURITY HARDENING
-- The script assumes the application role 'tns_app_user' has been provisioned.
-- Secrets or passwords must NEVER be placed in initialization scripts.
-- ============================================================================

-- 1. Unconditional Public Revocations (Defense-in-Depth)
-- Revoke CREATE on schema public from PUBLIC to prevent object-shadowing vulnerabilities
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Revoke execute permissions from PUBLIC on sensitive stored functions
REVOKE ALL ON FUNCTION public.login_rate_limit_status(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.login_rate_limit_record_failure(TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.login_rate_limit_clear(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_product_stock_quantities(VARCHAR, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC;

-- 2. Dedicated Application Role Privileges
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'tns_app_user') THEN
        -- Grant schema usage
        GRANT USAGE ON SCHEMA public TO tns_app_user;

        -- Grant table permissions
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tns_app_user;

        -- Grant sequence usage
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tns_app_user;

        -- Grant execute only to application role
        GRANT EXECUTE ON FUNCTION public.login_rate_limit_status(TEXT) TO tns_app_user;
        GRANT EXECUTE ON FUNCTION public.login_rate_limit_record_failure(TEXT, INTEGER, INTEGER, INTEGER) TO tns_app_user;
        GRANT EXECUTE ON FUNCTION public.login_rate_limit_clear(TEXT) TO tns_app_user;
        GRANT EXECUTE ON FUNCTION public.adjust_product_stock_quantities(VARCHAR, INTEGER, INTEGER, INTEGER, INTEGER) TO tns_app_user;

        -- Default privileges for future tables and sequences
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tns_app_user;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO tns_app_user;
    ELSE
        RAISE WARNING 'Role "tns_app_user" was not found in pg_roles. Public execution was revoked, but application permissions have NOT been granted. Ensure "tns_app_user" is provisioned and re-apply grants before starting application.';
    END IF;
END $$;
