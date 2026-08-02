import type { Product } from '../types/inventory'
import type { PaymentMethod, Sale } from '../types/sales'

export type LoyaltyTier = 'Bronze' | 'Silver' | 'Gold'

/** Simple, transparent thresholds, recomputed from the live points
 *  balance every time, never stored, so it can never drift out of sync
 *  with reality. */
export function getLoyaltyTier(loyaltyPoints: number): LoyaltyTier {
  if (loyaltyPoints >= 200) return 'Gold'
  if (loyaltyPoints >= 50) return 'Silver'
  return 'Bronze'
}

export interface CustomerInsights {
  totalTransactions: number
  averageOrderValue: number
  daysSinceLastPurchase: number | null
  mostPurchasedProductName: string | null
  mostPurchasedCategoryName: string | null
  favoritePaymentMethod: PaymentMethod | null
}

/** Every number here is computed from the customer's own completed
 *  sales, nothing pre-aggregated or cached, so it's always current the
 *  moment a new sale completes. */
export function computeCustomerInsights(purchases: Sale[], products: Product[]): CustomerInsights {
  if (purchases.length === 0) {
    return {
      totalTransactions: 0,
      averageOrderValue: 0,
      daysSinceLastPurchase: null,
      mostPurchasedProductName: null,
      mostPurchasedCategoryName: null,
      favoritePaymentMethod: null,
    }
  }

  const totalTransactions = purchases.length
  const averageOrderValue = Math.round(purchases.reduce((sum, s) => sum + s.totalAmount, 0) / totalTransactions)
  const daysSinceLastPurchase = Math.floor((Date.now() - new Date(purchases[0].createdAt).getTime()) / (24 * 60 * 60 * 1000))

  const productQty = new Map<string, number>()
  const categoryQty = new Map<string, number>()
  const paymentCounts = new Map<PaymentMethod, number>()

  for (const sale of purchases) {
    paymentCounts.set(sale.paymentMethod, (paymentCounts.get(sale.paymentMethod) ?? 0) + 1)
    for (const item of sale.items) {
      productQty.set(item.productName, (productQty.get(item.productName) ?? 0) + item.quantity)
      const product = products.find((p) => p.id === item.productId)
      if (product) {
        categoryQty.set(product.categoryId, (categoryQty.get(product.categoryId) ?? 0) + item.quantity)
      }
    }
  }

  const topProduct = [...productQty.entries()].sort((a, b) => b[1] - a[1])[0]
  const topCategoryId = [...categoryQty.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const topPayment = [...paymentCounts.entries()].sort((a, b) => b[1] - a[1])[0]

  return {
    totalTransactions,
    averageOrderValue,
    daysSinceLastPurchase,
    mostPurchasedProductName: topProduct?.[0] ?? null,
    mostPurchasedCategoryName: topCategoryId ?? null, // resolved to a name by the caller, which has the categories list
    favoritePaymentMethod: topPayment?.[0] ?? null,
  }
}
