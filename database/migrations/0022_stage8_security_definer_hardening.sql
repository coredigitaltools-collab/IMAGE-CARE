-- ============================================================
-- ImageCare ERP - Stage 8: SECURITY DEFINER Hardening
-- File: database/migrations/0022_stage8_security_definer_hardening.sql
--
-- Purpose: Phase 1 live verification found 13 of 20 imagecare
--   functions with a mutable search_path, and all 18 SECURITY
--   DEFINER functions EXECUTE-granted to anon (not just
--   authenticated), even though every one of them depends on an
--   authenticated session (fn_current_user_id()/auth.uid()).
--
-- Scope:
--   - SET search_path = imagecare, pg_catalog on the 13 functions
--     that were missing it.
--   - REVOKE EXECUTE FROM anon (leave authenticated) on all
--     SECURITY DEFINER functions in imagecare. Registration and PIN
--     setup/verification always run AFTER supabase.auth.signUp()/
--     signInWithPassword() has already produced an authenticated
--     session client-side (confirmed by reading RegisterPage.tsx,
--     LoginPage.tsx, PinSetupPage.tsx, ForgotPinPage.tsx - none of
--     these call an imagecare RPC before the auth call), so no
--     legitimate caller of these functions is ever anon.
-- ============================================================

-- ---- search_path hardening -----------------------------------

ALTER FUNCTION imagecare.fn_log_migration(text, text, text, boolean, text, text) SET search_path = imagecare, pg_catalog;
ALTER FUNCTION imagecare.fn_set_updated_at() SET search_path = imagecare, pg_catalog;
ALTER FUNCTION imagecare.fn_current_user_id() SET search_path = imagecare, pg_catalog;
ALTER FUNCTION imagecare.fn_current_business_id() SET search_path = imagecare, pg_catalog;
ALTER FUNCTION imagecare.fn_is_business_owner(uuid) SET search_path = imagecare, pg_catalog;
ALTER FUNCTION imagecare.fn_can_access_branch(uuid) SET search_path = imagecare, pg_catalog;
ALTER FUNCTION imagecare.fn_get_user_context(uuid) SET search_path = imagecare, pg_catalog;
ALTER FUNCTION imagecare.fn_guard_posted_journal() SET search_path = imagecare, pg_catalog;
ALTER FUNCTION imagecare.fn_get_my_business_id() SET search_path = imagecare, pg_catalog;
ALTER FUNCTION imagecare.fn_register_business(text, text, text) SET search_path = imagecare, pg_catalog;
ALTER FUNCTION imagecare.fn_has_pin() SET search_path = imagecare, pg_catalog;
ALTER FUNCTION imagecare.fn_set_pin(text, text) SET search_path = imagecare, pg_catalog;
ALTER FUNCTION imagecare.fn_verify_pin(text) SET search_path = imagecare, pg_catalog;

-- ---- Narrow anon EXECUTE on SECURITY DEFINER functions ----------
-- Every function below requires an authenticated session internally.
-- authenticated keeps EXECUTE; anon loses it.

REVOKE EXECUTE ON FUNCTION imagecare.fn_audit_trigger() FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_business_engine_health_check(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_can_access_branch(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_check_account_hierarchy_integrity() FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_check_cross_business_refs() FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_check_journal_line_integrity() FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_current_business_id() FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_current_user_id() FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_get_my_business_id() FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_get_user_context(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_has_pin() FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_is_business_owner(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_log_migration(text, text, text, boolean, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_register_business(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_seed_chart_of_accounts(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_set_pin(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_update_credit_balance() FROM anon;
REVOKE EXECUTE ON FUNCTION imagecare.fn_verify_pin(text) FROM anon;

-- ---- Log this migration ----------------------------------------

SELECT imagecare.fn_log_migration(
  'IMC-STAGE-8-0022',
  'Stage 8: Harden search_path on the 13 previously-unhardened SECURITY DEFINER functions and narrow their EXECUTE grant to authenticated only (removed from anon). No functional change - registration and PIN flows always run after an authenticated session already exists.',
  'system',
  false,
  'Re-run ALTER FUNCTION ... RESET search_path for the 13 functions listed and GRANT EXECUTE back to anon on the 18 functions listed, if ever needed.',
  null
);
