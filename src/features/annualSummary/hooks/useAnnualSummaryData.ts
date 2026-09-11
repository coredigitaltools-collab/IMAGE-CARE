import { useQuery } from '@tanstack/react-query'
import { useUserContext } from '../../../context/AppContext'
import { getDashboardKPIs, getTopProducts, type TopProductRow as RealTopProductRow } from '../../../services/reporting/reportingService'
import { listCashTransactions } from '../../../services/financial/financialServices'
import { listBranches as listBranchesReal } from '../../../services/masterData/masterDataService'
import { getCurrentSnapshot } from '../../../services/monthlySummaryService'
import type { AnnualSalesSummary, AnnualCashFlowSummary, AnnualBranchRow, YearOverYearComparison } from '../../../services/annualSummaryService'
import type { FinancialSummary } from '../../../types/accounting'
import type { DashboardKPIs, CashTransaction, UUID } from '../../../types/database'
import type { UserContext } from '../../../types/app'
import type { SupportedCurrency } from '../../../lib/currency'

// Same unwrap() shape as src/features/invoices/hooks/useInvoicesData.ts and
// src/features/accounting/hooks/useAccountingData.ts: throws on a
// ServiceResponse error, unwraps a PagedResponse's `.items`, otherwise
// returns `.data` as-is.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error')
  const d = r.data
  if (d === null || d === undefined) return []
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string, unknown>).items))
    return (d as Record<string, unknown>).items
  return d
}

// ---------------------------------------------------------------------------
// Mapping: real reporting-engine rows -> the local shapes the annualSummary
// pages already render against (AnnualSalesSummary, AnnualCashFlowSummary,
// AnnualBranchRow, FinancialSummary, YearOverYearComparison - all defined in
// src/services/annualSummaryService.ts / src/types/accounting.ts, since this
// module has no separate src/types/annualSummary.ts). Every real hook below
// scopes to the whole business (branchId undefined), never the caller's
// active branch: the original local functions (getAnnualFinancials,
// getAnnualSalesSummary, ...) always aggregated across every branch, and
// none of the annualSummary pages expose a branch selector, so silently
// scoping to whatever branch happens to be active elsewhere in the app
// would change what these numbers mean out from under the page. Per-branch
// figures are only ever produced explicitly, in useAnnualBranchComparison.
// ---------------------------------------------------------------------------

// Matches the from/to construction useAnnualSummary (SRS-017, useModuleHooks.ts)
// already uses for this exact spec section - kept identical here so the two
// real code paths agree on what "year N" means.
function yearRangeIso(year: number): { from: string; to: string } {
  return {
    from: new Date(year, 0, 1).toISOString(),
    to: new Date(year, 11, 31, 23, 59, 59).toISOString(),
  }
}

async function fetchAnnualFinancials(ctx: UserContext, year: number): Promise<FinancialSummary> {
  const { from, to } = yearRangeIso(year)
  const kpis = (await getDashboardKPIs(ctx, undefined, { from, to }).then(unwrap)) as DashboardKPIs
  return {
    salesUgx: kpis.revenue,
    cogsUgx: kpis.cogs,
    grossProfitUgx: kpis.gross_profit,
    expensesUgx: kpis.expenses,
    netProfitUgx: kpis.net_profit,
  }
}

// DB enum for cash_transactions.transaction_type is 'cash_in' | 'cash_out' |
// 'deposit' | 'withdrawal' | 'transfer' (see cashEngine.ts). Same convention
// useAccountingData.ts's directionFor() uses for the real Cash Flow module -
// duplicated locally (rather than imported) so this file stays self-
// contained, matching useInvoicesData.ts's style.
function directionFor(transactionType: string): 'in' | 'out' {
  return transactionType === 'cash_in' || transactionType === 'deposit' ? 'in' : 'out'
}

// Real DB `branches` row (see types/database.ts Branch) - masterDataService's
// listBranches() types its return as the *local* settings.ts BranchRecord
// (name/code/address/phone only) but the query is `select('*')` against the
// real table, so `is_active` is present on the actual row even though it
// isn't on that declared type. Cast to this narrower shape for the fields
// actually used here.
interface DbBranchRow {
  id: UUID
  name: string
  is_active: boolean
}

// ---------------------------------------------------------------------------
// Real, Supabase-backed hooks
// ---------------------------------------------------------------------------

export function useAnnualFinancials(year: number) {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['annual-summary', 'financials', year, ctx.business_id],
    queryFn: () => fetchAnnualFinancials(ctx, year),
  })
}

export function useAnnualSalesSummary(year: number) {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['annual-summary', 'sales', year, ctx.business_id],
    queryFn: async (): Promise<AnnualSalesSummary> => {
      const { from, to } = yearRangeIso(year)
      // Total revenue/transaction-count come from the same dashboard-KPI
      // aggregate useAnnualFinancials uses, not a resummed getSalesByPeriod
      // (also real, but its monthly buckets aren't consumed by this page's
      // shape - see comment block above).
      const [kpis, topProducts] = await Promise.all([
        getDashboardKPIs(ctx, undefined, { from, to }).then(unwrap) as Promise<DashboardKPIs>,
        getTopProducts(ctx, { from_date: from, to_date: to, limit: 10, branch_id: undefined }).then(unwrap) as Promise<RealTopProductRow[]>,
      ])

      const totalSalesUgx = kpis.revenue
      const transactionCount = kpis.sale_count

      return {
        totalSalesUgx,
        transactionCount,
        averageSaleUgx: transactionCount > 0 ? Math.round(totalSalesUgx / transactionCount) : 0,
        topProducts: topProducts.map((p) => ({
          productId: p.product_id,
          productName: p.product_name,
          unitsSold: p.total_qty,
          revenueUgx: p.total_revenue,
        })),
      }
    },
  })
}

export function useAnnualCashFlowSummary(year: number) {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['annual-summary', 'cash-flow', year, ctx.business_id],
    queryFn: async (): Promise<AnnualCashFlowSummary> => {
      const { from, to } = yearRangeIso(year)
      // getCashPosition (used by the real Cash Flow module) has no date
      // range - it's an as-of-now snapshot, not a per-year figure, so it
      // can't honestly answer "cash received/paid in year N" for any year
      // but the current one. listCashTransactions does take a date filter,
      // so the year total is built from real transaction rows instead, the
      // same way useAccountingData.ts's useCashLedger does.
      // Single page (page_size 200, same cap useInvoicesData.ts uses) - see
      // docs/MODULE_INTEGRATION_MAP.md gap for full cursor pagination.
      const rows = (await listCashTransactions(ctx, { date: { from, to } }, { page_size: 200 }).then(unwrap)) as CashTransaction[]

      const cashReceivedUgx = rows.filter((r) => directionFor(r.transaction_type) === 'in').reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0)
      const cashPaidOutUgx = rows.filter((r) => directionFor(r.transaction_type) === 'out').reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0)

      return { cashReceivedUgx, cashPaidOutUgx, netCashFlowUgx: cashReceivedUgx - cashPaidOutUgx }
    },
  })
}

export function useAnnualBranchComparison(year: number) {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['annual-summary', 'branches', year, ctx.business_id],
    queryFn: async (): Promise<AnnualBranchRow[]> => {
      const { from, to } = yearRangeIso(year)
      const branches = (await listBranchesReal(ctx).then(unwrap)) as DbBranchRow[]
      const active = branches.filter((b) => b.is_active)

      // getDashboardKPIs with branch_id undefined only gives one combined
      // total across every branch (see useBranchOverview, SRS-020) - it
      // can't split by branch. A genuine per-branch breakdown means calling
      // it once per branch with that branch's own id, same real RPC every
      // other hook in this file uses.
      const rows = await Promise.all(
        active.map(async (branch) => {
          const kpis = (await getDashboardKPIs(ctx, branch.id, { from, to }).then(unwrap)) as DashboardKPIs
          return {
            branchId: branch.id,
            branchName: branch.name,
            salesUgx: kpis.revenue,
            transactionCount: kpis.sale_count,
          }
        }),
      )

      return rows.sort((a, b) => b.salesUgx - a.salesUgx)
    },
  })
}

export function useYearOverYearComparison(year: number) {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['annual-summary', 'yoy', year, ctx.business_id],
    queryFn: async (): Promise<YearOverYearComparison> => {
      const [current, previous] = await Promise.all([fetchAnnualFinancials(ctx, year), fetchAnnualFinancials(ctx, year - 1)])

      // Simple arithmetic on the two real FinancialSummary objects above -
      // no separate service call, nothing fabricated. null means "previous
      // year had nothing to compare against", never a fabricated 0%,
      // matching the original local getYearOverYearComparison's contract
      // (and the "No baseline" case YearOverYearPage.tsx already renders).
      const percentChange = (curr: number, prev: number): number | null => {
        if (prev === 0) return curr === 0 ? 0 : null
        return Math.round(((curr - prev) / Math.abs(prev)) * 100)
      }

      return {
        currentYear: year,
        previousYear: year - 1,
        current,
        previous,
        changePercent: {
          salesUgx: percentChange(current.salesUgx, previous.salesUgx),
          cogsUgx: percentChange(current.cogsUgx, previous.cogsUgx),
          grossProfitUgx: percentChange(current.grossProfitUgx, previous.grossProfitUgx),
          expensesUgx: percentChange(current.expensesUgx, previous.expensesUgx),
          netProfitUgx: percentChange(current.netProfitUgx, previous.netProfitUgx),
        },
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Local-only hooks - no real backend service exists for this operation yet.
// ---------------------------------------------------------------------------

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
// Cash in Hand, Outstanding Credit, and Inventory Value are running
// balances, exactly the same "as of now" snapshot Monthly Summary already
// reads. getCurrentSnapshot() itself composes getCashInHandBreakdown(),
// getCreditDashboardKpis(), and getStockSummaryDashboardKpis() - all still
// local/IndexedDB-backed - so this stays local rather than fabricating a
// partial real substitute for only some of those three.
export function useCurrentSnapshotForAnnual(currency: SupportedCurrency) {
  return useQuery({ queryKey: ['annual-summary', 'snapshot', currency], queryFn: () => getCurrentSnapshot(currency) })
}
