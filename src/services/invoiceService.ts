import { getCollection, setCollection, getSingleton, setSingleton, enqueueSync } from '../lib/localStore'
import { getSale, listSales } from './salesService'
import { getCustomer } from './customerService'
import type { Invoice, InvoiceSettings } from '../types/invoices'

const KEY = 'invoices:invoices'
const SETTINGS_KEY = 'invoices:settings'

export class SaleNotCompletedError extends Error {
  constructor() {
    super('Invoices can only be generated from a completed sale.')
    this.name = 'SaleNotCompletedError'
  }
}
export class AlreadyInvoicedError extends Error {
  constructor(invoiceNumber: string) {
    super(`This sale was already invoiced (${invoiceNumber}).`)
    this.name = 'AlreadyInvoicedError'
  }
}
export class InvalidInvoiceTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidInvoiceTransitionError'
  }
}

// ---------- Settings ----------

function seedInvoiceSettings(): InvoiceSettings {
  return { defaultDueDays: 14, footerText: 'Thank you for your business.', showTaxBreakdown: true, showLogo: true }
}

export async function getInvoiceSettings(): Promise<InvoiceSettings> {
  return getSingleton(SETTINGS_KEY, seedInvoiceSettings)
}

export async function saveInvoiceSettings(input: InvoiceSettings): Promise<InvoiceSettings> {
  await setSingleton(SETTINGS_KEY, input)
  await enqueueSync({ entityType: 'invoice_settings', entityId: 'singleton', operation: 'update' })
  return input
}

// ---------- Core ----------

function generateInvoiceNumber(existing: Invoice[]): string {
  const numbers = existing.map((i) => Number(i.invoiceNumber.replace(/\D/g, ''))).filter((n) => !Number.isNaN(n))
  const next = (numbers.length > 0 ? Math.max(...numbers) : 20000) + 1
  return `IVC-${next}`
}

export async function listInvoices(): Promise<Invoice[]> {
  const invoices = await getCollection<Invoice>(KEY, () => [])
  return [...invoices].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const invoices = await listInvoices()
  return invoices.find((i) => i.id === id) ?? null
}

export async function getInvoiceForSale(saleId: string): Promise<Invoice | null> {
  const invoices = await listInvoices()
  return invoices.find((i) => i.saleId === saleId) ?? null
}

/** "Invoices are generated from completed sales only", enforced here,
 *  not just documented. One invoice per sale (checked before creating
 *  another). Cash/mobile money/card sales are marked paid immediately
 *  (the money already changed hands at checkout); credit sales start
 *  unpaid, since the Credit Management balance is what actually tracks
 *  whether the customer has settled it. */
export async function generateInvoice(saleId: string, dueDate: string | null, userId: string): Promise<Invoice> {
  const sale = await getSale(saleId)
  if (!sale) throw new Error('Sale not found.')
  if (sale.status !== 'completed') throw new SaleNotCompletedError()

  const existingForSale = await getInvoiceForSale(saleId)
  if (existingForSale) throw new AlreadyInvoicedError(existingForSale.invoiceNumber)

  const customer = sale.customerId ? await getCustomer(sale.customerId) : null
  const existing = await listInvoices()

  const invoice: Invoice = {
    id: crypto.randomUUID(),
    invoiceNumber: generateInvoiceNumber(existing),
    saleId: sale.id,
    saleReference: sale.reference,
    customerId: sale.customerId,
    customerName: customer?.name ?? 'Walk-in Customer',
    items: sale.items.map((i) => ({
      productId: i.productId,
      productName: i.productName,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
    })),
    subtotal: sale.subtotal,
    discountAmount: sale.discountAmount,
    taxAmount: sale.taxAmount,
    totalAmount: sale.totalAmount,
    paymentMethod: sale.paymentMethod,
    status: sale.paymentMethod === 'credit' ? 'unpaid' : 'paid',
    issuedAt: new Date().toISOString(),
    dueDate,
    paidAt: sale.paymentMethod === 'credit' ? null : new Date().toISOString(),
    sentAt: null,
    cancelledAt: null,
    cancelReason: null,
    notes: '',
    createdAt: new Date().toISOString(),
    createdBy: userId,
  }

  await setCollection(KEY, [...existing, invoice])
  await enqueueSync({ entityType: 'invoice', entityId: invoice.id, operation: 'create' })
  return invoice
}

async function updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice> {
  const invoices = await listInvoices()
  let updated: Invoice | null = null
  const next = invoices.map((i) => {
    if (i.id !== id) return i
    updated = { ...i, ...patch }
    return updated
  })
  if (!updated) throw new Error('Invoice not found.')
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'invoice', entityId: id, operation: 'update' })
  return updated
}

export async function markInvoiceSent(id: string): Promise<Invoice> {
  return updateInvoice(id, { sentAt: new Date().toISOString() })
}

export async function markInvoicePaid(id: string): Promise<Invoice> {
  const invoice = await getInvoice(id)
  if (!invoice) throw new Error('Invoice not found.')
  if (invoice.status === 'cancelled') throw new InvalidInvoiceTransitionError('A cancelled invoice cannot be marked paid.')
  return updateInvoice(id, { status: 'paid', paidAt: new Date().toISOString() })
}

export async function cancelInvoice(id: string, reason: string): Promise<Invoice> {
  if (!reason.trim()) throw new Error('A reason is required to cancel an invoice.')
  const invoice = await getInvoice(id)
  if (!invoice) throw new Error('Invoice not found.')
  if (invoice.status === 'paid') throw new InvalidInvoiceTransitionError('A paid invoice cannot be cancelled, issue a refund on the sale instead.')
  // "Cancelled invoices remain in audit history", status flip only,
  // never removed from the collection.
  return updateInvoice(id, { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelReason: reason.trim() })
}

/** Overdue is derived, not stored, an invoice becomes "overdue" purely
 *  by virtue of its due date passing while still unpaid, so the status
 *  can never go stale just because nobody opened the app that day. */
export function isOverdue(invoice: Invoice): boolean {
  return (
    (invoice.status === 'unpaid' || invoice.status === 'partially_paid') &&
    Boolean(invoice.dueDate) &&
    new Date(invoice.dueDate as string).getTime() < Date.now()
  )
}

export function effectiveStatus(invoice: Invoice): Invoice['status'] | 'overdue' {
  return isOverdue(invoice) ? 'overdue' : invoice.status
}

// ---------- Uninvoiced sales (for the "New Invoice" picker) ----------

export async function listUninvoicedCompletedSales() {
  const [sales, invoices] = await Promise.all([listSales(), listInvoices()])
  const invoicedSaleIds = new Set(invoices.map((i) => i.saleId))
  return sales.filter((s) => s.status === 'completed' && !invoicedSaleIds.has(s.id))
}

// ---------- Dashboard & Reports ----------

export interface InvoiceDashboardKpis {
  invoicedThisMonthUgx: number
  outstandingCount: number
  outstandingAmountUgx: number
  overdueCount: number
  paidThisMonthUgx: number
}

export async function getInvoiceDashboardKpis(): Promise<InvoiceDashboardKpis> {
  const invoices = await listInvoices()
  const now = new Date()
  const thisMonth = invoices.filter((i) => {
    const d = new Date(i.issuedAt)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })
  const outstanding = invoices.filter((i) => i.status === 'unpaid' || i.status === 'partially_paid')
  const overdue = outstanding.filter((i) => isOverdue(i))
  const paidThisMonth = invoices.filter(
    (i) => i.paidAt && new Date(i.paidAt).getFullYear() === now.getFullYear() && new Date(i.paidAt).getMonth() === now.getMonth(),
  )

  return {
    invoicedThisMonthUgx: thisMonth.filter((i) => i.status !== 'cancelled').reduce((sum, i) => sum + i.totalAmount, 0),
    outstandingCount: outstanding.length,
    outstandingAmountUgx: outstanding.reduce((sum, i) => sum + i.totalAmount, 0),
    overdueCount: overdue.length,
    paidThisMonthUgx: paidThisMonth.reduce((sum, i) => sum + i.totalAmount, 0),
  }
}
