import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as accountingService from '../../../services/accountingService'
import { useUserContext, useActiveBranch } from '../../../context/AppContext'
import { listCashTransactions, recordCashMovement as recordCashMovementReal } from '../../../services/financial/financialServices'
import { getCashPosition } from '../../../services/reporting/reportingService'
import type { AccountingSettings, CashMovement, CashMovementType, CashFlowDashboardKpis, CashLedgerEntry, CashLedgerEntryType, CashInHandBreakdown } from '../../../types/accounting'
import type { CashTransaction } from '../../../types/database'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['accounting'] })
  qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error')
  const d = r.data
  if (d === null || d === undefined) return []
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string, unknown>).items))
    return (d as Record<string, unknown>).items
  return d
}

// ---- Real, Supabase-backed cash data (Stage 6: rewired off IndexedDB) ----
// These three read the same real services useCashFlow (useModuleHooks.ts,
// SRS-015) uses: reportingService.getCashPosition and
// financialServices.listCashTransactions. No IndexedDB involved.

/** Maps a real cash_transactions row (transaction_type + reference_type,
 *  per cashEngine.ts) onto the closest CashLedgerEntryType label. */
function ledgerTypeFor(row: CashTransaction): CashLedgerEntryType {
  // Bug fix (2026-09-07): manual cash movements (Record cash movement) now
  // write real cash_transactions rows with reference_type set to the
  // movement kind itself ('bank_deposit' | 'owner_withdrawal' |
  // 'adjustment' - see recordCashMovement() in financialServices.ts).
  // Check these first so they don't fall through to the generic
  // cash_sale/expense_paid buckets below.
  if (row.reference_type === 'bank_deposit') return 'bank_deposit'
  if (row.reference_type === 'owner_withdrawal') return 'owner_withdrawal'
  if (row.reference_type === 'adjustment') return 'adjustment'
  switch (row.transaction_type) {
    case 'cash_in':
      return row.reference_type === 'customer' || row.reference_type === 'credit' ? 'credit_payment_received' : 'cash_sale'
    case 'cash_out':
      return row.reference_type === 'purchase' || row.reference_type === 'supplier' ? 'supplier_payment' : 'expense_paid'
    case 'deposit':
      return 'bank_deposit'
    case 'withdrawal':
      return 'owner_withdrawal'
    default:
      return 'adjustment'
  }
}

function directionFor(transactionType: string): 'in' | 'out' {
  return transactionType === 'cash_in' || transactionType === 'deposit' ? 'in' : 'out'
}

export function useCashFlowDashboardKpis() {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  return useQuery({
    queryKey: ['accounting', 'cash-flow-kpis', ctx.business_id, branch],
    queryFn: async (): Promise<CashFlowDashboardKpis> => {
      const [position, txns] = await Promise.all([
        getCashPosition(ctx, branch ?? undefined).then(unwrap),
        listCashTransactions(ctx, {}).then(unwrap),
      ])
      const rows: CashTransaction[] = Array.isArray(txns) ? txns : []
      const cashReceivedUgx =
        typeof position?.cash_in === 'number'
          ? position.cash_in
          : rows.filter((r) => directionFor(r.transaction_type) === 'in').reduce((sum, r) => sum + Number(r.amount), 0)
      const cashPaidOutUgx =
        typeof position?.cash_out === 'number'
          ? position.cash_out
          : rows.filter((r) => directionFor(r.transaction_type) === 'out').reduce((sum, r) => sum + Number(r.amount), 0)
      const cashInHandUgx = typeof position?.net_position === 'number' ? position.net_position : cashReceivedUgx - cashPaidOutUgx
      return {
        // Real backend has no separate "opening balance" concept; net
        // position already reflects the full transaction history.
        openingCashUgx: 0,
        cashReceivedUgx,
        cashPaidOutUgx,
        cashInHandUgx,
        // No real backend function for bank balance yet (see useBankBalance below).
        bankBalanceUgx: 0,
        netCashFlowUgx: cashReceivedUgx - cashPaidOutUgx,
      }
    },
  })
}

export function useCashLedger() {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['accounting', 'cash-ledger', ctx.business_id],
    queryFn: async (): Promise<CashLedgerEntry[]> => {
      const items = await listCashTransactions(ctx, {}).then(unwrap)
      const rows: CashTransaction[] = Array.isArray(items) ? items : []
      // listCashTransactions returns newest-first; rebuild chronological
      // order so the running balance below accumulates correctly.
      const ascending = [...rows].sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime())
      let balance = 0
      return ascending.map((row) => {
        const direction = directionFor(row.transaction_type)
        const amountUgx = Math.abs(Number(row.amount))
        balance += direction === 'in' ? amountUgx : -amountUgx
        return {
          id: row.id,
          date: row.transaction_date,
          type: ledgerTypeFor(row),
          description: row.description,
          direction,
          amountUgx,
          runningBalanceUgx: balance,
        }
      })
    },
  })
}

export function useCashInHandBreakdown() {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  return useQuery({
    queryKey: ['accounting', 'cash-in-hand', ctx.business_id, branch],
    queryFn: async (): Promise<CashInHandBreakdown> => {
      const [position, txns] = await Promise.all([
        getCashPosition(ctx, branch ?? undefined).then(unwrap),
        listCashTransactions(ctx, { branch_id: branch ?? undefined }).then(unwrap),
      ])
      const cashIn = typeof position?.cash_in === 'number' ? position.cash_in : 0
      const cashOut = typeof position?.cash_out === 'number' ? position.cash_out : 0
      const cashInHandUgx = typeof position?.net_position === 'number' ? position.net_position : cashIn - cashOut
      // Bug fix (2026-09-07): now that "Record cash movement" writes real
      // cash_transactions rows (see recordCashMovement() in
      // financialServices.ts), bank deposits/owner withdrawals/adjustments
      // are real cash_out (or, for a positive adjustment, cash_in) rows
      // too - lumping the whole cashOut total into "businessExpensesPaidUgx"
      // would now silently overstate actual expenses by whatever was also
      // deposited/withdrawn. Bucket by the same reference_type the ledger
      // (ledgerTypeFor above) already uses, so every figure on this page
      // stays accurate rather than merely non-zero.
      const rows: CashTransaction[] = Array.isArray(txns) ? txns : []
      let cashSalesUgx = 0
      let creditPaymentsReceivedUgx = 0
      let businessExpensesPaidUgx = 0
      let supplierPaymentsUgx = 0
      let bankDepositsUgx = 0
      let ownerWithdrawalsUgx = 0
      let cashAdjustmentsUgx = 0
      for (const row of rows) {
        const amount = Math.abs(Number(row.amount))
        switch (ledgerTypeFor(row)) {
          case 'cash_sale': cashSalesUgx += amount; break
          case 'credit_payment_received': creditPaymentsReceivedUgx += amount; break
          case 'expense_paid': businessExpensesPaidUgx += amount; break
          case 'supplier_payment': supplierPaymentsUgx += amount; break
          case 'bank_deposit': bankDepositsUgx += amount; break
          case 'owner_withdrawal': ownerWithdrawalsUgx += amount; break
          case 'adjustment': cashAdjustmentsUgx += row.transaction_type === 'cash_out' ? -amount : amount; break
        }
      }
      return {
        openingCashUgx: 0,
        cashSalesUgx,
        creditPaymentsReceivedUgx,
        businessExpensesPaidUgx,
        supplierPaymentsUgx,
        bankDepositsUgx,
        ownerWithdrawalsUgx,
        cashAdjustmentsUgx,
        cashInHandUgx,
      }
    },
  })
}

// Bug fix (2026-09-07): both of these used to be LOCAL-ONLY (browser
// localStorage, via accountingService.ts) - see recordCashMovement() in
// financialServices.ts for the full explanation. Now real and Supabase-backed,
// like every other cash/ledger read+write in this file.

export function useCashMovements() {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  return useQuery({
    queryKey: ['accounting', 'cash-movements', ctx.business_id, branch],
    queryFn: async (): Promise<CashMovement[]> => {
      const items = await listCashTransactions(ctx, { branch_id: branch ?? undefined }).then(unwrap)
      const rows: CashTransaction[] = Array.isArray(items) ? items : []
      return rows
        .filter((r) => r.reference_type === 'bank_deposit' || r.reference_type === 'owner_withdrawal' || r.reference_type === 'adjustment')
        .map((r): CashMovement => ({
          id: r.id,
          type: r.reference_type as CashMovementType,
          amount: r.reference_type === 'adjustment' && r.transaction_type === 'cash_out' ? -Math.abs(Number(r.amount)) : Math.abs(Number(r.amount)),
          reason: r.description,
          bankAccountId: r.bank_account_id ?? null,
          createdAt: r.transaction_date,
          // created_by is a real column on cash_transactions but isn't on
          // the (incomplete) CashTransaction TS type - read it defensively.
          createdBy: (r as unknown as { created_by?: string }).created_by ?? '',
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    },
  })
}

export function useRecordCashMovement(_userId: string) {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ type, amount, reason, bankAccountId }: { type: CashMovementType; amount: number; reason: string; bankAccountId?: string | null }) =>
      recordCashMovementReal(ctx, {
        branch_id: (branch ?? ctx.branch_id) as string,
        type,
        amount,
        reason,
        bank_account_id: bankAccountId ?? null,
      }).then(unwrap),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useAccountingSettings() {
  // LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
  return useQuery({ queryKey: ['accounting', 'settings'], queryFn: accountingService.getAccountingSettings })
}

export function useSaveAccountingSettings() {
  const qc = useQueryClient()
  // LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
  return useMutation({
    mutationFn: (input: AccountingSettings) => accountingService.saveAccountingSettings(input),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useBankBalance() {
  // LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
  return useQuery({ queryKey: ['accounting', 'bank-balance'], queryFn: accountingService.getBankBalance })
}

export function useCashForecast(windowDays?: number, forecastDays?: number) {
  // LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
  return useQuery({
    queryKey: ['accounting', 'cash-forecast', windowDays, forecastDays],
    queryFn: () => accountingService.getCashForecast(windowDays, forecastDays),
  })
}

export function useReconciliations() {
  // LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
  return useQuery({ queryKey: ['accounting', 'reconciliations'], queryFn: accountingService.listReconciliations })
}

export function useRecordReconciliation(userId: string) {
  const qc = useQueryClient()
  // LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
  return useMutation({
    mutationFn: ({ countedAmountUgx, notes }: { countedAmountUgx: number; notes: string }) =>
      accountingService.recordReconciliation(countedAmountUgx, notes, userId),
    onSuccess: () => invalidateAll(qc),
  })
}
