import { listSales } from './salesService'
import { getFinancialSummaryForRange, getCashLedger, getCashInHandBreakdown } from './accountingService'
import type { FinancialSummary } from '../types/accounting'

// ---------- Daily Summary (IMC-SRS-018) ----------
// "Reports reconcile across modules." Guaranteed by construction, the
// same way Monthly and Annual Summary are: every function here calls
// the exact same accountingService functions the main Dashboard,
// Monthly Summary, and Annual Summary already call, just scoped to a
// single day instead of a month or a year. One COGS calculation for
// the whole app, used everywhere, at every timescale.

export function getDayRange(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00`)
  const end = new Date(`${dateStr}T23:59:59.999`)
  return { start, end }
}

export function todayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export async function getDailyFinancials(dateStr: string): Promise<FinancialSummary> {
  const { start, end } = getDayRange(dateStr)
  return getFinancialSummaryForRange(start, end)
}

export interface DailySalesSummary {
  totalSalesUgx: number
  transactionCount: number
  averageSaleUgx: number
}

export async function getDailySalesSummary(dateStr: string): Promise<DailySalesSummary> {
  const { start, end } = getDayRange(dateStr)
  const sales = await listSales()
  const inDay = sales.filter(
    (s) => s.status === 'completed' && new Date(s.createdAt).getTime() >= start.getTime() && new Date(s.createdAt).getTime() <= end.getTime(),
  )
  const totalSalesUgx = inDay.reduce((sum, s) => sum + s.totalAmount, 0)
  return {
    totalSalesUgx,
    transactionCount: inDay.length,
    averageSaleUgx: inDay.length > 0 ? Math.round(totalSalesUgx / inDay.length) : 0,
  }
}

export interface DailyCashSummary {
  cashReceivedUgx: number
  cashPaidOutUgx: number
  netCashFlowUgx: number
  cashInHandUgx: number // "Cash in Hand is independent of Profit" - a running balance, not scoped to the day, shown alongside the day's flow
}

export async function getDailyCashSummary(dateStr: string): Promise<DailyCashSummary> {
  const { start, end } = getDayRange(dateStr)
  const [ledger, breakdown] = await Promise.all([getCashLedger(), getCashInHandBreakdown()])
  const inDay = ledger.filter((e) => new Date(e.date).getTime() >= start.getTime() && new Date(e.date).getTime() <= end.getTime())

  const cashReceivedUgx = inDay.filter((e) => e.direction === 'in').reduce((sum, e) => sum + e.amountUgx, 0)
  const cashPaidOutUgx = inDay.filter((e) => e.direction === 'out').reduce((sum, e) => sum + e.amountUgx, 0)

  return {
    cashReceivedUgx,
    cashPaidOutUgx,
    netCashFlowUgx: cashReceivedUgx - cashPaidOutUgx,
    cashInHandUgx: breakdown.cashInHandUgx,
  }
}
