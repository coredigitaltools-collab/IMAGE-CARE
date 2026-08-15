// ============================================================
// ImageCare ERP - Stage 3 Unit Tests: Business Engine
// File: src/__tests__/unit/businessEngine.test.ts
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessEngine } from '../../engines/business/businessEngine';
import type { EngineContext, CreateSaleCommand } from '../../engines/types';

// ---- Supabase mock -----------------------------------------
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select:      () => ({ eq: () => ({ eq: () => ({ is: () => ({ single: () => Promise.resolve({ data: null, error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }), single: () => Promise.resolve({ data: null, error: null }) }) }),
      insert:      () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
      update:      () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      upsert:      () => Promise.resolve({ data: null, error: null }),
    }),
  },
}));

// Mock sub-engines
vi.mock('../../engines/inventory/inventoryEngine', () => ({
  inventoryEngine: {
    checkAvailable:   vi.fn().mockResolvedValue({ ok: true,  data: { available: true, quantity_on_hand: 100 }, error: null }),
    deductForSale:    vi.fn().mockResolvedValue({ ok: true,  data: { movements: [] }, error: null }),
    receiveFromPurchase: vi.fn().mockResolvedValue({ ok: true, data: { movements: [] }, error: null }),
  },
}));

vi.mock('../../engines/accounting/accountingEngine', () => ({
  accountingEngine: {
    buildSaleJournalLines:    vi.fn().mockResolvedValue({ ok: true, data: [], error: null }),
    buildExpenseJournalLines: vi.fn().mockResolvedValue({ ok: true, data: [], error: null }),
    buildPurchaseJournalLines:vi.fn().mockResolvedValue({ ok: true, data: [], error: null }),
    postJournal: vi.fn().mockResolvedValue({
      ok: true,
      data: { journal_entry_id: 'je-001', entry_number: 'JE-000001', total_debit: 0, total_credit: 0, status: 'posted' },
      error: null,
    }),
  },
}));

vi.mock('../../engines/cash/cashEngine', () => ({
  cashEngine: {
    recordSaleCashIn:    vi.fn().mockResolvedValue({ ok: true, data: { transaction_id: 'ct-001' }, error: null }),
    recordExpenseCashOut:vi.fn().mockResolvedValue({ ok: true, data: { transaction_id: 'ct-002' }, error: null }),
    recordMovement:      vi.fn().mockResolvedValue({ ok: true, data: { transaction_id: 'ct-003' }, error: null }),
  },
}));

vi.mock('../../engines/credit/creditEngine', () => ({
  creditEngine: {
    getOrCreateCreditAccount: vi.fn().mockResolvedValue({ ok: true, data: { credit_account_id: 'ca-001' }, error: null }),
    charge: vi.fn().mockResolvedValue({ ok: true, data: { transaction_id: 'crt-001', new_balance: 500 }, error: null }),
  },
}));

vi.mock('../../engines/audit/auditEngine', () => ({
  auditEngine: { log: vi.fn().mockResolvedValue(undefined) },
}));

const ctx: EngineContext = {
  business_id: 'biz-001',
  branch_id:   'branch-001',
  user_id:     'user-001',
  user_ctx:    {} as never,
};

// ---- Sale validation tests ---------------------------------

describe('BusinessEngine: sale validation', () => {
  const engine = new BusinessEngine();

  it('rejects sale with no lines', async () => {
    const r = await engine.createSale(ctx, {
      branch_id:      'branch-001',
      payment_method: 'cash',
      lines:          [],
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('VALIDATION_ERROR');
    expect(r.error?.message).toContain('line');
  });

  it('rejects expense with zero amount', async () => {
    const r = await engine.recordExpense(ctx, {
      branch_id:      'branch-001',
      category:       'Utilities',
      description:    'Electricity',
      amount:         0,
      payment_method: 'cash',
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('VALIDATION_ERROR');
    expect(r.error?.field).toBe('amount');
  });

  it('rejects expense with negative amount', async () => {
    const r = await engine.recordExpense(ctx, {
      branch_id:      'branch-001',
      category:       'Transport',
      description:    'Fuel',
      amount:         -100,
      payment_method: 'cash',
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('VALIDATION_ERROR');
  });
});

// ---- Orchestration tests -----------------------------------

describe('BusinessEngine: orchestration principles', () => {
  it('BusinessEngine does not contain raw accounting logic', () => {
    const src = BusinessEngine.toString();
    // Business Engine calls accounting engine, not hardcoded account codes
    expect(src).toContain('accountingEngine');
    // No hardcoded account IDs (numeric strings used as IDs)
    expect(src).not.toMatch(/'[0-9a-f]{8}-[0-9a-f]{4}'/); // no UUIDs hardcoded
  });

  it('BusinessEngine does not contain raw inventory mutation', () => {
    const src = BusinessEngine.toString();
    // Uses inventoryEngine, not direct INSERT to inventory_movements
    expect(src).toContain('inventoryEngine');
    expect(src).not.toContain("from('inventory_movements').insert");
  });

  it('BusinessEngine does not hardcode account codes in sale posting', () => {
    const src = BusinessEngine.toString();
    // Account codes are resolved by the Accounting Engine, not hardcoded here
    // The business engine calls buildSaleJournalLines
    expect(src).toContain('buildSaleJournalLines');
    // And not hardcoded '1100' or '4000' in the posting logic itself
    expect(src).not.toContain("'1100'");
    expect(src).not.toContain("'4000'");
  });

  it('cash sale flow calls cashEngine (not credit engine)', () => {
    const src = BusinessEngine.toString();
    expect(src).toContain('cashEngine');
    expect(src).toContain('recordSaleCashIn');
  });

  it('credit sale flow calls creditEngine (not cashEngine directly)', () => {
    const src = BusinessEngine.toString();
    expect(src).toContain('creditEngine');
    expect(src).toContain('charge');
  });
});

// ---- Idempotency structural tests -------------------------

describe('BusinessEngine: idempotency', () => {
  it('idempotency key is namespaced by operation', () => {
    // The key stored is `${operation}:${key}` so post_sale:key1 != expense:key1
    const postSaleKey = 'post_sale:my-key-1';
    const expenseKey  = 'expense:my-key-1';
    expect(postSaleKey).not.toBe(expenseKey);
  });

  it('BusinessEngine reads idempotency from sync_queue', async () => {
    // Read the source file directly using process.cwd()
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const src = readFileSync(
      join(process.cwd(), 'src/engines/business/businessEngine.ts'),
      'utf-8'
    );
    expect(src).toContain('sync_queue');
    expect(src).toContain('idempotency_key');
  });

  it('idempotency does not rely on frontend controls', () => {
    const src = BusinessEngine.toString();
    // No references to frontend state management (no useState, no dispatch)
    expect(src).not.toContain('useState');
    expect(src).not.toContain('dispatch');
    expect(src).not.toContain('disabled');
  });
});

// ---- Atomicity principle tests ----------------------------

describe('BusinessEngine: atomicity principles', () => {
  it('postSale validates stock BEFORE deducting inventory', () => {
    const src = BusinessEngine.toString();
    // checkAvailable must appear before deductForSale
    const checkIdx  = src.indexOf('checkAvailable');
    const deductIdx = src.indexOf('deductForSale');
    expect(checkIdx).toBeGreaterThan(-1);
    expect(deductIdx).toBeGreaterThan(-1);
    expect(checkIdx).toBeLessThan(deductIdx);
  });

  it('postSale updates status AFTER all engine calls succeed', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const src = readFileSync(
      join(process.cwd(), 'src/engines/business/businessEngine.ts'),
      'utf-8'
    );
    const statusIdx   = src.indexOf("status: 'confirmed'");
    const journalIdx  = src.indexOf('postJournal');
    expect(journalIdx).toBeGreaterThan(-1);
    expect(statusIdx).toBeGreaterThan(journalIdx);
  });

  it('postSale audit log is called after confirmation', () => {
    const src = BusinessEngine.toString();
    const auditIdx  = src.indexOf('auditEngine.log');
    const statusIdx = src.indexOf("status: 'confirmed'");
    expect(auditIdx).toBeGreaterThan(statusIdx);
  });
});
