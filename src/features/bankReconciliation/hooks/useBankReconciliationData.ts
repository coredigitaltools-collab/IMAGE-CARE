import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as bankReconciliationService from '../../../services/bankReconciliationService'
import type { BankAccountInput, BankStatementLineInput } from '../../../types/bankReconciliation'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['bank-reconciliation'] })
  qc.invalidateQueries({ queryKey: ['accounting'] })
}

export function useBankAccounts() {
  return useQuery({ queryKey: ['bank-reconciliation', 'accounts'], queryFn: bankReconciliationService.listBankAccounts })
}

export function useCreateBankAccount(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: BankAccountInput) => bankReconciliationService.createBankAccount(input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useArchiveBankAccount(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => bankReconciliationService.archiveBankAccount(id, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useStatementLines(bankAccountId?: string) {
  return useQuery({
    queryKey: ['bank-reconciliation', 'statement-lines', bankAccountId ?? 'all'],
    queryFn: () => bankReconciliationService.listStatementLines(bankAccountId),
  })
}

export function useAddStatementLine(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: BankStatementLineInput) => bankReconciliationService.addStatementLine(input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useDeleteStatementLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => bankReconciliationService.deleteStatementLine(id),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useUnmatchedDeposits(bankAccountId: string) {
  return useQuery({
    queryKey: ['bank-reconciliation', 'unmatched-deposits', bankAccountId],
    queryFn: () => bankReconciliationService.listUnmatchedDeposits(bankAccountId),
    enabled: Boolean(bankAccountId),
  })
}

export function useMatchTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ statementLineId, movementId }: { statementLineId: string; movementId: string }) =>
      bankReconciliationService.matchTransaction(statementLineId, movementId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useUnmatchTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (statementLineId: string) => bankReconciliationService.unmatchTransaction(statementLineId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useReconciledBalance(bankAccountId: string) {
  return useQuery({
    queryKey: ['bank-reconciliation', 'balance', bankAccountId],
    queryFn: () => bankReconciliationService.getReconciledBalance(bankAccountId),
    enabled: Boolean(bankAccountId),
  })
}

export function useBankReconciliationDashboardKpis() {
  return useQuery({ queryKey: ['bank-reconciliation', 'kpis'], queryFn: bankReconciliationService.getBankReconciliationDashboardKpis })
}
