-- ============================================================
-- ImageCare ERP - Stage 8: Authenticated Table Grants
-- File: database/migrations/0021_stage8_authenticated_table_grants.sql
--
-- Purpose: Phase 1 live verification (2026-08-24) confirmed that
--   every table in the imagecare schema has ZERO table-level
--   privileges for the `authenticated` role. RLS policies are
--   already correctly scoped by business/branch, but Postgres
--   checks table-level GRANTs before RLS is ever evaluated, so
--   every direct PostgREST call against imagecare tables has been
--   failing regardless of RLS correctness. This migration grants
--   `authenticated` exactly the privileges RLS already expects it
--   to have, and nothing more. It does NOT grant `anon` anything
--   on business tables, and does NOT touch RLS.
--
-- Scope:
--   - GRANT USAGE on schema imagecare to authenticated (idempotent;
--     already present, restated here for a complete, self-contained
--     migration).
--   - GRANT SELECT, INSERT, UPDATE, DELETE on every table to
--     authenticated. RLS policies remain the actual row-level
--     boundary; this migration only removes the table-level block
--     that was preventing RLS from ever being reached.
--   - GRANT USAGE, SELECT on every sequence to authenticated (for
--     any serial/identity columns).
--   - ALTER DEFAULT PRIVILEGES so future tables/sequences created in
--     this schema automatically pick up the same grants, preventing
--     this exact gap from recurring.
--   - anon is left untouched: it already has schema USAGE only
--     (needed for PostgREST schema routing) and no table grants,
--     which is correct - anonymous users must never read/write
--     business data directly.
-- ============================================================

-- ---- Schema usage (idempotent) ------------------------------

GRANT USAGE ON SCHEMA imagecare TO authenticated;

-- ---- Table privileges ----------------------------------------
-- RLS policies already scope every row by business_id/branch_id
-- and, on owner-only tables, by fn_is_business_owner(). Granting
-- table-level access here does not bypass RLS - RLS still applies
-- to every one of these grants.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA imagecare TO authenticated;

-- ---- Sequence privileges ---------------------------------------

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA imagecare TO authenticated;

-- ---- Default privileges for future objects ----------------------
-- Ensures a future migration that adds a table/sequence to this
-- schema does not silently reintroduce this gap.

ALTER DEFAULT PRIVILEGES IN SCHEMA imagecare
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA imagecare
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- ---- Log this migration ----------------------------------------

SELECT imagecare.fn_log_migration(
  'IMC-STAGE-8-0021',
  'Stage 8: Grant authenticated table/sequence privileges on all imagecare objects (RLS remains the row-level boundary). Fixes the confirmed root cause of the Bills/Payroll/Cash Flow/Branches 403s and, in fact, every direct-table call in the app.',
  'system',
  false,
  'REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA imagecare FROM authenticated; REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA imagecare FROM authenticated;',
  null
);
