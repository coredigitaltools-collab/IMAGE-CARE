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
//
// BUSINESS ID: Users never see or enter a Business ID. It is
// resolved server-side from the authenticated session via
// fn_get_my_business_id(), which relies on imagecare.users.
// auth_user_id being globally UNIQUE (one Supabase Auth account
// = exactly one business). business_id remains a required,
// internal database field everywhere else (RLS, every table,
// every RPC) - it is only absent from the login/registration UI.
//
// DAILY PIN: A per-user 4-digit PIN is a convenience unlock layer
// on top of this authentication, never a replacement for it. See
// setPin/verifyPin/hasPin below and 0020_stage7_pin_auth.sql.
// ============================================================

import { supabase } from '../../lib/supabase';
import { parseError, ok, fail, ImageCareError } from '../../types/app';
import type { UserContext, ApiResult } from '../../types/app';
import type { UUID } from '../../types/database';

// ---- Login -------------------------------------------------

export interface LoginCredentials {
  email:       string;
  password:    string;
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

    // 2. Resolve business_id server-side. The user never supplies this.
    const businessId = await getMyBusinessId();
    if (!businessId) {
      await supabase.auth.signOut();
      return fail({ code: 'AUTH_INVALID', message: 'No business is associated with this account.' });
    }

    // 3. Load full user context (identity + permissions + is_owner)
    const context = await loadUserContext(businessId);
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

// ---- Business ID resolution ---------------------------------
// Derives business_id purely from the live Supabase session via
// imagecare.fn_get_my_business_id(). The user is never asked for
// this and it is never transmitted from the client.

export async function getMyBusinessId(): Promise<UUID | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_get_my_business_id');
    if (error || !data) return null;
    return data as UUID;
  } catch {
    return null;
  }
}

// ---- Self-service business registration ---------------------
// First-time signup: Business Name, Owner Name, Email, Password
// only - no Business ID, branch, secret word, or OTP. Creates the
// Supabase Auth account, then the business + owner user row +
// full owner permission grants via fn_register_business(), which
// is idempotent (see 0020_stage7_pin_auth.sql).

export interface RegisterInput {
  businessName:   string;
  ownerFirstName: string;
  ownerLastName:  string;
  email:          string;
  password:       string;
}

export async function register(input: RegisterInput): Promise<ApiResult<LoginResult>> {
  try {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email:    input.email,
      password: input.password,
    });

    if (signUpError) {
      return fail({ code: 'AUTH_INVALID', message: signUpError.message || 'Could not create account.' });
    }
    if (!signUpData.user) {
      return fail({ code: 'AUTH_INVALID', message: 'Could not create account.' });
    }

    if (!signUpData.session) {
      // Email confirmation is required by this Supabase project before a
      // session is issued. No business/owner data has been written yet -
      // the user completes registration by confirming their email and
      // then signing in (which does not require a Business ID either).
      return fail({
        code: 'AUTH_INVALID',
        message: 'Account created. Please check your email to confirm your address, then sign in.',
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: regData, error: regError } = await (supabase as any).rpc('fn_register_business', {
      p_business_name:    input.businessName,
      p_owner_first_name: input.ownerFirstName,
      p_owner_last_name:  input.ownerLastName,
    });

    if (regError || !regData) {
      // The full Postgres/PostgREST error is never shown in the UI, but it
      // is logged here so the person running the app can diagnose it via
      // devtools (e.g. the migration not having been run yet in Supabase -
      // see database/migrations/0020_stage7_pin_auth.sql).
      console.error('fn_register_business failed:', regError);
      const notDeployed = regError && (
        regError.code === 'PGRST202' ||
        regError.code === '42883' ||
        /function .*fn_register_business.* does not exist|could not find the function/i.test(regError.message ?? '')
      );
      return fail({
        code: 'SERVER_ERROR',
        message: notDeployed
          ? 'Registration is not set up yet on this database - the 0020_stage7_pin_auth.sql migration has not been run in Supabase. Contact your administrator.'
          : 'Could not set up your business. Please try again.',
      });
    }

    const businessId = (regData as { business_id: UUID }).business_id;
    const context = await loadUserContext(businessId);
    if (!context) {
      return fail({
        code: 'SERVER_ERROR',
        message: 'Your account was created, but we could not load your business. Please sign in.',
      });
    }

    return ok({
      session: {
        access_token:  signUpData.session.access_token,
        refresh_token: signUpData.session.refresh_token,
      },
      user_context: context,
    });
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Daily PIN -----------------------------------------------
// Convenience quick-unlock layer on top of full Supabase auth.
// Never a replacement for it, never used as the Supabase password,
// never stored or returned in plaintext. See fn_set_pin/
// fn_verify_pin/fn_has_pin in 0020_stage7_pin_auth.sql.

export async function hasPin(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_has_pin');
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

export async function setPin(pin: string, confirmPin: string): Promise<ApiResult<null>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('fn_set_pin', {
      p_pin:         pin,
      p_pin_confirm: confirmPin,
    });
    if (error) {
      return fail({ code: 'VALIDATION_ERROR', message: mapPinSetError(error.message) });
    }
    return ok(null);
  } catch (err) {
    return fail(parseError(err));
  }
}

export type VerifyPinReason = 'NO_PIN_SET' | 'LOCKED' | 'WRONG_PIN';

export interface VerifyPinResult {
  success:            boolean;
  reason?:            VerifyPinReason;
  attemptsRemaining?: number;
  lockedUntil?:       string;
}

export async function verifyPin(pin: string): Promise<VerifyPinResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_verify_pin', { p_pin: pin });
    if (error || !data) {
      return { success: false, reason: 'WRONG_PIN' };
    }
    const result = data as {
      success: boolean; reason?: VerifyPinReason;
      attempts_remaining?: number; locked_until?: string;
    };
    return {
      success:           Boolean(result.success),
      reason:            result.reason,
      attemptsRemaining: result.attempts_remaining,
      lockedUntil:       result.locked_until,
    };
  } catch {
    return { success: false, reason: 'WRONG_PIN' };
  }
}

function mapPinSetError(message: string): string {
  if (message.includes('do not match'))            return 'PIN and confirmation do not match.';
  if (message.includes('exactly 4 digits'))         return 'PIN must be exactly 4 digits.';
  return 'Could not set PIN. Please try again.';
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
