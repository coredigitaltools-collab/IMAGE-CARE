import { listProducts } from './productService'
import { listMovements } from './stockService'
import { convertFromUgx, type SupportedCurrency } from '../lib/currency'
import type { Product } from '../types/inventory'

export interface ValuationRow {
  product: Product
  stockValue: number
  potentialSaleValue: number
}
export async function getValuationReport(currency: SupportedCurrency): Promise<ValuationRow[]> {
  const products = (await listProducts()).filter((p) => p.status === 'active')
  return products
    .map((product) => ({
      product,
      stockValue: convertFromUgx(product.buyingPrice * product.currentStock, currency),
      potentialSaleValue: convertFromUgx(product.sellingPrice * product.currentStock, currency),
    }))
    .sort((a, b) => b.stockValue - a.stockValue)
}

export async function getStockLevelsReport(): Promise<Product[]> {
  const products = await listProducts()
  return products.filter((p) => p.status === 'active').sort((a, b) => a.name.localeCompare(b.name))
}

export async function getLowStockReport(): Promise<Product[]> {
  const products = await listProducts()
  return products
    .filter((p) => p.status === 'active' && p.currentStock > 0 && p.currentStock <= p.reorderLevel)
    .sort((a, b) => a.currentStock - b.currentStock)
}

export async function getOutOfStockReport(): Promise<Product[]> {
  const products = await listProducts()
  return products.filter((p) => p.status === 'active' && p.currentStock === 0)
}

export interface DeadStockRow {
  product: Product
  daysSinceLastMovement: number | null
}
/** "Dead stock": active products holding stock with no movement at all in
 *  the window (beyond their original opening entry). */
export async function getDeadStockReport(windowDays = 30): Promise<DeadStockRow[]> {
  const [products, movements] = await Promise.all([listProducts(), listMovements()])
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000

  return products
    .filter((p) => p.status === 'active' && p.currentStock > 0)
    .map((product) => {
      const productMovements = movements
        .filter((m) => m.productId === product.id && m.type !== 'opening')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      const last = productMovements[0]
      const daysSinceLastMovement = last ? Math.floor((Date.now() - new Date(last.createdAt).getTime()) / 86_400_000) : null
      return { product, daysSinceLastMovement }
    })
    .filter((row) => row.daysSinceLastMovement === null || new Date(Date.now() - row.daysSinceLastMovement * 86_400_000).getTime() < cutoff)
    .sort((a, b) => (b.daysSinceLastMovement ?? Infinity) - (a.daysSinceLastMovement ?? Infinity))
}

export interface MovementRankRow {
  product: Product
  unitsMoved: number
}
/** Fast/slow moving ranks products by total units sold in the window.
 *  Until the Sales module exists there are no 'sale' movements yet, so
 *  every product legitimately shows 0, that's accurate, not a bug. */
export async function getFastSlowMovingReport(windowDays = 30): Promise<{ fast: MovementRankRow[]; slow: MovementRankRow[] }> {
  const [products, movements] = await Promise.all([listProducts(), listMovements()])
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000

  const rows: MovementRankRow[] = products
    .filter((p) => p.status === 'active')
    .map((product) => {
      const unitsMoved = movements
        .filter((m) => m.productId === product.id && m.type === 'sale' && new Date(m.createdAt).getTime() >= cutoff)
        .reduce((sum, m) => sum + Math.abs(m.quantityChange), 0)
      return { product, unitsMoved }
    })

  const sorted = [...rows].sort((a, b) => b.unitsMoved - a.unitsMoved)
  return { fast: sorted.slice(0, 10), slow: [...sorted].reverse().slice(0, 10) }
}

export interface ProfitabilityRow {
  product: Product
  marginPercent: number
  potentialProfit: number
}
export async function getProfitabilityReport(currency: SupportedCurrency): Promise<ProfitabilityRow[]> {
  const products = (await listProducts()).filter((p) => p.status === 'active')
  return products
    .map((product) => {
      const margin = product.sellingPrice > 0 ? ((product.sellingPrice - product.buyingPrice) / product.sellingPrice) * 100 : 0
      return {
        product,
        marginPercent: Math.round(margin * 10) / 10,
        potentialProfit: convertFromUgx((product.sellingPrice - product.buyingPrice) * product.currentStock, currency),
      }
    })
    .sort((a, b) => b.potentialProfit - a.potentialProfit)
}

// ---------- Inventory value trend ----------

export type TrendRange = '7d' | '30d' | '12m'
export interface TrendPoint {
  label: string
  value: number
}

/** Reconstructs inventory value (at cost) over time from real stock
 *  movement history, nothing here is fabricated. Every product's stock
 *  at a given moment is replayed from its movements up to that point
 *  (opening stock is itself a movement, so this covers a product's full
 *  life). For a fresh install this will legitimately look like a flat
 *  line that steps up once, that's accurate, not a bug; it fills in as
 *  more real activity accumulates. This recomputes on every call, which
 *  is fine at demo data volumes, a real deployment would want daily
 *  valuation snapshots instead of replaying full history each time. */
export async function getInventoryValueTrend(range: TrendRange, currency: SupportedCurrency): Promise<TrendPoint[]> {
  const [products, movements] = await Promise.all([listProducts(), listMovements()])
  const buyingPriceById = new Map(products.map((p) => [p.id, p.buyingPrice]))
  const sorted = [...movements].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  const valueAt = (cutoff: number): number => {
    const stockById = new Map<string, number>()
    for (const m of sorted) {
      if (new Date(m.createdAt).getTime() > cutoff) break
      stockById.set(m.productId, (stockById.get(m.productId) ?? 0) + m.quantityChange)
    }
    let total = 0
    for (const [productId, qty] of stockById) {
      total += (buyingPriceById.get(productId) ?? 0) * Math.max(qty, 0)
    }
    return convertFromUgx(total, currency)
  }

  const now = Date.now()
  const points: TrendPoint[] = []

  if (range === '7d' || range === '30d') {
    const days = range === '7d' ? 7 : 30
    for (let i = days - 1; i >= 0; i--) {
      const cutoff = now - i * 86_400_000
      points.push({ label: new Date(cutoff).toLocaleDateString('en-UG', { day: 'numeric', month: 'short' }), value: valueAt(cutoff) })
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now)
      d.setMonth(d.getMonth() - i, 28)
      points.push({ label: d.toLocaleDateString('en-UG', { month: 'short' }), value: valueAt(d.getTime()) })
    }
  }
  return points
}
