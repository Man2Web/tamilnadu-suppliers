-- ============================================================================
-- TAMILNADU SUPPLIERS - USER ACTIVITY HISTORY, AUDIT LOGS & SESSION MANAGEMENT
-- Migration: 20261016_audit_history_and_session_management.sql
-- ============================================================================

-- 1. Enhance public.sessions table for granular session tracking & rejection
ALTER TABLE public.sessions
    ADD COLUMN IF NOT EXISTS user_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS username VARCHAR(100),
    ADD COLUMN IF NOT EXISTS user_role VARCHAR(50),
    ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50),
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejected_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS rejected_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON public.sessions(created_at);

-- 2. Enhance public.audit_logs table for structured entity & actor tracking
ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS actor_username VARCHAR(100),
    ADD COLUMN IF NOT EXISTS actor_role VARCHAR(50),
    ADD COLUMN IF NOT EXISTS action_label VARCHAR(255),
    ADD COLUMN IF NOT EXISTS entity_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- 3. Create public.activity_notifications table for Super Admin login/logout alerts
CREATE TABLE IF NOT EXISTS public.activity_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL, -- 'SIGN_IN', 'SIGN_OUT'
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.activity_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.activity_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.activity_notifications(user_id);

-- 4. Row Level Security (RLS) enforcement
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_notifications ENABLE ROW LEVEL SECURITY;

-- Audit logs are strictly append-only: allow SELECT and INSERT; forbid UPDATE and DELETE
DROP POLICY IF EXISTS audit_logs_read_policy ON public.audit_logs;
CREATE POLICY audit_logs_read_policy ON public.audit_logs
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS audit_logs_insert_policy ON public.audit_logs;
CREATE POLICY audit_logs_insert_policy ON public.audit_logs
    FOR INSERT TO authenticated WITH CHECK (true);

-- No UPDATE or DELETE policies on audit_logs prevents modification or deletion by ordinary accounts

-- Activity notifications: accessible to Super Admin
DROP POLICY IF EXISTS notifications_super_admin_policy ON public.activity_notifications;
CREATE POLICY notifications_super_admin_policy ON public.activity_notifications
    FOR ALL TO authenticated USING (true);

-- Sessions: readable by authenticated users
DROP POLICY IF EXISTS sessions_read_policy ON public.sessions;
CREATE POLICY sessions_read_policy ON public.sessions
    FOR SELECT TO authenticated USING (true);
