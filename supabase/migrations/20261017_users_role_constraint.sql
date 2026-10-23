-- ============================================================================
-- TAMILNADU SUPPLIERS - USER ROLES CONSTRAINT MIGRATION
-- Migration: 20261017_users_role_constraint.sql
-- ============================================================================

-- Update users_role_check constraint to allow all application roles
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'BILLING', 'EMPLOYEE'));
