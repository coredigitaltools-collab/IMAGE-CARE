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
import { APP_CONSTANTS } from '../../config/env';
import { v4 as uuidv4 } from 'uuid';
import { inventoryEngine } from '../../engines';
import type { EngineContext } from '../../engines/types';

function toEngineContext(ctx: UserContext, branchId?: UUID): EngineContext {
  return {
    business_id: ctx.business_id,
    branch_id:   branchId ?? ctx.branch_id ?? null,
    user_id:     ctx.user_id,
    user_ctx:    ctx,
  };
}

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
  } catch {
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
  } catch {
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
    // fn_list_inventory_movements_cursor does not exist live or in any
    // tracked migration (confirmed by Phase 1 verification) - replaced with
    // a direct offset-paginated query against inventory_movements.
    const pageSize = Math.min(
      pagination.page_size ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE,
      APP_CONSTANTS.MAX_PAGE_SIZE
    );
    const offset = ((pagination.page ?? 1) - 1) * pageSize;

    let query = supabase.schema('imagecare').from('inventory_movements')
      .select('*', { count: 'exact' })
      .eq('business_id', ctx.business_id)
      .eq('branch_id', filter.branch_id)
      .range(offset, offset + pageSize - 1)
      .order('moved_at', { ascending: false });

    if (filter.product_id)     query = query.eq('product_id', filter.product_id);
    if (filter.movement_type)  query = query.eq('movement_type', filter.movement_type);
    if (filter.date?.from)     query = query.gte('moved_at', filter.date.from);
    if (filter.date?.to)       query = query.lte('moved_at', filter.date.to);

    const { data, error, count } = await query;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load movements.', { requestId });

    return serviceOk<PagedResponse<InventoryMovement>>({
      items: (data ?? []) as InventoryMovement[],
      pagination: {
        total_count:      count ?? 0,
        page_size:        pageSize,
        has_more:         (offset + pageSize) < (count ?? 0),
        next_cursor_date: null,
        next_cursor_id:   null,
      },
    }, requestId);
  } catch {
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
    // engine_stock_adjustment does not exist live or in any tracked
    // migration (confirmed by Phase 1 verification) - replaced with a
    // direct call to the real inventoryEngine.recordMovement(), which is
    // the single authoritative place inventory movements are written.
    const { data: product, error: productError } = await supabase
      .schema('imagecare')
      .from('products')
      .select('cost_price')
      .eq('id', request.product_id)
      .eq('business_id', ctx.business_id)
      .single();

    if (productError || !product) {
      return serviceFail('RESOURCE_NOT_FOUND', 'Product not found.', { requestId });
    }

    const result = await inventoryEngine.recordMovement(toEngineContext(ctx, request.branch_id), {
      branch_id:        request.branch_id,
      product_id:       request.product_id,
      movement_type:    request.quantity > 0 ? 'adjustment_in' : 'adjustment_out',
      quantity:         Math.abs(request.quantity),
      unit_cost:        Number(product.cost_price ?? 0),
      reference_type:   'adjustment',
      notes:            request.notes ? `${request.reason} - ${request.notes}` : request.reason,
      idempotency_key:  request.idempotency_key ?? uuidv4(),
    });

    if (result.error) {
      if (result.error.code === 'INSUFFICIENT_STOCK') {
        return serviceFail('BUSINESS_RULE_VIOLATION', 'Insufficient stock for this adjustment.', { requestId });
      }
      return serviceFail('INTERNAL_ERROR', result.error.message, { requestId });
    }

    return serviceOk(undefined, requestId);
  } catch {
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
    // stock_transfers / stock_transfer_items tables and the
    // engine_dispatch_transfer / engine_receive_transfer RPCs do not exist
    // live or in any tracked migration (confirmed by Phase 1 verification).
    // The real inventoryEngine.transferStock() only supports a single,
    // atomic transfer_out + transfer_in pair with no persistent "transfer"
    // entity - so a multi-line transfer request is applied as one atomic
    // movement pair per line, with no pending/in-transit intermediate
    // state. This is a deliberate simplification (documented in the final
    // report) rather than inventing new tables for a two-phase workflow.
    const transferId = uuidv4();
    const engineCtx = toEngineContext(ctx, request.from_branch_id);

    for (const item of request.items) {
      let unitCost = item.unit_cost;
      if (unitCost === undefined) {
        const { data: product } = await supabase
          .schema('imagecare')
          .from('products')
          .select('cost_price')
          .eq('id', item.product_id)
          .eq('business_id', ctx.business_id)
          .single();
        unitCost = Number(product?.cost_price ?? 0);
      }

      const result = await inventoryEngine.transferStock(engineCtx, {
        from_branch_id:  request.from_branch_id,
        to_branch_id:    request.to_branch_id,
        product_id:      item.product_id,
        quantity:        item.quantity,
        unit_cost:       unitCost,
        reference_type:  'transfer',
        reference_id:    transferId,
        idempotency_key: request.idempotency_key ? `${request.idempotency_key}:${item.product_id}` : uuidv4(),
        notes:           request.notes,
      });

      if (result.error) {
        if (result.error.code === 'INSUFFICIENT_STOCK') {
          return serviceFail('BUSINESS_RULE_VIOLATION', result.error.message, { requestId });
        }
        return serviceFail('INTERNAL_ERROR', result.error.message, { requestId });
      }
    }

    return serviceOk<StockTransferResult>({
      transfer_id:     transferId,
      transfer_number: `TRF-${transferId.slice(0, 8).toUpperCase()}`,
      status:          'completed',
    }, requestId);
  } catch {
    return serviceFail('INTERNAL_ERROR', 'Failed to create transfer.', { requestId });
  }
}

// receiveStockTransfer is retained for API compatibility but is now a
// no-op: createStockTransfer() applies transfer_out + transfer_in
// atomically (see comment above), so there is no separate pending/receive
// step to perform. Not currently called anywhere in the frontend
// (confirmed by repo-wide search).
export async function receiveStockTransfer(
  ctx: UserContext,
  _transferId: UUID
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();

  if (!canDo(ctx, 'inventory', 'create')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to receive transfers.', { requestId });
  }

  return serviceOk(undefined, requestId);
}
