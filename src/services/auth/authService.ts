// ============================================================
// ImageCare ERP - Authentication Service
// File: src/services/auth/authService.ts
// Purpose: Authentication and user context loading.
//
// Authentication establishes IDENTITY only.
// Authorization (what the user can do) comes from:
//   - imagecare.users.is_owner (explicit DB field)
//   - permission_group_members (group-based permissions)
//   - user_permissions (direct permission grants)
//
// The user's role field is a display label. It is loaded
// into context for display purposes only and is never
// checked for authorization.
// ============================================================

import { supabase } from '../../lib/supabase';
import { parseError, ok, fail, ImageCareError } from '../../types/app';
import type { UserContext, ApiResult } from '../../types/app';
import type { UUID } from '../../types/database';

// ---- Login -------------------------------------------------

export interface LoginCredentials {
  email:       string;
  password:    string;
  business_id: UUID;
}

export interface LoginResult {
  session: { access_token: string; refresh_token: string };
  user_context: UserContext;
}

export async function login(credentials: LoginCredentials): Promise<ApiResult<LoginResult>> {
  try {
    // 1. Authenticate with Supabase Auth (establishes identity)
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email:    credentials.email,
      password: credentials.password,
    });

    if (authError || !authData.session) {
      return fail({ code: 'AUTH_INVALID', message: 'Incorrect email or password.' });
    }

    // 2. Load full user context (identity + permissions + is_owner)
    const context = await loadUserContext(credentials.business_id);
    if (!context) {
      await supabase.auth.signOut();
      return fail({ code: 'AUTH_INVALID', message: 'Account not found for this business.' });
    }

    if (!context.is_active) {
      await supabase.auth.signOut();
      return fail({ code: 'ACCOUNT_SUSPENDED', message: 'This account has been suspended. Contact your administrator.' });
    }

    return ok({
      session: {
        access_token:  authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      },
      user_context: context,
    });

  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Logout ------------------------------------------------

export async function logout(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    await supabase.auth.signOut().catch(() => null);
  }
}

// ---- Session -----------------------------------------------

export async function getActiveSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session;
}

export async function refreshSession() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw new ImageCareError('AUTH_EXPIRED', 'Session expired. Please log in again.');
  return data.session;
}

// ---- User Context ------------------------------------------
// Calls imagecare.fn_get_user_context() which:
//   - Returns is_owner from imagecare.users.is_owner (explicit DB field)
//   - Merges group permissions (owner-managed collections)
//   - Merges direct user permissions
//   - Returns role as a display label only
//   - Returns authorized branches

export async function loadUserContext(businessId: UUID): Promise<UserContext | null> {
  try {
    // Use the database function that correctly builds the permission context
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_get_user_context', {
      p_business_id: businessId,
    });

    if (error || !data) return null;

    const raw = data as {
      user_id:     string;
      business_id: string;
      branch_id:   string | null;
      email:       string;
      first_name:  string;
      last_name:   string;
      role:        string;
      is_owner:    boolean;   // explicit DB field - never inferred
      is_active:   boolean;
      permissions: Record<string, {
        view: boolean; create: boolean; edit: boolean;
        delete: boolean; approve: boolean; export: boolean;
        sync: boolean; branch_scope: 'assigned' | 'all';
      }>;
      branches: Array<{ branch_id: string; can_transact: boolean }>;
    };

    return {
      user_id:     raw.user_id,
      business_id: raw.business_id,
      branch_id:   raw.branch_id,
      email:       raw.email,
      first_name:  raw.first_name,
      last_name:   raw.last_name,
      role:        raw.role,
      is_owner:    raw.is_owner,  // read directly from DB, never derived
      is_active:   raw.is_active,
      permissions: raw.permissions ?? {},
      branches:    raw.branches   ?? [],
    };
  } catch {
    return null;
  }
}

// Fallback: load context directly from tables when fn_get_user_context
// is not yet available (e.g. first run before Stage 1 migration)
export async function loadUserContextFallback(businessId: UUID): Promise<UserContext | null> {
  const { data: authUser } = await supabase.auth.getUser();
  if (!authUser.user) return null;

  const { data: user, error } = await supabase
    .schema('imagecare')
    .from('users')
    .select(`
      id, business_id, branch_id, first_name, last_name,
      email, role, is_owner, is_active,
      permission_group_members (
        permission_groups (
          id, name, is_active,
          group_permissions (
            module, can_view, can_create, can_edit,
            can_delete, can_approve, can_export, can_sync, branch_scope
          )
        )
      ),
      user_permissions (
        module, can_view, can_create, can_edit,
        can_delete, can_approve, can_export, can_sync, branch_scope
      )
    `)
    .eq('auth_user_id', authUser.user.id)
    .eq('business_id', businessId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !user) return null;

  // The select returns a joined shape - use unknown cast for nested access
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = user as Record<string, any>;
  const permissions: UserContext['permissions'] = {};

  // Merge group permissions
  for (const membership of u.permission_group_members ?? []) {
    const group = membership?.permission_groups;
    if (!group?.is_active) continue;
    for (const perm of group.group_permissions ?? []) {
      const ex = permissions[perm.module];
      permissions[perm.module] = ex ? {
        view:         ex.view         || perm.can_view,
        create:       ex.create       || perm.can_create,
        edit:         ex.edit         || perm.can_edit,
        delete:       ex.delete       || perm.can_delete,
        approve:      ex.approve      || perm.can_approve,
        export:       ex.export       || perm.can_export,
        sync:         ex.sync         || perm.can_sync,
        branch_scope: ex.branch_scope === 'all' || perm.branch_scope === 'all' ? 'all' : 'assigned',
      } : {
        view:   perm.can_view,   create:  perm.can_create,
        edit:   perm.can_edit,   delete:  perm.can_delete,
        approve: perm.can_approve, export: perm.can_export,
        sync:   perm.can_sync,  branch_scope: perm.branch_scope,
      };
    }
  }

  // Merge direct user permissions (most permissive wins)
  for (const perm of u.user_permissions ?? []) {
    const ex = permissions[perm.module];
    permissions[perm.module] = ex ? {
      view:         ex.view         || perm.can_view,
      create:       ex.create       || perm.can_create,
      edit:         ex.edit         || perm.can_edit,
      delete:       ex.delete       || perm.can_delete,
      approve:      ex.approve      || perm.can_approve,
      export:       ex.export       || perm.can_export,
      sync:         ex.sync         || perm.can_sync,
      branch_scope: ex.branch_scope === 'all' || perm.branch_scope === 'all' ? 'all' : 'assigned',
    } : {
      view:   perm.can_view,   create:  perm.can_create,
      edit:   perm.can_edit,   delete:  perm.can_delete,
      approve: perm.can_approve, export: perm.can_export,
      sync:   perm.can_sync,  branch_scope: perm.branch_scope,
    };
  }

  // Load branch access
  const { data: branchAccess } = await supabase
    .schema('imagecare')
    .from('user_branch_access')
    .select('branch_id, can_transact')
    .eq('user_id', u.id);

  return {
    user_id:     u.id,
    business_id: u.business_id,
    branch_id:   u.branch_id,
    email:       u.email,
    first_name:  u.first_name,
    last_name:   u.last_name,
    role:        u.role,
    is_owner:    u.is_owner,   // explicit DB field - never inferred
    is_active:   u.is_active,
    permissions,
    branches:    branchAccess ?? [],
  };
}

// ---- Auth state listener -----------------------------------

export function onAuthStateChange(
  callback: (event: string, session: unknown) => void
) {
  const { data } = supabase.auth.onAuthStateChange(callback);
  return data.subscription;
}
