-- ============================================================
-- ImageCare ERP - Stage 2 Migration 0007
-- File: 0007_stage2_transactions.sql
-- Version: IMC-STAGE-2-v1.0
-- Purpose: Sales and purchasing transaction foundations.
--   - sales           (sale headers)
--   - sale_items      (sale line items)
--   - purchases       (purchase headers)
--   - purchase_items  (purchase line items)
--
-- Depends on: 0006_stage2_inventory.sql
--
-- RULES:
--   Historical unit_price and unit_cost are SNAPSHOTTED at
--   transaction time. Changing product prices does not alter
--   posted transaction records.
--   journal_entry_id is set by the Business Engine after posting.
--   status transitions are enforced by the Business Engine.
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- SALES
-- Header record for each sale transaction.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.sales (
  id               UUID                         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID                         NOT NULL REFERENCES imagecare.businesses(id) ON DELETE RESTRICT,
  branch_id        UUID                         NOT NULL REFERENCES imagecare.branches(id)   ON DELETE RESTRICT,
  customer_id      UUID                         REFERENCES imagecare.customers(id)           ON DELETE SET NULL,
  served_by        UUID                         REFERENCES imagecare.users(id)               ON DELETE SET NULL,
  sale_number      TEXT                         NOT NULL,
  sale_date        TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  status           imagecare.transaction_status NOT NULL DEFAULT 'draft',
  payment_method   imagecare.payment_method     NOT NULL DEFAULT 'cash',
  subtotal         NUMERIC(14,2)                NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(14,2)                NOT NULL DEFAULT 0,
  tax_amount       NUMERIC(14,2)                NOT NULL DEFAULT 0,
  total_amount     NUMERIC(14,2)                NOT NULL DEFAULT 0,
  amount_paid      NUMERIC(14,2)                NOT NULL DEFAULT 0,
  change_given     NUMERIC(14,2)                NOT NULL DEFAULT 0,
  -- credit_amount: portion not paid immediately (credit sales)
  credit_amount    NUMERIC(14,2)                NOT NULL DEFAULT 0,
  notes            TEXT,
  receipt_url      TEXT,
  metadata         JSONB                        NOT NULL DEFAULT '{}',
  -- journal_entry_id: set by Business Engine after journal is posted
  journal_entry_id UUID,
  created_at       TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  created_by       UUID                         REFERENCES imagecare.users(id) ON DELETE SET NULL,
  updated_by       UUID                         REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_s2_sale_number_per_business UNIQUE (business_id, sale_number),
  CONSTRAINT chk_s2_sale_subtotal_nneg      CHECK (subtotal        >= 0),
  CONSTRAINT chk_s2_sale_discount_nneg      CHECK (discount_amount >= 0),
  CONSTRAINT chk_s2_sale_tax_nneg           CHECK (tax_amount      >= 0),
  CONSTRAINT chk_s2_sale_total_nneg         CHECK (total_amount    >= 0),
  CONSTRAINT chk_s2_sale_paid_nneg          CHECK (amount_paid     >= 0),
  CONSTRAINT chk_s2_sale_change_nneg        CHECK (change_given    >= 0),
  CONSTRAINT chk_s2_sale_credit_nneg        CHECK (credit_amount   >= 0)
);

CREATE INDEX IF NOT EXISTS idx_s2_sales_business  ON imagecare.sales (business_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_sales_branch    ON imagecare.sales (branch_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_sales_customer  ON imagecare.sales (customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_sales_date      ON imagecare.sales (sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_s2_sales_status    ON imagecare.sales (status);
CREATE INDEX IF NOT EXISTS idx_s2_sales_number    ON imagecare.sales (sale_number);
CREATE INDEX IF NOT EXISTS idx_s2_sales_served_by ON imagecare.sales (served_by) WHERE deleted_at IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_sales_updated_at') THEN
    CREATE TRIGGER tg_s2_sales_updated_at
      BEFORE UPDATE ON imagecare.sales
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_sales_select ON imagecare.sales;
CREATE POLICY rls_s2_sales_select ON imagecare.sales
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS rls_s2_sales_modify ON imagecare.sales;
CREATE POLICY rls_s2_sales_modify ON imagecare.sales
  FOR ALL USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

-- ============================================================
-- SALE ITEMS
-- Line items for each sale. Cascade delete from sales header.
-- unit_price and unit_cost are snapshots - not live product prices.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.sale_items (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID         NOT NULL REFERENCES imagecare.sales(id)        ON DELETE CASCADE,
  business_id     UUID         NOT NULL REFERENCES imagecare.businesses(id)   ON DELETE RESTRICT,
  branch_id       UUID         NOT NULL REFERENCES imagecare.branches(id)     ON DELETE RESTRICT,
  product_id      UUID         NOT NULL REFERENCES imagecare.products(id)     ON DELETE RESTRICT,
  quantity        NUMERIC(14,4) NOT NULL,
  -- Snapshots at time of sale - historical records remain accurate
  unit_price      NUMERIC(14,2) NOT NULL,
  unit_cost       NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_pct    NUMERIC(6,4)  NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate        NUMERIC(6,4)  NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total      NUMERIC(14,2) NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_s2_sale_item_qty_pos       CHECK (quantity      > 0),
  CONSTRAINT chk_s2_sale_item_price_nneg    CHECK (unit_price   >= 0),
  CONSTRAINT chk_s2_sale_item_cost_nneg     CHECK (unit_cost    >= 0),
  CONSTRAINT chk_s2_sale_item_total_nneg    CHECK (line_total   >= 0),
  CONSTRAINT chk_s2_sale_item_disc_range    CHECK (discount_pct BETWEEN 0 AND 1),
  CONSTRAINT chk_s2_sale_item_tax_range     CHECK (tax_rate     BETWEEN 0 AND 1)
);

CREATE INDEX IF NOT EXISTS idx_s2_sale_items_sale     ON imagecare.sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_s2_sale_items_product  ON imagecare.sale_items (product_id);
CREATE INDEX IF NOT EXISTS idx_s2_sale_items_business ON imagecare.sale_items (business_id);
CREATE INDEX IF NOT EXISTS idx_s2_sale_items_branch   ON imagecare.sale_items (branch_id);

ALTER TABLE imagecare.sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_sale_items_select ON imagecare.sale_items;
CREATE POLICY rls_s2_sale_items_select ON imagecare.sale_items
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS rls_s2_sale_items_modify ON imagecare.sale_items;
CREATE POLICY rls_s2_sale_items_modify ON imagecare.sale_items
  FOR ALL USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

-- ============================================================
-- PURCHASES
-- Header record for goods received / purchase orders.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.purchases (
  id                  UUID                         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID                         NOT NULL REFERENCES imagecare.businesses(id) ON DELETE RESTRICT,
  branch_id           UUID                         NOT NULL REFERENCES imagecare.branches(id)   ON DELETE RESTRICT,
  supplier_id         UUID                         REFERENCES imagecare.suppliers(id)           ON DELETE SET NULL,
  received_by         UUID                         REFERENCES imagecare.users(id)               ON DELETE SET NULL,
  purchase_number     TEXT                         NOT NULL,
  supplier_invoice_no TEXT,
  purchase_date       TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  due_date            TIMESTAMPTZ,
  status              imagecare.transaction_status NOT NULL DEFAULT 'draft',
  payment_method      imagecare.payment_method     NOT NULL DEFAULT 'cash',
  subtotal            NUMERIC(14,2)                NOT NULL DEFAULT 0,
  discount_amount     NUMERIC(14,2)                NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(14,2)                NOT NULL DEFAULT 0,
  total_amount        NUMERIC(14,2)                NOT NULL DEFAULT 0,
  amount_paid         NUMERIC(14,2)                NOT NULL DEFAULT 0,
  balance_due         NUMERIC(14,2)                NOT NULL DEFAULT 0,
  notes               TEXT,
  metadata            JSONB                        NOT NULL DEFAULT '{}',
  journal_entry_id    UUID,
  created_at          TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,
  created_by          UUID                         REFERENCES imagecare.users(id) ON DELETE SET NULL,
  updated_by          UUID                         REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_s2_purchase_number_per_business UNIQUE (business_id, purchase_number),
  CONSTRAINT chk_s2_purchase_subtotal_nneg      CHECK (subtotal        >= 0),
  CONSTRAINT chk_s2_purchase_discount_nneg      CHECK (discount_amount >= 0),
  CONSTRAINT chk_s2_purchase_tax_nneg           CHECK (tax_amount      >= 0),
  CONSTRAINT chk_s2_purchase_total_nneg         CHECK (total_amount    >= 0),
  CONSTRAINT chk_s2_purchase_paid_nneg          CHECK (amount_paid     >= 0),
  CONSTRAINT chk_s2_purchase_balance_nneg       CHECK (balance_due     >= 0)
);

CREATE INDEX IF NOT EXISTS idx_s2_purchases_business  ON imagecare.purchases (business_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_purchases_branch    ON imagecare.purchases (branch_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_purchases_supplier  ON imagecare.purchases (supplier_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_purchases_date      ON imagecare.purchases (purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_s2_purchases_status    ON imagecare.purchases (status);
CREATE INDEX IF NOT EXISTS idx_s2_purchases_due       ON imagecare.purchases (due_date) WHERE deleted_at IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_purchases_updated_at') THEN
    CREATE TRIGGER tg_s2_purchases_updated_at
      BEFORE UPDATE ON imagecare.purchases
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_purchases_select ON imagecare.purchases;
CREATE POLICY rls_s2_purchases_select ON imagecare.purchases
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS rls_s2_purchases_modify ON imagecare.purchases;
CREATE POLICY rls_s2_purchases_modify ON imagecare.purchases
  FOR ALL USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

-- ============================================================
-- PURCHASE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.purchase_items (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id     UUID         NOT NULL REFERENCES imagecare.purchases(id)    ON DELETE CASCADE,
  business_id     UUID         NOT NULL REFERENCES imagecare.businesses(id)   ON DELETE RESTRICT,
  branch_id       UUID         NOT NULL REFERENCES imagecare.branches(id)     ON DELETE RESTRICT,
  product_id      UUID         NOT NULL REFERENCES imagecare.products(id)     ON DELETE RESTRICT,
  quantity        NUMERIC(14,4) NOT NULL,
  unit_cost       NUMERIC(14,2) NOT NULL,
  discount_pct    NUMERIC(6,4)  NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate        NUMERIC(6,4)  NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total      NUMERIC(14,2) NOT NULL,
  expiry_date     DATE,
  batch_number    TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_s2_purchase_item_qty_pos    CHECK (quantity   > 0),
  CONSTRAINT chk_s2_purchase_item_cost_nneg  CHECK (unit_cost >= 0),
  CONSTRAINT chk_s2_purchase_item_total_nneg CHECK (line_total >= 0),
  CONSTRAINT chk_s2_purchase_item_disc_range CHECK (discount_pct BETWEEN 0 AND 1),
  CONSTRAINT chk_s2_purchase_item_tax_range  CHECK (tax_rate     BETWEEN 0 AND 1)
);

CREATE INDEX IF NOT EXISTS idx_s2_purchase_items_purchase ON imagecare.purchase_items (purchase_id);
CREATE INDEX IF NOT EXISTS idx_s2_purchase_items_product  ON imagecare.purchase_items (product_id);
CREATE INDEX IF NOT EXISTS idx_s2_purchase_items_business ON imagecare.purchase_items (business_id);
CREATE INDEX IF NOT EXISTS idx_s2_purchase_items_branch   ON imagecare.purchase_items (branch_id);

ALTER TABLE imagecare.purchase_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_purchase_items_select ON imagecare.purchase_items;
CREATE POLICY rls_s2_purchase_items_select ON imagecare.purchase_items
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS rls_s2_purchase_items_modify ON imagecare.purchase_items;
CREATE POLICY rls_s2_purchase_items_modify ON imagecare.purchase_items
  FOR ALL USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-2-0007',
  'Stage 2: Transactions - sales, sale_items, purchases, purchase_items',
  'system', FALSE, NULL, NULL
);
END $$;
