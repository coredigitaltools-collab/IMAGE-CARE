-- ============================================================
-- ImageCare ERP - Stage 2 Migration 0006
-- File: 0006_stage2_inventory.sql
-- Version: IMC-STAGE-2-v1.0
-- Purpose: Inventory movement engine.
--   - inventory_movements  (single source of truth for stock)
--   - vw_stock_summary     (derived view - no stored balances)
--
-- Depends on: 0005_stage2_parties.sql
--
-- INVENTORY RULES:
--   Stock is ALWAYS derived from movement aggregates.
--   Never update products.stock_qty directly.
--   All movement quantities are POSITIVE; direction is encoded
--   by movement_type (see ENUM in 0003).
--   Branch-specific stock is tracked by branch_id.
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- INVENTORY MOVEMENTS
-- Every stock change creates a row here.
-- Stock on hand = SUM(in movements) - SUM(out movements).
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.inventory_movements (
  id             UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID                     NOT NULL REFERENCES imagecare.businesses(id) ON DELETE RESTRICT,
  branch_id      UUID                     NOT NULL REFERENCES imagecare.branches(id)   ON DELETE RESTRICT,
  product_id     UUID                     NOT NULL REFERENCES imagecare.products(id)   ON DELETE RESTRICT,
  movement_type  imagecare.movement_type  NOT NULL,
  -- quantity is always positive; direction determined by movement_type
  quantity       NUMERIC(14,4)            NOT NULL,
  -- unit_cost: snapshot at time of movement for COGS and stock valuation
  unit_cost      NUMERIC(14,2)            NOT NULL DEFAULT 0,
  -- reference links back to the originating document
  reference_type TEXT,
  reference_id   UUID,
  -- transfer tracking
  from_branch_id UUID                     REFERENCES imagecare.branches(id) ON DELETE SET NULL,
  to_branch_id   UUID                     REFERENCES imagecare.branches(id) ON DELETE SET NULL,
  -- batch / expiry
  expiry_date    DATE,
  batch_number   TEXT,
  notes          TEXT,
  moved_at       TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  created_by     UUID                     REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT chk_s2_invmov_quantity_pos   CHECK (quantity   > 0),
  CONSTRAINT chk_s2_invmov_unit_cost_nneg CHECK (unit_cost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_s2_invmov_business
  ON imagecare.inventory_movements (business_id);
CREATE INDEX IF NOT EXISTS idx_s2_invmov_branch
  ON imagecare.inventory_movements (branch_id);
CREATE INDEX IF NOT EXISTS idx_s2_invmov_product
  ON imagecare.inventory_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_s2_invmov_reference
  ON imagecare.inventory_movements (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_s2_invmov_moved_at
  ON imagecare.inventory_movements (moved_at DESC);
CREATE INDEX IF NOT EXISTS idx_s2_invmov_type
  ON imagecare.inventory_movements (movement_type);
-- Composite for stock-on-hand queries (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_s2_invmov_stock_query
  ON imagecare.inventory_movements (business_id, branch_id, product_id, movement_type);

ALTER TABLE imagecare.inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_invmov_select ON imagecare.inventory_movements;
CREATE POLICY rls_s2_invmov_select ON imagecare.inventory_movements
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS rls_s2_invmov_insert ON imagecare.inventory_movements;
CREATE POLICY rls_s2_invmov_insert ON imagecare.inventory_movements
  FOR INSERT WITH CHECK (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_can_access_branch(branch_id)
  );

-- Movements are immutable once created - no UPDATE or DELETE policies
-- (business engine reverses via compensating movements)

-- ============================================================
-- VIEW: vw_stock_summary
-- Derives stock on hand per product per branch.
-- This is the shared inventory engine read surface.
-- Never query inventory_movements directly for stock level -
-- always use this view or an equivalent aggregate.
-- ============================================================
CREATE OR REPLACE VIEW imagecare.vw_stock_summary AS
SELECT
  im.business_id,
  im.branch_id,
  im.product_id,
  p.name                    AS product_name,
  p.sku,
  p.reorder_level,
  p.is_active               AS product_active,
  SUM(
    CASE
      WHEN im.movement_type IN (
        'purchase','adjustment_in','transfer_in',
        'return_in','opening_stock'
      ) THEN im.quantity
      WHEN im.movement_type IN (
        'sale','adjustment_out','transfer_out',
        'return_out','damage','expiry'
      ) THEN -im.quantity
      ELSE 0
    END
  )                         AS quantity_on_hand,
  SUM(
    CASE
      WHEN im.movement_type IN (
        'purchase','adjustment_in','transfer_in',
        'return_in','opening_stock'
      ) THEN im.quantity * im.unit_cost
      WHEN im.movement_type IN (
        'sale','adjustment_out','transfer_out',
        'return_out','damage','expiry'
      ) THEN -(im.quantity * im.unit_cost)
      ELSE 0
    END
  )                         AS stock_value,
  -- stock_status derived - never stored
  CASE
    WHEN SUM(
      CASE
        WHEN im.movement_type IN ('purchase','adjustment_in','transfer_in','return_in','opening_stock') THEN im.quantity
        WHEN im.movement_type IN ('sale','adjustment_out','transfer_out','return_out','damage','expiry') THEN -im.quantity
        ELSE 0
      END
    ) <= 0 THEN 'out_of_stock'
    WHEN SUM(
      CASE
        WHEN im.movement_type IN ('purchase','adjustment_in','transfer_in','return_in','opening_stock') THEN im.quantity
        WHEN im.movement_type IN ('sale','adjustment_out','transfer_out','return_out','damage','expiry') THEN -im.quantity
        ELSE 0
      END
    ) <= p.reorder_level THEN 'low_stock'
    ELSE 'in_stock'
  END                       AS stock_status
FROM imagecare.inventory_movements im
JOIN imagecare.products p ON p.id = im.product_id
GROUP BY
  im.business_id,
  im.branch_id,
  im.product_id,
  p.name,
  p.sku,
  p.reorder_level,
  p.is_active;

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-2-0006',
  'Stage 2: Inventory - inventory_movements, vw_stock_summary',
  'system', FALSE, NULL, NULL
);
END $$;
