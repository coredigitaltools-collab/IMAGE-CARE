import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as customerService from '../../../services/customerService'
import * as salesService from '../../../services/salesService'
import type { CheckoutInput, CustomerInput } from '../../../types/sales'

// ---------- Customers ----------

export function useCustomers() {
  return useQuery({ queryKey: ['sales', 'customers'], queryFn: customerService.listCustomers })
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ['sales', 'customer', id],
    queryFn: () => customerService.getCustomer(id as string),
    enabled: Boolean(id),
  })
}

export function useCreateCustomer(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CustomerInput) => customerService.createCustomer(input, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'customers'] }),
  })
}

export function useUpdateCustomer(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CustomerInput }) => customerService.updateCustomer(id, input, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'customers'] }),
  })
}

export function useArchiveCustomer(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => customerService.archiveCustomer(id, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'customers'] }),
  })
}

export function useReactivateCustomer(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => customerService.reactivateCustomer(id, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'customers'] }),
  })
}

/** Merges sourceId into targetId across every place a customer record
 *  is referenced — Sales (purchase history), Notes, and the customer
 *  record itself (points/spend/credit summed, tags unioned). No
 *  historical data is dropped; the source is archived, not deleted. */
export function useMergeCustomers(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      await salesService.reassignCustomerSales(sourceId, targetId)
      await customerService.reassignCustomerNotes(sourceId, targetId)
      return customerService.applyCustomerMerge(sourceId, targetId, userId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] })
    },
  })
}

export function useFindDuplicateCustomers() {
  return useMutation({
    mutationFn: (input: Pick<CustomerInput, 'name' | 'phone' | 'email'>) => customerService.findPossibleDuplicates(input),
  })
}

export function useCustomerNotes(customerId: string | undefined) {
  return useQuery({
    queryKey: ['sales', 'customer-notes', customerId],
    queryFn: () => customerService.listCustomerNotes(customerId as string),
    enabled: Boolean(customerId),
  })
}

export function useAddCustomerNote(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ customerId, text }: { customerId: string; text: string }) => customerService.addCustomerNote(customerId, text, userId),
    onSuccess: (_data, variables) => qc.invalidateQueries({ queryKey: ['sales', 'customer-notes', variables.customerId] }),
  })
}

/** Active = purchased in the last 30 days — computed here (not in the
 *  service layer) because it needs both Customers and Sales, and
 *  customerService can't import salesService without a circular
 *  dependency (salesService already imports customerService). */
export function useCrmKpis() {
  const salesQuery = useSales()
  return useQuery({
    queryKey: ['sales', 'crm-kpis', salesQuery.data?.length ?? 0],
    queryFn: () => {
      const recentIds = new Set(
        (salesQuery.data ?? [])
          .filter((s) => s.status === 'completed' && s.customerId && Date.now() - new Date(s.createdAt).getTime() <= 30 * 24 * 60 * 60 * 1000)
          .map((s) => s.customerId as string),
      )
      return customerService.getCrmKpis(recentIds)
    },
    enabled: !salesQuery.isLoading,
  })
}

// ---------- Sales / POS ----------

export function useSales() {
  return useQuery({ queryKey: ['sales', 'sales'], queryFn: salesService.listSales })
}

export function useSale(id: string | undefined) {
  return useQuery({
    queryKey: ['sales', 'sale', id],
    queryFn: () => salesService.getSale(id as string),
    enabled: Boolean(id),
  })
}

export function useParkedSales() {
  return useQuery({ queryKey: ['sales', 'parked'], queryFn: salesService.listParkedSales })
}

export function useCheckout(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CheckoutInput) => salesService.checkout(input, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
  })
}

export function useRefundSale(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ saleId, reason }: { saleId: string; reason: string }) => salesService.refundSale(saleId, reason, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['loyalty'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
  })
}

export function useResumeParkedSale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => salesService.resumeParkedSale(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'parked'] }),
  })
}

export function useDeleteParkedSale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => salesService.deleteParkedSale(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'parked'] }),
  })
}
