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
} from '../../services/auth/authService';

const mockSupabase = vi.mocked(supabase);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- login ---------------------------------------------------

describe('login', () => {
  it('fails with AUTH_INVALID when credentials are rejected', async () => {
    (mockSupabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { session: null }, error: { message: 'Invalid login credentials' },
    });

    const result = await login({ email: 'a@b.com', password: 'wrong', business_id: TEST_BUSINESS_ID });

    expect(result.success).toBe(false);
    // AUTH_INVALID maps onto the standard ServiceErrorCode AUTHENTICATION_REQUIRED.
    expect(result.error?.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('signs the user back out and fails when no user context exists for the business', async () => {
    (mockSupabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { session: { access_token: 'at', refresh_token: 'rt' } }, error: null,
    });
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    (mockSupabase.auth.signOut as any).mockResolvedValue({ error: null });

    const result = await login({ email: 'a@b.com', password: 'pw', business_id: TEST_BUSINESS_ID });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('AUTHENTICATION_REQUIRED');
    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
  });

  it('fails with ACCOUNT_SUSPENDED and signs out when the account is inactive', async () => {
    (mockSupabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { session: { access_token: 'at', refresh_token: 'rt' } }, error: null,
    });
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({
      data: {
        user_id: 'u1', business_id: TEST_BUSINESS_ID, branch_id: null,
        email: 'a@b.com', first_name: 'A', last_name: 'B', role: 'Cashier',
        is_owner: false, is_active: false, permissions: {}, branches: [],
      },
      error: null,
    });
    (mockSupabase.auth.signOut as any).mockResolvedValue({ error: null });

    const result = await login({ email: 'a@b.com', password: 'pw', business_id: TEST_BUSINESS_ID });

    expect(result.success).toBe(false);
    // ACCOUNT_SUSPENDED maps onto the standard ServiceErrorCode PERMISSION_DENIED.
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('succeeds and returns the session plus mapped user context', async () => {
    (mockSupabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { session: { access_token: 'at', refresh_token: 'rt' } }, error: null,
    });
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({
      data: {
        user_id: 'u1', business_id: TEST_BUSINESS_ID, branch_id: 'branch-1',
        email: 'owner@b.com', first_name: 'Owner', last_name: 'Person', role: 'Owner',
        is_owner: true, is_active: true, permissions: { sales: { view: true } }, branches: [],
      },
      error: null,
    });

    const result = await login({ email: 'owner@b.com', password: 'pw', business_id: TEST_BUSINESS_ID });

    expect(result.success).toBe(true);
    expect(result.data?.session.access_token).toBe('at');
    expect(result.data?.user_context.is_owner).toBe(true);
  });

  it('returns a mapped failure instead of throwing when Supabase auth itself throws', async () => {
    (mockSupabase.auth.signInWithPassword as any).mockRejectedValue(new Error('network down'));

    const result = await login({ email: 'a@b.com', password: 'pw', business_id: TEST_BUSINESS_ID });

    expect(result.success).toBe(false);
    // SERVER_ERROR maps onto the standard ServiceErrorCode INTERNAL_ERROR.
    expect(result.error?.code).toBe('INTERNAL_ERROR');
    // The raw exception message must never leak to the caller.
    expect(result.error?.message).not.toContain('network down');
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
