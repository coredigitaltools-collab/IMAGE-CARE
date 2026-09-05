-- ============================================================
-- ImageCare ERP - Stage 9 Migration 0030
-- File: 0030_stage9_pin_staff.sql
-- Version: IMC-STAGE-9-0030
--
-- Purpose: PIN-only staff accounts (no email/password login).
--
-- Context: "Add staff" originally required creating a real Supabase
-- Auth login (email + password) via a server-side Edge Function
-- using the service-role key, because that's what's needed to
-- create a genuine second Auth account. In production this Edge
-- Function's POST request never once reached Supabase for the
-- owner (confirmed via function_edge_logs/function_logs - a
-- client-network-path issue, not a code bug - see
-- claude/add-staff-not-persisting-fix-2026-09-04.md). Separately,
-- the owner asked for a simpler model matching a reference product
-- ("TRAXXO"): add a staff member with just a name, role, and a
-- 4-digit PIN - no email, no password, no separate login account.
-- Staff identify themselves with their PIN on a shared, already-
-- signed-in device; the owner's own Supabase Auth session is what
-- actually talks to the database (RLS stays keyed to the owner,
-- exactly as documented in the owner's explicit sign-off on this
-- design - the PIN is an identification/attribution/UI-restriction
-- layer, not a second, independent security boundary).
--
-- This deliberately does NOT touch the existing per-account daily
-- unlock PIN (fn_set_pin/fn_verify_pin, 0020_stage7_pin_auth.sql) -
-- that stays exactly as-is for the owner's own device unlock. These
-- new functions are a parallel, explicitly-scoped set for setting/
-- checking a PIN on a *different* (staff) row than the caller's own,
-- which fn_set_pin/fn_verify_pin cannot do (they only ever match
-- `auth_user_id = auth.uid()`).
--
-- What this adds:
--   1. imagecare.users.job_title - optional free-text position
--      label for a staff member (e.g. "Cashier"), independent of
--      the existing `role` (which drives permission lookups, once
--      those are wired to something real - separate follow-up).
--   2. imagecare.users.email is no longer NOT NULL - a PIN-only
--      staff member has no login and no email address. The old
--      per-business uniqueness constraint is replaced with a
--      partial unique index so multiple staff can all have a NULL
--      email at once without colliding.
--   3. fn_set_staff_pin(p_staff_id, p_pin, p_pin_confirm) - Owner-
--      only. Hashes and stores a 4-digit PIN on a target staff row
--      within the caller's own business (used for both initial PIN
--      creation and "Reset PIN").
--   4. fn_verify_staff_pin(p_staff_id, p_pin) - checks a PIN against
--      a target staff row within the caller's own business, with
--      the same 5-attempts/30-minute temporary lockout as the
--      existing self-unlock PIN (fn_verify_pin). Used by the
--      staff-switcher ("Who is using this device?") to identify
--      which staff member is now operating a shared, already-
--      authenticated session.
--
-- SAFE TO RUN multiple times (IF NOT EXISTS / CREATE OR REPLACE
-- throughout).
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- 1. job_title column
-- ============================================================

ALTER TABLE imagecare.users
  ADD COLUMN IF NOT EXISTS job_title TEXT;

COMMENT ON COLUMN imagecare.users.job_title IS
  'Optional free-text position label shown in the staff list (e.g. "Cashier"). Independent of `role`, which is what drives permission lookups. Never required.';

-- ============================================================
-- 2. email becomes optional (PIN-only staff have none)
-- ============================================================

ALTER TABLE imagecare.users ALTER COLUMN email DROP NOT NULL;

ALTER TABLE imagecare.users
  DROP CONSTRAINT IF EXISTS uq_user_email_per_business;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_email_per_business
  ON imagecare.users (business_id, email)
  WHERE email IS NOT NULL;

-- ============================================================
-- 3. fn_set_staff_pin
--
-- Owner-only (checked via fn_is_business_owner, same helper the
-- users-table RLS insert policy already uses). Sets/replaces a PIN
-- on a staff row identified by p_staff_id, scoped to the caller's
-- own business so one owner can never touch another business's
-- staff. Used both when adding a staff member and for "Reset PIN".
-- ============================================================

CREATE OR REPLACE FUNCTION imagecare.fn_set_staff_pin(
  p_staff_id UUID,
  p_pin TEXT,
  p_pin_confirm TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = imagecare, extensions, pg_catalog
AS $$
DECLARE
  v_business_id UUID;
  v_target      imagecare.users%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: No authenticated session';
  END IF;

  SELECT business_id INTO v_business_id
  FROM imagecare.users
  WHERE auth_user_id = auth.uid()
    AND is_active     = TRUE
    AND deleted_at    IS NULL;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: No active user found for this session';
  END IF;

  IF NOT imagecare.fn_is_business_owner(v_business_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Only the business owner can set a staff PIN';
  END IF;

  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: PIN must be exactly 4 digits';
  END IF;

  IF p_pin IS DISTINCT FROM p_pin_confirm THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: PIN and confirmation do not match';
  END IF;

  SELECT * INTO v_target
  FROM imagecare.users
  WHERE id = p_staff_id
    AND business_id = v_business_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: Staff member not found';
  END IF;

  UPDATE imagecare.users
  SET pin_hash            = crypt(p_pin, gen_salt('bf')),
      pin_set_at          = NOW(),
      pin_failed_attempts = 0,
      pin_locked_until    = NULL
  WHERE id = p_staff_id;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION imagecare.fn_set_staff_pin(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 4. fn_verify_staff_pin
--
-- Any active member of the same business may call this (not
-- owner-only) - on a shared device it's the app itself, already
-- signed in as whoever is currently unlocked, presenting a staff
-- picker. Rate limiting mirrors fn_verify_pin exactly (5 attempts /
-- 30 minute temporary lockout, tracked per staff row so one staff
-- member's lockout never affects another's).
-- ============================================================

CREATE OR REPLACE FUNCTION imagecare.fn_verify_staff_pin(
  p_staff_id UUID,
  p_pin TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = imagecare, extensions, pg_catalog
AS $$
DECLARE
  v_caller_business_id UUID;
  v_target             imagecare.users%ROWTYPE;
  v_max_attempts        CONSTANT INT := 5;
  v_lockout_minutes     CONSTANT INT := 30;
  v_new_attempts        INT;
  v_new_locked_until    TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: No authenticated session';
  END IF;

  SELECT business_id INTO v_caller_business_id
  FROM imagecare.users
  WHERE auth_user_id = auth.uid()
    AND is_active     = TRUE
    AND deleted_at    IS NULL;

  IF v_caller_business_id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: No active user found for this session';
  END IF;

  SELECT * INTO v_target
  FROM imagecare.users
  WHERE id = p_staff_id
    AND business_id = v_caller_business_id
    AND is_active    = TRUE
    AND deleted_at   IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'NOT_FOUND');
  END IF;

  IF v_target.pin_hash IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'NO_PIN_SET');
  END IF;

  IF v_target.pin_locked_until IS NOT NULL AND v_target.pin_locked_until > NOW() THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'reason', 'LOCKED',
      'locked_until', v_target.pin_locked_until
    );
  END IF;

  IF v_target.pin_hash = crypt(p_pin, v_target.pin_hash) THEN
    UPDATE imagecare.users
    SET pin_failed_attempts = 0,
        pin_locked_until    = NULL
    WHERE id = v_target.id;

    RETURN jsonb_build_object(
      'success', TRUE,
      'staff_id', v_target.id,
      'full_name', trim(concat(v_target.first_name, ' ', v_target.last_name)),
      'role', v_target.role
    );
  END IF;

  v_new_attempts := v_target.pin_failed_attempts + 1;
  v_new_locked_until := CASE
    WHEN v_new_attempts >= v_max_attempts
      THEN NOW() + (v_lockout_minutes || ' minutes')::interval
    ELSE v_target.pin_locked_until
  END;

  UPDATE imagecare.users
  SET pin_failed_attempts = v_new_attempts,
      pin_locked_until    = v_new_locked_until
  WHERE id = v_target.id;

  RETURN jsonb_build_object(
    'success', FALSE,
    'reason', 'WRONG_PIN',
    'attempts_remaining', GREATEST(v_max_attempts - v_new_attempts, 0),
    'locked_until', v_new_locked_until
  );
END;
$$;

GRANT EXECUTE ON FUNCTION imagecare.fn_verify_staff_pin(UUID, TEXT) TO authenticated;

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-9-0030',
  'PIN-only staff accounts: added job_title column, made users.email optional (partial unique index instead of NOT NULL + per-business unique), and added fn_set_staff_pin/fn_verify_staff_pin so the owner can add a staff member with just a name/role/PIN (no email/password/Edge Function) and staff can identify themselves via PIN on a shared, already-authenticated device.',
  'system', FALSE, NULL, NULL
);
END $$;

-- ============================================================
-- Verification queries (run manually, not part of deployment):
--
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'imagecare' AND table_name = 'users'
--   AND column_name IN ('email', 'job_title');
-- SELECT imagecare.fn_set_staff_pin('<staff-uuid>', '1234', '1234');
-- SELECT imagecare.fn_verify_staff_pin('<staff-uuid>', '1234');
-- ============================================================
