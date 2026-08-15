-- ============================================================
-- ImageCare ERP - Stage 2 Migration 0005
-- File: 0005_stage2_parties.sql
-- Version: IMC-STAGE-2-v1.0
-- Purpose: Customer and supplier master records.
--   - customers   (one authoritative record per customer)
--   - suppliers   (one authoritative record per supplier)
--
-- Depends on: 0004_stage2_master_data.sql
-- Master data rules: never duplicate, use soft-delete,
-- historical transactions remain readable when inactive.
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- CUSTOMERS
-- One authoritative record per customer per business.
-- credit_limit and credit_balance live here for fast lookup.
-- Authoritative credit balance derives from credit_transactions
-- (created in 0008). This field is updated by trigger.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.customers (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID         NOT NULL REFERENCES imagecare.businesses(id) ON DELETE RESTRICT,
  -- branch_id: the branch that primarily manages this customer.
  -- Does not restrict which branch can sell to them.
  branch_id       UUID         REFERENCES imagecare.branches(id) ON DELETE SET NULL,
  name            TEXT         NOT NULL,
  code            TEXT,
  phone           TEXT,
  email           TEXT,
  address         JSONB,
  tin             TEXT,
  credit_limit    NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- credit_balance: updated by trigger on credit_transactions insert/update.
  -- Represents outstanding amount owed by customer.
  credit_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  tags            TEXT[],
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  metadata        JSONB        NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,
  updated_by      UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT chk_s2_customer_credit_limit_nneg   CHECK (credit_limit  >= 0),
  CONSTRAINT chk_s2_customer_credit_balance_nneg CHECK (credit_balance >= 0)
);

CREATE INDEX IF NOT EXISTS idx_s2_customers_business
  ON imagecare.customers (business_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_customers_branch
  ON imagecare.customers (branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_customers_name_trgm
  ON imagecare.customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_s2_customers_phone
  ON imagecare.customers (phone) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_customers_active
  ON imagecare.customers (business_id, is_active) WHERE deleted_at IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_customers_updated_at') THEN
    CREATE TRIGGER tg_s2_customers_updated_at
      BEFORE UPDATE ON imagecare.customers
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_customers_select ON imagecare.customers;
CREATE POLICY rls_s2_customers_select ON imagecare.customers
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s2_customers_modify ON imagecare.customers;
CREATE POLICY rls_s2_customers_modify ON imagecare.customers
  FOR ALL USING (business_id = imagecare.fn_current_business_id());

-- ============================================================
-- SUPPLIERS
-- One authoritative record per supplier per business.
-- outstanding: amount owed to supplier. Updated by trigger.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.suppliers (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID         NOT NULL REFERENCES imagecare.businesses(id) ON DELETE RESTRICT,
  branch_id       UUID         REFERENCES imagecare.branches(id) ON DELETE SET NULL,
  name            TEXT         NOT NULL,
  code            TEXT,
  contact_person  TEXT,
  phone           TEXT,
  email           TEXT,
  address         JSONB,
  tin             TEXT,
  -- payment_terms: days before payment is due
  payment_terms   INTEGER      NOT NULL DEFAULT 30,
  credit_limit    NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- outstanding: amount owed TO the supplier. Updated by trigger.
  outstanding     NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  tags            TEXT[],
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  metadata        JSONB        NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,
  updated_by      UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT chk_s2_supplier_payment_terms_nneg CHECK (payment_terms >= 0),
  CONSTRAINT chk_s2_supplier_credit_limit_nneg  CHECK (credit_limit  >= 0),
  CONSTRAINT chk_s2_supplier_outstanding_nneg   CHECK (outstanding   >= 0)
);

CREATE INDEX IF NOT EXISTS idx_s2_suppliers_business
  ON imagecare.suppliers (business_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_suppliers_branch
  ON imagecare.suppliers (branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_suppliers_name_trgm
  ON imagecare.suppliers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_s2_suppliers_active
  ON imagecare.suppliers (business_id, is_active) WHERE deleted_at IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_suppliers_updated_at') THEN
    CREATE TRIGGER tg_s2_suppliers_updated_at
      BEFORE UPDATE ON imagecare.suppliers
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_suppliers_select ON imagecare.suppliers;
CREATE POLICY rls_s2_suppliers_select ON imagecare.suppliers
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s2_suppliers_modify ON imagecare.suppliers;
CREATE POLICY rls_s2_suppliers_modify ON imagecare.suppliers
  FOR ALL USING (business_id = imagecare.fn_current_business_id());

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-2-0005',
  'Stage 2: Parties - customers, suppliers',
  'system', FALSE, NULL, NULL
);
END $$;
