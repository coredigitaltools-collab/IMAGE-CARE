import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as accountingService from '../../../services/accountingService'
import { useUserContext, useActiveBranch } from '../../../context/AppContext'
import { listCashTransactions } from '../../../services/financial/financialServices'
import { getCashPosition } from '../../../services/reporting/reportingService'
import type { AccountingSettings, CashMovementType, CashFlowDashboardKpis, CashLedgerEntry, CashLedgerEntryType, CashInHandBreakdown } from '../../../types/accounting'
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
      const position = await getCashPosition(ctx, branch ?? undefined).then(unwrap)
      const cashIn = typeof position?.cash_in === 'number' ? position.cash_in : 0
      const cashOut = typeof position?.cash_out === 'number' ? position.cash_out : 0
      const cashInHandUgx = typeof position?.net_position === 'number' ? position.net_position : cashIn - cashOut
      // The real cash-position function only exposes total cash_in /
      // cash_out for the branch, not the legacy per-source breakdown
      // (cash sales vs credit payments vs supplier payments, etc). Rather
      // than fabricate a split the real data can't support, the total
      // in/out are surfaced under the closest matching buckets and every
      // other bucket stays honestly at 0. cashInHandUgx itself is real.
      return {
        openingCashUgx: 0,
        cashSalesUgx: cashIn,
        creditPaymentsReceivedUgx: 0,
        businessExpensesPaidUgx: cashOut,
        supplierPaymentsUgx: 0,
        bankDepositsUgx: 0,
        ownerWithdrawalsUgx: 0,
        cashAdjustmentsUgx: 0,
        cashInHandUgx,
      }
    },
  })
}

// ---- Everything below has no real backend service yet; unchanged. ----

export function useCashMovements() {
  // LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
  return useQuery({ queryKey: ['accounting', 'cash-movements'], queryFn: accountingService.listCashMovements })
}

export function useRecordCashMovement(userId: string) {
  const qc = useQueryClient()
  // LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
  return useMutation({
    mutationFn: ({ type, amount, reason, bankAccountId }: { type: CashMovementType; amount: number; reason: string; bankAccountId?: string | null }) =>
      accountingService.recordCashMovement(type, amount, reason, userId, bankAccountId ?? null),
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
