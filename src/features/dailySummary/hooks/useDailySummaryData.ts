import { useQuery } from '@tanstack/react-query'
import { useUserContext, useActiveBranch } from '../../../context/AppContext'
import { getDashboardKPIs, getCashPosition, getStockSummary } from '../../../services/reporting/reportingService'
import { listCashTransactions } from '../../../services/financial/financialServices'
import { startOfDay, endOfDay } from '../../../utils/formatters'
import type { DashboardKPIs, StockSummaryRow, CashTransaction } from '../../../types/database'
import type { FinancialSummary } from '../../../types/accounting'
import type { DailySalesSummary, DailyCashSummary } from '../../../services/dailySummaryService'
import type { SupportedCurrency } from '../../../lib/currency'

// Same unwrap() shape as src/features/invoices/hooks/useInvoicesData.ts: throws
// on a ServiceResponse error, unwraps a PagedResponse's `.items`, otherwise
// returns `.data` as-is.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error');
  const d = r.data;
  if (d === null || d === undefined) return [];
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string, unknown>).items))
    return (d as Record<string, unknown>).items;
  return d;
}

// dateStr comes from useSelectedDate() as 'YYYY-MM-DD'. Anchor it to local
// midnight (same construction DailyDashboardPage/DailyReportPage already use
// for their date label) and reuse the exact startOfDay/endOfDay helpers
// useModuleHooks.ts's useDailySummary (SRS-018) uses for this same range.
function dayRange(dateStr: string): { from: string; to: string } {
  const d = new Date(`${dateStr}T00:00:00`)
  return { from: startOfDay(d), to: endOfDay(d) }
}

// ---------------------------------------------------------------------------
// Mapping: real reportingService rows -> the local shapes the daily summary
// pages already render against. DashboardKPIs and DailySalesSummary/
// DailyCashSummary (still imported as types only, from the now-unused-here
// local service) are structurally simple enough that no bespoke local types
// were worth introducing for them - the shapes line up field-for-field.
// ---------------------------------------------------------------------------

function mapKpisToFinancials(kpis: DashboardKPIs): FinancialSummary {
  return {
    salesUgx: kpis.revenue,
    cogsUgx: kpis.cogs,
    grossProfitUgx: kpis.gross_profit,
    // Real DashboardKPIs also carries a separate `payroll` figure that the
    // local FinancialSummary shape has no field for; net_profit below
    // already nets it out server-side, but expensesUgx here is
    // non-payroll operating expenses only, same as the local
    // getFinancialSummaryForRange() this replaces - see
    // docs/MODULE_INTEGRATION_MAP.md gap.
    expensesUgx: kpis.expenses,
    netProfitUgx: kpis.net_profit,
  }
}

function directionFor(transactionType: string): 'in' | 'out' {
  return transactionType === 'cash_in' || transactionType === 'deposit' ? 'in' : 'out'
}

// Daily Inventory Summary just wants a current stock snapshot (the page's
// own copy: "Stock doesn't have a daily total, this is the current
// position, as of now"), not day-scoped movement, so getStockSummary's
// live vw_stock_summary rows are exactly what it needs - no bespoke
// inventory-movement endpoint required.
export interface DailyInventorySnapshot {
  inventoryValueUgx: number
  lowStockCount: number
  outOfStockCount: number
}

// ---------------------------------------------------------------------------
// Real, Supabase-backed hooks
// ---------------------------------------------------------------------------

export function useDailyFinancials(dateStr: string) {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  return useQuery({
    queryKey: ['daily-summary', 'financials', dateStr, ctx.business_id, branch],
    queryFn: async (): Promise<FinancialSummary> => {
      const { from, to } = dayRange(dateStr)
      const kpis = (await getDashboardKPIs(ctx, branch ?? undefined, { from, to }).then(unwrap)) as DashboardKPIs
      return mapKpisToFinancials(kpis)
    },
  })
}

export function useDailySalesSummary(dateStr: string) {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  return useQuery({
    queryKey: ['daily-summary', 'sales', dateStr, ctx.business_id, branch],
    queryFn: async (): Promise<DailySalesSummary> => {
      const { from, to } = dayRange(dateStr)
      const kpis = (await getDashboardKPIs(ctx, branch ?? undefined, { from, to }).then(unwrap)) as DashboardKPIs
      return {
        totalSalesUgx: kpis.revenue,
        transactionCount: kpis.sale_count,
        averageSaleUgx: kpis.sale_count > 0 ? Math.round(kpis.revenue / kpis.sale_count) : 0,
      }
    },
  })
}

export function useDailyCashSummary(dateStr: string) {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  return useQuery({
    queryKey: ['daily-summary', 'cash', dateStr, ctx.business_id, branch],
    queryFn: async (): Promise<DailyCashSummary> => {
      const { from, to } = dayRange(dateStr)
      // Received/paid-out are scoped to the selected day, same pattern as
      // useModuleHooks.ts's useCashFlow (SRS-015). Cash in hand is
      // deliberately NOT day-scoped - "Cash in Hand is independent of
      // Profit", a running balance as of now, from getCashPosition, same
      // as this page's own "as of now" label already says.
      const [txns, position] = await Promise.all([
        listCashTransactions(ctx, { branch_id: branch ?? undefined, date: { from, to } }, { page_size: 200 }).then(unwrap),
        getCashPosition(ctx, branch ?? undefined).then(unwrap),
      ])
      const rows = (Array.isArray(txns) ? txns : []) as CashTransaction[]
      const cashReceivedUgx = rows.filter((r) => directionFor(r.transaction_type) === 'in').reduce((sum, r) => sum + Number(r.amount), 0)
      const cashPaidOutUgx = rows.filter((r) => directionFor(r.transaction_type) === 'out').reduce((sum, r) => sum + Number(r.amount), 0)
      return {
        cashReceivedUgx,
        cashPaidOutUgx,
        netCashFlowUgx: cashReceivedUgx - cashPaidOutUgx,
        cashInHandUgx: typeof position?.net_position === 'number' ? position.net_position : 0,
      }
    },
  })
}

// Inventory value, low stock, and out of stock are running counts, the
// current live stock position - same as Monthly and Annual Summary's own
// (still-local) snapshot reads, just sourced from the real backend here.
// `currency` is kept for call-signature compatibility with those other
// modules' hooks, but the real vw_stock_summary view has no currency
// conversion - every call site passes 'UGX' today, so this is a
// same-behavior swap, not a silent narrowing - see
// docs/MODULE_INTEGRATION_MAP.md gap for multi-currency reporting.
export function useCurrentSnapshotForDaily(currency: SupportedCurrency) {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  return useQuery({
    queryKey: ['daily-summary', 'snapshot', currency, ctx.business_id, branch],
    queryFn: async (): Promise<DailyInventorySnapshot> => {
      const rows = (await getStockSummary(ctx, branch ?? undefined).then(unwrap)) as StockSummaryRow[]
      return {
        inventoryValueUgx: rows.reduce((sum, r) => sum + r.stock_value, 0),
        lowStockCount: rows.filter((r) => r.stock_status === 'low_stock').length,
        outOfStockCount: rows.filter((r) => r.stock_status === 'out_of_stock').length,
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Local-only hooks - no real backend service exists for these operations yet.
// ---------------------------------------------------------------------------
//
// None. Every export in this module (financials, sales, cash, and the
// current-stock snapshot) is backed by real reportingService/
// financialServices calls above - dailySummaryService.ts (IndexedDB-backed)
// is no longer called from this file.
