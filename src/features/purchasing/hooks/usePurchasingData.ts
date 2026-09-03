// Stage 5: Purchasing feature hooks - rewired to Stage 4 services.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserContext, useActiveBranch } from '../../../context/AppContext';
import {
  listPurchases, createPurchase,
  listPurchaseOrders, getPurchaseOrder, createPurchaseOrder, approvePurchaseOrder, getPurchaseDashboardKpis, rejectPurchase,
  recordGoodsReceipt, createPurchaseReturn, listPurchaseReturns, markRequisitionConverted,
} from '../../../services/purchasing/purchasingService';
import {
  listBills as listRealBills,
  createBill as createBillReal,
  recordBillPayment as recordBillPaymentReal,
} from '../../../services/credit/creditService';
import type { PurchaseOrderInput, PurchaseOrderStatus, PurchaseRequisition, RequisitionStatus, PurchaseOrder, SupplierInvoice, SupplierInvoiceStatus } from '../../../types/purchasing';
import type { UUID, Purchase, PurchaseItem, Bill } from '../../../types/database';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error');
  const d = r.data;
  if (d === null || d === undefined) return [];
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string,unknown>).items))
    return (d as Record<string,unknown>).items;
  return d;
}

// -----------------------------------------------------------------------
// Real-row -> frontend-shape mapping.
//
// Bug fix (Purchasing module audit 2026-09-03): listPurchases()/getPurchase()
// return the real imagecare.purchases row shape (snake_case columns,
// embedded purchase_items, a 4-value TransactionStatus enum). Every
// Purchasing page (Requisitions, Orders, Order detail) was written against
// the camelCase `PurchaseRequisition`/`PurchaseOrder` types in
// types/purchasing.ts, which model a richer status pipeline
// ('pending_approval' | 'approved' | 'sent' | 'partially_received' | ...)
// that was never implemented in the database - the real status column can
// only ever be 'draft' | 'confirmed' | 'cancelled' | 'voided'. Passing raw
// rows straight through (as the hooks used to) meant every page read
// `undefined` for `.items`, `.supplierId`, `.reference`, etc., which is
// what crashed both list pages the moment they tried `.items.length` /
// `.items.reduce(...)`. This maps every real row onto the shape the
// existing page components already expect, the same "map the narrower real
// enum onto the richer local one" approach already used for Bills
// (see mapBillStatus in features/bills/hooks/useBillsData.ts).
type RawPurchaseRow = Purchase & {
  // The `Purchase` type in types/database.ts doesn't model created_by/
  // updated_by (both real columns - confirmed live against the DB), so
  // they're added here rather than widening the shared type for one caller.
  created_by?: string | null;
  updated_by?: string | null;
  purchase_items?: Array<PurchaseItem & { products?: { name: string; sku: string } | null }>;
  suppliers?: { name: string } | null;
};

const STATUS_TO_PO_STATUS: Record<Purchase['status'], PurchaseOrderStatus> = {
  draft: 'draft',
  confirmed: 'received',
  cancelled: 'cancelled',
  voided: 'cancelled',
};

const STATUS_TO_REQ_STATUS: Record<Purchase['status'], RequisitionStatus> = {
  draft: 'draft',
  confirmed: 'approved',
  cancelled: 'rejected',
  voided: 'rejected',
};

function rejectionReasonFromNotes(notes: string | null): string | null {
  const match = notes?.match(/Rejected: (.+)$/);
  return match ? match[1] : null;
}

function mapPurchaseToRequisition(row: RawPurchaseRow): PurchaseRequisition {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by ?? '',
    updated_by: row.updated_by ?? '',
    branch_id: row.branch_id,
    is_active: row.status !== 'cancelled' && row.status !== 'voided',
    sync_status: 'synced',
    last_synced_at: row.updated_at,
    reference: row.purchase_number,
    requestedByName: '',
    items: (row.purchase_items ?? []).map((it) => ({
      productId: it.product_id,
      productName: it.products?.name ?? 'Unknown product',
      sku: it.products?.sku ?? '',
      quantity: Number(it.quantity),
      notes: it.notes ?? '',
    })),
    status: STATUS_TO_REQ_STATUS[row.status] ?? 'draft',
    notes: row.notes ?? '',
    rejectionReason: row.status === 'cancelled' ? rejectionReasonFromNotes(row.notes) : null,
    convertedToPoId: null,
  };
}

function mapPurchaseToOrder(row: RawPurchaseRow): PurchaseOrder {
  const isReceived = row.status === 'confirmed';
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by ?? '',
    updated_by: row.updated_by ?? '',
    branch_id: row.branch_id,
    is_active: row.status !== 'cancelled' && row.status !== 'voided',
    sync_status: 'synced',
    last_synced_at: row.updated_at,
    reference: row.purchase_number,
    supplierId: row.supplier_id ?? '',
    requisitionId: null,
    items: (row.purchase_items ?? []).map((it) => ({
      productId: it.product_id,
      productName: it.products?.name ?? 'Unknown product',
      sku: it.products?.sku ?? '',
      quantityOrdered: Number(it.quantity),
      quantityReceived: isReceived ? Number(it.quantity) : 0,
      unitCost: Number(it.unit_cost),
    })),
    status: STATUS_TO_PO_STATUS[row.status] ?? 'draft',
    expectedDeliveryDate: row.due_date,
    notes: row.notes ?? '',
    approvedByName: isReceived ? '' : null,
    approvedAt: isReceived ? row.updated_at : null,
    rejectionReason: (row.status === 'cancelled' || row.status === 'voided') ? rejectionReasonFromNotes(row.notes) : null,
  };
}

export function useRequisitions() {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['purchasing', 'requisitions', ctx.business_id],
    queryFn: async () => {
      const all = (await listPurchases(ctx).then(unwrap)) as RawPurchaseRow[];
      return (Array.isArray(all) ? all : []).filter((p) => p.status === 'draft').map(mapPurchaseToRequisition);
    },
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
  return useQuery({
    queryKey: ['purchasing', 'orders', ctx.business_id],
    queryFn: async () => {
      const all = (await listPurchaseOrders(ctx).then(unwrap)) as RawPurchaseRow[];
      return (Array.isArray(all) ? all : []).map(mapPurchaseToOrder);
    },
  });
}

export function usePurchaseOrder(id: string | undefined) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['purchasing', 'order', id],
    queryFn: async () => mapPurchaseToOrder((await getPurchaseOrder(ctx, id as UUID).then(unwrap)) as RawPurchaseRow),
    enabled: Boolean(id),
  });
}

export function useCreatePurchaseOrder(_userId?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PurchaseOrderInput | Record<string, unknown>) => {
      const result = await createPurchaseOrder(ctx, {
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
      }).then(unwrap);

      // Bug fix (Purchasing module audit 2026-09-03): when this order was
      // created by converting a requisition (see RequisitionFormModal's
      // `requisitionId`), close out the original draft requisition row so
      // it stops reappearing in the Requisitions list and can't be
      // converted a second time into a duplicate order. See
      // markRequisitionConverted() in purchasingService.ts.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requisitionId = (input as any).requisitionId as string | null | undefined;
      if (requisitionId) {
        await markRequisitionConverted(ctx, requisitionId as UUID, result?.purchase_number ?? '').catch(() => {
          // Best-effort: the new order was already created successfully:
          // failing to also close the source requisition shouldn't be
          // reported as the whole "create order" action having failed.
        });
      }
      return result;
    },
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
    queryFn: async () => {
      const all = (await listPurchases(ctx).then(unwrap)) as RawPurchaseRow[];
      return (Array.isArray(all) ? all : []).filter((p) => p.status === 'confirmed').map(mapPurchaseToOrder);
    },
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

// -----------------------------------------------------------------------
// Supplier Invoices ("Record Invoice" in the Purchasing module).
//
// Bug fix (Purchasing module audit 2026-09-03): useSupplierInvoices used
// to fabricate fake "invoices" by filtering purchases with a positive
// balance_due and returning them AS IF they were SupplierInvoice rows -
// wrong shape, no way to tell an unbilled PO from an actual supplier
// invoice. useCreateSupplierInvoice/useRecordInvoicePayment were hardcoded
// stubs that always threw "not available in Stage 5", with a comment
// claiming the required table doesn't exist. It does: imagecare.bills,
// already correctly read and written by the Bills/Payables module (see
// features/bills/hooks/useBillsData.ts) via
// src/services/credit/creditService.ts. This rewires Purchasing's
// "Supplier Invoices" tab onto that same real table/service - one
// source of truth for what a supplier has billed, instead of a second,
// disconnected, fake one living only in Purchasing.
// -----------------------------------------------------------------------

type RealBillRow = Bill & { suppliers?: { name: string } | null };

function mapBillStatus(status: Bill['status']): SupplierInvoiceStatus {
  switch (status) {
    case 'partial': return 'partially_paid';
    case 'overdue': return 'unpaid';
    case 'voided': return 'cancelled';
    default: return status;
  }
}

function toSupplierInvoice(row: RealBillRow): SupplierInvoice {
  return {
    id: row.id,
    reference: row.bill_number,
    supplierInvoiceNumber: '',
    supplierId: row.supplier_id ?? '',
    purchaseOrderId: row.purchase_id,
    amount: row.total_amount,
    amountPaid: row.amount_paid,
    dueDate: row.due_date,
    status: mapBillStatus(row.status),
    cancelledAt: row.status === 'voided' ? row.updated_at : null,
    cancelReason: null,
    closedAt: null,
    createdAt: row.created_at,
    createdBy: '',
  };
}

export function useSupplierInvoices(supplierId?: UUID) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['purchasing', 'invoices', supplierId ?? 'all', ctx.business_id],
    queryFn: async () => {
      const rows = (await listRealBills(ctx, { supplier_id: supplierId }).then(unwrap)) as RealBillRow[];
      return rows.map(toSupplierInvoice);
    },
  });
}

export function useCreateSupplierInvoice(_userId?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { supplierId: string; purchaseOrderId: string | null; supplierInvoiceNumber: string; amount: number; dueDate: string | null }) =>
      createBillReal(ctx, {
        supplier_id: input.supplierId as UUID,
        branch_id: (branch ?? ctx.branch_id) as UUID,
        purchase_id: (input.purchaseOrderId as UUID) || null,
        bill_number: input.supplierInvoiceNumber || undefined,
        amount: input.amount,
        due_date: input.dueDate,
      }).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchasing', 'invoices'] }); qc.invalidateQueries({ queryKey: ['bills'] }); },
  });
}

export function useRecordInvoicePayment(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ supplierInvoiceId, amount, reference }: { supplierInvoiceId: string; amount: number; reference: string }) =>
      recordBillPaymentReal(ctx, { bill_id: supplierInvoiceId as UUID, amount, reference }).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchasing', 'invoices'] }); qc.invalidateQueries({ queryKey: ['bills'] }); },
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

// -----------------------------------------------------------------------
// Purchase Returns - see createPurchaseReturn()/listPurchaseReturns() in
// services/purchasing/purchasingService.ts for the root-cause fix (the
// real inventory_movements 'return_out' movement type, previously unused).
// -----------------------------------------------------------------------

export function usePurchaseReturns() {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['purchasing', 'returns', ctx.business_id],
    queryFn: () => listPurchaseReturns(ctx).then(unwrap),
  });
}

export function useCreatePurchaseReturn(_userId?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { supplierId: string; purchaseOrderId: string | null; reason: string; items: Array<{ productId: string; quantity: number; unitCost: number }> }) =>
      createPurchaseReturn(ctx, {
        branch_id: (branch ?? ctx.branch_id) as UUID,
        supplier_id: input.supplierId as UUID,
        purchase_id: (input.purchaseOrderId as UUID) || null,
        reason: input.reason,
        items: input.items.map((i) => ({ product_id: i.productId as UUID, quantity: i.quantity, unit_cost: i.unitCost })),
      }).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchasing', 'returns'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); },
  });
}
