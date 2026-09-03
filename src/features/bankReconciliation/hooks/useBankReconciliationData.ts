import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useActiveBranch, useUserContext } from '../../../context/AppContext'
import { listCashTransactions as listCashTransactionsReal } from '../../../services/financial/financialServices'
import * as bankReconciliationService from '../../../services/bankReconciliationService'
import type { BankAccountInput, BankStatementLineInput } from '../../../types/bankReconciliation'
import type { CashMovement } from '../../../types/accounting'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['bank-reconciliation'] })
  qc.invalidateQueries({ queryKey: ['accounting'] })
}

// Same unwrap() shape as src/features/invoices/hooks/useInvoicesData.ts: throws
// on a ServiceResponse error, unwraps a PagedResponse's `.items`, otherwise
// returns `.data` as-is.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error');
  const d = r.data;
  if (d === null || d === undefined) return [];
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string, unknown>).items))
    return (d as Record<string, unknown>).items;
  return d;
}

// ---------------------------------------------------------------------------
// What is actually real for this module (verified against
// src/services/financial/financialServices.ts and the imagecare.* migrations):
//
//  - imagecare.bank_accounts (database/migrations/0009_stage2_financial.sql)
//    is a real table with RLS. 2026-09-02: bankReconciliationService's bank
//    account functions (listBankAccounts/createBankAccount/
//    archiveBankAccount) now read and write it via supabase directly - see
//    that file. Everything else in this module (statement lines, matching,
//    reconciled balance) stays local below.
//  - There is no imagecare.bank_statement_lines table at all, and no service
//    function for transaction matching or a "reconciled balance". Those stay
//    fully local below - see docs/MODULE_INTEGRATION_MAP.md gap.
//  - The one genuinely real read is imagecare.cash_transactions filtered to
//    transaction_type = 'bank_transfer' (the same query
//    src/hooks/modules/useModuleHooks.ts's useBankReconciliation makes for
//    SRS-019). It is branch-scoped only, with no bank_account_id filter,
//    because cash_transactions.bank_account_id points at real
//    imagecare.bank_accounts rows and nothing in this app ever creates one -
//    filtering on it would silently return zero rows. useUnmatchedDeposits
//    below uses this real read as its candidate-deposit source; everything
//    about *matching* those deposits to a statement line stays local.
// ---------------------------------------------------------------------------

interface DbCashTransactionRow {
  id: string
  description: string
  amount: number
  created_at: string
}

// Maps a real bank_transfer cash_transactions row onto the local CashMovement
// shape the Reconciliation page already renders (id/reason/amount/createdAt).
// bankAccountId is left null: the real row's own bank_account_id can't be
// trusted (see note above), and nothing here claims it belongs to any one
// local bank account.
function mapCashTransactionToDeposit(row: DbCashTransactionRow): CashMovement {
  return {
    id: row.id,
    type: 'bank_deposit',
    amount: row.amount,
    reason: row.description,
    bankAccountId: null,
    createdAt: row.created_at,
    createdBy: '',
  }
}

// ---------------------------------------------------------------------------
// Real, Supabase-backed hooks
// ---------------------------------------------------------------------------

// Candidate deposits come from real imagecare.cash_transactions rows tagged
// bank_transfer for the active branch (see note above for why this can't be
// scoped to the specific bank account). What counts as "matched" is still a
// purely local concept: it excludes any real transaction id already recorded
// as a matchedMovementId on one of this account's local statement lines.
export function useUnmatchedDeposits(bankAccountId: string) {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  return useQuery({
    queryKey: ['bank-reconciliation', 'unmatched-deposits', bankAccountId, ctx.business_id, branch],
    queryFn: async () => {
      const rows = (await listCashTransactionsReal(ctx, { branch_id: branch ?? undefined, transaction_type: 'bank_transfer' }, { page_size: 200 }).then(
        unwrap,
      )) as DbCashTransactionRow[]
      const lines = await bankReconciliationService.listStatementLines(bankAccountId)
      const matchedIds = new Set(lines.filter((l) => l.matchedMovementId).map((l) => l.matchedMovementId))
      return rows.filter((r) => !matchedIds.has(r.id)).map(mapCashTransactionToDeposit)
    },
    enabled: Boolean(bankAccountId),
  })
}

// ---------------------------------------------------------------------------
// Local-only hooks - no real backend service exists for these operations yet.
// ---------------------------------------------------------------------------

// REAL: reads imagecare.bank_accounts directly (see bankReconciliationService.listBankAccounts).
export function useBankAccounts() {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['bank-reconciliation', 'accounts', ctx.business_id],
    queryFn: () => bankReconciliationService.listBankAccounts(ctx),
  })
}

// REAL: inserts into imagecare.bank_accounts (see bankReconciliationService.createBankAccount).
export function useCreateBankAccount(userId: string) {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: BankAccountInput) => bankReconciliationService.createBankAccount(ctx, input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// REAL: soft-archives the row in imagecare.bank_accounts (see bankReconciliationService.archiveBankAccount).
// Still blocked locally when the account has statement lines recorded
// against it (AccountInUseError) - that business rule has no real backend
// equivalent since bank_statement_lines stays local (see note above).
export function useArchiveBankAccount(userId: string) {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => bankReconciliationService.archiveBankAccount(ctx, id, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no bank_statement_lines table exists; statement lines are
// entered by hand from the real paper/PDF statement and have no real backend
// (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useStatementLines(bankAccountId?: string) {
  return useQuery({
    queryKey: ['bank-reconciliation', 'statement-lines', bankAccountId ?? 'all'],
    queryFn: () => bankReconciliationService.listStatementLines(bankAccountId),
  })
}

// LOCAL-ONLY: no bank_statement_lines table exists (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useAddStatementLine(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: BankStatementLineInput) => bankReconciliationService.addStatementLine(input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no bank_statement_lines table exists (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useDeleteStatementLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => bankReconciliationService.deleteStatementLine(id),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: matching a statement line to a deposit has no real backend -
// there is no bank_statement_lines table to store the link on
// (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useMatchTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ statementLineId, movementId }: { statementLineId: string; movementId: string }) =>
      bankReconciliationService.matchTransaction(statementLineId, movementId),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no bank_statement_lines table exists (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useUnmatchTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (statementLineId: string) => bankReconciliationService.unmatchTransaction(statementLineId),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: a "reconciled balance" (opening balance plus matched deposits)
// depends entirely on local statement lines and local matching state, neither
// of which has a real backend (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useReconciledBalance(bankAccountId: string) {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['bank-reconciliation', 'balance', bankAccountId, ctx.business_id],
    queryFn: () => bankReconciliationService.getReconciledBalance(ctx, bankAccountId),
    enabled: Boolean(bankAccountId),
  })
}

// LOCAL-ONLY: every field this returns (account count, reconciled balance,
// unmatched statement-line count, unmatched deposit count) is defined in
// terms of local bank accounts and local matching state - there is no honest
// way to source any of them from the real cash_transactions read alone
// without changing what they mean (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useBankReconciliationDashboardKpis() {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['bank-reconciliation', 'kpis', ctx.business_id],
    queryFn: () => bankReconciliationService.getBankReconciliationDashboardKpis(ctx),
  })
}
