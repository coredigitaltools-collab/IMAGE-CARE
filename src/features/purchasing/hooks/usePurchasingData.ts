// Stage 5: Purchasing feature hooks - rewired to Stage 4 services.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserContext, useActiveBranch } from '../../../context/AppContext';
import {
  listPurchases, createPurchase,
  listPurchaseOrders, getPurchaseOrder, createPurchaseOrder, approvePurchaseOrder, getPurchaseDashboardKpis, rejectPurchase,
  recordGoodsReceipt,
} from '../../../services/purchasing/purchasingService';
import type { PurchaseOrderInput } from '../../../types/purchasing';
import type { UUID } from '../../../types/database';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error');
  const d = r.data;
  if (d === null || d === undefined) return [];
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string,unknown>).items))
    return (d as Record<string,unknown>).items;
  return d;
}

export function useRequisitions() {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['purchasing', 'requisitions', ctx.business_id],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => { const all = await listPurchases(ctx).then(unwrap); return (Array.isArray(all) ? all : []).filter((p: any) => p.status === 'draft'); },
  });
}

export function useCreateRequisition(_userId?: string, _userName?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (input: any) => createPurchase(ctx, {
      branch_id: (branch ?? ctx.branch_id) as UUID,
      payment_method: 'credit' as const, amount_paid: 0,
      notes: input.notes ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: ((input.items ?? input.lines ?? []) as any[]).map((i: any) => ({ product_id: (i.productId ?? i.product_id) as UUID, quantity: i.quantity ?? i.quantityOrdered ?? 0, unit_cost: i.unitCost ?? i.unit_cost ?? 0 })),
    }).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchasing', 'requisitions'] }); qc.invalidateQueries({ queryKey: ['purchasing', 'orders'] }); },
  });
}

export function useApproveRequisition(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: UUID) => approvePurchaseOrder(ctx, id).then(unwrap), onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchasing'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); } });
}

export function useRejectRequisition(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: UUID; reason: string }) =>
      rejectPurchase(ctx, id, reason).then(r => {
        if (r.error) throw new Error(r.error.message ?? 'Failed to reject requisition');
        return r;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchasing', 'requisitions'] });
      qc.invalidateQueries({ queryKey: ['purchasing', 'orders'] });
    },
  });
}

export function usePurchaseOrders() {
  const ctx = useUserContext();
  return useQuery({ queryKey: ['purchasing', 'orders', ctx.business_id], queryFn: () => listPurchaseOrders(ctx).then(unwrap) });
}

export function usePurchaseOrder(id: string | undefined) {
  const ctx = useUserContext();
  return useQuery({ queryKey: ['purchasing', 'order', id], queryFn: () => getPurchaseOrder(ctx, id as UUID).then(unwrap), enabled: Boolean(id) });
}

export function useCreatePurchaseOrder(_userId?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PurchaseOrderInput | Record<string, unknown>) =>
      createPurchaseOrder(ctx, {
        branch_id: (branch ?? ctx.branch_id) as UUID,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supplier_id: (input as any).supplierId ?? (input as any).supplier_id,
        payment_method: 'credit',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        notes: (input as any).notes,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        due_date: (input as any).expectedDeliveryDate,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lines: ((input as any).items ?? []).map((i: any) => ({ product_id: (i.productId ?? i.product_id) as UUID, quantity: Number(i.quantity ?? i.quantityOrdered ?? 0), unit_cost: Number(i.unitCost ?? i.unit_cost ?? 0) })),
      }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchasing'] }),
  });
}

export function useApprovePurchaseOrder(_approverName?: string, _userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: UUID) => approvePurchaseOrder(ctx, id).then(unwrap), onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchasing'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); } });
}

export function useRejectPurchaseOrder(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: UUID; reason: string }) =>
      rejectPurchase(ctx, id, reason).then(r => {
        if (r.error) throw new Error(r.error.message ?? 'Failed to reject purchase order');
        return r;
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchasing'] }),
  });
}
export function useMarkPurchaseOrderSent(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: UUID) => {
      const { error } = await (await import('../../../lib/supabase')).supabase
        .schema('imagecare').from('purchases')
        .update({ notes: 'Sent to supplier - awaiting delivery', updated_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', ctx.business_id).eq('status', 'draft');
      if (error) throw new Error((error as { message?: string }).message ?? 'Failed to mark as sent');
      return { id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchasing'] }),
  });
}
export function useCancelPurchaseOrder(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: UUID) => {
      const { error } = await (await import('../../../lib/supabase')).supabase
        .schema('imagecare').from('purchases')
        .update({ status: 'cancelled' as const, updated_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', ctx.business_id);
      if (error) throw new Error((error as { message?: string }).message ?? 'Failed to cancel purchase order');
      return { id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchasing'] }),
  });
}

export function useGoodsReceipts(purchaseOrderId?: UUID) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['purchasing', 'receipts', purchaseOrderId ?? 'all', ctx.business_id],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => { const all = await listPurchases(ctx).then(unwrap); return (Array.isArray(all) ? all : []).filter((p: any) => p.status === 'confirmed'); },
  });
}

export function useRecordGoodsReceipt(_approverName?: string, _userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ purchaseOrderId, items, notes }: { purchaseOrderId: UUID; items: Array<{ productId: string; quantityReceived: number }>; notes: string }) =>
      recordGoodsReceipt(
        ctx,
        purchaseOrderId,
        (items ?? []).map(i => ({ product_id: i.productId as UUID, quantity_received: Number(i.quantityReceived) })),
        notes,
      ).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchasing'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); },
  });
}

export function useSupplierInvoices(supplierId?: UUID) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['purchasing', 'invoices', supplierId ?? 'all', ctx.business_id],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => { const all = await listPurchases(ctx, { supplier_id: supplierId }).then(unwrap); return (Array.isArray(all) ? all : []).filter((p: any) => (p.balance_due ?? 0) > 0); },
  });
}

export function useCreateSupplierInvoice(_userId?: string) {
  // Supplier invoice persistence requires a dedicated invoices table not in Stage 4 DB.
  // This action is disabled - the UI should not expose it for Stage 5.
  return useMutation({
    mutationFn: async (_input: Record<string, unknown>) => {
      throw new Error('Supplier invoice creation is not available in Stage 5. Please upgrade to Stage 6.');
    },
  });
}

export function usePurchaseDashboardKpis(branchId?: UUID) {
  const ctx = useUserContext();
  return useQuery({ queryKey: ['purchasing', 'kpis', ctx.business_id, branchId], queryFn: () => getPurchaseDashboardKpis(ctx, branchId).then(unwrap) });
}

export function useSpendBySupplier(_from?: string, _to?: string) {
  const ctx = useUserContext();
  return useQuery({ queryKey: ['purchasing', 'spend-by-supplier', ctx.business_id], queryFn: async () => [] as Array<{ supplierId: string; supplierName: string; totalUgx: number; totalSpendUgx: number; orderCount: number }> });
}

export function usePurchaseReturns() {
  // Purchase returns require a dedicated table not in Stage 4 DB.
  return useQuery({ queryKey: ['purchasing', 'returns'], queryFn: async () => [] as Array<Record<string, unknown>>, staleTime: Infinity });
}
export function useCreatePurchaseReturn(_userId?: string) {
  // Purchase returns require Stage 6 backend support.
  return useMutation({
    mutationFn: async (_input: Record<string, unknown>) => {
      throw new Error('Purchase returns are not available in Stage 5. Please upgrade to Stage 6.');
    },
  });
}
export function useRecordInvoicePayment(_userId?: string) {
  // Supplier invoice payment requires a dedicated invoices table not in Stage 4 DB.
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (_input: any) => {
      throw new Error('Invoice payment is not available in Stage 5. Please upgrade to Stage 6.');
    },
  });
}
