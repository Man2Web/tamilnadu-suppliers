-- ============================================================================
-- TAMILNADU SUPPLIERS RENTAL INVENTORY & BILLING MANAGEMENT SYSTEM
-- Target Supabase Project: lznyejowgqwbavtnqqns
-- Initial Migration: 20261012_init_tamilnadu_suppliers.sql
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. COMPANIES (8 Issuing Companies: 4 GST + 4 Non-GST)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL DEFAULT 'EMPLOYEE' CHECK (role IN ('SUPER_ADMIN', 'EMPLOYEE')),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. CATEGORIES & SHARED PRODUCT MASTER
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(50),
    description TEXT,
    parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    alias VARCHAR(255),
    sku VARCHAR(100) UNIQUE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    category_name VARCHAR(255),
    description TEXT,
    size_spec VARCHAR(100),
    unit VARCHAR(50) NOT NULL DEFAULT 'Nos',
    default_rental_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    rental_rate_unit VARCHAR(50) NOT NULL DEFAULT 'PER_DAY' CHECK (rental_rate_unit IN ('PER_DAY', 'PER_EVENT', 'PER_SQFT')),
    min_rental_duration INTEGER NOT NULL DEFAULT 1,
    security_deposit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    replacement_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
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

CREATE TABLE IF NOT EXISTS public.product_imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    errors JSONB DEFAULT '[]'::jsonb,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. CUSTOMERS & MULTI-BRANCH LOCATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    mobile VARCHAR(50) NOT NULL,
    whatsapp VARCHAR(50),
    email VARCHAR(255),
    billing_address TEXT NOT NULL,
    gstin VARCHAR(15),
    state VARCHAR(100) NOT NULL DEFAULT 'Tamil Nadu',
    postal_code VARCHAR(20),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.customer_branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
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

-- ============================================================================
-- 5. QUOTATIONS & MULTI-BRANCH STRUCTURE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quotation_number VARCHAR(100) NOT NULL UNIQUE,
    company_id UUID NOT NULL REFERENCES public.companies(id),
    company_snapshot JSONB NOT NULL,
    customer_id UUID NOT NULL REFERENCES public.customers(id),
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
    converted_bill_id UUID,
    converted_bill_number VARCHAR(100),
    converted_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quotation_branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    customer_branch_id UUID REFERENCES public.customer_branches(id),
    branch_name VARCHAR(255) NOT NULL,
    delivery_address TEXT,
    section_order INTEGER NOT NULL DEFAULT 0,
    branch_subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quotation_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quotation_branch_id UUID NOT NULL REFERENCES public.quotation_branches(id) ON DELETE CASCADE,
    quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    item_name VARCHAR(255) NOT NULL,
    size_spec VARCHAR(100),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    days INTEGER NOT NULL DEFAULT 1 CHECK (days >= 1),
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    item_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. BILLS & MULTI-BRANCH INVOICING
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_number VARCHAR(100) NOT NULL UNIQUE,
    company_id UUID NOT NULL REFERENCES public.companies(id),
    company_snapshot JSONB NOT NULL,
    source_quotation_id UUID UNIQUE REFERENCES public.quotations(id),
    customer_id UUID NOT NULL REFERENCES public.customers(id),
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
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bill_branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    customer_branch_id UUID REFERENCES public.customer_branches(id),
    branch_name VARCHAR(255) NOT NULL,
    delivery_address TEXT,
    section_order INTEGER NOT NULL DEFAULT 0,
    branch_subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bill_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_branch_id UUID NOT NULL REFERENCES public.bill_branches(id) ON DELETE CASCADE,
    bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    item_name VARCHAR(255) NOT NULL,
    size_spec VARCHAR(100),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    days INTEGER NOT NULL DEFAULT 1 CHECK (days >= 1),
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    item_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 7. RESERVATIONS & STOCK AVAILABILITY
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_number VARCHAR(100) NOT NULL UNIQUE,
    quotation_id UUID REFERENCES public.quotations(id),
    bill_id UUID REFERENCES public.bills(id),
    company_id UUID NOT NULL REFERENCES public.companies(id),
    customer_id UUID NOT NULL REFERENCES public.customers(id),
    rental_start_date DATE NOT NULL,
    rental_end_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'READY_FOR_DISPATCH', 'DISPATCHED', 'PARTIALLY_RETURNED', 'RETURNED', 'COMPLETED', 'CANCELLED')),
    advance_required NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    deposit_required NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reservation_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    branch_name VARCHAR(255),
    quantity_reserved INTEGER NOT NULL DEFAULT 1 CHECK (quantity_reserved > 0),
    quantity_dispatched INTEGER NOT NULL DEFAULT 0 CHECK (quantity_dispatched >= 0),
    quantity_returned INTEGER NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
    quantity_damaged INTEGER NOT NULL DEFAULT 0 CHECK (quantity_damaged >= 0),
    quantity_missing INTEGER NOT NULL DEFAULT 0 CHECK (quantity_missing >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 8. GATE PASS & DISPATCH MANAGEMENT
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.gate_passes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gate_pass_number VARCHAR(100) NOT NULL UNIQUE,
    company_id UUID NOT NULL REFERENCES public.companies(id),
    company_snapshot JSONB NOT NULL,
    customer_id UUID NOT NULL REFERENCES public.customers(id),
    customer_name VARCHAR(255) NOT NULL,
    destination_branch VARCHAR(255) NOT NULL,
    destination_address TEXT NOT NULL,
    reservation_id UUID REFERENCES public.reservations(id),
    bill_id UUID REFERENCES public.bills(id),
    dispatch_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_return_date DATE NOT NULL,
    vehicle_number VARCHAR(100),
    driver_name VARCHAR(100),
    driver_phone VARCHAR(50),
    authorized_by VARCHAR(100) NOT NULL DEFAULT 'Store Manager',
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'DISPATCHED' CHECK (status IN ('DISPATCHED', 'PARTIALLY_RETURNED', 'RETURNED', 'CLOSED')),
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.gate_pass_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gate_pass_id UUID NOT NULL REFERENCES public.gate_passes(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    item_name VARCHAR(255) NOT NULL,
    size_spec VARCHAR(100),
    quantity_dispatched INTEGER NOT NULL DEFAULT 1 CHECK (quantity_dispatched > 0),
    quantity_returned INTEGER NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
    quantity_damaged INTEGER NOT NULL DEFAULT 0 CHECK (quantity_damaged >= 0),
    quantity_missing INTEGER NOT NULL DEFAULT 0 CHECK (quantity_missing >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 9. RETURNS, DAMAGE INSPECTION & LOSS MANAGEMENT
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_number VARCHAR(100) NOT NULL UNIQUE,
    gate_pass_id UUID NOT NULL REFERENCES public.gate_passes(id),
    company_id UUID NOT NULL REFERENCES public.companies(id),
    customer_id UUID NOT NULL REFERENCES public.customers(id),
    return_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    inspected_by VARCHAR(100) NOT NULL,
    damage_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    late_fee_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    deposit_adjustment NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.return_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_id UUID NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    gate_pass_item_id UUID NOT NULL REFERENCES public.gate_pass_items(id),
    item_name VARCHAR(255) NOT NULL,
    quantity_expected INTEGER NOT NULL,
    quantity_returned_good INTEGER NOT NULL DEFAULT 0,
    quantity_damaged INTEGER NOT NULL DEFAULT 0,
    quantity_missing INTEGER NOT NULL DEFAULT 0,
    damage_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 10. INVENTORY MOVEMENTS LEDGER
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES public.products(id),
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
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 11. PAYMENTS & SECURITY DEPOSITS LEDGER
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_number VARCHAR(100) NOT NULL UNIQUE,
    bill_id UUID REFERENCES public.bills(id),
    company_id UUID NOT NULL REFERENCES public.companies(id),
    customer_id UUID NOT NULL REFERENCES public.customers(id),
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
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 12. WHATSAPP LOGS & AUDIT LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('QUOTATION', 'BILL', 'GATE_PASS', 'RECEIPT')),
    document_id UUID NOT NULL,
    document_number VARCHAR(100) NOT NULL,
    recipient_phone VARCHAR(50) NOT NULL,
    recipient_name VARCHAR(255) NOT NULL,
    share_method VARCHAR(50) NOT NULL DEFAULT 'HANDOFF_WEB' CHECK (share_method IN ('HANDOFF_WEB', 'API_CLOUD')),
    status VARCHAR(50) NOT NULL DEFAULT 'PREPARED' CHECK (status IN ('PREPARED', 'WINDOW_OPENED', 'ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
    message_payload TEXT,
    error_message TEXT,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID,
    actor_name VARCHAR(255) NOT NULL DEFAULT 'System',
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 13. INDEXES FOR HIGH-PERFORMANCE SEARCH & CONCURRENCY
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);

CREATE INDEX IF NOT EXISTS idx_customer_branches_customer ON public.customer_branches(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON public.customers(mobile);

CREATE INDEX IF NOT EXISTS idx_quotations_company ON public.quotations(company_id);
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON public.quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON public.quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotation_branches_quotation ON public.quotation_branches(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_branch ON public.quotation_items(quotation_branch_id);

CREATE INDEX IF NOT EXISTS idx_bills_company ON public.bills(company_id);
CREATE INDEX IF NOT EXISTS idx_bills_customer ON public.bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_bills_status ON public.bills(status);
CREATE INDEX IF NOT EXISTS idx_bill_branches_bill ON public.bill_branches(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_branch ON public.bill_items(bill_branch_id);

CREATE INDEX IF NOT EXISTS idx_reservations_dates ON public.reservations(rental_start_date, rental_end_date);
CREATE INDEX IF NOT EXISTS idx_gate_passes_reservation ON public.gate_passes(reservation_id);
CREATE INDEX IF NOT EXISTS idx_returns_gate_pass ON public.returns(gate_pass_id);
CREATE INDEX IF NOT EXISTS idx_payments_bill ON public.payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_movements_product ON public.inventory_movements(product_id);

-- ============================================================================
-- 14. SEED: EIGHT ISSUING COMPANIES (4 GST + 4 Non-GST)
-- ============================================================================
INSERT INTO public.companies (
    id, name, display_name, gst_type, gstin, pan, email, phone, address, state, state_code, place_of_supply,
    bank_name, bank_account_no, bank_ifsc, bank_branch, invoice_prefix, quotation_prefix, gate_pass_prefix,
    next_invoice_no, next_quotation_no, next_gate_pass_no
) VALUES 
-- 1. GST Company 1
(
    'c0000001-0000-0000-0000-000000000001',
    'Tamilnadu Suppliers Private Limited',
    'Tamilnadu Suppliers (GST Main)',
    'GST_REGISTERED',
    '33AAAAA0000A1Z5',
    'AAAAA0000A',
    'info@tamilnadusuppliers.com',
    '9842345678',
    'No. 12, Katpadi Main Road, Gandhi Nagar, Vellore - 632006',
    'Tamil Nadu', '33', 'Vellore',
    'City Union Bank', '510909010078513', 'CIUB0000065', 'Vellore Branch',
    'TNS-GST1-', 'TNQ-GST1-', 'TNGP-1-', 1, 1, 1
),
-- 2. GST Company 2
(
    'c0000002-0000-0000-0000-000000000002',
    'Vellore Event Equipments & Rentals',
    'Vellore Event Equipments',
    'GST_REGISTERED',
    '33BBBBB0000B1Z6',
    'BBBBB0000B',
    'events@vellorerentals.in',
    '9443212345',
    'No. 45, Arcot Road, Kagithapattarai, Vellore - 632012',
    'Tamil Nadu', '33', 'Vellore',
    'State Bank of India', '30495867123', 'SBIN0000947', 'Vellore Main Branch',
    'VEE-GST2-', 'VEQ-GST2-', 'VEGP-2-', 1, 1, 1
),
-- 3. GST Company 3
(
    'c0000003-0000-0000-0000-000000000003',
    'Royal Stage & Exhibition Infrastructures',
    'Royal Stage Infra',
    'GST_REGISTERED',
    '33CCCCC0000C1Z7',
    'CCCCC0000C',
    'infra@royalstages.com',
    '9894123456',
    'Plot 8, SIPCOT Industrial Complex, Ranipet, Vellore - 632403',
    'Tamil Nadu', '33', 'Vellore',
    'HDFC Bank', '50200049876543', 'HDFC0000256', 'Katpadi Branch',
    'RSI-GST3-', 'RSQ-GST3-', 'RSGP-3-', 1, 1, 1
),
-- 4. GST Company 4
(
    'c0000004-0000-0000-0000-000000000004',
    'Crown Hospitality & Conference Suppliers',
    'Crown Hospitality',
    'GST_REGISTERED',
    '33DDDDD0000D1Z8',
    'DDDDD0000D',
    'support@crownhospitality.in',
    '9360012345',
    'No. 18, Officers Line, Krishna Nagar, Vellore - 632001',
    'Tamil Nadu', '33', 'Vellore',
    'ICICI Bank', '028905001234', 'ICIC0000289', 'Officers Line Branch',
    'CHS-GST4-', 'CHQ-GST4-', 'CHGP-4-', 1, 1, 1
),
-- 5. Non-GST Company 1
(
    'c0000005-0000-0000-0000-000000000005',
    'Tamilnadu Suppliers (Retail & Functions)',
    'Tamilnadu Suppliers (Retail)',
    'NON_GST',
    NULL,
    NULL,
    'retail@tamilnadusuppliers.com',
    '9842345679',
    'First Floor, No. 3, Muthu Nagar, LIC Colony, Kagithapattarai, Vellore - 632012',
    'Tamil Nadu', '33', 'Vellore',
    'City Union Bank', '510909010088990', 'CIUB0000065', 'Vellore Branch',
    'TNS-RET-', 'TNQ-RET-', 'TNGP-5-', 1, 1, 1
),
-- 6. Non-GST Company 2
(
    'c0000006-0000-0000-0000-000000000006',
    'Sri Rama Function Rentals',
    'Sri Rama Rentals',
    'NON_GST',
    NULL,
    NULL,
    'srirama@tamilnadusuppliers.com',
    '9345306128',
    '101/1, Arcot Road (Opp. Old Employment Office), Kagithapattarai, Vellore - 632012',
    'Tamil Nadu', '33', 'Vellore',
    'Indian Bank', '20394857612', 'IDIB000V018', 'Kagithapattarai Branch',
    'SRR-', 'SRQ-', 'SRGP-6-', 1, 1, 1
),
-- 7. Non-GST Company 3
(
    'c0000007-0000-0000-0000-000000000007',
    'Vellore Catering & Wedding Ware',
    'Vellore Catering Ware',
    'NON_GST',
    NULL,
    NULL,
    'catering@vellorerentals.in',
    '9442012345',
    'No. 72, Filter Bed Road, Kosapet, Vellore - 632001',
    'Tamil Nadu', '33', 'Vellore',
    'Canara Bank', '1284101029384', 'CNRB0001284', 'Kosapet Branch',
    'VCW-', 'VCQ-', 'VCGP-7-', 1, 1, 1
),
-- 8. Non-GST Company 4
(
    'c0000008-0000-0000-0000-000000000008',
    'Star Pandal & Light Decorators',
    'Star Decorators',
    'NON_GST',
    NULL,
    NULL,
    'decor@tamilnadusuppliers.com',
    '9791012345',
    'No. 5, Ida Scudder Road, Vellore - 632004',
    'Tamil Nadu', '33', 'Vellore',
    'Bank of Baroda', '38470200001928', 'BARB0VELLOR', 'Ida Scudder Road Branch',
    'SPD-', 'SPQ-', 'SPGP-8-', 1, 1, 1
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 15. SEED: INITIAL CATEGORIES
-- ============================================================================
INSERT INTO public.categories (id, name, code, description) VALUES
('ca000001-0000-0000-0000-000000000001', 'General', 'GEN', 'General rental items, dabaras, basins'),
('ca000002-0000-0000-0000-000000000002', 'Furniture & Seating', 'FURN', 'Chairs, tables, VIP sofa, conference seating'),
('ca000003-0000-0000-0000-000000000003', 'Stalls & Infrastructure', 'STALL', 'Exhibition stalls, LED stages, signboards, partitions'),
('ca000004-0000-0000-0000-000000000004', 'Electricals & Cooling', 'ELEC', 'Pedestal fans, mist fans, heavy coolers, lighting'),
('ca000005-0000-0000-0000-000000000005', 'Carpets & Linens', 'CARP', 'Red carpet, green grass carpet, table frills, chair covers'),
('ca000006-0000-0000-0000-000000000006', 'Catering Vessels', 'CATV', 'Cooking vessels, dabaras, serving counters, chafing dishes')
ON CONFLICT (name) DO NOTHING;
