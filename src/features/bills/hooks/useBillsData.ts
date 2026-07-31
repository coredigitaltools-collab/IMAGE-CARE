import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as billsService from '../../../services/billsService'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['bills'] })
  qc.invalidateQueries({ queryKey: ['purchasing'] })
}

export function useBills() {
  return useQuery({ queryKey: ['bills', 'list'], queryFn: billsService.listBills })
}

export function useBill(id: string | undefined) {
  return useQuery({
    queryKey: ['bills', 'one', id],
    queryFn: () => billsService.getBill(id as string),
    enabled: Boolean(id),
  })
}

export function useBillPayments(billId?: string) {
  return useQuery({ queryKey: ['bills', 'payments', billId ?? 'all'], queryFn: () => billsService.listBillPayments(billId) })
}

export function useRecordBillPayment(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ billId, amount, reference }: { billId: string; amount: number; reference: string }) =>
      billsService.recordBillPayment(billId, amount, reference, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useCancelBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => billsService.cancelBill(id, reason),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useCloseBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => billsService.closeBill(id),
    onSuccess: () => invalidateAll(qc),
  })
}

export function usePayablesAging() {
  return useQuery({ queryKey: ['bills', 'aging'], queryFn: billsService.getPayablesAging })
}

export function useBillsDashboardKpis() {
  return useQuery({ queryKey: ['bills', 'kpis'], queryFn: billsService.getBillsDashboardKpis })
}

export function useSupplierStatement(supplierId: string | undefined) {
  return useQuery({
    queryKey: ['bills', 'statement', supplierId],
    queryFn: () => billsService.getSupplierStatement(supplierId as string),
    enabled: Boolean(supplierId),
  })
}
