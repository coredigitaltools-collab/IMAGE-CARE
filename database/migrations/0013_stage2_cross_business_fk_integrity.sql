-- ============================================================
-- ImageCare ERP - Stage 2 Correction Migration 0013
-- File: 0013_stage2_cross_business_fk_integrity.sql
-- Version: IMC-STAGE-2-v1.1
-- Purpose: Enforce cross-business referential integrity.
--
-- Problem: A child table with both business_id and a FK to a
-- parent (e.g. sale_id) can silently reference a parent row
-- from a different business. RLS prevents reads but does not
-- prevent an INSERT that mixes business A's sale_id with
-- business B's business_id.
--
-- Solution: Composite foreign keys of the form:
--   (child.business_id, child.parent_id)
--     REFERENCES parent (business_id, id)
-- This is enforced at the PostgreSQL constraint level,
-- independently of RLS. It fires on INSERT and UPDATE.
--
-- All composite unique constraints on parent tables were
-- created in 0012. This migration adds the composite FKs.
--
-- Depends on: 0012_stage2_accounts_and_composite_uniques.sql
-- Does NOT modify previously applied migrations.
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- HELPER: add composite FK only if not already present
-- ============================================================
-- (All additions below use DO blocks for idempotency)

-- ============================================================
-- sale_items: business_id + sale_id must be same business
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_sale_items_biz_sale'
  ) THEN
    ALTER TABLE imagecare.sale_items
      ADD CONSTRAINT fk_s2_sale_items_biz_sale
      FOREIGN KEY (business_id, sale_id)
      REFERENCES imagecare.sales (business_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- sale_items: business_id + product_id must be same business
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_sale_items_biz_product'
  ) THEN
    ALTER TABLE imagecare.sale_items
      ADD CONSTRAINT fk_s2_sale_items_biz_product
      FOREIGN KEY (business_id, product_id)
      REFERENCES imagecare.products (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ============================================================
-- purchase_items: business_id + purchase_id must be same business
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_purchase_items_biz_purchase'
  ) THEN
    ALTER TABLE imagecare.purchase_items
      ADD CONSTRAINT fk_s2_purchase_items_biz_purchase
      FOREIGN KEY (business_id, purchase_id)
      REFERENCES imagecare.purchases (business_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- purchase_items: business_id + product_id must be same business
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_purchase_items_biz_product'
  ) THEN
    ALTER TABLE imagecare.purchase_items
      ADD CONSTRAINT fk_s2_purchase_items_biz_product
      FOREIGN KEY (business_id, product_id)
      REFERENCES imagecare.products (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ============================================================
-- inventory_movements: business_id + product_id same business
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_invmov_biz_product'
  ) THEN
    ALTER TABLE imagecare.inventory_movements
      ADD CONSTRAINT fk_s2_invmov_biz_product
      FOREIGN KEY (business_id, product_id)
      REFERENCES imagecare.products (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- inventory_movements: business_id + branch_id same business
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_invmov_biz_branch'
  ) THEN
    ALTER TABLE imagecare.inventory_movements
      ADD CONSTRAINT fk_s2_invmov_biz_branch
      FOREIGN KEY (business_id, branch_id)
      REFERENCES imagecare.branches (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ============================================================
-- invoices: business_id + customer_id same business (nullable)
-- Composite FK on nullable columns: only enforced when non-null.
-- PostgreSQL composite FKs with SET NULL work correctly.
-- ============================================================
-- Add a helper business_id column on the nullable FK side
-- is not needed: PostgreSQL handles nullable composite FKs
-- (the FK is only checked when ALL FK columns are non-null).

-- For invoices.customer_id we store the customer's business_id
-- in invoices.business_id - enforce they match via trigger since
-- customer_id is nullable (composite FK requires all cols non-null).
-- Use a check trigger for nullable cross-business references.

-- invoices: sale_id cross-business check
-- sale_id is nullable - use trigger (below) for nullable FKs.

-- ============================================================
-- bills: business_id + supplier_id same business (nullable)
-- bills: business_id + purchase_id same business (nullable)
-- Also via trigger for nullable columns.
-- ============================================================

-- ============================================================
-- For all nullable cross-business references we use a
-- SECURITY DEFINER trigger that fires BEFORE INSERT OR UPDATE.
-- This is the correct pattern when the FK column is nullable
-- (PostgreSQL composite FK only fires when ALL parts are non-null,
-- but we want to enforce even when only some parts are provided).
-- ============================================================

CREATE OR REPLACE FUNCTION imagecare.fn_check_cross_business_refs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ref_business_id UUID;
BEGIN
  -- invoices: customer must belong to same business
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

  -- bills: supplier must belong to same business
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

  -- sales: customer_id must belong to same business
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

  -- purchases: supplier_id must belong to same business
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

  -- credit_transactions: credit_account must belong to same business
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

  -- loyalty_transactions: loyalty_account must belong to same business
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

-- Attach cross-business check triggers
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_xbiz_sales') THEN
    CREATE TRIGGER tg_s2_xbiz_sales
      BEFORE INSERT OR UPDATE ON imagecare.sales
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_check_cross_business_refs();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_xbiz_purchases') THEN
    CREATE TRIGGER tg_s2_xbiz_purchases
      BEFORE INSERT OR UPDATE ON imagecare.purchases
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_check_cross_business_refs();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_xbiz_invoices') THEN
    CREATE TRIGGER tg_s2_xbiz_invoices
      BEFORE INSERT OR UPDATE ON imagecare.invoices
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_check_cross_business_refs();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_xbiz_bills') THEN
    CREATE TRIGGER tg_s2_xbiz_bills
      BEFORE INSERT OR UPDATE ON imagecare.bills
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_check_cross_business_refs();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_xbiz_credit_txns') THEN
    CREATE TRIGGER tg_s2_xbiz_credit_txns
      BEFORE INSERT OR UPDATE ON imagecare.credit_transactions
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_check_cross_business_refs();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_xbiz_loyalty_txns') THEN
    CREATE TRIGGER tg_s2_xbiz_loyalty_txns
      BEFORE INSERT OR UPDATE ON imagecare.loyalty_transactions
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_check_cross_business_refs();
  END IF;
END $$;

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-2-0013',
  'Stage 2 Correction: cross-business composite FK constraints and check triggers',
  'system', FALSE, NULL, NULL
);
END $$;
