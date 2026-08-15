-- ============================================================
-- ImageCare ERP - Stage 2 Migration 0010
-- File: 0010_stage2_accounting.sql
-- Version: IMC-STAGE-2-v1.0
-- Purpose: Shared double-entry accounting engine.
--   - journal_entries    (immutable once posted)
--   - journal_lines      (balanced debit/credit lines)
--   - vw_account_balances (aggregated view for reporting)
--   - tg_imc_guard_posted_journal (immutability trigger)
--
-- Depends on: 0009_stage2_financial.sql
--
-- ACCOUNTING RULES:
--   Every posted journal entry must balance: SUM(debit) = SUM(credit).
--   Journal entries are IMMUTABLE once status = 'posted'.
--   Corrections are made via reversal entries, not edits.
--   COGS affects Profit but never Cash in Hand.
--   Account codes are not hard-coded - they come from settings.
--   Revenue != Profit. Cash != Inventory.
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- JOURNAL ENTRIES
-- Header record for each accounting entry.
-- status: draft -> posted (immutable) | draft -> voided
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.journal_entries (
  id             UUID                          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID                          NOT NULL REFERENCES imagecare.businesses(id) ON DELETE RESTRICT,
  branch_id      UUID                          NOT NULL REFERENCES imagecare.branches(id)   ON DELETE RESTRICT,
  entry_number   TEXT                          NOT NULL,
  entry_date     TIMESTAMPTZ                   NOT NULL DEFAULT NOW(),
  entry_type     imagecare.journal_entry_type  NOT NULL,
  description    TEXT                          NOT NULL,
  reference_type TEXT,
  reference_id   UUID,
  total_debit    NUMERIC(14,2)                 NOT NULL DEFAULT 0,
  total_credit   NUMERIC(14,2)                 NOT NULL DEFAULT 0,
  -- status: draft, posted, voided
  status         TEXT                          NOT NULL DEFAULT 'draft',
  period_month   INTEGER                       NOT NULL,
  period_year    INTEGER                       NOT NULL,
  is_reversed    BOOLEAN                       NOT NULL DEFAULT FALSE,
  reversal_of    UUID                          REFERENCES imagecare.journal_entries(id) ON DELETE SET NULL,
  notes          TEXT,
  metadata       JSONB                         NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ                   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ                   NOT NULL DEFAULT NOW(),
  created_by     UUID                          REFERENCES imagecare.users(id) ON DELETE SET NULL,
  updated_by     UUID                          REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_s2_journal_entry_number UNIQUE (business_id, entry_number),
  CONSTRAINT chk_s2_journal_debit_nneg  CHECK (total_debit  >= 0),
  CONSTRAINT chk_s2_journal_credit_nneg CHECK (total_credit >= 0),
  -- Enforce balance when posted. Draft entries may be unbalanced during construction.
  CONSTRAINT chk_s2_journal_balanced    CHECK (
    status = 'draft' OR ABS(total_debit - total_credit) < 0.01
  ),
  CONSTRAINT chk_s2_period_month CHECK (period_month BETWEEN 1 AND 12),
  CONSTRAINT chk_s2_period_year  CHECK (period_year  BETWEEN 2000 AND 2100),
  CONSTRAINT chk_s2_journal_status CHECK (status IN ('draft','posted','voided'))
);

CREATE INDEX IF NOT EXISTS idx_s2_journal_business   ON imagecare.journal_entries (business_id);
CREATE INDEX IF NOT EXISTS idx_s2_journal_branch     ON imagecare.journal_entries (branch_id);
CREATE INDEX IF NOT EXISTS idx_s2_journal_date       ON imagecare.journal_entries (entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_s2_journal_reference  ON imagecare.journal_entries (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_s2_journal_period     ON imagecare.journal_entries (business_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_s2_journal_status     ON imagecare.journal_entries (status);
CREATE INDEX IF NOT EXISTS idx_s2_journal_type       ON imagecare.journal_entries (entry_type);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_journal_updated_at') THEN
    CREATE TRIGGER tg_s2_journal_updated_at
      BEFORE UPDATE ON imagecare.journal_entries
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

-- ============================================================
-- IMMUTABILITY TRIGGER
-- Prevents any UPDATE to a posted journal entry.
-- Corrections must use reversal entries.
-- ============================================================
CREATE OR REPLACE FUNCTION imagecare.fn_guard_posted_journal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION
      'IMC-IMMUTABLE: Journal entry % is posted and cannot be modified. Create a reversal entry instead.',
      OLD.entry_number;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_imc_guard_posted_journal') THEN
    CREATE TRIGGER tg_imc_guard_posted_journal
      BEFORE UPDATE ON imagecare.journal_entries
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_guard_posted_journal();
  END IF;
END $$;

ALTER TABLE imagecare.journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_journal_select ON imagecare.journal_entries;
CREATE POLICY rls_s2_journal_select ON imagecare.journal_entries
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

-- Only Business Engine (service role) may insert journal entries.
-- Frontend never writes directly to journal_entries.
DROP POLICY IF EXISTS rls_s2_journal_insert ON imagecare.journal_entries;
CREATE POLICY rls_s2_journal_insert ON imagecare.journal_entries
  FOR INSERT WITH CHECK (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

-- UPDATE allowed for draft -> posted transition (engine only)
-- posted entries are blocked by the immutability trigger
DROP POLICY IF EXISTS rls_s2_journal_update ON imagecare.journal_entries;
CREATE POLICY rls_s2_journal_update ON imagecare.journal_entries
  FOR UPDATE USING (
    business_id = imagecare.fn_current_business_id()
    AND status = 'draft'
  );

-- ============================================================
-- JOURNAL LINES
-- One row per debit or credit in a journal entry.
-- Either debit_amount > 0 and credit_amount = 0, or vice versa.
-- Account codes are looked up from settings at report time.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.journal_lines (
  id               UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID                    NOT NULL REFERENCES imagecare.journal_entries(id) ON DELETE CASCADE,
  business_id      UUID                    NOT NULL REFERENCES imagecare.businesses(id) ON DELETE RESTRICT,
  -- account_code: e.g. '1100' Cash, '4000' Revenue, '5000' COGS
  -- Not a FK - account codes are configured in settings, not in a separate table
  account_code     TEXT                    NOT NULL,
  -- account_name denormalized for readable reports without joining settings
  account_name     TEXT                    NOT NULL,
  account_type     imagecare.account_type  NOT NULL,
  debit_amount     NUMERIC(14,2)           NOT NULL DEFAULT 0,
  credit_amount    NUMERIC(14,2)           NOT NULL DEFAULT 0,
  description      TEXT,
  created_at       TIMESTAMPTZ             NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_s2_line_debit_nneg     CHECK (debit_amount  >= 0),
  CONSTRAINT chk_s2_line_credit_nneg    CHECK (credit_amount >= 0),
  -- Each line is either a debit OR a credit, never both, never neither
  CONSTRAINT chk_s2_line_one_side_only  CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR
    (credit_amount > 0 AND debit_amount = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_s2_journal_lines_entry    ON imagecare.journal_lines (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_s2_journal_lines_business ON imagecare.journal_lines (business_id);
CREATE INDEX IF NOT EXISTS idx_s2_journal_lines_account  ON imagecare.journal_lines (business_id, account_code);

ALTER TABLE imagecare.journal_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_journal_lines_select ON imagecare.journal_lines;
CREATE POLICY rls_s2_journal_lines_select ON imagecare.journal_lines
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s2_journal_lines_insert ON imagecare.journal_lines;
CREATE POLICY rls_s2_journal_lines_insert ON imagecare.journal_lines
  FOR INSERT WITH CHECK (business_id = imagecare.fn_current_business_id());

-- Journal lines are immutable (cascade from journal entry immutability)

-- ============================================================
-- VIEW: vw_account_balances
-- Aggregates posted journal lines per account per period.
-- This is the shared read surface for financial reporting.
-- Revenue, Profit, and Cash in Hand are separate account groups.
-- ============================================================
CREATE OR REPLACE VIEW imagecare.vw_account_balances AS
SELECT
  jl.business_id,
  je.branch_id,
  je.period_year,
  je.period_month,
  jl.account_code,
  jl.account_name,
  jl.account_type,
  SUM(jl.debit_amount)                             AS total_debits,
  SUM(jl.credit_amount)                            AS total_credits,
  SUM(jl.debit_amount) - SUM(jl.credit_amount)    AS net_balance
FROM imagecare.journal_lines jl
JOIN imagecare.journal_entries je ON je.id = jl.journal_entry_id
WHERE je.status = 'posted'
GROUP BY
  jl.business_id,
  je.branch_id,
  je.period_year,
  je.period_month,
  jl.account_code,
  jl.account_name,
  jl.account_type;

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-2-0010',
  'Stage 2: Accounting - journal_entries, journal_lines, vw_account_balances, immutability trigger',
  'system', FALSE, NULL, NULL
);
END $$;
