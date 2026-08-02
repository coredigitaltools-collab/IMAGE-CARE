import { listSales } from './salesService'
import { listBranches } from './branchService'
import { getFinancialSummaryForRange, getCashInHandBreakdown, getCashLedger } from './accountingService'
import { getCreditDashboardKpis } from './creditService'
import { getStockSummaryDashboardKpis } from './stockSummaryService'
import type { FinancialSummary } from '../types/accounting'
import type { SupportedCurrency } from '../lib/currency'

// ---------- Monthly Summary (IMC-SRS-016) ----------
// "Use the shared accounting engine. Reports must reconcile across
// modules." Every function here calls straight into the same service
// each source module already uses; nothing is recomputed a second way.

export function getMonthRange(monthStr: string): { start: Date; end: Date } {
  const [year, month] = monthStr.split('-').map(Number)
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const end = new Date(year, month, 0, 23, 59, 59, 999)
  return { start, end }
}

export function currentMonthStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export async function getMonthlyFinancials(monthStr: string): Promise<FinancialSummary> {
  const { start, end } = getMonthRange(monthStr)
  return getFinancialSummaryForRange(start, end)
}

export interface TopProductRow {
  productId: string
  productName: string
  unitsSold: number
  revenueUgx: number
}

export interface MonthlySalesSummary {
  totalSalesUgx: number
  transactionCount: number
  averageSaleUgx: number
  topProducts: TopProductRow[]
}

export async function getMonthlySalesSummary(monthStr: string): Promise<MonthlySalesSummary> {
  const { start, end } = getMonthRange(monthStr)
  const sales = await listSales()
  const inMonth = sales.filter(
    (s) => s.status === 'completed' && new Date(s.createdAt).getTime() >= start.getTime() && new Date(s.createdAt).getTime() <= end.getTime(),
  )

  const totalSalesUgx = inMonth.reduce((sum, s) => sum + s.totalAmount, 0)
  const transactionCount = inMonth.length

  const byProduct = new Map<string, TopProductRow>()
  for (const sale of inMonth) {
    for (const item of sale.items) {
      const existing = byProduct.get(item.productId) ?? { productId: item.productId, productName: item.productName, unitsSold: 0, revenueUgx: 0 }
      existing.unitsSold += item.quantity
      existing.revenueUgx += item.lineTotal
      byProduct.set(item.productId, existing)
    }
  }
  const topProducts = [...byProduct.values()].sort((a, b) => b.revenueUgx - a.revenueUgx).slice(0, 5)

  return {
    totalSalesUgx,
    transactionCount,
    averageSaleUgx: transactionCount > 0 ? Math.round(totalSalesUgx / transactionCount) : 0,
    topProducts,
  }
}

export interface MonthlyCashFlowSummary {
  cashReceivedUgx: number
  cashPaidOutUgx: number
  netCashFlowUgx: number
}

export async function getMonthlyCashFlowSummary(monthStr: string): Promise<MonthlyCashFlowSummary> {
  const { start, end } = getMonthRange(monthStr)
  const ledger = await getCashLedger()
  const inMonth = ledger.filter((e) => new Date(e.date).getTime() >= start.getTime() && new Date(e.date).getTime() <= end.getTime())

  const cashReceivedUgx = inMonth.filter((e) => e.direction === 'in').reduce((sum, e) => sum + e.amountUgx, 0)
  const cashPaidOutUgx = inMonth.filter((e) => e.direction === 'out').reduce((sum, e) => sum + e.amountUgx, 0)

  return { cashReceivedUgx, cashPaidOutUgx, netCashFlowUgx: cashReceivedUgx - cashPaidOutUgx }
}

export interface MonthlyBranchRow {
  branchId: string
  branchName: string
  salesUgx: number
  transactionCount: number
}

export async function getMonthlyBranchComparison(monthStr: string): Promise<MonthlyBranchRow[]> {
  const { start, end } = getMonthRange(monthStr)
  const [sales, branches] = await Promise.all([listSales(), listBranches()])
  const inMonth = sales.filter(
    (s) => s.status === 'completed' && new Date(s.createdAt).getTime() >= start.getTime() && new Date(s.createdAt).getTime() <= end.getTime(),
  )

  return branches
    .filter((b) => b.is_active)
    .map((branch) => {
      const branchSales = inMonth.filter((s) => s.branchId === branch.id)
      return {
        branchId: branch.id,
        branchName: branch.name,
        salesUgx: branchSales.reduce((sum, s) => sum + s.totalAmount, 0),
        transactionCount: branchSales.length,
      }
    })
    .sort((a, b) => b.salesUgx - a.salesUgx)
}

// ---------- Current snapshot ----------
// Cash in Hand, Outstanding Credit, and Inventory Value are running
// balances, not month-scoped totals, exactly like they are everywhere
// else in the app. Presented alongside the monthly figures as "as of
// now," never mislabeled as belonging to the selected month.

export interface CurrentSnapshot {
  cashInHandUgx: number
  outstandingCreditUgx: number
  inventoryValueUgx: number
  lowStockCount: number
  outOfStockCount: number
}

export async function getCurrentSnapshot(currency: SupportedCurrency): Promise<CurrentSnapshot> {
  const [cashBreakdown, creditKpis, stockKpis] = await Promise.all([
    getCashInHandBreakdown(),
    getCreditDashboardKpis(),
    getStockSummaryDashboardKpis(currency),
  ])
  return {
    cashInHandUgx: cashBreakdown.cashInHandUgx,
    outstandingCreditUgx: creditKpis.totalOutstandingUgx,
    inventoryValueUgx: stockKpis.totalInventoryValue,
    lowStockCount: stockKpis.lowStockCount,
    outOfStockCount: stockKpis.outOfStockCount,
  }
}
