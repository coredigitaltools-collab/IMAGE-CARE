// ============================================================
// IMC-BLD-005 | ImageCare ERP State & Data Flow v1.0
// File: src/hooks/shared/useServerState.ts
// Purpose: Typed React Query hooks for server state.
//          Use these instead of raw useQuery/useMutation.
//          Enforces consistent cache keys, error handling,
//          and invalidation patterns across all modules.
// ============================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { queryKeys, invalidateAfter } from '../../lib/queryClient';
import type { ServiceResponse, PagedResponse } from '../../types/contracts';
import type { UserContext } from '../../types/app';
import type {
  Product, Customer, Supplier, Sale, Purchase,
  Expense, PayrollRecord, CashTransaction, Invoice, Bill,
  DashboardKPIs, StockSummaryRow, UUID
} from '../../types/database';

// Services
import { getDashboardKPIs, getSalesByPeriod, getTopProducts, getStockSummary, getCashPosition, getExpenseBreakdown } from '../../services/reporting/reportingService';
import { listProducts, getProduct, listCustomers, getCustomer, listSuppliers, getSupplier, listCategories, listUnits } from '../../services/masterData/masterDataService';
import { listSales, getSale, getSaleReceipt } from '../../services/sales/salesService';
import { createSale, cancelSale } from '../../services/sales/salesService';
import { listPurchases, getPurchase } from '../../services/purchasing/purchasingService';
import { createPurchase } from '../../services/purchasing/purchasingService';
import { listInventory, getStock } from '../../services/inventory/inventoryService';
import { createStockAdjustment } from '../../services/inventory/inventoryService';
import { listExpenses, createExpense } from '../../services/financial/financialServices';
import { listPayroll, approvePayroll, processPayrollPayment } from '../../services/financial/financialServices';
import { getCashBalance, listCashTransactions } from '../../services/financial/financialServices';
import { getOutstandingCredit, recordCreditPayment } from '../../services/credit/creditService';
import { listInvoices, recordInvoicePayment } from '../../services/credit/creditService';
import { listBills } from '../../services/credit/creditService';
import type { CreateSaleInput } from '../../services/business/businessEngine';
import type { CreatePurchaseInput } from '../../services/business/businessEngine';
import type { CreateExpenseInput } from '../../services/business/businessEngine';

// ============================================================
// DASHBOARD
// ============================================================

export function useDashboardKPIs(
  ctx: UserContext,
  branchId?: UUID,
  from?: string,
  to?: string
) {
  return useQuery({
    queryKey: queryKeys.dashboardKPIs(ctx.business_id, branchId, from, to),
    queryFn:  async () => {
      const r = await getDashboardKPIs(ctx, branchId, from && to ? { from, to } : undefined);
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
    staleTime: 60_000,   // KPIs can be slightly stale - 1 minute
  });
}

export function useStockSummaryQuery(ctx: UserContext, branchId?: UUID) {
  return useQuery({
    queryKey: queryKeys.stockSummary(ctx.business_id, branchId),
    queryFn:  async () => {
      const r = await getStockSummary(ctx, branchId);
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
  });
}

// ============================================================
// MASTER DATA
// ============================================================

export function useProductsQuery(ctx: UserContext, filters?: object) {
  return useQuery({
    queryKey: queryKeys.products(ctx.business_id, filters),
    queryFn:  async () => {
      const r = await listProducts(ctx, filters as any ?? {});
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
    staleTime: 2 * 60_000,  // Products change infrequently
  });
}

export function useProductQuery(ctx: UserContext, productId: UUID) {
  return useQuery({
    queryKey: queryKeys.product(productId),
    queryFn:  async () => {
      const r = await getProduct(ctx, productId);
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
    staleTime: 2 * 60_000,
  });
}

export function useCategoriesQuery(ctx: UserContext) {
  return useQuery({
    queryKey: queryKeys.categories(ctx.business_id),
    queryFn:  async () => {
      const r = await listCategories(ctx);
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
    staleTime: 5 * 60_000,  // Categories rarely change
  });
}

export function useUnitsQuery(ctx: UserContext) {
  return useQuery({
    queryKey: queryKeys.units(ctx.business_id),
    queryFn:  async () => {
      const r = await listUnits(ctx);
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
    staleTime: 10 * 60_000, // Units almost never change
  });
}

export function useCustomersQuery(ctx: UserContext, filters?: object) {
  return useQuery({
    queryKey: queryKeys.customers(ctx.business_id, filters),
    queryFn:  async () => {
      const r = await listCustomers(ctx, filters as any ?? {});
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
    staleTime: 60_000,
  });
}

export function useCustomerQuery(ctx: UserContext, customerId: UUID) {
  return useQuery({
    queryKey: queryKeys.customer(customerId),
    queryFn:  async () => {
      const r = await getCustomer(ctx, customerId);
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
  });
}

export function useSuppliersQuery(ctx: UserContext, filters?: object) {
  return useQuery({
    queryKey: queryKeys.suppliers(ctx.business_id, filters),
    queryFn:  async () => {
      const r = await listSuppliers(ctx, filters as any ?? {});
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
    staleTime: 60_000,
  });
}

// ============================================================
// SALES
// ============================================================

export function useSalesQuery(ctx: UserContext, filters?: object) {
  return useQuery({
    queryKey: queryKeys.sales(ctx.business_id, filters),
    queryFn:  async () => {
      const r = await listSales(ctx, filters as any ?? {});
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
  });
}

export function useSaleQuery(ctx: UserContext, saleId: UUID) {
  return useQuery({
    queryKey: queryKeys.sale(saleId),
    queryFn:  async () => {
      const r = await getSale(ctx, saleId);
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
  });
}

export function useCreateSaleMutation(ctx: UserContext) {
  return useMutation({
    mutationFn: (input: CreateSaleInput) => createSale(ctx, input),
    onSuccess: (result) => {
      if (result.success) {
        invalidateAfter.sale(ctx.business_id, ctx.branch_id ?? undefined);
      }
    },
  });
}

export function useCancelSaleMutation(ctx: UserContext) {
  return useMutation({
    mutationFn: ({ saleId, reason }: { saleId: UUID; reason: string }) =>
      cancelSale(ctx, saleId, reason),
    onSuccess: (result, { saleId }) => {
      if (result.success) {
        invalidateAfter.sale(ctx.business_id, ctx.branch_id ?? undefined);
        // Remove the specific sale from cache to force fresh load
        queryClient.removeQueries({ queryKey: queryKeys.sale(saleId) });
      }
    },
  });
}

// ============================================================
// PURCHASES
// ============================================================

export function usePurchasesQuery(ctx: UserContext, filters?: object) {
  return useQuery({
    queryKey: queryKeys.purchases(ctx.business_id, filters),
    queryFn:  async () => {
      const r = await listPurchases(ctx, filters as any ?? {});
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
  });
}

export function useCreatePurchaseMutation(ctx: UserContext) {
  return useMutation({
    mutationFn: (input: CreatePurchaseInput) => createPurchase(ctx, input),
    onSuccess: (result) => {
      if (result.success) {
        invalidateAfter.purchase(ctx.business_id, ctx.branch_id ?? undefined);
      }
    },
  });
}

// ============================================================
// INVENTORY
// ============================================================

export function useInventoryQuery(ctx: UserContext, branchId?: UUID) {
  return useQuery({
    queryKey: queryKeys.inventory(ctx.business_id, branchId),
    queryFn:  async () => {
      const r = await listInventory(ctx, branchId ? { branch_id: branchId } : {});
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
  });
}

export function useStockAdjustmentMutation(ctx: UserContext) {
  return useMutation({
    mutationFn: (input: Parameters<typeof createStockAdjustment>[1]) =>
      createStockAdjustment(ctx, input),
    onSuccess: (result, input) => {
      if (result.success) {
        invalidateAfter.inventory(ctx.business_id, input.branch_id);
      }
    },
  });
}

// ============================================================
// CREDIT
// ============================================================

export function useOutstandingCreditQuery(ctx: UserContext, branchId?: UUID) {
  return useQuery({
    queryKey: queryKeys.credit(ctx.business_id, branchId),
    queryFn:  async () => {
      const r = await getOutstandingCredit(ctx, branchId);
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
  });
}

export function useCreditRepaymentMutation(ctx: UserContext) {
  return useMutation({
    mutationFn: (input: Parameters<typeof recordCreditPayment>[1]) =>
      recordCreditPayment(ctx, input),
    onSuccess: (result, input) => {
      if (result.success) {
        invalidateAfter.creditRepayment(ctx.business_id, input.customer_id);
      }
    },
  });
}

// ============================================================
// INVOICES & BILLS
// ============================================================

export function useInvoicesQuery(ctx: UserContext, filters?: object) {
  return useQuery({
    queryKey: queryKeys.invoices(ctx.business_id, filters),
    queryFn:  async () => {
      const r = await listInvoices(ctx, filters as any ?? {});
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
  });
}

export function useBillsQuery(ctx: UserContext, filters?: object) {
  return useQuery({
    queryKey: queryKeys.bills(ctx.business_id, filters),
    queryFn:  async () => {
      const r = await listBills(ctx, filters as any ?? {});
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
  });
}

export function useInvoicePaymentMutation(ctx: UserContext) {
  return useMutation({
    mutationFn: (input: Parameters<typeof recordInvoicePayment>[1]) =>
      recordInvoicePayment(ctx, input),
    onSuccess: (result, input) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.invoice(input.invoice_id) });
        queryClient.invalidateQueries({ queryKey: ['invoices', ctx.business_id] });
        invalidateAfter.creditRepayment(ctx.business_id, '');
      }
    },
  });
}

// ============================================================
// EXPENSES
// ============================================================

export function useExpensesQuery(ctx: UserContext, filters?: object) {
  return useQuery({
    queryKey: queryKeys.expenses(ctx.business_id, filters),
    queryFn:  async () => {
      const r = await listExpenses(ctx, filters as any ?? {});
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
  });
}

export function useCreateExpenseMutation(ctx: UserContext) {
  return useMutation({
    mutationFn: (input: CreateExpenseInput) => createExpense(ctx, input),
    onSuccess: (result) => {
      if (result.success) {
        invalidateAfter.expense(ctx.business_id);
      }
    },
  });
}

// ============================================================
// PAYROLL
// ============================================================

export function usePayrollQuery(ctx: UserContext, filters?: object) {
  return useQuery({
    queryKey: queryKeys.payroll(ctx.business_id, filters),
    queryFn:  async () => {
      const r = await listPayroll(ctx, filters as any ?? {});
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
  });
}

export function useApprovePayrollMutation(ctx: UserContext) {
  return useMutation({
    mutationFn: (payrollId: UUID) => approvePayroll(ctx, payrollId),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.payroll(ctx.business_id) });
      }
    },
  });
}

export function useProcessPayrollMutation(ctx: UserContext) {
  return useMutation({
    mutationFn: (payrollId: UUID) => processPayrollPayment(ctx, payrollId),
    onSuccess: (result) => {
      if (result.success) {
        invalidateAfter.payroll(ctx.business_id);
      }
    },
  });
}

// ============================================================
// CASH
// ============================================================

export function useCashBalanceQuery(ctx: UserContext, branchId?: UUID) {
  return useQuery({
    queryKey: queryKeys.cashBalance(ctx.business_id, branchId),
    queryFn:  async () => {
      const r = await getCashBalance(ctx, branchId ?? ctx.branch_id ?? '');
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
    staleTime: 30_000,
  });
}

export function useCashTransactionsQuery(ctx: UserContext, filters?: object) {
  return useQuery({
    queryKey: queryKeys.cashTxns(ctx.business_id, filters),
    queryFn:  async () => {
      const r = await listCashTransactions(ctx, filters as any ?? {});
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
  });
}

// ============================================================
// REPORTING
// ============================================================

export function useSalesByPeriodQuery(
  ctx: UserContext,
  from: string,
  to: string,
  groupBy: 'day' | 'week' | 'month' = 'day',
  branchId?: UUID
) {
  return useQuery({
    queryKey: queryKeys.salesByPeriod(ctx.business_id, branchId, from, to, groupBy),
    queryFn:  async () => {
      const r = await getSalesByPeriod(ctx, { from_date: from, to_date: to, group_by: groupBy, branch_id: branchId });
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
    staleTime: 2 * 60_000,
  });
}

export function useTopProductsQuery(
  ctx: UserContext,
  from: string,
  to: string,
  limit: number = 10,
  branchId?: UUID
) {
  return useQuery({
    queryKey: queryKeys.topProducts(ctx.business_id, branchId, from, to),
    queryFn:  async () => {
      const r = await getTopProducts(ctx, { from_date: from, to_date: to, limit, branch_id: branchId });
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
    staleTime: 2 * 60_000,
  });
}

export function useCashPositionQuery(ctx: UserContext, branchId?: UUID) {
  return useQuery({
    queryKey: queryKeys.cashPosition(ctx.business_id, branchId),
    queryFn:  async () => {
      const r = await getCashPosition(ctx, branchId);
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
    staleTime: 30_000,
  });
}

export function useExpenseBreakdownQuery(
  ctx: UserContext,
  from: string,
  to: string,
  branchId?: UUID
) {
  return useQuery({
    queryKey: queryKeys.expenseBreakdown(ctx.business_id, branchId, from, to),
    queryFn:  async () => {
      const r = await getExpenseBreakdown(ctx, { from_date: from, to_date: to, branch_id: branchId });
      if (!r.success) throw new Error(r.error?.message);
      return r.data!;
    },
    staleTime: 2 * 60_000,
  });
}

// Bare queryClient reference for invalidation helpers
const queryClient = new (require('@tanstack/react-query').QueryClient)();
