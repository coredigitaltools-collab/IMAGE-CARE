-- ============================================================
-- ImageCare ERP - Stage 8 Migration 0025
-- File: 0025_stage8_seed_coa_on_registration.sql
-- Version: IMC-STAGE-8-0025
-- Purpose: CRITICAL bug found during Phase 12 E2E verification:
--
--   1. imagecare.fn_seed_chart_of_accounts(uuid) has an ambiguous
--      column reference bug - inside the loop, `account_code` in
--      `WHERE business_id = p_business_id AND account_code =
--      v_seed.parent_code` is ambiguous between the function's own
--      RETURNS TABLE column named account_code and the
--      imagecare.accounts.account_code column, so the function
--      throws (42702) on the very first seed row that has a
--      parent_code ('1120 Mobile Money', parent '1100'). This
--      function has never successfully run to completion against
--      the live database (confirmed live during this E2E pass).
--
--   2. Nothing in the codebase ever calls
--      fn_seed_chart_of_accounts() - not fn_register_business(),
--      not any frontend service. Every business created through the
--      real registration flow therefore has ZERO rows in
--      imagecare.accounts. Since accountingEngine.resolveAccountCode
--      looks up accounts by (business_id, account_code) and returns
--      ACCOUNT_NOT_FOUND when no row matches, this means every
--      accounting-relevant operation - sale, purchase, expense,
--      payroll, credit repayment, supplier payment - fails for every
--      newly registered business. This is the single most severe
--      bug found in this implementation pass: without it, none of
--      the 9 core transaction workflows can post a journal entry.
--
-- Fix: (a) qualify the ambiguous column reference, (b) call
-- fn_seed_chart_of_accounts() from inside fn_register_business() so
-- every new business is seeded atomically at registration, with no
-- frontend change required.
--
-- Depends on: 0019_stage3_engine_support.sql, 0020_stage7_pin_auth.sql
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- FIX 1: ambiguous column reference in fn_seed_chart_of_accounts
-- ============================================================
CREATE OR REPLACE FUNCTION imagecare.fn_seed_chart_of_accounts(
  p_business_id UUID
)
RETURNS TABLE (
  account_code TEXT,
  account_name TEXT,
  action       TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = imagecare, pg_catalog
AS $$
DECLARE
  v_seed RECORD;
BEGIN
  FOR v_seed IN
    SELECT * FROM (VALUES
      ('1100', 'Cash in Hand',          'asset',     NULL::TEXT, TRUE),
      ('1120', 'Mobile Money',          'asset',     '1100',     TRUE),
      ('1130', 'Bank Account',          'asset',     '1100',     TRUE),
      ('1200', 'Accounts Receivable',   'asset',     NULL,       TRUE),
      ('1300', 'Inventory',             'asset',     NULL,       TRUE),
      ('2000', 'Accounts Payable',      'liability', NULL,       TRUE),
      ('3000', 'Owner Equity',          'equity',    NULL,       TRUE),
      ('4000', 'Sales Revenue',         'revenue',   NULL,       TRUE),
      ('4100', 'Other Income',          'revenue',   '4000',     FALSE),
      ('5000', 'Cost of Goods Sold',    'expense',   NULL,       TRUE),
      ('6000', 'Operating Expenses',    'expense',   NULL,       TRUE),
      ('6100', 'Rent',                  'expense',   '6000',     FALSE),
      ('6200', 'Utilities',             'expense',   '6000',     FALSE),
      ('6300', 'Transport',             'expense',   '6000',     FALSE),
      ('6400', 'Salaries and Wages',    'expense',   '6000',     TRUE),
      ('6500', 'PAYE Tax',              'expense',   '6400',     TRUE),
      ('6600', 'NSSF Contribution',     'expense',   '6400',     TRUE),
      ('7000', 'Depreciation',          'expense',   '6000',     FALSE)
    ) AS t(code, name, type, parent_code, is_system)
  LOOP
    DECLARE
      v_parent_id UUID := NULL;
      v_inserted  BOOLEAN := FALSE;
    BEGIN
      IF v_seed.parent_code IS NOT NULL THEN
        -- FIX: qualify with table alias `a` - previously
        -- `account_code` was ambiguous against this function's own
        -- RETURNS TABLE column of the same name.
        SELECT a.id INTO v_parent_id
          FROM imagecare.accounts a
         WHERE a.business_id  = p_business_id
           AND a.account_code = v_seed.parent_code
         LIMIT 1;
      END IF;

      INSERT INTO imagecare.accounts (
        business_id, account_code, account_name,
        account_type, parent_account_id, is_system, is_active
      )
      VALUES (
        p_business_id,
        v_seed.code,
        v_seed.name,
        v_seed.type::imagecare.account_type,
        v_parent_id,
        v_seed.is_system,
        TRUE
      )
      ON CONFLICT ON CONSTRAINT uq_s2_account_code_per_business DO NOTHING;

      GET DIAGNOSTICS v_inserted = ROW_COUNT;

      RETURN QUERY SELECT
        v_seed.code,
        v_seed.name,
        CASE WHEN v_inserted THEN 'inserted' ELSE 'skipped' END;
    END;
  END LOOP;
END;
$$;

-- ============================================================
-- FIX 2: seed the chart of accounts as part of registration
-- Re-create fn_register_business identically to 0020, with one
-- addition: PERFORM imagecare.fn_seed_chart_of_accounts(v_business_id)
-- right after the business row is created, in the same transaction
-- as everything else registration does.
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

  -- NEW: seed the standard chart of accounts so every accounting
  -- operation (sale, purchase, expense, payroll, credit, supplier
  -- payment) has the accounts it needs to post journal entries
  -- against, from the moment the business is created.
  PERFORM imagecare.fn_seed_chart_of_accounts(v_business_id);

  INSERT INTO imagecare.users (
    business_id, auth_user_id, first_name, last_name, email,
    role, is_owner, is_active
  ) VALUES (
    v_business_id, auth.uid(), trim(p_owner_first_name), trim(p_owner_last_name),
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
-- (through the broken flow) has zero accounts rows - seed them now
-- so existing businesses are not left permanently broken.
-- ============================================================
DO $$
DECLARE
  v_biz RECORD;
BEGIN
  FOR v_biz IN
    SELECT b.id FROM imagecare.businesses b
    WHERE NOT EXISTS (SELECT 1 FROM imagecare.accounts a WHERE a.business_id = b.id)
  LOOP
    PERFORM imagecare.fn_seed_chart_of_accounts(v_biz.id);
  END LOOP;
END $$;

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-8-0025',
  'Stage 8: Fix ambiguous column bug in fn_seed_chart_of_accounts and wire it into fn_register_business so every new business gets a chart of accounts; backfill existing businesses with none',
  'system', FALSE, NULL, NULL
);
END $$;
