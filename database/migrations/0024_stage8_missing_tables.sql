-- ============================================================
-- ImageCare ERP - Stage 8 Migration 0024
-- File: 0024_stage8_missing_tables.sql
-- Version: IMC-STAGE-8-0024
-- Purpose: Phase 8 (nonexistent table references) audit found two
--   tables referenced by live, wired frontend features that do not
--   exist in the live schema or any earlier tracked migration:
--     - expense_categories  (settingsService.listExpenseCategories /
--       createExpenseCategory, useExpensesData.useArchiveExpenseCategory)
--     - customer_notes      (masterDataService.listCustomerNotes /
--       addCustomerNote, CustomerDetailPage / CustomerTimeline)
--   Both are genuinely used by pages already wired to real services
--   (not legacy/dead code), and both need real CRUD (create + list +
--   archive/list-by-customer), so per the implementation pass's rule
--   ("implement the minimum required structure OR clearly mark as
--   not-yet-implemented - never invent fake persistence") this adds
--   the minimum required structure rather than papering over the
--   missing tables with silent empty-array fallbacks.
--
--   Note: imagecare.expenses.category remains free TEXT by design
--   (see 0009_stage2_financial.sql) - expense_categories is a
--   non-authoritative suggestion/management list for that free-text
--   field, not a foreign key relationship. Expense creation is not
--   changed by this migration.
--
-- Depends on: 0009_stage2_financial.sql (expenses), 0005_stage2_parties.sql (customers)
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- EXPENSE CATEGORIES
-- User-managed suggestion list for imagecare.expenses.category
-- (which stays free TEXT - this is not an FK relationship).
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.expense_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID        REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_s8_expense_category_name UNIQUE (business_id, name)
);

CREATE INDEX IF NOT EXISTS idx_s8_expense_categories_business
  ON imagecare.expense_categories (business_id) WHERE is_active = TRUE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s8_expense_categories_updated_at') THEN
    CREATE TRIGGER tg_s8_expense_categories_updated_at
      BEFORE UPDATE ON imagecare.expense_categories
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s8_expense_categories_select ON imagecare.expense_categories;
CREATE POLICY rls_s8_expense_categories_select ON imagecare.expense_categories
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s8_expense_categories_modify ON imagecare.expense_categories;
CREATE POLICY rls_s8_expense_categories_modify ON imagecare.expense_categories
  FOR ALL USING (business_id = imagecare.fn_current_business_id());

-- ============================================================
-- CUSTOMER NOTES
-- Free-text notes attached to a customer (CustomerDetailPage /
-- CustomerTimeline). Immutable log, not editable once created.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.customer_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  customer_id UUID        NOT NULL REFERENCES imagecare.customers(id)  ON DELETE CASCADE,
  note        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID        REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT chk_s8_customer_note_not_blank CHECK (length(trim(note)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_s8_customer_notes_customer
  ON imagecare.customer_notes (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_s8_customer_notes_business
  ON imagecare.customer_notes (business_id);

ALTER TABLE imagecare.customer_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s8_customer_notes_select ON imagecare.customer_notes;
CREATE POLICY rls_s8_customer_notes_select ON imagecare.customer_notes
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s8_customer_notes_insert ON imagecare.customer_notes;
CREATE POLICY rls_s8_customer_notes_insert ON imagecare.customer_notes
  FOR INSERT WITH CHECK (business_id = imagecare.fn_current_business_id());

-- ============================================================
-- GRANTS
-- Mirror the authenticated-role table grants from 0021 for the two
-- new tables (that migration predates these tables' existence).
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON imagecare.expense_categories TO authenticated;
GRANT SELECT, INSERT             ON imagecare.customer_notes      TO authenticated;

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-8-0024',
  'Stage 8: Add expense_categories and customer_notes tables (Phase 8 - nonexistent table references)',
  'system', FALSE, NULL, NULL
);
END $$;
