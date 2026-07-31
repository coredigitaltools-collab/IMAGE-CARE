import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { stampNew, stampUpdated } from '../lib/audit'
import { recordMovement } from './stockService'
import { listSuppliers } from './supplierService'
import type {
  GoodsReceipt,
  GoodsReceiptLineItem,
  PurchaseOrder,
  PurchaseOrderInput,
  PurchaseOrderStatus,
  PurchaseRequisition,
  PurchaseReturn,
  PurchaseReturnLineItem,
  RequisitionLineItem,
  SupplierInvoice,
  SupplierInvoicePayment,
} from '../types/purchasing'

const REQ_KEY = 'purchasing:requisitions'
const PO_KEY = 'purchasing:orders'
const RECEIPT_KEY = 'purchasing:receipts'
const INVOICE_KEY = 'purchasing:invoices'
const PAYMENT_KEY = 'purchasing:invoice-payments'
const RETURN_KEY = 'purchasing:returns'

export class EmptyOrderError extends Error {
  constructor() {
    super('Add at least one line item first.')
    this.name = 'EmptyOrderError'
  }
}
export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidTransitionError'
  }
}
export class OverReceiptError extends Error {
  constructor(productName: string, remaining: number) {
    super(`Can't receive more ${productName} than ordered — ${remaining} remaining.`)
    this.name = 'OverReceiptError'
  }
}
export class PaymentExceedsInvoiceError extends Error {
  constructor() {
    super("Payment can't exceed the amount still owed on this invoice.")
    this.name = 'PaymentExceedsInvoiceError'
  }
}

function generateReference(existing: { reference: string }[], prefix: string): string {
  const numbers = existing.map((e) => Number(e.reference.replace(/\D/g, ''))).filter((n) => !Number.isNaN(n))
  const next = (numbers.length > 0 ? Math.max(...numbers) : 10000) + 1
  return `${prefix}-${next}`
}

// ---------- Requisitions ----------

export async function listRequisitions(): Promise<PurchaseRequisition[]> {
  const reqs = await getCollection<PurchaseRequisition>(REQ_KEY, () => [])
  return [...reqs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export async function createRequisition(
  items: RequisitionLineItem[],
  notes: string,
  requestedByName: string,
  userId: string,
): Promise<PurchaseRequisition> {
  if (items.length === 0) throw new EmptyOrderError()
  const existing = await listRequisitions()
  const requisition: PurchaseRequisition = {
    ...stampNew(userId),
    reference: generateReference(existing, 'REQ'),
    requestedByName,
    items,
    status: 'pending_approval',
    notes,
    rejectionReason: null,
    convertedToPoId: null,
  }
  await setCollection(REQ_KEY, [...existing, requisition])
  await enqueueSync({ entityType: 'requisition', entityId: requisition.id, operation: 'create' })
  return requisition
}

async function updateRequisitionStatus(id: string, patch: Partial<PurchaseRequisition>, userId: string): Promise<PurchaseRequisition> {
  const reqs = await listRequisitions()
  let updated: PurchaseRequisition | null = null
  const next = reqs.map((r) => {
    if (r.id !== id) return r
    updated = stampUpdated({ ...r, ...patch }, userId)
    return updated
  })
  if (!updated) throw new Error('Requisition not found.')
  await setCollection(REQ_KEY, next)
  await enqueueSync({ entityType: 'requisition', entityId: id, operation: 'update' })
  return updated
}

export async function approveRequisition(id: string, userId: string): Promise<PurchaseRequisition> {
  return updateRequisitionStatus(id, { status: 'approved' }, userId)
}
export async function rejectRequisition(id: string, reason: string, userId: string): Promise<PurchaseRequisition> {
  if (!reason.trim()) throw new Error('A reason is required to reject a requisition.')
  return updateRequisitionStatus(id, { status: 'rejected', rejectionReason: reason.trim() }, userId)
}

// ---------- Purchase Orders ----------

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  const orders = await getCollection<PurchaseOrder>(PO_KEY, () => [])
  return [...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  const orders = await listPurchaseOrders()
  return orders.find((o) => o.id === id) ?? null
}

export async function createPurchaseOrder(input: PurchaseOrderInput, userId: string): Promise<PurchaseOrder> {
  if (input.items.length === 0) throw new EmptyOrderError()
  const suppliers = await listSuppliers()
  if (!suppliers.some((s) => s.id === input.supplierId)) throw new Error('Select a valid supplier.')

  const existing = await listPurchaseOrders()
  const order: PurchaseOrder = {
    ...stampNew(userId),
    reference: generateReference(existing, 'PO'),
    supplierId: input.supplierId,
    requisitionId: input.requisitionId,
    items: input.items.map((i) => ({ ...i, quantityReceived: 0 })),
    status: 'pending_approval',
    expectedDeliveryDate: input.expectedDeliveryDate,
    notes: input.notes,
    approvedByName: null,
    approvedAt: null,
    rejectionReason: null,
  }
  await setCollection(PO_KEY, [...existing, order])
  await enqueueSync({ entityType: 'purchase_order', entityId: order.id, operation: 'create' })

  if (input.requisitionId) {
    await updateRequisitionStatus(input.requisitionId, { status: 'converted', convertedToPoId: order.id }, userId)
  }
  return order
}

async function updatePurchaseOrder(id: string, patch: Partial<PurchaseOrder>, userId: string): Promise<PurchaseOrder> {
  const orders = await listPurchaseOrders()
  let updated: PurchaseOrder | null = null
  const next = orders.map((o) => {
    if (o.id !== id) return o
    updated = stampUpdated({ ...o, ...patch }, userId)
    return updated
  })
  if (!updated) throw new Error('Purchase order not found.')
  await setCollection(PO_KEY, next)
  await enqueueSync({ entityType: 'purchase_order', entityId: id, operation: 'update' })
  return updated
}

/** The approval gate: goods can never be received against a PO that
 *  hasn't been approved — this is what "Approval Workflow" actually
 *  enforces, not just a status label. */
export async function approvePurchaseOrder(id: string, approverName: string, userId: string): Promise<PurchaseOrder> {
  const order = await getPurchaseOrder(id)
  if (!order) throw new Error('Purchase order not found.')
  if (order.status !== 'pending_approval') throw new InvalidTransitionError('Only orders pending approval can be approved.')
  return updatePurchaseOrder(id, { status: 'approved', approvedByName: approverName, approvedAt: new Date().toISOString() }, userId)
}

export async function rejectPurchaseOrder(id: string, reason: string, userId: string): Promise<PurchaseOrder> {
  if (!reason.trim()) throw new Error('A reason is required to reject a purchase order.')
  const order = await getPurchaseOrder(id)
  if (!order) throw new Error('Purchase order not found.')
  if (order.status !== 'pending_approval') throw new InvalidTransitionError('Only orders pending approval can be rejected.')
  return updatePurchaseOrder(id, { status: 'cancelled', rejectionReason: reason.trim() }, userId)
}

export async function markPurchaseOrderSent(id: string, userId: string): Promise<PurchaseOrder> {
  const order = await getPurchaseOrder(id)
  if (!order) throw new Error('Purchase order not found.')
  if (order.status !== 'approved') throw new InvalidTransitionError('Only approved orders can be marked as sent.')
  return updatePurchaseOrder(id, { status: 'sent' }, userId)
}

export async function cancelPurchaseOrder(id: string, userId: string): Promise<PurchaseOrder> {
  const order = await getPurchaseOrder(id)
  if (!order) throw new Error('Purchase order not found.')
  if (order.status === 'received' || order.status === 'cancelled') {
    throw new InvalidTransitionError('This order can no longer be cancelled.')
  }
  return updatePurchaseOrder(id, { status: 'cancelled' }, userId)
}

// ---------- Goods Receipt ----------
// "Receiving stock updates inventory automatically" — this is the one
// path that ever increases stock from a purchase; it reuses the exact
// same recordMovement() the rest of Inventory relies on, so a goods
// receipt is indistinguishable from any other audited stock movement.

export async function listGoodsReceipts(purchaseOrderId?: string): Promise<GoodsReceipt[]> {
  const receipts = await getCollection<GoodsReceipt>(RECEIPT_KEY, () => [])
  const sorted = [...receipts].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  return purchaseOrderId ? sorted.filter((r) => r.purchaseOrderId === purchaseOrderId) : sorted
}

export async function recordGoodsReceipt(
  purchaseOrderId: string,
  lineItems: GoodsReceiptLineItem[],
  notes: string,
  receivedByName: string,
  userId: string,
): Promise<GoodsReceipt> {
  const order = await getPurchaseOrder(purchaseOrderId)
  if (!order) throw new Error('Purchase order not found.')
  if (order.status !== 'approved' && order.status !== 'sent' && order.status !== 'partially_received') {
    throw new InvalidTransitionError('This order must be approved before goods can be received against it.')
  }

  const toReceive = lineItems.filter((i) => i.quantityReceived > 0)
  if (toReceive.length === 0) throw new EmptyOrderError()

  // Validate against remaining quantity per line before touching anything.
  for (const item of toReceive) {
    const line = order.items.find((l) => l.productId === item.productId)
    if (!line) continue
    const remaining = line.quantityOrdered - line.quantityReceived
    if (item.quantityReceived > remaining) throw new OverReceiptError(item.productName, remaining)
  }

  const existingReceipts = await listGoodsReceipts()
  const receipt: GoodsReceipt = {
    id: crypto.randomUUID(),
    reference: generateReference(existingReceipts, 'GRN'),
    purchaseOrderId,
    items: toReceive,
    receivedAt: new Date().toISOString(),
    receivedByName,
    notes,
  }

  // Stock moves first, one product at a time — same integrity guarantee
  // (no-negative-stock, permanent movement record) as every other path.
  for (const item of toReceive) {
    await recordMovement(
      { productId: item.productId, type: 'purchase', quantityChange: item.quantityReceived, reason: `Goods receipt ${receipt.reference}` },
      userId,
    )
  }

  await setCollection(RECEIPT_KEY, [...existingReceipts, receipt])
  await enqueueSync({ entityType: 'goods_receipt', entityId: receipt.id, operation: 'create' })

  const updatedItems = order.items.map((line) => {
    const received = toReceive.find((i) => i.productId === line.productId)
    return received ? { ...line, quantityReceived: line.quantityReceived + received.quantityReceived } : line
  })
  const fullyReceived = updatedItems.every((l) => l.quantityReceived >= l.quantityOrdered)
  await updatePurchaseOrder(purchaseOrderId, { items: updatedItems, status: fullyReceived ? 'received' : 'partially_received' }, userId)

  return receipt
}

// ---------- Supplier Invoices ----------

export async function listSupplierInvoices(supplierId?: string): Promise<SupplierInvoice[]> {
  const invoices = await getCollection<SupplierInvoice>(INVOICE_KEY, () => [])
  const sorted = [...invoices].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return supplierId ? sorted.filter((i) => i.supplierId === supplierId) : sorted
}

export async function createSupplierInvoice(
  input: { supplierId: string; purchaseOrderId: string | null; supplierInvoiceNumber: string; amount: number; dueDate: string | null },
  userId: string,
): Promise<SupplierInvoice> {
  if (input.amount <= 0) throw new Error('Enter an invoice amount greater than 0.')
  const existing = await listSupplierInvoices()
  const invoice: SupplierInvoice = {
    id: crypto.randomUUID(),
    reference: generateReference(existing, 'SINV'),
    supplierInvoiceNumber: input.supplierInvoiceNumber.trim(),
    supplierId: input.supplierId,
    purchaseOrderId: input.purchaseOrderId,
    amount: input.amount,
    amountPaid: 0,
    dueDate: input.dueDate,
    status: 'unpaid',
    cancelledAt: null,
    cancelReason: null,
    closedAt: null,
    createdAt: new Date().toISOString(),
    createdBy: userId,
  }
  await setCollection(INVOICE_KEY, [...existing, invoice])
  await enqueueSync({ entityType: 'supplier_invoice', entityId: invoice.id, operation: 'create' })
  return invoice
}

export async function listInvoicePayments(supplierInvoiceId?: string): Promise<SupplierInvoicePayment[]> {
  const payments = await getCollection<SupplierInvoicePayment>(PAYMENT_KEY, () => [])
  const sorted = [...payments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return supplierInvoiceId ? sorted.filter((p) => p.supplierInvoiceId === supplierInvoiceId) : sorted
}

export async function recordInvoicePayment(supplierInvoiceId: string, amount: number, reference: string, userId: string): Promise<SupplierInvoicePayment> {
  const invoices = await listSupplierInvoices()
  const invoice = invoices.find((i) => i.id === supplierInvoiceId)
  if (!invoice) throw new Error('Invoice not found.')
  if (invoice.status === 'cancelled' || invoice.status === 'closed') {
    throw new Error(`This bill is ${invoice.status} and can no longer accept payments.`)
  }
  const owed = invoice.amount - invoice.amountPaid
  if (amount <= 0) throw new Error('Enter a payment amount greater than 0.')
  if (amount > owed) throw new PaymentExceedsInvoiceError()

  const payment: SupplierInvoicePayment = {
    id: crypto.randomUUID(),
    supplierInvoiceId,
    amount,
    reference: reference.trim(),
    createdAt: new Date().toISOString(),
    createdBy: userId,
  }
  const payments = await getCollection<SupplierInvoicePayment>(PAYMENT_KEY, () => [])
  await setCollection(PAYMENT_KEY, [...payments, payment])
  await enqueueSync({ entityType: 'supplier_invoice_payment', entityId: payment.id, operation: 'create' })

  const newAmountPaid = invoice.amountPaid + amount
  const next = invoices.map((i) =>
    i.id === supplierInvoiceId
      ? { ...i, amountPaid: newAmountPaid, status: (newAmountPaid >= i.amount ? 'paid' : 'partially_paid') as SupplierInvoice['status'] }
      : i,
  )
  await setCollection(INVOICE_KEY, next)
  await enqueueSync({ entityType: 'supplier_invoice', entityId: supplierInvoiceId, operation: 'update' })
  return payment
}

// ---------- Purchase Returns ----------

export async function listPurchaseReturns(): Promise<PurchaseReturn[]> {
  const returns = await getCollection<PurchaseReturn>(RETURN_KEY, () => [])
  return [...returns].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function createPurchaseReturn(
  input: { purchaseOrderId: string | null; supplierId: string; items: PurchaseReturnLineItem[]; reason: string },
  userId: string,
): Promise<PurchaseReturn> {
  if (input.items.length === 0) throw new EmptyOrderError()
  if (!input.reason.trim()) throw new Error('A reason is required for a purchase return.')

  const existing = await listPurchaseReturns()
  const purchaseReturn: PurchaseReturn = {
    id: crypto.randomUUID(),
    reference: generateReference(existing, 'PRET'),
    purchaseOrderId: input.purchaseOrderId,
    supplierId: input.supplierId,
    items: input.items,
    reason: input.reason.trim(),
    createdAt: new Date().toISOString(),
    createdBy: userId,
  }

  for (const item of input.items) {
    await recordMovement(
      { productId: item.productId, type: 'purchase_return', quantityChange: -item.quantity, reason: `Return ${purchaseReturn.reference}` },
      userId,
    )
  }

  await setCollection(RETURN_KEY, [...existing, purchaseReturn])
  await enqueueSync({ entityType: 'purchase_return', entityId: purchaseReturn.id, operation: 'create' })
  return purchaseReturn
}

// ---------- Dashboard & Reports ----------

export interface PurchaseDashboardKpis {
  openOrders: number
  pendingApproval: number
  pendingReceipt: number
  spendThisMonthUgx: number
  overdueDeliveries: number
}

export async function getPurchaseDashboardKpis(): Promise<PurchaseDashboardKpis> {
  const orders = await listPurchaseOrders()
  const now = new Date()
  const openStatuses: PurchaseOrderStatus[] = ['approved', 'sent', 'partially_received']

  const receipts = await listGoodsReceipts()
  const spendThisMonth = receipts
    .filter((r) => {
      const d = new Date(r.receivedAt)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    })
    .reduce((sum, r) => sum + r.items.reduce((s, i) => s + i.quantityReceived * i.unitCost, 0), 0)

  return {
    openOrders: orders.filter((o) => openStatuses.includes(o.status)).length,
    pendingApproval: orders.filter((o) => o.status === 'pending_approval').length,
    pendingReceipt: orders.filter((o) => o.status === 'approved' || o.status === 'sent' || o.status === 'partially_received').length,
    spendThisMonthUgx: spendThisMonth,
    overdueDeliveries: orders.filter(
      (o) =>
        (o.status === 'approved' || o.status === 'sent' || o.status === 'partially_received') &&
        o.expectedDeliveryDate &&
        new Date(o.expectedDeliveryDate).getTime() < now.getTime(),
    ).length,
  }
}

export interface SupplierSpendRow {
  supplierId: string
  supplierName: string
  totalSpendUgx: number
  orderCount: number
}

export async function getSpendBySupplier(): Promise<SupplierSpendRow[]> {
  const [orders, suppliers] = await Promise.all([listPurchaseOrders(), listSuppliers()])
  const bySupplier = new Map<string, { totalSpendUgx: number; orderCount: number }>()

  for (const order of orders) {
    if (order.status === 'cancelled' || order.status === 'draft' || order.status === 'pending_approval') continue
    const spend = order.items.reduce((sum, i) => sum + i.quantityReceived * i.unitCost, 0)
    const existing = bySupplier.get(order.supplierId) ?? { totalSpendUgx: 0, orderCount: 0 }
    bySupplier.set(order.supplierId, { totalSpendUgx: existing.totalSpendUgx + spend, orderCount: existing.orderCount + 1 })
  }

  return [...bySupplier.entries()]
    .map(([supplierId, v]) => ({ supplierId, supplierName: suppliers.find((s) => s.id === supplierId)?.name ?? 'Unknown supplier', ...v }))
    .sort((a, b) => b.totalSpendUgx - a.totalSpendUgx)
}
