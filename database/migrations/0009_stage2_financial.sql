-- ============================================================
-- ImageCare ERP - Stage 2 Migration 0009
-- File: 0009_stage2_financial.sql
-- Version: IMC-STAGE-2-v1.0
-- Purpose: Financial domain tables.
--   - expenses         (operational expenses)
--   - payroll          (pay records per employee per period)
--   - bank_accounts    (business bank/mobile money accounts)
--   - cash_transactions (petty cash and float movements)
--
-- Depends on: 0008_stage2_credit_invoices_bills.sql
--
-- ACCOUNTING RULES:
--   Expenses reduce net profit but do NOT affect Cash in Hand
--   unless payment_method = cash.
--   Payroll is an expense. PAYE and NSSF are liabilities.
--   Cash in Hand derives from cash_transactions, NOT from sales.
--   Bank balance is separate from Cash in Hand.
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- EXPENSES
-- Operational costs not linked to purchase orders.
-- Categories are user-defined (no fixed list).
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.expenses (
  id               UUID                         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID                         NOT NULL REFERENCES imagecare.businesses(id) ON DELETE RESTRICT,
  branch_id        UUID                         NOT NULL REFERENCES imagecare.branches(id)   ON DELETE RESTRICT,
  incurred_by      UUID                         REFERENCES imagecare.users(id)               ON DELETE SET NULL,
  expense_number   TEXT                         NOT NULL,
  expense_date     TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  -- category is user-defined text: 'Utilities', 'Rent', 'Transport', etc.
  category         TEXT                         NOT NULL,
  description      TEXT                         NOT NULL,
  amount           NUMERIC(14,2)                NOT NULL,
  tax_amount       NUMERIC(14,2)                NOT NULL DEFAULT 0,
  total_amount     NUMERIC(14,2)                NOT NULL,
  payment_method   imagecare.payment_method     NOT NULL DEFAULT 'cash',
  receipt_url      TEXT,
  is_recurring     BOOLEAN                      NOT NULL DEFAULT FALSE,
  recurrence_rule  JSONB,
  status           imagecare.transaction_status NOT NULL DEFAULT 'confirmed',
  notes            TEXT,
  metadata         JSONB                        NOT NULL DEFAULT '{}',
  journal_entry_id UUID,
  created_at       TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  created_by       UUID                         REFERENCES imagecare.users(id) ON DELETE SET NULL,
  updated_by       UUID                         REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_s2_expense_number_per_business UNIQUE (business_id, expense_number),
  CONSTRAINT chk_s2_expense_amount_pos         CHECK (amount       > 0),
  CONSTRAINT chk_s2_expense_tax_nneg           CHECK (tax_amount  >= 0),
  CONSTRAINT chk_s2_expense_total_pos          CHECK (total_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_s2_expenses_business  ON imagecare.expenses (business_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_expenses_branch    ON imagecare.expenses (branch_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_expenses_date      ON imagecare.expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_s2_expenses_category  ON imagecare.expenses (business_id, category);
CREATE INDEX IF NOT EXISTS idx_s2_expenses_status    ON imagecare.expenses (status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_expenses_updated_at') THEN
    CREATE TRIGGER tg_s2_expenses_updated_at
      BEFORE UPDATE ON imagecare.expenses
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_expenses_select ON imagecare.expenses;
CREATE POLICY rls_s2_expenses_select ON imagecare.expenses
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS rls_s2_expenses_modify ON imagecare.expenses;
CREATE POLICY rls_s2_expenses_modify ON imagecare.expenses
  FOR ALL USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

-- ============================================================
-- PAYROLL
-- One record per employee per pay period.
-- Salary structure is not hard-coded.
-- gross_pay = basic_salary + allowances + overtime_pay
-- net_pay   = gross_pay - total_deductions
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.payroll (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID         NOT NULL REFERENCES imagecare.businesses(id) ON DELETE RESTRICT,
  branch_id        UUID         NOT NULL REFERENCES imagecare.branches(id)   ON DELETE RESTRICT,
  user_id          UUID         NOT NULL REFERENCES imagecare.users(id)      ON DELETE RESTRICT,
  payroll_number   TEXT         NOT NULL,
  pay_period_start DATE         NOT NULL,
  pay_period_end   DATE         NOT NULL,
  pay_date         DATE         NOT NULL,
  basic_salary     NUMERIC(14,2) NOT NULL DEFAULT 0,
  allowances       NUMERIC(14,2) NOT NULL DEFAULT 0,
  overtime_pay     NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_pay        NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- Uganda statutory deductions
  tax_deduction    NUMERIC(14,2) NOT NULL DEFAULT 0,   -- PAYE
  nssf_deduction   NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_pay          NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_method   imagecare.payment_method NOT NULL DEFAULT 'bank_transfer',
  -- status: pending, approved, paid, cancelled
  status           TEXT         NOT NULL DEFAULT 'pending',
  notes            TEXT,
  -- metadata stores full deduction breakdown for audit
  metadata         JSONB        NOT NULL DEFAULT '{}',
  journal_entry_id UUID,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  created_by       UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,
  updated_by       UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_s2_payroll_number_per_business UNIQUE (business_id, payroll_number),
  CONSTRAINT chk_s2_payroll_period_order       CHECK (pay_period_end   >= pay_period_start),
  CONSTRAINT chk_s2_payroll_gross_nneg         CHECK (gross_pay        >= 0),
  CONSTRAINT chk_s2_payroll_deductions_nneg    CHECK (total_deductions >= 0),
  CONSTRAINT chk_s2_payroll_net_nneg           CHECK (net_pay          >= 0)
);

CREATE INDEX IF NOT EXISTS idx_s2_payroll_business ON imagecare.payroll (business_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_payroll_branch   ON imagecare.payroll (branch_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_payroll_user     ON imagecare.payroll (user_id)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_payroll_period   ON imagecare.payroll (pay_period_start, pay_period_end);
CREATE INDEX IF NOT EXISTS idx_s2_payroll_status   ON imagecare.payroll (status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_payroll_updated_at') THEN
    CREATE TRIGGER tg_s2_payroll_updated_at
      BEFORE UPDATE ON imagecare.payroll
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.payroll ENABLE ROW LEVEL SECURITY;

-- Payroll is sensitive: owner and explicit approve-permission only
DROP POLICY IF EXISTS rls_s2_payroll_select ON imagecare.payroll;
CREATE POLICY rls_s2_payroll_select ON imagecare.payroll
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
    AND (
      imagecare.fn_is_business_owner(business_id)
      -- non-owners see only their own payroll record
      OR user_id = imagecare.fn_current_user_id()
    )
  );

DROP POLICY IF EXISTS rls_s2_payroll_modify ON imagecare.payroll;
CREATE POLICY rls_s2_payroll_modify ON imagecare.payroll
  FOR ALL USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_is_business_owner(business_id)
  );

-- ============================================================
-- BANK ACCOUNTS
-- Business bank and mobile money accounts.
-- current_balance is updated by cash_transactions trigger.
-- Conceptually SEPARATE from cash-in-hand (petty cash).
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.bank_accounts (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID         NOT NULL REFERENCES imagecare.businesses(id) ON DELETE RESTRICT,
  branch_id       UUID         REFERENCES imagecare.branches(id)            ON DELETE SET NULL,
  bank_name       TEXT         NOT NULL,
  account_name    TEXT         NOT NULL,
  account_number  TEXT         NOT NULL,
  -- account_type: current, savings, mobile_money
  account_type    TEXT         NOT NULL DEFAULT 'current',
  currency        TEXT         NOT NULL DEFAULT 'UGX',
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  notes           TEXT,
  metadata        JSONB        NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,
  updated_by      UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_s2_bank_account_per_business UNIQUE (business_id, account_number)
);

CREATE INDEX IF NOT EXISTS idx_s2_bank_accounts_business
  ON imagecare.bank_accounts (business_id) WHERE deleted_at IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_bank_accounts_updated_at') THEN
    CREATE TRIGGER tg_s2_bank_accounts_updated_at
      BEFORE UPDATE ON imagecare.bank_accounts
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_bank_accounts_select ON imagecare.bank_accounts;
CREATE POLICY rls_s2_bank_accounts_select ON imagecare.bank_accounts
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s2_bank_accounts_modify ON imagecare.bank_accounts;
CREATE POLICY rls_s2_bank_accounts_modify ON imagecare.bank_accounts
  FOR ALL USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_is_business_owner(business_id)
  );

-- ============================================================
-- CASH TRANSACTIONS
-- Petty cash, float movements, POS cash in/out.
-- RULE: Cash in Hand derives from this table, NOT from sales.
-- Each confirmed sale creates a cash_transaction when paid cash.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.cash_transactions (
  id                 UUID                         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        UUID                         NOT NULL REFERENCES imagecare.businesses(id) ON DELETE RESTRICT,
  branch_id          UUID                         NOT NULL REFERENCES imagecare.branches(id)   ON DELETE RESTRICT,
  bank_account_id    UUID                         REFERENCES imagecare.bank_accounts(id)       ON DELETE SET NULL,
  transaction_number TEXT                         NOT NULL,
  transaction_date   TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  -- type: cash_in, cash_out, deposit, withdrawal, transfer
  transaction_type   TEXT                         NOT NULL,
  amount             NUMERIC(14,2)                NOT NULL,
  reference_type     TEXT,
  reference_id       UUID,
  description        TEXT                         NOT NULL,
  payment_method     imagecare.payment_method     NOT NULL DEFAULT 'cash',
  status             imagecare.transaction_status NOT NULL DEFAULT 'confirmed',
  notes              TEXT,
  metadata           JSONB                        NOT NULL DEFAULT '{}',
  journal_entry_id   UUID,
  created_at         TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ,
  created_by         UUID                         REFERENCES imagecare.users(id) ON DELETE SET NULL,
  updated_by         UUID                         REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_s2_cash_txn_number_per_business UNIQUE (business_id, transaction_number),
  CONSTRAINT chk_s2_cash_txn_amount_pos          CHECK (amount > 0),
  CONSTRAINT chk_s2_cash_txn_type CHECK (
    transaction_type IN ('cash_in','cash_out','deposit','withdrawal','transfer')
  )
);

CREATE INDEX IF NOT EXISTS idx_s2_cash_txns_business   ON imagecare.cash_transactions (business_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_cash_txns_branch     ON imagecare.cash_transactions (branch_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_cash_txns_date       ON imagecare.cash_transactions (transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_s2_cash_txns_reference  ON imagecare.cash_transactions (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_s2_cash_txns_type       ON imagecare.cash_transactions (transaction_type);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_cash_txns_updated_at') THEN
    CREATE TRIGGER tg_s2_cash_txns_updated_at
      BEFORE UPDATE ON imagecare.cash_transactions
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.cash_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_cash_txns_select ON imagecare.cash_transactions;
CREATE POLICY rls_s2_cash_txns_select ON imagecare.cash_transactions
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS rls_s2_cash_txns_modify ON imagecare.cash_transactions;
CREATE POLICY rls_s2_cash_txns_modify ON imagecare.cash_transactions
  FOR ALL USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-2-0009',
  'Stage 2: Financial - expenses, payroll, bank_accounts, cash_transactions',
  'system', FALSE, NULL, NULL
);
END $$;
