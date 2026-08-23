import { useQuery } from '@tanstack/react-query'
import { useUserContext, useActiveBranch } from '../../../context/AppContext'
import {
  getDashboardKPIs,
  getSalesByPeriod,
  getTopProducts,
  getStockSummary,
  getCashPosition,
  getOutstandingCredit,
} from '../../../services/reporting/reportingService'
import { listCashTransactions } from '../../../services/financial/financialServices'
import { supabase } from '../../../lib/supabase'
import type { SalesByPeriodRow, TopProductRow as RealTopProductRow, CashPosition, CreditSummaryRow } from '../../../services/reporting/reportingService'
import type {
  MonthlySalesSummary,
  TopProductRow as LocalTopProductRow,
  MonthlyCashFlowSummary,
  MonthlyBranchRow,
  CurrentSnapshot,
} from '../../../services/monthlySummaryService'
import type { SupportedCurrency } from '../../../lib/currency'
import type { FinancialSummary } from '../../../types/accounting'
import type { DashboardKPIs, StockSummaryRow, CashTransaction, UUID, Branch } from '../../../types/database'

// Same unwrap() shape as src/features/invoices/hooks/useInvoicesData.ts and
// src/features/accounting/hooks/useAccountingData.ts: throws on a
// ServiceResponse/ApiResult error, unwraps a PagedResponse's `.items`,
// otherwise returns `.data` as-is.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error');
  const d = r.data;
  if (d === null || d === undefined) return [];
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string, unknown>).items))
    return (d as Record<string, unknown>).items;
  return d;
}

// ---------------------------------------------------------------------------
// monthStr ("YYYY-MM", from useSelectedMonth) -> the ISO from/to range the
// real reporting RPCs take. Same start/end-of-month arithmetic as
// useMonthlySummary() in src/hooks/modules/useModuleHooks.ts (SRS-016),
// just driven off a "YYYY-MM" string instead of separate year/month args.
// ---------------------------------------------------------------------------
function monthRangeIso(monthStr: string): { from: string; to: string } {
  const [year, month] = monthStr.split('-').map(Number);
  const from = new Date(year, month - 1, 1).toISOString();
  const to = new Date(year, month, 0, 23, 59, 59).toISOString();
  return { from, to };
}

// cash_transactions.transaction_type per src/engines/types.ts is
// 'cash_in' | 'cash_out' | 'deposit' | 'withdrawal' | 'transfer'. Same
// direction convention as directionFor() in
// src/features/accounting/hooks/useAccountingData.ts, kept local here
// rather than importing (that helper isn't exported).
function directionFor(transactionType: string): 'in' | 'out' {
  return transactionType === 'cash_in' || transactionType === 'deposit' ? 'in' : 'out';
}

function mapFinancialSummary(kpis: DashboardKPIs): FinancialSummary {
  return {
    salesUgx: kpis.revenue,
    cogsUgx: kpis.cogs,
    grossProfitUgx: kpis.gross_profit,
    expensesUgx: kpis.expenses,
    netProfitUgx: kpis.net_profit,
  };
}

// ---------------------------------------------------------------------------
// Real, Supabase-backed hooks
//
// Every export below is real for this module: getDashboardKPIs,
// getSalesByPeriod, getTopProducts, getStockSummary, getCashPosition and
// getOutstandingCredit (all reportingService.ts, backed by the DB-003/DB-006
// RPCs / views) plus financialServices.listCashTransactions cover every
// figure the Monthly Summary pages render. There is no LOCAL-ONLY block in
// this file - unlike invoices, nothing here has a real-backend gap.
// ---------------------------------------------------------------------------

export function useMonthlyFinancials(monthStr: string) {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  return useQuery({
    queryKey: ['monthly-summary', 'financials', monthStr, ctx.business_id, branch],
    queryFn: async (): Promise<FinancialSummary> => {
      const { from, to } = monthRangeIso(monthStr)
      const kpis = (await getDashboardKPIs(ctx, branch ?? undefined, { from, to }).then(unwrap)) as DashboardKPIs
      return mapFinancialSummary(kpis)
    },
  })
}

export function useMonthlySalesSummary(monthStr: string) {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  return useQuery({
    queryKey: ['monthly-summary', 'sales', monthStr, ctx.business_id, branch],
    queryFn: async (): Promise<MonthlySalesSummary> => {
      const { from, to } = monthRangeIso(monthStr)
      const [periodRows, topRows] = await Promise.all([
        getSalesByPeriod(ctx, { from_date: from, to_date: to, group_by: 'day', branch_id: branch ?? undefined }).then(unwrap) as Promise<SalesByPeriodRow[]>,
        // Same top-5 cutoff the old local implementation used (slice(0, 5)).
        getTopProducts(ctx, { from_date: from, to_date: to, limit: 5, branch_id: branch ?? undefined }).then(unwrap) as Promise<RealTopProductRow[]>,
      ])

      const totalSalesUgx = periodRows.reduce((sum, r) => sum + r.total_revenue, 0)
      const transactionCount = periodRows.reduce((sum, r) => sum + r.sale_count, 0)
      const topProducts: LocalTopProductRow[] = topRows.map((r) => ({
        productId: r.product_id,
        productName: r.product_name,
        unitsSold: r.total_qty,
        revenueUgx: r.total_revenue,
      }))

      return {
        totalSalesUgx,
        transactionCount,
        averageSaleUgx: transactionCount > 0 ? Math.round(totalSalesUgx / transactionCount) : 0,
        topProducts,
      }
    },
  })
}

export function useMonthlyCashFlowSummary(monthStr: string) {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  return useQuery({
    queryKey: ['monthly-summary', 'cash-flow', monthStr, ctx.business_id, branch],
    queryFn: async (): Promise<MonthlyCashFlowSummary> => {
      const { from, to } = monthRangeIso(monthStr)
      // getCashPosition (used for the "as of now" snapshot below) has no
      // date-range parameter, so it can't give a month-scoped figure - the
      // month-scoped cash_transactions rows are queried and classified
      // in/out directly instead, same source financialServices.listCashTransactions
      // draws on elsewhere (useAccountingData.ts, useBankReconciliation).
      const rows = (await listCashTransactions(ctx, { branch_id: branch ?? undefined, date: { from, to } }, { page_size: 200 }).then(
        unwrap,
      )) as CashTransaction[]

      const cashReceivedUgx = rows.filter((r) => directionFor(r.transaction_type) === 'in').reduce((sum, r) => sum + Number(r.amount), 0)
      const cashPaidOutUgx = rows.filter((r) => directionFor(r.transaction_type) === 'out').reduce((sum, r) => sum + Number(r.amount), 0)

      return { cashReceivedUgx, cashPaidOutUgx, netCashFlowUgx: cashReceivedUgx - cashPaidOutUgx }
    },
  })
}

export function useMonthlyBranchComparison(monthStr: string) {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['monthly-summary', 'branches', monthStr, ctx.business_id],
    queryFn: async (): Promise<MonthlyBranchRow[]> => {
      const { from, to } = monthRangeIso(monthStr)
      const branchIds = ctx.branches.map((b) => b.branch_id)
      if (branchIds.length === 0) return []

      // UserContext.branches only carries {branch_id, can_transact} - no
      // name - so branch names are fetched directly here, same as
      // attachCustomerNames() does for customer names in
      // useInvoicesData.ts.
      const { data } = await supabase
        .schema('imagecare')
        .from('branches')
        .select('id, name, is_active')
        .eq('business_id', ctx.business_id)
        .in('id', branchIds)
      const activeBranches = ((data ?? []) as Pick<Branch, 'id' | 'name' | 'is_active'>[]).filter((b) => b.is_active)

      const kpisPerBranch = await Promise.all(
        activeBranches.map((b) => getDashboardKPIs(ctx, b.id as UUID, { from, to }).then(unwrap) as Promise<DashboardKPIs>),
      )

      return activeBranches
        .map((b, i) => ({
          branchId: b.id,
          branchName: b.name,
          salesUgx: kpisPerBranch[i].revenue,
          transactionCount: kpisPerBranch[i].sale_count,
        }))
        .sort((a, b) => b.salesUgx - a.salesUgx)
    },
  })
}

export function useCurrentSnapshot(currency: SupportedCurrency) {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  return useQuery({
    // currency isn't a query parameter for any of the three real calls below
    // (their figures are already in the business's base currency); kept in
    // the key/signature only for compatibility with callers.
    queryKey: ['monthly-summary', 'snapshot', currency, ctx.business_id, branch],
    queryFn: async (): Promise<CurrentSnapshot> => {
      const [cashPosition, creditRows, stockRows] = await Promise.all([
        getCashPosition(ctx, branch ?? undefined).then(unwrap) as Promise<CashPosition>,
        getOutstandingCredit(ctx, branch ?? undefined).then(unwrap) as Promise<CreditSummaryRow[]>,
        getStockSummary(ctx, branch ?? undefined).then(unwrap) as Promise<StockSummaryRow[]>,
      ])

      return {
        cashInHandUgx: cashPosition.net_position,
        outstandingCreditUgx: creditRows.reduce((sum, r) => sum + r.credit_balance, 0),
        inventoryValueUgx: stockRows.reduce((sum, r) => sum + r.stock_value, 0),
        lowStockCount: stockRows.filter((r) => r.stock_status === 'low_stock').length,
        outOfStockCount: stockRows.filter((r) => r.stock_status === 'out_of_stock').length,
      }
    },
  })
}
