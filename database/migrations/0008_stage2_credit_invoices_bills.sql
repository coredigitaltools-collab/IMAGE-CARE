-- ============================================================
-- ImageCare ERP - Stage 2 Migration 0008
-- File: 0008_stage2_credit_invoices_bills.sql
-- Version: IMC-STAGE-2-v1.0
-- Purpose: Credit accounts, invoices, bills, and payment records.
--   - credit_accounts      (customer or supplier credit lines)
--   - credit_transactions  (payments against credit accounts)
--   - invoices             (formal receivables)
--   - invoice_items
--   - bills                (payables)
--
-- Depends on: 0007_stage2_transactions.sql
--
-- RULES:
--   Credit is NOT cash. Receivables are NOT revenue.
--   Customer credit_balance on customers table is updated
--   by trigger on credit_transactions.
--   Supplier outstanding on suppliers table is updated similarly.
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- CREDIT ACCOUNTS
-- Tracks credit extended to a customer OR owed to a supplier.
-- Exactly one of customer_id or supplier_id must be set.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.credit_accounts (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID         NOT NULL REFERENCES imagecare.businesses(id) ON DELETE RESTRICT,
  branch_id       UUID         NOT NULL REFERENCES imagecare.branches(id)   ON DELETE RESTRICT,
  customer_id     UUID         REFERENCES imagecare.customers(id)           ON DELETE CASCADE,
  supplier_id     UUID         REFERENCES imagecare.suppliers(id)           ON DELETE CASCADE,
  credit_limit    NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  due_date        TIMESTAMPTZ,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  notes           TEXT,
  metadata        JSONB        NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,
  updated_by      UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,

  -- Exactly one party
  CONSTRAINT chk_s2_credit_one_party CHECK (
    (customer_id IS NOT NULL AND supplier_id IS NULL) OR
    (supplier_id IS NOT NULL AND customer_id IS NULL)
  ),
  CONSTRAINT chk_s2_credit_limit_nneg   CHECK (credit_limit    >= 0),
  CONSTRAINT chk_s2_credit_balance_nneg CHECK (current_balance >= 0)
);

CREATE INDEX IF NOT EXISTS idx_s2_credit_accounts_business
  ON imagecare.credit_accounts (business_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_credit_accounts_customer
  ON imagecare.credit_accounts (customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_credit_accounts_supplier
  ON imagecare.credit_accounts (supplier_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_credit_accounts_branch
  ON imagecare.credit_accounts (branch_id) WHERE deleted_at IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_credit_accounts_updated_at') THEN
    CREATE TRIGGER tg_s2_credit_accounts_updated_at
      BEFORE UPDATE ON imagecare.credit_accounts
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.credit_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_credit_accounts_select ON imagecare.credit_accounts;
CREATE POLICY rls_s2_credit_accounts_select ON imagecare.credit_accounts
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s2_credit_accounts_modify ON imagecare.credit_accounts;
CREATE POLICY rls_s2_credit_accounts_modify ON imagecare.credit_accounts
  FOR ALL USING (business_id = imagecare.fn_current_business_id());

-- ============================================================
-- CREDIT TRANSACTIONS
-- Each payment against a credit account creates a row here.
-- credit_account.current_balance is updated by trigger.
-- Also updates customers.credit_balance or suppliers.outstanding.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.credit_transactions (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        UUID         NOT NULL REFERENCES imagecare.businesses(id)    ON DELETE RESTRICT,
  branch_id          UUID         NOT NULL REFERENCES imagecare.branches(id)      ON DELETE RESTRICT,
  credit_account_id  UUID         NOT NULL REFERENCES imagecare.credit_accounts(id) ON DELETE RESTRICT,
  -- sale_id or purchase_id that created this credit obligation (nullable)
  sale_id            UUID         REFERENCES imagecare.sales(id)     ON DELETE SET NULL,
  purchase_id        UUID         REFERENCES imagecare.purchases(id) ON DELETE SET NULL,
  transaction_type   TEXT         NOT NULL,  -- 'charge' (credit used) or 'payment' (credit repaid)
  amount             NUMERIC(14,2) NOT NULL,
  payment_method     imagecare.payment_method,
  reference_number   TEXT,
  notes              TEXT,
  transaction_date   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by         UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT chk_s2_credit_txn_amount_pos CHECK (amount > 0),
  CONSTRAINT chk_s2_credit_txn_type CHECK (
    transaction_type IN ('charge', 'payment')
  )
);

CREATE INDEX IF NOT EXISTS idx_s2_credit_txns_business
  ON imagecare.credit_transactions (business_id);
CREATE INDEX IF NOT EXISTS idx_s2_credit_txns_account
  ON imagecare.credit_transactions (credit_account_id);
CREATE INDEX IF NOT EXISTS idx_s2_credit_txns_date
  ON imagecare.credit_transactions (transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_s2_credit_txns_sale
  ON imagecare.credit_transactions (sale_id) WHERE sale_id IS NOT NULL;

ALTER TABLE imagecare.credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_credit_txns_select ON imagecare.credit_transactions;
CREATE POLICY rls_s2_credit_txns_select ON imagecare.credit_transactions
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s2_credit_txns_insert ON imagecare.credit_transactions;
CREATE POLICY rls_s2_credit_txns_insert ON imagecare.credit_transactions
  FOR INSERT WITH CHECK (business_id = imagecare.fn_current_business_id());

-- Credit transactions are immutable once created

-- ============================================================
-- TRIGGER: update credit_account.current_balance
-- and the denormalized balance on customers/suppliers
-- ============================================================
CREATE OR REPLACE FUNCTION imagecare.fn_update_credit_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_delta        NUMERIC(14,2);
  v_account      imagecare.credit_accounts%ROWTYPE;
BEGIN
  -- Determine balance delta
  IF NEW.transaction_type = 'charge' THEN
    v_delta := NEW.amount;       -- balance increases when credit used
  ELSE
    v_delta := -NEW.amount;      -- balance decreases when payment made
  END IF;

  -- Update credit_account.current_balance
  UPDATE imagecare.credit_accounts
  SET current_balance = GREATEST(0, current_balance + v_delta),
      updated_at      = NOW()
  WHERE id = NEW.credit_account_id
  RETURNING * INTO v_account;

  -- Update denormalized balance on customers or suppliers
  IF v_account.customer_id IS NOT NULL THEN
    UPDATE imagecare.customers
    SET credit_balance = GREATEST(0, credit_balance + v_delta),
        updated_at     = NOW()
    WHERE id = v_account.customer_id;
  ELSIF v_account.supplier_id IS NOT NULL THEN
    UPDATE imagecare.suppliers
    SET outstanding = GREATEST(0, outstanding + v_delta),
        updated_at  = NOW()
    WHERE id = v_account.supplier_id;
  END IF;

  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_credit_txn_balance') THEN
    CREATE TRIGGER tg_s2_credit_txn_balance
      AFTER INSERT ON imagecare.credit_transactions
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_update_credit_balance();
  END IF;
END $$;

-- ============================================================
-- INVOICES
-- Formal receivable documents issued to customers.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.invoices (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID         NOT NULL REFERENCES imagecare.businesses(id) ON DELETE RESTRICT,
  branch_id        UUID         NOT NULL REFERENCES imagecare.branches(id)   ON DELETE RESTRICT,
  customer_id      UUID         REFERENCES imagecare.customers(id)           ON DELETE SET NULL,
  sale_id          UUID         REFERENCES imagecare.sales(id)               ON DELETE SET NULL,
  invoice_number   TEXT         NOT NULL,
  invoice_date     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  due_date         TIMESTAMPTZ,
  -- status: unpaid, partial, paid, overdue, voided
  status           TEXT         NOT NULL DEFAULT 'unpaid',
  subtotal         NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid      NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due      NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes            TEXT,
  metadata         JSONB        NOT NULL DEFAULT '{}',
  journal_entry_id UUID,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  created_by       UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,
  updated_by       UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_s2_invoice_number_per_business UNIQUE (business_id, invoice_number),
  CONSTRAINT chk_s2_invoice_total_nneg   CHECK (total_amount >= 0),
  CONSTRAINT chk_s2_invoice_paid_nneg    CHECK (amount_paid  >= 0),
  CONSTRAINT chk_s2_invoice_balance_nneg CHECK (balance_due  >= 0)
);

CREATE INDEX IF NOT EXISTS idx_s2_invoices_business  ON imagecare.invoices (business_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_invoices_branch    ON imagecare.invoices (branch_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_invoices_customer  ON imagecare.invoices (customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_invoices_date      ON imagecare.invoices (invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_s2_invoices_due       ON imagecare.invoices (due_date)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_invoices_status    ON imagecare.invoices (status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_invoices_updated_at') THEN
    CREATE TRIGGER tg_s2_invoices_updated_at
      BEFORE UPDATE ON imagecare.invoices
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_invoices_select ON imagecare.invoices;
CREATE POLICY rls_s2_invoices_select ON imagecare.invoices
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS rls_s2_invoices_modify ON imagecare.invoices;
CREATE POLICY rls_s2_invoices_modify ON imagecare.invoices
  FOR ALL USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

-- ============================================================
-- INVOICE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.invoice_items (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID         NOT NULL REFERENCES imagecare.invoices(id)    ON DELETE CASCADE,
  business_id     UUID         NOT NULL REFERENCES imagecare.businesses(id)  ON DELETE RESTRICT,
  product_id      UUID         REFERENCES imagecare.products(id)             ON DELETE SET NULL,
  description     TEXT         NOT NULL,
  quantity        NUMERIC(14,4) NOT NULL,
  unit_price      NUMERIC(14,2) NOT NULL,
  discount_pct    NUMERIC(6,4)  NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate        NUMERIC(6,4)  NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total      NUMERIC(14,2) NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_s2_invoice_item_qty_pos    CHECK (quantity   > 0),
  CONSTRAINT chk_s2_invoice_item_price_nneg CHECK (unit_price >= 0),
  CONSTRAINT chk_s2_invoice_item_total_nneg CHECK (line_total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_s2_invoice_items_invoice ON imagecare.invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_s2_invoice_items_product ON imagecare.invoice_items (product_id);

ALTER TABLE imagecare.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_invoice_items_select ON imagecare.invoice_items;
CREATE POLICY rls_s2_invoice_items_select ON imagecare.invoice_items
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s2_invoice_items_modify ON imagecare.invoice_items;
CREATE POLICY rls_s2_invoice_items_modify ON imagecare.invoice_items
  FOR ALL USING (business_id = imagecare.fn_current_business_id());

-- ============================================================
-- BILLS
-- Payable documents received from suppliers.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.bills (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID         NOT NULL REFERENCES imagecare.businesses(id) ON DELETE RESTRICT,
  branch_id        UUID         NOT NULL REFERENCES imagecare.branches(id)   ON DELETE RESTRICT,
  supplier_id      UUID         REFERENCES imagecare.suppliers(id)           ON DELETE SET NULL,
  purchase_id      UUID         REFERENCES imagecare.purchases(id)           ON DELETE SET NULL,
  bill_number      TEXT         NOT NULL,
  bill_date        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  due_date         TIMESTAMPTZ,
  status           TEXT         NOT NULL DEFAULT 'unpaid',
  subtotal         NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid      NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due      NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes            TEXT,
  metadata         JSONB        NOT NULL DEFAULT '{}',
  journal_entry_id UUID,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  created_by       UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,
  updated_by       UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_s2_bill_number_per_business UNIQUE (business_id, bill_number),
  CONSTRAINT chk_s2_bill_total_nneg   CHECK (total_amount >= 0),
  CONSTRAINT chk_s2_bill_paid_nneg    CHECK (amount_paid  >= 0),
  CONSTRAINT chk_s2_bill_balance_nneg CHECK (balance_due  >= 0)
);

CREATE INDEX IF NOT EXISTS idx_s2_bills_business  ON imagecare.bills (business_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_bills_branch    ON imagecare.bills (branch_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_bills_supplier  ON imagecare.bills (supplier_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_bills_date      ON imagecare.bills (bill_date DESC);
CREATE INDEX IF NOT EXISTS idx_s2_bills_due       ON imagecare.bills (due_date)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_bills_status    ON imagecare.bills (status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_bills_updated_at') THEN
    CREATE TRIGGER tg_s2_bills_updated_at
      BEFORE UPDATE ON imagecare.bills
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_bills_select ON imagecare.bills;
CREATE POLICY rls_s2_bills_select ON imagecare.bills
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS rls_s2_bills_modify ON imagecare.bills;
CREATE POLICY rls_s2_bills_modify ON imagecare.bills
  FOR ALL USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-2-0008',
  'Stage 2: Credit, invoices, bills, credit_transactions trigger',
  'system', FALSE, NULL, NULL
);
END $$;
