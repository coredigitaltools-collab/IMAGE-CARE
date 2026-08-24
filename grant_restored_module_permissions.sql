-- ============================================================
-- ImageCare ERP - Grant permissions for restored modules
-- Run this in the Supabase SQL editor once, after the Stage-5
-- restoration commit is deployed.
--
-- Why this is needed: imagecare.user_permissions has no CHECK
-- constraint on `module`, so the app's new module keys (added to
-- MODULES in src/config/env.ts) don't need a schema migration -
-- but usePermission.ts's canDo() never infers view access from
-- is_owner. Every module, including these restored ones, needs an
-- explicit user_permissions row before its sidebar item/route is
-- reachable by a given user, even the business owner.
--
-- This grants VIEW + CREATE + EDIT (not DELETE, not APPROVE) on the
-- 9 newly-restored module keys, to every user in the business who is
-- flagged is_owner = true. It intentionally does NOT touch any
-- existing user_permissions row for any other module.
--
-- Safe to re-run: ON CONFLICT (user_id, module) updates the grant
-- in place rather than erroring or duplicating.
-- ============================================================

INSERT INTO imagecare.user_permissions
  (business_id, user_id, module, can_view, can_create, can_edit, can_delete, can_approve, can_export, can_sync, branch_scope, notes)
SELECT
  u.business_id,
  u.id,
  m.module,
  TRUE,   -- can_view
  TRUE,   -- can_create
  TRUE,   -- can_edit
  FALSE,  -- can_delete
  FALSE,  -- can_approve
  FALSE,  -- can_export
  FALSE,  -- can_sync
  'all',
  'Auto-granted: module restored from pre-reset frontend (see Module-Inventory-Forensic-Report.md)'
FROM imagecare.users u
CROSS JOIN (VALUES
  ('loyalty'),
  ('salesTargets'),
  ('stockSummary'),
  ('dailySummary'),
  ('monthlySummary'),
  ('annualSummary'),
  ('branchOverview'),
  ('offlineMode'),
  ('accounting')
) AS m(module)
WHERE u.is_owner = TRUE
ON CONFLICT (user_id, module) DO UPDATE SET
  can_view   = TRUE,
  can_create = TRUE,
  can_edit   = TRUE,
  updated_at = NOW();

-- NOTE on Bank Reconciliation ('bank'): that module key already existed
-- before this restoration (it backs Cash Flow's bank-transfer reads too),
-- so it is NOT included above. If the Bank Reconciliation sidebar item is
-- not visible for a user, check their existing 'bank' grant instead:
--
-- SELECT * FROM imagecare.user_permissions WHERE module = 'bank';

-- Verify the grants landed:
-- SELECT u.email, up.module, up.can_view
-- FROM imagecare.user_permissions up
-- JOIN imagecare.users u ON u.id = up.user_id
-- WHERE up.module IN ('loyalty','salesTargets','stockSummary','dailySummary',
--                      'monthlySummary','annualSummary','branchOverview',
--                      'offlineMode','accounting')
-- ORDER BY u.email, up.module;
