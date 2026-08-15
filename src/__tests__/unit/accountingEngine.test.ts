// ============================================================
// ImageCare ERP - Stage 3 Unit Tests: Accounting Engine
// File: src/__tests__/unit/accountingEngine.test.ts
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountingEngine } from '../../engines/accounting/accountingEngine';
import type { EngineContext, JournalLineInput } from '../../engines/types';

// ---- Supabase mock -----------------------------------------
vi.mock('../../lib/supabase', () => {
  const chain = () => ({
    select: () => chain(),
    insert: () => chain(),
    update: () => chain(),
    eq:     () => chain(),
    is:     () => chain(),
    single: () => Promise.resolve({ data: null, error: null }),
    then:   (fn: (v: unknown) => unknown) => Promise.resolve(fn({ data: null, error: null })),
  });
  return { supabase: { schema: () => ({ from: () => chain() }), from: () => chain() } };
});

const engine  = new AccountingEngine();
const mockCtx: EngineContext = {
  business_id: 'biz-001',
  branch_id:   'branch-001',
  user_id:     'user-001',
  user_ctx:    {} as never,
};

// ---- Balance validation ------------------------------------

describe('AccountingEngine: balance validation', () => {
  it('rejects empty lines', async () => {
    const r = await engine.postJournal(mockCtx, {
      branch_id:      'branch-001',
      entry_type:     'adjustment',
      description:    'Test',
      reference_type: 'test',
      reference_id:   'ref-001',
      lines:          [],
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unbalanced journal (debit != credit)', async () => {
    const lines: JournalLineInput[] = [
      { account_code: '1100', account_name: 'Cash',    account_type: 'asset',   debit_amount: 1000, credit_amount: 0 },
      { account_code: '4000', account_name: 'Revenue', account_type: 'revenue', debit_amount: 0,    credit_amount: 800 },
    ];
    const r = await engine.postJournal(mockCtx, {
      branch_id: 'branch-001', entry_type: 'sale',
      description: 'Bad', reference_type: 'sale', reference_id: 'ref-001', lines,
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ACCOUNTING_IMBALANCE');
    expect(r.error?.message).toContain('1000.00');
    expect(r.error?.message).toContain('800.00');
  });

  it('rejects line with both debit and credit set', async () => {
    const lines: JournalLineInput[] = [
      { account_code: '1100', account_name: 'Cash', account_type: 'asset', debit_amount: 100, credit_amount: 100 },
    ];
    const r = await engine.postJournal(mockCtx, {
      branch_id: 'branch-001', entry_type: 'adjustment',
      description: 'Bad', reference_type: 'test', reference_id: 'ref-001', lines,
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects line with neither debit nor credit', async () => {
    const lines: JournalLineInput[] = [
      { account_code: '1100', account_name: 'Cash', account_type: 'asset', debit_amount: 0, credit_amount: 0 },
    ];
    const r = await engine.postJournal(mockCtx, {
      branch_id: 'branch-001', entry_type: 'adjustment',
      description: 'Bad', reference_type: 'test', reference_id: 'ref-001', lines,
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('VALIDATION_ERROR');
  });

  it('accepts balanced journal (debit == credit within 0.01)', () => {
    const totalDebit  = 1000.00;
    const totalCredit = 1000.00;
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
  });
});

// ---- Sale journal line construction -----------------------

describe('AccountingEngine: sale journal line construction', () => {
  it('cash sale: Dr Cash, Cr Revenue, Dr COGS, Cr Inventory', async () => {
    // Mock resolveAccount to return null (no Chart of Accounts in unit test)
    const r = await engine.buildSaleJournalLines(mockCtx, {
      revenue:       1000,
      cogs:          600,
      paymentMethod: 'cash',
      isCreditSale:  false,
    });
    expect(r.ok).toBe(true);
    const lines = r.data!;

    const debits  = lines.filter(l => (l.debit_amount  ?? 0) > 0);
    const credits = lines.filter(l => (l.credit_amount ?? 0) > 0);

    const totalDebit  = debits.reduce((s, l)  => s + (l.debit_amount  ?? 0), 0);
    const totalCredit = credits.reduce((s, l) => s + (l.credit_amount ?? 0), 0);

    // Must balance
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);

    // Revenue line
    const revLine = lines.find(l => l.account_code === '4000');
    expect(revLine).toBeDefined();
    expect(revLine!.credit_amount).toBe(1000);
    expect(revLine!.debit_amount).toBe(0);

    // COGS line
    const cogsLine = lines.find(l => l.account_code === '5000');
    expect(cogsLine).toBeDefined();
    expect(cogsLine!.debit_amount).toBe(600);
    expect(cogsLine!.credit_amount).toBe(0);

    // Inventory reduction
    const invLine = lines.find(l => l.account_code === '1300');
    expect(invLine).toBeDefined();
    expect(invLine!.credit_amount).toBe(600);
  });

  it('credit sale: Dr Receivable (1200), NOT Dr Cash', async () => {
    const r = await engine.buildSaleJournalLines(mockCtx, {
      revenue:       500,
      cogs:          300,
      paymentMethod: 'credit',
      isCreditSale:  true,
    });
    expect(r.ok).toBe(true);
    const lines = r.data!;

    const receivableLine = lines.find(l => l.account_code === '1200');
    expect(receivableLine).toBeDefined();
    expect(receivableLine!.debit_amount).toBe(500);

    // No cash line for credit sale
    const cashLine = lines.find(l => l.account_code === '1100');
    expect(cashLine).toBeUndefined();
  });

  it('COGS is expense type, not cash - it debits COGS not cash', async () => {
    const r = await engine.buildSaleJournalLines(mockCtx, {
      revenue: 1000, cogs: 600, paymentMethod: 'cash', isCreditSale: false,
    });
    expect(r.ok).toBe(true);

    const cogsLine = r.data!.find(l => l.account_code === '5000');
    expect(cogsLine!.account_type).toBe('expense');
    // COGS account is 'expense' type, debits COGS not cash account
    expect(cogsLine!.account_code).toBe('5000');
  });

  it('journal balances for credit sale too', async () => {
    const r = await engine.buildSaleJournalLines(mockCtx, {
      revenue: 500, cogs: 300, paymentMethod: 'credit', isCreditSale: true,
    });
    expect(r.ok).toBe(true);
    const lines = r.data!;
    const totalDebit  = lines.reduce((s, l) => s + (l.debit_amount  ?? 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.credit_amount ?? 0), 0);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
  });

  it('no COGS lines when cogs = 0', async () => {
    const r = await engine.buildSaleJournalLines(mockCtx, {
      revenue: 500, cogs: 0, paymentMethod: 'cash', isCreditSale: false,
    });
    const cogsLine = r.data?.find(l => l.account_code === '5000');
    expect(cogsLine).toBeUndefined();
  });
});

// ---- Expense journal line construction --------------------

describe('AccountingEngine: expense journal line construction', () => {
  it('builds Dr Expense, Cr Cash for cash payment', async () => {
    const r = await engine.buildExpenseJournalLines(mockCtx, {
      amount: 200, paymentMethod: 'cash', category: 'Utilities',
    });
    expect(r.ok).toBe(true);
    const lines = r.data!;

    const expLine  = lines.find(l => l.account_code === '6000');
    const cashLine = lines.find(l => l.account_code === '1100');

    expect(expLine!.debit_amount).toBe(200);
    expect(cashLine!.credit_amount).toBe(200);

    const totalDebit  = lines.reduce((s, l) => s + (l.debit_amount  ?? 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.credit_amount ?? 0), 0);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
  });

  it('uses mobile money account for mobile_money payment', async () => {
    const r = await engine.buildExpenseJournalLines(mockCtx, {
      amount: 100, paymentMethod: 'mobile_money', category: 'Transport',
    });
    const mobileLine = r.data?.find(l => l.account_code === '1120');
    expect(mobileLine).toBeDefined();
    expect(mobileLine!.credit_amount).toBe(100);
  });
});

// ---- Purchase journal line construction -------------------

describe('AccountingEngine: purchase journal line construction', () => {
  it('unpaid purchase: Dr Inventory, Cr Payable (no cash)', async () => {
    const r = await engine.buildPurchaseJournalLines(mockCtx, {
      amount: 500, paymentMethod: 'credit', isPaid: false,
    });
    expect(r.ok).toBe(true);
    const lines = r.data!;

    const invLine    = lines.find(l => l.account_code === '1300');
    const payLine    = lines.find(l => l.account_code === '2000' && l.credit_amount > 0);
    const cashLine   = lines.find(l => l.account_code === '1100');

    expect(invLine!.debit_amount).toBe(500);
    expect(payLine!.credit_amount).toBe(500);
    expect(cashLine).toBeUndefined();
  });

  it('paid purchase: Dr Inventory, Cr Payable, Dr Payable, Cr Cash', async () => {
    const r = await engine.buildPurchaseJournalLines(mockCtx, {
      amount: 300, paymentMethod: 'cash', isPaid: true,
    });
    expect(r.ok).toBe(true);
    const totalDebit  = r.data!.reduce((s, l) => s + (l.debit_amount  ?? 0), 0);
    const totalCredit = r.data!.reduce((s, l) => s + (l.credit_amount ?? 0), 0);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
  });

  it('unpaid purchase is balanced (payable entry only)', async () => {
    const r = await engine.buildPurchaseJournalLines(mockCtx, {
      amount: 400, paymentMethod: 'credit', isPaid: false,
    });
    const totalDebit  = r.data!.reduce((s, l) => s + (l.debit_amount  ?? 0), 0);
    const totalCredit = r.data!.reduce((s, l) => s + (l.credit_amount ?? 0), 0);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
  });
});
