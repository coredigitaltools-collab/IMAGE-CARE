import { listSales } from './salesService'
import { listBranches } from './branchService'
import { getFinancialSummaryForRange, getCashLedger } from './accountingService'
import type { FinancialSummary } from '../types/accounting'

// ---------- Annual Summary (IMC-SRS-017) ----------
// "Reports must reconcile with Monthly and Daily summaries." That's
// guaranteed by construction here, not by careful bookkeeping: every
// function below calls the exact same underlying engine functions
// Monthly Summary and the main Dashboard already call
// (getFinancialSummaryForRange, getCashLedger, listSales, listBranches),
// just with a year-wide range instead of a month or a day. There is
// still only one COGS calculation in the whole app.

export function getYearRange(year: number): { start: Date; end: Date } {
  const start = new Date(year, 0, 1, 0, 0, 0, 0)
  const end = new Date(year, 11, 31, 23, 59, 59, 999)
  return { start, end }
}

export function currentYear(): number {
  return new Date().getFullYear()
}

export async function getAnnualFinancials(year: number): Promise<FinancialSummary> {
  const { start, end } = getYearRange(year)
  return getFinancialSummaryForRange(start, end)
}

export interface TopProductRow {
  productId: string
  productName: string
  unitsSold: number
  revenueUgx: number
}

export interface AnnualSalesSummary {
  totalSalesUgx: number
  transactionCount: number
  averageSaleUgx: number
  topProducts: TopProductRow[]
}

export async function getAnnualSalesSummary(year: number): Promise<AnnualSalesSummary> {
  const { start, end } = getYearRange(year)
  const sales = await listSales()
  const inYear = sales.filter(
    (s) => s.status === 'completed' && new Date(s.createdAt).getTime() >= start.getTime() && new Date(s.createdAt).getTime() <= end.getTime(),
  )

  const totalSalesUgx = inYear.reduce((sum, s) => sum + s.totalAmount, 0)
  const transactionCount = inYear.length

  const byProduct = new Map<string, TopProductRow>()
  for (const sale of inYear) {
    for (const item of sale.items) {
      const existing = byProduct.get(item.productId) ?? { productId: item.productId, productName: item.productName, unitsSold: 0, revenueUgx: 0 }
      existing.unitsSold += item.quantity
      existing.revenueUgx += item.lineTotal
      byProduct.set(item.productId, existing)
    }
  }
  const topProducts = [...byProduct.values()].sort((a, b) => b.revenueUgx - a.revenueUgx).slice(0, 10)

  return {
    totalSalesUgx,
    transactionCount,
    averageSaleUgx: transactionCount > 0 ? Math.round(totalSalesUgx / transactionCount) : 0,
    topProducts,
  }
}

export interface AnnualCashFlowSummary {
  cashReceivedUgx: number
  cashPaidOutUgx: number
  netCashFlowUgx: number
}

export async function getAnnualCashFlowSummary(year: number): Promise<AnnualCashFlowSummary> {
  const { start, end } = getYearRange(year)
  const ledger = await getCashLedger()
  const inYear = ledger.filter((e) => new Date(e.date).getTime() >= start.getTime() && new Date(e.date).getTime() <= end.getTime())

  const cashReceivedUgx = inYear.filter((e) => e.direction === 'in').reduce((sum, e) => sum + e.amountUgx, 0)
  const cashPaidOutUgx = inYear.filter((e) => e.direction === 'out').reduce((sum, e) => sum + e.amountUgx, 0)

  return { cashReceivedUgx, cashPaidOutUgx, netCashFlowUgx: cashReceivedUgx - cashPaidOutUgx }
}

export interface AnnualBranchRow {
  branchId: string
  branchName: string
  salesUgx: number
  transactionCount: number
}

export async function getAnnualBranchComparison(year: number): Promise<AnnualBranchRow[]> {
  const { start, end } = getYearRange(year)
  const [sales, branches] = await Promise.all([listSales(), listBranches()])
  const inYear = sales.filter(
    (s) => s.status === 'completed' && new Date(s.createdAt).getTime() >= start.getTime() && new Date(s.createdAt).getTime() <= end.getTime(),
  )

  return branches
    .filter((b) => b.is_active)
    .map((branch) => {
      const branchSales = inYear.filter((s) => s.branchId === branch.id)
      return {
        branchId: branch.id,
        branchName: branch.name,
        salesUgx: branchSales.reduce((sum, s) => sum + s.totalAmount, 0),
        transactionCount: branchSales.length,
      }
    })
    .sort((a, b) => b.salesUgx - a.salesUgx)
}

// ---------- Year-over-Year ----------

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null // null = "no prior-year baseline to compare against", never a fabricated percent
  return Math.round(((current - previous) / Math.abs(previous)) * 100)
}

export interface YearOverYearComparison {
  currentYear: number
  previousYear: number
  current: FinancialSummary
  previous: FinancialSummary
  changePercent: {
    salesUgx: number | null
    cogsUgx: number | null
    grossProfitUgx: number | null
    expensesUgx: number | null
    netProfitUgx: number | null
  }
}

export async function getYearOverYearComparison(year: number): Promise<YearOverYearComparison> {
  const [current, previous] = await Promise.all([getAnnualFinancials(year), getAnnualFinancials(year - 1)])
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
}
