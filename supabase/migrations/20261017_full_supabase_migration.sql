-- ============================================================================
-- TAMILNADU SUPPLIERS - FULL SUPABASE POSTGRESQL MIGRATION
-- Migration: 20261017_full_supabase_migration.sql
-- Dedicated Project: lznyejowgqwbavtnqqns
-- ============================================================================

-- Enable required cryptographic & UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. USERS & ROLES SCHEMA UPDATES
-- ============================================================================

-- 1.1 Update users check constraint to support all application roles
ALTER TABLE public.users
    DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
    ADD CONSTRAINT users_role_check 
    CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'BILLING', 'EMPLOYEE'));

-- 1.2 Add username and first-login password enforcement columns
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS username VARCHAR(100),
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON public.users(username) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);

-- ============================================================================
-- 2. PRIMARY KEY TYPE RELAXATION FOR PRESERVING EXISTING IDs
-- (Converts UUID to VARCHAR(100) USING ...::text to support both string IDs & UUIDs)
-- ============================================================================

-- Drop foreign keys temporarily if needed for column alteration
ALTER TABLE IF EXISTS public.quotation_items DROP CONSTRAINT IF EXISTS quotation_items_product_id_fkey;
ALTER TABLE IF EXISTS public.bill_items DROP CONSTRAINT IF EXISTS bill_items_product_id_fkey;
ALTER TABLE IF EXISTS public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_product_id_fkey;
ALTER TABLE IF EXISTS public.quotations DROP CONSTRAINT IF EXISTS quotations_customer_id_fkey;
ALTER TABLE IF EXISTS public.bills DROP CONSTRAINT IF EXISTS bills_customer_id_fkey;
ALTER TABLE IF EXISTS public.gate_passes DROP CONSTRAINT IF EXISTS gate_passes_customer_id_fkey;
ALTER TABLE IF EXISTS public.returns DROP CONSTRAINT IF EXISTS returns_customer_id_fkey;
ALTER TABLE IF EXISTS public.payments DROP CONSTRAINT IF EXISTS payments_customer_id_fkey;
ALTER TABLE IF EXISTS public.payments DROP CONSTRAINT IF EXISTS payments_bill_id_fkey;
ALTER TABLE IF EXISTS public.sessions DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;
ALTER TABLE IF EXISTS public.activity_notifications DROP CONSTRAINT IF EXISTS activity_notifications_user_id_fkey;
ALTER TABLE IF EXISTS public.products DROP CONSTRAINT IF EXISTS products_category_id_fkey;

-- Relax ID columns to VARCHAR(100) using safe type casting
ALTER TABLE public.categories 
    ALTER COLUMN id TYPE VARCHAR(100) USING id::text,
    ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text;

ALTER TABLE public.companies 
    ALTER COLUMN id TYPE VARCHAR(100) USING id::text,
    ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text;

ALTER TABLE public.users 
    ALTER COLUMN id TYPE VARCHAR(100) USING id::text,
    ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text;

ALTER TABLE public.products 
    ALTER COLUMN id TYPE VARCHAR(100) USING id::text,
    ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text,
    ALTER COLUMN category_id TYPE VARCHAR(100) USING category_id::text;

ALTER TABLE public.customers 
    ALTER COLUMN id TYPE VARCHAR(100) USING id::text,
    ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text;

ALTER TABLE public.quotations 
    ALTER COLUMN id TYPE VARCHAR(100) USING id::text,
    ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text,
    ALTER COLUMN company_id TYPE VARCHAR(100) USING company_id::text,
    ALTER COLUMN customer_id TYPE VARCHAR(100) USING customer_id::text;

ALTER TABLE public.quotation_items 
    ALTER COLUMN id TYPE VARCHAR(100) USING id::text,
    ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text,
    ALTER COLUMN quotation_id TYPE VARCHAR(100) USING quotation_id::text,
    ALTER COLUMN quotation_branch_id TYPE VARCHAR(100) USING quotation_branch_id::text,
    ALTER COLUMN product_id TYPE VARCHAR(100) USING product_id::text;

ALTER TABLE public.bills 
    ALTER COLUMN id TYPE VARCHAR(100) USING id::text,
    ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text,
    ALTER COLUMN company_id TYPE VARCHAR(100) USING company_id::text,
    ALTER COLUMN customer_id TYPE VARCHAR(100) USING customer_id::text;

ALTER TABLE public.bill_items 
    ALTER COLUMN id TYPE VARCHAR(100) USING id::text,
    ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text,
    ALTER COLUMN bill_id TYPE VARCHAR(100) USING bill_id::text,
    ALTER COLUMN bill_branch_id TYPE VARCHAR(100) USING bill_branch_id::text,
    ALTER COLUMN product_id TYPE VARCHAR(100) USING product_id::text;

ALTER TABLE public.payments 
    ALTER COLUMN id TYPE VARCHAR(100) USING id::text,
    ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text,
    ALTER COLUMN bill_id TYPE VARCHAR(100) USING bill_id::text,
    ALTER COLUMN company_id TYPE VARCHAR(100) USING company_id::text,
    ALTER COLUMN customer_id TYPE VARCHAR(100) USING customer_id::text;

ALTER TABLE public.gate_passes 
    ALTER COLUMN id TYPE VARCHAR(100) USING id::text,
    ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text,
    ALTER COLUMN company_id TYPE VARCHAR(100) USING company_id::text,
    ALTER COLUMN customer_id TYPE VARCHAR(100) USING customer_id::text,
    ALTER COLUMN bill_id TYPE VARCHAR(100) USING bill_id::text;

ALTER TABLE public.returns 
    ALTER COLUMN id TYPE VARCHAR(100) USING id::text,
    ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text,
    ALTER COLUMN gate_pass_id TYPE VARCHAR(100) USING gate_pass_id::text,
    ALTER COLUMN company_id TYPE VARCHAR(100) USING company_id::text,
    ALTER COLUMN customer_id TYPE VARCHAR(100) USING customer_id::text;

ALTER TABLE public.sessions 
    ALTER COLUMN id TYPE VARCHAR(100) USING id::text,
    ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text,
    ALTER COLUMN user_id TYPE VARCHAR(100) USING user_id::text;

ALTER TABLE public.activity_notifications 
    ALTER COLUMN id TYPE VARCHAR(100) USING id::text,
    ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text,
    ALTER COLUMN user_id TYPE VARCHAR(100) USING user_id::text;

-- Re-establish foreign keys with flexible VARCHAR(100) targets
ALTER TABLE public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;

ALTER TABLE public.quotations
    ADD CONSTRAINT quotations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.bills
    ADD CONSTRAINT bills_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.bill_items
    ADD CONSTRAINT bill_items_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id) ON DELETE CASCADE;

ALTER TABLE public.quotation_items
    ADD CONSTRAINT quotation_items_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;

ALTER TABLE public.payments
    ADD CONSTRAINT payments_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id) ON DELETE SET NULL;

-- ============================================================================
-- 3. ENHANCE BILLS & QUOTATIONS WITH FULL FINANCIAL & LIFECYCLE FIELDS
-- ============================================================================

ALTER TABLE public.bills
    ADD COLUMN IF NOT EXISTS original_grand_total NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS additional_rental_charges NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS approved_damage_charges NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS approved_missing_charges NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS late_fee_charges NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS deposit_adjustment NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS deposit_refund_due NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS customer_credit NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'UNPAID',
    ADD COLUMN IF NOT EXISTS is_overdue BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS total_returned_good INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_damaged INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_missing INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS actual_return_date DATE,
    ADD COLUMN IF NOT EXISTS expected_return_date DATE,
    ADD COLUMN IF NOT EXISTS incidents JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS amendments JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS notes_list JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS branches JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.quotations
    ADD COLUMN IF NOT EXISTS notes_list JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS branches JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS branches JSONB DEFAULT '[]'::jsonb;

-- Indexes for lightning-fast queries
CREATE INDEX IF NOT EXISTS idx_bills_payment_status ON public.bills(payment_status);
CREATE INDEX IF NOT EXISTS idx_bills_is_overdue ON public.bills(is_overdue);
CREATE INDEX IF NOT EXISTS idx_bills_bill_date ON public.bills(bill_date DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_quotation_date ON public.quotations(quotation_date DESC);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON public.payments(payment_date DESC);

-- ============================================================================
-- 4. CONCURRENCY-SAFE STOCK ADJUSTMENT POSTGRESQL FUNCTION
-- (Guarantees atomic row-locking to prevent double decrement or race conditions)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.adjust_product_stock_quantities(
    p_product_id VARCHAR(100),
    p_rented_delta INTEGER DEFAULT 0,
    p_available_delta INTEGER DEFAULT 0,
    p_damaged_delta INTEGER DEFAULT 0,
    p_missing_delta INTEGER DEFAULT 0
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prod public.products;
BEGIN
    -- Acquire exclusive row-level lock on the product
    SELECT * INTO v_prod
    FROM public.products
    WHERE id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product with ID % not found', p_product_id;
    END IF;

    -- Atomically update quantities with non-negative lower bounds
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
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on core tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Server-side / Service Role and Authenticated Policies
-- Allows full CRUD access via service role and authenticated app requests
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'companies', 'products', 'categories', 'customers', 
        'quotations', 'quotation_items', 'bills', 'bill_items', 
        'payments', 'gate_passes', 'returns', 'users'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_service_all', tbl);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated, anon USING (true) WITH CHECK (true)', tbl || '_service_all', tbl);
    END LOOP;
END $$;
