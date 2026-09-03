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
import { purchasingEngine as realPurchasingEngine, inventoryEngine as realInventoryEngine } from '../../engines';
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
      // Root cause (2026-09-03 human-testing round): 'purchase_items' ALSO
      // has two FKs back into 'purchases' itself (the real
      // purchase_items_purchase_id_fkey, plus a legacy composite
      // fk_s2_purchase_items_biz_purchase) - one level up from the
      // products ambiguity already fixed below. Disambiguating only the
      // inner `products` embed still left the outer `purchase_items` embed
      // itself ambiguous, so PostgREST returned HTTP 300 ("Multiple
      // Choices" / PGRST201) for this entire query - confirmed live via
      // Supabase's edge logs. supabase-js surfaces that as `error`, and
      // since a 300 isn't a thrown exception, it silently produced an
      // empty list rather than a visible failure: a real Order was
      // present in the database the whole time, the query to read it back
      // was simply erroring out. Both embeds now name their FK explicitly.
      .select('*, purchase_items!purchase_items_purchase_id_fkey(*, products!purchase_items_product_id_fkey(name, sku)), suppliers(name)')
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

    // Bug fix (Purchasing module audit 2026-09-03): this used to select
    // plain '*' with no embed, while every consumer (RequisitionsPage,
    // PurchaseOrdersPage, PurchaseOrderDetailPage) unconditionally reads
    // `.items.length` / `.items.map(...)` / `.items.reduce(...)` on every
    // row - `items` was always undefined here (only getPurchase() embedded
    // purchase_items), so both pages threw a TypeError on the very first
    // render and tripped the route error boundary ("Something went
    // wrong."). Mirrors the identical fix already applied to
    // inventoryReportsService's Fast/Slow Moving report. The `products`
    // sub-embed (explicit FK hint - see getPurchase() above for why) lets
    // line items show a real product name/SKU instead of nothing.
    //
    // Root cause (2026-09-03 human-testing round): this fix was incomplete
    // - 'purchase_items' also has two FKs back into 'purchases' itself
    // (purchase_items_purchase_id_fkey, plus a legacy composite
    // fk_s2_purchase_items_biz_purchase), so the outer `purchase_items`
    // embed was ALSO ambiguous even after the inner `products` embed was
    // fixed. PostgREST returned HTTP 300 for this whole query (confirmed
    // live via Supabase's edge logs) - a newly created order really was
    // saved to the database, but this query to list it back was silently
    // erroring, which the pages below rendered as "No purchase orders
    // yet" / "No requisitions yet" rather than a visible error. See
    // getPurchase() above for the identical fix.
    let q = supabase.schema('imagecare').from('purchases')
      .select('*, purchase_items!purchase_items_purchase_id_fkey(*, products!purchase_items_product_id_fkey(name, sku)), suppliers(name)', { count: 'exact' })
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
    // Same ambiguous-embed issue as listPurchases()/getPurchase() above -
    // 'purchase_items' has two FKs back into 'purchases', so this embed
    // needs the same explicit FK hint or it errors with PGRST201/HTTP 300.
    const { data: purchase, error: loadErr } = await supabase
      .schema('imagecare')
      .from('purchases')
      .select('id, notes, purchase_items!purchase_items_purchase_id_fkey(product_id, quantity)')
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
  pendingReceipt: number; spendThisMonthUgx: number; overdueDeliveries: number;
}

// Bug fix (Purchasing module audit 2026-09-03): "Open orders" and "Pending
// approval" used to both read the exact same number (every 'draft' row,
// requisitions and priced orders alike, undifferentiated) - a bare
// requisition (no supplier yet) and a real priced order awaiting receipt
// are different things happening on this dashboard, so they're split by
// whether a supplier has been assigned (mirrors the real distinction
// RequisitionFormModal vs PurchaseOrderFormModal already draw - see
// mapPurchaseToRequisition/mapPurchaseToOrder in usePurchasingData.ts).
// `overdueDeliveries` was read by PurchaseDashboardPage.tsx but never
// present on this object at all (always rendered as the literal text
// "undefined") - added here from the real `due_date` column.
export async function getPurchaseDashboardKpis(
  ctx: UserContext, branchId?: UUID
): Promise<ServiceResponse<PurchaseDashboardKpis>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'purchases', 'view'))
    return serviceFail('PERMISSION_DENIED', 'Permission denied.', { requestId });
  try {
    let q = supabase.schema('imagecare').from('purchases')
      .select('status, supplier_id, total_amount, balance_due, purchase_date, due_date', { count: 'exact' })
      .eq('business_id', ctx.business_id).is('deleted_at', null);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed.', { requestId });
    const rows = (data ?? []) as Array<{ status: string; supplier_id: string | null; total_amount: number; balance_due: number; purchase_date: string; due_date: string | null }>;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const now = new Date().toISOString();
    const draftRows = rows.filter(r => r.status === 'draft');
    const pendingApproval = draftRows.filter(r => !r.supplier_id).length; // bare requisitions, no supplier chosen yet
    const openOrders = draftRows.filter(r => r.supplier_id).length; // priced orders, not yet received
    const spend   = rows.filter(r => r.purchase_date >= monthStart && r.status === 'confirmed').reduce((s, r) => s + r.total_amount, 0);
    const payable = rows.reduce((s, r) => s + (r.balance_due ?? 0), 0);
    const overdueDeliveries = draftRows.filter(r => r.supplier_id && r.due_date && r.due_date < now).length;
    return serviceOk({
      total_orders: rows.length, pending_orders: draftRows.length, total_spend_month: spend,
      outstanding_payables: payable, openOrders, pendingApproval,
      pendingReceipt: openOrders,
      spendThisMonthUgx: spend,
      overdueDeliveries,
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

// Bug fix (Purchasing module audit 2026-09-03): "Convert to order" on a
// requisition (RequisitionsPage.tsx) creates a brand-new priced purchase
// row via createPurchaseOrder() - the original bare requisition row was
// simply left sitting in 'draft' with nothing to say it had already been
// turned into an order, so it kept reappearing in the Requisitions list
// and could be converted again into a second, duplicate order. The real
// status enum has no 'converted' value to record that distinctly (only
// draft/confirmed/cancelled/voided), so - the same way rejectPurchase()
// above records a rejection reason in `notes` rather than inventing a
// column - this closes the original requisition out via the one real
// terminal state a still-draft purchase can reach ('cancelled'), with a
// clearly worded note (never "Rejected:", so it reads honestly in the UI
// and audit log) identifying which order it became.
export async function markRequisitionConverted(
  ctx: UserContext,
  requisitionId: UUID,
  newPurchaseNumber: string,
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'purchases', 'edit'))
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to update requisitions.', { requestId });
  try {
    const purchaseResult = await getPurchase(ctx, requisitionId);
    if (purchaseResult.error || !purchaseResult.data) return serviceFail('RESOURCE_NOT_FOUND', 'Requisition not found.', { requestId });
    const purchase = purchaseResult.data;
    if (purchase.status !== 'draft') {
      // Already actioned (converted/rejected) - nothing to do, not an error.
      return serviceOk(undefined, requestId);
    }

    const note = `Converted to purchase order ${newPurchaseNumber}`;
    const { error } = await supabase.schema('imagecare').from('purchases').update({
      status: 'cancelled' as const,
      notes: purchase.notes ? `${purchase.notes} | ${note}` : note,
      updated_at: new Date().toISOString(),
    }).eq('id', requisitionId).eq('business_id', ctx.business_id);

    if (error) return serviceFail('INTERNAL_ERROR', error.message, { requestId });
    return serviceOk(undefined, requestId);
  } catch (err) {
    return serviceFail('INTERNAL_ERROR', (err as Error).message ?? 'Failed to update requisition.', { requestId });
  }
}

// ============================================================
// Purchase Returns
// ============================================================
// Root cause (Purchasing module audit 2026-09-03): the UI's "Record
// return" action always threw "Purchase returns aren't available yet" -
// the hook was a hardcoded stub with a comment claiming a dedicated
// returns table doesn't exist in the Stage 4 DB. It doesn't, but the real
// schema already has everything a purchase return needs: the
// imagecare.inventory_movements table's movement_type enum has both
// 'return_in' (stock coming back from a customer, already used by
// reverseForSale() in inventoryEngine.ts) and 'return_out' (stock going
// OUT back to a supplier) - the exact mechanism this workflow needs, sitting
// unused. This reuses that real, already-working, already-audited
// (checkAvailable / stock-derived-from-movements) mechanism rather than
// inventing a new table or a fake success. Every line of a return is
// grouped under one synthetic reference_id (inventory_movements has no
// FK on reference_id, so this is safe) with reference_type
// 'purchase_return'; since inventory_movements has no supplier_id column
// and no returns-specific table exists to add one to without a schema
// migration (out of scope for this fix), the supplier is recorded via a
// small parseable prefix on `notes` - the same "reuse an existing
// extensible column rather than add a new one" pattern already used
// throughout this codebase for cancel reasons / closed-at timestamps
// (see cancelBill/closeBill in creditService.ts).

export interface PurchaseReturnItemInput {
  product_id: UUID;
  quantity: number;
  unit_cost: number;
}

export interface CreatePurchaseReturnInput {
  branch_id: UUID;
  supplier_id: UUID;
  purchase_id?: UUID | null;
  reason: string;
  items: PurchaseReturnItemInput[];
}

export interface PurchaseReturnRow {
  id: string; // synthetic, = reference_id shared by every line of this return
  reference: string;
  supplierId: string;
  purchaseOrderId: string | null;
  items: Array<{ productId: string; productName: string; sku: string; quantity: number; unitCost: number }>;
  reason: string;
  createdAt: string;
  createdBy: string;
}

const RETURN_NOTE_PREFIX = '[purchase_return]';

function encodeReturnNotes(supplierId: UUID, purchaseId: UUID | null | undefined, reason: string): string {
  return `${RETURN_NOTE_PREFIX} supplier=${supplierId} purchase=${purchaseId ?? ''} :: ${reason.trim()}`;
}

function decodeReturnNotes(notes: string | null): { supplierId: string; purchaseId: string | null; reason: string } | null {
  if (!notes || !notes.startsWith(RETURN_NOTE_PREFIX)) return null;
  const match = notes.match(/^\[purchase_return\] supplier=([0-9a-f-]+) purchase=([0-9a-f-]*) :: ([\s\S]*)$/i);
  if (!match) return null;
  return { supplierId: match[1], purchaseId: match[2] || null, reason: match[3] };
}

export async function createPurchaseReturn(
  ctx: UserContext,
  input: CreatePurchaseReturnInput
): Promise<ServiceResponse<{ return_id: UUID }>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'purchases', 'edit')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to record purchase returns.', { requestId });
  }
  if (!input.items?.length) {
    return serviceFail('INVALID_INPUT', 'A return must have at least one item.', { requestId });
  }
  if (!input.reason?.trim()) {
    return serviceFail('INVALID_INPUT', 'A reason is required to record a return.', { requestId, field: 'reason' });
  }
  try {
    const ectx = toEngineContext(ctx, input.branch_id);

    // Validate every line has enough stock on hand before writing any
    // movement, so a return with several lines can't fail halfway through
    // and leave some products already deducted while others weren't.
    for (const item of input.items) {
      const check = await realInventoryEngine.checkAvailable(ectx, item.product_id, input.branch_id, item.quantity);
      if (!check.ok) return serviceFail('BUSINESS_RULE_VIOLATION', check.error!.message, { requestId });
    }

    const returnId = uuidv4() as UUID;
    const notes = encodeReturnNotes(input.supplier_id, input.purchase_id, input.reason);

    for (const item of input.items) {
      const result = await realInventoryEngine.recordMovement(ectx, {
        branch_id:      input.branch_id,
        product_id:     item.product_id,
        movement_type:  'return_out',
        quantity:       item.quantity,
        unit_cost:      item.unit_cost,
        reference_type: 'purchase_return',
        reference_id:   returnId,
        notes,
      });
      if (!result.ok) return serviceFail('INTERNAL_ERROR', result.error!.message, { requestId });
    }

    return serviceOk({ return_id: returnId }, requestId);
  } catch (err) {
    return serviceFail('INTERNAL_ERROR', (err as Error).message ?? 'Failed to record purchase return.', { requestId });
  }
}

export async function listPurchaseReturns(ctx: UserContext): Promise<ServiceResponse<PurchaseReturnRow[]>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'purchases', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view purchase returns.', { requestId });
  }
  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('inventory_movements')
      // Same ambiguous-embed issue as purchase_items above -
      // inventory_movements also has two FKs into products.
      .select('id, product_id, quantity, unit_cost, reference_id, notes, moved_at, created_by, products!inventory_movements_product_id_fkey(name, sku)')
      .eq('business_id', ctx.business_id)
      .eq('movement_type', 'return_out')
      .eq('reference_type', 'purchase_return')
      .order('moved_at', { ascending: false });
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load purchase returns.', { requestId });

    type Row = {
      id: string; product_id: string; quantity: number; unit_cost: number;
      reference_id: string | null; notes: string | null; moved_at: string; created_by: string | null;
      // PostgREST returns a to-one embed as an array unless the FK column
      // is unique/PK - normalize with `[0]` below rather than trusting the
      // shape to be a bare object.
      products: Array<{ name: string; sku: string }> | { name: string; sku: string } | null;
    };

    const grouped = new Map<string, PurchaseReturnRow>();
    for (const row of ((data ?? []) as unknown) as Row[]) {
      if (!row.reference_id) continue;
      const decoded = decodeReturnNotes(row.notes);
      const product = Array.isArray(row.products) ? row.products[0] : row.products;
      let ret = grouped.get(row.reference_id);
      if (!ret) {
        ret = {
          id: row.reference_id,
          reference: `RET-${row.reference_id.slice(0, 8).toUpperCase()}`,
          supplierId: decoded?.supplierId ?? '',
          purchaseOrderId: decoded?.purchaseId ?? null,
          items: [],
          reason: decoded?.reason ?? '',
          createdAt: row.moved_at,
          createdBy: row.created_by ?? '',
        };
        grouped.set(row.reference_id, ret);
      }
      ret.items.push({
        productId: row.product_id,
        productName: product?.name ?? 'Unknown product',
        sku: product?.sku ?? '',
        quantity: Number(row.quantity),
        unitCost: Number(row.unit_cost),
      });
    }

    return serviceOk(Array.from(grouped.values()), requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load purchase returns.', { requestId }); }
}
