// ============================================================
// ImageCare ERP - Type Constants and Utility Tests
// File: src/__tests__/unit/typesAndConstants.test.ts
//
// Covers exported constants in types/*.ts files and pure utility
// functions in lib/customerInsights.ts.
// These constants are used throughout the UI for labels and are
// genuine production business logic (payment methods, statuses etc.)
// ============================================================

import { describe, it, expect, vi } from 'vitest';

// ---- lib/customerInsights.ts ---------------------------------

describe('lib/customerInsights - getLoyaltyTier', () => {
  it('returns Bronze for 0 points', async () => {
    const { getLoyaltyTier } = await import('../../lib/customerInsights');
    expect(getLoyaltyTier(0)).toBe('Bronze');
  });

  it('returns Bronze for 49 points', async () => {
    const { getLoyaltyTier } = await import('../../lib/customerInsights');
    expect(getLoyaltyTier(49)).toBe('Bronze');
  });

  it('returns Silver for 50 points', async () => {
    const { getLoyaltyTier } = await import('../../lib/customerInsights');
    expect(getLoyaltyTier(50)).toBe('Silver');
  });

  it('returns Silver for 199 points', async () => {
    const { getLoyaltyTier } = await import('../../lib/customerInsights');
    expect(getLoyaltyTier(199)).toBe('Silver');
  });

  it('returns Gold for 200+ points', async () => {
    const { getLoyaltyTier } = await import('../../lib/customerInsights');
    expect(getLoyaltyTier(200)).toBe('Gold');
    expect(getLoyaltyTier(9999)).toBe('Gold');
  });

  it('computeCustomerInsights: empty purchases returns zero totals', async () => {
    const { computeCustomerInsights } = await import('../../lib/customerInsights');
    const result = computeCustomerInsights([], []);
    expect(result.totalTransactions).toBe(0);
    expect(result.averageOrderValue).toBe(0);
    expect(result.daysSinceLastPurchase).toBeNull();
    expect(result.mostPurchasedProductName).toBeNull();
    expect(result.favoritePaymentMethod).toBeNull();
  });
});

// ---- types/accounting.ts constants ---------------------------

describe('types/accounting - label constants', () => {
  it('CASH_MOVEMENT_LABELS is a non-empty object', async () => {
    const { CASH_MOVEMENT_LABELS } = await import('../../types/accounting');
    expect(typeof CASH_MOVEMENT_LABELS).toBe('object');
    expect(Object.keys(CASH_MOVEMENT_LABELS).length).toBeGreaterThan(0);
  });

  it('CASH_LEDGER_TYPE_LABELS is a non-empty object', async () => {
    const { CASH_LEDGER_TYPE_LABELS } = await import('../../types/accounting');
    expect(typeof CASH_LEDGER_TYPE_LABELS).toBe('object');
    expect(Object.keys(CASH_LEDGER_TYPE_LABELS).length).toBeGreaterThan(0);
  });
});

// ---- types/sales.ts constants --------------------------------

describe('types/sales - label constants', () => {
  it('PAYMENT_METHODS includes cash', async () => {
    const { PAYMENT_METHODS } = await import('../../types/sales');
    expect(PAYMENT_METHODS).toContain('cash');
  });

  it('PAYMENT_METHOD_LABELS has a label for each method', async () => {
    const { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } = await import('../../types/sales');
    for (const method of PAYMENT_METHODS) {
      expect(PAYMENT_METHOD_LABELS[method]).toBeTruthy();
    }
  });

  it('CUSTOMER_STATUSES includes active', async () => {
    const { CUSTOMER_STATUSES } = await import('../../types/sales');
    expect(CUSTOMER_STATUSES).toContain('active');
  });

  it('CUSTOMER_STATUS_LABELS is non-empty', async () => {
    const { CUSTOMER_STATUS_LABELS } = await import('../../types/sales');
    expect(Object.keys(CUSTOMER_STATUS_LABELS).length).toBeGreaterThan(0);
  });
});

// ---- types/expenses.ts constants -----------------------------

describe('types/expenses - label constants', () => {
  it('EXPENSE_STATUS_LABELS is non-empty', async () => {
    const { EXPENSE_STATUS_LABELS } = await import('../../types/expenses');
    expect(Object.keys(EXPENSE_STATUS_LABELS).length).toBeGreaterThan(0);
  });

  it('RECURRING_FREQUENCY_LABELS is non-empty', async () => {
    const { RECURRING_FREQUENCY_LABELS } = await import('../../types/expenses');
    expect(Object.keys(RECURRING_FREQUENCY_LABELS).length).toBeGreaterThan(0);
  });
});

// ---- types/invoices.ts constants -----------------------------

describe('types/invoices - label constants', () => {
  it('INVOICE_STATUS_LABELS is non-empty', async () => {
    const { INVOICE_STATUS_LABELS } = await import('../../types/invoices');
    expect(Object.keys(INVOICE_STATUS_LABELS).length).toBeGreaterThan(0);
  });
});

// ---- types/purchasing.ts constants ---------------------------

describe('types/purchasing - label constants', () => {
  it('REQUISITION_STATUS_LABELS is non-empty', async () => {
    const { REQUISITION_STATUS_LABELS } = await import('../../types/purchasing');
    expect(Object.keys(REQUISITION_STATUS_LABELS).length).toBeGreaterThan(0);
  });

  it('PO_STATUS_LABELS is non-empty', async () => {
    const { PO_STATUS_LABELS } = await import('../../types/purchasing');
    expect(Object.keys(PO_STATUS_LABELS).length).toBeGreaterThan(0);
  });
});

// ---- types/loyalty.ts constants ------------------------------

describe('types/loyalty - label constants', () => {
  it('LOYALTY_TRANSACTION_LABELS is non-empty', async () => {
    const { LOYALTY_TRANSACTION_LABELS } = await import('../../types/loyalty');
    expect(Object.keys(LOYALTY_TRANSACTION_LABELS).length).toBeGreaterThan(0);
  });
});

// ---- types/payroll.ts constants ------------------------------

describe('types/payroll - label constants', () => {
  it('PAYROLL_STATUS_LABELS is non-empty', async () => {
    const { PAYROLL_STATUS_LABELS } = await import('../../types/payroll');
    expect(Object.keys(PAYROLL_STATUS_LABELS).length).toBeGreaterThan(0);
  });
});

// ---- types/salesTargets.ts constants -------------------------

describe('types/salesTargets - label constants', () => {
  it('TARGET_SCOPE_LABELS is non-empty', async () => {
    const { TARGET_SCOPE_LABELS } = await import('../../types/salesTargets');
    expect(Object.keys(TARGET_SCOPE_LABELS).length).toBeGreaterThan(0);
  });
});

// ---- types/settings.ts constants ----------------------------

describe('types/settings - constants', () => {
  it('OWNER_ROLE_ID is "owner"', async () => {
    const { OWNER_ROLE_ID } = await import('../../types/settings');
    expect(OWNER_ROLE_ID).toBe('owner');
  });

  it('PERMISSIONS is a non-empty array', async () => {
    const { PERMISSIONS } = await import('../../types/settings');
    expect(Array.isArray(PERMISSIONS)).toBe(true);
    expect(PERMISSIONS.length).toBeGreaterThan(0);
  });

  it('PERMISSION_LABELS has label for each permission', async () => {
    const { PERMISSIONS, PERMISSION_LABELS } = await import('../../types/settings');
    for (const perm of PERMISSIONS) {
      expect(PERMISSION_LABELS[perm]).toBeTruthy();
    }
  });
});

// ---- services/storage/storageService.ts permission gate -----

const { rpcSpy } = vi.hoisted(() => ({ rpcSpy: vi.fn().mockResolvedValue({ data: null, error: null }) }));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    schema: () => ({
      from: () => {
        const ch: Record<string, unknown> = {};
        const res = () => Promise.resolve({ data: null, error: null });
        ch['select'] = () => ch; ch['eq'] = () => ch; ch['is'] = () => ch;
        ch['single'] = res; ch['maybeSingle'] = res;
        return ch;
      },
    }),
    rpc: rpcSpy,
    storage: { from: () => ({ upload: vi.fn(), createSignedUrl: vi.fn() }) },
  },
}));

import type { UUID } from '../../types/database';
import type { UserContext } from '../../types/app';

const u = (s: string) => s as UUID;

function noPermsCtx(): UserContext {
  return {
    user_id: u('user-001'), business_id: u('biz-001'), branch_id: u('branch-001'),
    email: 'test@example.com', first_name: 'Test', last_name: 'User',
    role: 'Staff', is_owner: false, is_active: true, permissions: {}, branches: [],
  };
}

describe('storageService - permission gates', () => {
  it('uploadFile: PERMISSION_DENIED when no create permission', async () => {
    const { uploadFile } = await import('../../services/storage/storageService');
    const mockFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    const r = await uploadFile(noPermsCtx(), 'documents', mockFile);
    expect(r.error?.code).toBe('PERMISSION_DENIED');
  });
});
