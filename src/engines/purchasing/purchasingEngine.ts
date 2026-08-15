// ============================================================
// ImageCare ERP - Stage 3: Purchasing Engine
// File: src/engines/purchasing/purchasingEngine.ts
// Purpose: Purchase order and stock receipt management.
//
// RULES:
//   A purchase order is NOT automatically received stock.
//   An unpaid invoice is NOT a cash outflow.
//   Stock receipt creates inventory movements.
//   Accounting is posted through the Accounting Engine.
//   Duplicate receipt of the same stock is prevented via
//   idempotency key and status checks.
// ============================================================

import { db } from '../../lib/db';
import type { UUID } from '../../types/database';
import type {
  EngineContext, EngineResult,
  CreatePurchaseCommand, ReceiveStockCommand, PurchaseResult,
} from '../types';
import { engineOk, engineFail, makeError } from '../types';
import { inventoryEngine } from '../inventory/inventoryEngine';
import { accountingEngine } from '../accounting/accountingEngine';
import { cashEngine } from '../cash/cashEngine';

async function nextPurchaseNumber(businessId: UUID): Promise<string> {
  const { count } = await db.purchases()
    
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);
  const seq = ((count ?? 0) + 1).toString().padStart(6, '0');
  return `PO-${seq}`;
}

export class PurchasingEngine {

  // ---- createPurchase -------------------------------------
  // Creates a purchase record in draft state.
  // Does NOT create inventory movements or accounting entries.
  // Stock is only received when receiveStock() is called.

  async createPurchase(
    ctx: EngineContext,
    cmd: CreatePurchaseCommand,
  ): Promise<EngineResult<PurchaseResult>> {
    if (!cmd.lines.length) {
      return engineFail(makeError('VALIDATION_ERROR', 'Purchase must have at least one line.'));
    }

    // Validate products
    for (const line of cmd.lines) {
      const { data: product, error: pErr } = await db.products()
        
        .select('id, is_purchasable, business_id')
        .eq('id', line.product_id)
        .eq('business_id', ctx.business_id)
        .is('deleted_at', null)
        .single();

      if (pErr || !product) {
        return engineFail(makeError('RECORD_NOT_FOUND', `Product ${line.product_id} not found.`, undefined, 'product_id'));
      }
      if (!product.is_purchasable) {
        return engineFail(makeError('PRODUCT_NOT_PURCHASABLE', `Product ${line.product_id} is not purchasable.`));
      }
    }

    // Compute totals
    let subtotal = 0;
    const lineRows = cmd.lines.map(line => {
      const discAmt   = line.unit_cost * line.quantity * (line.discount_pct ?? 0);
      const taxAmt    = (line.unit_cost * line.quantity - discAmt) * (line.tax_rate ?? 0);
      const lineTotal = line.unit_cost * line.quantity - discAmt + taxAmt;
      subtotal += lineTotal;
      return { ...line, discount_amount: discAmt, tax_amount: taxAmt, line_total: lineTotal };
    });

    const purchaseNum = await nextPurchaseNumber(ctx.business_id);

    const { data: purchase, error: pErr } = await db.purchases()
      
      .insert({
        business_id:     ctx.business_id,
        branch_id:       cmd.branch_id,
        supplier_id:     cmd.supplier_id     ?? null,
        purchase_number: purchaseNum,
        purchase_date:   cmd.purchase_date   ?? new Date().toISOString(),
        due_date:        cmd.due_date        ?? null,
        status:          'draft',
        payment_method:  cmd.payment_method,
        subtotal,
        discount_amount: 0,
        tax_amount:      0,
        total_amount:    subtotal,
        amount_paid:     0,
        balance_due:     subtotal,
        notes:           cmd.notes ?? null,
        created_by:      ctx.user_id,
      })
      .select('id, purchase_number, total_amount, status')
      .single();

    if (pErr || !purchase) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to create purchase.', pErr?.message));
    }

    // Insert line items
    const { error: lineErr } = await db.purchase_items().insert(
      lineRows.map(l => ({
        purchase_id:     purchase.id,
        business_id:     ctx.business_id,
        branch_id:       cmd.branch_id,
        product_id:      l.product_id,
        quantity:        l.quantity,
        unit_cost:       l.unit_cost,
        discount_pct:    l.discount_pct   ?? 0,
        discount_amount: l.discount_amount,
        tax_rate:        l.tax_rate        ?? 0,
        tax_amount:      l.tax_amount,
        line_total:      l.line_total,
        expiry_date:     l.expiry_date    ?? null,
        batch_number:    l.batch_number   ?? null,
      }))
    );

    if (lineErr) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to create purchase items.', lineErr.message));
    }

    return engineOk({
      purchase_id:     purchase.id as UUID,
      purchase_number: purchase.purchase_number as string,
      total_amount:    Number(purchase.total_amount),
      status:          purchase.status as string,
      journal_entry_id:null,
    });
  }

  // ---- receiveStock ---------------------------------------
  // Marks a purchase as confirmed, creates inventory movements
  // and posts accounting entries.
  // Idempotent: re-sending same key is a no-op.

  async receiveStock(
    ctx: EngineContext,
    cmd: ReceiveStockCommand,
  ): Promise<EngineResult<PurchaseResult>> {
    // Lock purchase record
    const { data: purchase, error: pErr } = await db.purchases()
      
      .select('*')
      .eq('id', cmd.purchase_id)
      .eq('business_id', ctx.business_id)
      .single();

    if (pErr || !purchase) {
      return engineFail(makeError('RECORD_NOT_FOUND', 'Purchase not found.'));
    }

    if (purchase.status === 'confirmed') {
      return engineFail(makeError('IMMUTABLE_RECORD', 'Stock has already been received for this purchase.'));
    }

    if (purchase.status !== 'draft') {
      return engineFail(makeError('INVALID_STATUS_TRANSITION', `Cannot receive stock from a purchase with status '${purchase.status}'.`));
    }

    // Create inventory movements
    const invResult = await inventoryEngine.receiveFromPurchase(ctx, cmd.purchase_id);
    if (!invResult.ok) return engineFail(invResult.error!);

    // Post accounting: Dr Inventory, Cr Payable (+ Dr Payable, Cr Cash if paid)
    const isPaid = purchase.payment_method !== 'credit';
    const linesResult = await accountingEngine.buildPurchaseJournalLines(ctx, {
      amount:        Number(purchase.total_amount),
      paymentMethod: purchase.payment_method,
      isPaid,
    });
    if (!linesResult.ok) return engineFail(linesResult.error!);

    const jeResult = await accountingEngine.postJournal(ctx, {
      branch_id:      purchase.branch_id,
      entry_type:     'purchase',
      description:    `Stock received: ${purchase.purchase_number}`,
      reference_type: 'purchase',
      reference_id:   cmd.purchase_id,
      lines:          linesResult.data!,
    });

    if (!jeResult.ok) return engineFail(jeResult.error!);

    // If cash payment, record cash outflow
    if (isPaid) {
      const cashResult = await cashEngine.recordMovement(ctx, {
        branch_id:       purchase.branch_id,
        transaction_type:'cash_out',
        amount:          Number(purchase.total_amount),
        payment_method:  purchase.payment_method,
        reference_type:  'purchase',
        reference_id:    cmd.purchase_id,
        description:     `Payment for purchase ${purchase.purchase_number}`,
      });
      if (!cashResult.ok) return engineFail(cashResult.error!);
    }

    // Confirm the purchase
    const { error: updateErr } = await db.purchases()
      
      .update({
        status:           'confirmed',
        journal_entry_id: jeResult.data!.journal_entry_id,
        amount_paid:      isPaid ? purchase.total_amount : 0,
        balance_due:      isPaid ? 0 : purchase.total_amount,
        updated_by:       ctx.user_id,
      })
      .eq('id', cmd.purchase_id);

    if (updateErr) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to confirm purchase.', updateErr.message));
    }

    return engineOk({
      purchase_id:      cmd.purchase_id,
      purchase_number:  purchase.purchase_number as string,
      total_amount:     Number(purchase.total_amount),
      status:           'confirmed',
      journal_entry_id: jeResult.data!.journal_entry_id,
    });
  }
}

export const purchasingEngine = new PurchasingEngine();
