// ============================================================
// ImageCare ERP - Stage 3: Inventory Engine
// File: src/engines/inventory/inventoryEngine.ts
// Purpose: Authoritative inventory management.
//
// RULES:
//   Stock is ALWAYS derived from inventory_movements.
//   Never write stock totals directly to any column.
//   All movements use positive quantities; direction is
//   encoded in movement_type (per schema design).
//   Branch-specific stock is tracked by branch_id.
//   Movements are immutable once created.
//   Reversals use compensating movements with the opposite type.
// ============================================================

import { db } from '../../lib/db';
import type { UUID } from '../../types/database';
import type {
  EngineContext, EngineResult,
  InventoryMovementCommand, TransferStockCommand, StockAvailability,
} from '../types';
import { engineOk, engineFail, makeError } from '../types';

export class InventoryEngine {

  // ---- getStock -------------------------------------------
  // Derives current stock on hand from movements.
  // This is the single authoritative stock calculation.
  // Never reads a stored balance column.

  async getStock(
    ctx: EngineContext,
    productId: UUID,
    branchId:  UUID,
  ): Promise<EngineResult<StockAvailability>> {
    const { data, error } = await db.vw_stock_summary()
      
      .select('*')
      .eq('business_id', ctx.business_id)
      .eq('product_id', productId)
      .eq('branch_id', branchId)
      .maybeSingle();

    if (error) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to query stock.', error.message));
    }

    if (!data) {
      // No movements yet - stock is zero
      return engineOk({
        product_id:       productId,
        branch_id:        branchId,
        quantity_on_hand: 0,
        stock_value:      0,
        stock_status:     'out_of_stock',
        reorder_level:    0,
      });
    }

    return engineOk({
      product_id:       data.product_id as UUID,
      branch_id:        data.branch_id  as UUID,
      quantity_on_hand: Number(data.quantity_on_hand ?? 0),
      stock_value:      Number(data.stock_value ?? 0),
      stock_status:     (data.stock_status ?? 'out_of_stock') as StockAvailability['stock_status'],
      reorder_level:    Number(data.reorder_level ?? 0),
    });
  }

  // ---- checkAvailable -------------------------------------
  // Returns true if qty is available, false + error if not.

  async checkAvailable(
    ctx: EngineContext,
    productId: UUID,
    branchId:  UUID,
    quantity:  number,
  ): Promise<EngineResult<{ available: boolean; quantity_on_hand: number }>> {
    const stockResult = await this.getStock(ctx, productId, branchId);
    if (!stockResult.ok) return engineFail(stockResult.error!);

    const onHand = stockResult.data!.quantity_on_hand;
    if (onHand < quantity) {
      return engineFail(makeError(
        'INSUFFICIENT_STOCK',
        `Insufficient stock. Available: ${onHand}, Required: ${quantity}.`,
        `product_id: ${productId}, branch_id: ${branchId}`,
        'quantity',
      ));
    }

    return engineOk({ available: true, quantity_on_hand: onHand });
  }

  // ---- recordMovement -------------------------------------
  // Creates a single inventory movement record.
  // quantity must always be positive.
  // Direction is encoded in movement_type.

  async recordMovement(
    ctx: EngineContext,
    cmd: InventoryMovementCommand,
  ): Promise<EngineResult<{ movement_id: UUID }>> {
    if (cmd.quantity <= 0) {
      return engineFail(makeError('VALIDATION_ERROR', 'Inventory movement quantity must be positive.', undefined, 'quantity'));
    }

    // For sale movements, verify stock availability first
    const outTypes = ['sale','adjustment_out','transfer_out','return_out','damage','expiry'];
    if (outTypes.includes(cmd.movement_type)) {
      const check = await this.checkAvailable(ctx, cmd.product_id, cmd.branch_id, cmd.quantity);
      if (!check.ok) return engineFail(check.error!);
    }

    const { data, error } = await db.inventory_movements()
      
      .insert({
        business_id:    ctx.business_id,
        branch_id:      cmd.branch_id,
        product_id:     cmd.product_id,
        movement_type:  cmd.movement_type,
        quantity:       cmd.quantity,
        unit_cost:      cmd.unit_cost,
        reference_type: cmd.reference_type ?? null,
        reference_id:   cmd.reference_id   ?? null,
        from_branch_id: cmd.from_branch_id ?? null,
        to_branch_id:   cmd.to_branch_id   ?? null,
        expiry_date:    cmd.expiry_date     ?? null,
        batch_number:   cmd.batch_number    ?? null,
        notes:          cmd.notes           ?? null,
        moved_at:       new Date().toISOString(),
        created_by:     ctx.user_id,
      })
      .select('id')
      .single();

    if (error || !data) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to record inventory movement.', error?.message));
    }

    return engineOk({ movement_id: data.id as UUID });
  }

  // ---- receiveFromPurchase --------------------------------
  // Records stock-in movements for all items on a purchase.

  async receiveFromPurchase(
    ctx: EngineContext,
    purchaseId: UUID,
  ): Promise<EngineResult<{ movements: UUID[] }>> {
    // 2026-09-01: 'purchase_items' has two FKs into 'products' (the
    // real one, purchase_items_product_id_fkey, plus a legacy composite
    // fk_s2_purchase_items_biz_product) - an unqualified `products(...)`
    // embed is ambiguous between them and PostgREST rejects it
    // (PGRST201). See the identical fix + full explanation on the sale
    // side in businessEngine.ts's postSale().
    const { data: items, error } = await db.purchase_items()
      .select('*, products!purchase_items_product_id_fkey(is_stockable)')
      .eq('purchase_id', purchaseId)
      .eq('business_id', ctx.business_id);

    if (error) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to load purchase items.', error.message));
    }

    const { data: purchase } = await db.purchases()
      
      .select('branch_id')
      .eq('id', purchaseId)
      .single();

    if (!purchase) {
      return engineFail(makeError('RECORD_NOT_FOUND', 'Purchase not found.'));
    }

    const movementIds: UUID[] = [];

    for (const item of items ?? []) {
      type ItemWithProduct = typeof item & { products: { is_stockable: boolean } | null };
      const typedItem = item as ItemWithProduct;
      if (!typedItem.products?.is_stockable) continue;

      const result = await this.recordMovement(ctx, {
        branch_id:      purchase.branch_id,
        product_id:     item.product_id,
        movement_type:  'purchase',
        quantity:       Number(item.quantity),
        unit_cost:      Number(item.unit_cost),
        reference_type: 'purchase',
        reference_id:   purchaseId,
        expiry_date:    item.expiry_date ?? undefined,
        batch_number:   item.batch_number ?? undefined,
      });

      if (!result.ok) return engineFail(result.error!);
      movementIds.push(result.data!.movement_id);
    }

    return engineOk({ movements: movementIds });
  }

  // ---- deductForSale --------------------------------------
  // Records stock-out movements for all items on a sale.

  async deductForSale(
    ctx: EngineContext,
    saleId: UUID,
    // 2026-09-01: postSale() in businessEngine.ts already loads this
    // sale's items (with each product's is_stockable flag) and the
    // sale's branch_id before calling here - this used to re-fetch both
    // from scratch every time regardless, adding two full extra round
    // trips to every single sale. When the caller already has them,
    // passing them through skips both re-fetches entirely; any other
    // caller that doesn't have them yet still gets them fetched here,
    // same as before.
    preloaded?: { items: Record<string, unknown>[]; branchId: UUID },
  ): Promise<EngineResult<{ movements: UUID[] }>> {
    let items = preloaded?.items;
    let branchId = preloaded?.branchId;

    if (!items) {
      // 2026-09-01: same ambiguous-embed issue as receiveFromPurchase()
      // above and postSale() in businessEngine.ts - 'sale_items' has two
      // FKs into 'products', so the embed needs an explicit hint.
      const { data, error } = await db.sale_items()
        .select('*, products!sale_items_product_id_fkey(is_stockable)')
        .eq('sale_id', saleId)
        .eq('business_id', ctx.business_id);

      if (error) {
        return engineFail(makeError('DATABASE_ERROR', 'Failed to load sale items.', error.message));
      }
      items = data ?? [];
    }

    if (!branchId) {
      const { data: sale } = await db.sales()
        .select('branch_id')
        .eq('id', saleId)
        .single();

      if (!sale) return engineFail(makeError('RECORD_NOT_FOUND', 'Sale not found.'));
      branchId = sale.branch_id;
    }

    const movementIds: UUID[] = [];

    for (const item of items ?? []) {
      type ItemWithProduct = typeof item & { products: { is_stockable: boolean } | null; product_id: UUID; quantity: number; unit_cost: number };
      const typedItem = item as ItemWithProduct;
      if (!typedItem.products?.is_stockable) continue;

      const result = await this.recordMovement(ctx, {
        branch_id:     branchId as UUID,
        product_id:    typedItem.product_id,
        movement_type: 'sale',
        quantity:      Number(typedItem.quantity),
        unit_cost:     Number(typedItem.unit_cost),
        reference_type:'sale',
        reference_id:  saleId,
      });

      if (!result.ok) return engineFail(result.error!);
      movementIds.push(result.data!.movement_id);
    }

    return engineOk({ movements: movementIds });
  }

  // ---- reverseForSale ---------------------------------------
  // Records stock-IN movements reversing every item on a previously
  // CONFIRMED sale - the opposite of deductForSale(), used when a
  // completed sale is deleted so the stock it took out comes back.
  // 'return_in' is not in recordMovement()'s outTypes list, so no
  // availability check applies here - putting stock back can't ever be
  // blocked by "not enough of it," unlike taking it out.

  async reverseForSale(
    ctx: EngineContext,
    saleId: UUID,
    preloaded?: { items: Record<string, unknown>[]; branchId: UUID },
  ): Promise<EngineResult<{ movements: UUID[] }>> {
    let items = preloaded?.items;
    let branchId = preloaded?.branchId;

    if (!items) {
      const { data, error } = await db.sale_items()
        .select('*, products!sale_items_product_id_fkey(is_stockable)')
        .eq('sale_id', saleId)
        .eq('business_id', ctx.business_id);

      if (error) {
        return engineFail(makeError('DATABASE_ERROR', 'Failed to load sale items.', error.message));
      }
      items = data ?? [];
    }

    if (!branchId) {
      const { data: sale } = await db.sales()
        .select('branch_id')
        .eq('id', saleId)
        .single();

      if (!sale) return engineFail(makeError('RECORD_NOT_FOUND', 'Sale not found.'));
      branchId = sale.branch_id;
    }

    const reverseMovementIds: UUID[] = [];

    for (const item of items ?? []) {
      type ItemWithProduct = typeof item & { products: { is_stockable: boolean } | null; product_id: UUID; quantity: number; unit_cost: number };
      const typedItem = item as ItemWithProduct;
      if (!typedItem.products?.is_stockable) continue;

      const result = await this.recordMovement(ctx, {
        branch_id:     branchId as UUID,
        product_id:    typedItem.product_id,
        movement_type: 'return_in',
        quantity:      Number(typedItem.quantity),
        unit_cost:     Number(typedItem.unit_cost),
        reference_type:'sale',
        reference_id:  saleId,
      });

      if (!result.ok) return engineFail(result.error!);
      reverseMovementIds.push(result.data!.movement_id);
    }

    return engineOk({ movements: reverseMovementIds });
  }

  // ---- transferStock --------------------------------------
  // Transfers stock between branches atomically:
  // transfer_out from source, transfer_in to destination.

  async transferStock(
    ctx: EngineContext,
    cmd: TransferStockCommand,
  ): Promise<EngineResult<{ out_movement_id: UUID; in_movement_id: UUID }>> {
    if (cmd.from_branch_id === cmd.to_branch_id) {
      return engineFail(makeError('VALIDATION_ERROR', 'Source and destination branches must be different.'));
    }

    // Check available at source
    const check = await this.checkAvailable(ctx, cmd.product_id, cmd.from_branch_id, cmd.quantity);
    if (!check.ok) return engineFail(check.error!);

    // Out movement from source branch
    const outResult = await this.recordMovement(ctx, {
      branch_id:      cmd.from_branch_id,
      product_id:     cmd.product_id,
      movement_type:  'transfer_out',
      quantity:       cmd.quantity,
      unit_cost:      cmd.unit_cost,
      reference_type: cmd.reference_type ?? 'transfer',
      reference_id:   cmd.reference_id,
      from_branch_id: cmd.from_branch_id,
      to_branch_id:   cmd.to_branch_id,
      notes:          cmd.notes,
    });

    if (!outResult.ok) return engineFail(outResult.error!);

    // In movement to destination branch
    const inResult = await this.recordMovement(ctx, {
      branch_id:      cmd.to_branch_id,
      product_id:     cmd.product_id,
      movement_type:  'transfer_in',
      quantity:       cmd.quantity,
      unit_cost:      cmd.unit_cost,
      reference_type: cmd.reference_type ?? 'transfer',
      reference_id:   cmd.reference_id,
      from_branch_id: cmd.from_branch_id,
      to_branch_id:   cmd.to_branch_id,
      notes:          cmd.notes,
    });

    if (!inResult.ok) return engineFail(inResult.error!);

    return engineOk({
      out_movement_id: outResult.data!.movement_id,
      in_movement_id:  inResult.data!.movement_id,
    });
  }

  // ---- getLowStockAlerts ----------------------------------

  async getLowStockAlerts(
    ctx: EngineContext,
    branchId?: UUID,
  ): Promise<EngineResult<Array<{ product_id: UUID; product_name: string; sku: string | null; branch_id: UUID; quantity_on_hand: number; reorder_level: number; stock_status: string }>>> {
    let query = db.vw_stock_summary()
      
      .select('product_id, product_name, sku, branch_id, quantity_on_hand, reorder_level, stock_status')
      .eq('business_id', ctx.business_id)
      .in('stock_status', ['low_stock', 'out_of_stock']);

    if (branchId) query = query.eq('branch_id', branchId);

    const { data, error } = await query;

    if (error) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to query stock alerts.', error.message));
    }

    return engineOk(
      (data ?? []).map((d: Record<string, unknown>) => ({
        product_id:       d.product_id as UUID,
        product_name:     d.product_name as string,
        sku:              d.sku as string | null,
        branch_id:        d.branch_id as UUID,
        quantity_on_hand: Number(d.quantity_on_hand ?? 0),
        reorder_level:    Number(d.reorder_level ?? 0),
        stock_status:     d.stock_status as string,
      }))
    );
  }
}

export const inventoryEngine = new InventoryEngine();
