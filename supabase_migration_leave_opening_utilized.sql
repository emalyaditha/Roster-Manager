-- ==========================================
-- MIGRATION: Add opening_utilized to leave_entitlements
-- ==========================================
-- opening_utilized stores leave already consumed BEFORE the app started
-- tracking data. Balance = entitlement - (opening_utilized + live utilized).
--
-- Run this in the Supabase SQL editor once. It is idempotent.

ALTER TABLE public.leave_entitlements
ADD COLUMN IF NOT EXISTS opening_utilized numeric(5,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.leave_entitlements.opening_utilized IS
  'Leave days consumed before app tracking began. Balance = entitlement - (opening_utilized + live utilized from roster).';
