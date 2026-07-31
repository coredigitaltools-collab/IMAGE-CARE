import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as accountingService from '../../../services/accountingService'
import type { AccountingSettings, CashMovementType } from '../../../types/accounting'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['accounting'] })
  qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
}

export function useCashMovements() {
  return useQuery({ queryKey: ['accounting', 'cash-movements'], queryFn: accountingService.listCashMovements })
}

export function useRecordCashMovement(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ type, amount, reason }: { type: CashMovementType; amount: number; reason: string }) =>
      accountingService.recordCashMovement(type, amount, reason, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useCashInHandBreakdown() {
  return useQuery({ queryKey: ['accounting', 'cash-in-hand'], queryFn: accountingService.getCashInHandBreakdown })
}

export function useAccountingSettings() {
  return useQuery({ queryKey: ['accounting', 'settings'], queryFn: accountingService.getAccountingSettings })
}

export function useSaveAccountingSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AccountingSettings) => accountingService.saveAccountingSettings(input),
    onSuccess: () => invalidateAll(qc),
  })
}
