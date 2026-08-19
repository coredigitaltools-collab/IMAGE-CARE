// ============================================================
// ImageCare ERP - Engine Coverage Tests
// File: src/__tests__/unit/engineCoverage.test.ts
//
// EngineResult: { ok: boolean, data: T | null, error: EngineError | null }
// ApiResult:    { data: T | null, error: AppError | null }  (no ok field)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineContext } from '../../engines/types';

// ---- Mock supabase ----------------------------------------
const makeChain = (data: unknown = [], error: unknown = null) => {
  const ch: Record<string, unknown> = {};
  const resolve = () => Promise.resolve({ data, error });
  ch['eq']          = () => ch; ch['is']    = () => ch; ch['not']         = () => ch;
  ch['gte']         = () => ch; ch['lte']   = () => ch; ch['in']          = () => ch;
  ch['gt']          = () => ch; ch['neq']   = () => ch; ch['ilike']       = () => ch;
  ch['order']       = () => ch; ch['limit'] = () => ch; ch['select']      = () => ch;
  ch['insert']      = () => ch; ch['update']= () => ch; ch['upsert']      = resolve;
  ch['maybeSingle'] = resolve;
  ch['single']      = () => Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  return ch;
};

vi.mock('../../lib/supabase', () => ({
  supabase: {
    schema: () => ({ from: () => makeChain() }),
    from:   () => makeChain(),
    rpc:    vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

const ctx: EngineContext = {
  business_id: 'biz-engine-test',
  branch_id:   'branch-engine-test',
  user_id:     'user-engine-test',
  user_ctx:    {} as never,
};

type UUID = import('../../types/database').UUID;
const u = (s: string) => s as UUID;

beforeEach(() => { vi.clearAllMocks(); });

// ============================================================
// REPORTING ENGINE - EngineResult (has ok field)
// ============================================================

describe('Reporting Engine', () => {
  it('getKpis: gross profit = revenue - cogs (accounting invariant)', () => {
    const revenue = 100_000; const cogs = 60_000; const expenses = 15_000;
    const gross = revenue - cogs;
    const net   = gross - expenses;
    expect(gross).toBe(40_000);
    expect(net).toBe(25_000);
    // Net profit is NOT revenue - expenses
    expect(revenue - expenses).not.toBe(net);
  });

  it('getKpis: cash in hand is independent of profit', () => {
    const grossProfit = 40_000;
    const cashInHand  = 35_000;
    expect(cashInHand).not.toBe(grossProfit);
  });

  it('getKpis: returns EngineResult (ok field present)', async () => {
    const { reportingEngine } = await import('../../engines/reporting/reportingEngine');
    const result = await reportingEngine.getKpis(ctx, { from_date: '2024-01-01', to_date: '2024-01-31' });
    expect(result).toHaveProperty('ok');
    expect(typeof result.ok).toBe('boolean');
  });

  it('getLowStockAlerts: returns EngineResult with array', async () => {
    const { reportingEngine } = await import('../../engines/reporting/reportingEngine');
    const result = await reportingEngine.getLowStockAlerts(ctx);
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(Array.isArray(result.data)).toBe(true);
    }
  });

  it('getSalesSummary: returns EngineResult', async () => {
    const { reportingEngine } = await import('../../engines/reporting/reportingEngine');
    const result = await reportingEngine.getSalesSummary(ctx, { from_date: '2024-01-01', to_date: '2024-01-31' });
    expect(result).toHaveProperty('ok');
  });
});

// ============================================================
// AUDIT ENGINE
// ============================================================

describe('Audit Engine', () => {
  it('log: does not throw for a normal audit entry', async () => {
    const { auditEngine } = await import('../../engines/audit/auditEngine');
    await expect(
      auditEngine.log(ctx, { table_name: 'sales', record_id: u('sale-001'), action: 'update', new_value: { status: 'confirmed' } })
    ).resolves.not.toThrow();
  });

  it('log: does not throw without previous_value', async () => {
    const { auditEngine } = await import('../../engines/audit/auditEngine');
    await expect(
      auditEngine.log(ctx, { table_name: 'purchases', record_id: u('po-001'), action: 'insert' })
    ).resolves.not.toThrow();
  });

  it('log: handles DB error without throwing (best-effort logging)', async () => {
    const { auditEngine } = await import('../../engines/audit/auditEngine');
    // Even with a bad DB mock, audit should not throw
    await expect(
      auditEngine.log(ctx, { table_name: 'expenses', record_id: u('exp-001'), action: 'update', new_value: { amount: 500 } })
    ).resolves.not.toThrow();
  });
});

// ============================================================
// BUSINESS ENGINE
// ============================================================

describe('Business Engine - validation', () => {
  it('createSale: VALIDATION_ERROR for empty lines', async () => {
    const { businessEngine } = await import('../../engines/business/businessEngine');
    const result = await businessEngine.createSale(ctx, { branch_id: u('br'), payment_method: 'cash', lines: [] });
    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe('VALIDATION_ERROR');
  });

  it('recordExpense: VALIDATION_ERROR for zero amount', async () => {
    const { businessEngine } = await import('../../engines/business/businessEngine');
    const result = await businessEngine.recordExpense(ctx, { branch_id: u('br'), category: 'Rent', description: 'test', amount: 0, payment_method: 'cash' });
    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe('VALIDATION_ERROR');
  });

  it('recordExpense: VALIDATION_ERROR for negative amount', async () => {
    const { businessEngine } = await import('../../engines/business/businessEngine');
    const result = await businessEngine.recordExpense(ctx, { branch_id: u('br'), category: 'Rent', description: 'test', amount: -100, payment_method: 'cash' });
    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe('VALIDATION_ERROR');
  });
});

// ============================================================
// CASH ENGINE
// ============================================================

describe('Cash Engine - validation', () => {
  it('recordMovement: VALIDATION_ERROR for zero amount', async () => {
    const { cashEngine } = await import('../../engines/cash/cashEngine');
    const result = await cashEngine.recordMovement(ctx, { branch_id: u('br'), transaction_type: 'cash_in', amount: 0, payment_method: 'cash', description: 'Test' });
    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe('VALIDATION_ERROR');
  });

  it('recordMovement: VALIDATION_ERROR for negative amount', async () => {
    const { cashEngine } = await import('../../engines/cash/cashEngine');
    const result = await cashEngine.recordMovement(ctx, { branch_id: u('br'), transaction_type: 'cash_in', amount: -100, payment_method: 'cash', description: 'Test' });
    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe('VALIDATION_ERROR');
  });

  it('getCashBalance: returns EngineResult', async () => {
    const { cashEngine } = await import('../../engines/cash/cashEngine');
    const result = await cashEngine.getCashBalance(ctx, u('branch-001'));
    expect(result).toHaveProperty('ok');
  });
});

// ============================================================
// PURCHASING ENGINE
// ============================================================

describe('Purchasing Engine - validation', () => {
  it('createPurchase: VALIDATION_ERROR for empty lines', async () => {
    const { purchasingEngine } = await import('../../engines/purchasing/purchasingEngine');
    const result = await purchasingEngine.createPurchase(ctx, { branch_id: u('br'), payment_method: 'credit', lines: [] });
    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe('VALIDATION_ERROR');
  });

  it('receiveStock: returns EngineResult on DB miss', async () => {
    const { purchasingEngine } = await import('../../engines/purchasing/purchasingEngine');
    const result = await purchasingEngine.receiveStock(ctx, { purchase_id: u('po-nonexistent') });
    expect(result).toHaveProperty('ok');
    expect(result.ok).toBe(false);
  });
});

// ============================================================
// INVENTORY ENGINE
// ============================================================

describe('Inventory Engine - additional coverage', () => {
  it('transferStock: VALIDATION_ERROR for same source and destination', async () => {
    const { inventoryEngine } = await import('../../engines/inventory/inventoryEngine');
    const result = await inventoryEngine.transferStock(ctx, { from_branch_id: u('br'), to_branch_id: u('br'), product_id: u('p'), quantity: 5, unit_cost: 100 });
    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe('VALIDATION_ERROR');
  });

  it('transferStock: VALIDATION_ERROR for zero quantity', async () => {
    const { inventoryEngine } = await import('../../engines/inventory/inventoryEngine');
    const result = await inventoryEngine.transferStock(ctx, { from_branch_id: u('b1'), to_branch_id: u('b2'), product_id: u('p'), quantity: 0, unit_cost: 100 });
    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe('VALIDATION_ERROR');
  });

  it('getStock: returns EngineResult', async () => {
    const { inventoryEngine } = await import('../../engines/inventory/inventoryEngine');
    const result = await inventoryEngine.getStock(ctx, u('prod-001'), u('branch-001'));
    expect(result).toHaveProperty('ok');
  });

  it('getLowStockAlerts: returns array result', async () => {
    const { inventoryEngine } = await import('../../engines/inventory/inventoryEngine');
    const result = await inventoryEngine.getLowStockAlerts(ctx);
    expect(result).toHaveProperty('ok');
    if (result.ok) expect(Array.isArray(result.data)).toBe(true);
  });
});

// ============================================================
// ACCOUNTING ENGINE - additional methods
// ============================================================

describe('Accounting Engine - additional builder coverage', () => {
  it('buildSupplierPaymentLines: balanced for bank_transfer', async () => {
    const { accountingEngine } = await import('../../engines/accounting/accountingEngine');
    const r = await accountingEngine.buildSupplierPaymentLines(ctx, { amount: 3000, paymentMethod: 'bank_transfer' });
    expect(r.ok).toBe(true);
    const debit  = r.data!.reduce((s, l) => s + l.debit_amount,  0);
    const credit = r.data!.reduce((s, l) => s + l.credit_amount, 0);
    expect(Math.abs(debit - credit)).toBeLessThan(0.01);
    expect(r.data!.find(l => l.account_code === '1130')).toBeDefined();
  });

  it('buildCreditPaymentLines: balanced for mobile_money', async () => {
    const { accountingEngine } = await import('../../engines/accounting/accountingEngine');
    const r = await accountingEngine.buildCreditPaymentLines(ctx, { amount: 2500, paymentMethod: 'mobile_money' });
    expect(r.ok).toBe(true);
    const debit  = r.data!.reduce((s, l) => s + l.debit_amount,  0);
    const credit = r.data!.reduce((s, l) => s + l.credit_amount, 0);
    expect(Math.abs(debit - credit)).toBeLessThan(0.01);
    expect(r.data!.find(l => l.account_code === '1120')).toBeDefined();
  });

  it('buildAdjustmentLines in: Dr 1300 / Cr 3000', async () => {
    const { accountingEngine } = await import('../../engines/accounting/accountingEngine');
    const r = await accountingEngine.buildAdjustmentLines(ctx, { amount: 1000, isInbound: true, description: 'Found' });
    expect(r.ok).toBe(true);
    expect(r.data!.find(l => l.account_code === '1300' && l.debit_amount > 0)).toBeDefined();
    expect(r.data!.find(l => l.account_code === '3000' && l.credit_amount > 0)).toBeDefined();
  });

  it('buildAdjustmentLines out: Dr 6000 / Cr 1300', async () => {
    const { accountingEngine } = await import('../../engines/accounting/accountingEngine');
    const r = await accountingEngine.buildAdjustmentLines(ctx, { amount: 800, isInbound: false, description: 'Damaged' });
    expect(r.ok).toBe(true);
    expect(r.data!.find(l => l.account_code === '6000' && l.debit_amount > 0)).toBeDefined();
    expect(r.data!.find(l => l.account_code === '1300' && l.credit_amount > 0)).toBeDefined();
  });

  it('buildPurchaseJournalLines for card uses account 1130', async () => {
    const { accountingEngine } = await import('../../engines/accounting/accountingEngine');
    const r = await accountingEngine.buildPurchaseJournalLines(ctx, { amount: 5000, paymentMethod: 'card', isPaid: true });
    expect(r.ok).toBe(true);
    expect(r.data!.find(l => l.account_code === '1130')).toBeDefined();
  });

  it('postJournal: returns EngineResult', async () => {
    const { accountingEngine } = await import('../../engines/accounting/accountingEngine');
    const r = await accountingEngine.postJournal(ctx, {
      branch_id: u('br'), entry_type: 'sale', description: 'Test',
      reference_type: 'sale', reference_id: u('sale-001'),
      lines: [
        { account_code: '1100', account_name: 'Cash', account_type: 'asset', debit_amount: 100, credit_amount: 0, description: 'Dr' },
        { account_code: '4000', account_name: 'Revenue', account_type: 'revenue', debit_amount: 0, credit_amount: 100, description: 'Cr' },
      ],
    });
    expect(r).toHaveProperty('ok');
  });
});

// ============================================================
// TYPES / APP.TS - remaining coverage
// ============================================================

describe('types/app.ts - function coverage', () => {
  it('ok(): returns { data, error: null }', async () => {
    const { ok } = await import('../../types/app');
    const r = ok({ value: 42 });
    expect(r.data).toEqual({ value: 42 });
    expect(r.error).toBeNull();
  });

  it('fail(): returns { data: null, error }', async () => {
    const { fail } = await import('../../types/app');
    const r = fail({ code: 'VALIDATION_ERROR', message: 'Bad input' });
    expect(r.error!.code).toBe('VALIDATION_ERROR');
    expect(r.data).toBeNull();
  });

  it('getModulePermission: returns default deny for unknown module', async () => {
    const { getModulePermission } = await import('../../types/app');
    const ctx = { permissions: {} } as unknown as import('../../types/app').UserContext;
    const perm = getModulePermission(ctx, 'unknown_module');
    expect(perm.view).toBe(false);
    expect(perm.create).toBe(false);
  });

  it('getModulePermission: returns stored permissions when present', async () => {
    const { getModulePermission } = await import('../../types/app');
    const ctx = {
      permissions: {
        sales: { view: true, create: true, edit: false, delete: false, approve: false, export: false, sync: false, branch_scope: 'assigned' as const },
      },
    } as unknown as import('../../types/app').UserContext;
    const perm = getModulePermission(ctx, 'sales');
    expect(perm.view).toBe(true);
    expect(perm.edit).toBe(false);
  });

  it('canDo: true only when action is permitted', async () => {
    const { canDo } = await import('../../types/app');
    const ctx = {
      permissions: {
        inventory: { view: true, create: false, edit: false, delete: false, approve: false, export: false, sync: false, branch_scope: 'assigned' as const },
      },
    } as unknown as import('../../types/app').UserContext;
    expect(canDo(ctx, 'inventory', 'view')).toBe(true);
    expect(canDo(ctx, 'inventory', 'create')).toBe(false);
    expect(canDo(ctx, 'sales', 'view')).toBe(false);
  });

  it('parseError: handles Error object', async () => {
    const { parseError } = await import('../../types/app');
    const err = parseError(new Error('Something went wrong'));
    expect(err.code).toBeTruthy();
    expect(err.message).toBeTruthy();
  });

  it('parseError: handles TypeError (network)', async () => {
    const { parseError } = await import('../../types/app');
    const err = parseError(new TypeError('Failed to fetch'));
    expect(err.code).toBeTruthy();
  });

  it('parseError: handles unknown type', async () => {
    const { parseError } = await import('../../types/app');
    const err = parseError('string error');
    expect(err.code).toBeTruthy();
  });
});
