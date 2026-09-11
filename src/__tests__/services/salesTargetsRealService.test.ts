// ============================================================
// File: src/__tests__/services/salesTargetsRealService.test.ts
// Purpose: Service contract tests for the real (Supabase-backed) sales
//          targets service - src/services/salesTargets/salesTargetsService.ts
//          (distinct from the legacy local-only src/services/salesTargetsService.ts,
//          which it reuses only for the OverlappingTargetError /
//          InvalidTargetScopeError classes). Added while closing the CI
//          coverage gate - real permission checks, real business-rule
//          error classes, real achievement math, not stub assertions.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeUserContext, makeNoPermissionContext, TEST_BUSINESS_ID } from '../setup';
import type { UserContext } from '../../types/app';
import type { SalesTarget, SalesTargetInput } from '../../types/salesTargets';
import { OverlappingTargetError, InvalidTargetScopeError } from '../../services/salesTargetsService';

// FIFO queue of chain results - lets a single test set up multiple
// sequential (or Promise.all-concurrent) supabase calls in call order.
// JS stays synchronous up to the first `await` inside a .map() callback,
// so push-order == call-order for getAllProgress's Promise.all too.
const { chain, push, reset } = vi.hoisted(() => {
  const queue: Array<{ data: unknown; error: unknown }> = [];
  const EMPTY = { data: null, error: null };
  const c: Record<string, unknown> = {};
  for (const m of ['schema', 'from', 'select', 'insert', 'update', 'delete', 'eq', 'neq', 'is', 'gte', 'lt', 'order']) {
    c[m] = vi.fn(() => c);
  }
  const nextOrEmpty = () => queue.shift() ?? EMPTY;
  c.single = vi.fn(() => Promise.resolve(nextOrEmpty()));
  c.maybeSingle = vi.fn(() => Promise.resolve(nextOrEmpty()));
  c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(nextOrEmpty()).then(resolve, reject);
  return {
    chain: c,
    push: (r: { data: unknown; error: unknown }) => queue.push(r),
    reset: () => { queue.length = 0; },
  };
});

vi.mock('../../lib/supabase', () => ({ supabase: chain, default: chain }));

import {
  listTargets,
  createTarget,
  updateTarget,
  deleteTarget,
  getProgress,
  getAllProgress,
  isCurrentPeriod,
} from '../../services/salesTargets/salesTargetsService';

// setup.ts's fullPermissions module list omits 'salesTargets'.
const FULL = { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' as const };
function ctx(overrides: Partial<UserContext> = {}): UserContext {
  const base = makeUserContext();
  return { ...base, permissions: { ...base.permissions, salesTargets: { ...FULL } }, ...overrides };
}

beforeEach(() => { reset(); });

function targetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'target-1', branch_id: null, user_id: null,
    period_start: '2026-01-01', period_end: '2026-01-31',
    target_amount: 1000000, created_at: '2026-01-01T00:00:00Z', created_by: 'user-test-001',
    ...overrides,
  };
}

function target(overrides: Partial<SalesTarget> = {}): SalesTarget {
  return {
    id: 'target-1', scope: 'business', branchId: null, staffId: null,
    periodStart: '2026-01-01', periodEnd: '2026-01-31',
    targetAmountUgx: 1000000, createdAt: '2026-01-01T00:00:00Z', createdBy: 'user-test-001',
    ...overrides,
  };
}

// ---- listTargets --------------------------------------------------

describe('listTargets', () => {
  it('denies without salesTargets view permission', async () => {
    const result = await listTargets(makeNoPermissionContext());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('returns mapped targets on success', async () => {
    push({ data: [targetRow(), targetRow({ id: 'target-2', branch_id: 'branch-test-001' })], error: null });
    const result = await listTargets(ctx());
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data?.[0].scope).toBe('business');
    expect(result.data?.[1].scope).toBe('branch');
  });

  it('maps a database error to INTERNAL_ERROR', async () => {
    push({ data: null, error: { message: 'db down' } });
    const result = await listTargets(ctx());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });
});

// ---- createTarget ---------------------------------------------------

describe('createTarget', () => {
  const validInput: SalesTargetInput = {
    scope: 'business', branchId: null, staffId: null,
    periodStart: '2026-02-01', periodEnd: '2026-02-28', targetAmountUgx: 500000,
  };

  it('denies without salesTargets create permission', async () => {
    const result = await createTarget(makeNoPermissionContext(), validInput);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('rejects an end date before the start date', async () => {
    const result = await createTarget(ctx(), { ...validInput, periodStart: '2026-02-28', periodEnd: '2026-02-01' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('rejects a non-positive target amount', async () => {
    const result = await createTarget(ctx(), { ...validInput, targetAmountUgx: 0 });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('throws InvalidTargetScopeError for a branch target with no branch selected', async () => {
    await expect(createTarget(ctx(), { ...validInput, scope: 'branch', branchId: null })).rejects.toThrow(InvalidTargetScopeError);
  });

  it('throws InvalidTargetScopeError for a staff target with no staff selected', async () => {
    await expect(createTarget(ctx(), { ...validInput, scope: 'staff', staffId: null })).rejects.toThrow(InvalidTargetScopeError);
  });

  it('throws OverlappingTargetError when an existing target in the same scope overlaps the period', async () => {
    push({ data: [{ id: 'existing-1', period_start: '2026-02-10', period_end: '2026-02-20' }], error: null }); // overlap check
    await expect(createTarget(ctx(), validInput)).rejects.toThrow(OverlappingTargetError);
  });

  it('creates the target when there is no overlap', async () => {
    push({ data: [], error: null }); // overlap check: none
    push({ data: targetRow({ period_start: '2026-02-01', period_end: '2026-02-28', target_amount: 500000 }), error: null }); // insert
    const result = await createTarget(ctx(), validInput);
    expect(result.success).toBe(true);
    expect(result.data?.targetAmountUgx).toBe(500000);
  });

  it('maps an overlap-check database error to INTERNAL_ERROR', async () => {
    push({ data: null, error: { message: 'query failed' } });
    const result = await createTarget(ctx(), validInput);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });

  it('maps an insert failure to INTERNAL_ERROR', async () => {
    push({ data: [], error: null }); // overlap check: none
    push({ data: null, error: { message: 'insert failed' } }); // insert fails
    const result = await createTarget(ctx(), validInput);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });
});

// ---- updateTarget ---------------------------------------------------

describe('updateTarget', () => {
  const validInput = { periodStart: '2026-01-05', periodEnd: '2026-01-25', targetAmountUgx: 750000 };

  it('denies without salesTargets edit permission', async () => {
    const result = await updateTarget(makeNoPermissionContext(), 'target-1', validInput);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('rejects an end date before the start date', async () => {
    const result = await updateTarget(ctx(), 'target-1', { periodStart: '2026-01-25', periodEnd: '2026-01-05', targetAmountUgx: 750000 });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('rejects a non-positive target amount', async () => {
    const result = await updateTarget(ctx(), 'target-1', { ...validInput, targetAmountUgx: -1 });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('returns RESOURCE_NOT_FOUND when the target is not a real row (e.g. only local)', async () => {
    push({ data: null, error: null }); // current-row lookup: not found
    const result = await updateTarget(ctx(), 'target-1', validInput);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('maps a current-row lookup error to INTERNAL_ERROR', async () => {
    push({ data: null, error: { message: 'lookup failed' } });
    const result = await updateTarget(ctx(), 'target-1', validInput);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });

  it('throws OverlappingTargetError when another target in the same scope overlaps the new period', async () => {
    push({ data: { id: 'target-1', branch_id: null, user_id: null }, error: null }); // current row
    push({ data: [{ id: 'other-1', period_start: '2026-01-10', period_end: '2026-01-20' }], error: null }); // overlap check
    await expect(updateTarget(ctx(), 'target-1', validInput)).rejects.toThrow(OverlappingTargetError);
  });

  it('updates the target when there is no overlap', async () => {
    push({ data: { id: 'target-1', branch_id: null, user_id: null }, error: null }); // current row
    push({ data: [], error: null }); // overlap check: none
    push({ data: targetRow({ period_start: validInput.periodStart, period_end: validInput.periodEnd, target_amount: validInput.targetAmountUgx }), error: null }); // update
    const result = await updateTarget(ctx(), 'target-1', validInput);
    expect(result.success).toBe(true);
    expect(result.data?.targetAmountUgx).toBe(750000);
  });

  it('maps an update failure to INTERNAL_ERROR', async () => {
    push({ data: { id: 'target-1', branch_id: null, user_id: null }, error: null }); // current row
    push({ data: [], error: null }); // overlap check
    push({ data: null, error: { message: 'update failed' } }); // update fails
    const result = await updateTarget(ctx(), 'target-1', validInput);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });
});

// ---- deleteTarget ---------------------------------------------------

describe('deleteTarget', () => {
  it('denies without salesTargets delete permission', async () => {
    const result = await deleteTarget(makeNoPermissionContext(), 'target-1');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('reports deleted:true when a real row was removed', async () => {
    push({ data: [{ id: 'target-1' }], error: null });
    const result = await deleteTarget(ctx(), 'target-1');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ deleted: true });
  });

  it('reports deleted:false when no real row matched (e.g. a local-only target)', async () => {
    push({ data: [], error: null });
    const result = await deleteTarget(ctx(), 'target-1');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ deleted: false });
  });

  it('maps a database error to INTERNAL_ERROR', async () => {
    push({ data: null, error: { message: 'delete failed' } });
    const result = await deleteTarget(ctx(), 'target-1');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });
});

// ---- getProgress / getAllProgress -----------------------------------

describe('getProgress', () => {
  it('computes achievement percent and clamped remaining for a business-scope target', async () => {
    push({ data: [{ total_amount: 300000 }, { total_amount: 200000 }], error: null });
    const result = await getProgress(ctx(), target({ targetAmountUgx: 1000000 }));
    expect(result.success).toBe(true);
    expect(result.data?.achievedUgx).toBe(500000);
    expect(result.data?.achievementPercent).toBe(50);
    expect(result.data?.remainingUgx).toBe(500000);
  });

  it('clamps remainingUgx to 0 when achievement exceeds the target', async () => {
    push({ data: [{ total_amount: 1500000 }], error: null });
    const result = await getProgress(ctx(), target({ targetAmountUgx: 1000000 }));
    expect(result.data?.remainingUgx).toBe(0);
    expect(result.data?.achievementPercent).toBe(150);
  });

  it('filters by branch_id for a branch-scope target', async () => {
    push({ data: [], error: null });
    await getProgress(ctx(), target({ scope: 'branch', branchId: TEST_BUSINESS_ID }));
    expect(chain.eq).toHaveBeenCalledWith('branch_id', TEST_BUSINESS_ID);
  });

  it('filters by served_by for a staff-scope target', async () => {
    push({ data: [], error: null });
    await getProgress(ctx(), target({ scope: 'staff', staffId: 'user-test-001' }));
    expect(chain.eq).toHaveBeenCalledWith('served_by', 'user-test-001');
  });

  it('reports 0% achievement for a zero-amount target without dividing by zero', async () => {
    push({ data: [], error: null });
    const result = await getProgress(ctx(), target({ targetAmountUgx: 0 }));
    expect(result.data?.achievementPercent).toBe(0);
  });

  it('surfaces a database error as INTERNAL_ERROR', async () => {
    push({ data: null, error: { message: 'query failed' } });
    const result = await getProgress(ctx(), target());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });
});

describe('getAllProgress', () => {
  it('computes progress for every target in order', async () => {
    push({ data: [{ total_amount: 100000 }], error: null });
    push({ data: [{ total_amount: 200000 }], error: null });
    const targets = [target({ id: 't1', targetAmountUgx: 1000000 }), target({ id: 't2', targetAmountUgx: 500000 })];
    const results = await getAllProgress(ctx(), targets);
    expect(results).toHaveLength(2);
    expect(results[0].achievedUgx).toBe(100000);
    expect(results[1].achievedUgx).toBe(200000);
  });

  it('falls back to zero achievement for a target whose query failed, without failing the rest', async () => {
    push({ data: null, error: { message: 'boom' } });
    const results = await getAllProgress(ctx(), [target({ id: 't1', targetAmountUgx: 1000000 })]);
    expect(results[0]).toEqual({ target: expect.objectContaining({ id: 't1' }), achievedUgx: 0, remainingUgx: 1000000, achievementPercent: 0 });
  });

  it('returns an empty array for an empty target list', async () => {
    const results = await getAllProgress(ctx(), []);
    expect(results).toEqual([]);
  });
});

// ---- isCurrentPeriod --------------------------------------------------

describe('isCurrentPeriod', () => {
  it('returns true for a period spanning today', () => {
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(now.getTime() + 5 * 86_400_000).toISOString().slice(0, 10);
    expect(isCurrentPeriod(target({ periodStart: start, periodEnd: end }))).toBe(true);
  });

  it('returns false for a period entirely in the past', () => {
    expect(isCurrentPeriod(target({ periodStart: '2020-01-01', periodEnd: '2020-01-31' }))).toBe(false);
  });

  it('returns false for a period entirely in the future', () => {
    expect(isCurrentPeriod(target({ periodStart: '2099-01-01', periodEnd: '2099-01-31' }))).toBe(false);
  });
});
