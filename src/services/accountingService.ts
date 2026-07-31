import { getCollection, setCollection, getSingleton, setSingleton, enqueueSync } from '../lib/localStore'
import { listSales } from './salesService'
import { listPayments as listCreditPayments } from './creditService'
import { listInvoicePayments as listSupplierPayments } from './purchasingService'
import { listExpenses } from './expenseService'
import type { Sale } from '../types/sales'
import type { AccountingSettings, CashInHandBreakdown, CashMovement, CashMovementType, FinancialSummary } from '../types/accounting'

const MOVEMENTS_KEY = 'accounting:cash-movements'
const SETTINGS_KEY = 'accounting:settings'

function seedAccountingSettings(): AccountingSettings {
  return { openingCashUgx: 0 }
}

export async function getAccountingSettings(): Promise<AccountingSettings> {
  return getSingleton(SETTINGS_KEY, seedAccountingSettings)
}

export async function saveAccountingSettings(input: AccountingSettings): Promise<AccountingSettings> {
  await setSingleton(SETTINGS_KEY, input)
  await enqueueSync({ entityType: 'accounting_settings', entityId: 'singleton', operation: 'update' })
  return input
}

// ---------- Cash Movements (Bank Deposits / Owner Withdrawals / Adjustments) ----------
// The three inputs to Cash in Hand that no other module tracks. Every
// one is a deliberate, reasoned, audited entry — never inferred.

export async function listCashMovements(): Promise<CashMovement[]> {
  const movements = await getCollection<CashMovement>(MOVEMENTS_KEY, () => [])
  return [...movements].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function recordCashMovement(type: CashMovementType, amount: number, reason: string, userId: string): Promise<CashMovement> {
  if (!reason.trim()) throw new Error('A reason is required for every cash movement.')
  if (type === 'adjustment') {
    if (amount === 0) throw new Error('Enter a non-zero adjustment amount.')
  } else if (amount <= 0) {
    throw new Error('Enter an amount greater than 0.')
  }
  const movements = await getCollection<CashMovement>(MOVEMENTS_KEY, () => [])
  const movement: CashMovement = { id: crypto.randomUUID(), type, amount, reason: reason.trim(), createdAt: new Date().toISOString(), createdBy: userId }
  await setCollection(MOVEMENTS_KEY, [...movements, movement])
  await enqueueSync({ entityType: 'cash_movement', entityId: movement.id, operation: 'create' })
  return movement
}

// ---------- COGS / Gross Profit / Net Profit ----------

function isSameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso)
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate()
}

function computeCogs(sales: Sale[]): number {
  // A sale created before unitCost was tracked has no cost saved on its
  // line items — treat that as 0 rather than letting undefined * qty
  // produce NaN and poison every figure derived from it (Gross Profit,
  // Net Profit). This only affects historical data from before the fix;
  // every sale going forward always has a real cost snapshot.
  return sales.reduce((sum, s) => sum + s.items.reduce((lineSum, i) => lineSum + (i.unitCost ?? 0) * i.quantity, 0), 0)
}

/** "Sales = Sum(Selling Price × Quantity Sold), COGS = Sum(Buying Price
 *  × Quantity Sold), Gross Profit = Sales − COGS, Net Profit = Gross
 *  Profit − Operating Expenses." Pass `sameDayAs` to scope to a single
 *  day (Dashboard's "Today's..." KPIs); omit it for an all-time summary. */
export async function getFinancialSummary(sameDayAs?: Date): Promise<FinancialSummary> {
  const [allSales, allExpenses] = await Promise.all([listSales(), listExpenses()])
  const completedSales = allSales.filter((s) => s.status === 'completed' && (!sameDayAs || isSameDay(s.createdAt, sameDayAs)))
  const paidExpenses = allExpenses.filter((e) => e.status === 'paid' && (!sameDayAs || isSameDay(e.paidAt ?? e.expenseDate, sameDayAs)))

  const salesUgx = completedSales.reduce((sum, s) => sum + s.totalAmount, 0)
  const cogsUgx = computeCogs(completedSales)
  const grossProfitUgx = salesUgx - cogsUgx
  const expensesUgx = paidExpenses.reduce((sum, e) => sum + e.amount, 0)
  const netProfitUgx = grossProfitUgx - expensesUgx

  return { salesUgx, cogsUgx, grossProfitUgx, expensesUgx, netProfitUgx }
}

// ---------- Cash in Hand ----------
// "Never subtract COGS when calculating Cash in Hand. COGS affects
// profit, not cash." — deliberately absent from this function.

export async function getCashInHandBreakdown(): Promise<CashInHandBreakdown> {
  const [settings, sales, creditPayments, supplierPayments, expenses, movements] = await Promise.all([
    getAccountingSettings(),
    listSales(),
    listCreditPayments(),
    listSupplierPayments(),
    listExpenses(),
    listCashMovements(),
  ])

  const cashSalesUgx = sales.filter((s) => s.status === 'completed' && s.paymentMethod !== 'credit').reduce((sum, s) => sum + s.totalAmount, 0)
  const creditPaymentsReceivedUgx = creditPayments.reduce((sum, p) => sum + p.amount, 0)
  const businessExpensesPaidUgx = expenses.filter((e) => e.status === 'paid').reduce((sum, e) => sum + e.amount, 0)
  const supplierPaymentsUgx = supplierPayments.reduce((sum, p) => sum + p.amount, 0)
  const bankDepositsUgx = movements.filter((m) => m.type === 'bank_deposit').reduce((sum, m) => sum + m.amount, 0)
  const ownerWithdrawalsUgx = movements.filter((m) => m.type === 'owner_withdrawal').reduce((sum, m) => sum + m.amount, 0)
  const cashAdjustmentsUgx = movements.filter((m) => m.type === 'adjustment').reduce((sum, m) => sum + m.amount, 0)

  const cashInHandUgx =
    settings.openingCashUgx +
    cashSalesUgx +
    creditPaymentsReceivedUgx -
    businessExpensesPaidUgx -
    supplierPaymentsUgx -
    bankDepositsUgx -
    ownerWithdrawalsUgx +
    cashAdjustmentsUgx

  return {
    openingCashUgx: settings.openingCashUgx,
    cashSalesUgx,
    creditPaymentsReceivedUgx,
    businessExpensesPaidUgx,
    supplierPaymentsUgx,
    bankDepositsUgx,
    ownerWithdrawalsUgx,
    cashAdjustmentsUgx,
    cashInHandUgx,
  }
}
