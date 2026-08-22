// ============================================================
// IMC-BLD-003 | ImageCare ERP API & Service Contract v1.0
// File: src/services/purchasing/purchasingService.ts
// Purpose: Purchasing service - purchases, supplier payments.
// ============================================================

import { supabase, rpc } from '../../lib/supabase';
import { canDo, parseError } from '../../types/app';
import { serviceOk, serviceFail, makeRequestId } from '../../types/contracts';
import type { ServiceResponse, PagedResponse, DateFilter, PaginationRequest } from '../../types/contracts';
import type { UserContext } from '../../types/app';
import type { Purchase, UUID } from '../../types/database';
import { createAndPostPurchase, type CreatePurchaseInput } from '../business/businessEngine';
import { APP_CONSTANTS } from '../../config/env';
import { v4 as uuidv4 } from 'uuid';

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
    const pageSize = Math.min(pagination.page_size ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE, APP_CONSTANTS.MAX_PAGE_SIZE);
    const { data, error } = await rpc('fn_list_purchases_cursor', {
      p_business_id:  ctx.business_id,
      p_branch_id:    filter.branch_id   ?? null,
      p_supplier_id:  filter.supplier_id ?? null,
      p_status:       filter.status      ?? null,
      p_from_date:    filter.date?.from  ?? null,
      p_to_date:      filter.date?.to    ?? null,
      p_cursor_date:  pagination.cursor_date ?? null,
      p_cursor_id:    pagination.cursor_id   ?? null,
      p_limit:        pageSize + 1,
    });
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load purchases.', { requestId });
    const rows = (data ?? []) as Purchase[];
    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const last = items[items.length - 1] as any;
    return serviceOk({ items, pagination: { total_count: 0, page_size: pageSize, has_more: hasMore, next_cursor_date: hasMore ? last?.next_cursor_date ?? null : null, next_cursor_id: hasMore ? last?.next_cursor_id ?? null : null } }, requestId);
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
    const { error } = await rpc('engine_process_supplier_payment', {
      p_business_id:     ctx.business_id,
      p_branch_id:       input.branch_id,
      p_supplier_id:     input.supplier_id,
      p_amount:          input.amount,
      p_payment_method:  input.payment_method,
      p_user_id:         ctx.user_id,
      p_reference_notes: input.reference_notes ?? null,
      p_idempotency_key: uuidv4(),
    });
    if (error) return serviceFail('BUSINESS_RULE_VIOLATION', parseError(error).message, { requestId });
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
  if (!canDo(ctx, 'purchasing', 'edit'))
    return serviceFail('PERMISSION_DENIED', 'Permission denied.', { requestId });
  try {
    const key = idempotencyKey ?? crypto.randomUUID();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_imc_receive_purchase', {
      p_purchase_id: purchaseId, p_business_id: ctx.business_id, p_idempotency_key: key,
    });
    if (error) {
      const msg = (error as { message?: string })?.message ?? 'Failed to receive stock';
      return serviceFail('INTERNAL_ERROR', msg, { requestId });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any;
    return serviceOk({ purchase_id: d?.purchase_id ?? purchaseId, status: d?.status ?? 'confirmed', journal_entry_id: d?.journal_entry_id ?? null }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to receive stock.', { requestId }); }
}

export const recordGoodsReceipt = approvePurchaseOrder;

export interface PurchaseDashboardKpis {
  total_orders: number; pending_orders: number; total_spend_month: number;
  outstanding_payables: number; openOrders: number; pendingApproval: number;
  pendingReceipt: number; spendThisMonthUgx: number;
}

export async function getPurchaseDashboardKpis(
  ctx: UserContext, branchId?: UUID
): Promise<ServiceResponse<PurchaseDashboardKpis>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'purchasing', 'view'))
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
