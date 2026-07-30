import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as purchasingService from '../../../services/purchasingService'
import type { GoodsReceiptLineItem, PurchaseOrderInput, PurchaseReturnLineItem, RequisitionLineItem } from '../../../types/purchasing'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['purchasing'] })
  qc.invalidateQueries({ queryKey: ['inventory'] })
}

// ---------- Requisitions ----------

export function useRequisitions() {
  return useQuery({ queryKey: ['purchasing', 'requisitions'], queryFn: purchasingService.listRequisitions })
}

export function useCreateRequisition(userId: string, userName: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ items, notes }: { items: RequisitionLineItem[]; notes: string }) =>
      purchasingService.createRequisition(items, notes, userName, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useApproveRequisition(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => purchasingService.approveRequisition(id, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useRejectRequisition(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => purchasingService.rejectRequisition(id, reason, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------- Purchase Orders ----------

export function usePurchaseOrders() {
  return useQuery({ queryKey: ['purchasing', 'orders'], queryFn: purchasingService.listPurchaseOrders })
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['purchasing', 'order', id],
    queryFn: () => purchasingService.getPurchaseOrder(id as string),
    enabled: Boolean(id),
  })
}

export function useCreatePurchaseOrder(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PurchaseOrderInput) => purchasingService.createPurchaseOrder(input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useApprovePurchaseOrder(userId: string, userName: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => purchasingService.approvePurchaseOrder(id, userName, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useRejectPurchaseOrder(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => purchasingService.rejectPurchaseOrder(id, reason, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useMarkPurchaseOrderSent(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => purchasingService.markPurchaseOrderSent(id, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useCancelPurchaseOrder(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => purchasingService.cancelPurchaseOrder(id, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------- Goods Receipt ----------

export function useGoodsReceipts(purchaseOrderId?: string) {
  return useQuery({ queryKey: ['purchasing', 'receipts', purchaseOrderId ?? 'all'], queryFn: () => purchasingService.listGoodsReceipts(purchaseOrderId) })
}

export function useRecordGoodsReceipt(userId: string, userName: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ purchaseOrderId, items, notes }: { purchaseOrderId: string; items: GoodsReceiptLineItem[]; notes: string }) =>
      purchasingService.recordGoodsReceipt(purchaseOrderId, items, notes, userName, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------- Supplier Invoices ----------

export function useSupplierInvoices(supplierId?: string) {
  return useQuery({ queryKey: ['purchasing', 'invoices', supplierId ?? 'all'], queryFn: () => purchasingService.listSupplierInvoices(supplierId) })
}

export function useCreateSupplierInvoice(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { supplierId: string; purchaseOrderId: string | null; supplierInvoiceNumber: string; amount: number; dueDate: string | null }) =>
      purchasingService.createSupplierInvoice(input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useInvoicePayments(supplierInvoiceId?: string) {
  return useQuery({
    queryKey: ['purchasing', 'invoice-payments', supplierInvoiceId ?? 'all'],
    queryFn: () => purchasingService.listInvoicePayments(supplierInvoiceId),
  })
}

export function useRecordInvoicePayment(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ supplierInvoiceId, amount, reference }: { supplierInvoiceId: string; amount: number; reference: string }) =>
      purchasingService.recordInvoicePayment(supplierInvoiceId, amount, reference, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------- Purchase Returns ----------

export function usePurchaseReturns() {
  return useQuery({ queryKey: ['purchasing', 'returns'], queryFn: purchasingService.listPurchaseReturns })
}

export function useCreatePurchaseReturn(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { purchaseOrderId: string | null; supplierId: string; items: PurchaseReturnLineItem[]; reason: string }) =>
      purchasingService.createPurchaseReturn(input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------- Dashboard & Reports ----------

export function usePurchaseDashboardKpis() {
  return useQuery({ queryKey: ['purchasing', 'kpis'], queryFn: purchasingService.getPurchaseDashboardKpis })
}

export function useSpendBySupplier() {
  return useQuery({ queryKey: ['purchasing', 'spend-by-supplier'], queryFn: purchasingService.getSpendBySupplier })
}
