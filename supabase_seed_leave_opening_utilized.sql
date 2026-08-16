-- ==========================================
-- ONE-TIME SEED: opening_utilized for existing employee (2026)
-- ==========================================
-- Requires supabase_migration_leave_opening_utilized.sql to have run first.
-- Balance = entitlement - (opening_utilized + live utilized from roster).
--
-- Employee: 956614c0-98c8-46ed-8b4b-e546990eb97a (employee_no 900466)
-- Year:     2026
--
-- Opening figures (as of 2026-08-16):
--   Annual Leave  | entitlement 14.00 | opening_utilized 3.50
--   Casual Leave  | entitlement  7.00 | opening_utilized 7.00
--   Lieu Leave    | entitlement N/A   | opening_utilized 0.00
--   Medical Leave | entitlement  7.00 | opening_utilized 0.00

INSERT INTO public.leave_entitlements (employee_id, year, leave_type, entitlement, opening_utilized)
VALUES
  ('956614c0-98c8-46ed-8b4b-e546990eb97a', 2026, 'Annual Leave', 14.00, 2.50),
    ('956614c0-98c8-46ed-8b4b-e546990eb97a', 2026, 'Casual Leave', 7.00, 7.00),
      ('956614c0-98c8-46ed-8b4b-e546990eb97a', 2026, 'Lieu Leave', NULL, 0.00),
        ('956614c0-98c8-46ed-8b4b-e546990eb97a', 2026, 'Medical Leave', 7.00, 0.00),
          ('956614c0-98c8-46ed-8b4b-e546990eb97a', 2026, 'Short Leave', 24.00, 0.00)
          ON CONFLICT (employee_id, year, leave_type)
          DO UPDATE SET
            entitlement = EXCLUDED.entitlement,
              opening_utilized = EXCLUDED.opening_utilized,
                updated_at = now();
                