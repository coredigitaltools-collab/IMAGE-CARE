import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { recordMovement, NegativeStockError } from './stockService'
import { getProduct, assertSellable, ArchivedProductError } from './productService'
import { getSalesSettings } from './configSettingsService'
import { listTaxRates } from './taxSettingsService'
import { recordCustomerPurchase, getCustomer } from './customerService'
import { awardPoints, reversePointsForSale } from './loyaltyService'
import type { CheckoutInput, Sale } from '../types/sales'

const KEY = 'sales:sales'

export class SaleNotRefundableError extends Error {
  constructor() {
    super('Only a completed sale can be refunded.')
    this.name = 'SaleNotRefundableError'
  }
}

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
export class NoCreditLimitApprovedError extends Error {
  constructor() {
    super("This customer has no approved credit limit. Approve one under Credit before selling on credit.")
    this.name = 'NoCreditLimitApprovedError'
  }
}
export class CreditLimitExceededError extends Error {
  constructor(available: number) {
    super(`This sale exceeds the customer's available credit. Only ${available.toLocaleString()} UGX is available.`)
    this.name = 'CreditLimitExceededError'
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
 *  Workflow). Parked sales skip stock movements entirely; stock only
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

  const costByProductId = new Map<string, number>()
  for (const item of input.items) {
    const product = await getProduct(item.productId)
    if (!product) throw new Error(`Product ${item.productName} no longer exists.`)
    assertSellable(product)
    costByProductId.set(item.productId, product.buyingPrice)
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

  // Payment details are only validated when actually completing a sale,
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
    } else if (input.paymentMethod === 'credit' && input.customerId) {
      // "Credit limits enforced through approvals" (IMC-SRS-006), a
      // limit of 0 means nobody has approved credit for this customer
      // yet; that's the enforcement mechanism, not just a display field.
      const customer = await getCustomer(input.customerId)
      if (!customer) throw new Error('Customer not found.')
      if (customer.creditLimit <= 0) throw new NoCreditLimitApprovedError()
      const available = customer.creditLimit - customer.creditBalance
      if (totalAmount > available) throw new CreditLimitExceededError(Math.max(0, available))
    }
  }

  const sale: Sale = {
    id: crypto.randomUUID(),
    reference,
    branchId: input.branchId,
    customerId: input.customerId,
    salesPersonId: input.salesPersonId,
    items: input.items.map((i) => ({
      productId: i.productId,
      productName: i.productName,
      sku: i.sku,
      unitPrice: i.unitPrice,
      unitCost: costByProductId.get(i.productId) ?? 0,
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
    refundReason: null,
    createdAt: new Date().toISOString(),
    createdBy: userId,
    syncStatus: 'pending',
  }

  if (input.status === 'completed') {
    for (const item of input.items) {
      await recordMovement(
        { productId: item.productId, type: 'sale', quantityChange: -item.quantity, reason: `Sale ${reference}`, branchId: input.branchId },
        userId,
      )
    }
  }

  await setCollection(KEY, [...existing, sale])
  await enqueueSync({ entityType: 'sale', entityId: sale.id, operation: 'create' })

  if (input.status === 'completed' && input.customerId) {
    await recordCustomerPurchase(input.customerId, totalAmount, input.paymentMethod === 'credit', userId)
    await awardPoints(input.customerId, sale.id, totalAmount, userId)
  }

  return sale
}

/** "Refunds reverse points" (IMC-SRS-008), and reverse everything else
 *  the original sale did: stock comes back (a real, audited 'refund'
 *  movement, never a silent edit to currentStock), lifetime spend and
 *  any credit balance the sale created are backed out, and loyalty
 *  points earned on it are reversed via the same Points Engine that
 *  awarded them. Nothing here is a parallel accounting of what the sale
 *  did, it's the same functions run in reverse. */
export async function refundSale(saleId: string, reason: string, userId: string): Promise<Sale> {
  const sale = await getSale(saleId)
  if (!sale) throw new Error('Sale not found.')
  if (sale.status !== 'completed') throw new SaleNotRefundableError()
  if (!reason.trim()) throw new Error('A reason is required to refund a sale.')

  for (const item of sale.items) {
    await recordMovement(
      { productId: item.productId, type: 'refund', quantityChange: item.quantity, reason: `Refund ${sale.reference}`, branchId: sale.branchId },
      userId,
    )
  }

  if (sale.customerId) {
    await recordCustomerPurchase(sale.customerId, -sale.totalAmount, false, userId)
    if (sale.paymentMethod === 'credit') {
      // Reduce the credit balance this sale created. Written directly
      // here (not via creditService) because creditService already
      // imports listSales from this file; importing creditService here
      // too would create a circular dependency between the two.
      const customers = await getCollection<import('../types/sales').Customer>('sales:customers', () => [])
      const next = customers.map((c) =>
        c.id === sale.customerId ? { ...c, creditBalance: Math.max(0, c.creditBalance - sale.totalAmount) } : c,
      )
      await setCollection('sales:customers', next)
      await enqueueSync({ entityType: 'customer', entityId: sale.customerId, operation: 'update' })
    }
    await reversePointsForSale(saleId, userId)
  }

  const sales = await listSales()
  let updated: Sale | null = null
  const next = sales.map((s) => {
    if (s.id !== saleId) return s
    updated = { ...s, status: 'refunded' as const, refundReason: reason.trim() }
    return updated
  })
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'sale', entityId: saleId, operation: 'update' })
  if (!updated) throw new Error('Sale not found.')
  return updated
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

/** Used by Customer Merge (IMP-005 refinement); reassigns every sale
 *  pointing at sourceCustomerId to targetCustomerId, so purchase history
 *  isn't lost when two duplicate customer records are combined. */
export async function reassignCustomerSales(sourceCustomerId: string, targetCustomerId: string): Promise<number> {
  const sales = await listSales()
  let count = 0
  const next = sales.map((s) => {
    if (s.customerId !== sourceCustomerId) return s
    count++
    return { ...s, customerId: targetCustomerId }
  })
  await setCollection(KEY, next)
  return count
}

export { NegativeStockError, ArchivedProductError }
