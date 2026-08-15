-- ============================================================
-- ImageCare ERP - Stage 2 Migration 0004
-- File: 0004_stage2_master_data.sql
-- Version: IMC-STAGE-2-v1.0
-- Purpose: Master data tables.
--   - settings          (business configuration key-value store)
--   - units             (units of measure)
--   - product_categories (hierarchical, self-referencing)
--   - products          (master catalogue - stock NEVER stored here)
--
-- Depends on: 0003_stage2_extensions_and_enums.sql
-- All in imagecare schema. Idempotent.
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- SETTINGS
-- Business configuration. Replaces all hard-coded values.
-- branch_id = NULL means business-wide setting.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.settings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  branch_id   UUID        REFERENCES imagecare.branches(id) ON DELETE CASCADE,
  category    TEXT        NOT NULL,
  key         TEXT        NOT NULL,
  value       JSONB       NOT NULL,
  description TEXT,
  is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID        REFERENCES imagecare.users(id) ON DELETE SET NULL,
  updated_by  UUID        REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_setting_key UNIQUE (business_id, branch_id, category, key)
);

CREATE INDEX IF NOT EXISTS idx_s2_settings_business
  ON imagecare.settings (business_id);
CREATE INDEX IF NOT EXISTS idx_s2_settings_branch
  ON imagecare.settings (branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_s2_settings_category
  ON imagecare.settings (business_id, category);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_settings_updated_at') THEN
    CREATE TRIGGER tg_s2_settings_updated_at
      BEFORE UPDATE ON imagecare.settings
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_settings_select ON imagecare.settings;
CREATE POLICY rls_s2_settings_select ON imagecare.settings
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s2_settings_modify ON imagecare.settings;
CREATE POLICY rls_s2_settings_modify ON imagecare.settings
  FOR ALL USING (
    business_id = imagecare.fn_current_business_id()
    AND (
      NOT is_system
      OR imagecare.fn_is_business_owner(business_id)
    )
  );

-- ============================================================
-- UNITS OF MEASURE
-- Configurable per business. Not hard-coded to any single unit.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.units (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  abbreviation TEXT        NOT NULL,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID        REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_unit_name_per_business UNIQUE (business_id, name)
);

CREATE INDEX IF NOT EXISTS idx_s2_units_business
  ON imagecare.units (business_id) WHERE is_active = TRUE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_units_updated_at') THEN
    CREATE TRIGGER tg_s2_units_updated_at
      BEFORE UPDATE ON imagecare.units
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_units_select ON imagecare.units;
CREATE POLICY rls_s2_units_select ON imagecare.units
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s2_units_modify ON imagecare.units;
CREATE POLICY rls_s2_units_modify ON imagecare.units
  FOR ALL USING (business_id = imagecare.fn_current_business_id());

-- ============================================================
-- PRODUCT CATEGORIES
-- Self-referencing hierarchy. parent_id = NULL means root.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.product_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  parent_id   UUID        REFERENCES imagecare.product_categories(id) ON DELETE SET NULL,
  name        TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID        REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_category_name_per_parent UNIQUE (business_id, parent_id, name)
);

CREATE INDEX IF NOT EXISTS idx_s2_categories_business
  ON imagecare.product_categories (business_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_s2_categories_parent
  ON imagecare.product_categories (parent_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_categories_updated_at') THEN
    CREATE TRIGGER tg_s2_categories_updated_at
      BEFORE UPDATE ON imagecare.product_categories
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_categories_select ON imagecare.product_categories;
CREATE POLICY rls_s2_categories_select ON imagecare.product_categories
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s2_categories_modify ON imagecare.product_categories;
CREATE POLICY rls_s2_categories_modify ON imagecare.product_categories
  FOR ALL USING (business_id = imagecare.fn_current_business_id());

-- ============================================================
-- PRODUCTS
-- Master product catalogue.
-- RULE: Stock level is NEVER stored here.
--       Stock is always derived from inventory_movements.
-- Historical transactions reference product_id and snapshot
-- unit_price/unit_cost at time of transaction, so changing
-- product prices does not corrupt historical records.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.products (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID         NOT NULL REFERENCES imagecare.businesses(id) ON DELETE RESTRICT,
  category_id     UUID         REFERENCES imagecare.product_categories(id) ON DELETE SET NULL,
  unit_id         UUID         REFERENCES imagecare.units(id) ON DELETE SET NULL,
  name            TEXT         NOT NULL,
  sku             TEXT,
  barcode         TEXT,
  description     TEXT,
  image_url       TEXT,
  selling_price   NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_price      NUMERIC(14,2) NOT NULL DEFAULT 0,
  reorder_level   NUMERIC(14,4) NOT NULL DEFAULT 0,
  -- is_stockable: FALSE for services - no inventory movement created
  is_stockable    BOOLEAN      NOT NULL DEFAULT TRUE,
  is_sellable     BOOLEAN      NOT NULL DEFAULT TRUE,
  is_purchasable  BOOLEAN      NOT NULL DEFAULT TRUE,
  track_expiry    BOOLEAN      NOT NULL DEFAULT FALSE,
  -- tax_rate: stored as decimal e.g. 0.18 = 18% VAT
  tax_rate        NUMERIC(6,4) NOT NULL DEFAULT 0,
  metadata        JSONB        NOT NULL DEFAULT '{}',
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  created_by      UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,
  updated_by      UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT chk_s2_product_selling_price_nneg CHECK (selling_price >= 0),
  CONSTRAINT chk_s2_product_cost_price_nneg    CHECK (cost_price    >= 0),
  CONSTRAINT chk_s2_product_reorder_nneg       CHECK (reorder_level >= 0),
  CONSTRAINT chk_s2_product_tax_rate_range     CHECK (tax_rate BETWEEN 0 AND 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_s2_products_sku
  ON imagecare.products (business_id, sku)
  WHERE sku IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_s2_products_barcode
  ON imagecare.products (business_id, barcode)
  WHERE barcode IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_s2_products_business
  ON imagecare.products (business_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_s2_products_category
  ON imagecare.products (category_id) WHERE deleted_at IS NULL;

-- Trigram index for fuzzy name search
CREATE INDEX IF NOT EXISTS idx_s2_products_name_trgm
  ON imagecare.products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_s2_products_active
  ON imagecare.products (business_id, is_active) WHERE deleted_at IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_products_updated_at') THEN
    CREATE TRIGGER tg_s2_products_updated_at
      BEFORE UPDATE ON imagecare.products
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_products_select ON imagecare.products;
CREATE POLICY rls_s2_products_select ON imagecare.products
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s2_products_modify ON imagecare.products;
CREATE POLICY rls_s2_products_modify ON imagecare.products
  FOR ALL USING (business_id = imagecare.fn_current_business_id());

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-2-0004',
  'Stage 2: Master data - settings, units, product_categories, products',
  'system', FALSE, NULL, NULL
);
END $$;
