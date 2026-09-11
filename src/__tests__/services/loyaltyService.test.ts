// ============================================================
// File: src/__tests__/services/loyaltyService.test.ts
// Purpose: Service contract tests for the real (Supabase-backed)
//          loyalty service - src/services/loyalty/loyaltyService.ts.
//          Added while closing the CI coverage gate. Exercises real
//          permission checks, real error-code mapping, and real
//          success paths - not stub assertions written to inflate a
//          number.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeUserContext, makeNoPermissionContext, TEST_BUSINESS_ID } from '../setup';
import type { UserContext } from '../../types/app';

// The shared setup.ts mock returns `this` from every chain method and
// resolves single()/maybeSingle() to a fixed { data: null, error: null }
// - not enough to exercise success/error/conflict branches per test, and
// it has no rpc() result queue. Override the supabase mock locally with a
// settable-result chain plus a real rpc mock.
const { chain, setResult, setThrow, rpcMock } = vi.hoisted(() => {
  let result: { data: unknown; error: unknown } = { data: null, error: null };
  let shouldThrow = false;
  const c: Record<string, unknown> = {};
  for (const m of ['schema', 'from', 'select', 'insert', 'eq', 'order']) {
    c[m] = vi.fn(() => c);
  }
  const resolveOrThrow = () => (shouldThrow ? Promise.reject(new Error('network exploded')) : Promise.resolve(result));
  c.single = vi.fn(() => resolveOrThrow());
  c.maybeSingle = vi.fn(() => resolveOrThrow());
  // Bare `await query` (listLoyaltyAccounts / listLoyaltyTransactions) -
  // make the chain itself thenable.
  c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    resolveOrThrow().then(resolve, reject);
  return {
    chain: c,
    setResult: (r: { data: unknown; error: unknown }) => { result = r; },
    setThrow: (v: boolean) => { shouldThrow = v; },
    rpcMock: vi.fn(),
  };
});

vi.mock('../../lib/supabase', () => ({
  supabase: { ...chain, rpc: rpcMock },
  default: { ...chain, rpc: rpcMock },
}));

import {
  listLoyaltyAccounts,
  getLoyaltyAccountByCustomer,
  enrollLoyaltyAccount,
  listLoyaltyTransactions,
  awardLoyaltyPoints,
  redeemLoyaltyPoints,
} from '../../services/loyalty/loyaltyService';

// setup.ts's fullPermissions module list omits 'loyalty', so a bare
// makeUserContext() is denied every loyalty check. Grant it explicitly.
const FULL_MODULE_PERMISSION = { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' as const };
function ctxWithLoyalty(overrides: Partial<UserContext> = {}): UserContext {
  const base = makeUserContext();
  return { ...base, permissions: { ...base.permissions, loyalty: { ...FULL_MODULE_PERMISSION } }, ...overrides };
}

const CUSTOMER_ID = 'customer-1';
const SALE_ID = 'sale-1';
const ACCOUNT_ID = 'loyalty-account-1';

beforeEach(() => {
  setResult({ data: null, error: null });
  setThrow(false);
  rpcMock.mockReset();
  vi.clearAllMocks();
});

// ---- listLoyaltyAccounts --------------------------------------

describe('listLoyaltyAccounts', () => {
  it('denies without loyalty view permission', async () => {
    const result = await listLoyaltyAccounts(makeNoPermissionContext(), {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('returns the account list on success', async () => {
    setResult({ data: [{ id: ACCOUNT_ID, business_id: TEST_BUSINESS_ID, points_balance: 10 }], error: null });
    const result = await listLoyaltyAccounts(ctxWithLoyalty(), {});
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it('defaults to an empty array when data is null', async () => {
    setResult({ data: null, error: null });
    const result = await listLoyaltyAccounts(ctxWithLoyalty(), {});
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('applies the is_active filter when provided', async () => {
    setResult({ data: [], error: null });
    await listLoyaltyAccounts(ctxWithLoyalty(), { is_active: true });
    expect(chain.eq).toHaveBeenCalledWith('is_active', true);
  });

  it('maps a database error to INTERNAL_ERROR', async () => {
    setResult({ data: null, error: { message: 'db down' } });
    const result = await listLoyaltyAccounts(ctxWithLoyalty(), {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });

  it('maps a thrown exception to INTERNAL_ERROR', async () => {
    setThrow(true);
    const result = await listLoyaltyAccounts(ctxWithLoyalty(), {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });
});

// ---- getLoyaltyAccountByCustomer -------------------------------

describe('getLoyaltyAccountByCustomer', () => {
  it('denies without loyalty view permission', async () => {
    const result = await getLoyaltyAccountByCustomer(makeNoPermissionContext(), CUSTOMER_ID);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('returns the account when found', async () => {
    setResult({ data: { id: ACCOUNT_ID, customer_id: CUSTOMER_ID }, error: null });
    const result = await getLoyaltyAccountByCustomer(ctxWithLoyalty(), CUSTOMER_ID);
    expect(result.success).toBe(true);
    expect(result.data?.id).toBe(ACCOUNT_ID);
  });

  it('returns null (not an error) when the customer has no account yet', async () => {
    setResult({ data: null, error: null });
    const result = await getLoyaltyAccountByCustomer(ctxWithLoyalty(), CUSTOMER_ID);
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  it('maps a database error to INTERNAL_ERROR', async () => {
    setResult({ data: null, error: { message: 'timeout' } });
    const result = await getLoyaltyAccountByCustomer(ctxWithLoyalty(), CUSTOMER_ID);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });
});

// ---- enrollLoyaltyAccount ---------------------------------------

describe('enrollLoyaltyAccount', () => {
  it('denies without loyalty create permission', async () => {
    const result = await enrollLoyaltyAccount(makeNoPermissionContext(), CUSTOMER_ID);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('enrolls the customer with schema-default fields on success', async () => {
    setResult({ data: { id: ACCOUNT_ID, customer_id: CUSTOMER_ID, points_balance: 0, tier: 'standard', is_active: true }, error: null });
    const result = await enrollLoyaltyAccount(ctxWithLoyalty(), CUSTOMER_ID);
    expect(result.success).toBe(true);
    expect(result.data?.points_balance).toBe(0);
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: CUSTOMER_ID, points_balance: 0, tier: 'standard', is_active: true,
    }));
  });

  it('maps a unique-violation (23505) to CONFLICT for an already-enrolled customer', async () => {
    setResult({ data: null, error: { code: '23505', message: 'duplicate key' } });
    const result = await enrollLoyaltyAccount(ctxWithLoyalty(), CUSTOMER_ID);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CONFLICT');
  });

  it('maps any other database error to INTERNAL_ERROR', async () => {
    setResult({ data: null, error: { code: '23502', message: 'not null violation' } });
    const result = await enrollLoyaltyAccount(ctxWithLoyalty(), CUSTOMER_ID);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });
});

// ---- listLoyaltyTransactions --------------------------------------

describe('listLoyaltyTransactions', () => {
  it('denies without loyalty view permission', async () => {
    const result = await listLoyaltyTransactions(makeNoPermissionContext(), ACCOUNT_ID);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('returns the transaction history on success', async () => {
    setResult({ data: [{ id: 'txn-1', loyalty_account_id: ACCOUNT_ID }], error: null });
    const result = await listLoyaltyTransactions(ctxWithLoyalty(), ACCOUNT_ID);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it('defaults to an empty array when data is null', async () => {
    setResult({ data: null, error: null });
    const result = await listLoyaltyTransactions(ctxWithLoyalty(), ACCOUNT_ID);
    expect(result.data).toEqual([]);
  });

  it('maps a database error to INTERNAL_ERROR', async () => {
    setResult({ data: null, error: { message: 'boom' } });
    const result = await listLoyaltyTransactions(ctxWithLoyalty(), ACCOUNT_ID);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });
});

// ---- awardLoyaltyPoints -------------------------------------------

describe('awardLoyaltyPoints', () => {
  it('denies without loyalty create permission', async () => {
    const result = await awardLoyaltyPoints(makeNoPermissionContext(), CUSTOMER_ID, SALE_ID, 10000, 1000);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('awards points via the atomic RPC and returns the result', async () => {
    rpcMock.mockResolvedValue({ data: { points: 10, new_balance: 50, already_awarded: false }, error: null });
    const result = await awardLoyaltyPoints(ctxWithLoyalty(), CUSTOMER_ID, SALE_ID, 10000, 1000);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ points: 10, newBalance: 50, alreadyAwarded: false });
    expect(rpcMock).toHaveBeenCalledWith('fn_award_loyalty_points', {
      p_customer_id: CUSTOMER_ID, p_sale_id: SALE_ID, p_amount_ugx: 10000, p_ugx_per_point: 1000,
    });
  });

  it('falls back to safe defaults when the RPC returns no data', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const result = await awardLoyaltyPoints(ctxWithLoyalty(), CUSTOMER_ID, SALE_ID, 10000, 1000);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ points: 0, newBalance: null, alreadyAwarded: false });
  });

  it('reports idempotent re-award (already_awarded) without treating it as an error', async () => {
    rpcMock.mockResolvedValue({ data: { points: 10, new_balance: 50, already_awarded: true }, error: null });
    const result = await awardLoyaltyPoints(ctxWithLoyalty(), CUSTOMER_ID, SALE_ID, 10000, 1000);
    expect(result.success).toBe(true);
    expect(result.data?.alreadyAwarded).toBe(true);
  });

  it('maps an RPC error to INTERNAL_ERROR', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'award failed' } });
    const result = await awardLoyaltyPoints(ctxWithLoyalty(), CUSTOMER_ID, SALE_ID, 10000, 1000);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });

  it('maps a thrown exception to INTERNAL_ERROR', async () => {
    rpcMock.mockImplementation(() => { throw new Error('network exploded'); });
    const result = await awardLoyaltyPoints(ctxWithLoyalty(), CUSTOMER_ID, SALE_ID, 10000, 1000);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });
});

// ---- redeemLoyaltyPoints -------------------------------------------

describe('redeemLoyaltyPoints', () => {
  it('denies without loyalty create permission', async () => {
    const result = await redeemLoyaltyPoints(makeNoPermissionContext(), CUSTOMER_ID, 100, 'Free wash');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('redeems points via the atomic RPC and returns the new balance', async () => {
    rpcMock.mockResolvedValue({ data: { new_balance: 40 }, error: null });
    const result = await redeemLoyaltyPoints(ctxWithLoyalty(), CUSTOMER_ID, 100, 'Free wash');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ newBalance: 40 });
    expect(rpcMock).toHaveBeenCalledWith('fn_redeem_loyalty_points', {
      p_customer_id: CUSTOMER_ID, p_points: 100, p_description: 'Free wash',
    });
  });

  it('defaults the new balance to 0 when the RPC returns no data', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const result = await redeemLoyaltyPoints(ctxWithLoyalty(), CUSTOMER_ID, 100, 'Free wash');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ newBalance: 0 });
  });

  it('maps an INSUFFICIENT_POINTS RPC error to BUSINESS_RULE_VIOLATION', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'INSUFFICIENT_POINTS: only 10 available' } });
    const result = await redeemLoyaltyPoints(ctxWithLoyalty(), CUSTOMER_ID, 100, 'Free wash');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('maps a NOT_FOUND RPC error to RESOURCE_NOT_FOUND', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'NOT_FOUND: no loyalty account' } });
    const result = await redeemLoyaltyPoints(ctxWithLoyalty(), CUSTOMER_ID, 100, 'Free wash');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('maps any other RPC error to INTERNAL_ERROR', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'unexpected db error' } });
    const result = await redeemLoyaltyPoints(ctxWithLoyalty(), CUSTOMER_ID, 100, 'Free wash');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });

  it('maps a thrown exception to INTERNAL_ERROR', async () => {
    rpcMock.mockImplementation(() => { throw new Error('network exploded'); });
    const result = await redeemLoyaltyPoints(ctxWithLoyalty(), CUSTOMER_ID, 100, 'Free wash');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });
});
