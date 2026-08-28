// ============================================================
// IMC-BLD-003 | ImageCare ERP API & Service Contract v1.0
// File: src/services/sales/salesService.ts
// Purpose: Sales service - single controlled interface for all
//          sale operations. Every sale goes through the Business Engine.
//          Pages must never post sales directly to Supabase tables.
// ============================================================

import { supabase, rpc } from '../../lib/supabase';
import { parseError, canDo } from '../../types/app';
import { mapErrorCode, serviceOk, serviceFail, makeRequestId } from '../../types/contracts';
import type { ServiceResponse, PagedResponse, DateFilter, PaginationRequest } from '../../types/contracts';
import type { UserContext } from '../../types/app';
import type { Sale, SaleItem, PaymentMethod, UUID } from '../../types/database';
import { createAndPostSale, type CreateSaleInput } from '../business/businessEngine';
import { APP_CONSTANTS } from '../../config/env';
import { v4 as uuidv4 } from 'uuid';

// ---- Create Sale -------------------------------------------

export interface SaleRequest extends CreateSaleInput {
  idempotency_key?: string;
}

export interface SaleResult {
  sale_id: UUID;
  sale_number: string;
  status: string;
  total_amount: number;
  journal_entry_id: UUID | null;
}

export async function createSale(
  ctx: UserContext,
  request: SaleRequest
): Promise<ServiceResponse<SaleResult>> {
  const requestId = makeRequestId();

  if (!canDo(ctx, 'sales', 'create')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to create sales.', { requestId });
  }

  const result = await createAndPostSale(ctx, {
    ...request,
    idempotency_key: request.idempotency_key ?? uuidv4(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  if (result.error) {
    return serviceFail(mapErrorCode(result.error.code), result.error.message, { requestId });
  }

  const { data } = await supabase
    .schema('imagecare')
    .from('sales')
    .select('total_amount')
    .eq('id', result.data!.sale_id)
    .single();

  return serviceOk<SaleResult>({
    sale_id:          result.data!.sale_id,
    sale_number:      result.data!.sale_number,
    status:           result.data!.status,
    total_amount:     data?.total_amount ?? 0,
    journal_entry_id: result.data!.journal_entry_id,
  }, requestId);
}

// ---- Get Sale ----------------------------------------------

export interface SaleDetail extends Sale {
  items: SaleItem[];
  customer_name: string | null;
  served_by_name: string | null;
}

export async function getSale(
  ctx: UserContext,
  saleId: UUID
): Promise<ServiceResponse<SaleDetail>> {
  const requestId = makeRequestId();

  if (!canDo(ctx, 'sales', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view sales.', { requestId });
  }

  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('sales')
      .select(`
        *,
        sale_items(*),
        customers(name),
        users!sales_served_by_fkey(first_name, last_name)
      `)
      .eq('id', saleId)
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      return serviceFail('RESOURCE_NOT_FOUND', 'Sale not found.', { requestId });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sale = data as any;
    return serviceOk<SaleDetail>({
      ...sale,
      items:           sale.sale_items ?? [],
      customer_name:   sale.customers?.name ?? null,
      served_by_name:  sale.users ? `${sale.users.first_name} ${sale.users.last_name}` : null,
    }, requestId);
  } catch (err) {
    return serviceFail('INTERNAL_ERROR', 'Failed to load sale.', { requestId, detail: String(err) });
  }
}

// ---- List Sales --------------------------------------------

export interface SaleFilter {
  branch_id?: UUID;
  customer_id?: UUID;
  status?: Sale['status'];
  payment_method?: PaymentMethod;
  date?: DateFilter;
  search?: string;
}

export async function listSales(
  ctx: UserContext,
  filter: SaleFilter = {},
  pagination: PaginationRequest = {}
): Promise<ServiceResponse<PagedResponse<Sale>>> {
  const requestId = makeRequestId();

  if (!canDo(ctx, 'sales', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view sales.', { requestId });
  }

  try {
    // fn_list_sales_cursor does not exist live or in any tracked migration
    // (confirmed 2026-08-27 by direct inspection of the ImageCare Supabase
    // project's imagecare schema functions) - replaced with a direct
    // offset-paginated query, matching the pattern already used by
    // listPurchases/listInventory in this codebase.
    const pageSize = Math.min(
      pagination.page_size ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE,
      APP_CONSTANTS.MAX_PAGE_SIZE
    );
    const offset = ((pagination.page ?? 1) - 1) * pageSize;

    let q = supabase.schema('imagecare').from('sales')
      .select('*', { count: 'exact' })
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null)
      .range(offset, offset + pageSize - 1)
      .order('sale_date', { ascending: false });

    if (filter.branch_id)      q = q.eq('branch_id', filter.branch_id);
    if (filter.customer_id)    q = q.eq('customer_id', filter.customer_id);
    if (filter.status)         q = q.eq('status', filter.status);
    if (filter.payment_method) q = q.eq('payment_method', filter.payment_method);
    if (filter.date?.from)     q = q.gte('sale_date', filter.date.from);
    if (filter.date?.to)       q = q.lte('sale_date', filter.date.to);

    const { data, error, count } = await q;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load sales.', { requestId });

    return serviceOk<PagedResponse<Sale>>({
      items: (data ?? []) as Sale[],
      pagination: {
        total_count:      count ?? 0,
        page_size:        pageSize,
        has_more:         (offset + pageSize) < (count ?? 0),
        next_cursor_date: null,
        next_cursor_id:   null,
      },
    }, requestId);
  } catch {
    return serviceFail('INTERNAL_ERROR', 'Failed to load sales.', { requestId });
  }
}

// ---- Cancel Sale -------------------------------------------

export async function cancelSale(
  ctx: UserContext,
  saleId: UUID,
  reason: string
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();

  if (!canDo(ctx, 'sales', 'edit')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to cancel sales.', { requestId });
  }

  if (!reason?.trim()) {
    return serviceFail('INVALID_INPUT', 'A cancellation reason is required.', { requestId, field: 'reason' });
  }

  try {
    // Verify sale is in draft or confirmed (not already cancelled)
    const { data: sale } = await supabase
      .schema('imagecare')
      .from('sales')
      .select('status')
      .eq('id', saleId)
      .eq('business_id', ctx.business_id)
      .single();

    if (!sale) return serviceFail('RESOURCE_NOT_FOUND', 'Sale not found.', { requestId });
    if (sale.status === 'cancelled') return serviceFail('BUSINESS_RULE_VIOLATION', 'Sale is already cancelled.', { requestId });
    if (sale.status === 'voided') return serviceFail('BUSINESS_RULE_VIOLATION', 'Voided sales cannot be cancelled.', { requestId });

    // If confirmed, route through return engine to reverse inventory + journal
    if (sale.status === 'confirmed') {
      // Get all items for full return
      const { data: items } = await supabase
        .schema('imagecare')
        .from('sale_items')
        .select('product_id, quantity')
        .eq('sale_id', saleId);

      const { error } = await rpc('engine_return_sale', {
        p_sale_id:  saleId,
        p_user_id:  ctx.user_id,
        p_reason:   reason,
        p_items:    JSON.stringify(items ?? []),
        p_idempotency_key: uuidv4(),
      });

      if (error) return serviceFail('BUSINESS_RULE_VIOLATION', parseError(error).message, { requestId });
    } else {
      // Draft - just mark cancelled
      const { error } = await supabase
        .schema('imagecare')
        .from('sales')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', saleId)
        .eq('business_id', ctx.business_id);

      if (error) return serviceFail('INTERNAL_ERROR', 'Failed to cancel sale.', { requestId });
    }

    return serviceOk(undefined, requestId);
  } catch {
    return serviceFail('INTERNAL_ERROR', 'Failed to cancel sale.', { requestId });
  }
}

// ---- Sale Receipt ------------------------------------------

export interface SaleReceipt {
  sale_number: string;
  sale_date: string;
  business_name: string;
  branch_name: string;
  customer_name: string | null;
  served_by: string | null;
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    discount_amount: number;
    line_total: number;
  }>;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  change_given: number;
  payment_method: string;
}

export async function getSaleReceipt(
  ctx: UserContext,
  saleId: UUID
): Promise<ServiceResponse<SaleReceipt>> {
  const requestId = makeRequestId();

  if (!canDo(ctx, 'sales', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view receipts.', { requestId });
  }

  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('sales')
      .select(`
        sale_number, sale_date, payment_method,
        subtotal, discount_amount, tax_amount,
        total_amount, amount_paid, change_given,
        customers(name),
        branches(name),
        businesses(name),
        users!sales_served_by_fkey(first_name, last_name),
        sale_items(
          quantity, unit_price, discount_amount, line_total,
          products(name)
        )
      `)
      .eq('id', saleId)
      .eq('business_id', ctx.business_id)
      .single();

    if (error || !data) {
      return serviceFail('RESOURCE_NOT_FOUND', 'Sale not found.', { requestId });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = data as any;
    return serviceOk<SaleReceipt>({
      sale_number:     s.sale_number,
      sale_date:       s.sale_date,
      business_name:   s.businesses?.name ?? '',
      branch_name:     s.branches?.name ?? '',
      customer_name:   s.customers?.name ?? null,
      served_by:       s.users ? `${s.users.first_name} ${s.users.last_name}` : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items:           (s.sale_items ?? []).map((si: any) => ({
        product_name:   si.products?.name ?? '',
        quantity:       si.quantity,
        unit_price:     si.unit_price,
        discount_amount: si.discount_amount,
        line_total:     si.line_total,
      })),
      subtotal:        s.subtotal,
      discount_amount: s.discount_amount,
      tax_amount:      s.tax_amount,
      total_amount:    s.total_amount,
      amount_paid:     s.amount_paid,
      change_given:    s.change_given,
      payment_method:  s.payment_method,
    }, requestId);
  } catch {
    return serviceFail('INTERNAL_ERROR', 'Failed to load receipt.', { requestId });
  }
}
