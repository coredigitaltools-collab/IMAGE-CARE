-- ============================================================
-- ImageCare ERP - Stage 2 Correction Migration 0014
-- File: 0014_stage2_journal_line_account_integrity.sql
-- Version: IMC-STAGE-2-v1.1
-- Purpose:
--   1. Add account_id FK on journal_lines referencing imagecare.accounts.
--   2. Enforce journal_lines.business_id must match
--      parent journal_entries.business_id.
--   3. Enforce journal_lines.account_id must belong to same
--      business as the journal entry.
--
-- These corrections make the accounting engine self-consistent
-- at the database level, not just at the application level.
--
-- Depends on: 0013_stage2_cross_business_fk_integrity.sql
-- Does NOT modify previously applied migrations.
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- 1. Add account_id column to journal_lines
-- References the authoritative accounts table.
-- account_code and account_name are kept for denormalized
-- readability in reports (spec requirement) but account_id
-- is now the authoritative reference.
-- account_id is nullable for backwards compatibility with
-- any draft lines that predate this migration; the
-- application engine must set it on new lines.
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'imagecare'
      AND table_name   = 'journal_lines'
      AND column_name  = 'account_id'
  ) THEN
    ALTER TABLE imagecare.journal_lines
      ADD COLUMN account_id UUID REFERENCES imagecare.accounts(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Composite FK: account must belong to the same business as the line
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_s2_journal_lines_biz_account'
  ) THEN
    ALTER TABLE imagecare.journal_lines
      ADD CONSTRAINT fk_s2_journal_lines_biz_account
      FOREIGN KEY (business_id, account_id)
      REFERENCES imagecare.accounts (business_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_s2_journal_lines_account_id
  ON imagecare.journal_lines (account_id) WHERE account_id IS NOT NULL;

-- ============================================================
-- 2. TRIGGER: enforce journal_lines.business_id matches parent
--    journal_entries.business_id, and account belongs to same business.
-- ============================================================
CREATE OR REPLACE FUNCTION imagecare.fn_check_journal_line_integrity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_entry_business_id UUID;
  v_account_business_id UUID;
BEGIN
  -- Check: journal_lines.business_id must match parent entry's business_id
  SELECT business_id INTO v_entry_business_id
    FROM imagecare.journal_entries
   WHERE id = NEW.journal_entry_id;

  IF v_entry_business_id IS DISTINCT FROM NEW.business_id THEN
    RAISE EXCEPTION
      'IMC-INTEGRITY: journal_lines.business_id (%) does not match journal_entries.business_id (%) for entry_id %',
      NEW.business_id, v_entry_business_id, NEW.journal_entry_id;
  END IF;

  -- Check: if account_id is provided, it must belong to the same business
  IF NEW.account_id IS NOT NULL THEN
    SELECT business_id INTO v_account_business_id
      FROM imagecare.accounts
     WHERE id = NEW.account_id;

    IF v_account_business_id IS DISTINCT FROM NEW.business_id THEN
      RAISE EXCEPTION
        'IMC-INTEGRITY: journal_lines.account_id (%) belongs to business % but journal line is for business %',
        NEW.account_id, v_account_business_id, NEW.business_id;
    END IF;

    -- Check: account_code must match the authoritative account record
    -- (prevents mismatched denormalized values)
    DECLARE
      v_auth_code TEXT;
    BEGIN
      SELECT account_code INTO v_auth_code
        FROM imagecare.accounts WHERE id = NEW.account_id;

      IF NEW.account_code IS DISTINCT FROM v_auth_code THEN
        RAISE EXCEPTION
          'IMC-INTEGRITY: journal_lines.account_code (%) does not match accounts.account_code (%) for account_id %',
          NEW.account_code, v_auth_code, NEW.account_id;
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_journal_line_integrity') THEN
    CREATE TRIGGER tg_s2_journal_line_integrity
      BEFORE INSERT OR UPDATE ON imagecare.journal_lines
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_check_journal_line_integrity();
  END IF;
END $$;

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-2-0014',
  'Stage 2 Correction: journal_lines account_id FK, business_id consistency trigger',
  'system', FALSE, NULL, NULL
);
END $$;
