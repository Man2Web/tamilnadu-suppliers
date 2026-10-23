-- ============================================================================
-- Migration: 20261015_ordered_lines_and_bill_cleanup.sql
-- Description: Supports ordered sequence of products & document notes across
--              quotations and bills, stores physical return tracking, and
--              preserves original documents upon quotation-to-bill conversion.
-- ============================================================================

-- 1. Quotation Document Lines & Entry Types
ALTER TABLE public.quotations
    ADD COLUMN IF NOT EXISTS document_lines JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.quotation_items
    ADD COLUMN IF NOT EXISTS entry_type VARCHAR(20) DEFAULT 'product',
    ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS text TEXT,
    ALTER COLUMN product_id DROP NOT NULL;

-- Relax non-zero constraints for note entries in quotation_items
ALTER TABLE public.quotation_items
    DROP CONSTRAINT IF EXISTS quotation_items_quantity_check,
    DROP CONSTRAINT IF EXISTS quotation_items_days_check;

ALTER TABLE public.quotation_items
    ADD CONSTRAINT quotation_items_quantity_check CHECK (entry_type = 'note' OR quantity >= 0),
    ADD CONSTRAINT quotation_items_days_check CHECK (entry_type = 'note' OR days >= 0);

-- 2. Bill Document Lines & Physical Return Tracking
ALTER TABLE public.bills
    ADD COLUMN IF NOT EXISTS document_lines JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.bill_items
    ADD COLUMN IF NOT EXISTS entry_type VARCHAR(20) DEFAULT 'product',
    ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS text TEXT,
    ADD COLUMN IF NOT EXISTS quantity_physically_returned INTEGER DEFAULT 0,
    ALTER COLUMN product_id DROP NOT NULL;

-- Relax non-zero constraints for note entries in bill_items
ALTER TABLE public.bill_items
    DROP CONSTRAINT IF EXISTS bill_items_quantity_check,
    DROP CONSTRAINT IF EXISTS bill_items_days_check;

ALTER TABLE public.bill_items
    ADD CONSTRAINT bill_items_quantity_check CHECK (entry_type = 'note' OR quantity >= 0),
    ADD CONSTRAINT bill_items_days_check CHECK (entry_type = 'note' OR days >= 0);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quotation_items_position ON public.quotation_items(quotation_id, position);
CREATE INDEX IF NOT EXISTS idx_bill_items_position ON public.bill_items(bill_id, position);
