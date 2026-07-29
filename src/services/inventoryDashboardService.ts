import { listProducts } from './productService'
import { listCategories } from './categoryService'
import { listSuppliers } from './supplierService'
import { convertFromUgx, type SupportedCurrency } from '../lib/currency'
import type { InventoryKpis } from '../types/inventory'
import type { Product } from '../types/inventory'

export async function getInventoryKpis(reportingCurrency: SupportedCurrency): Promise<InventoryKpis> {
  const [products, categories, suppliers] = await Promise.all([listProducts(), listCategories(), listSuppliers()])
  const activeProducts = products.filter((p) => p.status === 'active')

  const inventoryValueUgx = activeProducts.reduce((sum, p) => sum + p.buyingPrice * p.currentStock, 0)
  const potentialProfitUgx = activeProducts.reduce(
    (sum, p) => sum + (p.sellingPrice - p.buyingPrice) * p.currentStock,
    0,
  )

  return {
    totalProducts: activeProducts.length,
    inventoryValue: convertFromUgx(inventoryValueUgx, reportingCurrency),
    potentialProfit: convertFromUgx(potentialProfitUgx, reportingCurrency),
    lowStockCount: activeProducts.filter((p) => p.currentStock > 0 && p.currentStock <= p.reorderLevel).length,
    outOfStockCount: activeProducts.filter((p) => p.currentStock === 0).length,
    categoriesCount: categories.filter((c) => c.is_active).length,
    suppliersCount: suppliers.filter((s) => s.status === 'active').length,
    currency: reportingCurrency,
  }
}

export interface ProductStatistics {
  mostExpensive: Product | null
  newest: Product | null
  averageMarginPercent: number
}

export async function getProductStatistics(): Promise<ProductStatistics> {
  const products = (await listProducts()).filter((p) => p.status === 'active')
  if (products.length === 0) {
    return { mostExpensive: null, newest: null, averageMarginPercent: 0 }
  }

  const mostExpensive = [...products].sort((a, b) => b.sellingPrice - a.sellingPrice)[0]
  const newest = [...products].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

  const margins = products
    .filter((p) => p.sellingPrice > 0)
    .map((p) => ((p.sellingPrice - p.buyingPrice) / p.sellingPrice) * 100)
  const averageMarginPercent = margins.length > 0 ? margins.reduce((sum, m) => sum + m, 0) / margins.length : 0

  return { mostExpensive, newest, averageMarginPercent: Math.round(averageMarginPercent * 10) / 10 }
}
