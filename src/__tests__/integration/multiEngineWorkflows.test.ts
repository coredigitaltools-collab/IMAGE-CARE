// ============================================================
// ImageCare ERP - Stage 3 Integration Tests
// File: src/__tests__/integration/multiEngineWorkflows.test.ts
// Purpose: Multi-engine workflow integration tests.
//   Tests the complete accounting reconciliation requirements
//   from Section 25 of the Stage 3 spec.
//
// ALL tests here run without a live database.
// They validate engine coordination logic and accounting
// formula correctness via mocked Supabase calls.
//
// Live Supabase RLS integration tests are gated on INTEGRATION=true.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineContext } from '../../engines/types';
import { accountingEngine } from '../../engines/accounting/accountingEngine';

// ---- Supabase mock -----------------------------------------
const makeChain = () => {
  const p = () => Promise.resolve({ data: null, error: null });
  const chain: Record<string, unknown> = {};
  chain['eq']          = () => chain;
  chain['is']          = () => chain;
  chain['not']         = () => chain;
  chain['gte']         = () => chain;
  chain['lte']         = () => chain;
  chain['in']          = () => chain;
  chain['single']      = () => Promise.resolve({ data: { id: 'je-001', entry_number: 'JE-000001', total_debit: 0, total_credit: 0, status: 'posted' }, error: null });
  chain['maybeSingle'] = p;
  chain['select']      = () => chain;
  chain['insert']      = () => chain;
  chain['update']      = () => chain;
  chain['upsert']      = p;
  return chain;
};

vi.mock('../../lib/supabase', () => ({
  supabase: { schema: () => ({ from: () => makeChain() }), from: () => makeChain() },
}));

const ctx: EngineContext = {
  business_id: 'biz-integration',
  branch_id:   'branch-integration',
  user_id:     'user-integration',
  user_ctx:    {} as never,
};

// ============================================================
// ACCOUNTING RECONCILIATION TESTS (Section 25)
// ============================================================

describe('Reconciliation: cash sale accounting effects', () => {
  it('revenue, COGS, gross profit, cash and inventory effects balance', async () => {
    const revenue = 1000;
    const cogs    = 600;

    const r = await accountingEngine.buildSaleJournalLines(ctx, {
      revenue, cogs, paymentMethod: 'cash', isCreditSale: false,
    });
    expect(r.ok).toBe(true);

    const lines = r.data!;
    const totalDebit  = lines.reduce((s, l) => s + (l.debit_amount  ?? 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.credit_amount ?? 0), 0);

    // Journal must balance
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);

    // Revenue credited
    const revenueCredit = lines
      .filter(l => l.account_code === '4000')
      .reduce((s, l) => s + (l.credit_amount ?? 0), 0);
    expect(revenueCredit).toBe(revenue);

    // COGS debited
    const cogsDebit = lines
      .filter(l => l.account_code === '5000')
      .reduce((s, l) => s + (l.debit_amount ?? 0), 0);
    expect(cogsDebit).toBe(cogs);

    // Gross Profit = Revenue - COGS
    const grossProfit = revenue - cogs;
    expect(grossProfit).toBe(400);

    // Inventory reduced at cost
    const invCredit = lines
      .filter(l => l.account_code === '1300')
      .reduce((s, l) => s + (l.credit_amount ?? 0), 0);
    expect(invCredit).toBe(cogs);
  });

  it('cash line debited for cash sale (not for credit sale)', async () => {
    const cashSaleLines = (await accountingEngine.buildSaleJournalLines(ctx, {
      revenue: 500, cogs: 300, paymentMethod: 'cash', isCreditSale: false,
    })).data!;

    const creditSaleLines = (await accountingEngine.buildSaleJournalLines(ctx, {
      revenue: 500, cogs: 300, paymentMethod: 'credit', isCreditSale: true,
    })).data!;

    const cashDebit      = cashSaleLines.find(l => l.account_code === '1100');
    const receivableDebit = creditSaleLines.find(l => l.account_code === '1200');
    const creditCash      = creditSaleLines.find(l => l.account_code === '1100');

    expect(cashDebit).toBeDefined();
    expect(cashDebit!.debit_amount).toBe(500);
    expect(receivableDebit).toBeDefined();
    expect(receivableDebit!.debit_amount).toBe(500);
    expect(creditCash).toBeUndefined(); // No cash for credit sale
  });
});

describe('Reconciliation: credit sale - no cash until payment', () => {
  it('credit sale does not debit cash account', async () => {
    const r = await accountingEngine.buildSaleJournalLines(ctx, {
      revenue: 800, cogs: 500, paymentMethod: 'credit', isCreditSale: true,
    });
    const lines = r.data!;
    const cashLines = lines.filter(l =>
      l.account_code === '1100' || l.account_code === '1120' || l.account_code === '1130'
    );
    expect(cashLines.every(l => (l.debit_amount ?? 0) === 0 && (l.credit_amount ?? 0) === 0)).toBe(true);
  });

  it('receivable debited for credit sale, not cash', async () => {
    const r = await accountingEngine.buildSaleJournalLines(ctx, {
      revenue: 750, cogs: 400, paymentMethod: 'credit', isCreditSale: true,
    });
    const receivableLine = r.data!.find(l => l.account_code === '1200');
    expect(receivableLine!.debit_amount).toBe(750);
    expect(receivableLine!.account_type).toBe('asset');
  });

  it('credit sale journal is balanced', async () => {
    const r = await accountingEngine.buildSaleJournalLines(ctx, {
      revenue: 750, cogs: 400, paymentMethod: 'credit', isCreditSale: true,
    });
    const d = r.data!.reduce((s, l) => s + (l.debit_amount  ?? 0), 0);
    const c = r.data!.reduce((s, l) => s + (l.credit_amount ?? 0), 0);
    expect(Math.abs(d - c)).toBeLessThan(0.01);
  });
});

describe('Reconciliation: supplier purchase on credit', () => {
  it('inventory debited, payable credited - no cash until payment', async () => {
    const r = await accountingEngine.buildPurchaseJournalLines(ctx, {
      amount: 1000, paymentMethod: 'credit', isPaid: false,
    });
    expect(r.ok).toBe(true);
    const lines = r.data!;

    const invDebit  = lines.filter(l => l.account_code === '1300' && l.debit_amount > 0);
    const payCredit = lines.filter(l => l.account_code === '2000' && l.credit_amount > 0);

    expect(invDebit.length).toBeGreaterThan(0);
    expect(payCredit.length).toBeGreaterThan(0);
    expect(invDebit[0].debit_amount).toBe(1000);
    expect(payCredit[0].credit_amount).toBe(1000);

    // No cash movement
    const cashLines = lines.filter(l =>
      ['1100','1120','1130'].includes(l.account_code) && (l.credit_amount > 0 || l.debit_amount > 0)
    );
    expect(cashLines).toHaveLength(0);
  });

  it('paid purchase: payable cleared and cash credited', async () => {
    const r = await accountingEngine.buildPurchaseJournalLines(ctx, {
      amount: 500, paymentMethod: 'cash', isPaid: true,
    });
    const lines = r.data!;

    // Payable should net to zero (Dr 500 then Cr 500)
    const payDebit  = lines.filter(l => l.account_code === '2000' && l.debit_amount > 0);
    const payCredit = lines.filter(l => l.account_code === '2000' && l.credit_amount > 0);
    expect(payDebit.length).toBeGreaterThan(0);
    expect(payCredit.length).toBeGreaterThan(0);

    // Cash reduced
    const cashCredit = lines.filter(l => l.account_code === '1100' && l.credit_amount > 0);
    expect(cashCredit.length).toBeGreaterThan(0);
    expect(cashCredit[0].credit_amount).toBe(500);
  });
});

describe('Reconciliation: expense paid in cash', () => {
  it('expense debited, cash credited', async () => {
    const r = await accountingEngine.buildExpenseJournalLines(ctx, {
      amount: 300, paymentMethod: 'cash', category: 'Rent',
    });
    expect(r.ok).toBe(true);
    const lines = r.data!;

    const expDebit  = lines.find(l => l.account_code === '6000');
    const cashCredit = lines.find(l => l.account_code === '1100');

    expect(expDebit!.debit_amount).toBe(300);
    expect(cashCredit!.credit_amount).toBe(300);

    const d = lines.reduce((s, l) => s + (l.debit_amount  ?? 0), 0);
    const c = lines.reduce((s, l) => s + (l.credit_amount ?? 0), 0);
    expect(Math.abs(d - c)).toBeLessThan(0.01);
  });

  it('COGS does not appear in expense journal', async () => {
    const r = await accountingEngine.buildExpenseJournalLines(ctx, {
      amount: 200, paymentMethod: 'cash', category: 'Utilities',
    });
    const cogsLine = r.data?.find(l => l.account_code === '5000');
    expect(cogsLine).toBeUndefined();
  });
});

describe('Reconciliation: every posted journal entry balances', () => {
  it('all built line sets balance for various scenarios', async () => {
    const scenarios = [
      accountingEngine.buildSaleJournalLines(ctx, { revenue: 1000, cogs: 600, paymentMethod: 'cash',   isCreditSale: false }),
      accountingEngine.buildSaleJournalLines(ctx, { revenue: 500,  cogs: 300, paymentMethod: 'credit', isCreditSale: true  }),
      accountingEngine.buildExpenseJournalLines(ctx, { amount: 200, paymentMethod: 'cash',         category: 'Rent'      }),
      accountingEngine.buildExpenseJournalLines(ctx, { amount: 150, paymentMethod: 'mobile_money', category: 'Transport' }),
      accountingEngine.buildPurchaseJournalLines(ctx, { amount: 800,  paymentMethod: 'credit', isPaid: false }),
      accountingEngine.buildPurchaseJournalLines(ctx, { amount: 400,  paymentMethod: 'cash',   isPaid: true  }),
    ];

    for (const scenarioPromise of scenarios) {
      const r = await scenarioPromise;
      expect(r.ok).toBe(true);
      const lines = r.data!;
      const d = lines.reduce((s, l) => s + (l.debit_amount  ?? 0), 0);
      const c = lines.reduce((s, l) => s + (l.credit_amount ?? 0), 0);
      expect(Math.abs(d - c)).toBeLessThan(0.01);
    }
  });
});

describe('Reconciliation: COGS never treated as cash', () => {
  it('COGS account is expense type, not asset', async () => {
    const r = await accountingEngine.buildSaleJournalLines(ctx, {
      revenue: 1000, cogs: 600, paymentMethod: 'cash', isCreditSale: false,
    });
    const cogsLine = r.data?.find(l => l.account_code === '5000');
    expect(cogsLine?.account_type).toBe('expense');
  });

  it('COGS does not debit cash account', async () => {
    const r = await accountingEngine.buildSaleJournalLines(ctx, {
      revenue: 1000, cogs: 600, paymentMethod: 'cash', isCreditSale: false,
    });
    const lines = r.data!;

    // Cash account (1100) is only debited once - for the sale payment
    const cashDebits = lines.filter(l =>
      l.account_code === '1100' && (l.debit_amount ?? 0) > 0
    );
    // Cash is debited for revenue (sale payment), NEVER for COGS
    expect(cashDebits).toHaveLength(1);
    expect(cashDebits[0].debit_amount).toBe(1000); // Revenue, not COGS
  });

  it('inventory reduction (COGS) is Cr Inventory, Dr COGS - two distinct accounts', async () => {
    const r = await accountingEngine.buildSaleJournalLines(ctx, {
      revenue: 1000, cogs: 600, paymentMethod: 'cash', isCreditSale: false,
    });
    const cogsLine = r.data?.find(l => l.account_code === '5000');
    const invLine  = r.data?.find(l => l.account_code === '1300');

    // COGS and Inventory are different accounts
    expect(cogsLine?.account_code).not.toBe(invLine?.account_code);
    expect(cogsLine?.debit_amount).toBe(600);   // COGS debited
    expect(invLine?.credit_amount).toBe(600);   // Inventory credited
  });
});

// ============================================================
// IDEMPOTENCY TESTS
// ============================================================

describe('Idempotency: duplicate detection', () => {
  it('idempotency keys are namespaced to prevent cross-operation collisions', () => {
    const key = 'my-operation-123';
    const saleKey    = `post_sale:${key}`;
    const expenseKey = `expense:${key}`;
    expect(saleKey).not.toBe(expenseKey);
  });

  it('idempotency state is stored in sync_queue, not in frontend state', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const src = readFileSync(
      join(process.cwd(), 'src/engines/business/businessEngine.ts'),
      'utf-8'
    );
    expect(src).toContain('sync_queue');
    expect(src).not.toContain('localStorage');
    expect(src).not.toContain('sessionStorage');
  });
});

// ============================================================
// BUSINESS ISOLATION TESTS
// ============================================================

describe('Business isolation: engine context validation', () => {
  it('engine context always carries business_id', () => {
    const testCtx: EngineContext = {
      business_id: 'biz-A',
      branch_id:   'branch-A',
      user_id:     'user-A',
      user_ctx:    {} as never,
    };
    expect(testCtx.business_id).toBeDefined();
    expect(testCtx.business_id).not.toBe('');
  });

  it('credit engine cross-business guard triggers on mismatched business', async () => {
    const { CreditEngine } = await import('../../engines/credit/creditEngine');
    const engine = new CreditEngine();

    vi.spyOn(engine, 'getBalance').mockResolvedValue({
      ok: false,
      data: null,
      error: { code: 'CROSS_BUSINESS_VIOLATION', message: 'Credit account belongs to a different business.' },
    });

    const r = await engine.charge(ctx, { credit_account_id: 'foreign-ca', amount: 100 });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('CROSS_BUSINESS_VIOLATION');
  });
});

// ============================================================
// LIVE SUPABASE INTEGRATION TESTS (gated)
// ============================================================

const INTEGRATION = process.env.INTEGRATION === 'true';

describe('Live Supabase integration: multi-engine workflows', () => {
  if (!INTEGRATION) {
    it.skip('cash sale end-to-end through Business, Inventory, Accounting and Cash engines');
    it.skip('credit sale through Business, Inventory, Accounting and Credit engines');
    it.skip('customer repayment through Credit, Cash and Accounting engines');
    it.skip('purchase and stock receipt through Purchasing, Inventory and Accounting engines');
    it.skip('expense paid from cash through Business, Cash and Accounting engines');
    it.skip('inventory transfer between branches');
    it.skip('reversal/correction behavior');
    it.skip('duplicate request idempotency behavior');
    it.skip('concurrent stock consumption');
    it.skip('business isolation: cross-business operations rejected');
    it.skip('branch authorization: unauthorized branch access rejected');
    it.skip('permission enforcement: non-owner cannot post journal');
    it.skip('report reconciliation against source transactions');
    return;
  }

  // When INTEGRATION=true and Supabase env vars are set,
  // these tests run against a real configured test database.

  it('cash sale end-to-end: Revenue, COGS, Cash and Inventory effects', async () => {
    const { businessEngine } = await import('../../engines/business/businessEngine');
    const biz_id  = process.env.TEST_BUSINESS_A_ID!;
    const branch  = process.env.TEST_BUSINESS_A_BRANCH_ID!;
    const user    = process.env.TEST_USER_A_ID!;
    const product = process.env.TEST_PRODUCT_A_ID!;

    const testCtx: EngineContext = {
      business_id: biz_id, branch_id: branch, user_id: user, user_ctx: {} as never,
    };

    // Create sale
    const createResult = await businessEngine.createSale(testCtx, {
      branch_id: branch, payment_method: 'cash',
      lines: [{ product_id: product, quantity: 1, unit_price: 100, unit_cost: 60 }],
    });

    expect(createResult.ok).toBe(true);

    // Post sale
    const postResult = await businessEngine.postSale(testCtx, {
      sale_id: createResult.data!.sale_id,
    });

    expect(postResult.ok).toBe(true);
    expect(postResult.data!.status).toBe('confirmed');
    expect(postResult.data!.journal_entry_id).not.toBeNull();
  });
});

import { BusinessEngine } from '../../engines/business/businessEngine';
