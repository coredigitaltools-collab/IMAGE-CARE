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
