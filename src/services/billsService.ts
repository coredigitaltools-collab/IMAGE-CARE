import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { listSupplierInvoices, listInvoicePayments, recordInvoicePayment } from './purchasingService'
import { listSuppliers } from './supplierService'
import type { SupplierInvoice, SupplierInvoicePayment } from '../types/purchasing'

// -----------------------------------------------------------------------
// Bills & Payables (IMC-SRS-010). "Bills originate from supplier
// invoices" is implemented literally: a Bill IS a SupplierInvoice
// (recorded in the Purchasing module, IMC-SRS-007) — there is no
// separate Bill entity duplicating amount/status/payments. This module
// adds the Finance-side lifecycle (cancel, close), Dashboard, Aging
// Analysis, and Supplier Statements on top of that same data, reusing
// recordInvoicePayment() rather than re-implementing "payments reduce
// the balance" a third time in this app (Credit and Invoices already
// each implement that once).
// -----------------------------------------------------------------------

const KEY = 'purchasing:invoices' // same collection purchasingService writes to

export const STANDARD_PAYMENT_TERMS_DAYS = 30

export class BillNotFoundError extends Error {
  constructor() {
    super('Bill not found.')
    this.name = 'BillNotFoundError'
  }
}
export class InvalidBillTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidBillTransitionError'
  }
}

export async function listBills(): Promise<SupplierInvoice[]> {
  return listSupplierInvoices()
}

export async function getBill(id: string): Promise<SupplierInvoice | null> {
  const bills = await listBills()
  return bills.find((b) => b.id === id) ?? null
}

export async function listBillPayments(billId?: string): Promise<SupplierInvoicePayment[]> {
  return listInvoicePayments(billId)
}

export const recordBillPayment = recordInvoicePayment

async function updateBill(id: string, patch: Partial<SupplierInvoice>): Promise<SupplierInvoice> {
  const bills = await getCollection<SupplierInvoice>(KEY, () => [])
  let updated: SupplierInvoice | null = null
  const next = bills.map((b) => {
    if (b.id !== id) return b
    updated = { ...b, ...patch }
    return updated
  })
  if (!updated) throw new BillNotFoundError()
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'supplier_invoice', entityId: id, operation: 'update' })
  return updated
}

/** "Cancelled bills remain in history" — status flip with a mandatory
 *  reason, never a deletion. A bill that's already been paid can't be
 *  cancelled (reverse the payment or write it off instead — cancelling
 *  a paid bill would silently make money already sent look like it was
 *  never owed). */
export async function cancelBill(id: string, reason: string): Promise<SupplierInvoice> {
  if (!reason.trim()) throw new Error('A reason is required to cancel a bill.')
  const bill = await getBill(id)
  if (!bill) throw new BillNotFoundError()
  if (bill.status === 'paid' || bill.status === 'closed') {
    throw new InvalidBillTransitionError('A paid or closed bill cannot be cancelled.')
  }
  return updateBill(id, { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelReason: reason.trim() })
}

/** The explicit final "Closed" step in the spec's workflow — separate
 *  from "Paid" so a fully-settled bill can be marked as reconciled and
 *  done, not just financially at zero. */
export async function closeBill(id: string): Promise<SupplierInvoice> {
  const bill = await getBill(id)
  if (!bill) throw new BillNotFoundError()
  if (bill.status !== 'paid') throw new InvalidBillTransitionError('Only a fully paid bill can be closed.')
  return updateBill(id, { status: 'closed', closedAt: new Date().toISOString() })
}

// ---------- Aging Analysis ----------
// Mirrors the same bucket structure as Credit Management's aging report
// (Current / 31-60 / 61-90 / 90+) for a consistent mental model across
// both sides of the business — money owed TO the business vs money the
// business owes.

export interface BillAgingRow {
  bill: SupplierInvoice
  supplierName: string
  amountOwed: number
  daysOverdue: number | null
}

export interface AgingBucket {
  label: string
  rows: BillAgingRow[]
  totalUgx: number
}

export async function getPayablesAging(): Promise<AgingBucket[]> {
  const [bills, suppliers] = await Promise.all([listBills(), listSuppliers()])
  const outstanding = bills.filter((b) => b.status === 'unpaid' || b.status === 'partially_paid')

  const rows: BillAgingRow[] = outstanding.map((bill) => ({
    bill,
    supplierName: suppliers.find((s) => s.id === bill.supplierId)?.name ?? 'Unknown supplier',
    amountOwed: bill.amount - bill.amountPaid,
    daysOverdue: bill.dueDate ? Math.floor((Date.now() - new Date(bill.dueDate).getTime()) / 86_400_000) : null,
  }))

  const buckets: AgingBucket[] = [
    { label: 'Not yet due', rows: [], totalUgx: 0 },
    { label: 'Current (0-30 days overdue)', rows: [], totalUgx: 0 },
    { label: '31-60 days overdue', rows: [], totalUgx: 0 },
    { label: '61-90 days overdue', rows: [], totalUgx: 0 },
    { label: '90+ days overdue', rows: [], totalUgx: 0 },
  ]

  for (const row of rows) {
    const days = row.daysOverdue
    const bucket = days === null || days < 0 ? buckets[0] : days <= 30 ? buckets[1] : days <= 60 ? buckets[2] : days <= 90 ? buckets[3] : buckets[4]
    bucket.rows.push(row)
    bucket.totalUgx += row.amountOwed
  }
  return buckets
}

// ---------- Dashboard ----------

export interface BillsDashboardKpis {
  totalPayableUgx: number
  billsCount: number
  dueThisWeekCount: number
  overdueCount: number
  overdueAmountUgx: number
  paidThisMonthUgx: number
}

export async function getBillsDashboardKpis(): Promise<BillsDashboardKpis> {
  const [bills, payments] = await Promise.all([listBills(), listInvoicePayments()])
  const outstanding = bills.filter((b) => b.status === 'unpaid' || b.status === 'partially_paid')
  const now = Date.now()
  const weekFromNow = now + 7 * 86_400_000

  const overdue = outstanding.filter((b) => b.dueDate && new Date(b.dueDate).getTime() < now)
  const dueThisWeek = outstanding.filter((b) => b.dueDate && new Date(b.dueDate).getTime() >= now && new Date(b.dueDate).getTime() <= weekFromNow)

  const paymentsThisMonth = payments.filter((p) => {
    const d = new Date(p.createdAt)
    const n = new Date()
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth()
  })

  return {
    totalPayableUgx: outstanding.reduce((sum, b) => sum + (b.amount - b.amountPaid), 0),
    billsCount: outstanding.length,
    dueThisWeekCount: dueThisWeek.length,
    overdueCount: overdue.length,
    overdueAmountUgx: overdue.reduce((sum, b) => sum + (b.amount - b.amountPaid), 0),
    paidThisMonthUgx: paymentsThisMonth.reduce((sum, p) => sum + p.amount, 0),
  }
}

// ---------- Supplier Statement ----------
// A chronological, running-balance view of one supplier's bills and
// payments — the printable document a supplier would ask for to
// reconcile what they believe is owed against what's on record here.

export interface StatementLine {
  date: string
  description: string
  debit: number // increases what's owed (a new bill)
  credit: number // decreases what's owed (a payment)
  runningBalance: number
}

export async function getSupplierStatement(supplierId: string): Promise<StatementLine[]> {
  const [bills, payments] = await Promise.all([listBills(), listInvoicePayments()])
  const supplierBills = bills.filter((b) => b.supplierId === supplierId && b.status !== 'cancelled')
  const supplierPayments = payments.filter((p) => supplierBills.some((b) => b.id === p.supplierInvoiceId))

  type RawEvent = { date: string; description: string; debit: number; credit: number }
  const events: RawEvent[] = [
    ...supplierBills.map((b) => ({
      date: b.createdAt,
      description: `Bill ${b.reference} (#${b.supplierInvoiceNumber || '—'})`,
      debit: b.amount,
      credit: 0,
    })),
    ...supplierPayments.map((p) => {
      const bill = supplierBills.find((b) => b.id === p.supplierInvoiceId)
      return {
        date: p.createdAt,
        description: `Payment${bill ? ` — ${bill.reference}` : ''}${p.reference ? ` (${p.reference})` : ''}`,
        debit: 0,
        credit: p.amount,
      }
    }),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  let balance = 0
  return events.map((e) => {
    balance += e.debit - e.credit
    return { ...e, runningBalance: balance }
  })
}
