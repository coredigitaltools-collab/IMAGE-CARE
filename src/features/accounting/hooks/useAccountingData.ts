import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as accountingService from '../../../services/accountingService'
import { useUserContext, useActiveBranch } from '../../../context/AppContext'
import { listCashTransactions, recordCashMovement as recordCashMovementReal } from '../../../services/financial/financialServices'
import { getCashPosition } from '../../../services/reporting/reportingService'
import type { AccountingSettings, CashMovement, CashMovementType, CashFlowDashboardKpis, CashLedgerEntry, CashLedgerEntryType, CashInHandBreakdown, CashForecast } from '../../../types/accounting'
import type { CashTransaction } from '../../../types/database'

// Bug fix (2026-09-10), "Run a cash reconciliation": this used to fire
// invalidateQueries() without returning the promises it produced. Every
// onSuccess in this file calls it as `onSuccess: () => invalidateAll(qc)`,
// and react-query's mutateAsync() only waits for what onSuccess returns -
// since the old version returned undefined, mutateAsync() (and so every
// `await x.mutateAsync(...)` call site, e.g. CashReconciliationPage.tsx)
// resolved before the invalidated queries had actually refetched. A
// caller that read query data (or showed a toast) right after the await -
// like the reconciliation page's "System says cash in hand" figure -
// could still be looking at the pre-mutation value. Returning the
// combined promise makes mutateAsync() genuinely wait for the refetch.
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['accounting'] }),
    qc.invalidateQueries({ queryKey: ['dashboard-summary'] }),
  ])
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

// Bug fix (2026-09-10), "View cash flow forecast": this used to call
// accountingService.getCashForecast(), which reads the same disconnected
// local/legacy data source as the old cash-reconciliation bug (see
// useRecordReconciliation below and the comment on
// accountingService.getCashForecast()) - so the forecast's starting point
// and trend never matched the real Cash in Hand figure this page's own
// data actually shows elsewhere in the app. Now computed directly from
// the same real data useCashInHandBreakdown/useCashLedger already use
// (getCashPosition + listCashTransactions), and also reports the average
// daily inflow/outflow separately (not just the blended net), which is
// what CashForecastPage.tsx needed to show "projected inflows" and
// "projected outflows" as their own sections.
export function useCashForecast(windowDays = 30, forecastDays = 14) {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  return useQuery({
    queryKey: ['accounting', 'cash-forecast', ctx.business_id, branch, windowDays, forecastDays],
    queryFn: async (): Promise<CashForecast> => {
      const [position, txns] = await Promise.all([
        getCashPosition(ctx, branch ?? undefined).then(unwrap),
        listCashTransactions(ctx, { branch_id: branch ?? undefined }).then(unwrap),
      ])
      const cashInHandUgx = typeof position?.net_position === 'number' ? position.net_position : 0
      const rows: CashTransaction[] = Array.isArray(txns) ? txns : []
      const windowStart = Date.now() - windowDays * 86_400_000
      const inWindow = rows.filter((r) => new Date(r.transaction_date).getTime() >= windowStart)

      let inUgx = 0
      let outUgx = 0
      for (const row of inWindow) {
        const amount = Math.abs(Number(row.amount))
        if (directionFor(row.transaction_type) === 'in') inUgx += amount
        else outUgx += amount
      }
      const dailyAverageInUgx = inWindow.length > 0 ? Math.round(inUgx / windowDays) : 0
      const dailyAverageOutUgx = inWindow.length > 0 ? Math.round(outUgx / windowDays) : 0
      const dailyAverageNetUgx = dailyAverageInUgx - dailyAverageOutUgx

      const points: CashForecast['points'] = []
      let projected = cashInHandUgx
      for (let i = 1; i <= forecastDays; i++) {
        projected += dailyAverageNetUgx
        const date = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10)
        points.push({ date, projectedCashInHandUgx: projected })
      }
      return { dailyAverageNetUgx, dailyAverageInUgx, dailyAverageOutUgx, windowDays, points }
    },
  })
}

export function useReconciliations() {
  // LOCAL-ONLY: no real backend table for the reconciliation log itself
  // exists yet (see docs/MODULE_INTEGRATION_MAP.md gap). The system amount
  // stored on each entry is real as of the 2026-09-10 fix below though -
  // see useRecordReconciliation.
  return useQuery({ queryKey: ['accounting', 'reconciliations'], queryFn: accountingService.listReconciliations })
}

// Bug fix (2026-09-10), "Run a cash reconciliation": this used to call
// accountingService.recordReconciliation(), which internally recomputed
// its own "system amount" from a disconnected local/legacy data source
// (old localStorage-backed sales/credit/purchasing/expense services)
// instead of the real Supabase cash position this page actually displays
// (useCashInHandBreakdown, above) - so a logged reconciliation's stored
// system amount, and any variance/adjustment derived from it, never
// matched what the user saw on screen. Worse, when there was a variance,
// it posted a "cash adjustment" through the local-only recordCashMovement,
// which had zero effect on the real books.
//
// Now computes the variance from the same real getCashPosition() data the
// page displays, and - when there is a variance - posts a real
// cash_transactions adjustment row via recordCashMovementReal (the same
// function "Record cash movement" uses), so the adjustment genuinely
// affects Cash in Hand going forward. The reconciliation log entry itself
// still gets persisted locally (no real reconciliations table exists
// yet), but now with the real system amount.
export function useRecordReconciliation(userId: string) {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ countedAmountUgx, notes }: { countedAmountUgx: number; notes: string }) => {
      const position = await getCashPosition(ctx, branch ?? undefined).then(unwrap)
      const systemAmountUgx = typeof position?.net_position === 'number' ? position.net_position : 0
      const varianceUgx = countedAmountUgx - systemAmountUgx

      if (varianceUgx !== 0) {
        const today = new Date().toISOString().slice(0, 10)
        const reason = `Reconciliation on ${today}: counted ${countedAmountUgx.toLocaleString()} vs system ${systemAmountUgx.toLocaleString()}${notes ? `, ${notes}` : ''}`
        await recordCashMovementReal(ctx, {
          branch_id: (branch ?? ctx.branch_id) as string,
          type: 'adjustment',
          amount: varianceUgx,
          reason,
          bank_account_id: null,
        }).then(unwrap)
      }

      return accountingService.recordReconciliation(countedAmountUgx, systemAmountUgx, notes, userId)
    },
    onSuccess: () => invalidateAll(qc),
  })
}
