// ============================================================
// ImageCare ERP - Workflow Services Unit Tests
// File: src/__tests__/unit/workflowServices.test.ts
//
// ApiResult shape: { data: T | null, error: AppError | null }
//   (no `ok` field - unlike EngineResult which has ok: boolean)
//
// Pattern:
//   success => result.data !== null, result.error === null
//   failure => result.error !== null, result.data === null
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UUID } from '../../types/database';
import type { UserContext, ModulePermissions } from '../../types/app';

// ---- Mocks ------------------------------------------------
const { rpcSpy } = vi.hoisted(() => ({ rpcSpy: vi.fn().mockResolvedValue({ data: null, error: null }) }));

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
    rpc: rpcSpy,
  },
}));

vi.mock('../../lib/rpc', () => ({
  rpcPostCashSale:        vi.fn().mockResolvedValue({ ok: true, data: { sale_id: 's1', sale_number: 'INV-000001', total_amount: 1000, status: 'confirmed' } }),
  rpcPostCreditSale:      vi.fn().mockResolvedValue({ ok: true, data: { sale_id: 's1', sale_number: 'INV-000001', total_amount: 800, status: 'confirmed', credit_account_id: 'ca1' } }),
  rpcReceivePurchase:     vi.fn().mockResolvedValue({ ok: true, data: { purchase_id: 'p1', purchase_number: 'PO-000001', total_amount: 5000, status: 'confirmed' } }),
  rpcPaySupplier:         vi.fn().mockResolvedValue({ ok: true, data: { purchase_id: 'p1', amount: 1000, journal_entry_id: 'je1', cash_transaction_id: 'ct1' } }),
  rpcRecordExpense:       vi.fn().mockResolvedValue({ ok: true, data: { expense_id: 'e1', expense_number: 'EXP-000001', total_amount: 200, status: 'confirmed' } }),
  rpcRecordCreditPayment: vi.fn().mockResolvedValue({ ok: true, data: { transaction_id: 'ct1', amount: 500, new_balance: 0, journal_entry_id: 'je1' } }),
  rpcTransferStock:       vi.fn().mockResolvedValue({ ok: true, data: { out_movement_id: 'mv1', in_movement_id: 'mv2', quantity: 10 } }),
  rpcAdjustStock:         vi.fn().mockResolvedValue({ ok: true, data: { movement_id: 'mv1', journal_entry_id: 'je1', direction: 'in', quantity: 5 } }),
}));

vi.mock('../../engines/business/businessEngine', () => ({
  businessEngine: {
    createSale:    vi.fn().mockResolvedValue({ ok: true, data: { sale_id: 'draft-001' } }),
    recordExpense: vi.fn().mockResolvedValue({ ok: true, data: { expense_id: 'exp-001' } }),
  },
}));

vi.mock('../../engines/purchasing/purchasingEngine', () => ({
  purchasingEngine: {
    createPurchase: vi.fn().mockResolvedValue({ ok: true, data: { purchase_id: 'po-001', purchase_number: 'PO-000001', total_amount: 5000 } }),
  },
}));

vi.mock('../../engines/inventory/inventoryEngine', () => ({
  inventoryEngine: {
    getStock:          vi.fn().mockResolvedValue({ ok: true, data: { quantity_on_hand: 10, stock_value: 500, is_low_stock: false } }),
    getLowStockAlerts: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    recordMovement:    vi.fn().mockResolvedValue({ ok: true, data: { movement_id: 'mv1' } }),
  },
}));

vi.mock('../../engines/reporting/reportingEngine', () => ({
  reportingEngine: {
    getKpis:           vi.fn().mockResolvedValue({ ok: true, data: { revenue: 100000, cogs: 60000, gross_profit: 40000, expenses: 10000, net_profit: 30000, sale_count: 50, cash_in_hand: 45000, outstanding_credit: 5000 } }),
    getLowStockAlerts: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    getSalesSummary:   vi.fn().mockResolvedValue({ ok: true, data: { total_revenue: 100000, total_sales: 50, average_sale: 2000 } }),
  },
}));

vi.mock('../../engines/credit/creditEngine', () => ({
  creditEngine: {
    getBalance:    vi.fn().mockResolvedValue({ ok: true, data: { balance: 1000, credit_limit: 5000 } }),
    recordPayment: vi.fn().mockResolvedValue({ ok: true, data: { transaction_id: 'ct1', new_balance: 500 } }),
  },
}));

vi.mock('../../engines/audit/auditEngine', () => ({
  auditEngine: { log: vi.fn().mockResolvedValue(undefined) },
}));

// ---- Context helpers ---------------------------------------
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

function withPermsCtx(modules: string[]): UserContext {
  const permissions: Record<string, ModulePermissions> = {};
  for (const m of modules) {
    permissions[m] = { view: true, create: true, edit: true, delete: true, approve: false, export: false, sync: false, branch_scope: 'assigned' };
  }
  return { ...noPermsCtx(), permissions };
}

// ---- ApiResult helpers (no `ok` field) --------------------
function isDenied(r: { error: { code: string } | null }): boolean {
  return r.error?.code === 'PERMISSION_DENIED';
}
function isValidationError(r: { error: { code: string } | null }): boolean {
  return r.error?.code === 'VALIDATION_ERROR';
}
function hasData<T>(r: { data: T | null }): boolean {
  return r.data !== null;
}

beforeEach(() => { vi.clearAllMocks(); });

// ============================================================
// SALES WORKFLOW SERVICE
// ============================================================

describe('salesWorkflowService - permissions', () => {
  it('createAndPostSale: PERMISSION_DENIED when no sales:create', async () => {
    const { createAndPostSale } = await import('../../services/sales/salesWorkflowService');
    const r = await createAndPostSale(noPermsCtx(), u('branch-001'), { payment_method: 'cash', lines: [] });
    expect(isDenied(r)).toBe(true);
  });

  it('listSales: PERMISSION_DENIED when no sales:view', async () => {
    const { listSales } = await import('../../services/sales/salesWorkflowService');
    const r = await listSales(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('getSaleDetail: PERMISSION_DENIED when no sales:view', async () => {
    const { getSaleDetail } = await import('../../services/sales/salesWorkflowService');
    const r = await getSaleDetail(noPermsCtx(), u('sale-001'));
    expect(isDenied(r)).toBe(true);
  });

  it('getDashboardKpis: PERMISSION_DENIED when not owner and no reports:view', async () => {
    const { getDashboardKpis } = await import('../../services/sales/salesWorkflowService');
    const r = await getDashboardKpis(noPermsCtx(), { from_date: '2024-01-01', to_date: '2024-01-31' });
    expect(isDenied(r)).toBe(true);
  });

  it('getDashboardKpis: succeeds when reports:view permitted', async () => {
    const { getDashboardKpis } = await import('../../services/sales/salesWorkflowService');
    const r = await getDashboardKpis(withPermsCtx(['reports']), { from_date: '2024-01-01', to_date: '2024-01-31' });
    expect(hasData(r)).toBe(true);
    expect(r.data!.revenue).toBe(100000);
  });

  it('createAndPostSale: calls rpcPostCashSale for cash sale when authorized', async () => {
    const { createAndPostSale } = await import('../../services/sales/salesWorkflowService');
    const { rpcPostCashSale } = await import('../../lib/rpc');
    await createAndPostSale(withPermsCtx(['sales']), u('branch-001'), { payment_method: 'cash', lines: [] });
    expect(rpcPostCashSale).toHaveBeenCalled();
  });

  it('createAndPostSale: calls rpcPostCreditSale for credit sale when authorized', async () => {
    const { createAndPostSale } = await import('../../services/sales/salesWorkflowService');
    const { rpcPostCreditSale } = await import('../../lib/rpc');
    await createAndPostSale(withPermsCtx(['sales']), u('branch-001'), { payment_method: 'credit', lines: [] });
    expect(rpcPostCreditSale).toHaveBeenCalled();
  });

  it('createAndPostSale: returns data on success', async () => {
    const { createAndPostSale } = await import('../../services/sales/salesWorkflowService');
    const r = await createAndPostSale(withPermsCtx(['sales']), u('branch-001'), { payment_method: 'cash', lines: [] });
    expect(hasData(r)).toBe(true);
  });
});

// ============================================================
// PURCHASING WORKFLOW SERVICE
// ============================================================

describe('purchasingWorkflowService - permissions', () => {
  it('createPurchaseOrder: PERMISSION_DENIED when no purchasing:create', async () => {
    const { createPurchaseOrder } = await import('../../services/purchasing/purchasingWorkflowService');
    const r = await createPurchaseOrder(noPermsCtx(), u('branch-001'), { payment_method: 'cash', lines: [] });
    expect(isDenied(r)).toBe(true);
  });

  it('receivePurchaseStock: PERMISSION_DENIED when no purchasing:edit', async () => {
    const { receivePurchaseStock } = await import('../../services/purchasing/purchasingWorkflowService');
    const r = await receivePurchaseStock(noPermsCtx(), u('branch-001'), u('po-001'));
    expect(isDenied(r)).toBe(true);
  });

  it('paySupplier: PERMISSION_DENIED when no purchasing:edit', async () => {
    const { paySupplier } = await import('../../services/purchasing/purchasingWorkflowService');
    const r = await paySupplier(noPermsCtx(), u('branch-001'), u('po-001'), 1000, 'cash');
    expect(isDenied(r)).toBe(true);
  });

  it('listPurchases: PERMISSION_DENIED when no purchasing:view', async () => {
    const { listPurchases } = await import('../../services/purchasing/purchasingWorkflowService');
    const r = await listPurchases(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('getPurchaseDetail: PERMISSION_DENIED when no purchasing:view', async () => {
    const { getPurchaseDetail } = await import('../../services/purchasing/purchasingWorkflowService');
    const r = await getPurchaseDetail(noPermsCtx(), u('po-001'));
    expect(isDenied(r)).toBe(true);
  });

  it('receivePurchaseStock: calls rpcReceivePurchase when authorized', async () => {
    const { receivePurchaseStock } = await import('../../services/purchasing/purchasingWorkflowService');
    const { rpcReceivePurchase } = await import('../../lib/rpc');
    const r = await receivePurchaseStock(withPermsCtx(['purchasing']), u('branch-001'), u('po-001'));
    expect(rpcReceivePurchase).toHaveBeenCalled();
    expect(hasData(r)).toBe(true);
  });

  it('paySupplier: calls rpcPaySupplier when authorized', async () => {
    const { paySupplier } = await import('../../services/purchasing/purchasingWorkflowService');
    const { rpcPaySupplier } = await import('../../lib/rpc');
    const r = await paySupplier(withPermsCtx(['purchasing']), u('branch-001'), u('po-001'), 1000, 'cash');
    expect(rpcPaySupplier).toHaveBeenCalled();
    expect(hasData(r)).toBe(true);
  });

  it('createPurchaseOrder: creates draft when authorized', async () => {
    const { createPurchaseOrder } = await import('../../services/purchasing/purchasingWorkflowService');
    const r = await createPurchaseOrder(withPermsCtx(['purchasing']), u('branch-001'), { payment_method: 'credit', lines: [] });
    expect(hasData(r)).toBe(true);
  });
});

// ============================================================
// INVENTORY WORKFLOW SERVICE
// ============================================================

describe('inventoryWorkflowService - permissions', () => {
  it('getStockLevel: PERMISSION_DENIED when no inventory:view', async () => {
    const { getStockLevel } = await import('../../services/inventory/inventoryWorkflowService');
    const r = await getStockLevel(noPermsCtx(), u('prod-001'), u('branch-001'));
    expect(isDenied(r)).toBe(true);
  });

  it('listStockSummary: PERMISSION_DENIED when no inventory:view', async () => {
    const { listStockSummary } = await import('../../services/inventory/inventoryWorkflowService');
    const r = await listStockSummary(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('getLowStockAlerts: PERMISSION_DENIED when no inventory:view', async () => {
    const { getLowStockAlerts } = await import('../../services/inventory/inventoryWorkflowService');
    const r = await getLowStockAlerts(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('transferStock: PERMISSION_DENIED when no inventory:edit', async () => {
    const { transferStock } = await import('../../services/inventory/inventoryWorkflowService');
    const r = await transferStock(noPermsCtx(), { from_branch_id: u('b1'), to_branch_id: u('b2'), product_id: u('p'), quantity: 5, unit_cost: 100 });
    expect(isDenied(r)).toBe(true);
  });

  it('recordStockAdjustment: PERMISSION_DENIED when no inventory:edit', async () => {
    const { recordStockAdjustment } = await import('../../services/inventory/inventoryWorkflowService');
    const r = await recordStockAdjustment(noPermsCtx(), { branch_id: u('b'), product_id: u('p'), quantity: 5, unit_cost: 100, direction: 'in', reason: 'found' });
    expect(isDenied(r)).toBe(true);
  });

  it('getMovementHistory: PERMISSION_DENIED when no inventory:view', async () => {
    const { getMovementHistory } = await import('../../services/inventory/inventoryWorkflowService');
    const r = await getMovementHistory(noPermsCtx(), u('prod-001'));
    expect(isDenied(r)).toBe(true);
  });

  it('getStockLevel: succeeds when authorized', async () => {
    const { getStockLevel } = await import('../../services/inventory/inventoryWorkflowService');
    const r = await getStockLevel(withPermsCtx(['inventory']), u('prod-001'), u('branch-001'));
    expect(hasData(r)).toBe(true);
    expect(r.data!.quantity_on_hand).toBe(10);
  });

  it('transferStock: calls rpcTransferStock when authorized', async () => {
    const { transferStock } = await import('../../services/inventory/inventoryWorkflowService');
    const { rpcTransferStock } = await import('../../lib/rpc');
    await transferStock(withPermsCtx(['inventory']), { from_branch_id: u('b1'), to_branch_id: u('b2'), product_id: u('p'), quantity: 5, unit_cost: 100 });
    expect(rpcTransferStock).toHaveBeenCalled();
  });

  it('recordStockAdjustment: calls rpcAdjustStock when authorized', async () => {
    const { recordStockAdjustment } = await import('../../services/inventory/inventoryWorkflowService');
    const { rpcAdjustStock } = await import('../../lib/rpc');
    const r = await recordStockAdjustment(withPermsCtx(['inventory']), { branch_id: u('b'), product_id: u('p'), quantity: 5, unit_cost: 100, direction: 'in', reason: 'test' });
    expect(rpcAdjustStock).toHaveBeenCalled();
    expect(hasData(r)).toBe(true);
  });
});

// ============================================================
// CREDIT WORKFLOW SERVICE
// ============================================================

describe('creditWorkflowService - permissions', () => {
  it('listCreditAccounts: PERMISSION_DENIED when no credit:view', async () => {
    const { listCreditAccounts } = await import('../../services/credit/creditWorkflowService');
    const r = await listCreditAccounts(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('getCreditBalance: PERMISSION_DENIED when no credit:view', async () => {
    const { getCreditBalance } = await import('../../services/credit/creditWorkflowService');
    const r = await getCreditBalance(noPermsCtx(), u('ca-001'));
    expect(isDenied(r)).toBe(true);
  });

  it('recordCreditRepayment: PERMISSION_DENIED when no credit:create', async () => {
    const { recordCreditRepayment } = await import('../../services/credit/creditWorkflowService');
    const r = await recordCreditRepayment(noPermsCtx(), u('br'), u('ca'), 500, 'cash');
    expect(isDenied(r)).toBe(true);
  });

  it('updateCreditLimit: PERMISSION_DENIED for non-owner', async () => {
    const { updateCreditLimit } = await import('../../services/credit/creditWorkflowService');
    const r = await updateCreditLimit(noPermsCtx(), u('ca-001'), 10000);
    expect(isDenied(r)).toBe(true);
  });

  it('updateCreditLimit: VALIDATION_ERROR for negative limit even for owner', async () => {
    const { updateCreditLimit } = await import('../../services/credit/creditWorkflowService');
    const r = await updateCreditLimit(ownerCtx(), u('ca-001'), -100);
    expect(isValidationError(r)).toBe(true);
  });

  it('getCreditTransactionHistory: PERMISSION_DENIED when no credit:view', async () => {
    const { getCreditTransactionHistory } = await import('../../services/credit/creditWorkflowService');
    const r = await getCreditTransactionHistory(noPermsCtx(), u('ca-001'));
    expect(isDenied(r)).toBe(true);
  });

  it('recordCreditRepayment: calls rpcRecordCreditPayment when authorized', async () => {
    const { recordCreditRepayment } = await import('../../services/credit/creditWorkflowService');
    const { rpcRecordCreditPayment } = await import('../../lib/rpc');
    const r = await recordCreditRepayment(withPermsCtx(['credit']), u('br'), u('ca'), 500, 'cash');
    expect(rpcRecordCreditPayment).toHaveBeenCalled();
    expect(hasData(r)).toBe(true);
  });
});

// ============================================================
// EXPENSES WORKFLOW SERVICE
// ============================================================

describe('expensesWorkflowService - permissions', () => {
  it('recordExpense: PERMISSION_DENIED when no expenses:create', async () => {
    const { recordExpense } = await import('../../services/expenses/expensesWorkflowService');
    const r = await recordExpense(noPermsCtx(), u('br'), { category: 'Rent', description: 'Office', amount: 500, payment_method: 'cash' });
    expect(isDenied(r)).toBe(true);
  });

  it('listExpenses: PERMISSION_DENIED when no expenses:view', async () => {
    const { listExpenses } = await import('../../services/expenses/expensesWorkflowService');
    const r = await listExpenses(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('getExpenseSummaryByCategory: PERMISSION_DENIED when no expenses:view', async () => {
    const { getExpenseSummaryByCategory } = await import('../../services/expenses/expensesWorkflowService');
    const r = await getExpenseSummaryByCategory(noPermsCtx(), '2024-01-01', '2024-01-31');
    expect(isDenied(r)).toBe(true);
  });

  it('listPayroll: PERMISSION_DENIED when no payroll:view', async () => {
    const { listPayroll } = await import('../../services/expenses/expensesWorkflowService');
    const r = await listPayroll(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('recordExpense: calls rpcRecordExpense when authorized', async () => {
    const { recordExpense } = await import('../../services/expenses/expensesWorkflowService');
    const { rpcRecordExpense } = await import('../../lib/rpc');
    const r = await recordExpense(withPermsCtx(['expenses']), u('br'), { category: 'Rent', description: 'Office', amount: 500, payment_method: 'cash' });
    expect(rpcRecordExpense).toHaveBeenCalled();
    expect(hasData(r)).toBe(true);
  });
});

// ============================================================
// REPORTING WORKFLOW SERVICE
// ============================================================

describe('reportingWorkflowService - permissions', () => {
  it('getDashboardKpis: PERMISSION_DENIED when not owner and no reports:view', async () => {
    const { getDashboardKpis } = await import('../../services/reporting/reportingWorkflowService');
    const r = await getDashboardKpis(noPermsCtx(), { from_date: '2024-01-01', to_date: '2024-01-31' });
    expect(isDenied(r)).toBe(true);
  });

  it('getDashboardKpis: succeeds for owner, accounting values correct', async () => {
    const { getDashboardKpis } = await import('../../services/reporting/reportingWorkflowService');
    const r = await getDashboardKpis(ownerCtx(), { from_date: '2024-01-01', to_date: '2024-01-31' });
    expect(hasData(r)).toBe(true);
    expect(r.data!.revenue).toBe(100000);
    expect(r.data!.gross_profit).toBe(40000);   // revenue - cogs = 100000 - 60000
    expect(r.data!.net_profit).toBe(30000);     // gross_profit - expenses = 40000 - 10000
    expect(r.data!.gross_profit).not.toBe(r.data!.revenue);  // revenue != gross_profit
    expect(r.data!.net_profit).not.toBe(r.data!.cash_in_hand); // profit != cash
  });

  it('getLowStockAlerts: PERMISSION_DENIED when no inventory:view', async () => {
    const { getLowStockAlerts } = await import('../../services/reporting/reportingWorkflowService');
    const r = await getLowStockAlerts(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('getSalesSummary: PERMISSION_DENIED when not owner and no reports:view', async () => {
    const { getSalesSummary } = await import('../../services/reporting/reportingWorkflowService');
    const r = await getSalesSummary(noPermsCtx(), { from_date: '2024-01-01', to_date: '2024-01-31' });
    expect(isDenied(r)).toBe(true);
  });

  it('getCashFlow: PERMISSION_DENIED when not owner and no reports:view', async () => {
    const { getCashFlow } = await import('../../services/reporting/reportingWorkflowService');
    const r = await getCashFlow(noPermsCtx(), u('br'), '2024-01-01', '2024-01-31');
    expect(isDenied(r)).toBe(true);
  });

  it('getBranchOverview: PERMISSION_DENIED when not owner and no reports:view', async () => {
    const { getBranchOverview } = await import('../../services/reporting/reportingWorkflowService');
    const r = await getBranchOverview(noPermsCtx(), { from_date: '2024-01-01', to_date: '2024-01-31' });
    expect(isDenied(r)).toBe(true);
  });

  it('getDailySummary: PERMISSION_DENIED when not owner and no reports:view', async () => {
    const { getDailySummary } = await import('../../services/reporting/reportingWorkflowService');
    const r = await getDailySummary(noPermsCtx(), '2024-01-01', '2024-01-31');
    expect(isDenied(r)).toBe(true);
  });

  it('getDailySummary: succeeds for owner (empty result from mock)', async () => {
    const { getDailySummary } = await import('../../services/reporting/reportingWorkflowService');
    const r = await getDailySummary(ownerCtx(), '2024-01-01', '2024-01-31');
    // data is an array (possibly empty) - not denied
    expect(r.error?.code).not.toBe('PERMISSION_DENIED');
  });
});

// ============================================================
// AUDIT WORKFLOW SERVICE
// ============================================================

describe('auditWorkflowService - permissions', () => {
  it('getAuditLog: PERMISSION_DENIED for non-owner', async () => {
    const { getAuditLog } = await import('../../services/audit/auditWorkflowService');
    const r = await getAuditLog(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('getAuditLog: allowed for owner - error code is not PERMISSION_DENIED', async () => {
    const { getAuditLog } = await import('../../services/audit/auditWorkflowService');
    const r = await getAuditLog(ownerCtx());
    expect(r.error?.code).not.toBe('PERMISSION_DENIED');
  });
});

// ============================================================
// MASTER DATA SERVICE - permission enforcement
// ============================================================

describe('masterDataService - permissions', () => {
  it('listProducts: PERMISSION_DENIED when no inventory:view', async () => {
    const { listProducts } = await import('../../services/masterData/masterDataService');
    const r = await listProducts(noPermsCtx());
    expect(isDenied(r)).toBe(true);
  });

  it('createProduct: PERMISSION_DENIED when no inventory:create', async () => {
    const { createProduct } = await import('../../services/masterData/masterDataService');
    const r = await createProduct(noPermsCtx(), { name: 'Test' } as any);
    expect(isDenied(r)).toBe(true);
  });

  it('updateProduct: PERMISSION_DENIED when no inventory:edit', async () => {
    const { updateProduct } = await import('../../services/masterData/masterDataService');
    const r = await updateProduct(noPermsCtx(), u('prod-001'), { selling_price: 120 });
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

  it('createCustomer: PERMISSION_DENIED when no customers:create', async () => {
    const { createCustomer } = await import('../../services/masterData/masterDataService');
    const r = await createCustomer(noPermsCtx(), { name: 'Alice' } as any);
    expect(isDenied(r)).toBe(true);
  });

  it('updateCustomer: PERMISSION_DENIED when no customers:edit', async () => {
    const { updateCustomer } = await import('../../services/masterData/masterDataService');
    const r = await updateCustomer(noPermsCtx(), u('cust-001'), { name: 'Alice Updated' } as any);
    expect(isDenied(r)).toBe(true);
  });

  it('listProducts: succeeds when inventory:view granted (returns empty from mock)', async () => {
    const { listProducts } = await import('../../services/masterData/masterDataService');
    const r = await listProducts(withPermsCtx(['inventory']));
    expect(r.error?.code).not.toBe('PERMISSION_DENIED');
  });

  it('listCustomers: succeeds when customers:view granted (returns empty from mock)', async () => {
    const { listCustomers } = await import('../../services/masterData/masterDataService');
    const r = await listCustomers(withPermsCtx(['customers']));
    expect(r.error?.code).not.toBe('PERMISSION_DENIED');
  });
});
