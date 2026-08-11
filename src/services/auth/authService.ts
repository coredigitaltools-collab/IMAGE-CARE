// ============================================================
// IMC-BLD-001 | ImageCare ERP Application Architecture v1.0
// File: src/services/auth/authService.ts
// Purpose: Authentication service.
//          All auth operations go through this service.
//          Never call supabase.auth directly from UI components.
// ============================================================

import { supabase } from '../../lib/supabase';
import { parseError, ok, fail, ImageCareError } from '../../types/app';
import type { UserContext, ApiResult } from '../../types/app';
import type { UUID } from '../../types/database';

// ---- Login -------------------------------------------------

export interface LoginCredentials {
  email: string;
  password: string;
  business_id: UUID;
}

export interface LoginResult {
  session: { access_token: string; refresh_token: string };
  user_context: UserContext;
}

export async function login(credentials: LoginCredentials): Promise<ApiResult<LoginResult>> {
  try {
    // 1. Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });

    if (authError || !authData.session) {
      return fail({ code: 'AUTH_INVALID', message: 'Incorrect email or password.' });
    }

    // 2. Load user context (permissions, branches) from database
    const context = await loadUserContext(credentials.business_id);
    if (!context) {
      await supabase.auth.signOut();
      return fail({ code: 'AUTH_INVALID', message: 'Account not found for this business.' });
    }

    if (!context.is_active) {
      await supabase.auth.signOut();
      return fail({ code: 'ACCOUNT_SUSPENDED', message: 'This account has been suspended. Contact your administrator.' });
    }

    // 3. Log the auth event
    await logAuthEvent('login_success', true, credentials.email, context.user_id, credentials.business_id);

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

export async function logout(userId?: UUID, businessId?: UUID): Promise<void> {
  try {
    if (userId && businessId) {
      await logAuthEvent('logout', true, undefined, userId, businessId);
    }
    await supabase.auth.signOut();
  } catch {
    // Always complete logout even if logging fails
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

// ---- User context ------------------------------------------

export async function loadUserContext(businessId: UUID): Promise<UserContext | null> {
  // Get the linked imagecare.users record via auth_user_id
  const { data: authUser } = await supabase.auth.getUser();
  if (!authUser.user) return null;

  const { data: user, error } = await supabase
    .schema('imagecare')
    .from('users')
    .select(`
      id, business_id, branch_id, first_name, last_name,
      email, role, is_active,
      permission_group_members (
        permission_groups (
          id, name, is_active,
          group_permissions (
            module, can_view, can_create, can_edit,
            can_delete, can_approve, can_export, can_sync, branch_scope
          )
        )
      )
    `)
    .eq('auth_user_id', authUser.user.id)
    .eq('business_id', businessId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !user) return null;

  // Build permissions map: most permissive across all groups
  const permissions: UserContext['permissions'] = {};

  const groups = (user as any).permission_group_members ?? [];
  for (const membership of groups) {
    const group = membership?.permission_groups;
    if (!group?.is_active) continue;
    for (const perm of group.group_permissions ?? []) {
      const existing = permissions[perm.module];
      if (!existing) {
        permissions[perm.module] = {
          view:         perm.can_view,
          create:       perm.can_create,
          edit:         perm.can_edit,
          delete:       perm.can_delete,
          approve:      perm.can_approve,
          export:       perm.can_export,
          sync:         perm.can_sync,
          branch_scope: perm.branch_scope,
        };
      } else {
        // Most permissive wins
        permissions[perm.module] = {
          view:         existing.view         || perm.can_view,
          create:       existing.create       || perm.can_create,
          edit:         existing.edit         || perm.can_edit,
          delete:       existing.delete       || perm.can_delete,
          approve:      existing.approve      || perm.can_approve,
          export:       existing.export       || perm.can_export,
          sync:         existing.sync         || perm.can_sync,
          branch_scope: existing.branch_scope === 'all' || perm.branch_scope === 'all'
                          ? 'all' : 'assigned',
        };
      }
    }
  }

  // Load branch access
  const { data: branchAccess } = await supabase
    .schema('imagecare')
    .from('user_branch_access')
    .select('branch_id, can_transact')
    .eq('user_id', user.id);

  return {
    user_id:     user.id,
    business_id: user.business_id,
    branch_id:   user.branch_id,
    email:       user.email,
    first_name:  user.first_name,
    last_name:   user.last_name,
    role:        user.role,
    is_active:   user.is_active,
    permissions,
    branches:    branchAccess ?? [],
  };
}

// ---- Auth event logging ------------------------------------

async function logAuthEvent(
  eventType: string,
  success: boolean,
  email?: string,
  userId?: UUID,
  businessId?: UUID,
  failureReason?: string
) {
  await supabase.rpc('fn_log_auth_event', {
    p_event_type:     eventType,
    p_success:        success,
    p_email:          email ?? null,
    p_user_id:        userId ?? null,
    p_business_id:    businessId ?? null,
    p_failure_reason: failureReason ?? null,
  }).catch(() => null); // Non-blocking - auth must never fail because of logging
}

// ---- Auth state listener -----------------------------------

export function onAuthStateChange(
  callback: (event: string, session: unknown) => void
) {
  const { data } = supabase.auth.onAuthStateChange(callback);
  return data.subscription;
}
