import { listProducts } from './productService'
import { listCategories } from './categoryService'
import { listSuppliers } from './supplierService'
import { convertFromUgx, type SupportedCurrency } from '../lib/currency'
import type { InventoryKpis } from '../types/inventory'

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
