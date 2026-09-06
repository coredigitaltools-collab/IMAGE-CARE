-- ============================================================
-- IMC-STAGE-9-0033 | Staff PIN-switch: real permission enforcement backfill
--
-- Bug report (2026-09-05): "check the sales tab, when the staff is using
-- it, it has a problem... the sales go to hold, then they see more than
-- what is in their permission." Investigation found the true root cause:
-- the PIN staff-switcher (0030_stage9_pin_staff.sql) was explicitly
-- designed as identification-only - auth.uid()/RLS never changes, so a
-- staff member "switched in" on a shared device ran under the OWNER's
-- full permissions the whole time, regardless of whatever the owner
-- configured for that staff member. On top of that, neither of this
-- business's staff accounts had ANY permissions configured anywhere
-- (imagecare.user_permissions and permission_group_members were both
-- empty for them) - the Settings > People & Access "Permission matrix"
-- that looks like it controls this has never written to these real
-- tables at all (see claude/pos-staff-permission-enforcement-2026-09-05.md).
--
-- The owner approved (AskUserQuestion, 2026-09-05) making the till
-- actually enforce each staff member's own real permissions, with
-- Settings reconnected so those permissions are actually manageable.
-- Fixed at the application layer: src/context/AppContext.tsx now
-- resolves the ACTIVE STAFF's own permissions/branches (via
-- src/services/settings/rolePermissionsService.ts, reading the real
-- permission_group_members/group_permissions/user_permissions tables
-- directly - RLS already lets the owner read any of these for their own
-- business, see rls_s1_up_select etc. in 0001_stage1_foundation.sql) and
-- feeds them into useUserContext() while a staff member is identified,
-- so every existing canDo() check across the app (including the ones
-- already in services/sales/salesService.ts) finally checks the right
-- person's access instead of always the owner's.
--
-- This migration is the one piece that has to happen in the database:
-- a one-time, safe backfill so flipping on real enforcement doesn't
-- suddenly lock out a staff member who has been happily using Sales
-- under the owner's access with no permissions of their own configured
-- yet. It is written generically (not scoped to one business) since the
-- underlying gap - a staff account with literally zero permission rows
-- - could exist for any business on this schema, not only this one.
--
-- What it does: for every ACTIVE, non-owner user who has neither a
-- direct user_permissions row nor a permission_group_members row (i.e.
-- has never had any permission configured at all), grant them full
-- access (view/create/edit/delete/approve/export/sync) to the 'sales'
-- module, scoped to their own assigned branch(es) - this preserves
-- exactly what they could already do at the till (everything, at their
-- own branch) the moment real enforcement goes live, while leaving
-- every other module at "no access" until the owner reviews and grants
-- more via the reconnected Settings > People & Access screen.
--
-- Idempotent: ON CONFLICT DO NOTHING against the existing
-- uq_user_permission_module unique constraint, safe to run more than
-- once and safe against a user who already has a 'sales' grant.
-- ============================================================

DO $$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT
      u.id AS user_id,
      u.business_id,
      (
        SELECT o.id FROM imagecare.users o
        WHERE o.business_id = u.business_id
          AND o.is_owner    = TRUE
          AND o.deleted_at  IS NULL
        LIMIT 1
      ) AS owner_id
    FROM imagecare.users u
    WHERE u.is_owner   = FALSE
      AND u.is_active  = TRUE
      AND u.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM imagecare.user_permissions up WHERE up.user_id = u.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM imagecare.permission_group_members pgm WHERE pgm.user_id = u.id
      )
  LOOP
    INSERT INTO imagecare.user_permissions (
      business_id, user_id, module,
      can_view, can_create, can_edit, can_delete, can_approve, can_export, can_sync,
      branch_scope, granted_by, notes
    ) VALUES (
      v_row.business_id, v_row.user_id, 'sales',
      TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
      'assigned', v_row.owner_id,
      'Starting baseline granted 2026-09-05 when real per-staff permission enforcement was turned on at the till (see claude/pos-staff-permission-enforcement-2026-09-05.md). This staff member previously had no permissions configured at all, but the PIN-switch till ran under the owner''s full access regardless, so they could already do everything in Sales at their own branch. This keeps that working while the owner reviews and adjusts real permissions in Settings > People & Access.'
    )
    ON CONFLICT (user_id, module) DO NOTHING;
  END LOOP;
END $$;

DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
    'IMC-STAGE-9-0033',
    'Staff PIN-switch real permission enforcement: backfilled a full-access "sales" module grant (branch_scope=assigned) for every active non-owner user who had zero permissions configured anywhere, so turning on real per-staff enforcement at the till does not lock out staff who were previously (unintentionally) operating under the owner''s full access. Application-layer fix (AppContext.tsx resolving the active PIN-switched staff member''s own real permissions) documented in claude/pos-staff-permission-enforcement-2026-09-05.md.',
    'system', FALSE, NULL, NULL
  );
END $$;
