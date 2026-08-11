// ============================================================
// IMC-BLD-003 | ImageCare ERP API & Service Contract v1.0
// File: src/services/inventory/inventoryService.ts
// Purpose: Inventory service - stock queries, movements,
//          adjustments and transfers.
//          Direct client overwrites of stock balances are prohibited.
//          All changes go through the Business Engine.
// ============================================================

import { supabase } from '../../lib/supabase';
import { canDo } from '../../types/app';
import { serviceOk, serviceFail, makeRequestId } from '../../types/contracts';
import type { ServiceResponse, PagedResponse, DateFilter, PaginationRequest } from '../../types/contracts';
import type { UserContext } from '../../types/app';
import type { InventoryMovement, UUID } from '../../types/database';
import type { StockSummaryRow } from '../../types/database';
import type { StockAdjustment } from '../../types/schema';
import { APP_CONSTANTS } from '../../config/env';
import { v4 as uuidv4 } from 'uuid';

// ---- Get Stock ---------------------------------------------

export interface StockLevel {
  product_id: UUID;
  product_name: string;
  sku: string | null;
  branch_id: UUID;
  branch_name: string;
  quantity_on_hand: number;
  stock_value: number;
  reorder_level: number;
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
  cost_price: number;
  selling_price: number;
}

export async function getStock(
  ctx: UserContext,
  productId: UUID,
  branchId: UUID
): Promise<ServiceResponse<StockLevel>> {
  const requestId = makeRequestId();

  if (!canDo(ctx, 'inventory', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view stock.', { requestId });
  }

  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('vw_stock_summary')
      .select('*')
      .eq('business_id', ctx.business_id)
      .eq('product_id', productId)
      .eq('branch_id', branchId)
      .maybeSingle();

    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load stock.', { requestId });
    if (!data) return serviceFail('RESOURCE_NOT_FOUND', 'Stock record not found.', { requestId });

    const row = data as StockSummaryRow;
    return serviceOk<StockLevel>({
      product_id:       row.product_id,
      product_name:     row.product_name,
      sku:              row.sku,
      branch_id:        row.branch_id,
      branch_name:      row.branch_name,
      quantity_on_hand: row.quantity_on_hand,
      stock_value:      row.stock_value,
      reorder_level:    row.reorder_level,
      stock_status:     row.stock_status,
      cost_price:       row.cost_price,
      selling_price:    row.selling_price,
    }, requestId);
  } catch (err) {
    return serviceFail('INTERNAL_ERROR', 'Failed to load stock.', { requestId });
  }
}

// ---- List Inventory ----------------------------------------

export interface InventoryFilter {
  branch_id?: UUID;
  category_id?: UUID;
  stock_status?: 'in_stock' | 'low_stock' | 'out_of_stock';
  search?: string;
}

export async function listInventory(
  ctx: UserContext,
  filter: InventoryFilter = {},
  pagination: PaginationRequest = {}
): Promise<ServiceResponse<PagedResponse<StockSummaryRow>>> {
  const requestId = makeRequestId();

  if (!canDo(ctx, 'inventory', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view inventory.', { requestId });
  }

  try {
    const pageSize = Math.min(
      pagination.page_size ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE,
      APP_CONSTANTS.MAX_PAGE_SIZE
    );
    const offset = ((pagination.page ?? 1) - 1) * pageSize;

    let query = supabase
      .schema('imagecare')
      .from('vw_stock_summary')
      .select('*', { count: 'exact' })
      .eq('business_id', ctx.business_id)
      .range(offset, offset + pageSize - 1)
      .order('product_name');

    if (filter.branch_id)    query = query.eq('branch_id', filter.branch_id);
    if (filter.stock_status) query = query.eq('stock_status', filter.stock_status);
    if (filter.search)       query = query.ilike('product_name', `%${filter.search}%`);

    const { data, error, count } = await query;

    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load inventory.', { requestId });

    return serviceOk<PagedResponse<StockSummaryRow>>({
      items: (data ?? []) as StockSummaryRow[],
      pagination: {
        total_count:      count ?? 0,
        page_size:        pageSize,
        has_more:         (offset + pageSize) < (count ?? 0),
        next_cursor_date: null,
        next_cursor_id:   null,
      },
    }, requestId);
  } catch (err) {
    return serviceFail('INTERNAL_ERROR', 'Failed to load inventory.', { requestId });
  }
}

// ---- Inventory Movements -----------------------------------

export interface MovementFilter {
  branch_id: UUID;
  product_id?: UUID;
  movement_type?: InventoryMovement['movement_type'];
  date?: DateFilter;
}

export async function getInventoryMovements(
  ctx: UserContext,
  filter: MovementFilter,
  pagination: PaginationRequest = {}
): Promise<ServiceResponse<PagedResponse<InventoryMovement>>> {
  const requestId = makeRequestId();

  if (!canDo(ctx, 'inventory', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view inventory movements.', { requestId });
  }

  try {
    const pageSize = Math.min(
      pagination.page_size ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE,
      APP_CONSTANTS.MAX_PAGE_SIZE
    );

    const { data, error } = await supabase.rpc('fn_list_inventory_movements_cursor', {
      p_business_id: ctx.business_id,
      p_branch_id:   filter.branch_id,
      p_product_id:  filter.product_id  ?? null,
      p_type:        filter.movement_type ?? null,
      p_from_date:   filter.date?.from   ?? null,
      p_to_date:     filter.date?.to     ?? null,
      p_cursor_date: pagination.cursor_date ?? null,
      p_cursor_id:   pagination.cursor_id   ?? null,
      p_limit:       pageSize + 1,
    });

    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load movements.', { requestId });

    const rows = (data ?? []) as InventoryMovement[];
    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const last = items[items.length - 1] as any;

    return serviceOk<PagedResponse<InventoryMovement>>({
      items,
      pagination: {
        total_count:      0,
        page_size:        pageSize,
        has_more:         hasMore,
        next_cursor_date: hasMore ? last?.moved_at ?? null : null,
        next_cursor_id:   hasMore ? last?.id ?? null : null,
      },
    }, requestId);
  } catch (err) {
    return serviceFail('INTERNAL_ERROR', 'Failed to load movements.', { requestId });
  }
}

// ---- Stock Adjustment --------------------------------------

export interface StockAdjustmentRequest {
  branch_id: UUID;
  product_id: UUID;
  quantity: number;          // positive = in, negative = out
  reason: string;
  notes?: string;
  idempotency_key?: string;
}

export async function createStockAdjustment(
  ctx: UserContext,
  request: StockAdjustmentRequest
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();

  if (!canDo(ctx, 'inventory', 'approve')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to adjust stock.', { requestId });
  }

  if (request.quantity === 0) {
    return serviceFail('INVALID_INPUT', 'Adjustment quantity cannot be zero.', { requestId, field: 'quantity' });
  }

  if (!request.reason?.trim()) {
    return serviceFail('INVALID_INPUT', 'An adjustment reason is required.', { requestId, field: 'reason' });
  }

  try {
    const { error } = await supabase.rpc('engine_stock_adjustment', {
      p_business_id:     ctx.business_id,
      p_branch_id:       request.branch_id,
      p_product_id:      request.product_id,
      p_quantity:        request.quantity,
      p_reason:          request.reason,
      p_user_id:         ctx.user_id,
      p_notes:           request.notes ?? null,
      p_idempotency_key: request.idempotency_key ?? uuidv4(),
    });

    if (error) {
      const appErr = { message: error.message };
      if (error.message.includes('INSUFFICIENT_STOCK')) {
        return serviceFail('BUSINESS_RULE_VIOLATION', 'Insufficient stock for this adjustment.', { requestId });
      }
      return serviceFail('INTERNAL_ERROR', appErr.message, { requestId });
    }

    return serviceOk(undefined, requestId);
  } catch (err) {
    return serviceFail('INTERNAL_ERROR', 'Failed to create adjustment.', { requestId });
  }
}

// ---- Stock Transfer ----------------------------------------

export interface StockTransferRequest {
  from_branch_id: UUID;
  to_branch_id: UUID;
  items: Array<{ product_id: UUID; quantity: number; unit_cost?: number }>;
  notes?: string;
  idempotency_key?: string;
}

export interface StockTransferResult {
  transfer_id: UUID;
  transfer_number: string;
  status: string;
}

export async function createStockTransfer(
  ctx: UserContext,
  request: StockTransferRequest
): Promise<ServiceResponse<StockTransferResult>> {
  const requestId = makeRequestId();

  if (!canDo(ctx, 'inventory', 'create')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to create transfers.', { requestId });
  }

  if (request.from_branch_id === request.to_branch_id) {
    return serviceFail('INVALID_INPUT', 'Source and destination branches must be different.', { requestId });
  }

  if (!request.items?.length) {
    return serviceFail('INVALID_INPUT', 'At least one item is required.', { requestId, field: 'items' });
  }

  try {
    const transferId = uuidv4();

    // Create transfer header
    const { error: headerError } = await supabase
      .schema('imagecare')
      .from('stock_transfers')
      .insert({
        id:              transferId,
        business_id:     ctx.business_id,
        from_branch_id:  request.from_branch_id,
        to_branch_id:    request.to_branch_id,
        transfer_number: 'AUTO',
        status:          'pending',
        notes:           request.notes ?? null,
        created_by:      ctx.user_id,
      });

    if (headerError) return serviceFail('INTERNAL_ERROR', 'Failed to create transfer.', { requestId });

    // Insert items
    const items = request.items.map(item => ({
      id:          uuidv4(),
      transfer_id: transferId,
      business_id: ctx.business_id,
      product_id:  item.product_id,
      quantity:    item.quantity,
      unit_cost:   item.unit_cost ?? 0,
    }));

    const { error: itemsError } = await supabase
      .schema('imagecare')
      .from('stock_transfer_items')
      .insert(items);

    if (itemsError) return serviceFail('INTERNAL_ERROR', 'Failed to add transfer items.', { requestId });

    // Dispatch (deduct from source)
    const { error: dispatchError } = await supabase.rpc('engine_dispatch_transfer', {
      p_transfer_id:     transferId,
      p_user_id:         ctx.user_id,
      p_idempotency_key: request.idempotency_key ?? uuidv4(),
    });

    if (dispatchError) {
      return serviceFail('BUSINESS_RULE_VIOLATION', dispatchError.message, { requestId });
    }

    const { data: transfer } = await supabase
      .schema('imagecare')
      .from('stock_transfers')
      .select('transfer_number, status')
      .eq('id', transferId)
      .single();

    return serviceOk<StockTransferResult>({
      transfer_id:     transferId,
      transfer_number: transfer?.transfer_number ?? '',
      status:          transfer?.status ?? 'dispatched',
    }, requestId);
  } catch (err) {
    return serviceFail('INTERNAL_ERROR', 'Failed to create transfer.', { requestId });
  }
}

export async function receiveStockTransfer(
  ctx: UserContext,
  transferId: UUID
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();

  if (!canDo(ctx, 'inventory', 'create')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to receive transfers.', { requestId });
  }

  try {
    const { error } = await supabase.rpc('engine_receive_transfer', {
      p_transfer_id: transferId,
      p_user_id:     ctx.user_id,
      p_idempotency_key: uuidv4(),
    });

    if (error) return serviceFail('BUSINESS_RULE_VIOLATION', error.message, { requestId });
    return serviceOk(undefined, requestId);
  } catch (err) {
    return serviceFail('INTERNAL_ERROR', 'Failed to receive transfer.', { requestId });
  }
}
