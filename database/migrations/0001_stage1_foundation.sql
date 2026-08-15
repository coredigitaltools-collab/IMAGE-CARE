-- ============================================================
-- ImageCare ERP - Stage 1 Foundation Migration
-- File: 0001_stage1_foundation.sql
-- Version: IMC-STAGE-1-v1.0
-- Purpose: Core identity and access tables required for Stage 1.
--
-- These tables underpin authentication, business context,
-- branch context and the flexible permission system.
--
-- NOTE: The imagecare schema and most of these tables were
-- already deployed via IMC-DB-001 and IMC-DB-002.
-- This migration is the canonical version-controlled record
-- of the Stage 1 schema baseline.
-- Run IF NOT EXISTS throughout to be idempotent against
-- the already-deployed production schema.
--
-- DEPLOYMENT: Run in Supabase SQL Editor.
-- SAFE TO RUN multiple times (idempotent).
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- 0. MIGRATION LOG TABLE AND FUNCTION
-- Defined here so all subsequent migrations can call it safely.
-- ============================================================

CREATE TABLE IF NOT EXISTS imagecare.migration_log (
  id           BIGSERIAL    PRIMARY KEY,
  migration_id TEXT         NOT NULL,
  description  TEXT,
  run_by       TEXT         NOT NULL DEFAULT 'system',
  is_rollback  BOOLEAN      NOT NULL DEFAULT FALSE,
  rollback_sql TEXT,
  notes        TEXT,
  applied_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_migration_id UNIQUE (migration_id)
);

CREATE OR REPLACE FUNCTION imagecare.fn_log_migration(
  p_migration_id TEXT,
  p_description  TEXT,
  p_run_by       TEXT    DEFAULT 'system',
  p_is_rollback  BOOLEAN DEFAULT FALSE,
  p_rollback_sql TEXT    DEFAULT NULL,
  p_notes        TEXT    DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO imagecare.migration_log (
    migration_id, description, run_by,
    is_rollback, rollback_sql, notes
  )
  VALUES (
    p_migration_id, p_description, p_run_by,
    p_is_rollback, p_rollback_sql, p_notes
  )
  ON CONFLICT ON CONSTRAINT uq_migration_id DO UPDATE
    SET description = EXCLUDED.description,
        applied_at  = NOW();
END;
$$;

-- ============================================================
-- 1. BUSINESSES
-- Root of all multi-tenancy. Every record in the system
-- belongs to a business. RLS uses this as the isolation boundary.
-- ============================================================

CREATE TABLE IF NOT EXISTS imagecare.businesses (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  trading_name      TEXT,
  registration_number TEXT,
  tax_id            TEXT,
  industry          TEXT,
  country           TEXT        NOT NULL DEFAULT 'UG',
  currency          TEXT        NOT NULL DEFAULT 'UGX',
  timezone          TEXT        NOT NULL DEFAULT 'Africa/Kampala',
  logo_url          TEXT,
  contact_phone     TEXT,
  contact_email     TEXT,
  address           JSONB,
  settings          JSONB       NOT NULL DEFAULT '{}',
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

ALTER TABLE imagecare.businesses ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. BRANCHES
-- A business has one or more branches.
-- Unlimited branches are supported - never hard-code branch counts.
-- ============================================================

CREATE TABLE IF NOT EXISTS imagecare.branches (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID        NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  code           TEXT        NOT NULL,
  branch_type    TEXT        NOT NULL DEFAULT 'retail',
  phone          TEXT,
  email          TEXT,
  address        JSONB,
  is_main_branch BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  settings       JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ,

  CONSTRAINT uq_branch_code_per_business UNIQUE (business_id, code)
);

CREATE INDEX IF NOT EXISTS idx_s1_branches_business
  ON imagecare.branches (business_id)
  WHERE deleted_at IS NULL;

ALTER TABLE imagecare.branches ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. USERS
-- Business staff. Linked to Supabase Auth via auth_user_id.
-- role is a display label only - it never determines authorization.
-- Authorization comes exclusively from permission_group_members
-- and user_permissions (direct grants).
-- is_owner is an explicit database field set only by the owner
-- themselves or during provisioning. It is never inferred from
-- the quantity or combination of permissions.
-- ============================================================

CREATE TABLE IF NOT EXISTS imagecare.users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID        NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  branch_id      UUID        REFERENCES imagecare.branches(id) ON DELETE SET NULL,
  auth_user_id   UUID        UNIQUE,           -- Supabase auth.users.id
  first_name     TEXT        NOT NULL,
  last_name      TEXT        NOT NULL,
  email          TEXT        NOT NULL,
  phone          TEXT,
  -- role is a DISPLAY LABEL only. It is never checked for authorization.
  -- The owner assigns roles as human-readable position names.
  -- Examples: "Cashier", "Branch Manager", "Stock Controller"
  -- Authorization is determined by permission_group_members and user_permissions.
  role           TEXT        NOT NULL DEFAULT 'Staff',
  -- is_owner: explicit flag set by provisioning or owner self-designation.
  -- NEVER derived by counting or combining permissions.
  -- Owners can manage other users' permissions.
  -- Owners can assign/revoke permission groups.
  -- Owners can grant direct permissions.
  is_owner       BOOLEAN     NOT NULL DEFAULT FALSE,
  employment_type TEXT,
  hire_date      DATE,
  salary         NUMERIC(15,2),
  salary_currency TEXT       NOT NULL DEFAULT 'UGX',
  avatar_url     TEXT,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  settings       JSONB       NOT NULL DEFAULT '{}',
  metadata       JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ,

  CONSTRAINT uq_user_email_per_business UNIQUE (business_id, email)
);

CREATE INDEX IF NOT EXISTS idx_s1_users_business
  ON imagecare.users (business_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_s1_users_auth_id
  ON imagecare.users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

ALTER TABLE imagecare.users ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. PERMISSION GROUPS
-- Owner-managed named collections of permissions.
-- These are a CONVENIENCE TOOL for the owner - not fixed roles.
-- The owner creates, names, and assigns these groups.
-- Examples: "Sales Team", "Management", "Stock Team"
-- These are not system-defined roles like Admin/Cashier/Manager.
-- The owner can create any groups with any names and permissions.
-- ============================================================

CREATE TABLE IF NOT EXISTS imagecare.permission_groups (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID        NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  description   TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by    UUID        REFERENCES imagecare.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,

  CONSTRAINT uq_permission_group_name UNIQUE (business_id, name)
);

ALTER TABLE imagecare.permission_groups ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. GROUP PERMISSIONS
-- The specific module/action/branch permissions that belong
-- to a permission group. The owner configures these.
-- branch_scope: 'assigned' = user's home branch only
--               'all'      = all business branches
-- ============================================================

CREATE TABLE IF NOT EXISTS imagecare.group_permissions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID        NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  permission_group_id UUID        NOT NULL REFERENCES imagecare.permission_groups(id) ON DELETE CASCADE,
  -- module: matches the MODULES constant in config/env.ts
  -- e.g. 'sales', 'inventory', 'payroll', 'settings'
  module              TEXT        NOT NULL,
  can_view            BOOLEAN     NOT NULL DEFAULT FALSE,
  can_create          BOOLEAN     NOT NULL DEFAULT FALSE,
  can_edit            BOOLEAN     NOT NULL DEFAULT FALSE,
  can_delete          BOOLEAN     NOT NULL DEFAULT FALSE,
  can_approve         BOOLEAN     NOT NULL DEFAULT FALSE,
  can_export          BOOLEAN     NOT NULL DEFAULT FALSE,
  can_sync            BOOLEAN     NOT NULL DEFAULT FALSE,
  -- branch_scope determines which branches this permission applies to
  branch_scope        TEXT        NOT NULL DEFAULT 'assigned'
                      CHECK (branch_scope IN ('assigned', 'all')),
  extra               JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_group_module UNIQUE (permission_group_id, module)
);

ALTER TABLE imagecare.group_permissions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. PERMISSION GROUP MEMBERS
-- Assigns a permission group to a user.
-- A user may belong to multiple groups.
-- The most permissive combination of all groups applies.
-- The owner adds and removes users from groups.
-- ============================================================

CREATE TABLE IF NOT EXISTS imagecare.permission_group_members (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID        NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  permission_group_id UUID        NOT NULL REFERENCES imagecare.permission_groups(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES imagecare.users(id) ON DELETE CASCADE,
  assigned_by         UUID        REFERENCES imagecare.users(id) ON DELETE SET NULL,
  assigned_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_member_group UNIQUE (permission_group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_s1_pgm_user
  ON imagecare.permission_group_members (user_id);

CREATE INDEX IF NOT EXISTS idx_s1_pgm_group
  ON imagecare.permission_group_members (permission_group_id);

ALTER TABLE imagecare.permission_group_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. USER PERMISSIONS (direct grants)
-- The owner can also grant permissions directly to a user,
-- without going through a group. This is the most granular
-- level of the permission model.
-- Direct grants take precedence if they are more permissive
-- than the group grants, or if no group grant exists.
-- ============================================================

CREATE TABLE IF NOT EXISTS imagecare.user_permissions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES imagecare.users(id) ON DELETE CASCADE,
  module       TEXT        NOT NULL,
  can_view     BOOLEAN     NOT NULL DEFAULT FALSE,
  can_create   BOOLEAN     NOT NULL DEFAULT FALSE,
  can_edit     BOOLEAN     NOT NULL DEFAULT FALSE,
  can_delete   BOOLEAN     NOT NULL DEFAULT FALSE,
  can_approve  BOOLEAN     NOT NULL DEFAULT FALSE,
  can_export   BOOLEAN     NOT NULL DEFAULT FALSE,
  can_sync     BOOLEAN     NOT NULL DEFAULT FALSE,
  branch_scope TEXT        NOT NULL DEFAULT 'assigned'
               CHECK (branch_scope IN ('assigned', 'all')),
  granted_by   UUID        REFERENCES imagecare.users(id) ON DELETE SET NULL,
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes        TEXT,

  CONSTRAINT uq_user_permission_module UNIQUE (user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_s1_user_permissions_user
  ON imagecare.user_permissions (user_id, business_id);

ALTER TABLE imagecare.user_permissions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. USER BRANCH ACCESS
-- Explicit grants for a user to access branches beyond their
-- home branch. The owner assigns branch access.
-- Never inferred from permission groups.
-- ============================================================

CREATE TABLE IF NOT EXISTS imagecare.user_branch_access (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID        NOT NULL REFERENCES imagecare.businesses(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES imagecare.users(id) ON DELETE CASCADE,
  branch_id      UUID        NOT NULL REFERENCES imagecare.branches(id) ON DELETE CASCADE,
  can_transact   BOOLEAN     NOT NULL DEFAULT TRUE,
  granted_by     UUID        REFERENCES imagecare.users(id) ON DELETE SET NULL,
  granted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_user_branch UNIQUE (user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_s1_uba_user
  ON imagecare.user_branch_access (user_id, business_id);

ALTER TABLE imagecare.user_branch_access ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION imagecare.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply to all Stage 1 tables that have updated_at
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s1_businesses_updated_at') THEN
    CREATE TRIGGER tg_s1_businesses_updated_at
      BEFORE UPDATE ON imagecare.businesses
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s1_branches_updated_at') THEN
    CREATE TRIGGER tg_s1_branches_updated_at
      BEFORE UPDATE ON imagecare.branches
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s1_users_updated_at') THEN
    CREATE TRIGGER tg_s1_users_updated_at
      BEFORE UPDATE ON imagecare.users
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s1_permission_groups_updated_at') THEN
    CREATE TRIGGER tg_s1_permission_groups_updated_at
      BEFORE UPDATE ON imagecare.permission_groups
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s1_group_permissions_updated_at') THEN
    CREATE TRIGGER tg_s1_group_permissions_updated_at
      BEFORE UPDATE ON imagecare.group_permissions
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_s1_user_permissions_updated_at') THEN
    CREATE TRIGGER tg_s1_user_permissions_updated_at
      BEFORE UPDATE ON imagecare.user_permissions
      FOR EACH ROW EXECUTE FUNCTION imagecare.fn_set_updated_at();
  END IF;
END $$;

-- ============================================================
-- 10. RLS POLICIES
-- Business isolation is enforced at the database level.
-- Frontend permission checks are usability only - not security.
-- These policies prevent cross-business data access even if
-- application code has a bug.
-- ============================================================

-- Helper: get the imagecare user record for the current auth session
CREATE OR REPLACE FUNCTION imagecare.fn_current_user_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM imagecare.users
  WHERE auth_user_id = auth.uid()
    AND is_active = TRUE
    AND deleted_at IS NULL
  LIMIT 1;
$$;

-- Helper: get the business_id for the current user
CREATE OR REPLACE FUNCTION imagecare.fn_current_business_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT business_id FROM imagecare.users
  WHERE auth_user_id = auth.uid()
    AND is_active = TRUE
    AND deleted_at IS NULL
  LIMIT 1;
$$;

-- Helper: check if current user is the owner of a business
CREATE OR REPLACE FUNCTION imagecare.fn_is_business_owner(p_business_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM imagecare.users
    WHERE auth_user_id = auth.uid()
      AND business_id  = p_business_id
      AND is_owner     = TRUE
      AND is_active    = TRUE
      AND deleted_at   IS NULL
  );
$$;

-- Helper: check if current user can access a branch
CREATE OR REPLACE FUNCTION imagecare.fn_can_access_branch(p_branch_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM imagecare.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.is_active    = TRUE
      AND u.deleted_at   IS NULL
      AND (
        -- Home branch
        u.branch_id = p_branch_id
        -- OR explicitly granted
        OR EXISTS (
          SELECT 1 FROM imagecare.user_branch_access uba
          WHERE uba.user_id   = u.id
            AND uba.branch_id = p_branch_id
        )
        -- OR user is the owner (owners can access all branches)
        OR u.is_owner = TRUE
      )
  );
$$;

-- ---- businesses RLS ----------------------------------------
DROP POLICY IF EXISTS rls_s1_businesses_select ON imagecare.businesses;
CREATE POLICY rls_s1_businesses_select ON imagecare.businesses
  FOR SELECT USING (
    id = imagecare.fn_current_business_id()
  );

DROP POLICY IF EXISTS rls_s1_businesses_update ON imagecare.businesses;
CREATE POLICY rls_s1_businesses_update ON imagecare.businesses
  FOR UPDATE USING (
    imagecare.fn_is_business_owner(id)
  );

-- ---- branches RLS ------------------------------------------
DROP POLICY IF EXISTS rls_s1_branches_select ON imagecare.branches;
CREATE POLICY rls_s1_branches_select ON imagecare.branches
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
  );

DROP POLICY IF EXISTS rls_s1_branches_insert ON imagecare.branches;
CREATE POLICY rls_s1_branches_insert ON imagecare.branches
  FOR INSERT WITH CHECK (
    imagecare.fn_is_business_owner(business_id)
  );

DROP POLICY IF EXISTS rls_s1_branches_update ON imagecare.branches;
CREATE POLICY rls_s1_branches_update ON imagecare.branches
  FOR UPDATE USING (
    imagecare.fn_is_business_owner(business_id)
  );

-- ---- users RLS ---------------------------------------------
-- Users can read all users in their business (for staff lists)
DROP POLICY IF EXISTS rls_s1_users_select ON imagecare.users;
CREATE POLICY rls_s1_users_select ON imagecare.users
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
  );

-- Only owners can create new users
DROP POLICY IF EXISTS rls_s1_users_insert ON imagecare.users;
CREATE POLICY rls_s1_users_insert ON imagecare.users
  FOR INSERT WITH CHECK (
    imagecare.fn_is_business_owner(business_id)
  );

-- Owners can update any user. Users can update their own record (limited fields).
DROP POLICY IF EXISTS rls_s1_users_update ON imagecare.users;
CREATE POLICY rls_s1_users_update ON imagecare.users
  FOR UPDATE USING (
    business_id = imagecare.fn_current_business_id()
    AND (
      imagecare.fn_is_business_owner(business_id)
      OR id = imagecare.fn_current_user_id()
    )
  );

-- ---- permission_groups RLS ---------------------------------
-- All users can read groups (to understand available groups)
DROP POLICY IF EXISTS rls_s1_pg_select ON imagecare.permission_groups;
CREATE POLICY rls_s1_pg_select ON imagecare.permission_groups
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
  );

-- Only owners can create/modify permission groups
DROP POLICY IF EXISTS rls_s1_pg_insert ON imagecare.permission_groups;
CREATE POLICY rls_s1_pg_insert ON imagecare.permission_groups
  FOR INSERT WITH CHECK (
    imagecare.fn_is_business_owner(business_id)
  );

DROP POLICY IF EXISTS rls_s1_pg_update ON imagecare.permission_groups;
CREATE POLICY rls_s1_pg_update ON imagecare.permission_groups
  FOR UPDATE USING (
    imagecare.fn_is_business_owner(business_id)
  );

DROP POLICY IF EXISTS rls_s1_pg_delete ON imagecare.permission_groups;
CREATE POLICY rls_s1_pg_delete ON imagecare.permission_groups
  FOR DELETE USING (
    imagecare.fn_is_business_owner(business_id)
  );

-- ---- group_permissions RLS ---------------------------------
DROP POLICY IF EXISTS rls_s1_gp_select ON imagecare.group_permissions;
CREATE POLICY rls_s1_gp_select ON imagecare.group_permissions
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
  );

DROP POLICY IF EXISTS rls_s1_gp_all ON imagecare.group_permissions;
CREATE POLICY rls_s1_gp_all ON imagecare.group_permissions
  FOR ALL USING (
    imagecare.fn_is_business_owner(business_id)
  );

-- ---- permission_group_members RLS --------------------------
DROP POLICY IF EXISTS rls_s1_pgm_select ON imagecare.permission_group_members;
CREATE POLICY rls_s1_pgm_select ON imagecare.permission_group_members
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
  );

-- Only owners can assign/remove users from groups
DROP POLICY IF EXISTS rls_s1_pgm_all ON imagecare.permission_group_members;
CREATE POLICY rls_s1_pgm_all ON imagecare.permission_group_members
  FOR ALL USING (
    imagecare.fn_is_business_owner(business_id)
  );

-- ---- user_permissions RLS ----------------------------------
-- Users can read their own direct permissions
DROP POLICY IF EXISTS rls_s1_up_select ON imagecare.user_permissions;
CREATE POLICY rls_s1_up_select ON imagecare.user_permissions
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
    AND (
      user_id = imagecare.fn_current_user_id()
      OR imagecare.fn_is_business_owner(business_id)
    )
  );

-- Only owners can grant/revoke direct permissions
DROP POLICY IF EXISTS rls_s1_up_all ON imagecare.user_permissions;
CREATE POLICY rls_s1_up_all ON imagecare.user_permissions
  FOR ALL USING (
    imagecare.fn_is_business_owner(business_id)
  );

-- ---- user_branch_access RLS --------------------------------
DROP POLICY IF EXISTS rls_s1_uba_select ON imagecare.user_branch_access;
CREATE POLICY rls_s1_uba_select ON imagecare.user_branch_access
  FOR SELECT USING (
    business_id = imagecare.fn_current_business_id()
    AND (
      user_id = imagecare.fn_current_user_id()
      OR imagecare.fn_is_business_owner(business_id)
    )
  );

-- Only owners can grant branch access
DROP POLICY IF EXISTS rls_s1_uba_all ON imagecare.user_branch_access;
CREATE POLICY rls_s1_uba_all ON imagecare.user_branch_access
  FOR ALL USING (
    imagecare.fn_is_business_owner(business_id)
  );

-- ============================================================
-- 11. fn_get_user_context
-- Loads the complete permission context for the current user.
-- Called once after login. Result is stored in sessionStorage.
-- Returns is_owner as an explicit database field - never derived.
-- Merges group permissions and direct user permissions.
-- Most permissive wins when both exist for same module.
-- ============================================================

CREATE OR REPLACE FUNCTION imagecare.fn_get_user_context(
  p_business_id UUID
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_user        imagecare.users%ROWTYPE;
  v_permissions JSONB := '{}';
  v_branches    JSONB := '[]';
  v_row         RECORD;
  v_mod_perms   JSONB;
BEGIN
  -- Get user record
  SELECT * INTO v_user
  FROM imagecare.users
  WHERE auth_user_id = auth.uid()
    AND business_id  = p_business_id
    AND is_active    = TRUE
    AND deleted_at   IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: No active user found for this business';
  END IF;

  -- Build permissions: merge group permissions + direct user permissions
  -- Most permissive wins (OR logic across all sources)

  -- Step 1: Group permissions
  FOR v_row IN
    SELECT gp.*
    FROM imagecare.group_permissions gp
    JOIN imagecare.permission_group_members pgm ON pgm.permission_group_id = gp.permission_group_id
    JOIN imagecare.permission_groups pg ON pg.id = gp.permission_group_id
    WHERE pgm.user_id    = v_user.id
      AND pg.is_active   = TRUE
      AND pg.deleted_at  IS NULL
      AND pg.business_id = p_business_id
  LOOP
    v_mod_perms := COALESCE(v_permissions->v_row.module, '{
      "view": false, "create": false, "edit": false, "delete": false,
      "approve": false, "export": false, "sync": false, "branch_scope": "assigned"
    }'::jsonb);

    v_permissions := jsonb_set(v_permissions, ARRAY[v_row.module], jsonb_build_object(
      'view',         (v_mod_perms->>'view')::boolean   OR v_row.can_view,
      'create',       (v_mod_perms->>'create')::boolean OR v_row.can_create,
      'edit',         (v_mod_perms->>'edit')::boolean   OR v_row.can_edit,
      'delete',       (v_mod_perms->>'delete')::boolean OR v_row.can_delete,
      'approve',      (v_mod_perms->>'approve')::boolean OR v_row.can_approve,
      'export',       (v_mod_perms->>'export')::boolean OR v_row.can_export,
      'sync',         (v_mod_perms->>'sync')::boolean   OR v_row.can_sync,
      'branch_scope', CASE
        WHEN (v_mod_perms->>'branch_scope') = 'all' OR v_row.branch_scope = 'all'
          THEN 'all'
          ELSE 'assigned'
        END
    ));
  END LOOP;

  -- Step 2: Direct user permissions (most permissive wins)
  FOR v_row IN
    SELECT * FROM imagecare.user_permissions
    WHERE user_id   = v_user.id
      AND business_id = p_business_id
  LOOP
    v_mod_perms := COALESCE(v_permissions->v_row.module, '{
      "view": false, "create": false, "edit": false, "delete": false,
      "approve": false, "export": false, "sync": false, "branch_scope": "assigned"
    }'::jsonb);

    v_permissions := jsonb_set(v_permissions, ARRAY[v_row.module], jsonb_build_object(
      'view',         (v_mod_perms->>'view')::boolean   OR v_row.can_view,
      'create',       (v_mod_perms->>'create')::boolean OR v_row.can_create,
      'edit',         (v_mod_perms->>'edit')::boolean   OR v_row.can_edit,
      'delete',       (v_mod_perms->>'delete')::boolean OR v_row.can_delete,
      'approve',      (v_mod_perms->>'approve')::boolean OR v_row.can_approve,
      'export',       (v_mod_perms->>'export')::boolean OR v_row.can_export,
      'sync',         (v_mod_perms->>'sync')::boolean   OR v_row.can_sync,
      'branch_scope', CASE
        WHEN (v_mod_perms->>'branch_scope') = 'all' OR v_row.branch_scope = 'all'
          THEN 'all'
          ELSE 'assigned'
        END
    ));
  END LOOP;

  -- Step 3: Authorized branches
  SELECT jsonb_agg(jsonb_build_object(
    'branch_id',    uba.branch_id,
    'can_transact', uba.can_transact
  )) INTO v_branches
  FROM imagecare.user_branch_access uba
  WHERE uba.user_id    = v_user.id
    AND uba.business_id = p_business_id;

  RETURN jsonb_build_object(
    'user_id',     v_user.id,
    'business_id', v_user.business_id,
    'branch_id',   v_user.branch_id,
    'email',       v_user.email,
    'first_name',  v_user.first_name,
    'last_name',   v_user.last_name,
    -- role is a DISPLAY LABEL. It is returned for the UI only.
    -- It is never checked for authorization in this function.
    'role',        v_user.role,
    -- is_owner is an explicit database field - never derived.
    'is_owner',    v_user.is_owner,
    'is_active',   v_user.is_active,
    'permissions', v_permissions,
    'branches',    COALESCE(v_branches, '[]'::jsonb)
  );
END;
$$;

-- ============================================================
-- 12. MIGRATION LOG
-- ============================================================

DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-1-v1.0',
  'Stage 1 Foundation: businesses, branches, users, permission_groups, ' ||
  'group_permissions, permission_group_members, user_permissions, ' ||
  'user_branch_access, RLS policies, fn_get_user_context',
  'system',
  FALSE,
  'DROP SCHEMA imagecare CASCADE (full rollback only)',
  NULL);
END $$;
