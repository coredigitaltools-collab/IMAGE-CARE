import { listSales } from './salesService'
import { listMovements } from './stockService'
import { getValuationReport } from './inventoryReportsService'
import type { SupportedCurrency } from '../lib/currency'
import type { BranchRecord } from '../types/settings'

// ---------- Branch Overview (IMC-SRS-020) ----------
// "Branch data aggregates automatically." Every figure here reads from
// Sales and Inventory the same way Stock Summary, Monthly Summary, and
// Annual Summary already do, just consolidated across every visible
// branch at once rather than scoped to one period or one branch.
// "Respect user permissions": callers pass in the branch list the
// current user is actually allowed to see (the same visibleBranches
// logic the main Dashboard and Inventory Dashboard use), this service
// never decides permissions itself.

export interface BranchOverviewRow {
  branchId: string
  branchName: string
  totalSalesUgx: number
  transactionCount: number
  stockInUnits: number
  stockOutUnits: number
}

export async function getBranchOverview(visibleBranches: BranchRecord[]): Promise<BranchOverviewRow[]> {
  const [sales, movements] = await Promise.all([listSales(), listMovements()])
  const completedSales = sales.filter((s) => s.status === 'completed')

  return visibleBranches.map((branch) => {
    const branchSales = completedSales.filter((s) => s.branchId === branch.id)
    const branchMovements = movements.filter((m) => m.branchId === branch.id)

    return {
      branchId: branch.id,
      branchName: branch.name,
      totalSalesUgx: branchSales.reduce((sum, s) => sum + s.totalAmount, 0),
      transactionCount: branchSales.length,
      stockInUnits: branchMovements.filter((m) => m.quantityChange > 0).reduce((sum, m) => sum + m.quantityChange, 0),
      stockOutUnits: branchMovements.filter((m) => m.quantityChange < 0).reduce((sum, m) => sum + Math.abs(m.quantityChange), 0),
    }
  })
}

export interface BranchOverviewDashboardKpis {
  branchCount: number
  totalSalesUgx: number
  bestBranchName: string | null
  totalInventoryValueUgx: number
}

// Inventory value is business-wide, not branch-scoped, in this app
// (Product.currentStock is a single number, the same honest limit
// Stock Summary's Branch Comparison already discloses). It is shown
// once here, not repeated per branch as if each branch had its own
// separate figure.
export async function getBranchOverviewDashboardKpis(
  visibleBranches: BranchRecord[],
  currency: SupportedCurrency,
): Promise<BranchOverviewDashboardKpis> {
  const [rows, valuation] = await Promise.all([getBranchOverview(visibleBranches), getValuationReport(currency)])
  const sorted = [...rows].sort((a, b) => b.totalSalesUgx - a.totalSalesUgx)

  return {
    branchCount: rows.length,
    totalSalesUgx: rows.reduce((sum, r) => sum + r.totalSalesUgx, 0),
    bestBranchName: sorted[0] && sorted[0].totalSalesUgx > 0 ? sorted[0].branchName : null,
    totalInventoryValueUgx: valuation.reduce((sum, row) => sum + row.stockValue, 0),
  }
}
