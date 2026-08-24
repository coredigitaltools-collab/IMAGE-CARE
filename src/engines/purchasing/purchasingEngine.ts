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
import type { UUID, PaymentMethod } from '../../types/database';
import type {
  EngineContext, EngineResult,
  CreatePurchaseCommand, ReceiveStockCommand, PurchaseResult,
} from '../types';
import { engineOk, engineFail, makeError } from '../types';
import { inventoryEngine } from '../inventory/inventoryEngine';
import { accountingEngine } from '../accounting/accountingEngine';
import { cashEngine } from '../cash/cashEngine';
import { auditEngine } from '../audit/auditEngine';

// ---- Supplier Payment Command --------------------------------
// Not part of a purchase order's own receipt flow - a supplier
// payment clears the running `suppliers.outstanding` balance
// (there is no dedicated supplier "credit account" table the way
// customers have credit_accounts; `outstanding` is maintained
// directly on the suppliers row since no DB trigger does it).

export interface RecordSupplierPaymentCommand {
  supplier_id:      UUID;
  branch_id:        UUID;
  amount:           number;
  payment_method:   PaymentMethod;
  purchase_id?:     UUID;
  reference_number?: string;
  notes?:           string;
  idempotency_key?: string;
}

export interface SupplierPaymentResult {
  transaction_id:  UUID;
  supplier_id:     UUID;
  amount:          number;
  new_outstanding: number;
}

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
    } else if (purchase.supplier_id) {
      // Bug fix (Phase 6, item 10: accounting balance fields not
      // maintained): a credit purchase increases Accounts Payable
      // (posted above) but nothing was incrementing the supplier's
      // denormalized `outstanding` balance to match - only
      // recordSupplierPayment() below ever decremented it. Left
      // unfixed, `outstanding` starts at 0 and never reflects real
      // debt, so the very first supplier payment against real unpaid
      // purchases would incorrectly fail with "payment exceeds
      // outstanding balance (0)".
      const { data: supplier } = await db.suppliers()

        .select('outstanding')
        .eq('id', purchase.supplier_id)
        .eq('business_id', ctx.business_id)
        .single();

      if (supplier) {
        await db.suppliers()

          .update({ outstanding: Number(supplier.outstanding) + Number(purchase.total_amount), updated_by: ctx.user_id })
          .eq('id', purchase.supplier_id);
      }
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

  // ---- recordSupplierPayment -------------------------------
  // Records a cash outflow against a supplier's outstanding
  // balance, posts Dr Accounts Payable / Cr Cash, and decrements
  // suppliers.outstanding (no DB trigger maintains this column,
  // unlike imagecare.fn_update_credit_balance for customer credit,
  // so the engine is the sole authority here).
  //
  // Bug fix (found during Phase 12 E2E verification): this posted
  // entry_type: 'supplier_payment', but imagecare.journal_entry_type
  // is a Postgres ENUM whose only values are 'sale', 'purchase',
  // 'payroll', 'expense', 'credit_payment', 'bank_deposit',
  // 'bank_withdrawal', 'adjustment', 'opening_balance', 'transfer' -
  // there is no 'supplier_payment' member. PostJournalCommand.entry_type
  // is typed as a plain `string` in src/engines/types.ts, so TypeScript
  // never caught this; every real supplier payment would fail at the
  // database with error 22P02 (invalid input value for enum) the
  // moment it tried to insert the journal entry, confirmed live against
  // the Supabase project. Changed to 'purchase', the closest existing
  // enum member (this journal entry is always tied to a purchase's
  // payable), matching the entry_type already used by
  // confirmPurchase()/receiveStock() above for the original purchase.

  async recordSupplierPayment(
    ctx: EngineContext,
    cmd: RecordSupplierPaymentCommand,
  ): Promise<EngineResult<SupplierPaymentResult>> {
    if (cmd.amount <= 0) {
      return engineFail(makeError('VALIDATION_ERROR', 'Payment amount must be positive.', undefined, 'amount'));
    }

    const { data: supplier, error: supErr } = await db.suppliers()
      .select('id, business_id, outstanding, name')
      .eq('id', cmd.supplier_id)
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null)
      .single();

    if (supErr || !supplier) {
      return engineFail(makeError('RECORD_NOT_FOUND', 'Supplier not found.'));
    }

    const outstanding = Number(supplier.outstanding);

    if (cmd.amount > outstanding) {
      return engineFail(makeError(
        'OVERPAYMENT',
        `Payment amount (${cmd.amount}) exceeds outstanding balance (${outstanding}) for this supplier.`,
        undefined, 'amount',
      ));
    }

    // Post accounting: Dr Accounts Payable, Cr Cash
    const payableAcct = await accountingEngine.resolveAccountCode(ctx.business_id, '2000');
    let cashCode = '1100';
    if (cmd.payment_method === 'mobile_money') cashCode = '1120';
    else if (cmd.payment_method === 'bank_transfer' || cmd.payment_method === 'card') cashCode = '1130';
    const cashAcct = await accountingEngine.resolveAccountCode(ctx.business_id, cashCode);

    const jeResult = await accountingEngine.postJournal(ctx, {
      branch_id:      cmd.branch_id,
      entry_type:     'purchase',
      description:    `Payment to supplier: ${supplier.name}`,
      reference_type: 'supplier_payment',
      reference_id:   cmd.purchase_id ?? cmd.supplier_id,
      lines: [
        {
          account_code:  '2000',
          account_name:  payableAcct.ok ? payableAcct.data!.account_name : 'Accounts Payable',
          account_type:  'liability',
          account_id:    payableAcct.ok ? payableAcct.data!.id : undefined,
          debit_amount:  cmd.amount,
          credit_amount: 0,
          description:   'Payment clears payable',
        },
        {
          account_code:  cashCode,
          account_name:  cashAcct.ok ? cashAcct.data!.account_name : 'Cash',
          account_type:  'asset',
          account_id:    cashAcct.ok ? cashAcct.data!.id : undefined,
          debit_amount:  0,
          credit_amount: cmd.amount,
        },
      ],
    });
    if (!jeResult.ok) return engineFail(jeResult.error!);

    // Record cash outflow
    const cashResult = await cashEngine.recordMovement(ctx, {
      branch_id:       cmd.branch_id,
      transaction_type:'cash_out',
      amount:          cmd.amount,
      payment_method:  cmd.payment_method,
      reference_type:  'supplier_payment',
      reference_id:    cmd.purchase_id ?? cmd.supplier_id,
      description:     `Payment to supplier: ${supplier.name}`,
      notes:           cmd.notes,
    });
    if (!cashResult.ok) return engineFail(cashResult.error!);

    // Decrement the supplier's running outstanding balance
    const newOutstanding = outstanding - cmd.amount;
    const { error: updErr } = await db.suppliers()
      .update({ outstanding: newOutstanding, updated_by: ctx.user_id })
      .eq('id', cmd.supplier_id)
      .eq('business_id', ctx.business_id);

    if (updErr) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to update supplier balance.', updErr.message));
    }

    // If tied to a specific purchase, clear its balance_due too
    if (cmd.purchase_id) {
      const { data: purchase } = await db.purchases()
        .select('amount_paid, balance_due')
        .eq('id', cmd.purchase_id)
        .eq('business_id', ctx.business_id)
        .single();

      if (purchase) {
        await db.purchases()
          .update({
            amount_paid: Number(purchase.amount_paid) + cmd.amount,
            balance_due: Math.max(0, Number(purchase.balance_due) - cmd.amount),
            updated_by:  ctx.user_id,
          })
          .eq('id', cmd.purchase_id);
      }
    }

    await auditEngine.log(ctx, {
      table_name: 'suppliers',
      record_id:  cmd.supplier_id,
      action:     'update',
      new_value:  { outstanding: newOutstanding },
    });

    return engineOk({
      transaction_id:  cashResult.data!.transaction_id,
      supplier_id:     cmd.supplier_id,
      amount:          cmd.amount,
      new_outstanding: newOutstanding,
    });
  }
}

export const purchasingEngine = new PurchasingEngine();
