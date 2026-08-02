import type { AuditFields } from '../lib/audit'

// ---------- Bank Reconciliation (IMC-SRS-019) ----------
// "Bank balances come from reconciled transactions." A distinct, more
// conservative figure than Cash Flow's simple running deposit total:
// this module's balance only counts deposits that have actually been
// matched against a real line on the bank statement.
// "Do not alter historical transactions." Matching only sets a link and
// a flag; the underlying Sale, Expense, or CashMovement record itself
// is never edited.

export interface BankAccount extends AuditFields {
  name: string
  accountNumber: string
  openingBalanceUgx: number
}
export type BankAccountInput = Pick<BankAccount, 'name' | 'accountNumber' | 'openingBalanceUgx'>

export interface BankStatementLine {
  id: string
  bankAccountId: string
  date: string
  description: string
  amountUgx: number
  isMatched: boolean
  matchedMovementId: string | null
  matchedAt: string | null
  createdAt: string
  createdBy: string
}
export type BankStatementLineInput = Pick<BankStatementLine, 'bankAccountId' | 'date' | 'description' | 'amountUgx'>

export interface BankReconciliationDashboardKpis {
  accountCount: number
  totalReconciledBalanceUgx: number
  unmatchedStatementLineCount: number
  unmatchedDepositCount: number
}
