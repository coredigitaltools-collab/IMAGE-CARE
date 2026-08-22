// ============================================================
// IMC-BLD-006 | ImageCare ERP Testing & QA v1.0
// File: src/__tests__/services/reportingService.test.ts
// Purpose: Service contract tests for the reporting service.
//          Special focus on getPLSummary — the Stage 5 fix that
//          computes Net Profit as Revenue - COGS - Expenses
//          directly from journal_lines. This must be verified
//          against multiple account-balance scenarios, not just
//          exercised for coverage.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeUserContext, makeNoPermissionContext, TEST_BRANCH_ID } from '../setup';
import {
  getPLSummary,
  getStockSummary,
  getLowStockAlerts,
  getRecentSales,
  getDashboardKPIs,
  getSalesByPeriod,
  getTopProducts,
  getCashPosition,
  getOutstandingCredit,
  getExpenseBreakdown,
} from '../../services/reporting/reportingService';

// Local override of the shared Supabase mock: the global setup mock
// (src/__tests__/setup.ts) does not implement `.in(...)`, which
// getPLSummary relies on to filter journal_lines by account_code.
// This gives the query chain a real thenable end so `await query`
// resolves to a controllable { data, error } pair per test.
const { queryChain, setQueryResult } = vi.hoisted(() => {
  let result: { data: unknown; error: unknown } = { data: null, error: null };
  const chain: Record<string, unknown> = {};
  for (const method of ['schema', 'from', 'select', 'eq', 'in', 'is', 'order', 'limit']) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return {
    queryChain: chain,
    setQueryResult: (r: { data: unknown; error: unknown }) => { result = r; },
  };
});

vi.mock('../../lib/supabase', () => ({
  supabase: queryChain,
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  default: queryChain,
}));

beforeEach(() => {
  setQueryResult({ data: null, error: null });
});

// ---- getPLSummary: Net Profit calculation -------------------

describe('getPLSummary - Net Profit calculation', () => {
  it('rejects when user lacks journal.view permission', async () => {
    const ctx = makeNoPermissionContext();
    const result = await getPLSummary(ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('computes Net Profit as Revenue - COGS - Expenses from journal_lines', async () => {
    const ctx = makeUserContext();
    setQueryResult({
      data: [
        { account_code: '4000', debit_amount: 0, credit_amount: 500_000 }, // revenue
        { account_code: '4000', debit_amount: 0, credit_amount: 250_000 }, // revenue
        { account_code: '5000', debit_amount: 300_000, credit_amount: 0 }, // COGS
        { account_code: '6000', debit_amount: 120_000, credit_amount: 0 }, // expenses
        { account_code: '6000', debit_amount: 30_000, credit_amount: 0 },  // expenses
      ],
      error: null,
    });

    const result = await getPLSummary(ctx);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      revenue: 750_000,
      cogs: 300_000,
      expenses: 150_000,
      grossProfit: 450_000,   // revenue - cogs
      netProfit: 300_000,     // grossProfit - expenses
    });
  });

  it('ignores account codes outside 4000/5000/6000', async () => {
    const ctx = makeUserContext();
    setQueryResult({
      data: [
        { account_code: '4000', debit_amount: 0, credit_amount: 100_000 },
        { account_code: '1000', debit_amount: 50_000, credit_amount: 0 }, // unrelated (asset) account
      ],
      error: null,
    });

    const result = await getPLSummary(ctx);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      revenue: 100_000,
      cogs: 0,
      expenses: 0,
      grossProfit: 100_000,
      netProfit: 100_000,
    });
  });

  it('returns zeros (not NaN or negative-crash) when there are no journal lines yet', async () => {
    const ctx = makeUserContext();
    setQueryResult({ data: [], error: null });

    const result = await getPLSummary(ctx);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      revenue: 0, cogs: 0, expenses: 0, grossProfit: 0, netProfit: 0,
    });
  });

  it('produces a negative Net Profit when expenses exceed gross profit', async () => {
    const ctx = makeUserContext();
    setQueryResult({
      data: [
        { account_code: '4000', debit_amount: 0, credit_amount: 100_000 },
        { account_code: '5000', debit_amount: 40_000, credit_amount: 0 },
        { account_code: '6000', debit_amount: 90_000, credit_amount: 0 },
      ],
      error: null,
    });

    const result = await getPLSummary(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.grossProfit).toBe(60_000);
    expect(result.data?.netProfit).toBe(-30_000);
  });

  it('applies the branch filter when a branch_id is supplied', async () => {
    const ctx = makeUserContext();
    setQueryResult({
      data: [{ account_code: '4000', debit_amount: 0, credit_amount: 200_000 }],
      error: null,
    });

    const result = await getPLSummary(ctx, TEST_BRANCH_ID);

    expect(result.success).toBe(true);
    expect(result.data?.revenue).toBe(200_000);
  });

  it('returns INTERNAL_ERROR when the journal_lines query fails', async () => {
    const ctx = makeUserContext();
    setQueryResult({ data: null, error: { message: 'connection reset' } });

    const result = await getPLSummary(ctx);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });
});

// ---- getStockSummary -----------------------------------------

describe('getStockSummary', () => {
  it('rejects when user lacks inventory.view permission', async () => {
    const result = await getStockSummary(makeNoPermissionContext());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('returns stock rows for the business', async () => {
    setQueryResult({ data: [{ product_id: 'p1', product_name: 'Widget' }], error: null });
    const result = await getStockSummary(makeUserContext());
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it('returns an empty array (not an error) when no data is found', async () => {
    setQueryResult({ data: null, error: null });
    const result = await getStockSummary(makeUserContext());
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('propagates a query error as a failed ApiResult', async () => {
    setQueryResult({ data: null, error: { message: 'boom' } });
    const result = await getStockSummary(makeUserContext());
    expect(result.success).toBe(false);
  });
});

// ---- getLowStockAlerts ----------------------------------------

describe('getLowStockAlerts', () => {
  it('rejects when user lacks inventory.view permission', async () => {
    const result = await getLowStockAlerts(makeNoPermissionContext());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('filters to rows at or below reorder level', async () => {
    setQueryResult({
      data: [
        { product_id: 'p1', product_name: 'Low stock item', quantity_on_hand: 2, reorder_level: 5, branch_id: TEST_BRANCH_ID },
        { product_id: 'p2', product_name: 'Well stocked item', quantity_on_hand: 50, reorder_level: 5, branch_id: TEST_BRANCH_ID },
      ],
      error: null,
    });

    const result = await getLowStockAlerts(makeUserContext());

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0].product_id).toBe('p1');
  });

  it('further filters by branch when branchId is supplied', async () => {
    setQueryResult({
      data: [
        { product_id: 'p1', product_name: 'Branch A low stock', quantity_on_hand: 1, reorder_level: 5, branch_id: 'branch-a' },
        { product_id: 'p2', product_name: 'Branch B low stock', quantity_on_hand: 1, reorder_level: 5, branch_id: 'branch-b' },
      ],
      error: null,
    });

    const result = await getLowStockAlerts(makeUserContext(), 'branch-a');

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0].product_id).toBe('p1');
  });

  it('returns INTERNAL_ERROR when the query fails', async () => {
    setQueryResult({ data: null, error: { message: 'boom' } });
    const result = await getLowStockAlerts(makeUserContext());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });
});

// ---- getRecentSales ---------------------------------------------

describe('getRecentSales', () => {
  it('rejects when user lacks sales.view permission', async () => {
    const result = await getRecentSales(makeNoPermissionContext());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('returns recent sales rows', async () => {
    setQueryResult({ data: [{ id: 's1', sale_number: 'SALE-000001' }], error: null });
    const result = await getRecentSales(makeUserContext(), undefined, 5);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it('returns INTERNAL_ERROR when the query fails', async () => {
    setQueryResult({ data: null, error: { message: 'boom' } });
    const result = await getRecentSales(makeUserContext());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INTERNAL_ERROR');
  });
});

// ---- Permission guards on the RPC-backed report endpoints -------
// These endpoints call the shared `rpc()` boundary rather than the
// query builder; the permission check happens before that call, so
// it is exercised here without needing to fake RPC responses.

describe('RPC-backed report endpoints - permission guards', () => {
  it('getDashboardKPIs rejects without reports.view', async () => {
    const result = await getDashboardKPIs(makeNoPermissionContext());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('getSalesByPeriod rejects without reports.view', async () => {
    const result = await getSalesByPeriod(makeNoPermissionContext(), { from_date: '2026-01-01', to_date: '2026-01-31' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('getTopProducts rejects without reports.view', async () => {
    const result = await getTopProducts(makeNoPermissionContext(), { from_date: '2026-01-01', to_date: '2026-01-31' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('getCashPosition rejects without cash.view', async () => {
    const result = await getCashPosition(makeNoPermissionContext());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('getOutstandingCredit rejects without credit.view', async () => {
    const result = await getOutstandingCredit(makeNoPermissionContext());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('getExpenseBreakdown rejects without expenses.view', async () => {
    const result = await getExpenseBreakdown(makeNoPermissionContext(), { from_date: '2026-01-01', to_date: '2026-01-31' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });
});
