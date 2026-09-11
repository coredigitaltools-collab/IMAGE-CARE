-- ============================================================
-- ImageCare ERP - Stage 8 Migration 0027
-- File: 0027_stage8_default_branch_on_registration.sql
-- Version: IMC-STAGE-8-0027
-- Purpose: CRITICAL bug found while investigating live "Save button
-- doesn't work" reports on Expenses (and, by the same root cause,
-- every other transactional module - Sales, Purchases, Payroll,
-- Stock Adjustments, Cash Movements, etc.):
--
--   1. imagecare.fn_register_business() creates the business, seeds
--      its chart of accounts (migration 0025), and creates the owner
--      user row - but never creates a branch, and never sets the new
--      owner's users.branch_id. Confirmed live: 3 of 4 real
--      businesses on this project (Maputo, Sarafina, Test Business A
--      Holdings) have zero rows in imagecare.branches.
--
--   2. imagecare.fn_get_user_context() returns 'branch_id', v_user.branch_id
--      directly - so with branch_id NULL, the frontend's AppContext
--      never has an active branch to operate in.
--
--   3. Every transactional engine call (recordExpense, createSale,
--      recordPayroll, stock adjustments, cash movements, ...) calls
--      validateContext(ctx, branchId), which does
--      .eq('id', branchId) against imagecare.branches. With branchId
--      NULL, supabase-js serializes this as `id=eq.null`, which
--      Postgres rejects with "invalid input syntax for type uuid:
--      \"null\"" (confirmed live in postgres_logs, repeated failures
--      around 2026-08-31 09:55-10:16 while the user was testing
--      Expenses). The Save button appears to silently do nothing
--      because the resulting error isn't surfaced by the modal.
--
-- Fix: (a) fn_register_business() now creates a default "Main
-- Branch" atomically at registration and sets it as the owner's home
-- branch, so every new business can transact immediately; (b)
-- backfill every existing business that currently has zero branches
-- with a Main Branch, and point any of its users whose branch_id is
-- still NULL at it.
--
-- Depends on: 0002_stage1_branch_authorization.sql (branches table),
-- 0025_stage8_seed_coa_on_registration.sql (fn_register_business
-- baseline this re-creates on top of).
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- FIX: create a default branch and assign it to the owner as part
-- of registration. Re-created identically to 0025's version, with
-- one addition: after the owner user is inserted, create a Main
-- Branch for the business and update that user's branch_id to it -
-- all in the same transaction as the rest of registration.
-- ============================================================
CREATE OR REPLACE FUNCTION imagecare.fn_register_business(
  p_business_name    TEXT,
  p_owner_first_name TEXT,
  p_owner_last_name  TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_existing   imagecare.users%ROWTYPE;
  v_business_id UUID;
  v_user_id     UUID;
  v_branch_id   UUID;
  v_email       TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: No authenticated session';
  END IF;

  IF p_business_name IS NULL OR length(trim(p_business_name)) = 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Business name is required';
  END IF;
  IF p_owner_first_name IS NULL OR length(trim(p_owner_first_name)) = 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Owner first name is required';
  END IF;
  IF p_owner_last_name IS NULL OR length(trim(p_owner_last_name)) = 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Owner last name is required';
  END IF;

  SELECT * INTO v_existing
  FROM imagecare.users
  WHERE auth_user_id = auth.uid()
    AND deleted_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'business_id',     v_existing.business_id,
      'user_id',         v_existing.id,
      'already_existed', TRUE
    );
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Could not resolve authenticated account email';
  END IF;

  INSERT INTO imagecare.businesses (name)
  VALUES (trim(p_business_name))
  RETURNING id INTO v_business_id;

  -- Seed the standard chart of accounts so every accounting
  -- operation (sale, purchase, expense, payroll, credit, supplier
  -- payment) has the accounts it needs to post journal entries
  -- against, from the moment the business is created (0025).
  PERFORM imagecare.fn_seed_chart_of_accounts(v_business_id);

  -- NEW: create a default branch so the business can transact
  -- immediately. branch_type defaults to 'retail' at the column
  -- level; code 'MAIN' is unique per business so this never
  -- collides with a branch created later through Settings.
  INSERT INTO imagecare.branches (business_id, name, code, is_main_branch, is_active)
  VALUES (v_business_id, 'Main Branch', 'MAIN', TRUE, TRUE)
  RETURNING id INTO v_branch_id;

  INSERT INTO imagecare.users (
    business_id, branch_id, auth_user_id, first_name, last_name, email,
    role, is_owner, is_active
  ) VALUES (
    v_business_id, v_branch_id, auth.uid(), trim(p_owner_first_name), trim(p_owner_last_name),
    lower(trim(v_email)), 'Owner', TRUE, TRUE
  )
  RETURNING id INTO v_user_id;

  INSERT INTO imagecare.user_permissions
    (business_id, user_id, module, can_view, can_create, can_edit,
     can_delete, can_approve, can_export, can_sync, branch_scope, notes)
  SELECT
    v_business_id, v_user_id, m.module,
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'all',
    'Auto-granted at business registration (owner)'
  FROM (VALUES
    ('sales'), ('purchases'), ('expenses'), ('payroll'), ('inventory'),
    ('customers'), ('suppliers'), ('reports'), ('settings'), ('users'),
    ('branches'), ('journal'), ('bank'), ('cash'), ('credit'),
    ('invoices'), ('bills'),
    ('loyalty'), ('salesTargets'), ('stockSummary'), ('dailySummary'),
    ('monthlySummary'), ('annualSummary'), ('branchOverview'),
    ('offlineMode'), ('accounting')
  ) AS m(module);

  RETURN jsonb_build_object(
    'business_id',     v_business_id,
    'user_id',         v_user_id,
    'already_existed', FALSE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION imagecare.fn_register_business(TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION imagecare.fn_register_business(TEXT, TEXT, TEXT) FROM PUBLIC;

-- ============================================================
-- BACKFILL: any business already registered live before this fix
-- has zero rows in imagecare.branches and every one of its users has
-- branch_id NULL - give each such business a Main Branch and point
-- their branch-less users (owners included) at it, so accounts
-- already live are not left permanently unable to transact.
-- ============================================================
DO $$
DECLARE
  v_biz RECORD;
  v_new_branch_id UUID;
BEGIN
  FOR v_biz IN
    SELECT b.id, b.name FROM imagecare.businesses b
    WHERE NOT EXISTS (
      SELECT 1 FROM imagecare.branches br
      WHERE br.business_id = b.id AND br.deleted_at IS NULL
    )
  LOOP
    INSERT INTO imagecare.branches (business_id, name, code, is_main_branch, is_active)
    VALUES (v_biz.id, 'Main Branch', 'MAIN', TRUE, TRUE)
    RETURNING id INTO v_new_branch_id;

    UPDATE imagecare.users
    SET branch_id = v_new_branch_id
    WHERE business_id = v_biz.id
      AND branch_id IS NULL
      AND deleted_at IS NULL;
  END LOOP;
END $$;

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-8-0027',
  'Stage 8: fn_register_business now creates a default Main Branch and assigns it to the new owner, fixing every transactional Save button (Expenses, Sales, Purchases, Payroll, Stock, Cash) which required a non-null branch_id; backfill existing branch-less businesses and their branch-less users',
  'system', FALSE, NULL, NULL
);
END $$;
