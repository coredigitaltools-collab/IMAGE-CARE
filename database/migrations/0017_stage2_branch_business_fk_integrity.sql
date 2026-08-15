-- ============================================================
-- ImageCare ERP - Stage 2 Final Integrity Migration 0017
-- File: 0017_stage2_branch_business_fk_integrity.sql
-- Version: IMC-STAGE-2-v1.2
-- Purpose: Enforce that every branch_id on a Stage 2 table
--   belongs to the same business as that record.
--
-- Pattern: FOREIGN KEY (business_id, branch_id)
--            REFERENCES imagecare.branches (business_id, id)
--
-- For NOT NULL branch_id: FK fires on every INSERT/UPDATE.
-- For NULLABLE branch_id: FK fires only when branch_id IS NOT NULL.
--   PostgreSQL skips FK check when any part of a composite FK is NULL.
--   This is the correct and desired behaviour - NULL branch_id means
--   the record is business-wide, so no branch ownership check applies.
--
-- ALREADY DONE in 0013:
--   - inventory_movements (business_id, branch_id)
--
-- NOT applicable (no branch_id column, or no business_id column):
--   - units, product_categories, products, accounts, journal_lines
--     (business-wide, not branch-scoped)
--
-- Tables covered here (22 tables: 13 NOT NULL + 8 nullable):
--   NOT NULL: sales, sale_items, purchases, purchase_items,
--             credit_accounts, credit_transactions, invoices,
--             bills, expenses, payroll, cash_transactions,
--             journal_entries, notifications (branch required)
--   NULLABLE: customers, suppliers, bank_accounts,
--             sales_targets, audit_logs, sync_queue,
--             storage_metadata, settings
--
-- Depends on: 0016_stage2_account_hierarchy_integrity.sql
-- UNIQUE (business_id, id) on branches was added in 0012.
-- Does NOT modify previously applied migrations.
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- HELPER: all DO blocks use the same idempotent pattern
-- ============================================================

-- ============================================================
-- NOT NULL branch_id tables
-- ============================================================

-- SALES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_sales_biz_branch') THEN
    ALTER TABLE imagecare.sales
      ADD CONSTRAINT fk_s2_sales_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- SALE_ITEMS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_sale_items_biz_branch') THEN
    ALTER TABLE imagecare.sale_items
      ADD CONSTRAINT fk_s2_sale_items_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- PURCHASES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_purchases_biz_branch') THEN
    ALTER TABLE imagecare.purchases
      ADD CONSTRAINT fk_s2_purchases_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- PURCHASE_ITEMS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_purchase_items_biz_branch') THEN
    ALTER TABLE imagecare.purchase_items
      ADD CONSTRAINT fk_s2_purchase_items_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- CREDIT_ACCOUNTS (NOT NULL branch_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_credit_accounts_biz_branch') THEN
    ALTER TABLE imagecare.credit_accounts
      ADD CONSTRAINT fk_s2_credit_accounts_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- CREDIT_TRANSACTIONS (NOT NULL branch_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_credit_transactions_biz_branch') THEN
    ALTER TABLE imagecare.credit_transactions
      ADD CONSTRAINT fk_s2_credit_transactions_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- INVOICES (NOT NULL branch_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_invoices_biz_branch') THEN
    ALTER TABLE imagecare.invoices
      ADD CONSTRAINT fk_s2_invoices_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- BILLS (NOT NULL branch_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_bills_biz_branch') THEN
    ALTER TABLE imagecare.bills
      ADD CONSTRAINT fk_s2_bills_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- EXPENSES (NOT NULL branch_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_expenses_biz_branch') THEN
    ALTER TABLE imagecare.expenses
      ADD CONSTRAINT fk_s2_expenses_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- PAYROLL (NOT NULL branch_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_payroll_biz_branch') THEN
    ALTER TABLE imagecare.payroll
      ADD CONSTRAINT fk_s2_payroll_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- CASH_TRANSACTIONS (NOT NULL branch_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_cash_transactions_biz_branch') THEN
    ALTER TABLE imagecare.cash_transactions
      ADD CONSTRAINT fk_s2_cash_transactions_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- JOURNAL_ENTRIES (NOT NULL branch_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_journal_entries_biz_branch') THEN
    ALTER TABLE imagecare.journal_entries
      ADD CONSTRAINT fk_s2_journal_entries_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- NOTIFICATIONS (NOT NULL branch_id in schema - actually nullable, corrected below)
-- Checking actual column definition:
-- notifications.branch_id is NULLABLE (REFERENCES imagecare.branches(id) ON DELETE SET NULL)
-- Treated in the NULLABLE section below.

-- ============================================================
-- NULLABLE branch_id tables
-- FK fires only when branch_id IS NOT NULL.
-- When NULL, record is business-wide - no branch check needed.
-- ============================================================

-- CUSTOMERS (nullable branch_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_customers_biz_branch') THEN
    ALTER TABLE imagecare.customers
      ADD CONSTRAINT fk_s2_customers_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- SUPPLIERS (nullable branch_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_suppliers_biz_branch') THEN
    ALTER TABLE imagecare.suppliers
      ADD CONSTRAINT fk_s2_suppliers_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- BANK_ACCOUNTS (nullable branch_id - branch-optional)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_bank_accounts_biz_branch') THEN
    ALTER TABLE imagecare.bank_accounts
      ADD CONSTRAINT fk_s2_bank_accounts_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- SALES_TARGETS (nullable branch_id - may be user-level target without branch)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_sales_targets_biz_branch') THEN
    ALTER TABLE imagecare.sales_targets
      ADD CONSTRAINT fk_s2_sales_targets_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- AUDIT_LOGS (nullable branch_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_audit_logs_biz_branch') THEN
    ALTER TABLE imagecare.audit_logs
      ADD CONSTRAINT fk_s2_audit_logs_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- SYNC_QUEUE (nullable branch_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_sync_queue_biz_branch') THEN
    ALTER TABLE imagecare.sync_queue
      ADD CONSTRAINT fk_s2_sync_queue_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- NOTIFICATIONS (nullable branch_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_notifications_biz_branch') THEN
    ALTER TABLE imagecare.notifications
      ADD CONSTRAINT fk_s2_notifications_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- STORAGE_METADATA (nullable branch_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_storage_metadata_biz_branch') THEN
    ALTER TABLE imagecare.storage_metadata
      ADD CONSTRAINT fk_s2_storage_metadata_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- SETTINGS (nullable branch_id - NULL means business-wide setting)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_settings_biz_branch') THEN
    ALTER TABLE imagecare.settings
      ADD CONSTRAINT fk_s2_settings_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- Tables reviewed and intentionally excluded:
-- - units              (no branch_id column)
-- - product_categories (no branch_id column)
-- - products           (no branch_id column)
-- - accounts           (no branch_id column - business-wide CoA)
-- - journal_lines      (no branch_id column - inherits from entry)
-- - invoice_items      (no branch_id column)
-- - loyalty_accounts   (no branch_id column)
-- - loyalty_transactions (no branch_id column)
-- - inventory_movements (already done in 0013)
-- ============================================================

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-2-0017',
  'Stage 2 Final: branch/business composite FKs on all branch-scoped tables',
  'system', FALSE, NULL, NULL
);
END $$;
