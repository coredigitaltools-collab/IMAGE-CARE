import { getCollection, setCollection, getSingleton, setSingleton, enqueueSync } from '../lib/localStore'
import { listSales } from './salesService'
import { listPayments as listCreditPayments } from './creditService'
import { listInvoicePayments as listSupplierPayments } from './purchasingService'
import { listExpenses } from './expenseService'
import type { Sale } from '../types/sales'
import type {
  AccountingSettings,
  BankBalanceBreakdown,
  CashFlowDashboardKpis,
  CashForecast,
  CashInHandBreakdown,
  CashLedgerEntry,
  CashMovement,
  CashMovementType,
  CashReconciliation,
  FinancialSummary,
} from '../types/accounting'

const MOVEMENTS_KEY = 'accounting:cash-movements'
const SETTINGS_KEY = 'accounting:settings'
const RECONCILIATIONS_KEY = 'accounting:reconciliations'

function seedAccountingSettings(): AccountingSettings {
  return { openingCashUgx: 0, openingBankBalanceUgx: 0 }
}

export async function getAccountingSettings(): Promise<AccountingSettings> {
  const settings = await getSingleton(SETTINGS_KEY, seedAccountingSettings)
  // An install saved before openingBankBalanceUgx existed would return it
  // as undefined here, which would turn Bank Balance into NaN the same
  // way a missing unitCost once did for COGS. Same fix: default to 0.
  return { openingCashUgx: settings.openingCashUgx ?? 0, openingBankBalanceUgx: settings.openingBankBalanceUgx ?? 0 }
}

export async function saveAccountingSettings(input: AccountingSettings): Promise<AccountingSettings> {
  await setSingleton(SETTINGS_KEY, input)
  await enqueueSync({ entityType: 'accounting_settings', entityId: 'singleton', operation: 'update' })
  return input
}

// ---------- Cash Movements (Bank Deposits / Owner Withdrawals / Adjustments) ----------
// The three inputs to Cash in Hand that no other module tracks. Every
// one is a deliberate, reasoned, audited entry, never inferred.

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

function computeCogs(sales: Sale[]): number {
  // A sale created before unitCost was tracked has no cost saved on its
  // line items, treat that as 0 rather than letting undefined * qty
  // produce NaN and poison every figure derived from it (Gross Profit,
  // Net Profit). This only affects historical data from before the fix;
  // every sale going forward always has a real cost snapshot.
  return sales.reduce((sum, s) => sum + s.items.reduce((lineSum, i) => lineSum + (i.unitCost ?? 0) * i.quantity, 0), 0)
}

/** "Sales = Sum(Selling Price × Quantity Sold), COGS = Sum(Buying Price
 *  × Quantity Sold), Gross Profit = Sales − COGS, Net Profit = Gross
 *  Profit − Operating Expenses." Pass a start/end range to scope it
 *  (Monthly Summary's whole-month figures); omit both for an all-time
 *  summary. This is the one place that logic lives; every other date
 *  scoped summary in the app (daily, monthly) calls through here so
 *  they can never quietly drift apart from each other. */
export async function getFinancialSummaryForRange(start?: Date, end?: Date): Promise<FinancialSummary> {
  const [allSales, allExpenses] = await Promise.all([listSales(), listExpenses()])
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime()
    if (start && t < start.getTime()) return false
    if (end && t > end.getTime()) return false
    return true
  }
  const completedSales = allSales.filter((s) => s.status === 'completed' && inRange(s.createdAt))
  const paidExpenses = allExpenses.filter((e) => e.status === 'paid' && inRange(e.paidAt ?? e.expenseDate))

  const salesUgx = completedSales.reduce((sum, s) => sum + s.totalAmount, 0)
  const cogsUgx = computeCogs(completedSales)
  const grossProfitUgx = salesUgx - cogsUgx
  const expensesUgx = paidExpenses.reduce((sum, e) => sum + e.amount, 0)
  const netProfitUgx = grossProfitUgx - expensesUgx

  return { salesUgx, cogsUgx, grossProfitUgx, expensesUgx, netProfitUgx }
}

/** Today's KPIs on the main Dashboard, expressed as the same range
 *  based summary above, scoped to just today. */
export async function getFinancialSummary(sameDayAs?: Date): Promise<FinancialSummary> {
  if (!sameDayAs) return getFinancialSummaryForRange()
  const start = new Date(sameDayAs)
  start.setHours(0, 0, 0, 0)
  const end = new Date(sameDayAs)
  end.setHours(23, 59, 59, 999)
  return getFinancialSummaryForRange(start, end)
}

// ---------- Cash in Hand ----------
// "Never subtract COGS when calculating Cash in Hand. COGS affects
// profit, not cash.", deliberately absent from this function.

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

// ---------- Cash Flow (IMC-SRS-015) ----------
// Everything below reads the same sources getCashInHandBreakdown()
// already reads. Nothing here recomputes Cash in Hand a second way.

export async function getBankBalance(): Promise<BankBalanceBreakdown> {
  const [settings, movements] = await Promise.all([getAccountingSettings(), listCashMovements()])
  const totalDepositsUgx = movements.filter((m) => m.type === 'bank_deposit').reduce((sum, m) => sum + m.amount, 0)
  return {
    openingBankBalanceUgx: settings.openingBankBalanceUgx,
    totalDepositsUgx,
    bankBalanceUgx: settings.openingBankBalanceUgx + totalDepositsUgx,
  }
}

export async function getCashFlowDashboardKpis(): Promise<CashFlowDashboardKpis> {
  const [breakdown, bank] = await Promise.all([getCashInHandBreakdown(), getBankBalance()])
  const cashReceivedUgx = breakdown.cashSalesUgx + breakdown.creditPaymentsReceivedUgx
  const cashPaidOutUgx = breakdown.businessExpensesPaidUgx + breakdown.supplierPaymentsUgx + breakdown.bankDepositsUgx + breakdown.ownerWithdrawalsUgx
  return {
    openingCashUgx: breakdown.openingCashUgx,
    cashReceivedUgx,
    cashPaidOutUgx,
    cashInHandUgx: breakdown.cashInHandUgx,
    bankBalanceUgx: bank.bankBalanceUgx,
    netCashFlowUgx: cashReceivedUgx - cashPaidOutUgx,
  }
}

/** A single chronological view across every source that touches cash:
 *  sales, credit collections, expense and supplier payments, and every
 *  recorded cash movement, each tagged in or out with a running
 *  balance. This is the "Cash Ledger" core feature; nothing here is a
 *  new source of truth, it is a merge and sort of data every one of
 *  those modules already owns. */
export async function getCashLedger(): Promise<CashLedgerEntry[]> {
  const [sales, creditPayments, expenses, supplierPayments, movements] = await Promise.all([
    listSales(),
    listCreditPayments(),
    listExpenses(),
    listSupplierPayments(),
    listCashMovements(),
  ])

  type RawEntry = { date: string; type: CashLedgerEntry['type']; description: string; direction: 'in' | 'out'; amountUgx: number }
  const raw: RawEntry[] = []

  for (const s of sales) {
    if (s.status === 'completed' && s.paymentMethod !== 'credit') {
      raw.push({ date: s.createdAt, type: 'cash_sale', description: `Sale ${s.reference}`, direction: 'in', amountUgx: s.totalAmount })
    }
  }
  for (const p of creditPayments) {
    raw.push({ date: p.createdAt, type: 'credit_payment_received', description: `Credit payment${p.reference ? ` (${p.reference})` : ''}`, direction: 'in', amountUgx: p.amount })
  }
  for (const e of expenses) {
    if (e.status === 'paid' && e.paidAt) {
      raw.push({ date: e.paidAt, type: 'expense_paid', description: `${e.categoryName}: ${e.description || e.reference}`, direction: 'out', amountUgx: e.amount })
    }
  }
  for (const p of supplierPayments) {
    raw.push({ date: p.createdAt, type: 'supplier_payment', description: `Supplier payment${p.reference ? ` (${p.reference})` : ''}`, direction: 'out', amountUgx: p.amount })
  }
  for (const m of movements) {
    if (m.type === 'adjustment') {
      raw.push({ date: m.createdAt, type: 'adjustment', description: m.reason, direction: m.amount >= 0 ? 'in' : 'out', amountUgx: Math.abs(m.amount) })
    } else {
      raw.push({ date: m.createdAt, type: m.type, description: m.reason, direction: 'out', amountUgx: m.amount })
    }
  }

  raw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const settings = await getAccountingSettings()
  let balance = settings.openingCashUgx
  return raw.map((e) => {
    balance += e.direction === 'in' ? e.amountUgx : -e.amountUgx
    return { id: crypto.randomUUID(), ...e, runningBalanceUgx: balance }
  })
}

/** A simple, honestly-labeled projection: the average daily net cash
 *  flow over the trailing window, extrapolated forward. No hidden
 *  model, no fabricated trend, just the same arithmetic a business
 *  owner could do with a calculator, automated. */
export async function getCashForecast(windowDays = 30, forecastDays = 14): Promise<CashForecast> {
  const [ledger, breakdown] = await Promise.all([getCashLedger(), getCashInHandBreakdown()])
  const windowStart = Date.now() - windowDays * 86_400_000
  const inWindow = ledger.filter((e) => new Date(e.date).getTime() >= windowStart)
  const netInWindow = inWindow.reduce((sum, e) => sum + (e.direction === 'in' ? e.amountUgx : -e.amountUgx), 0)
  const dailyAverageNetUgx = inWindow.length > 0 ? Math.round(netInWindow / windowDays) : 0

  const points: CashForecast['points'] = []
  let projected = breakdown.cashInHandUgx
  for (let i = 1; i <= forecastDays; i++) {
    projected += dailyAverageNetUgx
    const date = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10)
    points.push({ date, projectedCashInHandUgx: projected })
  }
  return { dailyAverageNetUgx, windowDays, points }
}

// ---------- Cash Reconciliation ----------
// "Support daily cash reconciliation": count the physical till, compare
// it to what the system says Cash in Hand should be, and record the
// difference. A variance automatically becomes a Cash Adjustment
// movement, the same audited path any other adjustment takes, so Cash
// in Hand stays accurate going forward instead of silently drifting.

export async function listReconciliations(): Promise<CashReconciliation[]> {
  const list = await getCollection<CashReconciliation>(RECONCILIATIONS_KEY, () => [])
  return [...list].sort((a, b) => new Date(b.reconciledAt).getTime() - new Date(a.reconciledAt).getTime())
}

export async function recordReconciliation(countedAmountUgx: number, notes: string, userId: string): Promise<CashReconciliation> {
  const breakdown = await getCashInHandBreakdown()
  const systemAmountUgx = breakdown.cashInHandUgx
  const varianceUgx = countedAmountUgx - systemAmountUgx

  const reconciliation: CashReconciliation = {
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    systemAmountUgx,
    countedAmountUgx,
    varianceUgx,
    notes: notes.trim(),
    reconciledAt: new Date().toISOString(),
    reconciledBy: userId,
  }

  const existing = await getCollection<CashReconciliation>(RECONCILIATIONS_KEY, () => [])
  await setCollection(RECONCILIATIONS_KEY, [...existing, reconciliation])
  await enqueueSync({ entityType: 'cash_reconciliation', entityId: reconciliation.id, operation: 'create' })

  if (varianceUgx !== 0) {
    const reason = `Reconciliation on ${reconciliation.date}: counted ${countedAmountUgx.toLocaleString()} vs system ${systemAmountUgx.toLocaleString()}${notes ? `, ${notes}` : ''}`
    await recordCashMovement('adjustment', varianceUgx, reason, userId)
  }

  return reconciliation
}
