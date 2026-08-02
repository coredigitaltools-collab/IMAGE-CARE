// ---------- Shared Accounting Engine (IMC Accounting Engine Correction v1.0) ----------
// One engine, read by every module that shows a financial number. Core
// formulas, verbatim from the spec:
//   Sales = Sum(Selling Price × Quantity Sold)
//   COGS  = Sum(Buying Price × Quantity Sold)
//   Gross Profit = Sales − COGS
//   Net Profit = Gross Profit − Operating Expenses
//   Cash in Hand = Opening Cash + Cash Sales + Credit Payments Received
//                  − Business Expenses Paid − Supplier Payments
//                  − Bank Deposits − Owner Withdrawals ± Cash Adjustments
// "Never subtract COGS when calculating Cash in Hand. COGS affects
// profit, not cash.", COGS never appears in the Cash in Hand formula
// below; it exists only in getFinancialSummary().

export type CashMovementType = 'bank_deposit' | 'owner_withdrawal' | 'adjustment'
export const CASH_MOVEMENT_LABELS: Record<CashMovementType, string> = {
  bank_deposit: 'Bank Deposit',
  owner_withdrawal: 'Owner Withdrawal',
  adjustment: 'Cash Adjustment',
}

export interface CashMovement {
  id: string
  type: CashMovementType
  // Bank deposits and owner withdrawals are always entered as a positive
  // amount removed from the till; adjustments are signed (+ found extra
  // cash, − found a shortfall) since a reconciliation can go either way.
  amount: number
  reason: string
  // Which bank account a deposit went to, for Bank Reconciliation
  // (IMC-SRS-019). Optional and null for owner withdrawals, adjustments,
  // and any deposit recorded before bank accounts existed.
  bankAccountId: string | null
  createdAt: string
  createdBy: string
}

export interface AccountingSettings {
  openingCashUgx: number
  // Cash Flow (IMC-SRS-015) needs a bank balance too. The only real,
  // tracked flow into the bank in this app is a Bank Deposit movement,
  // so Bank Balance = opening balance + every deposit ever recorded.
  // Nothing invents a "spend from bank" flow that doesn't exist elsewhere.
  openingBankBalanceUgx: number
}

export interface FinancialSummary {
  salesUgx: number
  cogsUgx: number
  grossProfitUgx: number
  expensesUgx: number
  netProfitUgx: number
}

export interface CashInHandBreakdown {
  openingCashUgx: number
  cashSalesUgx: number
  creditPaymentsReceivedUgx: number
  businessExpensesPaidUgx: number
  supplierPaymentsUgx: number
  bankDepositsUgx: number
  ownerWithdrawalsUgx: number
  cashAdjustmentsUgx: number
  cashInHandUgx: number
}

// ---------- Cash Flow (IMC-SRS-015) ----------
// "Cash in Hand follows the shared accounting engine. Use the shared
// accounting engine and the IMC Accounting Engine Correction standard
// for all cash calculations." Every figure below is built from the same
// Cash in Hand breakdown above, not a second, competing calculation.

export type CashLedgerEntryType =
  | 'cash_sale'
  | 'credit_payment_received'
  | 'expense_paid'
  | 'supplier_payment'
  | 'bank_deposit'
  | 'owner_withdrawal'
  | 'adjustment'

export const CASH_LEDGER_TYPE_LABELS: Record<CashLedgerEntryType, string> = {
  cash_sale: 'Cash Sale',
  credit_payment_received: 'Credit Payment Received',
  expense_paid: 'Expense Paid',
  supplier_payment: 'Supplier Payment',
  bank_deposit: 'Bank Deposit',
  owner_withdrawal: 'Owner Withdrawal',
  adjustment: 'Cash Adjustment',
}

export interface CashLedgerEntry {
  id: string
  date: string
  type: CashLedgerEntryType
  description: string
  direction: 'in' | 'out'
  amountUgx: number
  runningBalanceUgx: number
}

export interface BankBalanceBreakdown {
  openingBankBalanceUgx: number
  totalDepositsUgx: number
  bankBalanceUgx: number
}

export interface CashFlowDashboardKpis {
  openingCashUgx: number
  cashReceivedUgx: number
  cashPaidOutUgx: number
  cashInHandUgx: number
  bankBalanceUgx: number
  netCashFlowUgx: number
}

export interface CashForecastPoint {
  date: string
  projectedCashInHandUgx: number
}

export interface CashForecast {
  dailyAverageNetUgx: number
  windowDays: number
  points: CashForecastPoint[]
}

export interface CashReconciliation {
  id: string
  date: string
  systemAmountUgx: number
  countedAmountUgx: number
  varianceUgx: number
  notes: string
  reconciledAt: string
  reconciledBy: string
}
