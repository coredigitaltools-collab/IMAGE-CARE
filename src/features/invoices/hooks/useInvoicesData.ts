import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as invoiceService from '../../../services/invoiceService'
import type { InvoiceSettings } from '../../../types/invoices'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['invoices'] })
}

export function useInvoices() {
  return useQuery({ queryKey: ['invoices', 'list'], queryFn: invoiceService.listInvoices })
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ['invoices', 'one', id],
    queryFn: () => invoiceService.getInvoice(id as string),
    enabled: Boolean(id),
  })
}

export function useInvoiceForSale(saleId: string | undefined) {
  return useQuery({
    queryKey: ['invoices', 'for-sale', saleId],
    queryFn: () => invoiceService.getInvoiceForSale(saleId as string),
    enabled: Boolean(saleId),
  })
}

export function useUninvoicedSales() {
  return useQuery({ queryKey: ['invoices', 'uninvoiced-sales'], queryFn: invoiceService.listUninvoicedCompletedSales })
}

export function useGenerateInvoice(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ saleId, dueDate }: { saleId: string; dueDate: string | null }) => invoiceService.generateInvoice(saleId, dueDate, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useMarkInvoiceSent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => invoiceService.markInvoiceSent(id),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useMarkInvoicePaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => invoiceService.markInvoicePaid(id),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useCancelInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => invoiceService.cancelInvoice(id, reason),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useInvoiceDashboardKpis() {
  return useQuery({ queryKey: ['invoices', 'kpis'], queryFn: invoiceService.getInvoiceDashboardKpis })
}

export function useInvoiceSettings() {
  return useQuery({ queryKey: ['invoices', 'settings'], queryFn: invoiceService.getInvoiceSettings })
}

export function useSaveInvoiceSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: InvoiceSettings) => invoiceService.saveInvoiceSettings(input),
    onSuccess: () => invalidateAll(qc),
  })
}
