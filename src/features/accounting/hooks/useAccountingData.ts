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
    mutationFn: ({ type, amount, reason, bankAccountId }: { type: CashMovementType; amount: number; reason: string; bankAccountId?: string | null }) =>
      accountingService.recordCashMovement(type, amount, reason, userId, bankAccountId ?? null),
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

export function useBankBalance() {
  return useQuery({ queryKey: ['accounting', 'bank-balance'], queryFn: accountingService.getBankBalance })
}

export function useCashFlowDashboardKpis() {
  return useQuery({ queryKey: ['accounting', 'cash-flow-kpis'], queryFn: accountingService.getCashFlowDashboardKpis })
}

export function useCashLedger() {
  return useQuery({ queryKey: ['accounting', 'cash-ledger'], queryFn: accountingService.getCashLedger })
}

export function useCashForecast(windowDays?: number, forecastDays?: number) {
  return useQuery({
    queryKey: ['accounting', 'cash-forecast', windowDays, forecastDays],
    queryFn: () => accountingService.getCashForecast(windowDays, forecastDays),
  })
}

export function useReconciliations() {
  return useQuery({ queryKey: ['accounting', 'reconciliations'], queryFn: accountingService.listReconciliations })
}

export function useRecordReconciliation(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ countedAmountUgx, notes }: { countedAmountUgx: number; notes: string }) =>
      accountingService.recordReconciliation(countedAmountUgx, notes, userId),
    onSuccess: () => invalidateAll(qc),
  })
}
