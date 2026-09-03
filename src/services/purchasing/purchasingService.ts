// ============================================================
// IMC-BLD-003 | ImageCare ERP API & Service Contract v1.0
// File: src/services/purchasing/purchasingService.ts
// Purpose: Purchasing service - purchases, supplier payments.
// ============================================================

import { supabase } from '../../lib/supabase';
import { canDo } from '../../types/app';
import { serviceOk, serviceFail, makeRequestId } from '../../types/contracts';
import type { ServiceResponse, PagedResponse, DateFilter, PaginationRequest } from '../../types/contracts';
import type { UserContext } from '../../types/app';
import type { Purchase, UUID } from '../../types/database';
import { createAndPostPurchase, type CreatePurchaseInput } from '../business/businessEngine';
import { purchasingEngine as realPurchasingEngine } from '../../engines';
import type { EngineContext } from '../../engines/types';
import { APP_CONSTANTS } from '../../config/env';
import { v4 as uuidv4 } from 'uuid';

function toEngineContext(ctx: UserContext, branchId?: UUID): EngineContext {
  return {
    business_id: ctx.business_id,
    branch_id:   branchId ?? ctx.branch_id ?? null,
    user_id:     ctx.user_id,
    user_ctx:    ctx,
  };
}

export interface PurchaseFilter {
  branch_id?: UUID;
  supplier_id?: UUID;
  status?: Purchase['status'];
  date?: DateFilter;
}

export async function createPurchase(
  ctx: UserContext,
  request: CreatePurchaseInput & { idempotency_key?: string }
): Promise<ServiceResponse<{ purchase_id: UUID; purchase_number: string }>> {
  const requestId = makeRequestId();

  if (!canDo(ctx, 'purchases', 'create')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to create purchases.', { requestId });
  }

  const result = await createAndPostPurchase(ctx, request);
  if (result.error) return serviceFail('BUSINESS_RULE_VIOLATION', result.error.message, { requestId });
  return serviceOk(result.data!, requestId);
}

export async function getPurchase(
  ctx: UserContext,
  purchaseId: UUID
): Promise<ServiceResponse<Purchase>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'purchases', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view purchases.', { requestId });
  }
  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('purchases')
      .select('*, purchase_items(*), suppliers(name)')
      .eq('id', purchaseId)
      .eq('business_id', ctx.business_id)
      .single();
    if (error || !data) return serviceFail('RESOURCE_NOT_FOUND', 'Purchase not found.', { requestId });
    return serviceOk(data as Purchase, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load purchase.', { requestId }); }
}

export async function listPurchases(
  ctx: UserContext,
  filter: PurchaseFilter = {},
  pagination: PaginationRequest = {}
): Promise<ServiceResponse<PagedResponse<Purchase>>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'purchases', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view purchases.', { requestId });
  }
  try {
    // fn_list_purchases_cursor does not exist live or in any tracked
    // migration (confirmed by Phase 1 verification) - replaced with a
    // direct offset-paginated query, matching the pattern already used
    // by listInventory/listBranches in this codebase.
    const pageSize = Math.min(pagination.page_size ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE, APP_CONSTANTS.MAX_PAGE_SIZE);
    const offset = ((pagination.page ?? 1) - 1) * pageSize;

    let q = supabase.schema('imagecare').from('purchases')
      .select('*', { count: 'exact' })
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null)
      .range(offset, offset + pageSize - 1)
      .order('purchase_date', { ascending: false });

    if (filter.branch_id)   q = q.eq('branch_id', filter.branch_id);
    if (filter.supplier_id) q = q.eq('supplier_id', filter.supplier_id);
    if (filter.status)      q = q.eq('status', filter.status);
    if (filter.date?.from)  q = q.gte('purchase_date', filter.date.from);
    if (filter.date?.to)    q = q.lte('purchase_date', filter.date.to);

    const { data, error, count } = await q;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load purchases.', { requestId });

    return serviceOk({
      items: (data ?? []) as Purchase[],
      pagination: {
        total_count:      count ?? 0,
        page_size:        pageSize,
        has_more:         (offset + pageSize) < (count ?? 0),
        next_cursor_date: null,
        next_cursor_id:   null,
      },
    }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load purchases.', { requestId }); }
}

export async function recordSupplierPayment(
  ctx: UserContext,
  input: { supplier_id: UUID; branch_id: UUID; amount: number; payment_method: string; reference_notes?: string }
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'purchases', 'edit')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to record supplier payments.', { requestId });
  }
  try {
    const ectx = toEngineContext(ctx, input.branch_id);
    const result = await realPurchasingEngine.recordSupplierPayment(ectx, {
      supplier_id:      input.supplier_id,
      branch_id:        input.branch_id,
      amount:           input.amount,
      payment_method:   input.payment_method as CreatePurchaseInput['payment_method'],
      reference_number: undefined,
      notes:            input.reference_notes,
      idempotency_key:  uuidv4(),
    });
    if (!result.ok) return serviceFail('BUSINESS_RULE_VIOLATION', result.error!.message, { requestId });
    return serviceOk(undefined, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to record payment.', { requestId }); }
}

// ============================================================
// Stage 5: PO workflow aliases and dashboard KPIs.
// ============================================================

// createPurchase accepts CreatePurchaseInput from businessEngine

export async function listPurchaseOrders(
  ctx: UserContext,
  opts: Parameters<typeof listPurchases>[1] = {}
): ReturnType<typeof listPurchases> {
  return listPurchases(ctx, opts);
}

export async function getPurchaseOrder(ctx: UserContext, purchaseId: UUID): ReturnType<typeof getPurchase> {
  return getPurchase(ctx, purchaseId);
}

export async function createPurchaseOrder(
  ctx: UserContext,
  input: {
    branch_id: UUID; supplier_id?: UUID; payment_method: string;
    lines: Array<{ product_id: UUID; quantity: number; unit_cost: number }>;
    notes?: string; due_date?: string;
  }
): ReturnType<typeof createPurchase> {
  const ci: CreatePurchaseInput = {
    branch_id:      input.branch_id,
    supplier_id:    input.supplier_id,
    payment_method: (input.payment_method ?? 'credit') as CreatePurchaseInput['payment_method'],
    amount_paid:    0,
    notes:          input.notes,
    due_date:       input.due_date,
    items:          (input.lines ?? []).map(l => ({
      product_id: l.product_id,
      quantity:   l.quantity,
      unit_cost:  l.unit_cost,
    })),
  };
  return createPurchase(ctx, ci);
}

export async function approvePurchaseOrder(
  ctx: UserContext,
  purchaseId: UUID,
  idempotencyKey?: string
): Promise<ServiceResponse<{ purchase_id: UUID; status: string; journal_entry_id: UUID | null }>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'purchases', 'edit'))
    return serviceFail('PERMISSION_DENIED', 'Permission denied.', { requestId });
  try {
    const key = idempotencyKey ?? crypto.randomUUID();
    const ectx = toEngineContext(ctx);
    const result = await realPurchasingEngine.receiveStock(ectx, {
      purchase_id:      purchaseId,
      idempotency_key:  key,
    });
    if (!result.ok) {
      return serviceFail('INTERNAL_ERROR', result.error!.message, { requestId });
    }
    return serviceOk({
      purchase_id:      result.data!.purchase_id,
      status:           result.data!.status,
      journal_entry_id: result.data!.journal_entry_id,
    }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to receive stock.', { requestId }); }
}

// ---- recordGoodsReceipt -----------------------------------
// Used to just alias approvePurchaseOrder(), which silently
// fully-received the entire PO no matter what per-line quantities
// the user entered in GoodsReceiptModal - a user receiving 3 of 10
// units would see "recorded" while 10 were actually posted to
// inventory. `purchase_items` has no `received_quantity` (or
// similar) column in any migration, so there is no way to persist
// a true partial receipt without a schema change, which is out of
// scope here. Rather than keep discarding the entered items/notes
// and silently over-receiving, this now validates the entered
// quantities cover every line's full ordered quantity - a genuine
// partial entry is rejected with a clear message instead of being
// silently rounded up to "everything," and the notes the user typed
// are persisted onto the purchase instead of being dropped.

export async function recordGoodsReceipt(
  ctx: UserContext,
  purchaseId: UUID,
  items: Array<{ product_id: UUID; quantity_received: number }>,
  notes?: string,
): Promise<ServiceResponse<{ purchase_id: UUID; status: string; journal_entry_id: UUID | null }>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'purchases', 'edit'))
    return serviceFail('PERMISSION_DENIED', 'Permission denied.', { requestId });
  try {
    const { data: purchase, error: loadErr } = await supabase
      .schema('imagecare')
      .from('purchases')
      .select('id, notes, purchase_items(product_id, quantity)')
      .eq('id', purchaseId)
      .eq('business_id', ctx.business_id)
      .single();

    if (loadErr || !purchase) return serviceFail('RESOURCE_NOT_FOUND', 'Purchase order not found.', { requestId });

    const orderedLines = (purchase.purchase_items ?? []) as Array<{ product_id: UUID; quantity: number }>;
    const submitted = new Map<UUID, number>();
    for (const item of items ?? []) {
      submitted.set(item.product_id, (submitted.get(item.product_id) ?? 0) + Number(item.quantity_received || 0));
    }

    const isFullReceipt = orderedLines.every(l => (submitted.get(l.product_id) ?? 0) >= Number(l.quantity));
    if (!isFullReceipt) {
      return serviceFail(
        'BUSINESS_RULE_VIOLATION',
        "Partial goods receipt isn't supported yet - this order can only be received in full. Enter the full ordered quantity for every line, then try again.",
        { requestId },
      );
    }

    const key = crypto.randomUUID();
    const ectx = toEngineContext(ctx);
    const result = await realPurchasingEngine.receiveStock(ectx, {
      purchase_id:      purchaseId,
      idempotency_key:  key,
    });
    if (!result.ok) {
      return serviceFail('INTERNAL_ERROR', result.error!.message, { requestId });
    }

    const trimmedNotes = notes?.trim();
    if (trimmedNotes) {
      const combinedNotes = purchase.notes ? `${purchase.notes}\nGoods receipt: ${trimmedNotes}` : `Goods receipt: ${trimmedNotes}`;
      await supabase.schema('imagecare').from('purchases')
        .update({ notes: combinedNotes, updated_by: ctx.user_id })
        .eq('id', purchaseId)
        .eq('business_id', ctx.business_id);
    }

    return serviceOk({
      purchase_id:      result.data!.purchase_id,
      status:           result.data!.status,
      journal_entry_id: result.data!.journal_entry_id,
    }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to record goods receipt.', { requestId }); }
}

export interface PurchaseDashboardKpis {
  total_orders: number; pending_orders: number; total_spend_month: number;
  outstanding_payables: number; openOrders: number; pendingApproval: number;
  pendingReceipt: number; spendThisMonthUgx: number;
}

export async function getPurchaseDashboardKpis(
  ctx: UserContext, branchId?: UUID
): Promise<ServiceResponse<PurchaseDashboardKpis>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'purchases', 'view'))
    return serviceFail('PERMISSION_DENIED', 'Permission denied.', { requestId });
  try {
    let q = supabase.schema('imagecare').from('purchases')
      .select('status, total_amount, balance_due, purchase_date', { count: 'exact' })
      .eq('business_id', ctx.business_id).is('deleted_at', null);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed.', { requestId });
    const rows = (data ?? []) as Array<{ status: string; total_amount: number; balance_due: number; purchase_date: string }>;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const pending = rows.filter(r => r.status === 'draft').length;
    const spend   = rows.filter(r => r.purchase_date >= monthStart && r.status === 'confirmed').reduce((s, r) => s + r.total_amount, 0);
    const payable = rows.reduce((s, r) => s + (r.balance_due ?? 0), 0);
    return serviceOk({
      total_orders: rows.length, pending_orders: pending, total_spend_month: spend,
      outstanding_payables: payable, openOrders: pending, pendingApproval: pending,
      pendingReceipt: rows.filter(r => r.status === 'confirmed' && (r.balance_due ?? 0) > 0).length,
      spendThisMonthUgx: spend,
    }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed.', { requestId }); }
}


export async function rejectPurchase(
  ctx: UserContext,
  purchaseId: UUID,
  reason: string
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'purchases', 'edit'))
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to reject purchases.', { requestId });
  try {
    // Fetch and validate the purchase exists and is in a rejectable state
    const purchaseResult = await getPurchase(ctx, purchaseId);
    if (purchaseResult.error) return serviceFail('RESOURCE_NOT_FOUND', 'Purchase not found.', { requestId });
    const purchase = purchaseResult.data;
    if (!purchase) return serviceFail('RESOURCE_NOT_FOUND', 'Purchase not found.', { requestId });
    if (purchase.status !== 'draft')
      return serviceFail('BUSINESS_RULE_VIOLATION', `Cannot reject a purchase with status "${purchase.status}". Only draft purchases can be rejected.`, { requestId });

    const { error } = await supabase.schema('imagecare').from('purchases').update({
      status:     'cancelled' as const,
      notes:      purchase.notes ? `${purchase.notes} | Rejected: ${reason}` : `Rejected: ${reason}`,
      updated_at: new Date().toISOString(),
    }).eq('id', purchaseId).eq('business_id', ctx.business_id);

    if (error) return serviceFail('INTERNAL_ERROR', error.message, { requestId });

    // Audit log
    await supabase.schema('imagecare').from('audit_logs').insert({
      business_id: ctx.business_id,
      branch_id:   purchase.branch_id,
      table_name:  'purchases',
      record_id:   purchaseId,
      action:      'update',
      new_value:   { status: 'cancelled', rejected_by: ctx.user_id, reason, rejected_at: new Date().toISOString() },
      user_id:     ctx.user_id,
      created_at:  new Date().toISOString(),
    });

    return serviceOk(undefined, requestId);
  } catch (err) {
    return serviceFail('INTERNAL_ERROR', (err as Error).message ?? 'Failed to reject purchase.', { requestId });
  }
}
