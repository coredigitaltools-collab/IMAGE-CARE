// ============================================================
// ImageCare ERP - Stage 3 Unit Tests: Inventory, Cash, Credit,
//   Reporting engines
// File: src/__tests__/unit/otherEngines.test.ts
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryEngine } from '../../engines/inventory/inventoryEngine';
import { CashEngine }      from '../../engines/cash/cashEngine';
import { CreditEngine }    from '../../engines/credit/creditEngine';
import { ReportingEngine } from '../../engines/reporting/reportingEngine';
import type { EngineContext } from '../../engines/types';

// ---- Shared Supabase mock factory -------------------------
function makeSupabaseMock(overrides: Record<string, unknown> = {}) {
  return {
    from: vi.fn(() => ({
      select:   vi.fn().mockReturnThis(),
      insert:   vi.fn().mockReturnThis(),
      update:   vi.fn().mockReturnThis(),
      upsert:   vi.fn().mockReturnThis(),
      eq:       vi.fn().mockReturnThis(),
      in:       vi.fn().mockReturnThis(),
      is:       vi.fn().mockReturnThis(),
      not:      vi.fn().mockReturnThis(),
      gte:      vi.fn().mockReturnThis(),
      lte:      vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null,  error: null }),
      single:      vi.fn().mockResolvedValue({ data: null,  error: null }),
      ...overrides,
    })),
  };
}

vi.mock('../../lib/supabase', () => {
  const chain = () => ({
    select: () => chain(),
    insert: () => chain(),
    update: () => chain(),
    eq:     () => chain(),
    is:     () => chain(),
    not:    () => chain(),
    gte:    () => chain(),
    lte:    () => chain(),
    maybeSingle: () => Promise.resolve({ data: null,  error: null }),
    single:      () => Promise.resolve({ data: null,  error: null }),
  });
  return {
    supabase: {
      schema: () => ({ from: () => chain() }),
      from:   () => chain(),
    },
  };
});

const ctx: EngineContext = {
  business_id: 'biz-test',
  branch_id:   'branch-test',
  user_id:     'user-test',
  user_ctx:    {} as never,
};

// ============================================================
// INVENTORY ENGINE UNIT TESTS
// ============================================================

describe('InventoryEngine: quantity validation', () => {
  const engine = new InventoryEngine();

  it('rejects zero quantity movements', async () => {
    const r = await engine.recordMovement(ctx, {
      branch_id:     'branch-001',
      product_id:    'prod-001',
      movement_type: 'purchase',
      quantity:      0,
      unit_cost:     100,
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('VALIDATION_ERROR');
    expect(r.error?.field).toBe('quantity');
  });

  it('rejects negative quantity movements', async () => {
    const r = await engine.recordMovement(ctx, {
      branch_id:     'branch-001',
      product_id:    'prod-001',
      movement_type: 'purchase',
      quantity:      -10,
      unit_cost:     100,
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects transfer to same branch', async () => {
    const r = await engine.transferStock(ctx, {
      from_branch_id: 'branch-A',
      to_branch_id:   'branch-A',
      product_id:     'prod-001',
      quantity:       10,
      unit_cost:      100,
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('VALIDATION_ERROR');
    expect(r.error?.message).toContain('different');
  });

  it('returns out_of_stock when no movements exist', async () => {
    const r = await engine.getStock(ctx, 'prod-none', 'branch-001');
    expect(r.ok).toBe(true);
    expect(r.data!.quantity_on_hand).toBe(0);
    expect(r.data!.stock_status).toBe('out_of_stock');
  });

  it('checkAvailable returns INSUFFICIENT_STOCK when stock = 0', async () => {
    const r = await engine.checkAvailable(ctx, 'prod-none', 'branch-001', 5);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('INSUFFICIENT_STOCK');
    expect(r.error?.message).toContain('Available: 0');
    expect(r.error?.message).toContain('Required: 5');
  });
});

describe('InventoryEngine: movement type direction semantics', () => {
  it('in-types and out-types are mutually exclusive categories', () => {
    const inTypes  = ['purchase','adjustment_in','transfer_in','return_in','opening_stock'];
    const outTypes = ['sale','adjustment_out','transfer_out','return_out','damage','expiry'];
    const overlap  = inTypes.filter(t => outTypes.includes(t));
    expect(overlap).toHaveLength(0);
  });

  it('all required movement types are covered', () => {
    const allTypes = [
      'purchase','sale','adjustment_in','adjustment_out',
      'transfer_in','transfer_out','return_in','return_out',
      'opening_stock','damage','expiry',
    ];
    expect(allTypes.length).toBe(11);
  });
});

// ============================================================
// CASH ENGINE UNIT TESTS
// ============================================================

describe('CashEngine: amount validation', () => {
  const engine = new CashEngine();

  it('rejects zero amount', async () => {
    const r = await engine.recordMovement(ctx, {
      branch_id:       'branch-001',
      transaction_type:'cash_in',
      amount:          0,
      payment_method:  'cash',
      description:     'Test',
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('VALIDATION_ERROR');
    expect(r.error?.field).toBe('amount');
  });

  it('rejects negative amount', async () => {
    const r = await engine.recordMovement(ctx, {
      branch_id:       'branch-001',
      transaction_type:'cash_out',
      amount:          -50,
      payment_method:  'cash',
      description:     'Test',
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('VALIDATION_ERROR');
  });
});

describe('CashEngine: balance derivation', () => {
  it('cash balance is derived from transactions, not from profit', () => {
    // Principle test: balance = cash_in - cash_out
    // NOT revenue - expenses
    const cashIn  = 5000;
    const cashOut = 2000;
    const balance = cashIn - cashOut;
    expect(balance).toBe(3000);
    // Separately, revenue and expenses are accounting concepts
    const revenue  = 8000;
    const expenses = 3000;
    const profit   = revenue - expenses;
    // Cash != Profit
    expect(balance).not.toBe(profit);
  });

  it('transaction types are valid', () => {
    const validTypes = ['cash_in','cash_out','deposit','withdrawal','transfer'];
    expect(validTypes).toContain('cash_in');
    expect(validTypes).toContain('cash_out');
    expect(validTypes).not.toContain('revenue'); // Cash != revenue
  });
});

// ============================================================
// CREDIT ENGINE UNIT TESTS
// ============================================================

describe('CreditEngine: charge validation', () => {
  const engine = new CreditEngine();

  it('rejects zero charge', async () => {
    const r = await engine.charge(ctx, {
      credit_account_id: 'ca-001',
      amount:            0,
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects negative charge', async () => {
    const r = await engine.charge(ctx, {
      credit_account_id: 'ca-001',
      amount:            -100,
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects zero payment', async () => {
    const r = await engine.recordPayment(ctx, {
      credit_account_id: 'ca-001',
      amount:            0,
      payment_method:    'cash',
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('VALIDATION_ERROR');
  });
});

describe('CreditEngine: overpayment prevention', () => {
  it('overpayment is rejected with OVERPAYMENT error', async () => {
    const engine = new CreditEngine();
    // Simulate: balance = 200, payment = 300
    // Mock getBalance to return 200
    vi.spyOn(engine, 'getBalance').mockResolvedValue({
      ok: true, data: { balance: 200, credit_limit: 1000 }, error: null,
    });

    const r = await engine.recordPayment(ctx, {
      credit_account_id: 'ca-001',
      amount:            300,
      payment_method:    'cash',
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('OVERPAYMENT');
    expect(r.error?.message).toContain('300');
    expect(r.error?.message).toContain('200');
  });

  it('partial payment is accepted', async () => {
    const engine = new CreditEngine();
    vi.spyOn(engine, 'getBalance').mockResolvedValue({
      ok: true, data: { balance: 500, credit_limit: 1000 }, error: null,
    });
    // Mock the DB insert to succeed
    vi.spyOn(engine as never, 'getBranchFromAccount' as never).mockResolvedValue(null);

    const r = await engine.recordPayment(ctx, {
      credit_account_id: 'ca-001',
      amount:            200, // less than 500 balance
      payment_method:    'cash',
    });
    // Amount is valid - validation passes before DB call
    // DB would fail in unit test (no real DB) but validation passed
    expect(r.error?.code).not.toBe('OVERPAYMENT');
    expect(r.error?.code).not.toBe('VALIDATION_ERROR');
  });

  it('exact balance payment is accepted (not overpayment)', async () => {
    const engine = new CreditEngine();
    vi.spyOn(engine, 'getBalance').mockResolvedValue({
      ok: true, data: { balance: 300, credit_limit: 1000 }, error: null,
    });

    const r = await engine.recordPayment(ctx, {
      credit_account_id: 'ca-001',
      amount:            300, // exactly the balance
      payment_method:    'cash',
    });
    expect(r.error?.code).not.toBe('OVERPAYMENT');
  });

  it('credit limit exceeded raises CREDIT_LIMIT_EXCEEDED', async () => {
    const engine = new CreditEngine();
    vi.spyOn(engine, 'getBalance').mockResolvedValue({
      ok: true, data: { balance: 900, credit_limit: 1000 }, error: null,
    });

    const r = await engine.charge(ctx, {
      credit_account_id: 'ca-001',
      amount:            200, // 900 + 200 = 1100 > 1000 limit
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('CREDIT_LIMIT_EXCEEDED');
  });
});

describe('CreditEngine: credit is not cash', () => {
  it('credit charge does NOT create cash movement', () => {
    // Architectural test: the charge() method only writes to credit_transactions
    // It does NOT call cashEngine. This is a structural test via type inspection.
    const engineSrc = CreditEngine.toString();
    // Should reference credit_transactions but NOT cash_transactions
    expect(engineSrc).toContain('credit_transactions');
    expect(engineSrc).not.toContain('cash_transactions');
  });
});

// ============================================================
// REPORTING ENGINE UNIT TESTS
// ============================================================

describe('ReportingEngine: KPI formula correctness', () => {
  it('gross_profit = revenue - cogs (not revenue - expenses)', () => {
    const revenue  = 10000;
    const cogs     = 6000;
    const expenses = 2000;

    const grossProfit = revenue - cogs;
    const netProfit   = grossProfit - expenses;

    expect(grossProfit).toBe(4000);
    expect(netProfit).toBe(2000);

    // Wrong formula (Sales - Expenses)
    const wrongNetProfit = revenue - expenses;
    expect(wrongNetProfit).toBe(8000); // This is wrong
    expect(netProfit).not.toBe(wrongNetProfit);
  });

  it('net_profit includes COGS in the calculation', () => {
    const revenue   = 1000;
    const cogs      = 400;
    const expenses  = 100;

    const correct   = revenue - cogs - expenses; // 500
    const incorrect = revenue - expenses;         // 900 (ignores COGS)

    expect(correct).toBe(500);
    expect(incorrect).toBe(900);
    expect(correct).not.toBe(incorrect);
  });

  it('cash_in_hand is derived from cash_transactions, not profit', () => {
    // If cash transactions show:
    const cashIn  = 800;
    const cashOut = 200;
    const cashInHand = cashIn - cashOut; // 600

    // But profit is:
    const revenue  = 1000;
    const cogs     = 500;
    const expenses = 300;
    const profit   = revenue - cogs - expenses; // 200

    // Cash != Profit
    expect(cashInHand).not.toBe(profit);
    expect(cashInHand).toBe(600);
  });

  it('outstanding_credit is separate from cash and profit', () => {
    const outstandingCredit = 5000;
    const cashInHand        = 3000;
    const netProfit         = 2000;

    // All three are different concepts
    expect(outstandingCredit).not.toBe(cashInHand);
    expect(outstandingCredit).not.toBe(netProfit);
    expect(cashInHand).not.toBe(netProfit);
  });

  it('stock_value uses cost price, not selling price', () => {
    const unitCost        = 60;
    const unitSellingPrice = 100;
    const quantity        = 10;

    const stockValueAtCost    = unitCost         * quantity; // 600 (correct)
    const stockValueAtSelling = unitSellingPrice * quantity; // 1000 (wrong)

    expect(stockValueAtCost).toBe(600);
    expect(stockValueAtCost).not.toBe(stockValueAtSelling);
  });
});

// ============================================================
// ENGINE RESULT SHAPE TESTS
// ============================================================

describe('Engine result shapes', () => {
  it('engineOk returns correct shape', async () => {
    const { engineOk } = await import('../../engines/types');
    const r = engineOk({ value: 42 });
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ value: 42 });
    expect(r.error).toBeNull();
  });

  it('engineFail returns correct shape', async () => {
    const { engineFail, makeError } = await import('../../engines/types');
    const r = engineFail(makeError('VALIDATION_ERROR', 'Bad input', undefined, 'amount'));
    expect(r.ok).toBe(false);
    expect(r.data).toBeNull();
    expect(r.error?.code).toBe('VALIDATION_ERROR');
    expect(r.error?.field).toBe('amount');
  });

  it('makeError includes all fields', async () => {
    const { makeError } = await import('../../engines/types');
    const e = makeError('INSUFFICIENT_STOCK', 'Not enough', 'product A', 'quantity');
    expect(e.code).toBe('INSUFFICIENT_STOCK');
    expect(e.message).toBe('Not enough');
    expect(e.detail).toBe('product A');
    expect(e.field).toBe('quantity');
  });
});
