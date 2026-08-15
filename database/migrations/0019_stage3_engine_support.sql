-- ============================================================
-- ImageCare ERP - Stage 3 Migration 0019
-- File: 0019_stage3_engine_support.sql
-- Version: IMC-STAGE-3-v1.0
-- Purpose: Database objects specifically required by the
--   Stage 3 shared business engines.
--
-- Depends on: 0018_stage2_delete_action_and_searchpath_corrections.sql
--
-- What the Stage 3 engines require from the database:
--
-- From Stage 1 (0001, 0002 - already deployed):
--   - imagecare.businesses, branches, users
--   - permission_groups, group_permissions, permission_group_members
--   - user_permissions, user_branch_access
--   - fn_current_user_id(), fn_current_business_id()
--   - fn_is_business_owner(), fn_can_access_branch()
--   - fn_get_user_context()
--
-- From Stage 2 (0003-0018 - now included in Stage 3 chain):
--   - All ERP domain tables (products, sales, sale_items,
--     purchases, purchase_items, expenses, payroll,
--     inventory_movements, cash_transactions, journal_entries,
--     journal_lines, accounts, credit_accounts, credit_transactions,
--     audit_logs, sync_queue, invoices, bills, settings, etc.)
--   - vw_stock_summary (stock always derived from movements)
--   - fn_guard_posted_journal (journal immutability)
--   - fn_update_credit_balance (reject overpayment)
--   - fn_audit_trigger (audit trail on sensitive tables)
--   - fn_check_cross_business_refs (cross-business FK integrity)
--   - fn_check_journal_line_integrity (account + business match)
--   - fn_check_account_hierarchy_integrity (parent account check)
--   - All composite FK constraints for branch/business isolation
--   - RLS on all tables using fn_current_business_id() and
--     fn_can_access_branch()
--
-- Stage 3 additions (this migration):
--   - fn_seed_chart_of_accounts(p_business_id UUID)
--     Callable by owner to initialise standard account codes.
--     The accounting engine resolves account codes at runtime;
--     accounts must exist for resolution to succeed.
--     Account codes used by the engine:
--       1100 Cash in Hand (asset)
--       1120 Mobile Money (asset)
--       1130 Bank Account (asset)
--       1200 Accounts Receivable (asset)
--       1300 Inventory (asset)
--       2000 Accounts Payable (liability)
--       4000 Sales Revenue (revenue)
--       5000 Cost of Goods Sold (expense)
--       6000 Operating Expenses (expense)
--     The function is idempotent: it skips codes that already exist.
--     Owners may add, rename, or restructure accounts after seeding.
--
--   - fn_business_engine_health_check(p_business_id UUID)
--     Returns a summary of which engine prerequisites exist.
--     Used for deployment validation only.
--
--   - vw_engine_account_summary
--     Read surface for the reporting engine's account balance queries.
--     Aggregates vw_account_balances with account metadata.
-- ============================================================

SET search_path TO imagecare, pg_catalog;

-- ============================================================
-- fn_seed_chart_of_accounts
-- Inserts standard account codes for a business.
-- Idempotent: uses ON CONFLICT DO NOTHING.
-- Standard Uganda chart of accounts codes used by the engines.
-- Owners can customise after seeding.
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
  -- Standard accounts required by the Stage 3 accounting engine
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
    -- Resolve parent account ID from code if present
    DECLARE
      v_parent_id UUID := NULL;
      v_inserted  BOOLEAN := FALSE;
    BEGIN
      IF v_seed.parent_code IS NOT NULL THEN
        SELECT id INTO v_parent_id
          FROM imagecare.accounts
         WHERE business_id  = p_business_id
           AND account_code = v_seed.parent_code
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

COMMENT ON FUNCTION imagecare.fn_seed_chart_of_accounts(UUID) IS
  'Seeds the standard Uganda Chart of Accounts for a business. '
  'Idempotent - skips codes that already exist. '
  'Called once during business setup. '
  'Required by the Stage 3 accounting engine for account resolution.';

-- ============================================================
-- fn_business_engine_health_check
-- Validates that all prerequisites for the Stage 3 engines
-- are in place for a given business.
-- Returns one row per check with pass/fail status.
-- ============================================================
CREATE OR REPLACE FUNCTION imagecare.fn_business_engine_health_check(
  p_business_id UUID
)
RETURNS TABLE (
  check_name   TEXT,
  status       TEXT,
  detail       TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = imagecare, pg_catalog
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Business exists and is active
  SELECT COUNT(*) INTO v_count
    FROM imagecare.businesses
   WHERE id = p_business_id AND is_active = TRUE;
  RETURN QUERY SELECT
    'business_active'::TEXT,
    CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_count = 1 THEN 'Business is active' ELSE 'Business not found or inactive' END;

  -- At least one active branch
  SELECT COUNT(*) INTO v_count
    FROM imagecare.branches
   WHERE business_id = p_business_id AND is_active = TRUE;
  RETURN QUERY SELECT
    'branch_exists'::TEXT,
    CASE WHEN v_count > 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_count > 0
         THEN v_count::TEXT || ' active branch(es) found'
         ELSE 'No active branches' END;

  -- Owner user exists
  SELECT COUNT(*) INTO v_count
    FROM imagecare.users
   WHERE business_id = p_business_id AND is_owner = TRUE AND is_active = TRUE;
  RETURN QUERY SELECT
    'owner_exists'::TEXT,
    CASE WHEN v_count > 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_count > 0 THEN 'Owner found' ELSE 'No active owner found' END;

  -- Required engine accounts seeded
  SELECT COUNT(*) INTO v_count
    FROM imagecare.accounts
   WHERE business_id  = p_business_id
     AND account_code IN ('1100','1200','1300','2000','4000','5000','6000')
     AND is_active    = TRUE;
  RETURN QUERY SELECT
    'accounts_seeded'::TEXT,
    CASE WHEN v_count = 7 THEN 'PASS'
         WHEN v_count > 0 THEN 'WARN'
         ELSE 'FAIL' END,
    v_count::TEXT || '/7 required engine accounts present. '
    'Run fn_seed_chart_of_accounts() to complete.';

  -- vw_stock_summary accessible
  BEGIN
    PERFORM 1 FROM imagecare.vw_stock_summary
     WHERE business_id = p_business_id LIMIT 1;
    RETURN QUERY SELECT
      'stock_view_accessible'::TEXT, 'PASS'::TEXT, 'vw_stock_summary is readable';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT
      'stock_view_accessible'::TEXT, 'FAIL'::TEXT, SQLERRM;
  END;

  -- Posted journal immutability trigger active
  SELECT COUNT(*) INTO v_count
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'imagecare'
     AND c.relname = 'journal_entries'
     AND t.tgname  = 'tg_imc_guard_posted_journal'
     AND t.tgenabled != 'D';
  RETURN QUERY SELECT
    'journal_immutability_trigger'::TEXT,
    CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_count = 1
         THEN 'tg_imc_guard_posted_journal is active'
         ELSE 'tg_imc_guard_posted_journal missing or disabled' END;

  -- Credit balance trigger active
  SELECT COUNT(*) INTO v_count
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'imagecare'
     AND c.relname = 'credit_transactions'
     AND t.tgname  = 'tg_s2_credit_txn_balance'
     AND t.tgenabled != 'D';
  RETURN QUERY SELECT
    'credit_balance_trigger'::TEXT,
    CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_count = 1
         THEN 'tg_s2_credit_txn_balance is active'
         ELSE 'tg_s2_credit_txn_balance missing or disabled' END;

  -- Cross-business FK triggers active (spot check on sales)
  SELECT COUNT(*) INTO v_count
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'imagecare'
     AND c.relname = 'sales'
     AND t.tgname  = 'tg_s2_xbiz_sales'
     AND t.tgenabled != 'D';
  RETURN QUERY SELECT
    'cross_business_fk_triggers'::TEXT,
    CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_count = 1
         THEN 'Cross-business reference triggers active'
         ELSE 'tg_s2_xbiz_sales missing or disabled' END;

  -- Audit trigger active on sensitive tables (spot check on sales)
  SELECT COUNT(*) INTO v_count
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'imagecare'
     AND c.relname = 'sales'
     AND t.tgname  = 'tg_s2_audit_sales'
     AND t.tgenabled != 'D';
  RETURN QUERY SELECT
    'audit_trigger_active'::TEXT,
    CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_count = 1
         THEN 'tg_s2_audit_sales is active'
         ELSE 'tg_s2_audit_sales missing or disabled' END;

  -- RLS enabled on journal_entries
  SELECT COUNT(*) INTO v_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'imagecare'
     AND c.relname = 'journal_entries'
     AND c.relrowsecurity = TRUE;
  RETURN QUERY SELECT
    'journal_rls_enabled'::TEXT,
    CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_count = 1
         THEN 'RLS is enabled on journal_entries'
         ELSE 'RLS is NOT enabled on journal_entries' END;

  -- RLS enabled on inventory_movements
  SELECT COUNT(*) INTO v_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'imagecare'
     AND c.relname = 'inventory_movements'
     AND c.relrowsecurity = TRUE;
  RETURN QUERY SELECT
    'inventory_rls_enabled'::TEXT,
    CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN v_count = 1
         THEN 'RLS is enabled on inventory_movements'
         ELSE 'RLS is NOT enabled on inventory_movements' END;
END;
$$;

COMMENT ON FUNCTION imagecare.fn_business_engine_health_check(UUID) IS
  'Validates Stage 3 engine prerequisites for a business. '
  'Run after deployment to confirm all triggers, views, and accounts are in place.';

-- ============================================================
-- vw_engine_account_summary
-- Joins vw_account_balances with the accounts table to provide
-- a single enriched view for the reporting engine.
-- Only includes posted journal entries (inherited from vw_account_balances).
-- ============================================================
CREATE OR REPLACE VIEW imagecare.vw_engine_account_summary AS
SELECT
  ab.business_id,
  ab.branch_id,
  ab.period_year,
  ab.period_month,
  ab.account_code,
  ab.account_name,
  ab.account_type,
  ab.total_debits,
  ab.total_credits,
  ab.net_balance,
  -- Join with accounts for authoritative name and hierarchy
  a.id                   AS account_id,
  a.parent_account_id,
  a.is_system,
  a.is_active            AS account_active
FROM imagecare.vw_account_balances ab
LEFT JOIN imagecare.accounts a
  ON  a.business_id  = ab.business_id
  AND a.account_code = ab.account_code;

COMMENT ON VIEW imagecare.vw_engine_account_summary IS
  'Enriched account balance view joining vw_account_balances with the '
  'Chart of Accounts. Used by the Stage 3 reporting engine. '
  'Only includes posted journal entries (via vw_account_balances).';

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-3-0019',
  'Stage 3: Engine support - fn_seed_chart_of_accounts, fn_business_engine_health_check, vw_engine_account_summary',
  'system', FALSE, NULL, NULL
);
END $$;
