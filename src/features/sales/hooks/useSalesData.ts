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

export function useFindDuplicateCustomers() {
  return useMutation({
    mutationFn: (input: Pick<CustomerInput, 'name' | 'phone' | 'email'>) => customerService.findPossibleDuplicates(input),
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
