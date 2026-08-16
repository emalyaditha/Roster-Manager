-- Supabase Database Schema Setup for Roster Application
-- Copy and paste this script into your Supabase SQL Editor (https://supabase.com) and click "Run".

-- 1. Create Roster Statuses Table
CREATE TABLE IF NOT EXISTS public.roster_statuses (
    code TEXT PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    description TEXT,
    color TEXT,
    "badgeBg" TEXT,
    "badgeText" TEXT,
    "badgeBorder" TEXT,
    active BOOLEAN DEFAULT true,
    "isWorkDay" BOOLEAN DEFAULT true,
    "calendarEventConfig" JSONB
);

-- 2. Create Roster Entries Table
CREATE TABLE IF NOT EXISTS public.roster_entries (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    day TEXT NOT NULL,
    "originalStatusId" TEXT NOT NULL,
    "changedStatusId" TEXT,
    "currentStatusId" TEXT NOT NULL,
    action TEXT,
    notes TEXT,
    ot BOOLEAN DEFAULT false,
    "clockIn" TEXT,
    "clockOut" TEXT,
    "otMorningHours" NUMERIC DEFAULT 0,
    "otNightHours" NUMERIC DEFAULT 0,
    "googleCalendarSyncStatus" TEXT DEFAULT 'Not Synced',
    "googleCalendarEventId" TEXT,
    "calendarSyncError" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "lastChangedBy" TEXT
);

-- 3. Create Roster Change History Table
CREATE TABLE IF NOT EXISTS public.roster_history (
    id TEXT PRIMARY KEY,
    "rosterEntryId" TEXT NOT NULL,
    date TEXT NOT NULL,
    "previousStatusId" TEXT NOT NULL,
    "newStatusId" TEXT NOT NULL,
    "previousAction" TEXT,
    "newAction" TEXT,
    reason TEXT,
    "user" TEXT,
    timestamp TEXT NOT NULL,
    "googleCalendarEventId" TEXT,
    "googleCalendarSyncResult" TEXT
);

-- 4. Create Import History Table
CREATE TABLE IF NOT EXISTS public.import_history (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    "uploadTimestamp" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "rowCount" INTEGER DEFAULT 0,
    "createdCount" INTEGER DEFAULT 0,
    "updatedCount" INTEGER DEFAULT 0,
    "skippedCount" INTEGER DEFAULT 0,
    "dateRange" TEXT,
    "fileHash" TEXT,
    "employeeName" TEXT,
    "sheetName" TEXT,
    status TEXT NOT NULL
);

-- 5. Create App Settings Table
CREATE TABLE IF NOT EXISTS public.app_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    settings JSONB NOT NULL
);

-- 6. Create Employees Table
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_no TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    default_shift_code TEXT DEFAULT 'NWD',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Create Roster Days Table
CREATE TABLE IF NOT EXISTS public.roster_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    roster_date DATE NOT NULL,
    code TEXT NOT NULL,
    code_start_time TIME NULL,
    dof_reference_date DATE NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (employee_id, roster_date)
);

-- 8. Create Clock Events Table
CREATE TABLE IF NOT EXISTS public.clock_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    event_date DATE NOT NULL,
    clock_in TIMESTAMPTZ NULL,
    clock_out TIMESTAMPTZ NULL,
    raw_source JSONB,
    synced_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (employee_id, event_date)
);

-- 9. Create OT Calculations Table
CREATE TABLE IF NOT EXISTS public.ot_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    calc_date DATE NOT NULL,
    roster_code TEXT NOT NULL,
    scheduled_start TIME NULL,
    scheduled_end TIME NULL,
    actual_clock_in TIMESTAMPTZ NULL,
    actual_clock_out TIMESTAMPTZ NULL,
    raw_ot_minutes INT DEFAULT 0,
    billable_ot_minutes INT DEFAULT 0,
    ot_type TEXT DEFAULT 'none',
    calculated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (employee_id, calc_date)
);

-- 9b. Create Leave Entitlements Table
-- Stores the fixed yearly entitlement per employee per leave type.
-- Leave types: 'Annual Leave', 'Casual Leave', 'Lieu Leave' (N/A), 'Medical Leave', 'Short Leave' (24.00)
CREATE TABLE IF NOT EXISTS public.leave_entitlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
    year int NOT NULL,
    leave_type text NOT NULL,
    entitlement numeric(5,2) NULL,
    opening_utilized numeric(5,2) NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (employee_id, year, leave_type)
);

-- 10. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.roster_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clock_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_entitlements ENABLE ROW LEVEL SECURITY;

-- 11. Add Public Read/Write Access Policies
DROP POLICY IF EXISTS "Allow public select" ON public.roster_statuses;
DROP POLICY IF EXISTS "Allow public insert" ON public.roster_statuses;
DROP POLICY IF EXISTS "Allow public update" ON public.roster_statuses;
DROP POLICY IF EXISTS "Allow public delete" ON public.roster_statuses;
CREATE POLICY "Allow public select" ON public.roster_statuses FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.roster_statuses FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.roster_statuses FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.roster_statuses FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public select" ON public.roster_entries;
DROP POLICY IF EXISTS "Allow public insert" ON public.roster_entries;
DROP POLICY IF EXISTS "Allow public update" ON public.roster_entries;
DROP POLICY IF EXISTS "Allow public delete" ON public.roster_entries;
CREATE POLICY "Allow public select" ON public.roster_entries FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.roster_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.roster_entries FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.roster_entries FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public select" ON public.roster_history;
DROP POLICY IF EXISTS "Allow public insert" ON public.roster_history;
DROP POLICY IF EXISTS "Allow public update" ON public.roster_history;
DROP POLICY IF EXISTS "Allow public delete" ON public.roster_history;
CREATE POLICY "Allow public select" ON public.roster_history FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.roster_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.roster_history FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.roster_history FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public select" ON public.import_history;
DROP POLICY IF EXISTS "Allow public insert" ON public.import_history;
DROP POLICY IF EXISTS "Allow public update" ON public.import_history;
DROP POLICY IF EXISTS "Allow public delete" ON public.import_history;
CREATE POLICY "Allow public select" ON public.import_history FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.import_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.import_history FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.import_history FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public select" ON public.app_settings;
DROP POLICY IF EXISTS "Allow public insert" ON public.app_settings;
DROP POLICY IF EXISTS "Allow public update" ON public.app_settings;
DROP POLICY IF EXISTS "Allow public delete" ON public.app_settings;
CREATE POLICY "Allow public select" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.app_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.app_settings FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.app_settings FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public select" ON public.employees;
DROP POLICY IF EXISTS "Allow public insert" ON public.employees;
DROP POLICY IF EXISTS "Allow public update" ON public.employees;
DROP POLICY IF EXISTS "Allow public delete" ON public.employees;
CREATE POLICY "Allow public select" ON public.employees FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.employees FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.employees FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.employees FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public select" ON public.roster_days;
DROP POLICY IF EXISTS "Allow public insert" ON public.roster_days;
DROP POLICY IF EXISTS "Allow public update" ON public.roster_days;
DROP POLICY IF EXISTS "Allow public delete" ON public.roster_days;
CREATE POLICY "Allow public select" ON public.roster_days FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.roster_days FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.roster_days FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.roster_days FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public select" ON public.clock_events;
DROP POLICY IF EXISTS "Allow public insert" ON public.clock_events;
DROP POLICY IF EXISTS "Allow public update" ON public.clock_events;
DROP POLICY IF EXISTS "Allow public delete" ON public.clock_events;
CREATE POLICY "Allow public select" ON public.clock_events FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.clock_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.clock_events FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.clock_events FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public select" ON public.ot_calculations;
DROP POLICY IF EXISTS "Allow public insert" ON public.ot_calculations;
DROP POLICY IF EXISTS "Allow public update" ON public.ot_calculations;
DROP POLICY IF EXISTS "Allow public delete" ON public.ot_calculations;
CREATE POLICY "Allow public select" ON public.ot_calculations FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.ot_calculations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.ot_calculations FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.ot_calculations FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public select" ON public.leave_entitlements;
DROP POLICY IF EXISTS "Allow public insert" ON public.leave_entitlements;
DROP POLICY IF EXISTS "Allow public update" ON public.leave_entitlements;
DROP POLICY IF EXISTS "Allow public delete" ON public.leave_entitlements;
CREATE POLICY "Allow public select" ON public.leave_entitlements FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.leave_entitlements FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.leave_entitlements FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.leave_entitlements FOR DELETE USING (true);

-- ==========================================
-- LEAVE ENTITLEMENT SEED DATA
-- ==========================================
-- Short Leave always opens as 24.00 on Jan 1 (2 x 12 months) for a full year.
-- Run this once per employee per year. Repeat for each employee_uuid.
--
-- opening_utilized = leave already consumed BEFORE data was tracked in the app.
-- Balance is computed as: entitlement - (opening_utilized + live utilized from roster).
--
-- INSERT INTO public.leave_entitlements (employee_id, year, leave_type, entitlement, opening_utilized)
-- VALUES ('<employee_uuid>', 2026, 'Short Leave', 24.00, 0.00)
-- ON CONFLICT (employee_id, year, leave_type)
-- DO UPDATE SET entitlement = EXCLUDED.entitlement, opening_utilized = EXCLUDED.opening_utilized, updated_at = now();
--
-- Other leave types (Annual Leave, Casual Leave, Medical Leave) are set by HR
-- the same way, e.g.:
-- INSERT INTO public.leave_entitlements (employee_id, year, leave_type, entitlement, opening_utilized)
-- VALUES
--   ('<employee_uuid>', 2026, 'Annual Leave', 14.00, 3.50),
--   ('<employee_uuid>', 2026, 'Casual Leave', 7.00, 7.00),
--   ('<employee_uuid>', 2026, 'Medical Leave', 7.00, 0.00)
-- ON CONFLICT (employee_id, year, leave_type)
-- DO UPDATE SET entitlement = EXCLUDED.entitlement, opening_utilized = EXCLUDED.opening_utilized, updated_at = now();
--
-- Alternative stricter RLS policies (enable if Supabase Auth is wired up):
--   CREATE POLICY "employee_read_own_entitlements"
--     ON public.leave_entitlements FOR SELECT
--     USING (employee_id = auth.uid());
--   CREATE POLICY "admin_manage_entitlements"
--     ON public.leave_entitlements FOR ALL
--     USING (auth.jwt() ->> 'role' = 'admin');
-- (Drop the "Allow public *" policies above before enabling these.)

-- ==========================================
-- PATCH / UPGRADE MIGRATION (FOR EXISTING TABLES)
-- ==========================================
-- If you already created your tables previously and want to make sure all 
-- clock times and OT columns are enabled, run these SQL statements in your Supabase SQL Editor:
--
-- ALTER TABLE public.roster_entries ADD COLUMN IF NOT EXISTS "clockIn" TEXT;
-- ALTER TABLE public.roster_entries ADD COLUMN IF NOT EXISTS "clockOut" TEXT;
-- ALTER TABLE public.roster_entries ADD COLUMN IF NOT EXISTS "otMorningHours" NUMERIC DEFAULT 0;
-- ALTER TABLE public.roster_entries ADD COLUMN IF NOT EXISTS "otNightHours" NUMERIC DEFAULT 0;

