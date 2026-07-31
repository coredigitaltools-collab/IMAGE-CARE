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
// profit, not cash." — COGS never appears in the Cash in Hand formula
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
  createdAt: string
  createdBy: string
}

export interface AccountingSettings {
  openingCashUgx: number
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
