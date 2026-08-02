import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { stampUpdated } from '../lib/audit'
import { listCustomers, getCustomer } from './customerService'
import { listSales } from './salesService'
import type { Customer, CreditLimitChange, CreditPayment, CreditWriteOff } from '../types/sales'

const PAYMENTS_KEY = 'credit:payments'
const WRITEOFFS_KEY = 'credit:writeoffs'
const LIMIT_CHANGES_KEY = 'credit:limit-changes'

// Standard payment terms, placeholder pending a configurable field in
// Sales Settings; documented here so it's the one place to change.
export const CREDIT_TERMS_DAYS = 30

export class WriteOffExceedsBalanceError extends Error {
  constructor() {
    super("Write-off amount can't exceed the customer's outstanding balance.")
    this.name = 'WriteOffExceedsBalanceError'
  }
}
export class PaymentExceedsBalanceError extends Error {
  constructor(balance: number) {
    super(`Payment can't exceed the outstanding balance of ${balance.toLocaleString()} UGX.`)
    this.name = 'PaymentExceedsBalanceError'
  }
}

// ---------- Payments ----------

export async function listPayments(customerId?: string): Promise<CreditPayment[]> {
  const payments = await getCollection<CreditPayment>(PAYMENTS_KEY, () => [])
  const sorted = [...payments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return customerId ? sorted.filter((p) => p.customerId === customerId) : sorted
}

export async function recordPayment(
  customerId: string,
  amount: number,
  method: CreditPayment['method'],
  reference: string,
  userId: string,
): Promise<CreditPayment> {
  const customer = await getCustomer(customerId)
  if (!customer) throw new Error('Customer not found.')
  if (amount <= 0) throw new Error('Enter a payment amount greater than 0.')
  if (amount > customer.creditBalance) throw new PaymentExceedsBalanceError(customer.creditBalance)

  const payment: CreditPayment = {
    id: crypto.randomUUID(),
    customerId,
    amount,
    method,
    reference: reference.trim(),
    createdAt: new Date().toISOString(),
    createdBy: userId,
  }
  const payments = await getCollection<CreditPayment>(PAYMENTS_KEY, () => [])
  await setCollection(PAYMENTS_KEY, [...payments, payment])
  await enqueueSync({ entityType: 'credit_payment', entityId: payment.id, operation: 'create' })

  await setCustomerCreditBalance(customerId, customer.creditBalance - amount, userId)
  return payment
}

// ---------- Write-offs ----------

export async function listWriteOffs(customerId?: string): Promise<CreditWriteOff[]> {
  const writeOffs = await getCollection<CreditWriteOff>(WRITEOFFS_KEY, () => [])
  const sorted = [...writeOffs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return customerId ? sorted.filter((w) => w.customerId === customerId) : sorted
}

export async function writeOffBalance(customerId: string, amount: number, reason: string, userId: string): Promise<CreditWriteOff> {
  const customer = await getCustomer(customerId)
  if (!customer) throw new Error('Customer not found.')
  if (amount <= 0) throw new Error('Enter a write-off amount greater than 0.')
  if (amount > customer.creditBalance) throw new WriteOffExceedsBalanceError()
  if (!reason.trim()) throw new Error('A reason is required to write off a balance.')

  const writeOff: CreditWriteOff = {
    id: crypto.randomUUID(),
    customerId,
    amount,
    reason: reason.trim(),
    createdAt: new Date().toISOString(),
    createdBy: userId,
  }
  const writeOffs = await getCollection<CreditWriteOff>(WRITEOFFS_KEY, () => [])
  await setCollection(WRITEOFFS_KEY, [...writeOffs, writeOff])
  await enqueueSync({ entityType: 'credit_writeoff', entityId: writeOff.id, operation: 'create' })

  await setCustomerCreditBalance(customerId, customer.creditBalance - amount, userId)
  return writeOff
}

// ---------- Credit limit approvals ----------

export async function listLimitChanges(customerId?: string): Promise<CreditLimitChange[]> {
  const changes = await getCollection<CreditLimitChange>(LIMIT_CHANGES_KEY, () => [])
  const sorted = [...changes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return customerId ? sorted.filter((c) => c.customerId === customerId) : sorted
}

/** The "approval" in "credit limits enforced through approvals", this
 *  is the only way a customer's limit ever changes, and every change is
 *  logged permanently, including who approved it and what it was before. */
export async function approveCreditLimit(customerId: string, newLimit: number, userId: string): Promise<Customer> {
  if (newLimit < 0) throw new Error('Credit limit cannot be negative.')
  const customers = await listCustomers()
  const customer = customers.find((c) => c.id === customerId)
  if (!customer) throw new Error('Customer not found.')

  const change: CreditLimitChange = {
    id: crypto.randomUUID(),
    customerId,
    previousLimit: customer.creditLimit,
    newLimit,
    createdAt: new Date().toISOString(),
    createdBy: userId,
  }
  const changes = await getCollection<CreditLimitChange>(LIMIT_CHANGES_KEY, () => [])
  await setCollection(LIMIT_CHANGES_KEY, [...changes, change])
  await enqueueSync({ entityType: 'credit_limit_change', entityId: change.id, operation: 'create' })

  const next = customers.map((c) => (c.id === customerId ? stampUpdated({ ...c, creditLimit: newLimit }, userId) : c))
  await setCollection('sales:customers', next)
  await enqueueSync({ entityType: 'customer', entityId: customerId, operation: 'update' })
  return next.find((c) => c.id === customerId) as Customer
}

// Internal, used by recordPayment/writeOffBalance to adjust the balance
// without duplicating the audit-stamp/persist logic from customerService.
async function setCustomerCreditBalance(customerId: string, newBalance: number, userId: string): Promise<void> {
  const customers = await listCustomers()
  const next = customers.map((c) => (c.id === customerId ? stampUpdated({ ...c, creditBalance: Math.max(0, newBalance) }, userId) : c))
  await setCollection('sales:customers', next)
  await enqueueSync({ entityType: 'customer', entityId: customerId, operation: 'update' })
}

// ---------- Aging (Collections) ----------
// Approximation, documented as such: a customer's "age" is the number of
// days since their oldest still-outstanding credit sale, where "still
// outstanding" means it happened after their most recent payment (or all
// credit sales, if they've never paid). This is a running-balance
// approximation, not a full sub-ledger that matches specific payments to
// specific invoices, reasonable for a single-branch small business,
// worth revisiting if per-invoice payment allocation is ever needed.

export interface CreditAccountRow {
  customer: Customer
  balance: number
  limit: number
  available: number
  daysOutstanding: number | null
  isOverdue: boolean
}

export async function listCreditAccounts(): Promise<CreditAccountRow[]> {
  const [customers, sales, payments] = await Promise.all([listCustomers(), listSales(), listPayments()])
  const active = customers.filter((c) => c.is_active && (c.creditBalance > 0 || c.creditLimit > 0))

  return active.map((customer) => {
    const creditSales = sales.filter((s) => s.customerId === customer.id && s.paymentMethod === 'credit' && s.status === 'completed')
    const customerPayments = payments.filter((p) => p.customerId === customer.id)
    const lastPaymentAt = customerPayments.length > 0 ? Math.max(...customerPayments.map((p) => new Date(p.createdAt).getTime())) : null

    const unpaidSales = lastPaymentAt ? creditSales.filter((s) => new Date(s.createdAt).getTime() > lastPaymentAt) : creditSales
    const oldestUnpaid = unpaidSales.length > 0 ? Math.min(...unpaidSales.map((s) => new Date(s.createdAt).getTime())) : null
    const daysOutstanding = oldestUnpaid !== null ? Math.floor((Date.now() - oldestUnpaid) / 86_400_000) : null

    return {
      customer,
      balance: customer.creditBalance,
      limit: customer.creditLimit,
      available: Math.max(0, customer.creditLimit - customer.creditBalance),
      daysOutstanding,
      isOverdue: customer.creditBalance > 0 && daysOutstanding !== null && daysOutstanding > CREDIT_TERMS_DAYS,
    }
  })
}

export interface CreditDashboardKpis {
  totalOutstandingUgx: number
  accountsWithBalance: number
  overdueAccounts: number
  overdueAmountUgx: number
  paymentsThisMonthUgx: number
}

export async function getCreditDashboardKpis(): Promise<CreditDashboardKpis> {
  const accounts = await listCreditAccounts()
  const payments = await listPayments()
  const now = new Date()
  const paymentsThisMonth = payments.filter((p) => {
    const d = new Date(p.createdAt)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })

  const withBalance = accounts.filter((a) => a.balance > 0)
  const overdue = withBalance.filter((a) => a.isOverdue)

  return {
    totalOutstandingUgx: withBalance.reduce((sum, a) => sum + a.balance, 0),
    accountsWithBalance: withBalance.length,
    overdueAccounts: overdue.length,
    overdueAmountUgx: overdue.reduce((sum, a) => sum + a.balance, 0),
    paymentsThisMonthUgx: paymentsThisMonth.reduce((sum, p) => sum + p.amount, 0),
  }
}

// ---------- Aging report (30 / 60 / 90+ buckets) ----------

export interface AgingBucket {
  label: string
  accounts: CreditAccountRow[]
  totalUgx: number
}

export async function getAgingReport(): Promise<AgingBucket[]> {
  const accounts = (await listCreditAccounts()).filter((a) => a.balance > 0)
  const buckets: AgingBucket[] = [
    { label: 'Current (0-30 days)', accounts: [], totalUgx: 0 },
    { label: '31-60 days', accounts: [], totalUgx: 0 },
    { label: '61-90 days', accounts: [], totalUgx: 0 },
    { label: '90+ days', accounts: [], totalUgx: 0 },
  ]

  for (const account of accounts) {
    const days = account.daysOutstanding ?? 0
    const bucket = days <= 30 ? buckets[0] : days <= 60 ? buckets[1] : days <= 90 ? buckets[2] : buckets[3]
    bucket.accounts.push(account)
    bucket.totalUgx += account.balance
  }
  return buckets
}
