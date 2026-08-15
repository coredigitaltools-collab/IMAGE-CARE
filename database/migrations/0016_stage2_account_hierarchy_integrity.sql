-- ============================================================
-- ImageCare ERP - Stage 2 Final Integrity Migration 0016
-- File: 0016_stage2_account_hierarchy_integrity.sql
-- Version: IMC-STAGE-2-v1.2
-- Purpose: Prevent an account belonging to Business A from
--   having a parent account belonging to Business B.
--
-- Approach:
--   1. Add a redundant business_id column for the parent side
--      to anchor the composite FK. Because parent_account_id is
--      nullable, we need a nullable business_id anchor column on
--      the same row for the composite FK to work.
--
--      HOWEVER: the parent and child both already have the same
--      business_id on the same row. PostgreSQL can enforce:
--        FOREIGN KEY (business_id, parent_account_id)
--          REFERENCES accounts (business_id, id)
--      This fires only when parent_account_id IS NOT NULL
--      (PostgreSQL skips FK check when any part of the FK is NULL).
--      When parent_account_id IS NULL, no parent reference exists
--      and no check is needed. This is exactly correct.
--
--   2. UNIQUE (business_id, id) already added on accounts in 0012.
--      The composite FK can therefore be added directly.
--
--   3. A BEFORE INSERT OR UPDATE trigger additionally checks at
--      the function level and raises a descriptive error for
--      clarity (belt-and-suspenders approach).
--
-- Depends on: 0015_stage2_credit_balance_correction.sql
-- Does NOT modify previously applied migrations.
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- COMPOSITE FK: accounts (business_id, parent_account_id)
-- References accounts (business_id, id).
-- Enforced at PostgreSQL constraint level, independently of RLS.
-- When parent_account_id IS NULL the FK is not checked.
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_s2_accounts_biz_parent'
  ) THEN
    ALTER TABLE imagecare.accounts
      ADD CONSTRAINT fk_s2_accounts_biz_parent
      FOREIGN KEY (business_id, parent_account_id)
      REFERENCES imagecare.accounts (business_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- TRIGGER: explicit error for cross-business parent assignment
-- Belt-and-suspenders: the composite FK above is the primary
-- enforcement. This trigger provides a descriptive exception
-- message that identifies the business mismatch clearly.
-- ============================================================
CREATE OR REPLACE FUNCTION imagecare.fn_check_account_hierarchy_integrity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_parent_business_id UUID;
BEGIN
  -- Only check when parent_account_id is set
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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tg_s2_account_hierarchy_integrity'
  ) THEN
    CREATE TRIGGER tg_s2_account_hierarchy_integrity
      BEFORE INSERT OR UPDATE ON imagecare.accounts
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_check_account_hierarchy_integrity();
  END IF;
END $$;

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-2-0016',
  'Stage 2 Final: account hierarchy composite FK - prevents cross-business parent accounts',
  'system', FALSE, NULL, NULL
);
END $$;
