-- ============================================================
-- ImageCare ERP - Stage 2 Final Integrity Migration 0018
-- File: 0018_stage2_delete_action_and_searchpath_corrections.sql
-- Version: IMC-STAGE-2-v1.3
-- Purpose: Three categories of corrections.
--
-- A. ACCOUNT HIERARCHY FK: ON DELETE SET NULL -> ON DELETE RESTRICT
--    fk_s2_accounts_biz_parent was added in 0016 with ON DELETE SET NULL.
--    A referenced parent account must not be deleted while children
--    reference it. Accounts must be deactivated instead.
--    Corrected to ON DELETE RESTRICT.
--
-- B. NULLABLE-BRANCH COMPOSITE FKs: ON DELETE SET/CASCADE -> ON DELETE RESTRICT
--    Nine composite FKs added in 0017 for nullable branch_id columns
--    used ON DELETE SET NULL or ON DELETE CASCADE. Both are unsafe:
--    SET NULL on a composite FK would attempt to null business_id (which
--    is NOT NULL), causing an error; CASCADE would silently destroy records.
--    All nine are replaced with ON DELETE RESTRICT. Branch deletion is
--    prevented while any record references that branch. Branches must be
--    deactivated/archived instead of deleted.
--    branch_id remains nullable - a NULL branch_id legitimately means
--    a business-wide record with no branch scope.
--
--    Affected constraints (all from 0017):
--      fk_s2_customers_biz_branch        (was SET NULL)
--      fk_s2_suppliers_biz_branch        (was SET NULL)
--      fk_s2_bank_accounts_biz_branch    (was SET NULL)
--      fk_s2_sales_targets_biz_branch    (was CASCADE)
--      fk_s2_audit_logs_biz_branch       (was SET NULL)
--      fk_s2_sync_queue_biz_branch       (was SET NULL)
--      fk_s2_notifications_biz_branch    (was SET NULL)
--      fk_s2_storage_metadata_biz_branch (was SET NULL)
--      fk_s2_settings_biz_branch         (was CASCADE)
--
-- C. SECURITY DEFINER SEARCH_PATH HARDENING
--    All Stage 2 SECURITY DEFINER functions are replaced with versions
--    that include SET search_path = imagecare, pg_catalog so they
--    cannot resolve objects through a caller-controlled search path.
--    Functions hardened:
--      fn_update_credit_balance       (originally in 0008, replaced in 0015)
--      fn_audit_trigger               (originally in 0011)
--      fn_check_cross_business_refs   (originally in 0013)
--      fn_check_journal_line_integrity (originally in 0014)
--      fn_check_account_hierarchy_integrity (originally in 0016)
--    fn_set_updated_at is NOT SECURITY DEFINER - no change needed.
--    fn_guard_posted_journal is NOT SECURITY DEFINER - no change needed.
--
-- Depends on: 0017_stage2_branch_business_fk_integrity.sql
-- Does NOT modify previously applied migrations.
-- ============================================================

SET search_path TO imagecare, pg_catalog;

-- ============================================================
-- A. FIX: accounts parent FK - SET NULL -> RESTRICT
-- ============================================================

-- Drop the incorrect constraint from 0016
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_accounts_biz_parent') THEN
    ALTER TABLE imagecare.accounts
      DROP CONSTRAINT fk_s2_accounts_biz_parent;
  END IF;
END $$;

-- Re-add with ON DELETE RESTRICT
-- Parent accounts cannot be deleted while child accounts reference them.
-- Deactivate the parent account (is_active = FALSE) instead.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_accounts_biz_parent') THEN
    ALTER TABLE imagecare.accounts
      ADD CONSTRAINT fk_s2_accounts_biz_parent
      FOREIGN KEY (business_id, parent_account_id)
      REFERENCES imagecare.accounts (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ============================================================
-- B. FIX: nullable-branch composite FKs - all -> ON DELETE RESTRICT
-- Pattern: drop incorrect, re-add RESTRICT.
-- ============================================================

-- CUSTOMERS
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_customers_biz_branch') THEN
    ALTER TABLE imagecare.customers DROP CONSTRAINT fk_s2_customers_biz_branch;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_customers_biz_branch') THEN
    ALTER TABLE imagecare.customers
      ADD CONSTRAINT fk_s2_customers_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- SUPPLIERS
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_suppliers_biz_branch') THEN
    ALTER TABLE imagecare.suppliers DROP CONSTRAINT fk_s2_suppliers_biz_branch;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_suppliers_biz_branch') THEN
    ALTER TABLE imagecare.suppliers
      ADD CONSTRAINT fk_s2_suppliers_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- BANK_ACCOUNTS
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_bank_accounts_biz_branch') THEN
    ALTER TABLE imagecare.bank_accounts DROP CONSTRAINT fk_s2_bank_accounts_biz_branch;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_bank_accounts_biz_branch') THEN
    ALTER TABLE imagecare.bank_accounts
      ADD CONSTRAINT fk_s2_bank_accounts_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- SALES_TARGETS (was CASCADE - must become RESTRICT)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_sales_targets_biz_branch') THEN
    ALTER TABLE imagecare.sales_targets DROP CONSTRAINT fk_s2_sales_targets_biz_branch;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_sales_targets_biz_branch') THEN
    ALTER TABLE imagecare.sales_targets
      ADD CONSTRAINT fk_s2_sales_targets_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- AUDIT_LOGS
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_audit_logs_biz_branch') THEN
    ALTER TABLE imagecare.audit_logs DROP CONSTRAINT fk_s2_audit_logs_biz_branch;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_audit_logs_biz_branch') THEN
    ALTER TABLE imagecare.audit_logs
      ADD CONSTRAINT fk_s2_audit_logs_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- SYNC_QUEUE
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_sync_queue_biz_branch') THEN
    ALTER TABLE imagecare.sync_queue DROP CONSTRAINT fk_s2_sync_queue_biz_branch;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_sync_queue_biz_branch') THEN
    ALTER TABLE imagecare.sync_queue
      ADD CONSTRAINT fk_s2_sync_queue_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- NOTIFICATIONS
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_notifications_biz_branch') THEN
    ALTER TABLE imagecare.notifications DROP CONSTRAINT fk_s2_notifications_biz_branch;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_notifications_biz_branch') THEN
    ALTER TABLE imagecare.notifications
      ADD CONSTRAINT fk_s2_notifications_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- STORAGE_METADATA
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_storage_metadata_biz_branch') THEN
    ALTER TABLE imagecare.storage_metadata DROP CONSTRAINT fk_s2_storage_metadata_biz_branch;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_storage_metadata_biz_branch') THEN
    ALTER TABLE imagecare.storage_metadata
      ADD CONSTRAINT fk_s2_storage_metadata_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- SETTINGS (was CASCADE - must become RESTRICT)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_settings_biz_branch') THEN
    ALTER TABLE imagecare.settings DROP CONSTRAINT fk_s2_settings_biz_branch;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_settings_biz_branch') THEN
    ALTER TABLE imagecare.settings
      ADD CONSTRAINT fk_s2_settings_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ============================================================
-- C. SECURITY DEFINER SEARCH_PATH HARDENING
-- Each function is replaced in full with SET search_path added
-- immediately after the DECLARE block (or as the first statement).
-- The SET applies for the lifetime of the function call.
-- ============================================================

-- ------------------------------------------------------------
-- fn_update_credit_balance (originally 0008, replaced in 0015)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION imagecare.fn_update_credit_balance()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = imagecare, pg_catalog
AS $$
DECLARE
  v_delta        NUMERIC(14,2);
  v_account      imagecare.credit_accounts%ROWTYPE;
BEGIN
  SELECT * INTO v_account
    FROM imagecare.credit_accounts
   WHERE id = NEW.credit_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'IMC-CREDIT: credit_account % not found', NEW.credit_account_id;
  END IF;

  IF NEW.transaction_type = 'charge' THEN
    v_delta := NEW.amount;

  ELSIF NEW.transaction_type = 'payment' THEN
    IF NEW.amount > v_account.current_balance THEN
      RAISE EXCEPTION
        'IMC-CREDIT: payment amount (%) exceeds current credit balance (%) on account %. '
        'Investigate for duplicate payment or data entry error.',
        NEW.amount,
        v_account.current_balance,
        NEW.credit_account_id;
    END IF;
    v_delta := -NEW.amount;

  ELSE
    RAISE EXCEPTION
      'IMC-CREDIT: unknown transaction_type %. Must be ''charge'' or ''payment''.',
      NEW.transaction_type;
  END IF;

  UPDATE imagecare.credit_accounts
     SET current_balance = current_balance + v_delta,
         updated_at      = NOW()
   WHERE id = NEW.credit_account_id;

  IF v_account.customer_id IS NOT NULL THEN
    UPDATE imagecare.customers
       SET credit_balance = credit_balance + v_delta,
           updated_at     = NOW()
     WHERE id = v_account.customer_id;
  ELSIF v_account.supplier_id IS NOT NULL THEN
    UPDATE imagecare.suppliers
       SET outstanding = outstanding + v_delta,
           updated_at  = NOW()
     WHERE id = v_account.supplier_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- fn_audit_trigger (originally 0011)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION imagecare.fn_audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = imagecare, pg_catalog
AS $$
DECLARE
  v_action      imagecare.audit_action;
  v_prev        JSONB;
  v_next        JSONB;
  v_changed     TEXT[];
  v_business_id UUID;
  v_branch_id   UUID;
  v_user_id     UUID;
  v_record_id   UUID;
BEGIN
  IF    TG_OP = 'INSERT' THEN v_action := 'insert';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_action := 'delete';
    ELSE
      v_action := 'update';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN v_action := 'delete';
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_prev        := to_jsonb(OLD);
    v_next        := NULL;
    v_record_id   := OLD.id;
    v_business_id := OLD.business_id;
    v_branch_id   := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_prev        := NULL;
    v_next        := to_jsonb(NEW);
    v_record_id   := NEW.id;
    v_business_id := NEW.business_id;
    v_branch_id   := NULL;
  ELSE
    v_prev        := to_jsonb(OLD);
    v_next        := to_jsonb(NEW);
    v_record_id   := NEW.id;
    v_business_id := NEW.business_id;
    SELECT array_agg(key) INTO v_changed
    FROM (
      SELECT key FROM jsonb_each(v_next)
      EXCEPT SELECT key FROM jsonb_each(v_prev)
      UNION
      SELECT key FROM (
        SELECT key, value FROM jsonb_each(v_next)
        EXCEPT SELECT key, value FROM jsonb_each(v_prev)
      ) diff
    ) changes;
  END IF;

  BEGIN
    v_user_id := COALESCE(
      (v_next->>'updated_by')::UUID,
      (v_next->>'created_by')::UUID
    );
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  BEGIN
    v_branch_id := (COALESCE(v_next, v_prev)->>'branch_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_branch_id := NULL;
  END;

  INSERT INTO imagecare.audit_logs (
    business_id, branch_id, user_id,
    table_name, record_id, action,
    previous_value, new_value, changed_fields
  ) VALUES (
    v_business_id, v_branch_id, v_user_id,
    TG_TABLE_NAME, v_record_id, v_action,
    v_prev, v_next, v_changed
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- ------------------------------------------------------------
-- fn_check_cross_business_refs (originally 0013)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION imagecare.fn_check_cross_business_refs()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = imagecare, pg_catalog
AS $$
DECLARE
  v_ref_business_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    IF NEW.customer_id IS NOT NULL THEN
      SELECT business_id INTO v_ref_business_id
        FROM imagecare.customers WHERE id = NEW.customer_id;
      IF v_ref_business_id IS DISTINCT FROM NEW.business_id THEN
        RAISE EXCEPTION
          'IMC-XBIZ: invoices.customer_id % belongs to a different business than %',
          NEW.customer_id, NEW.business_id;
      END IF;
    END IF;
    IF NEW.sale_id IS NOT NULL THEN
      SELECT business_id INTO v_ref_business_id
        FROM imagecare.sales WHERE id = NEW.sale_id;
      IF v_ref_business_id IS DISTINCT FROM NEW.business_id THEN
        RAISE EXCEPTION
          'IMC-XBIZ: invoices.sale_id % belongs to a different business than %',
          NEW.sale_id, NEW.business_id;
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'bills' THEN
    IF NEW.supplier_id IS NOT NULL THEN
      SELECT business_id INTO v_ref_business_id
        FROM imagecare.suppliers WHERE id = NEW.supplier_id;
      IF v_ref_business_id IS DISTINCT FROM NEW.business_id THEN
        RAISE EXCEPTION
          'IMC-XBIZ: bills.supplier_id % belongs to a different business than %',
          NEW.supplier_id, NEW.business_id;
      END IF;
    END IF;
    IF NEW.purchase_id IS NOT NULL THEN
      SELECT business_id INTO v_ref_business_id
        FROM imagecare.purchases WHERE id = NEW.purchase_id;
      IF v_ref_business_id IS DISTINCT FROM NEW.business_id THEN
        RAISE EXCEPTION
          'IMC-XBIZ: bills.purchase_id % belongs to a different business than %',
          NEW.purchase_id, NEW.business_id;
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'sales' THEN
    IF NEW.customer_id IS NOT NULL THEN
      SELECT business_id INTO v_ref_business_id
        FROM imagecare.customers WHERE id = NEW.customer_id;
      IF v_ref_business_id IS DISTINCT FROM NEW.business_id THEN
        RAISE EXCEPTION
          'IMC-XBIZ: sales.customer_id % belongs to a different business than %',
          NEW.customer_id, NEW.business_id;
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'purchases' THEN
    IF NEW.supplier_id IS NOT NULL THEN
      SELECT business_id INTO v_ref_business_id
        FROM imagecare.suppliers WHERE id = NEW.supplier_id;
      IF v_ref_business_id IS DISTINCT FROM NEW.business_id THEN
        RAISE EXCEPTION
          'IMC-XBIZ: purchases.supplier_id % belongs to a different business than %',
          NEW.supplier_id, NEW.business_id;
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'credit_transactions' THEN
    SELECT business_id INTO v_ref_business_id
      FROM imagecare.credit_accounts WHERE id = NEW.credit_account_id;
    IF v_ref_business_id IS DISTINCT FROM NEW.business_id THEN
      RAISE EXCEPTION
        'IMC-XBIZ: credit_transactions.credit_account_id % belongs to a different business than %',
        NEW.credit_account_id, NEW.business_id;
    END IF;
    IF NEW.sale_id IS NOT NULL THEN
      SELECT business_id INTO v_ref_business_id
        FROM imagecare.sales WHERE id = NEW.sale_id;
      IF v_ref_business_id IS DISTINCT FROM NEW.business_id THEN
        RAISE EXCEPTION
          'IMC-XBIZ: credit_transactions.sale_id % belongs to a different business than %',
          NEW.sale_id, NEW.business_id;
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'loyalty_transactions' THEN
    SELECT business_id INTO v_ref_business_id
      FROM imagecare.loyalty_accounts WHERE id = NEW.loyalty_account_id;
    IF v_ref_business_id IS DISTINCT FROM NEW.business_id THEN
      RAISE EXCEPTION
        'IMC-XBIZ: loyalty_transactions.loyalty_account_id % belongs to a different business than %',
        NEW.loyalty_account_id, NEW.business_id;
    END IF;
    IF NEW.sale_id IS NOT NULL THEN
      SELECT business_id INTO v_ref_business_id
        FROM imagecare.sales WHERE id = NEW.sale_id;
      IF v_ref_business_id IS DISTINCT FROM NEW.business_id THEN
        RAISE EXCEPTION
          'IMC-XBIZ: loyalty_transactions.sale_id % belongs to a different business than %',
          NEW.sale_id, NEW.business_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- fn_check_journal_line_integrity (originally 0014)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION imagecare.fn_check_journal_line_integrity()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = imagecare, pg_catalog
AS $$
DECLARE
  v_entry_business_id   UUID;
  v_account_business_id UUID;
  v_auth_code           TEXT;
BEGIN
  SELECT business_id INTO v_entry_business_id
    FROM imagecare.journal_entries
   WHERE id = NEW.journal_entry_id;

  IF v_entry_business_id IS DISTINCT FROM NEW.business_id THEN
    RAISE EXCEPTION
      'IMC-INTEGRITY: journal_lines.business_id (%) does not match '
      'journal_entries.business_id (%) for entry_id %',
      NEW.business_id, v_entry_business_id, NEW.journal_entry_id;
  END IF;

  IF NEW.account_id IS NOT NULL THEN
    SELECT business_id, account_code
      INTO v_account_business_id, v_auth_code
      FROM imagecare.accounts
     WHERE id = NEW.account_id;

    IF v_account_business_id IS DISTINCT FROM NEW.business_id THEN
      RAISE EXCEPTION
        'IMC-INTEGRITY: journal_lines.account_id (%) belongs to business % '
        'but journal line is for business %',
        NEW.account_id, v_account_business_id, NEW.business_id;
    END IF;

    IF NEW.account_code IS DISTINCT FROM v_auth_code THEN
      RAISE EXCEPTION
        'IMC-INTEGRITY: journal_lines.account_code (%) does not match '
        'accounts.account_code (%) for account_id %',
        NEW.account_code, v_auth_code, NEW.account_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- fn_check_account_hierarchy_integrity (originally 0016)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION imagecare.fn_check_account_hierarchy_integrity()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = imagecare, pg_catalog
AS $$
DECLARE
  v_parent_business_id UUID;
BEGIN
  IF NEW.parent_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT business_id INTO v_parent_business_id
    FROM imagecare.accounts
   WHERE id = NEW.parent_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'IMC-ACCOUNT-HIERARCHY: parent_account_id % does not exist.',
      NEW.parent_account_id;
  END IF;

  IF v_parent_business_id IS DISTINCT FROM NEW.business_id THEN
    RAISE EXCEPTION
      'IMC-ACCOUNT-HIERARCHY: account (business %) cannot have a parent account '
      'from a different business (%). parent_account_id = %.',
      NEW.business_id,
      v_parent_business_id,
      NEW.parent_account_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-2-0018',
  'Stage 2 Final: delete action corrections (RESTRICT) and SECURITY DEFINER search_path hardening',
  'system', FALSE, NULL, NULL
);
END $$;
