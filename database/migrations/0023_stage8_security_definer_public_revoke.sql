-- ============================================================
-- ImageCare ERP - Stage 8: Correct SECURITY DEFINER EXECUTE grants
-- File: database/migrations/0023_stage8_security_definer_public_revoke.sql
--
-- Purpose: 0022 revoked EXECUTE from `anon` directly, but a live
--   check afterward showed every one of these functions is still
--   EXECUTE-granted to PUBLIC (Postgres's default on function
--   creation), which anon inherits regardless of the anon-specific
--   revoke. This migration closes that: REVOKE EXECUTE FROM PUBLIC
--   on every SECURITY DEFINER function in imagecare, and explicitly
--   (re)GRANT EXECUTE TO authenticated so authenticated does not
--   lose access that, in some cases (fn_get_user_context), was only
--   ever coming from the PUBLIC grant rather than a direct one.
-- ============================================================

REVOKE EXECUTE ON FUNCTION imagecare.fn_audit_trigger() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_business_engine_health_check(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_can_access_branch(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_check_account_hierarchy_integrity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_check_cross_business_refs() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_check_journal_line_integrity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_current_business_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_current_user_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_get_my_business_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_get_user_context(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_has_pin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_is_business_owner(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_log_migration(text, text, text, boolean, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_register_business(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_seed_chart_of_accounts(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_set_pin(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_update_credit_balance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION imagecare.fn_verify_pin(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION imagecare.fn_audit_trigger() TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_business_engine_health_check(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_can_access_branch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_check_account_hierarchy_integrity() TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_check_cross_business_refs() TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_check_journal_line_integrity() TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_current_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_current_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_get_my_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_get_user_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_has_pin() TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_is_business_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_log_migration(text, text, text, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_register_business(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_seed_chart_of_accounts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_set_pin(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_update_credit_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION imagecare.fn_verify_pin(text) TO authenticated;

SELECT imagecare.fn_log_migration(
  'IMC-STAGE-8-0023',
  'Stage 8 correction: 0022 revoked EXECUTE from anon directly, but every SECURITY DEFINER function was still reachable via the default PUBLIC grant. This migration revokes EXECUTE FROM PUBLIC on all 18 functions and explicitly grants it to authenticated, closing the anon gap without regressing authenticated access.',
  'system',
  false,
  'GRANT EXECUTE ON the 18 functions listed back TO PUBLIC, if ever needed.',
  null
);
