// ============================================================
// IMC-BLD-004 | ImageCare ERP Frontend Integration v1.0
// File: src/hooks/modules/useModuleHooks.ts
// Purpose: Integration hooks for every SRS module (002-021).
//          Each hook wires one screen to its service contracts.
//          Import from this file in pages - never call services directly.
// ============================================================

import { useCallback, useState } from 'react';
import { useUserContext, useActiveBranch } from '../../context/AppContext';
import { useServiceCall, useAsyncData } from '../shared/useServiceCall';
import { usePermission } from '../usePermission';

// Services
import { listInventory, getInventoryMovements, createStockAdjustment, createStockTransfer } from '../../services/inventory/inventoryService';
import { createSale, listSales, getSale, cancelSale, getSaleReceipt } from '../../services/sales/salesService';
import { listCustomers, getCustomer, createCustomer, updateCustomer } from '../../services/masterData/masterDataService';
import { createPurchase, listPurchases, getPurchase, recordSupplierPayment } from '../../services/purchasing/purchasingService';
import { getCustomerCredit, getOutstandingCredit, recordCreditPayment } from '../../services/credit/creditService';
import { listInvoices, getInvoice, recordInvoicePayment } from '../../services/credit/creditService';
import { listBills, getBill } from '../../services/credit/creditService';
import { listPayroll, getPayroll, approvePayroll, processPayrollPayment } from '../../services/financial/financialServices';
import { listExpenses, createExpense } from '../../services/financial/financialServices';
import { getCashBalance, listCashTransactions } from '../../services/financial/financialServices';
import { listJournalEntries } from '../../services/financial/financialServices';
import { getDashboardKPIs, getSalesByPeriod, getTopProducts, getStockSummary, getCashPosition, getExpenseBreakdown } from '../../services/reporting/reportingService';
import { runSyncSession, getInitialSyncPayload } from '../../services/sync/syncService';
import type { UUID } from '../../types/database';
import { startOfMonth, endOfDay, startOfDay } from '../../utils/formatters';

// ============================================================
// SRS-002 Inventory
// ============================================================

export function useInventory(branchId?: UUID) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const bid    = branchId ?? branch ?? undefined;

  const inventory  = useAsyncData(listInventory, [ctx, { branch_id: bid }], [ctx.business_id, bid]);
  const adjustment = useServiceCall(createStockAdjustment);
  const transfer   = useServiceCall(createStockTransfer);

  return {
    inventory:      inventory.data,
    isLoading:      inventory.isLoading,
    error:          inventory.error,
    refetch:        inventory.refetch,
    adjust:         adjustment.execute,
    isAdjusting:    adjustment.isLoading,
    adjustError:    adjustment.error,
    transfer:       transfer.execute,
    isTransferring: transfer.isLoading,
    transferError:  transfer.error,
  };
}

export function useInventoryMovements(branchId: UUID, productId?: UUID) {
  const ctx = useUserContext();
  const movements = useAsyncData(
    getInventoryMovements,
    [ctx, { branch_id: branchId, product_id: productId }],
    [ctx.business_id, branchId, productId]
  );
  return {
    movements:  movements.data,
    isLoading:  movements.isLoading,
    error:      movements.error,
    refetch:    movements.refetch,
  };
}

// ============================================================
// SRS-003 Sales
// ============================================================

export function useSales(filter?: Parameters<typeof listSales>[1]) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const f      = filter ?? { branch_id: branch ?? undefined };

  const sales      = useAsyncData(listSales, [ctx, f], [ctx.business_id, branch]);
  const createCall = useServiceCall(createSale);
  const cancelCall = useServiceCall(cancelSale);

  return {
    sales:         sales.data,
    isLoading:     sales.isLoading,
    error:         sales.error,
    refetch:       sales.refetch,
    createSale:    createCall.execute,
    isCreating:    createCall.isLoading,
    createError:   createCall.error,
    cancelSale:    cancelCall.execute,
    isCancelling:  cancelCall.isLoading,
    cancelError:   cancelCall.error,
  };
}

export function useSaleDetail(saleId: UUID) {
  const ctx  = useUserContext();
  const sale = useAsyncData(getSale, [ctx, saleId], [saleId]);
  const receipt = useServiceCall(getSaleReceipt);
  return {
    sale:          sale.data,
    isLoading:     sale.isLoading,
    error:         sale.error,
    refetch:       sale.refetch,
    getReceipt:    () => receipt.execute(ctx, saleId),
    receipt:       receipt.data,
    isLoadingReceipt: receipt.isLoading,
  };
}

// ============================================================
// SRS-004 Customers
// ============================================================

export function useCustomers(filter?: Parameters<typeof listCustomers>[1]) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const f      = filter ?? { branch_id: branch ?? undefined };

  const customers    = useAsyncData(listCustomers, [ctx, f], [ctx.business_id, branch]);
  const createCall   = useServiceCall(createCustomer);
  const updateCall   = useServiceCall(updateCustomer);

  return {
    customers:     customers.data,
    isLoading:     customers.isLoading,
    error:         customers.error,
    refetch:       customers.refetch,
    createCustomer: createCall.execute,
    isCreating:    createCall.isLoading,
    updateCustomer: updateCall.execute,
    isUpdating:    updateCall.isLoading,
  };
}

export function useCustomerDetail(customerId: UUID) {
  const ctx      = useUserContext();
  const customer = useAsyncData(getCustomer, [ctx, customerId], [customerId]);
  const credit   = useAsyncData(getCustomerCredit, [ctx, customerId], [customerId]);
  return {
    customer:      customer.data,
    credit:        credit.data,
    isLoading:     customer.isLoading || credit.isLoading,
    error:         customer.error ?? credit.error,
    refetch:       () => { customer.refetch(); credit.refetch(); },
  };
}

// ============================================================
// SRS-005 Purchasing
// ============================================================

export function usePurchases(filter?: Parameters<typeof listPurchases>[1]) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const f      = filter ?? { branch_id: branch ?? undefined };

  const purchases  = useAsyncData(listPurchases, [ctx, f], [ctx.business_id, branch]);
  const createCall = useServiceCall(createPurchase);
  const payCall    = useServiceCall(recordSupplierPayment);

  return {
    purchases:      purchases.data,
    isLoading:      purchases.isLoading,
    error:          purchases.error,
    refetch:        purchases.refetch,
    createPurchase: createCall.execute,
    isCreating:     createCall.isLoading,
    createError:    createCall.error,
    recordPayment:  payCall.execute,
    isRecordingPay: payCall.isLoading,
  };
}

// ============================================================
// SRS-006 Credit Management
// ============================================================

export function useCreditManagement(branchId?: UUID) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const bid    = branchId ?? branch ?? undefined;

  const outstanding = useAsyncData(getOutstandingCredit, [ctx, bid], [ctx.business_id, bid]);
  const repayCall   = useServiceCall(recordCreditPayment);

  return {
    outstanding:    outstanding.data,
    isLoading:      outstanding.isLoading,
    error:          outstanding.error,
    refetch:        outstanding.refetch,
    recordRepayment: repayCall.execute,
    isRecording:    repayCall.isLoading,
    repayError:     repayCall.error,
  };
}

// ============================================================
// SRS-009 Invoices
// ============================================================

export function useInvoices(filter?: Parameters<typeof listInvoices>[1]) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const f      = filter ?? { branch_id: branch ?? undefined };

  const invoices  = useAsyncData(listInvoices, [ctx, f], [ctx.business_id, branch]);
  const payCall   = useServiceCall(recordInvoicePayment);

  return {
    invoices:       invoices.data,
    isLoading:      invoices.isLoading,
    error:          invoices.error,
    refetch:        invoices.refetch,
    recordPayment:  payCall.execute,
    isRecording:    payCall.isLoading,
  };
}

// ============================================================
// SRS-010 Bills & Payables
// ============================================================

export function useBills(filter?: Parameters<typeof listBills>[1]) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const f      = filter ?? { branch_id: branch ?? undefined };

  const bills = useAsyncData(listBills, [ctx, f], [ctx.business_id, branch]);

  return {
    bills:     bills.data,
    isLoading: bills.isLoading,
    error:     bills.error,
    refetch:   bills.refetch,
  };
}

// ============================================================
// SRS-011 Payroll
// ============================================================

export function usePayroll(filter?: Parameters<typeof listPayroll>[1]) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const f      = filter ?? { branch_id: branch ?? undefined };

  const payroll     = useAsyncData(listPayroll, [ctx, f], [ctx.business_id, branch]);
  const approveCall = useServiceCall(approvePayroll);
  const processCall = useServiceCall(processPayrollPayment);

  return {
    payroll:        payroll.data,
    isLoading:      payroll.isLoading,
    error:          payroll.error,
    refetch:        payroll.refetch,
    approve:        approveCall.execute,
    isApproving:    approveCall.isLoading,
    process:        processCall.execute,
    isProcessing:   processCall.isLoading,
  };
}

// ============================================================
// SRS-012 Expenses
// ============================================================

export function useExpenses(filter?: Parameters<typeof listExpenses>[1]) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const f      = filter ?? { branch_id: branch ?? undefined };

  const expenses   = useAsyncData(listExpenses, [ctx, f], [ctx.business_id, branch]);
  const createCall = useServiceCall(createExpense);

  return {
    expenses:      expenses.data,
    isLoading:     expenses.isLoading,
    error:         expenses.error,
    refetch:       expenses.refetch,
    createExpense: createCall.execute,
    isCreating:    createCall.isLoading,
    createError:   createCall.error,
  };
}

// ============================================================
// SRS-013 Sales Targets
// ============================================================

export function useSalesTargets(branchId?: UUID, dateRange?: { from: string; to: string }) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const bid    = branchId ?? branch ?? undefined;
  const from   = dateRange?.from ?? startOfMonth();
  const to     = dateRange?.to   ?? endOfDay();

  const kpis = useAsyncData(
    getDashboardKPIs,
    [ctx, bid, { from, to }],
    [ctx.business_id, bid, from, to]
  );

  const salesByPeriod = useAsyncData(
    getSalesByPeriod,
    [ctx, { from_date: from, to_date: to, group_by: 'day', branch_id: bid }],
    [ctx.business_id, bid, from, to]
  );

  return {
    kpis:          kpis.data,
    salesByPeriod: salesByPeriod.data,
    isLoading:     kpis.isLoading || salesByPeriod.isLoading,
    error:         kpis.error ?? salesByPeriod.error,
    refetch:       () => { kpis.refetch(); salesByPeriod.refetch(); },
  };
}

// ============================================================
// SRS-014 Stock Summary
// ============================================================

export function useStockSummary(branchId?: UUID) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const bid    = branchId ?? branch ?? undefined;

  const stock = useAsyncData(getStockSummary, [ctx, bid], [ctx.business_id, bid]);

  const lowStock   = (stock.data ?? []).filter(s => s.stock_status === 'low_stock');
  const outOfStock = (stock.data ?? []).filter(s => s.stock_status === 'out_of_stock');

  return {
    stock:       stock.data,
    lowStock,
    outOfStock,
    isLoading:   stock.isLoading,
    error:       stock.error,
    refetch:     stock.refetch,
  };
}

// ============================================================
// SRS-015 Cash Flow
// ============================================================

export function useCashFlow(branchId?: UUID, dateRange?: { from: string; to: string }) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const bid    = branchId ?? branch ?? undefined;

  const position = useAsyncData(getCashPosition, [ctx, bid], [ctx.business_id, bid]);

  const transactions = useAsyncData(
    listCashTransactions,
    [ctx, { branch_id: bid, date: dateRange }],
    [ctx.business_id, bid, dateRange?.from, dateRange?.to]
  );

  return {
    cashPosition:  position.data,
    transactions:  transactions.data,
    isLoading:     position.isLoading || transactions.isLoading,
    error:         position.error ?? transactions.error,
    refetch:       () => { position.refetch(); transactions.refetch(); },
  };
}

// ============================================================
// SRS-016 Monthly Summary
// ============================================================

export function useMonthlySummary(year: number, month: number, branchId?: UUID) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const bid    = branchId ?? branch ?? undefined;

  const from = new Date(year, month - 1, 1).toISOString();
  const to   = new Date(year, month, 0, 23, 59, 59).toISOString();

  const kpis = useAsyncData(
    getDashboardKPIs,
    [ctx, bid, { from, to }],
    [ctx.business_id, bid, year, month]
  );

  const salesByDay = useAsyncData(
    getSalesByPeriod,
    [ctx, { from_date: from, to_date: to, group_by: 'day', branch_id: bid }],
    [ctx.business_id, bid, year, month]
  );

  const expenses = useAsyncData(
    getExpenseBreakdown,
    [ctx, { from_date: from, to_date: to, branch_id: bid }],
    [ctx.business_id, bid, year, month]
  );

  return {
    kpis:        kpis.data,
    salesByDay:  salesByDay.data,
    expenses:    expenses.data,
    isLoading:   kpis.isLoading || salesByDay.isLoading || expenses.isLoading,
    error:       kpis.error ?? salesByDay.error ?? expenses.error,
    refetch:     () => { kpis.refetch(); salesByDay.refetch(); expenses.refetch(); },
  };
}

// ============================================================
// SRS-017 Annual Summary
// ============================================================

export function useAnnualSummary(year: number, branchId?: UUID) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const bid    = branchId ?? branch ?? undefined;

  const from = new Date(year, 0, 1).toISOString();
  const to   = new Date(year, 11, 31, 23, 59, 59).toISOString();

  const kpis = useAsyncData(
    getDashboardKPIs,
    [ctx, bid, { from, to }],
    [ctx.business_id, bid, year]
  );

  const byMonth = useAsyncData(
    getSalesByPeriod,
    [ctx, { from_date: from, to_date: to, group_by: 'month', branch_id: bid }],
    [ctx.business_id, bid, year]
  );

  const topProducts = useAsyncData(
    getTopProducts,
    [ctx, { from_date: from, to_date: to, limit: 10, branch_id: bid }],
    [ctx.business_id, bid, year]
  );

  return {
    kpis:        kpis.data,
    byMonth:     byMonth.data,
    topProducts: topProducts.data,
    isLoading:   kpis.isLoading || byMonth.isLoading || topProducts.isLoading,
    error:       kpis.error ?? byMonth.error ?? topProducts.error,
    refetch:     () => { kpis.refetch(); byMonth.refetch(); topProducts.refetch(); },
  };
}

// ============================================================
// SRS-018 Daily Summary
// ============================================================

export function useDailySummary(date?: Date, branchId?: UUID) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const bid    = branchId ?? branch ?? undefined;
  const d      = date ?? new Date();

  const from = startOfDay(d);
  const to   = endOfDay(d);

  const kpis = useAsyncData(
    getDashboardKPIs,
    [ctx, bid, { from, to }],
    [ctx.business_id, bid, d.toDateString()]
  );

  const topProducts = useAsyncData(
    getTopProducts,
    [ctx, { from_date: from, to_date: to, limit: 5, branch_id: bid }],
    [ctx.business_id, bid, d.toDateString()]
  );

  const cashPos = useAsyncData(
    getCashPosition,
    [ctx, bid],
    [ctx.business_id, bid, d.toDateString()]
  );

  return {
    kpis:        kpis.data,
    topProducts: topProducts.data,
    cashPosition: cashPos.data,
    isLoading:   kpis.isLoading || topProducts.isLoading || cashPos.isLoading,
    error:       kpis.error ?? topProducts.error ?? cashPos.error,
    refetch:     () => { kpis.refetch(); topProducts.refetch(); cashPos.refetch(); },
  };
}

// ============================================================
// SRS-019 Bank Reconciliation
// ============================================================

export function useBankReconciliation(branchId?: UUID) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const bid    = branchId ?? branch ?? undefined;

  const { can } = usePermission(ctx);
  const hasAccess = can('bank', 'approve');

  const transactions = useAsyncData(
    listCashTransactions,
    [ctx, { branch_id: bid, transaction_type: 'bank_transfer' }],
    [ctx.business_id, bid]
  );

  return {
    hasAccess,
    transactions: transactions.data,
    isLoading:    transactions.isLoading,
    error:        transactions.error,
    refetch:      transactions.refetch,
  };
}

// ============================================================
// SRS-020 Branch Overview
// ============================================================

export function useBranchOverview() {
  const ctx    = useUserContext();
  const branch = useActiveBranch();

  // Show only authorized branches
  const accessibleBranches = ctx.branches;

  const from = startOfMonth();
  const to   = endOfDay();

  const kpis = useAsyncData(
    getDashboardKPIs,
    [ctx, undefined, { from, to }],
    [ctx.business_id, from]
  );

  const stock = useAsyncData(
    getStockSummary,
    [ctx, undefined],
    [ctx.business_id]
  );

  return {
    accessibleBranches,
    activeBranchId: branch,
    kpis:     kpis.data,
    stock:    stock.data,
    isLoading: kpis.isLoading || stock.isLoading,
    error:    kpis.error ?? stock.error,
    refetch:  () => { kpis.refetch(); stock.refetch(); },
  };
}

// ============================================================
// SRS-021 Offline Mode
// ============================================================

export function useOfflineMode(deviceId: string, branchId?: UUID) {
  const ctx    = useUserContext();
  const branch = useActiveBranch();
  const bid    = branchId ?? branch ?? undefined;

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSyncAt, setLastSyncAt]     = useState<string | null>(null);
  const [syncCursor, setSyncCursor]     = useState(0);

  const syncCall    = useServiceCall(runSyncSession);
  const initialSync = useServiceCall(getInitialSyncPayload);

  // Monitor online/offline state
  const handleOnline  = useCallback(() => setIsOnline(true),  []);
  const handleOffline = useCallback(() => setIsOnline(false), []);

  // Register event listeners in the component using this hook
  const getOnlineListeners = () => ({ handleOnline, handleOffline });

  const runSync = useCallback(async () => {
    const result = await syncCall.execute(ctx, deviceId, syncCursor, bid);
    if (result.success && result.data) {
      setSyncCursor(result.data.pull.new_cursor);
      setLastSyncAt(new Date().toISOString());
    }
    return result;
  }, [ctx, deviceId, syncCursor, bid, syncCall]);

  const doInitialSync = useCallback(async () => {
    return initialSync.execute(ctx, bid);
  }, [ctx, bid, initialSync]);

  return {
    isOnline,
    lastSyncAt,
    syncCursor,
    isSyncing:    syncCall.isLoading,
    syncError:    syncCall.error,
    syncResult:   syncCall.data,
    runSync,
    doInitialSync,
    isInitialSyncing: initialSync.isLoading,
    getOnlineListeners,
  };
}
