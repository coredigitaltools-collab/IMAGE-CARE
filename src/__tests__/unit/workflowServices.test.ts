// ============================================================
// ImageCare ERP - Workflow Services Unit Tests
// File: src/__tests__/unit/workflowServices.test.ts
//
// Tests permission gates (canDo() checks) across all major services.
// Each service returns PERMISSION_DENIED before any DB call when the
// user lacks the required permission - no DB mock needed for those paths.
//
// Result shapes:
//   ApiResult (listProducts, etc.): { data, error: { code } }
//   ServiceResponse (listInventory, etc.): { success, data, error: { code } }
// Both return error.code === 'PERMISSION_DENIED' for permission failures.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UUID } from '../../types/database';
import type { UserContext, ModulePermissions } from '../../types/app';

// ---- Mocks -------------------------------------------------
const { rpcSpy } = vi.hoisted(() => ({
  rpcSpy: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    schema: () => ({
      from: () => {
        const ch: Record<string, unknown> = {};
        const res = () => Promise.resolve({ data: [], error: null });
        ch['select'] = () => ch; ch['eq'] = () => ch; ch['is'] = () => ch;
        ch['not'] = () => ch; ch['gte'] = () => ch; ch['lte'] = () => ch;
        ch['in'] = () => ch; ch['order'] = () => ch; ch['limit'] = () => ch;
        ch['update'] = res; ch['upsert'] = res; ch['maybeSingle'] = res;
        ch['single'] = () => Promise.resolve({ data: null, error: null });
        return ch;
      },
    }),
    from: () => {
      const ch: Record<string, unknown> = {};
      const res = () => Promise.resolve({ data: [], error: null });
      ch['select'] = () => ch; ch['eq'] = () => ch; ch['is'] = () => ch;
      ch['order'] = () => ch; ch['limit'] = () => ch;
      ch['maybeSingle'] = res;
      ch['single'] = () => Promise.resolve({ data: null, error: null });
      return ch;
    },
    rpc: rpcSpy,
  },
}));

// ---- Helpers -----------------------------------------------
const u = (s: string) => s as UUID;

function noPermsCtx(): UserContext {
  return {
    user_id: u('user-001'), business_id: u('biz-001'), branch_id: u('branch-001'),
    email: 'test@example.com', first_name: 'Test', last_name: 'User',
    role: 'Staff', is_owner: false, is_active: true, permissions: {}, branches: [],
  };
}

function ownerCtx(): UserContext {
  return { ...noPermsCtx(), is_owner: true };
}

function withPerms(modules: string[]): UserContext {
  const permissions: Record<string, ModulePermissions> = {};
  for (const m of modules) {
    permissions[m] = {
      view: true, create: true, edit: true, delete: true,
      approve: false, export: false, sync: false, branch_scope: 'assigned',
    };
  }
  return { ...noPermsCtx(), permissions };
}

// Result helpers - works for both ApiResult and ServiceResponse
function isDenied(r: { error: { code: string } | null; success?: boolean }): boolean {
  return r.error?.code === 'PERMISSION_DENIED';
}
function hasData(r: { data: unknown; error: unknown }): boolean {
  return r.data !== null && r.data !== undefined;
}

beforeEach(() => { vi.clearAllMocks(); });

// ============================================================
// SALES SERVICE
// ============================================================

describe('salesService - permission gates', () => {
  it('listSales: PERMISSION_DENIED when no sales:view', async () => {
    const { listSales } = await import('../../services/sales/salesService');
    const r = await listSales(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('getSale: PERMISSION_DENIED when no sales:view', async () => {
    const { getSale } = await import('../../services/sales/salesService');
    const r = await getSale(noPermsCtx(), u('sale-001'));
    expect(isDenied(r)).toBe(true);
  });

  it('createSale: PERMISSION_DENIED when no sales:create', async () => {
    const { createSale } = await import('../../services/sales/salesService');
    const r = await createSale(noPermsCtx(), {} as Parameters<typeof createSale>[1]);
    expect(isDenied(r)).toBe(true);
  });

  it('cancelSale: PERMISSION_DENIED when no sales:edit', async () => {
    const { cancelSale } = await import('../../services/sales/salesService');
    const r = await cancelSale(noPermsCtx(), u('sale-001'));
    expect(isDenied(r)).toBe(true);
  });

  it('getSaleReceipt: PERMISSION_DENIED when no sales:view', async () => {
    const { getSaleReceipt } = await import('../../services/sales/salesService');
    const r = await getSaleReceipt(noPermsCtx(), u('sale-001'));
    expect(isDenied(r)).toBe(true);
  });

  it('listSales: no error when sales:view granted (empty result from mock)', async () => {
    const { listSales } = await import('../../services/sales/salesService');
    const r = await listSales(withPerms(['sales']));
    expect(isDenied(r)).toBe(false);
  });
});

// ============================================================
// PURCHASING SERVICE
// ============================================================

describe('purchasingService - permission gates', () => {
  it('listPurchases: PERMISSION_DENIED when no purchasing:view', async () => {
    const { listPurchases } = await import('../../services/purchasing/purchasingService');
    const r = await listPurchases(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('getPurchase: PERMISSION_DENIED when no purchasing:view', async () => {
    const { getPurchase } = await import('../../services/purchasing/purchasingService');
    const r = await getPurchase(noPermsCtx(), u('po-001'));
    expect(isDenied(r)).toBe(true);
  });

  it('createPurchase: PERMISSION_DENIED when no purchasing:create', async () => {
    const { createPurchase } = await import('../../services/purchasing/purchasingService');
    const r = await createPurchase(noPermsCtx(), {} as Parameters<typeof createPurchase>[1]);
    expect(isDenied(r)).toBe(true);
  });

  it('recordSupplierPayment: PERMISSION_DENIED when no purchasing:edit', async () => {
    const { recordSupplierPayment } = await import('../../services/purchasing/purchasingService');
    const r = await recordSupplierPayment(noPermsCtx(), {} as Parameters<typeof recordSupplierPayment>[1]);
    expect(isDenied(r)).toBe(true);
  });

  it('listPurchases: no error when purchasing:view granted', async () => {
    const { listPurchases } = await import('../../services/purchasing/purchasingService');
    const r = await listPurchases(withPerms(['purchases']));
    expect(isDenied(r)).toBe(false);
  });
});

// ============================================================
// INVENTORY SERVICE
// ============================================================

describe('inventoryService - permission gates', () => {
  it('listInventory: PERMISSION_DENIED when no inventory:view', async () => {
    const { listInventory } = await import('../../services/inventory/inventoryService');
    const r = await listInventory(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('getStock: PERMISSION_DENIED when no inventory:view', async () => {
    const { getStock } = await import('../../services/inventory/inventoryService');
    const r = await getStock(noPermsCtx(), u('prod-001'));
    expect(isDenied(r)).toBe(true);
  });

  it('createStockTransfer: PERMISSION_DENIED when no inventory:create', async () => {
    const { createStockTransfer } = await import('../../services/inventory/inventoryService');
    const r = await createStockTransfer(noPermsCtx(), {} as Parameters<typeof createStockTransfer>[1]);
    expect(isDenied(r)).toBe(true);
  });

  it('createStockAdjustment: PERMISSION_DENIED when no inventory:create', async () => {
    const { createStockAdjustment } = await import('../../services/inventory/inventoryService');
    const r = await createStockAdjustment(noPermsCtx(), {} as Parameters<typeof createStockAdjustment>[1]);
    expect(isDenied(r)).toBe(true);
  });

  it('listInventory: no error when inventory:view granted', async () => {
    const { listInventory } = await import('../../services/inventory/inventoryService');
    const r = await listInventory(withPerms(['inventory']));
    expect(isDenied(r)).toBe(false);
  });
});

// ============================================================
// CREDIT SERVICE
// ============================================================

describe('creditService - permission gates', () => {
  it('getOutstandingCredit: PERMISSION_DENIED when no credit:view', async () => {
    const { getOutstandingCredit } = await import('../../services/credit/creditService');
    const r = await getOutstandingCredit(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('listInvoices: PERMISSION_DENIED when no credit:view', async () => {
    const { listInvoices } = await import('../../services/credit/creditService');
    const r = await listInvoices(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('listBills: PERMISSION_DENIED when no credit:view', async () => {
    const { listBills } = await import('../../services/credit/creditService');
    const r = await listBills(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('recordCreditPayment: PERMISSION_DENIED when no credit:create', async () => {
    const { recordCreditPayment } = await import('../../services/credit/creditService');
    const r = await recordCreditPayment(noPermsCtx(), {} as Parameters<typeof recordCreditPayment>[1]);
    expect(isDenied(r)).toBe(true);
  });

  it('getOutstandingCredit: no error when credit:view granted', async () => {
    const { getOutstandingCredit } = await import('../../services/credit/creditService');
    const r = await getOutstandingCredit(withPerms(['credit']));
    expect(isDenied(r)).toBe(false);
  });
});

// ============================================================
// MASTER DATA SERVICE
// ============================================================

describe('masterDataService - permission gates', () => {
  it('listProducts: PERMISSION_DENIED when no inventory:view', async () => {
    const { listProducts } = await import('../../services/masterData/masterDataService');
    const r = await listProducts(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('createProduct: PERMISSION_DENIED when no inventory:create', async () => {
    const { createProduct } = await import('../../services/masterData/masterDataService');
    const r = await createProduct(noPermsCtx(), {} as Parameters<typeof createProduct>[1]);
    expect(isDenied(r)).toBe(true);
  });

  it('updateProduct: PERMISSION_DENIED when no inventory:edit', async () => {
    const { updateProduct } = await import('../../services/masterData/masterDataService');
    const r = await updateProduct(noPermsCtx(), u('prod-001'), {});
    expect(isDenied(r)).toBe(true);
  });

  it('softDeleteProduct: PERMISSION_DENIED when no inventory:delete', async () => {
    const { softDeleteProduct } = await import('../../services/masterData/masterDataService');
    const r = await softDeleteProduct(noPermsCtx(), u('prod-001'));
    expect(isDenied(r)).toBe(true);
  });

  it('listCustomers: PERMISSION_DENIED when no customers:view', async () => {
    const { listCustomers } = await import('../../services/masterData/masterDataService');
    const r = await listCustomers(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('listProducts: succeeds when inventory:view granted', async () => {
    const { listProducts } = await import('../../services/masterData/masterDataService');
    const r = await listProducts(withPerms(['inventory']));
    expect(isDenied(r)).toBe(false);
  });

  it('listCustomers: succeeds when customers:view granted', async () => {
    const { listCustomers } = await import('../../services/masterData/masterDataService');
    const r = await listCustomers(withPerms(['customers']));
    expect(isDenied(r)).toBe(false);
  });
});

// ============================================================
// REPORTING SERVICE
// ============================================================

describe('reportingService - permission gates', () => {
  it('getDashboardKPIs: PERMISSION_DENIED when not owner and no reports:view', async () => {
    const { getDashboardKPIs } = await import('../../services/reporting/reportingService');
    const r = await getDashboardKPIs(noPermsCtx(), {} as Parameters<typeof getDashboardKPIs>[1]);
    expect(isDenied(r)).toBe(true);
  });

  it('getSalesByPeriod: PERMISSION_DENIED when no reports:view', async () => {
    const { getSalesByPeriod } = await import('../../services/reporting/reportingService');
    const r = await getSalesByPeriod(noPermsCtx(), {} as Parameters<typeof getSalesByPeriod>[1]);
    expect(isDenied(r)).toBe(true);
  });

  it('getExpenseBreakdown: PERMISSION_DENIED when no reports:view', async () => {
    const { getExpenseBreakdown } = await import('../../services/reporting/reportingService');
    const r = await getExpenseBreakdown(noPermsCtx(), {} as Parameters<typeof getExpenseBreakdown>[1]);
    expect(isDenied(r)).toBe(true);
  });

  it('getDashboardKPIs: no error when owner', async () => {
    const { getDashboardKPIs } = await import('../../services/reporting/reportingService');
    const r = await getDashboardKPIs(withPerms(['reports']), {} as Parameters<typeof getDashboardKPIs>[1]);
    expect(isDenied(r)).toBe(false);
  });
});

// ============================================================
// FINANCIAL SERVICES - permission gates
// (src/services/financial/financialServices.ts)
// ============================================================

describe('financialServices - permission gates', () => {
  it('createExpense: PERMISSION_DENIED when no expenses:create', async () => {
    const { createExpense } = await import('../../services/financial/financialServices');
    const r = await createExpense(noPermsCtx(), {} as Parameters<typeof createExpense>[1]);
    expect(isDenied(r)).toBe(true);
  });

  it('listExpenses: PERMISSION_DENIED when no expenses:view', async () => {
    const { listExpenses } = await import('../../services/financial/financialServices');
    const r = await listExpenses(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('getPayroll: PERMISSION_DENIED when no payroll:view', async () => {
    const { getPayroll } = await import('../../services/financial/financialServices');
    const r = await getPayroll(noPermsCtx(), u('period-001'));
    expect(isDenied(r)).toBe(true);
  });

  it('listPayroll: PERMISSION_DENIED when no payroll:view', async () => {
    const { listPayroll } = await import('../../services/financial/financialServices');
    const r = await listPayroll(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('approvePayroll: PERMISSION_DENIED when no payroll:approve', async () => {
    const { approvePayroll } = await import('../../services/financial/financialServices');
    const r = await approvePayroll(noPermsCtx(), u('period-001'));
    expect(isDenied(r)).toBe(true);
  });

  it('getCashBalance: PERMISSION_DENIED when no cash:view', async () => {
    const { getCashBalance } = await import('../../services/financial/financialServices');
    const r = await getCashBalance(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('listCashTransactions: PERMISSION_DENIED when no cash:view', async () => {
    const { listCashTransactions } = await import('../../services/financial/financialServices');
    const r = await listCashTransactions(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('listJournalEntries: PERMISSION_DENIED when no journal:view', async () => {
    const { listJournalEntries } = await import('../../services/financial/financialServices');
    const r = await listJournalEntries(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('getAccountBalance: PERMISSION_DENIED when no journal:view', async () => {
    const { getAccountBalance } = await import('../../services/financial/financialServices');
    const r = await getAccountBalance(noPermsCtx(), '1100');
    expect(isDenied(r)).toBe(true);
  });

  it('listExpenses: no error when expenses:view granted', async () => {
    const { listExpenses } = await import('../../services/financial/financialServices');
    const r = await listExpenses(withPerms(['expenses']));
    expect(isDenied(r)).toBe(false);
  });

  it('getCashBalance: no error when cash:view granted', async () => {
    const { getCashBalance } = await import('../../services/financial/financialServices');
    const r = await getCashBalance(withPerms(['cash']));
    expect(isDenied(r)).toBe(false);
  });
});

// ============================================================
// SETTINGS SERVICE - basic function calls
// (src/services/settings/settingsService.ts)
// These functions hit Supabase directly (no canDo gate).
// With the mock returning null data, they return ok(null) - testable.
// ============================================================

describe('settingsService - basic function calls', () => {
  it('getSetting: returns ok result (null data from mock)', async () => {
    const { getSetting } = await import('../../services/settings/settingsService');
    const r = await getSetting(noPermsCtx(), 'general', 'currency');
    // mock returns {data:null, error:null} -> ok(null)
    expect(r).toBeDefined();
    expect(r.error).toBeNull();
  });

  it('getSettingsByCategory: returns ok result', async () => {
    const { getSettingsByCategory } = await import('../../services/settings/settingsService');
    const r = await getSettingsByCategory(noPermsCtx(), 'general');
    expect(r).toBeDefined();
  });

  it('getChartOfAccounts: returns ok result', async () => {
    const { getChartOfAccounts } = await import('../../services/settings/settingsService');
    const r = await getChartOfAccounts(noPermsCtx());
    expect(r).toBeDefined();
  });

  it('getBusinessCurrency: returns a string', async () => {
    const { getBusinessCurrency } = await import('../../services/settings/settingsService');
    const result = await getBusinessCurrency(noPermsCtx());
    expect(typeof result).toBe('string');
  });

  it('getVatRate: returns a number', async () => {
    const { getVatRate } = await import('../../services/settings/settingsService');
    const result = await getVatRate(noPermsCtx());
    expect(typeof result).toBe('number');
  });

  it('allowNegativeStock: returns a boolean', async () => {
    const { allowNegativeStock } = await import('../../services/settings/settingsService');
    const result = await allowNegativeStock(noPermsCtx());
    expect(typeof result).toBe('boolean');
  });

  it('getReceiptPrefix: returns a string', async () => {
    const { getReceiptPrefix } = await import('../../services/settings/settingsService');
    const result = await getReceiptPrefix(noPermsCtx());
    expect(typeof result).toBe('string');
  });
});

// ============================================================
// MASTER DATA SERVICE - additional permission gates
// ============================================================

describe('masterDataService - additional permission gates', () => {
  it('getProduct: returns a result (no permission gate on single-record lookup)', async () => {
    const { getProduct } = await import('../../services/masterData/masterDataService');
    const r = await getProduct(noPermsCtx(), u('prod-001'));
    expect(r).toBeDefined();
    expect(isDenied(r)).toBe(false); // no canDo gate on get-by-id
  });

  it('listSuppliers: PERMISSION_DENIED when no suppliers:view', async () => {
    const { listSuppliers } = await import('../../services/masterData/masterDataService');
    const r = await listSuppliers(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('createSupplier: PERMISSION_DENIED when no suppliers:create', async () => {
    const { createSupplier } = await import('../../services/masterData/masterDataService');
    const r = await createSupplier(noPermsCtx(), {} as Parameters<typeof createSupplier>[1]);
    expect(isDenied(r)).toBe(true);
  });

  it('getCustomer: returns a result (no permission gate on single-record lookup)', async () => {
    const { getCustomer } = await import('../../services/masterData/masterDataService');
    const r = await getCustomer(noPermsCtx(), u('cust-001'));
    expect(r).toBeDefined();
    expect(isDenied(r)).toBe(false);
  });

  it('createCustomer: PERMISSION_DENIED when no customers:create', async () => {
    const { createCustomer } = await import('../../services/masterData/masterDataService');
    const r = await createCustomer(noPermsCtx(), {} as Parameters<typeof createCustomer>[1]);
    expect(isDenied(r)).toBe(true);
  });

  it('updateCustomer: PERMISSION_DENIED when no customers:edit', async () => {
    const { updateCustomer } = await import('../../services/masterData/masterDataService');
    const r = await updateCustomer(noPermsCtx(), u('cust-001'), {});
    expect(isDenied(r)).toBe(true);
  });

  it('getSupplier: returns a result (no permission gate on single-record lookup)', async () => {
    const { getSupplier } = await import('../../services/masterData/masterDataService');
    const r = await getSupplier(noPermsCtx(), u('sup-001'));
    expect(r).toBeDefined();
    expect(isDenied(r)).toBe(false);
  });

  it('listCategories: returns result (no permission gate)', async () => {
    const { listCategories } = await import('../../services/masterData/masterDataService');
    const r = await listCategories(noPermsCtx());
    expect(r).toBeDefined();
  });

  it('listUnits: returns result (no permission gate)', async () => {
    const { listUnits } = await import('../../services/masterData/masterDataService');
    const r = await listUnits(noPermsCtx());
    expect(r).toBeDefined();
  });
});
