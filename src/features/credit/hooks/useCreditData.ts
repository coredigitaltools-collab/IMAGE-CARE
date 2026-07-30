import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as creditService from '../../../services/creditService'
import type { CreditPayment } from '../../../types/sales'

export function useCreditDashboardKpis() {
  return useQuery({ queryKey: ['credit', 'kpis'], queryFn: creditService.getCreditDashboardKpis })
}

export function useCreditAccounts() {
  return useQuery({ queryKey: ['credit', 'accounts'], queryFn: creditService.listCreditAccounts })
}

export function useAgingReport() {
  return useQuery({ queryKey: ['credit', 'aging'], queryFn: creditService.getAgingReport })
}

export function useCreditPayments(customerId?: string) {
  return useQuery({ queryKey: ['credit', 'payments', customerId ?? 'all'], queryFn: () => creditService.listPayments(customerId) })
}

export function useCreditWriteOffs(customerId?: string) {
  return useQuery({ queryKey: ['credit', 'writeoffs', customerId ?? 'all'], queryFn: () => creditService.listWriteOffs(customerId) })
}

export function useCreditLimitChanges(customerId?: string) {
  return useQuery({ queryKey: ['credit', 'limit-changes', customerId ?? 'all'], queryFn: () => creditService.listLimitChanges(customerId) })
}

function invalidateCredit(qc: ReturnType<typeof useQueryClient>, customerId: string) {
  qc.invalidateQueries({ queryKey: ['credit'] })
  qc.invalidateQueries({ queryKey: ['sales', 'customers'] })
  qc.invalidateQueries({ queryKey: ['sales', 'customer', customerId] })
  qc.invalidateQueries({ queryKey: ['sales', 'crm-kpis'] })
}

export function useRecordPayment(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ customerId, amount, method, reference }: { customerId: string; amount: number; method: CreditPayment['method']; reference: string }) =>
      creditService.recordPayment(customerId, amount, method, reference, userId),
    onSuccess: (_data, variables) => invalidateCredit(qc, variables.customerId),
  })
}

export function useWriteOffBalance(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ customerId, amount, reason }: { customerId: string; amount: number; reason: string }) =>
      creditService.writeOffBalance(customerId, amount, reason, userId),
    onSuccess: (_data, variables) => invalidateCredit(qc, variables.customerId),
  })
}

export function useApproveCreditLimit(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ customerId, newLimit }: { customerId: string; newLimit: number }) => creditService.approveCreditLimit(customerId, newLimit, userId),
    onSuccess: (_data, variables) => invalidateCredit(qc, variables.customerId),
  })
}
