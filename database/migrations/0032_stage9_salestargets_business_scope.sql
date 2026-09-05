-- ============================================================
-- IMC-STAGE-9-0032 | Sales Targets: allow a real business-wide target
--
-- Bug report (2026-09-05): "let's go to sales target, the dashboard does
-- not show anything, same issue with payroll." Investigation found the
-- target the owner created for a staff member (Mariam, 1,000,000 UGX)
-- DID save for real, but the Dashboard/Leaderboard/Reports only ever
-- read an old, disconnected local-storage copy of targets - fixed in the
-- frontend (see claude/sales-targets-dashboard-fix-2026-09-05.md).
--
-- Separately, chk_s2_target_scope required branch_id OR user_id to be
-- set, so a genuinely business-wide target (both null) could never be
-- saved for real at all - it silently fell back to a local, per-device
-- store. The owner asked (AskUserQuestion, 2026-09-05) for business-wide
-- targets to be real too. This replaces that constraint with one that
-- still prevents a target being both branch- and staff-scoped at once,
-- while allowing both to be null (business-wide).
-- ============================================================

ALTER TABLE imagecare.sales_targets DROP CONSTRAINT IF EXISTS chk_s2_target_scope;

ALTER TABLE imagecare.sales_targets
  ADD CONSTRAINT chk_s2_target_scope_mutex
  CHECK (branch_id IS NULL OR user_id IS NULL);

DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
    'IMC-STAGE-9-0032',
    'Sales targets: replaced chk_s2_target_scope (required branch_id OR user_id) with chk_s2_target_scope_mutex (branch_id IS NULL OR user_id IS NULL), allowing a real business-wide target (both null) while still preventing a row being both branch- and staff-scoped at once.',
    'system', FALSE, NULL, NULL
  );
END $$;
