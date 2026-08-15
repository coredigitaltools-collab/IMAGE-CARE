-- ============================================================
-- ImageCare ERP - Stage 2 Correction Migration 0012
-- File: 0012_stage2_accounts_and_composite_uniques.sql
-- Version: IMC-STAGE-2-v1.1
-- Purpose:
--   1. Create the authoritative Chart of Accounts table.
--   2. Add composite unique constraints on all parent tables
--      required to anchor the cross-business composite FKs
--      that will be added in migration 0013.
--
-- Depends on: 0011_stage2_supporting_domains.sql
-- Does NOT modify previously applied migrations.
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- 1. CHART OF ACCOUNTS
-- Authoritative account registry per business.
-- journal_lines.account_id will FK here (added in 0014).
-- account_code is unique per business - not hard-coded globally.
-- Owners can add custom accounts while the system enforces types.
-- parent_account_id enables P&L / balance sheet tree structure.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.accounts (
  id                UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID                   NOT NULL REFERENCES imagecare.businesses(id) ON DELETE RESTRICT,
  account_code      TEXT                   NOT NULL,
  account_name      TEXT                   NOT NULL,
  account_type      imagecare.account_type NOT NULL,
  parent_account_id UUID                   REFERENCES imagecare.accounts(id) ON DELETE SET NULL,
  description       TEXT,
  -- is_system: TRUE means shipped with the business setup, owner cannot delete
  is_system         BOOLEAN                NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN                NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
  created_by        UUID                   REFERENCES imagecare.users(id) ON DELETE SET NULL,
  updated_by        UUID                   REFERENCES imagecare.users(id) ON DELETE SET NULL,

  -- account_code unique within a business (not globally)
  CONSTRAINT uq_s2_account_code_per_business UNIQUE (business_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_s2_accounts_business
  ON imagecare.accounts (business_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_s2_accounts_parent
  ON imagecare.accounts (parent_account_id) WHERE parent_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_s2_accounts_type
  ON imagecare.accounts (business_id, account_type);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_accounts_updated_at') THEN
    CREATE TRIGGER tg_s2_accounts_updated_at
      BEFORE UPDATE ON imagecare.accounts
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_accounts_select ON imagecare.accounts;
CREATE POLICY rls_s2_accounts_select ON imagecare.accounts
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

-- All business members can read the chart of accounts.
-- Only owners can create/modify/deactivate accounts.
DROP POLICY IF EXISTS rls_s2_accounts_modify ON imagecare.accounts;
CREATE POLICY rls_s2_accounts_modify ON imagecare.accounts
  FOR ALL USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_is_business_owner(business_id)
  );

-- ============================================================
-- 2. COMPOSITE UNIQUE CONSTRAINTS ON PARENT TABLES
-- These are required so that composite foreign keys in child
-- tables can reference (business_id, id) on parent tables.
-- PostgreSQL requires the referenced columns to have a unique
-- constraint (or be the primary key) for a FK to compile.
--
-- Each parent's PK is already unique on id alone, but to allow
-- a child FK of (parent_business_id, parent_id) we need
-- UNIQUE (business_id, id) on the parent.
--
-- Tables that need this:
--   - sales        (referenced by sale_items, credit_transactions, invoices)
--   - purchases    (referenced by purchase_items, bills, credit_transactions)
--   - products     (referenced by inventory_movements, sale_items, purchase_items)
--   - customers    (referenced by sales.customer_id, invoices, credit_accounts)
--   - suppliers    (referenced by purchases.supplier_id, bills, credit_accounts)
--   - branches     (referenced by inventory_movements, sales, purchases, etc.)
--   - journal_entries (referenced by journal_lines)
--   - loyalty_accounts (referenced by loyalty_transactions)
--   - accounts     (referenced by journal_lines - new in this migration)
-- ============================================================

-- Sales
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_s2_sales_business_id'
  ) THEN
    ALTER TABLE imagecare.sales
      ADD CONSTRAINT uq_s2_sales_business_id UNIQUE (business_id, id);
  END IF;
END $$;

-- Purchases
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_s2_purchases_business_id'
  ) THEN
    ALTER TABLE imagecare.purchases
      ADD CONSTRAINT uq_s2_purchases_business_id UNIQUE (business_id, id);
  END IF;
END $$;

-- Products
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_s2_products_business_id'
  ) THEN
    ALTER TABLE imagecare.products
      ADD CONSTRAINT uq_s2_products_business_id UNIQUE (business_id, id);
  END IF;
END $$;

-- Customers
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_s2_customers_business_id'
  ) THEN
    ALTER TABLE imagecare.customers
      ADD CONSTRAINT uq_s2_customers_business_id UNIQUE (business_id, id);
  END IF;
END $$;

-- Suppliers
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_s2_suppliers_business_id'
  ) THEN
    ALTER TABLE imagecare.suppliers
      ADD CONSTRAINT uq_s2_suppliers_business_id UNIQUE (business_id, id);
  END IF;
END $$;

-- Branches (Stage 1 table - add composite unique for cross-business FK anchoring)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_s1_branches_business_id'
  ) THEN
    ALTER TABLE imagecare.branches
      ADD CONSTRAINT uq_s1_branches_business_id UNIQUE (business_id, id);
  END IF;
END $$;

-- Journal entries
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_s2_journal_entries_business_id'
  ) THEN
    ALTER TABLE imagecare.journal_entries
      ADD CONSTRAINT uq_s2_journal_entries_business_id UNIQUE (business_id, id);
  END IF;
END $$;

-- Loyalty accounts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_s2_loyalty_accounts_business_id'
  ) THEN
    ALTER TABLE imagecare.loyalty_accounts
      ADD CONSTRAINT uq_s2_loyalty_accounts_business_id UNIQUE (business_id, id);
  END IF;
END $$;

-- Accounts (this table is new in this migration - added inline above)
-- The UNIQUE (business_id, account_code) is already declared in the CREATE TABLE.
-- We also need UNIQUE (business_id, id) for journal_lines composite FK.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_s2_accounts_business_id'
  ) THEN
    ALTER TABLE imagecare.accounts
      ADD CONSTRAINT uq_s2_accounts_business_id UNIQUE (business_id, id);
  END IF;
END $$;

-- Credit accounts (referenced by credit_transactions)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_s2_credit_accounts_business_id'
  ) THEN
    ALTER TABLE imagecare.credit_accounts
      ADD CONSTRAINT uq_s2_credit_accounts_business_id UNIQUE (business_id, id);
  END IF;
END $$;

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-2-0012',
  'Stage 2 Correction: accounts table, composite unique constraints for cross-business FKs',
  'system', FALSE, NULL, NULL
);
END $$;
