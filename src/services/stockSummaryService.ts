import { listProducts } from './productService'
import { listMovements } from './stockService'
import { listBranches } from './branchService'
import { getValuationReport } from './inventoryReportsService'
import { convertFromUgx, type SupportedCurrency } from '../lib/currency'
import type { StockMovement } from '../types/inventory'

// ---------- Stock Summary (IMC-SRS-014) ----------
// "Use the shared inventory engine." Every figure here comes from the
// same Product records and StockMovement log that Inventory (IMP-003)
// already owns. This module never recomputes stock levels or valuation
// on its own; it reads the same data through a business-wide lens
// instead of the operational, per-product lens Inventory already gives.

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

export interface StockSummaryDashboardKpis {
  totalInventoryValue: number
  stockItemsCount: number
  lowStockCount: number
  outOfStockCount: number
  todaysStockIn: number
  todaysStockOut: number
}

export async function getStockSummaryDashboardKpis(currency: SupportedCurrency): Promise<StockSummaryDashboardKpis> {
  const [products, valuation, movements] = await Promise.all([listProducts(), getValuationReport(currency), listMovements()])
  const activeProducts = products.filter((p) => p.status === 'active')

  const todaysMovements = movements.filter((m) => isToday(m.createdAt))
  const todaysStockIn = todaysMovements.filter((m) => m.quantityChange > 0).reduce((sum, m) => sum + m.quantityChange, 0)
  const todaysStockOut = todaysMovements.filter((m) => m.quantityChange < 0).reduce((sum, m) => sum + Math.abs(m.quantityChange), 0)

  return {
    totalInventoryValue: valuation.reduce((sum, row) => sum + row.stockValue, 0),
    stockItemsCount: activeProducts.length,
    lowStockCount: activeProducts.filter((p) => p.currentStock > 0 && p.currentStock <= p.reorderLevel).length,
    outOfStockCount: activeProducts.filter((p) => p.currentStock <= 0).length,
    todaysStockIn,
    todaysStockOut,
  }
}

// ---------- Branch Comparison ----------
// Current stock quantity is tracked business-wide in this version of
// the app (Product.currentStock is a single number, not split per
// branch), so a like-for-like "stock on hand by branch" comparison
// isn't something the data actually supports yet. What is real and
// branch-tagged is movement activity: every StockMovement carries a
// branchId. Branch Comparison reports on that: how much stock moved in
// and out at each branch, and the value of it, rather than presenting a
// per-branch stock count the app doesn't genuinely have.

export interface BranchComparisonRow {
  branchId: string
  branchName: string
  stockInUnits: number
  stockOutUnits: number
  stockInValue: number
  stockOutValue: number
}

async function movementValue(movement: StockMovement, buyingPriceByProduct: Map<string, number>): Promise<number> {
  const price = buyingPriceByProduct.get(movement.productId) ?? 0
  return Math.abs(movement.quantityChange) * price
}

export async function getBranchComparison(currency: SupportedCurrency): Promise<BranchComparisonRow[]> {
  const [branches, movements, products] = await Promise.all([listBranches(), listMovements(), listProducts()])
  const activeBranches = branches.filter((b) => b.is_active)
  const buyingPriceByProduct = new Map(products.map((p) => [p.id, p.buyingPrice]))

  const rows: BranchComparisonRow[] = []
  for (const branch of activeBranches) {
    const branchMovements = movements.filter((m) => m.branchId === branch.id)
    const stockInMovements = branchMovements.filter((m) => m.quantityChange > 0)
    const stockOutMovements = branchMovements.filter((m) => m.quantityChange < 0)

    let stockInValueUgx = 0
    for (const m of stockInMovements) stockInValueUgx += await movementValue(m, buyingPriceByProduct)
    let stockOutValueUgx = 0
    for (const m of stockOutMovements) stockOutValueUgx += await movementValue(m, buyingPriceByProduct)

    rows.push({
      branchId: branch.id,
      branchName: branch.name,
      stockInUnits: stockInMovements.reduce((sum, m) => sum + m.quantityChange, 0),
      stockOutUnits: stockOutMovements.reduce((sum, m) => sum + Math.abs(m.quantityChange), 0),
      stockInValue: convertFromUgx(stockInValueUgx, currency),
      stockOutValue: convertFromUgx(stockOutValueUgx, currency),
    })
  }
  return rows.sort((a, b) => b.stockInValue + b.stockOutValue - (a.stockInValue + a.stockOutValue))
}

// ---------- Current Stock (condensed, read-only view) ----------
// Distinct in purpose from Inventory's Product Master list: this is an
// at-a-glance business summary, not a place to create or edit products.

export interface CurrentStockRow {
  id: string
  name: string
  sku: string
  currentStock: number
  reorderLevel: number
  status: 'ok' | 'low' | 'out'
}

function stockStatus(currentStock: number, reorderLevel: number): 'ok' | 'low' | 'out' {
  if (currentStock <= 0) return 'out'
  if (currentStock <= reorderLevel) return 'low'
  return 'ok'
}

export async function getCurrentStockSummary(): Promise<CurrentStockRow[]> {
  const products = await listProducts()
  return products
    .filter((p) => p.status === 'active')
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      currentStock: p.currentStock,
      reorderLevel: p.reorderLevel,
      status: stockStatus(p.currentStock, p.reorderLevel),
    }))
    .sort((a, b) => a.currentStock - b.currentStock)
}
