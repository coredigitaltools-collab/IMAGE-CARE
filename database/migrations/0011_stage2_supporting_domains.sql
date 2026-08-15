-- ============================================================
-- ImageCare ERP - Stage 2 Migration 0011
-- File: 0011_stage2_supporting_domains.sql
-- Version: IMC-STAGE-2-v1.0
-- Purpose: Remaining domain tables.
--   - sales_targets      (branch/user sales goals)
--   - loyalty_accounts   (customer loyalty foundation)
--   - loyalty_transactions
--   - audit_logs         (who/what/when - immutable)
--   - sync_queue         (offline metadata per IMC-DB-004)
--   - notifications
--   - storage_metadata   (file attachment records)
--
-- Depends on: 0010_stage2_accounting.sql
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- SALES TARGETS
-- Configurable goals per branch or per user per period.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.sales_targets (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID         NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  branch_id     UUID         REFERENCES imagecare.branches(id)            ON DELETE CASCADE,
  user_id       UUID         REFERENCES imagecare.users(id)               ON DELETE CASCADE,
  period_start  DATE         NOT NULL,
  period_end    DATE         NOT NULL,
  target_amount NUMERIC(14,2) NOT NULL,
  target_type   TEXT         NOT NULL DEFAULT 'revenue',
  notes         TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by    UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT chk_s2_target_period_order  CHECK (period_end   >= period_start),
  CONSTRAINT chk_s2_target_amount_pos    CHECK (target_amount > 0),
  CONSTRAINT chk_s2_target_scope CHECK (
    (branch_id IS NOT NULL OR user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_s2_sales_targets_business
  ON imagecare.sales_targets (business_id);
CREATE INDEX IF NOT EXISTS idx_s2_sales_targets_branch
  ON imagecare.sales_targets (branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_s2_sales_targets_user
  ON imagecare.sales_targets (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_s2_sales_targets_period
  ON imagecare.sales_targets (period_start, period_end);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_sales_targets_updated_at') THEN
    CREATE TRIGGER tg_s2_sales_targets_updated_at
      BEFORE UPDATE ON imagecare.sales_targets
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.sales_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_sales_targets_select ON imagecare.sales_targets;
CREATE POLICY rls_s2_sales_targets_select ON imagecare.sales_targets
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s2_sales_targets_modify ON imagecare.sales_targets;
CREATE POLICY rls_s2_sales_targets_modify ON imagecare.sales_targets
  FOR ALL USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_is_business_owner(business_id)
  );

-- ============================================================
-- LOYALTY ACCOUNTS
-- Customer loyalty programme foundation.
-- points_balance derives from loyalty_transactions.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.loyalty_accounts (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID         NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  customer_id     UUID         NOT NULL REFERENCES imagecare.customers(id)  ON DELETE CASCADE,
  points_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
  tier            TEXT         NOT NULL DEFAULT 'standard',
  enrolled_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_activity   TIMESTAMPTZ,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  metadata        JSONB        NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_s2_loyalty_customer_per_business UNIQUE (business_id, customer_id),
  CONSTRAINT chk_s2_loyalty_points_nneg CHECK (points_balance >= 0)
);

CREATE INDEX IF NOT EXISTS idx_s2_loyalty_accounts_business
  ON imagecare.loyalty_accounts (business_id);
CREATE INDEX IF NOT EXISTS idx_s2_loyalty_accounts_customer
  ON imagecare.loyalty_accounts (customer_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_loyalty_accounts_updated_at') THEN
    CREATE TRIGGER tg_s2_loyalty_accounts_updated_at
      BEFORE UPDATE ON imagecare.loyalty_accounts
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.loyalty_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_loyalty_accounts_select ON imagecare.loyalty_accounts;
CREATE POLICY rls_s2_loyalty_accounts_select ON imagecare.loyalty_accounts
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s2_loyalty_accounts_modify ON imagecare.loyalty_accounts;
CREATE POLICY rls_s2_loyalty_accounts_modify ON imagecare.loyalty_accounts
  FOR ALL USING (business_id = imagecare.fn_current_business_id());

-- ============================================================
-- LOYALTY TRANSACTIONS
-- Each points earn or redeem creates a row here.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.loyalty_transactions (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        UUID         NOT NULL REFERENCES imagecare.businesses(id)     ON DELETE CASCADE,
  loyalty_account_id UUID         NOT NULL REFERENCES imagecare.loyalty_accounts(id) ON DELETE CASCADE,
  sale_id            UUID         REFERENCES imagecare.sales(id)                   ON DELETE SET NULL,
  transaction_type   TEXT         NOT NULL,   -- 'earn' or 'redeem'
  points             NUMERIC(14,2) NOT NULL,
  description        TEXT,
  transaction_date   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by         UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT chk_s2_loyalty_txn_points_pos  CHECK (points > 0),
  CONSTRAINT chk_s2_loyalty_txn_type CHECK (
    transaction_type IN ('earn', 'redeem')
  )
);

CREATE INDEX IF NOT EXISTS idx_s2_loyalty_txns_business
  ON imagecare.loyalty_transactions (business_id);
CREATE INDEX IF NOT EXISTS idx_s2_loyalty_txns_account
  ON imagecare.loyalty_transactions (loyalty_account_id);
CREATE INDEX IF NOT EXISTS idx_s2_loyalty_txns_date
  ON imagecare.loyalty_transactions (transaction_date DESC);

ALTER TABLE imagecare.loyalty_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_loyalty_txns_select ON imagecare.loyalty_transactions;
CREATE POLICY rls_s2_loyalty_txns_select ON imagecare.loyalty_transactions
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s2_loyalty_txns_insert ON imagecare.loyalty_transactions;
CREATE POLICY rls_s2_loyalty_txns_insert ON imagecare.loyalty_transactions
  FOR INSERT WITH CHECK (business_id = imagecare.fn_current_business_id());

-- ============================================================
-- AUDIT LOGS
-- Full audit trail. Immutable - no UPDATE or DELETE policies.
-- Captures who/what/when/where for all sensitive operations.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.audit_logs (
  id             UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID                    NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  branch_id      UUID                    REFERENCES imagecare.branches(id)            ON DELETE SET NULL,
  user_id        UUID                    REFERENCES imagecare.users(id)               ON DELETE SET NULL,
  table_name     TEXT                    NOT NULL,
  record_id      UUID                    NOT NULL,
  action         imagecare.audit_action  NOT NULL,
  previous_value JSONB,
  new_value      JSONB,
  changed_fields TEXT[],
  ip_address     INET,
  user_agent     TEXT,
  session_id     TEXT,
  created_at     TIMESTAMPTZ             NOT NULL DEFAULT NOW()
  -- Audit logs are never updated or deleted
);

CREATE INDEX IF NOT EXISTS idx_s2_audit_logs_business
  ON imagecare.audit_logs (business_id);
CREATE INDEX IF NOT EXISTS idx_s2_audit_logs_table_record
  ON imagecare.audit_logs (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_s2_audit_logs_user
  ON imagecare.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_s2_audit_logs_created
  ON imagecare.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_s2_audit_logs_action
  ON imagecare.audit_logs (action);

ALTER TABLE imagecare.audit_logs ENABLE ROW LEVEL SECURITY;

-- Audit logs: owner and admins can read; nobody can write directly (trigger only)
DROP POLICY IF EXISTS rls_s2_audit_logs_select ON imagecare.audit_logs;
CREATE POLICY rls_s2_audit_logs_select ON imagecare.audit_logs
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
    AND imagecare.fn_is_business_owner(business_id)
  );

-- No INSERT/UPDATE/DELETE policy: only SECURITY DEFINER triggers write here

-- ============================================================
-- GENERIC AUDIT TRIGGER FUNCTION
-- Attach to any table that needs full audit trail.
-- ============================================================
CREATE OR REPLACE FUNCTION imagecare.fn_audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_action      imagecare.audit_action;
  v_prev        JSONB;
  v_next        JSONB;
  v_changed     TEXT[];
  v_business_id UUID;
  v_branch_id   UUID;
  v_user_id     UUID;
  v_record_id   UUID;
BEGIN
  IF    TG_OP = 'INSERT' THEN v_action := 'insert';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_action := 'delete';
    ELSE
      v_action := 'update';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN v_action := 'delete';
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_prev        := to_jsonb(OLD);
    v_next        := NULL;
    v_record_id   := OLD.id;
    v_business_id := OLD.business_id;
    v_branch_id   := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_prev        := NULL;
    v_next        := to_jsonb(NEW);
    v_record_id   := NEW.id;
    v_business_id := NEW.business_id;
    v_branch_id   := NULL;
  ELSE
    v_prev        := to_jsonb(OLD);
    v_next        := to_jsonb(NEW);
    v_record_id   := NEW.id;
    v_business_id := NEW.business_id;
    SELECT array_agg(key) INTO v_changed
    FROM (
      SELECT key FROM jsonb_each(v_next)
      EXCEPT SELECT key FROM jsonb_each(v_prev)
      UNION
      SELECT key FROM (
        SELECT key, value FROM jsonb_each(v_next)
        EXCEPT SELECT key, value FROM jsonb_each(v_prev)
      ) diff
    ) changes;
  END IF;

  BEGIN
    v_user_id := COALESCE(
      (v_next->>'updated_by')::UUID,
      (v_next->>'created_by')::UUID
    );
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  BEGIN
    v_branch_id := (COALESCE(v_next, v_prev)->>'branch_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_branch_id := NULL;
  END;

  INSERT INTO imagecare.audit_logs (
    business_id, branch_id, user_id,
    table_name, record_id, action,
    previous_value, new_value, changed_fields
  ) VALUES (
    v_business_id, v_branch_id, v_user_id,
    TG_TABLE_NAME, v_record_id, v_action,
    v_prev, v_next, v_changed
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Attach audit trigger to sensitive tables
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_audit_users') THEN
    CREATE TRIGGER tg_s2_audit_users
      AFTER INSERT OR UPDATE OR DELETE ON imagecare.users
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_audit_trigger();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_audit_permissions') THEN
    CREATE TRIGGER tg_s2_audit_permissions
      AFTER INSERT OR UPDATE OR DELETE ON imagecare.user_permissions
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_audit_trigger();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_audit_sales') THEN
    CREATE TRIGGER tg_s2_audit_sales
      AFTER INSERT OR UPDATE ON imagecare.sales
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_audit_trigger();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_audit_journal_entries') THEN
    CREATE TRIGGER tg_s2_audit_journal_entries
      AFTER INSERT OR UPDATE ON imagecare.journal_entries
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_audit_trigger();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_audit_payroll') THEN
    CREATE TRIGGER tg_s2_audit_payroll
      AFTER INSERT OR UPDATE ON imagecare.payroll
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_audit_trigger();
  END IF;
END $$;

-- ============================================================
-- SYNC QUEUE
-- Offline-first metadata. Per IMC-DB-004 specification.
-- Client enqueues mutations; sync engine processes them.
-- Does not duplicate transaction tables.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.sync_queue (
  id             UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID                    NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  branch_id      UUID                    REFERENCES imagecare.branches(id)            ON DELETE SET NULL,
  user_id        UUID                    REFERENCES imagecare.users(id)               ON DELETE SET NULL,
  device_id      TEXT                    NOT NULL,
  table_name     TEXT                    NOT NULL,
  record_id      UUID                    NOT NULL,
  operation      TEXT                    NOT NULL,   -- insert, update, delete
  payload        JSONB                   NOT NULL,
  client_version INTEGER                 NOT NULL DEFAULT 1,
  server_version INTEGER,
  sync_status    imagecare.sync_status   NOT NULL DEFAULT 'pending',
  conflict_data  JSONB,
  error_message  TEXT,
  retry_count    INTEGER                 NOT NULL DEFAULT 0,
  -- idempotency_key prevents duplicate processing of the same client operation
  idempotency_key TEXT                   UNIQUE,
  queued_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  synced_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_s2_sync_queue_business
  ON imagecare.sync_queue (business_id);
CREATE INDEX IF NOT EXISTS idx_s2_sync_queue_status
  ON imagecare.sync_queue (sync_status)
  WHERE sync_status IN ('pending','conflict','failed');
CREATE INDEX IF NOT EXISTS idx_s2_sync_queue_device
  ON imagecare.sync_queue (device_id);
CREATE INDEX IF NOT EXISTS idx_s2_sync_queue_queued
  ON imagecare.sync_queue (queued_at);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_sync_queue_updated_at') THEN
    CREATE TRIGGER tg_s2_sync_queue_updated_at
      BEFORE UPDATE ON imagecare.sync_queue
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.sync_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_sync_queue_select ON imagecare.sync_queue;
CREATE POLICY rls_s2_sync_queue_select ON imagecare.sync_queue
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
    AND (
      user_id = imagecare.fn_current_user_id()
      OR imagecare.fn_is_business_owner(business_id)
    )
  );

DROP POLICY IF EXISTS rls_s2_sync_queue_modify ON imagecare.sync_queue;
CREATE POLICY rls_s2_sync_queue_modify ON imagecare.sync_queue
  FOR ALL USING (
    business_id = imagecare.fn_current_business_id()
    AND user_id  = imagecare.fn_current_user_id()
  );

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.notifications (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID         NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  branch_id      UUID         REFERENCES imagecare.branches(id)            ON DELETE SET NULL,
  user_id        UUID         NOT NULL REFERENCES imagecare.users(id)      ON DELETE CASCADE,
  type           TEXT         NOT NULL,
  title          TEXT         NOT NULL,
  body           TEXT,
  reference_type TEXT,
  reference_id   UUID,
  is_read        BOOLEAN      NOT NULL DEFAULT FALSE,
  is_actioned    BOOLEAN      NOT NULL DEFAULT FALSE,
  expires_at     TIMESTAMPTZ,
  metadata       JSONB        NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_s2_notifications_user
  ON imagecare.notifications (user_id, is_read)
  WHERE expires_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_s2_notifications_business
  ON imagecare.notifications (business_id);
CREATE INDEX IF NOT EXISTS idx_s2_notifications_type
  ON imagecare.notifications (business_id, type);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s2_notifications_updated_at') THEN
    CREATE TRIGGER tg_s2_notifications_updated_at
      BEFORE UPDATE ON imagecare.notifications
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

ALTER TABLE imagecare.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_notifications_select ON imagecare.notifications;
CREATE POLICY rls_s2_notifications_select ON imagecare.notifications
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
    AND user_id = imagecare.fn_current_user_id()
  );

DROP POLICY IF EXISTS rls_s2_notifications_modify ON imagecare.notifications;
CREATE POLICY rls_s2_notifications_modify ON imagecare.notifications
  FOR UPDATE USING (
    business_id = imagecare.fn_current_business_id()
    AND user_id = imagecare.fn_current_user_id()
  );

-- ============================================================
-- STORAGE METADATA
-- Records for files stored in Supabase Storage.
-- The actual file lives in storage; this table tracks metadata.
-- ============================================================
CREATE TABLE IF NOT EXISTS imagecare.storage_metadata (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID         NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  branch_id      UUID         REFERENCES imagecare.branches(id)            ON DELETE SET NULL,
  bucket_name    TEXT         NOT NULL,
  storage_path   TEXT         NOT NULL,
  file_name      TEXT         NOT NULL,
  mime_type      TEXT,
  file_size_bytes BIGINT,
  reference_type TEXT,
  reference_id   UUID,
  is_public      BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by     UUID         REFERENCES imagecare.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_s2_storage_path UNIQUE (bucket_name, storage_path)
);

CREATE INDEX IF NOT EXISTS idx_s2_storage_metadata_business
  ON imagecare.storage_metadata (business_id);
CREATE INDEX IF NOT EXISTS idx_s2_storage_metadata_reference
  ON imagecare.storage_metadata (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

ALTER TABLE imagecare.storage_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_s2_storage_metadata_select ON imagecare.storage_metadata;
CREATE POLICY rls_s2_storage_metadata_select ON imagecare.storage_metadata
  FOR SELECT USING (business_id = imagecare.fn_current_business_id());

DROP POLICY IF EXISTS rls_s2_storage_metadata_modify ON imagecare.storage_metadata;
CREATE POLICY rls_s2_storage_metadata_modify ON imagecare.storage_metadata
  FOR ALL USING (business_id = imagecare.fn_current_business_id());

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-2-0011',
  'Stage 2: Supporting domains - sales_targets, loyalty, audit_logs, sync_queue, notifications, storage_metadata',
  'system', FALSE, NULL, NULL
);
END $$;
