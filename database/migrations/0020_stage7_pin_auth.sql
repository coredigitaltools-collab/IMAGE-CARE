-- ============================================================
-- ImageCare ERP - Stage 7: Business-ID-less Auth + Daily PIN
-- File: 0020_stage7_pin_auth.sql
-- Purpose: Support the new authentication flow where users never
--          see or enter a Business ID, plus a per-user 4-digit
--          daily unlock PIN layered on top of (never replacing)
--          full Supabase email+password authentication.
--
-- What this adds:
--   1. imagecare.users: pin_hash, pin_set_at, pin_failed_attempts,
--      pin_locked_until columns.
--   2. fn_get_my_business_id() - derives the caller's business_id
--      from auth.uid() via the existing UNIQUE auth_user_id
--      constraint (one auth account = one business). Used so the
--      frontend never has to ask for or transmit a Business ID.
--   3. fn_register_business(...) - self-service first-time signup.
--      Creates the business + owner user row + full owner
--      permission grants (every module in src/config/env.ts's
--      MODULES map - see grant_restored_module_permissions.sql for
--      why an explicit user_permissions row is required even for
--      is_owner = TRUE). Idempotent: calling it twice for the same
--      auth account returns the existing business instead of
--      creating a duplicate.
--   4. fn_set_pin / fn_verify_pin / fn_has_pin - PIN lifecycle.
--      PIN is stored as a pgcrypto bcrypt hash only (pgcrypto is
--      already enabled - see 0003_stage2_extensions_and_enums.sql).
--      Never stored, logged, or returned in plaintext. Completely
--      separate from the Supabase Auth password. fn_verify_pin
--      rate-limits repeated wrong attempts using the same
--      thresholds already defined in src/config/env.ts's
--      APP_CONSTANTS (5 attempts / 30 minute temporary lockout -
--      never permanent).
--
-- What this deliberately does NOT touch:
--   - imagecare.fn_get_user_context() - left completely unmodified.
--     fn_get_my_business_id() is a small additive helper called
--     BEFORE it, not a replacement.
--   - No new extensions (pgcrypto already enabled).
--   - No changes to inventory/sales/reports/business logic.
--   - business_id is NOT removed from the database - only from
--     what the user-facing login/registration screens ask for.
--
-- DEPLOYMENT: Run after 0019_stage3_engine_support.sql.
-- SAFE TO RUN multiple times (IF NOT EXISTS / CREATE OR REPLACE
-- throughout).
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- 1. PIN columns on imagecare.users
-- ============================================================

ALTER TABLE imagecare.users
  ADD COLUMN IF NOT EXISTS pin_hash             TEXT,
  ADD COLUMN IF NOT EXISTS pin_set_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pin_failed_attempts  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until     TIMESTAMPTZ;

COMMENT ON COLUMN imagecare.users.pin_hash IS
  'bcrypt hash (pgcrypto crypt()/gen_salt(''bf'')) of the user''s 4-digit daily unlock PIN. Never plaintext. Never the Supabase Auth password. Convenience-only, never a primary credential.';

-- ============================================================
-- 2. fn_get_my_business_id
--
-- Derives the caller's business_id purely from auth.uid(), using
-- the fact that imagecare.users.auth_user_id is globally UNIQUE
-- (one Supabase Auth account maps to exactly one business). This
-- lets the frontend determine which business to load context for
-- without the user ever supplying a Business ID.
-- ============================================================

CREATE OR REPLACE FUNCTION imagecare.fn_get_my_business_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT business_id
  FROM imagecare.users
  WHERE auth_user_id = auth.uid()
    AND is_active     = TRUE
    AND deleted_at    IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION imagecare.fn_get_my_business_id() TO authenticated;

-- ============================================================
-- 3. fn_register_business
--
-- Self-service first-time business registration. Called right
-- after supabase.auth.signUp() succeeds (so auth.uid() already
-- identifies a real Supabase Auth account).
--
-- Idempotent: auth_user_id is globally UNIQUE on imagecare.users,
-- so if this is called twice for the same auth account (e.g. a
-- retried request), the second call returns the business created
-- by the first call instead of raising a unique-violation or
-- creating a duplicate business/user/permission set.
--
-- Grants the new owner full access (view/create/edit/delete/
-- approve/export/sync, all branches) on every module module key
-- currently defined in src/config/env.ts's MODULES map. is_owner
-- alone does NOT grant sidebar/route visibility - see
-- usePermission.ts's canDo(), which only reads the permissions
-- map - so this mirrors the exact pattern already used in
-- grant_restored_module_permissions.sql.
-- ============================================================

CREATE OR REPLACE FUNCTION imagecare.fn_register_business(
  p_business_name    TEXT,
  p_owner_first_name TEXT,
  p_owner_last_name  TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_existing   imagecare.users%ROWTYPE;
  v_business_id UUID;
  v_user_id     UUID;
  v_email       TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: No authenticated session';
  END IF;

  IF p_business_name IS NULL OR length(trim(p_business_name)) = 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Business name is required';
  END IF;
  IF p_owner_first_name IS NULL OR length(trim(p_owner_first_name)) = 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Owner first name is required';
  END IF;
  IF p_owner_last_name IS NULL OR length(trim(p_owner_last_name)) = 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Owner last name is required';
  END IF;

  -- Idempotency guard - see header note.
  SELECT * INTO v_existing
  FROM imagecare.users
  WHERE auth_user_id = auth.uid()
    AND deleted_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'business_id',     v_existing.business_id,
      'user_id',         v_existing.id,
      'already_existed', TRUE
    );
  END IF;

  -- Email comes from the authenticated Supabase Auth account itself
  -- (auth.users), never from client input, so it always matches what
  -- the user actually signed up / signs in with.
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Could not resolve authenticated account email';
  END IF;

  INSERT INTO imagecare.businesses (name)
  VALUES (trim(p_business_name))
  RETURNING id INTO v_business_id;

  INSERT INTO imagecare.users (
    business_id, auth_user_id, first_name, last_name, email,
    role, is_owner, is_active
  ) VALUES (
    v_business_id, auth.uid(), trim(p_owner_first_name), trim(p_owner_last_name),
    lower(trim(v_email)), 'Owner', TRUE, TRUE
  )
  RETURNING id INTO v_user_id;

  INSERT INTO imagecare.user_permissions
    (business_id, user_id, module, can_view, can_create, can_edit,
     can_delete, can_approve, can_export, can_sync, branch_scope, notes)
  SELECT
    v_business_id, v_user_id, m.module,
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'all',
    'Auto-granted at business registration (owner)'
  FROM (VALUES
    ('sales'), ('purchases'), ('expenses'), ('payroll'), ('inventory'),
    ('customers'), ('suppliers'), ('reports'), ('settings'), ('users'),
    ('branches'), ('journal'), ('bank'), ('cash'), ('credit'),
    ('invoices'), ('bills'),
    ('loyalty'), ('salesTargets'), ('stockSummary'), ('dailySummary'),
    ('monthlySummary'), ('annualSummary'), ('branchOverview'),
    ('offlineMode'), ('accounting')
  ) AS m(module);

  RETURN jsonb_build_object(
    'business_id',     v_business_id,
    'user_id',         v_user_id,
    'already_existed', FALSE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION imagecare.fn_register_business(TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 4. fn_has_pin
-- ============================================================

CREATE OR REPLACE FUNCTION imagecare.fn_has_pin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT (pin_hash IS NOT NULL)
  FROM imagecare.users
  WHERE auth_user_id = auth.uid()
    AND is_active     = TRUE
    AND deleted_at    IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION imagecare.fn_has_pin() TO authenticated;

-- ============================================================
-- 5. fn_set_pin
--
-- Used both for initial PIN creation and for the "Forgot PIN"
-- reset path. The Forgot PIN flow does not need a separate DB
-- function: the frontend re-authenticates with email+password
-- (a fresh supabase.auth.signInWithPassword() call) before calling
-- this, which is what actually verifies identity for a reset. The
-- old PIN is never read back or recoverable - it is simply
-- overwritten.
-- ============================================================

CREATE OR REPLACE FUNCTION imagecare.fn_set_pin(
  p_pin TEXT,
  p_pin_confirm TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user imagecare.users%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: No authenticated session';
  END IF;

  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: PIN must be exactly 4 digits';
  END IF;

  IF p_pin IS DISTINCT FROM p_pin_confirm THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: PIN and confirmation do not match';
  END IF;

  SELECT * INTO v_user
  FROM imagecare.users
  WHERE auth_user_id = auth.uid()
    AND is_active     = TRUE
    AND deleted_at    IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: No active user found for this session';
  END IF;

  UPDATE imagecare.users
  SET pin_hash            = crypt(p_pin, gen_salt('bf')),
      pin_set_at          = NOW(),
      pin_failed_attempts = 0,
      pin_locked_until    = NULL
  WHERE id = v_user.id;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION imagecare.fn_set_pin(TEXT, TEXT) TO authenticated;

-- ============================================================
-- 6. fn_verify_pin
--
-- Rate limiting mirrors src/config/env.ts's APP_CONSTANTS:
--   RATE_LIMIT_MAX_ATTEMPTS = 5, RATE_LIMIT_LOCKOUT_MINUTES = 30.
-- Lockout is temporary (auto-clears once pin_locked_until passes,
-- or immediately on the next correct PIN) - never a permanent
-- account lock. Full email+password sign-in always remains
-- available as a fallback regardless of PIN lock state, since it
-- does not depend on pin_locked_until at all.
-- ============================================================

CREATE OR REPLACE FUNCTION imagecare.fn_verify_pin(p_pin TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user             imagecare.users%ROWTYPE;
  v_max_attempts      CONSTANT INT := 5;
  v_lockout_minutes    CONSTANT INT := 30;
  v_new_attempts      INT;
  v_new_locked_until  TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: No authenticated session';
  END IF;

  SELECT * INTO v_user
  FROM imagecare.users
  WHERE auth_user_id = auth.uid()
    AND is_active     = TRUE
    AND deleted_at    IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: No active user found for this session';
  END IF;

  IF v_user.pin_hash IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'NO_PIN_SET');
  END IF;

  IF v_user.pin_locked_until IS NOT NULL AND v_user.pin_locked_until > NOW() THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'reason', 'LOCKED',
      'locked_until', v_user.pin_locked_until
    );
  END IF;

  IF v_user.pin_hash = crypt(p_pin, v_user.pin_hash) THEN
    UPDATE imagecare.users
    SET pin_failed_attempts = 0,
        pin_locked_until    = NULL
    WHERE id = v_user.id;

    RETURN jsonb_build_object('success', TRUE);
  END IF;

  -- Wrong PIN: increment the counter and apply a temporary lockout
  -- once the threshold is reached. Never a permanent lock.
  v_new_attempts := v_user.pin_failed_attempts + 1;
  v_new_locked_until := CASE
    WHEN v_new_attempts >= v_max_attempts
      THEN NOW() + (v_lockout_minutes || ' minutes')::interval
    ELSE v_user.pin_locked_until
  END;

  UPDATE imagecare.users
  SET pin_failed_attempts = v_new_attempts,
      pin_locked_until    = v_new_locked_until
  WHERE id = v_user.id;

  RETURN jsonb_build_object(
    'success', FALSE,
    'reason', 'WRONG_PIN',
    'attempts_remaining', GREATEST(v_max_attempts - v_new_attempts, 0),
    'locked_until', v_new_locked_until
  );
END;
$$;

GRANT EXECUTE ON FUNCTION imagecare.fn_verify_pin(TEXT) TO authenticated;

-- ============================================================
-- Verification queries (run manually, not part of deployment):
--
-- SELECT imagecare.fn_get_my_business_id();
-- SELECT imagecare.fn_has_pin();
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'imagecare' AND table_name = 'users'
--   AND column_name LIKE 'pin_%';
-- ============================================================
