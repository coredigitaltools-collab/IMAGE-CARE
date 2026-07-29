import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { recordMovement, NegativeStockError } from './stockService'
import { getProduct, assertSellable, ArchivedProductError } from './productService'
import { getSalesSettings } from './configSettingsService'
import { listTaxRates } from './taxSettingsService'
import { recordCustomerPurchase } from './customerService'
import type { CheckoutInput, Sale } from '../types/sales'

const KEY = 'sales:sales'

export class DiscountNotAllowedError extends Error {
  constructor() {
    super('Discounts are turned off in Sales Settings.')
    this.name = 'DiscountNotAllowedError'
  }
}
export class DiscountExceedsLimitError extends Error {
  constructor(max: number) {
    super(`Discount can't exceed ${max}% (set in Sales Settings).`)
    this.name = 'DiscountExceedsLimitError'
  }
}
export class CreditRequiresCustomerError extends Error {
  constructor() {
    super('A customer must be selected for credit sales (set in Sales Settings).')
    this.name = 'CreditRequiresCustomerError'
  }
}
export class EmptyCartError extends Error {
  constructor() {
    super('Add at least one item before completing the sale.')
    this.name = 'EmptyCartError'
  }
}
export class InsufficientPaymentError extends Error {
  constructor(shortfall: number) {
    super(`Amount received is short by ${shortfall.toLocaleString()} UGX.`)
    this.name = 'InsufficientPaymentError'
  }
}
export class PaymentReferenceRequiredError extends Error {
  constructor(label: string) {
    super(`Enter the ${label} before completing this sale.`)
    this.name = 'PaymentReferenceRequiredError'
  }
}

// Simple placeholder loyalty rule (1 point per 1,000 UGX spent) — a real
// Loyalty Programme module would make this configurable; documented here
// so it's easy to find and replace later.
const LOYALTY_UGX_PER_POINT = 1000

export async function listSales(): Promise<Sale[]> {
  const sales = await getCollection<Sale>(KEY, () => [])
  return [...sales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function getSale(id: string): Promise<Sale | null> {
  const sales = await listSales()
  return sales.find((s) => s.id === id) ?? null
}

export async function listParkedSales(): Promise<Sale[]> {
  return (await listSales()).filter((s) => s.status === 'parked')
}

function generateReference(existing: Sale[]): string {
  const numbers = existing.map((s) => Number(s.reference.replace(/\D/g, ''))).filter((n) => !Number.isNaN(n))
  const next = (numbers.length > 0 ? Math.max(...numbers) : 10000) + 1
  return `INV-${next}`
}

/** The single path for both "Complete Sale" and "Park Sale" (IMP-004 POS
 *  Workflow). Parked sales skip stock movements entirely — stock only
 *  actually moves once a sale is completed, whether that happens now or
 *  later when a parked sale is resumed and completed. */
export async function checkout(input: CheckoutInput, userId: string): Promise<Sale> {
  if (input.items.length === 0) throw new EmptyCartError()

  const salesSettings = await getSalesSettings()

  if (input.discountPercent > 0) {
    if (!salesSettings.allowDiscounts) throw new DiscountNotAllowedError()
    if (input.discountPercent > salesSettings.maxDiscountPercent) {
      throw new DiscountExceedsLimitError(salesSettings.maxDiscountPercent)
    }
  }

  if (input.paymentMethod === 'credit' && salesSettings.requireCustomerForCredit && !input.customerId) {
    throw new CreditRequiresCustomerError()
  }

  for (const item of input.items) {
    const product = await getProduct(item.productId)
    if (!product) throw new Error(`Product ${item.productName} no longer exists.`)
    assertSellable(product)
  }

  const subtotal = input.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
  const discountAmount = Math.round((subtotal * input.discountPercent) / 100)
  const taxableAmount = subtotal - discountAmount

  let taxAmount = 0
  let totalAmount = taxableAmount
  if (input.taxRateId) {
    const rates = await listTaxRates()
    const rate = rates.find((r) => r.id === input.taxRateId)
    if (rate) {
      if (rate.isInclusive) {
        taxAmount = Math.round(taxableAmount - taxableAmount / (1 + rate.ratePercent / 100))
        totalAmount = taxableAmount
      } else {
        taxAmount = Math.round((taxableAmount * rate.ratePercent) / 100)
        totalAmount = taxableAmount + taxAmount
      }
    }
  }

  const existing = await listSales()
  const reference = generateReference(existing)

  // Payment details are only validated when actually completing a sale —
  // a parked cart doesn't need a finalized payment method or amount yet.
  let changeDue: number | null = null
  if (input.status === 'completed') {
    if (input.paymentMethod === 'cash') {
      const tendered = input.amountTendered ?? 0
      if (tendered < totalAmount) throw new InsufficientPaymentError(totalAmount - tendered)
      changeDue = tendered - totalAmount
    } else if (input.paymentMethod === 'mobile_money') {
      if (!input.paymentReference?.trim()) throw new PaymentReferenceRequiredError('mobile money reference number')
    } else if (input.paymentMethod === 'card') {
      if (!input.paymentReference?.trim()) throw new PaymentReferenceRequiredError('card transaction ID')
    }
  }

  const sale: Sale = {
    id: crypto.randomUUID(),
    reference,
    branchId: null,
    customerId: input.customerId,
    items: input.items.map((i) => ({
      productId: i.productId,
      productName: i.productName,
      sku: i.sku,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.unitPrice * i.quantity,
    })),
    subtotal,
    discountPercent: input.discountPercent,
    discountAmount,
    taxRateId: input.taxRateId,
    taxAmount,
    totalAmount,
    paymentMethod: input.paymentMethod,
    amountTendered: input.paymentMethod === 'cash' ? (input.amountTendered ?? null) : null,
    changeDue,
    paymentReference: input.paymentMethod === 'mobile_money' || input.paymentMethod === 'card' ? (input.paymentReference?.trim() || null) : null,
    status: input.status,
    createdAt: new Date().toISOString(),
    createdBy: userId,
    syncStatus: 'pending',
  }

  if (input.status === 'completed') {
    for (const item of input.items) {
      await recordMovement(
        { productId: item.productId, type: 'sale', quantityChange: -item.quantity, reason: `Sale ${reference}` },
        userId,
      )
    }
  }

  await setCollection(KEY, [...existing, sale])
  await enqueueSync({ entityType: 'sale', entityId: sale.id, operation: 'create' })

  if (input.status === 'completed' && input.customerId) {
    const loyaltyPointsEarned = Math.floor(totalAmount / LOYALTY_UGX_PER_POINT)
    await recordCustomerPurchase(input.customerId, totalAmount, loyaltyPointsEarned, input.paymentMethod === 'credit', userId)
  }

  return sale
}

export async function resumeParkedSale(id: string): Promise<Sale> {
  const sales = await listSales()
  const sale = sales.find((s) => s.id === id && s.status === 'parked')
  if (!sale) throw new Error('Parked sale not found.')
  const next = sales.filter((s) => s.id !== id)
  await setCollection(KEY, next)
  return sale
}

export async function deleteParkedSale(id: string): Promise<void> {
  const sales = await listSales()
  await setCollection(
    KEY,
    sales.filter((s) => s.id !== id),
  )
}

export { NegativeStockError, ArchivedProductError }
