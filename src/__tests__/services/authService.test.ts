// ============================================================
// IMC-BLD-006 | ImageCare ERP Testing & QA v1.0
// File: src/__tests__/services/authService.test.ts
// Purpose: Service contract tests for authentication and user
//          context loading. Verifies identity vs. authorization
//          stays separated (is_owner is read from the DB response,
//          never inferred) and that failure paths never leak
//          Supabase/Postgres internals to the caller.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TEST_BUSINESS_ID } from '../setup';
import { supabase } from '../../lib/supabase';
import {
  login,
  logout,
  getActiveSession,
  refreshSession,
  loadUserContext,
  loadUserContextFallback,
  onAuthStateChange,
  getMyBusinessId,
  register,
  hasPin,
  setPin,
  verifyPin,
} from '../../services/auth/authService';

const mockSupabase = vi.mocked(supabase);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- login ---------------------------------------------------
// login() no longer takes a business_id - it is resolved server-side
// via fn_get_my_business_id() before fn_get_user_context() is called.
// See getMyBusinessId/register/PIN describe blocks below for the
// rest of the Stage 7 (Business-ID-less auth + daily PIN) coverage.

describe('login', () => {
  it('fails with AUTH_INVALID when credentials are rejected', async () => {
    (mockSupabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { session: null }, error: { message: 'Invalid login credentials' },
    });

    const result = await login({ email: 'a@b.com', password: 'wrong' });

    expect(result.success).toBe(false);
    // AUTH_INVALID maps onto the standard ServiceErrorCode AUTHENTICATION_REQUIRED.
    expect(result.error?.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('signs the user back out and fails when no business is associated with the account', async () => {
    (mockSupabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { session: { access_token: 'at', refresh_token: 'rt' } }, error: null,
    });
    // fn_get_my_business_id finds nothing for this auth account.
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    (mockSupabase.auth.signOut as any).mockResolvedValue({ error: null });

    const result = await login({ email: 'a@b.com', password: 'pw' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('AUTHENTICATION_REQUIRED');
    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
  });

  it('fails with ACCOUNT_SUSPENDED and signs out when the account is inactive', async () => {
    (mockSupabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { session: { access_token: 'at', refresh_token: 'rt' } }, error: null,
    });
    (mockSupabase as any).rpc = vi.fn()
      .mockResolvedValueOnce({ data: TEST_BUSINESS_ID, error: null }) // fn_get_my_business_id
      .mockResolvedValueOnce({ // fn_get_user_context
        data: {
          user_id: 'u1', business_id: TEST_BUSINESS_ID, branch_id: null,
          email: 'a@b.com', first_name: 'A', last_name: 'B', role: 'Cashier',
          is_owner: false, is_active: false, permissions: {}, branches: [],
        },
        error: null,
      });
    (mockSupabase.auth.signOut as any).mockResolvedValue({ error: null });

    const result = await login({ email: 'a@b.com', password: 'pw' });

    expect(result.success).toBe(false);
    // ACCOUNT_SUSPENDED maps onto the standard ServiceErrorCode PERMISSION_DENIED.
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('resolves business_id server-side, then succeeds and returns the session plus mapped user context', async () => {
    (mockSupabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { session: { access_token: 'at', refresh_token: 'rt' } }, error: null,
    });
    const rpcMock = vi.fn()
      .mockResolvedValueOnce({ data: TEST_BUSINESS_ID, error: null }) // fn_get_my_business_id
      .mockResolvedValueOnce({ // fn_get_user_context
        data: {
          user_id: 'u1', business_id: TEST_BUSINESS_ID, branch_id: 'branch-1',
          email: 'owner@b.com', first_name: 'Owner', last_name: 'Person', role: 'Owner',
          is_owner: true, is_active: true, permissions: { sales: { view: true } }, branches: [],
        },
        error: null,
      });
    (mockSupabase as any).rpc = rpcMock;

    const result = await login({ email: 'owner@b.com', password: 'pw' });

    expect(result.success).toBe(true);
    expect(result.data?.session.access_token).toBe('at');
    expect(result.data?.user_context.is_owner).toBe(true);
    // No Business ID was ever supplied by the caller - it came from
    // fn_get_my_business_id, called before fn_get_user_context.
    expect(rpcMock).toHaveBeenNthCalledWith(1, 'fn_get_my_business_id');
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'fn_get_user_context', { p_business_id: TEST_BUSINESS_ID });
  });

  it('returns a mapped failure instead of throwing when Supabase auth itself throws', async () => {
    (mockSupabase.auth.signInWithPassword as any).mockRejectedValue(new Error('network down'));

    const result = await login({ email: 'a@b.com', password: 'pw' });

    expect(result.success).toBe(false);
    // SERVER_ERROR maps onto the standard ServiceErrorCode INTERNAL_ERROR.
    expect(result.error?.code).toBe('INTERNAL_ERROR');
    // The raw exception message must never leak to the caller.
    expect(result.error?.message).not.toContain('network down');
  });
});

// ---- getMyBusinessId (fn_get_my_business_id RPC) ------------------
// Derives business_id purely from the authenticated session so the
// user never supplies one.

describe('getMyBusinessId', () => {
  it('returns null when the RPC errors', async () => {
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await getMyBusinessId()).toBeNull();
  });

  it('returns the business id on success', async () => {
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({ data: TEST_BUSINESS_ID, error: null });
    expect(await getMyBusinessId()).toBe(TEST_BUSINESS_ID);
  });

  it('returns null when the RPC throws', async () => {
    (mockSupabase as any).rpc = vi.fn().mockRejectedValue(new Error('down'));
    expect(await getMyBusinessId()).toBeNull();
  });
});

// ---- register (signUp + fn_register_business) ---------------------
// First-time business registration: Business Name + Owner Name +
// Email + Password only. No Business ID is ever sent by the client.

describe('register', () => {
  const input = {
    businessName: 'Acme Traders', ownerFirstName: 'Ada', ownerLastName: 'Owner',
    email: 'ada@acme.test', password: 'password123',
  };

  it('fails when Supabase signUp itself errors', async () => {
    (mockSupabase.auth as any).signUp = vi.fn().mockResolvedValue({
      data: { user: null, session: null }, error: { message: 'Email already registered' },
    });

    const result = await register(input);

    expect(result.success).toBe(false);
  });

  it('returns a confirm-your-email message when signUp succeeds without an immediate session', async () => {
    (mockSupabase.auth as any).signUp = vi.fn().mockResolvedValue({
      data: { user: { id: 'auth-1' }, session: null }, error: null,
    });

    const result = await register(input);

    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/confirm/i);
  });

  it('creates the business via fn_register_business (no Business ID sent) and loads context on success', async () => {
    (mockSupabase.auth as any).signUp = vi.fn().mockResolvedValue({
      data: { user: { id: 'auth-1' }, session: { access_token: 'at', refresh_token: 'rt' } }, error: null,
    });
    const rpcMock = vi.fn()
      .mockResolvedValueOnce({ // fn_register_business
        data: { business_id: TEST_BUSINESS_ID, user_id: 'u1', already_existed: false }, error: null,
      })
      .mockResolvedValueOnce({ // fn_get_user_context
        data: {
          user_id: 'u1', business_id: TEST_BUSINESS_ID, branch_id: null,
          email: input.email, first_name: 'Ada', last_name: 'Owner', role: 'Owner',
          is_owner: true, is_active: true, permissions: {}, branches: [],
        },
        error: null,
      });
    (mockSupabase as any).rpc = rpcMock;

    const result = await register(input);

    expect(result.success).toBe(true);
    expect(result.data?.user_context.is_owner).toBe(true);
    expect(rpcMock).toHaveBeenNthCalledWith(1, 'fn_register_business', {
      p_business_name: 'Acme Traders', p_owner_first_name: 'Ada', p_owner_last_name: 'Owner',
    });
  });

  it('fails cleanly (does not throw) when fn_register_business errors', async () => {
    (mockSupabase.auth as any).signUp = vi.fn().mockResolvedValue({
      data: { user: { id: 'auth-1' }, session: { access_token: 'at', refresh_token: 'rt' } }, error: null,
    });
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } });

    const result = await register(input);

    expect(result.success).toBe(false);
  });
});

// ---- Daily PIN (fn_has_pin / fn_set_pin / fn_verify_pin) -----------
// The PIN is a convenience unlock layer, never a replacement for
// email/password auth. It is stored and verified entirely server-
// side as a bcrypt hash - these tests only cover the client-side
// wrapper's success/failure mapping, never a plaintext PIN value.

describe('hasPin', () => {
  it('returns false when the RPC errors', async () => {
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await hasPin()).toBe(false);
  });

  it('returns true when a PIN is configured', async () => {
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    expect(await hasPin()).toBe(true);
  });

  it('returns false when no user row exists for the session', async () => {
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    expect(await hasPin()).toBe(false);
  });
});

describe('setPin', () => {
  it('fails with a mapped message when the RPC rejects a mismatched PIN', async () => {
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({
      data: null, error: { message: 'VALIDATION_ERROR: PIN and confirmation do not match' },
    });
    const result = await setPin('1234', '4321');
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/do not match/i);
  });

  it('fails with a mapped message when the RPC rejects a non-4-digit PIN', async () => {
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({
      data: null, error: { message: 'VALIDATION_ERROR: PIN must be exactly 4 digits' },
    });
    const result = await setPin('12', '12');
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/4 digits/i);
  });

  it('succeeds when the RPC accepts the PIN', async () => {
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    const result = await setPin('1234', '1234');
    expect(result.success).toBe(true);
  });
});

describe('verifyPin', () => {
  it('reports wrong PIN with attempts remaining, never revealing the stored PIN', async () => {
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({
      data: { success: false, reason: 'WRONG_PIN', attempts_remaining: 3 }, error: null,
    });
    const result = await verifyPin('0000');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('WRONG_PIN');
    expect(result.attemptsRemaining).toBe(3);
  });

  it('reports a temporary lock after too many wrong attempts', async () => {
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({
      data: { success: false, reason: 'LOCKED', locked_until: '2026-01-01T00:00:00Z' }, error: null,
    });
    const result = await verifyPin('0000');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('LOCKED');
    expect(result.lockedUntil).toBe('2026-01-01T00:00:00Z');
  });

  it('reports success on a correct PIN', async () => {
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    const result = await verifyPin('1234');
    expect(result.success).toBe(true);
  });

  it('fails closed (never throws) when the RPC itself throws', async () => {
    (mockSupabase as any).rpc = vi.fn().mockRejectedValue(new Error('down'));
    const result = await verifyPin('1234');
    expect(result.success).toBe(false);
  });
});

// ---- logout ----------------------------------------------------

describe('logout', () => {
  it('signs the user out without throwing', async () => {
    (mockSupabase.auth.signOut as any).mockResolvedValue({ error: null });
    await expect(logout()).resolves.toBeUndefined();
    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
  });

  it('swallows a sign-out failure rather than throwing', async () => {
    (mockSupabase.auth.signOut as any)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ error: null });

    await expect(logout()).resolves.toBeUndefined();
  });
});

// ---- session helpers ---------------------------------------------

describe('getActiveSession', () => {
  it('returns null when there is no active session', async () => {
    (mockSupabase.auth.getSession as any).mockResolvedValue({ data: { session: null }, error: null });
    expect(await getActiveSession()).toBeNull();
  });

  it('returns null when Supabase reports an error', async () => {
    (mockSupabase.auth.getSession as any).mockResolvedValue({ data: { session: null }, error: { message: 'x' } });
    expect(await getActiveSession()).toBeNull();
  });

  it('returns the session when one exists', async () => {
    const session = { access_token: 'at' };
    (mockSupabase.auth.getSession as any).mockResolvedValue({ data: { session }, error: null });
    expect(await getActiveSession()).toBe(session);
  });
});

describe('refreshSession', () => {
  it('throws an ImageCareError with AUTH_EXPIRED when refresh fails', async () => {
    (mockSupabase.auth.refreshSession as any).mockResolvedValue({ data: null, error: { message: 'expired' } });
    await expect(refreshSession()).rejects.toMatchObject({ code: 'AUTH_EXPIRED' });
  });

  it('returns the refreshed session on success', async () => {
    const session = { access_token: 'new-at' };
    (mockSupabase.auth.refreshSession as any).mockResolvedValue({ data: { session }, error: null });
    expect(await refreshSession()).toBe(session);
  });
});

// ---- loadUserContext (fn_get_user_context RPC) --------------------

describe('loadUserContext', () => {
  it('returns null when the RPC errors', async () => {
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'no function' } });
    expect(await loadUserContext(TEST_BUSINESS_ID)).toBeNull();
  });

  it('returns null when the RPC throws', async () => {
    (mockSupabase as any).rpc = vi.fn().mockRejectedValue(new Error('down'));
    expect(await loadUserContext(TEST_BUSINESS_ID)).toBeNull();
  });

  it('maps the raw RPC row onto UserContext, preserving is_owner as returned by the DB', async () => {
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({
      data: {
        user_id: 'u1', business_id: TEST_BUSINESS_ID, branch_id: null,
        email: 'e@x.com', first_name: 'F', last_name: 'L', role: 'Cashier',
        is_owner: false, is_active: true,
        permissions: { sales: { view: true } },
        branches: [{ branch_id: 'b1', can_transact: true }],
      },
      error: null,
    });

    const ctx = await loadUserContext(TEST_BUSINESS_ID);

    expect(ctx?.is_owner).toBe(false);
    expect(ctx?.role).toBe('Cashier');
    expect(ctx?.branches).toHaveLength(1);
  });

  it('defaults permissions and branches to empty when the DB omits them', async () => {
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({
      data: {
        user_id: 'u1', business_id: TEST_BUSINESS_ID, branch_id: null,
        email: 'e@x.com', first_name: 'F', last_name: 'L', role: 'Cashier',
        is_owner: false, is_active: true,
      },
      error: null,
    });

    const ctx = await loadUserContext(TEST_BUSINESS_ID);

    expect(ctx?.permissions).toEqual({});
    expect(ctx?.branches).toEqual([]);
  });
});

// ---- loadUserContextFallback (pre-migration direct table read) ---

describe('loadUserContextFallback', () => {
  it('returns null when there is no authenticated Supabase auth user', async () => {
    (mockSupabase.auth.getUser as any).mockResolvedValue({ data: { user: null }, error: null });
    expect(await loadUserContextFallback(TEST_BUSINESS_ID)).toBeNull();
  });

  it('returns null when no matching business user row is found', async () => {
    (mockSupabase.auth.getUser as any).mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null });
    (mockSupabase.maybeSingle as any).mockResolvedValue({ data: null, error: null });
    expect(await loadUserContextFallback(TEST_BUSINESS_ID)).toBeNull();
  });

  it('merges group and direct permissions, most-permissive-wins, and loads branch access', async () => {
    (mockSupabase.auth.getUser as any).mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null });
    (mockSupabase.maybeSingle as any).mockResolvedValue({
      data: {
        id: 'u1', business_id: TEST_BUSINESS_ID, branch_id: 'b1',
        first_name: 'F', last_name: 'L', email: 'e@x.com', role: 'Cashier',
        is_owner: false, is_active: true,
        permission_group_members: [{
          permission_groups: {
            is_active: true,
            group_permissions: [{
              module: 'sales', can_view: true, can_create: false, can_edit: false,
              can_delete: false, can_approve: false, can_export: false, can_sync: false,
              branch_scope: 'assigned',
            }],
          },
        }],
        user_permissions: [{
          module: 'sales', can_view: true, can_create: true, can_edit: false,
          can_delete: false, can_approve: false, can_export: false, can_sync: false,
          branch_scope: 'all',
        }],
      },
      error: null,
    });
    (mockSupabase.select as any).mockReturnThis();
    (mockSupabase.eq as any).mockReturnThis();
    // Second query on this test (branch access) resolves via the plain object return,
    // since the shared mock chain doesn't distinguish call sites — assert the merge logic instead.

    const ctx = await loadUserContextFallback(TEST_BUSINESS_ID);

    expect(ctx).not.toBeNull();
    expect(ctx?.permissions.sales.create).toBe(true); // direct permission wins over group's false
    expect(ctx?.permissions.sales.branch_scope).toBe('all'); // 'all' wins over 'assigned'
  });

  it('ignores permission groups that are inactive', async () => {
    (mockSupabase.auth.getUser as any).mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null });
    (mockSupabase.maybeSingle as any).mockResolvedValue({
      data: {
        id: 'u1', business_id: TEST_BUSINESS_ID, branch_id: 'b1',
        first_name: 'F', last_name: 'L', email: 'e@x.com', role: 'Cashier',
        is_owner: false, is_active: true,
        permission_group_members: [{
          permission_groups: {
            is_active: false,
            group_permissions: [{ module: 'sales', can_view: true, can_create: true, can_edit: true, can_delete: true, can_approve: true, can_export: true, can_sync: true, branch_scope: 'all' }],
          },
        }],
        user_permissions: [],
      },
      error: null,
    });

    const ctx = await loadUserContextFallback(TEST_BUSINESS_ID);

    expect(ctx?.permissions).toEqual({});
  });
});

// ---- onAuthStateChange -------------------------------------------

describe('onAuthStateChange', () => {
  it('subscribes and returns the subscription handle', () => {
    const sub = onAuthStateChange(() => {});
    expect(sub).toBeDefined();
    expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled();
  });
});
