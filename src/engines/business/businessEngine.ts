// ============================================================
// ImageCare ERP - Stage 3: Business Engine
// File: src/engines/business/businessEngine.ts
// Purpose: Orchestration layer for approved business transactions.
//
// Responsibilities:
//   - Validate business and branch context
//   - Validate required permissions
//   - Validate transaction state and master data
//   - Coordinate effects across Inventory, Accounting,
//     Credit, and Cash engines
//   - Ensure atomicity: operations succeed or fail together
//   - Idempotency: same key never creates duplicate records
//   - Standardized error responses - no raw SQL to callers
//
// What the Business Engine does NOT do:
//   - Hide engine logic that belongs in a specialist engine
//   - Make accounting decisions (Accounting Engine does that)
//   - Compute stock levels (Inventory Engine does that)
//   - Compute cash balances (Cash Engine does that)
// ============================================================

import { db } from '../../lib/db';
import type { UUID } from '../../types/database';
import type {
  EngineContext, EngineResult,
  CreateSaleCommand, PostSaleCommand, SaleResult,
  ReverseSaleCommand,
  RecordExpenseCommand, ExpenseResult,
  RecordPayrollCommand, PayrollResult,
  PurchaseResult, ReversePurchaseCommand,
} from '../types';
import { engineOk, engineFail, makeError } from '../types';
import { inventoryEngine } from '../inventory/inventoryEngine';
import { accountingEngine } from '../accounting/accountingEngine';
import { cashEngine } from '../cash/cashEngine';
import { creditEngine } from '../credit/creditEngine';
import { auditEngine } from '../audit/auditEngine';

// ---- Idempotency -------------------------------------------
// Checks whether an operation with the given key has already
// completed. Returns the cached result if so.

async function checkIdempotency(
  businessId: UUID,
  key: string,
  operation: string,
): Promise<{ isDuplicate: boolean; cachedResult?: Record<string, unknown> }> {
  const { data } = await db.sync_queue()
    
    .select('id, payload')
    .eq('business_id', businessId)
    .eq('idempotency_key', `${operation}:${key}`)
    .eq('sync_status', 'synced')
    .maybeSingle();

  if (data) {
    return { isDuplicate: true, cachedResult: (data.payload as Record<string, unknown>) };
  }
  return { isDuplicate: false };
}

async function markIdempotencyComplete(
  businessId: UUID,
  userId: UUID,
  key: string,
  operation: string,
  result: Record<string, unknown>,
): Promise<void> {
  await db.sync_queue().upsert({
    business_id:     businessId,
    user_id:         userId,
    device_id:       'server',
    table_name:      operation,
    record_id:       result['id'] as UUID ?? '00000000-0000-0000-0000-000000000000',
    operation:       'insert',
    payload:         result,
    sync_status:     'synced',
    idempotency_key: `${operation}:${key}`,
    synced_at:       new Date().toISOString(),
  }, { onConflict: 'idempotency_key' });
}

async function nextSaleNumber(businessId: UUID): Promise<string> {
  const { count } = await db.sales()
    
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);
  const seq = ((count ?? 0) + 1).toString().padStart(6, '0');
  return `INV-${seq}`;
}

async function nextExpenseNumber(businessId: UUID): Promise<string> {
  const { count } = await db.expenses()

    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);
  const seq = ((count ?? 0) + 1).toString().padStart(6, '0');
  return `EXP-${seq}`;
}

async function nextPayrollNumber(businessId: UUID): Promise<string> {
  const { count } = await db.payroll()

    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);
  const seq = ((count ?? 0) + 1).toString().padStart(6, '0');
  return `PAY-${seq}`;
}

// ---- Business context validation ---------------------------

async function validateContext(
  ctx: EngineContext,
  branchId: UUID,
): Promise<EngineError | null> {
  // 2026-09-01: business and branch are independent lookups (neither's
  // result is needed to run the other's query) but used to run one after
  // the other, adding a full extra network round trip to every sale,
  // expense, and payroll save before any real work even started. Running
  // them together with Promise.all cuts that wait roughly in half with no
  // change in what's validated or how.
  const [{ data: biz }, { data: branch }] = await Promise.all([
    db.businesses()
      .select('is_active')
      .eq('id', ctx.business_id)
      .single(),
    db.branches()
      .select('is_active, business_id')
      .eq('id', branchId)
      .eq('business_id', ctx.business_id)
      .single(),
  ]);

  if (!biz?.is_active) {
    return makeError('BUSINESS_INACTIVE', 'This business account is not active.');
  }

  if (!branch) {
    return makeError('RECORD_NOT_FOUND', 'Branch not found or does not belong to this business.');
  }
  if (!branch.is_active) {
    return makeError('BRANCH_INACTIVE', 'This branch is not active.');
  }

  return null;
}

import type { EngineError } from '../types';

export class BusinessEngine {

  // ---- createSale -----------------------------------------
  // Creates a sale in draft state. No inventory or accounting effects yet.
  // Call postSale() to confirm and trigger all effects.

  async createSale(
    ctx: EngineContext,
    cmd: CreateSaleCommand,
  ): Promise<EngineResult<SaleResult>> {
    if (!cmd.lines.length) {
      return engineFail(makeError('VALIDATION_ERROR', 'Sale must have at least one line.'));
    }

    // Validate context
    const ctxErr = await validateContext(ctx, cmd.branch_id);
    if (ctxErr) return engineFail(ctxErr);

    // 2026-09-01: product-sellability validation and the next sale number
    // are independent of each other - neither needs the other's result -
    // but were being fetched one after another, and the product check was
    // itself a separate round trip PER LINE in a sequential loop. On a
    // 1-item sale that's still 2 sequential round trips before any real
    // work starts; on a multi-item sale it was N+1. Batching the product
    // lookups into a single `.in(...)` query and running it alongside
    // nextSaleNumber() cuts this to one round trip's worth of wait
    // regardless of cart size - this is one of several steps behind "the
    // Complete Sale button takes long."
    const productIds = [...new Set(cmd.lines.map(l => l.product_id))];
    const [{ data: products }, saleNum] = await Promise.all([
      db.products()
        .select('id, is_sellable, is_stockable, business_id')
        .in('id', productIds)
        .eq('business_id', ctx.business_id)
        .is('deleted_at', null),
      nextSaleNumber(ctx.business_id),
    ]);

    for (const line of cmd.lines) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const product = (products ?? []).find((p: any) => p.id === line.product_id) as
        | { id: string; is_sellable: boolean }
        | undefined;
      if (!product) {
        return engineFail(makeError('RECORD_NOT_FOUND', `Product ${line.product_id} not found.`, undefined, 'product_id'));
      }
      if (!product.is_sellable) {
        return engineFail(makeError('PRODUCT_NOT_SELLABLE', `Product ${line.product_id} is not sellable.`));
      }
    }

    // Compute totals
    let subtotal = 0;
    const lineRows = cmd.lines.map(line => {
      const discAmt   = line.unit_price * line.quantity * (line.discount_pct ?? 0);
      const taxAmt    = (line.unit_price * line.quantity - discAmt) * (line.tax_rate ?? 0);
      const lineTotal = line.unit_price * line.quantity - discAmt + taxAmt;
      subtotal += lineTotal;
      return { ...line, discount_amount: discAmt, tax_amount: taxAmt, line_total: lineTotal };
    });

    const isCreditSale = cmd.payment_method === 'credit';

    const { data: sale, error: sErr } = await db.sales()
      
      .insert({
        business_id:    ctx.business_id,
        branch_id:      cmd.branch_id,
        customer_id:    cmd.customer_id  ?? null,
        sale_number:    saleNum,
        sale_date:      cmd.sale_date    ?? new Date().toISOString(),
        status:         'draft',
        payment_method: cmd.payment_method,
        subtotal,
        discount_amount:0,
        tax_amount:     0,
        total_amount:   subtotal,
        amount_paid:    isCreditSale ? 0 : subtotal,
        change_given:   0,
        credit_amount:  isCreditSale ? subtotal : 0,
        notes:          cmd.notes ?? null,
        created_by:     ctx.user_id,
      })
      .select('id, sale_number, total_amount, status')
      .single();

    if (sErr || !sale) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to create sale.', sErr?.message));
    }

    // Insert sale items
    const { error: lineErr } = await db.sale_items().insert(
      lineRows.map(l => ({
        sale_id:         sale.id,
        business_id:     ctx.business_id,
        branch_id:       cmd.branch_id,
        product_id:      l.product_id,
        quantity:        l.quantity,
        unit_price:      l.unit_price,
        unit_cost:       l.unit_cost,
        discount_pct:    l.discount_pct    ?? 0,
        discount_amount: l.discount_amount,
        tax_rate:        l.tax_rate         ?? 0,
        tax_amount:      l.tax_amount,
        line_total:      l.line_total,
      }))
    );

    if (lineErr) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to create sale items.', lineErr.message));
    }

    return engineOk({
      sale_id:         sale.id as UUID,
      sale_number:     sale.sale_number as string,
      total_amount:    Number(sale.total_amount),
      status:          sale.status as string,
      journal_entry_id:null,
    });
  }

  // ---- postSale -------------------------------------------
  // Posts a draft sale: validates stock, deducts inventory,
  // posts accounting, records cash or credit effects.
  // Atomic: if any engine fails, the sale remains in draft.
  // Idempotent via idempotency_key.

  async postSale(
    ctx: EngineContext,
    cmd: PostSaleCommand,
  ): Promise<EngineResult<SaleResult>> {
    // 2026-09-01: these three reads don't depend on each other - the
    // idempotency check only needs the key, loading the sale only needs
    // sale_id, and loading its items (with each product's stock flags)
    // also only needs sale_id, not the sale row itself - but they were
    // being awaited one after another, adding two full extra round trips
    // to every sale before any real validation could even start. Running
    // them together cuts that to about one round trip's worth of wait.
    // On the rare duplicate-submission path the sale/items reads below
    // just go unused - a small wasted query beats a slower path for
    // every normal, non-duplicate sale.
    const idempotencyPromise = cmd.idempotency_key
      ? checkIdempotency(ctx.business_id, cmd.idempotency_key, 'post_sale')
      : Promise.resolve<{ isDuplicate: boolean; cachedResult?: Record<string, unknown> }>({ isDuplicate: false });

    const salePromise = db.sales()
      .select('*')
      .eq('id', cmd.sale_id)
      .eq('business_id', ctx.business_id)
      .single();

    // 'sale_items' has TWO foreign keys into 'products' -
    // sale_items_product_id_fkey (product_id -> products.id, the one
    // that actually matters here) and fk_s2_sale_items_biz_product (a
    // legacy composite business_id+product_id constraint from an older
    // migration pass). An unqualified `products(...)` embed is
    // ambiguous with two FK paths present, so PostgREST rejects the
    // query outright (PGRST201, "more than one relationship was
    // found") instead of picking one. That request never got checked
    // for an error below - `{ data: items }` silently became
    // undefined, `items ?? []` silently became an empty array, and
    // execution carried on as if the sale had no line items at all:
    // no stock check ever ran (a sale could go through with stock it
    // shouldn't have), and further down, COGS computed from this same
    // `items` list was silently forced to 0 on every sale. This is the
    // exact point live data traced "cannot complete sale" reports back
    // to - the very next request after loading the sale never fired
    // because PostgREST already rejected it, and deductForSale() hits
    // the identical ambiguous embed moments later (see
    // inventoryEngine.ts), this time surfacing as a real error and
    // failing the whole sale, leaving it stuck in 'draft' forever. The
    // `!sale_items_product_id_fkey` hint tells PostgREST exactly which
    // relationship to embed through, and the error is now actually
    // checked instead of swallowed.
    const itemsPromise = db.sale_items()
      .select('*, products!sale_items_product_id_fkey(is_stockable, is_sellable)')
      .eq('sale_id', cmd.sale_id)
      .eq('business_id', ctx.business_id);

    const [idempotency, saleRes, itemsRes] = await Promise.all([idempotencyPromise, salePromise, itemsPromise]);

    if (idempotency.isDuplicate && idempotency.cachedResult) {
      return engineOk(idempotency.cachedResult as unknown as SaleResult);
    }

    const { data: sale, error: sErr } = saleRes;
    if (sErr || !sale) {
      return engineFail(makeError('RECORD_NOT_FOUND', 'Sale not found.'));
    }

    if (sale.status !== 'draft') {
      return engineFail(makeError('IMMUTABLE_RECORD', `Sale is already ${sale.status}. Only draft sales can be posted.`));
    }

    const isCreditSale = sale.payment_method === 'credit';

    const { data: items, error: itemsErr } = itemsRes;
    if (itemsErr) {
      return engineFail(makeError('DATABASE_ERROR', 'Could not load the items on this sale.', itemsErr.message));
    }

    // Validate stock availability for all stockable items before deducting
    // anything. Each item's check is an independent read, so they run
    // together instead of one at a time - a wash for a 1-item sale, a
    // real saving for a multi-item cart.
    const checkResults = await Promise.all(
      (items ?? []).map((item: Record<string, unknown>) => {
        type ItemWithProduct = typeof item & { products: { is_stockable: boolean; is_sellable: boolean } | null };
        const typedItem = item as ItemWithProduct;
        if (!typedItem.products?.is_stockable) return null;
        return inventoryEngine.checkAvailable(
          ctx, item.product_id as UUID, sale.branch_id, Number(item.quantity)
        );
      })
    );
    for (const checkResult of checkResults) {
      if (checkResult && !checkResult.ok) return engineFail(checkResult.error!);
    }

    // Deduct inventory and build the journal lines at the same time -
    // building the lines is a read-only computation (resolves account
    // codes, does no writes) that doesn't actually depend on the
    // deduction succeeding, so there's no reason to wait for one before
    // starting the other. The journal is only ever POSTED (a write)
    // after invResult confirms the deduction succeeded, below - so this
    // doesn't change what has to succeed before what, just overlaps two
    // independent waits instead of paying for both in sequence. Items
    // already loaded above are passed straight through so deductForSale
    // doesn't re-fetch the same sale_items and sale.branch_id itself.
    const cogs = (items ?? []).reduce(
      (s: number, r: Record<string, unknown>) => s + Number(r.quantity) * Number(r.unit_cost), 0
    );
    const [invResult, linesResult] = await Promise.all([
      inventoryEngine.deductForSale(ctx, cmd.sale_id, { items: items ?? [], branchId: sale.branch_id }),
      accountingEngine.buildSaleJournalLines(ctx, {
        revenue:       Number(sale.total_amount),
        cogs,
        paymentMethod: sale.payment_method,
        isCreditSale,
      }),
    ]);
    if (!invResult.ok) return engineFail(invResult.error!);
    if (!linesResult.ok) return engineFail(linesResult.error!);

    const jeResult = await accountingEngine.postJournal(ctx, {
      branch_id:      sale.branch_id,
      entry_type:     'sale',
      description:    `Sale: ${sale.sale_number}`,
      reference_type: 'sale',
      reference_id:   cmd.sale_id,
      lines:          linesResult.data!,
    });
    if (!jeResult.ok) return engineFail(jeResult.error!);

    // Cash or Credit effects
    if (isCreditSale && sale.customer_id) {
      // Get or create credit account
      const caResult = await creditEngine.getOrCreateCreditAccount(
        ctx, sale.customer_id, sale.branch_id
      );
      if (!caResult.ok) return engineFail(caResult.error!);

      // Charge credit account
      const chargeResult = await creditEngine.charge(ctx, {
        credit_account_id: caResult.data!.credit_account_id,
        sale_id:           cmd.sale_id,
        amount:            Number(sale.total_amount),
      });
      if (!chargeResult.ok) return engineFail(chargeResult.error!);
    } else if (!isCreditSale) {
      // Record cash-in for non-credit sales
      const cashResult = await cashEngine.recordSaleCashIn(ctx, {
        branch_id:      sale.branch_id,
        sale_id:        cmd.sale_id,
        amount:         Number(sale.total_amount),
        payment_method: sale.payment_method,
      });
      if (!cashResult.ok) return engineFail(cashResult.error!);
    }

    // Confirm the sale
    const { error: updateErr } = await db.sales()
      
      .update({
        status:           'confirmed',
        journal_entry_id: jeResult.data!.journal_entry_id,
        updated_by:       ctx.user_id,
      })
      .eq('id', cmd.sale_id);

    if (updateErr) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to confirm sale.', updateErr.message));
    }

    const result: SaleResult = {
      sale_id:         cmd.sale_id,
      sale_number:     sale.sale_number as string,
      total_amount:    Number(sale.total_amount),
      status:          'confirmed',
      journal_entry_id:jeResult.data!.journal_entry_id,
    };

    // Audit + idempotency bookkeeping - two independent writes that
    // neither reads the other's result, so they run together rather than
    // one after another.
    const bookkeeping: Promise<unknown>[] = [
      auditEngine.log(ctx, {
        table_name: 'sales',
        record_id:  cmd.sale_id,
        action:     'update',
        new_value:  { status: 'confirmed', journal_entry_id: result.journal_entry_id },
      }),
    ];
    if (cmd.idempotency_key) {
      bookkeeping.push(
        markIdempotencyComplete(
          ctx.business_id, ctx.user_id, cmd.idempotency_key, 'post_sale',
          result as unknown as Record<string, unknown>
        )
      );
    }
    await Promise.all(bookkeeping);

    return engineOk(result);
  }

  // ---- reverseSale ------------------------------------------
  // Fully undoes a confirmed sale. Used when "Delete" is chosen on a
  // completed sale (wrong item, wrong customer, duplicate entry) - the
  // owner wants the whole sale gone, not a partial adjustment, so every
  // effect it had must be undone together: stock put back
  // (inventoryEngine.reverseForSale, movement_type 'return_in'), the
  // journal reversed (accountingEngine.reverseJournal, reusing the
  // debit/credit-swap reversal already built for Stage 3), and cash or
  // credit reversed depending on how the sale was paid. The sale itself
  // moves to 'cancelled' - a real status this schema has (see
  // types/sales.ts) - never 'refunded', which was never a real DB value
  // and had no working backend behind it. Only a confirmed sale can be
  // reversed this way: a draft sale should be discarded instead
  // (deleteParked), and an already-cancelled sale can't be cancelled
  // twice.

  async reverseSale(
    ctx: EngineContext,
    cmd: ReverseSaleCommand,
  ): Promise<EngineResult<SaleResult>> {
    if (!cmd.reason || !cmd.reason.trim()) {
      return engineFail(makeError('VALIDATION_ERROR', 'A reason is required to delete a completed sale.', undefined, 'reason'));
    }

    // Sale and its items are independent reads once we have the id -
    // run them together rather than one after another.
    const [saleRes, itemsRes] = await Promise.all([
      db.sales()
        .select('*')
        .eq('id', cmd.sale_id)
        .eq('business_id', ctx.business_id)
        .single(),
      db.sale_items()
        .select('*, products!sale_items_product_id_fkey(is_stockable)')
        .eq('sale_id', cmd.sale_id)
        .eq('business_id', ctx.business_id),
    ]);

    const { data: sale, error: sErr } = saleRes;
    if (sErr || !sale) {
      return engineFail(makeError('RECORD_NOT_FOUND', 'Sale not found.'));
    }

    if (sale.status !== 'confirmed') {
      return engineFail(makeError(
        'IMMUTABLE_RECORD',
        `This sale is ${sale.status}, not completed. Only a completed sale can be deleted this way.`,
      ));
    }

    if (!sale.journal_entry_id) {
      return engineFail(makeError('DATABASE_ERROR', 'This sale has no journal entry to reverse, so it cannot be safely deleted.'));
    }

    const { data: items, error: itemsErr } = itemsRes;
    if (itemsErr) {
      return engineFail(makeError('DATABASE_ERROR', 'Could not load the items on this sale.', itemsErr.message));
    }

    const isCreditSale = sale.payment_method === 'credit';

    // Put stock back and reverse the journal at the same time - neither
    // depends on the other's result, both only need the sale/items
    // already loaded above.
    const [invResult, journalResult] = await Promise.all([
      inventoryEngine.reverseForSale(ctx, cmd.sale_id, { items: items ?? [], branchId: sale.branch_id }),
      accountingEngine.reverseJournal(ctx, sale.journal_entry_id as UUID, cmd.reason),
    ]);
    if (!invResult.ok) return engineFail(invResult.error!);
    if (!journalResult.ok) return engineFail(journalResult.error!);

    // Reverse whichever payment effect the sale recorded - credit charge
    // or cash received. Never both; a sale is only ever one or the other.
    if (isCreditSale && sale.customer_id) {
      const caResult = await creditEngine.getOrCreateCreditAccount(ctx, sale.customer_id, sale.branch_id);
      if (!caResult.ok) return engineFail(caResult.error!);

      const reverseResult = await creditEngine.reverseCharge(ctx, {
        credit_account_id: caResult.data!.credit_account_id,
        sale_id:           cmd.sale_id,
        amount:            Number(sale.total_amount),
        reason:            cmd.reason,
      });
      if (!reverseResult.ok) return engineFail(reverseResult.error!);
    } else if (!isCreditSale) {
      const cashResult = await cashEngine.reverseSaleCashIn(ctx, {
        branch_id:      sale.branch_id,
        sale_id:        cmd.sale_id,
        amount:         Number(sale.total_amount),
        payment_method: sale.payment_method,
      });
      if (!cashResult.ok) return engineFail(cashResult.error!);
    }

    // Cancel the sale - only after every reversal above has succeeded.
    const { error: updateErr } = await db.sales()

      .update({
        status:     'cancelled',
        notes:      sale.notes ? `${sale.notes}\n\nCancelled: ${cmd.reason}` : `Cancelled: ${cmd.reason}`,
        updated_by: ctx.user_id,
      })
      .eq('id', cmd.sale_id);

    if (updateErr) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to cancel sale.', updateErr.message));
    }

    const result: SaleResult = {
      sale_id:          cmd.sale_id,
      sale_number:      sale.sale_number as string,
      total_amount:     Number(sale.total_amount),
      status:           'cancelled',
      journal_entry_id: sale.journal_entry_id as UUID,
    };

    await auditEngine.log(ctx, {
      table_name:     'sales',
      record_id:      cmd.sale_id,
      action:         'update',
      previous_value: { status: 'confirmed' },
      new_value:      { status: 'cancelled', reason: cmd.reason },
    });

    return engineOk(result);
  }

  // ---- voidPurchase -------------------------------------------
  // Fully undoes a confirmed purchase order. Added 2026-09-03 for the
  // "edit/delete a purchase order" correction flow: since a purchase
  // order now confirms itself the instant it's recorded (see
  // createAndPostPurchase() in services/business/businessEngine.ts),
  // there is no more draft/unconfirmed window to simply discard - by
  // the time anyone notices a mistake, real stock has already been
  // received and a real journal entry posted. This mirrors
  // reverseSale() above: stock is put back out
  // (inventoryEngine.reverseForPurchase, movement_type 'return_out' -
  // the same movement type Purchase Returns already uses), the journal
  // is reversed (accountingEngine.reverseJournal, debit/credit swap),
  // and whichever payment effect the order recorded is reversed too -
  // cash paid back in if it was a cash purchase, or the supplier's
  // outstanding balance reduced back down if it was credit. The order
  // itself moves to 'voided' - a real status this schema already has,
  // distinct from 'cancelled' (which is reserved for a draft order
  // that never got this far and has nothing to reverse). Only a
  // confirmed order can be voided this way; a still-draft order should
  // be deleted outright instead (see deletePurchaseOrder() in
  // services/purchasing/purchasingService.ts), and an
  // already-cancelled/voided order can't be voided twice.

  async voidPurchase(
    ctx: EngineContext,
    cmd: ReversePurchaseCommand,
  ): Promise<EngineResult<PurchaseResult>> {
    if (!cmd.reason || !cmd.reason.trim()) {
      return engineFail(makeError('VALIDATION_ERROR', 'A reason is required to void a confirmed purchase order.', undefined, 'reason'));
    }

    const [purchaseRes, itemsRes] = await Promise.all([
      db.purchases()
        .select('*')
        .eq('id', cmd.purchase_id)
        .eq('business_id', ctx.business_id)
        .single(),
      db.purchase_items()
        .select('*, products!purchase_items_product_id_fkey(is_stockable)')
        .eq('purchase_id', cmd.purchase_id)
        .eq('business_id', ctx.business_id),
    ]);

    const { data: purchase, error: pErr } = purchaseRes;
    if (pErr || !purchase) {
      return engineFail(makeError('RECORD_NOT_FOUND', 'Purchase order not found.'));
    }

    if (purchase.status !== 'confirmed') {
      return engineFail(makeError(
        'IMMUTABLE_RECORD',
        `This purchase order is ${purchase.status}, not confirmed. Only a confirmed order can be voided this way.`,
      ));
    }

    if (!purchase.journal_entry_id) {
      return engineFail(makeError('DATABASE_ERROR', 'This purchase order has no journal entry to reverse, so it cannot be safely voided.'));
    }

    const { data: items, error: itemsErr } = itemsRes;
    if (itemsErr) {
      return engineFail(makeError('DATABASE_ERROR', 'Could not load the items on this purchase order.', itemsErr.message));
    }

    const isCreditPurchase = purchase.payment_method === 'credit';

    // Put stock back out and reverse the journal at the same time -
    // neither depends on the other's result, both only need the
    // purchase/items already loaded above.
    const [invResult, journalResult] = await Promise.all([
      inventoryEngine.reverseForPurchase(ctx, cmd.purchase_id, { items: items ?? [], branchId: purchase.branch_id }),
      accountingEngine.reverseJournal(ctx, purchase.journal_entry_id as UUID, cmd.reason),
    ]);
    if (!invResult.ok) return engineFail(invResult.error!);
    if (!journalResult.ok) return engineFail(journalResult.error!);

    // Reverse whichever payment effect the order recorded - a credit
    // purchase increased the supplier's outstanding balance (receiveStock()
    // in purchasingEngine.ts), a cash purchase paid cash out. Never both.
    if (isCreditPurchase && purchase.supplier_id) {
      const { data: supplier } = await db.suppliers()
        .select('outstanding')
        .eq('id', purchase.supplier_id)
        .eq('business_id', ctx.business_id)
        .single();

      if (supplier) {
        await db.suppliers()
          .update({
            outstanding: Math.max(0, Number(supplier.outstanding) - Number(purchase.total_amount)),
            updated_by:  ctx.user_id,
          })
          .eq('id', purchase.supplier_id);
      }
    } else if (!isCreditPurchase) {
      const cashResult = await cashEngine.reversePurchaseCashOut(ctx, {
        branch_id:      purchase.branch_id,
        purchase_id:    cmd.purchase_id,
        amount:         Number(purchase.total_amount),
        payment_method: purchase.payment_method,
      });
      if (!cashResult.ok) return engineFail(cashResult.error!);
    }

    // Void the purchase - only after every reversal above has succeeded.
    // balance_due/amount_paid are zeroed along with the status: the
    // supplier's payable (or the cash paid) was just reversed above, so a
    // voided order shouldn't keep contributing to "outstanding payables" on
    // the Purchasing dashboard (getPurchaseDashboardKpis() sums balance_due
    // across every row) - that would double-count what reversing the
    // supplier's `outstanding` balance above already corrected for.
    const { error: updateErr } = await db.purchases()
      .update({
        status:       'voided',
        balance_due:  0,
        amount_paid:  0,
        notes:        purchase.notes ? `${purchase.notes}\n\nVoided: ${cmd.reason}` : `Voided: ${cmd.reason}`,
        updated_by:   ctx.user_id,
      })
      .eq('id', cmd.purchase_id);

    if (updateErr) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to void purchase order.', updateErr.message));
    }

    const result: PurchaseResult = {
      purchase_id:      cmd.purchase_id,
      purchase_number:  purchase.purchase_number as string,
      total_amount:     Number(purchase.total_amount),
      status:           'voided',
      journal_entry_id: purchase.journal_entry_id as UUID,
    };

    await auditEngine.log(ctx, {
      table_name:     'purchases',
      record_id:      cmd.purchase_id,
      action:         'update',
      previous_value: { status: 'confirmed' },
      new_value:      { status: 'voided', reason: cmd.reason },
    });

    return engineOk(result);
  }

  // ---- recordExpense --------------------------------------
  // Records an expense and posts accounting and cash effects.
  // Atomic: accounting and cash succeed or fail together.

  async recordExpense(
    ctx: EngineContext,
    cmd: RecordExpenseCommand,
  ): Promise<EngineResult<ExpenseResult>> {
    if (cmd.amount <= 0) {
      return engineFail(makeError('VALIDATION_ERROR', 'Expense amount must be positive.', undefined, 'amount'));
    }

    // Idempotency
    if (cmd.idempotency_key) {
      const { isDuplicate, cachedResult } = await checkIdempotency(
        ctx.business_id, cmd.idempotency_key, 'expense'
      );
      if (isDuplicate && cachedResult) {
        return engineOk(cachedResult as unknown as ExpenseResult);
      }
    }

    const ctxErr = await validateContext(ctx, cmd.branch_id);
    if (ctxErr) return engineFail(ctxErr);

    const totalAmount = cmd.amount + (cmd.tax_amount ?? 0);
    const expNum = await nextExpenseNumber(ctx.business_id);

    const { data: expense, error: expErr } = await db.expenses()
      
      .insert({
        business_id:   ctx.business_id,
        branch_id:     cmd.branch_id,
        incurred_by:   ctx.user_id,
        expense_number:expNum,
        expense_date:  cmd.expense_date ?? new Date().toISOString(),
        category:      cmd.category,
        description:   cmd.description,
        amount:        cmd.amount,
        tax_amount:    cmd.tax_amount ?? 0,
        total_amount:  totalAmount,
        payment_method:cmd.payment_method,
        is_recurring:  cmd.is_recurring ?? false,
        status:        'confirmed',
        notes:         cmd.notes ?? null,
        created_by:    ctx.user_id,
      })
      .select('id, expense_number, total_amount, status')
      .single();

    if (expErr || !expense) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to record expense.', expErr?.message));
    }

    // Post accounting: Dr Expense, Cr Cash
    const linesResult = await accountingEngine.buildExpenseJournalLines(ctx, {
      amount:        totalAmount,
      paymentMethod: cmd.payment_method,
      category:      cmd.category,
    });
    if (!linesResult.ok) return engineFail(linesResult.error!);

    const jeResult = await accountingEngine.postJournal(ctx, {
      branch_id:      cmd.branch_id,
      entry_type:     'expense',
      description:    `Expense: ${cmd.category} - ${cmd.description}`,
      reference_type: 'expense',
      reference_id:   expense.id as UUID,
      lines:          linesResult.data!,
    });
    if (!jeResult.ok) return engineFail(jeResult.error!);

    // Record cash outflow (expense payment)
    const cashResult = await cashEngine.recordExpenseCashOut(ctx, {
      branch_id:      cmd.branch_id,
      expense_id:     expense.id as UUID,
      amount:         totalAmount,
      payment_method: cmd.payment_method,
      description:    `${cmd.category}: ${cmd.description}`,
    });
    if (!cashResult.ok) return engineFail(cashResult.error!);

    // Link journal entry to expense
    await db.expenses()
      
      .update({ journal_entry_id: jeResult.data!.journal_entry_id, updated_by: ctx.user_id })
      .eq('id', expense.id);

    const result: ExpenseResult = {
      expense_id:      expense.id as UUID,
      expense_number:  expense.expense_number as string,
      total_amount:    Number(expense.total_amount),
      status:          expense.status as string,
      journal_entry_id:jeResult.data!.journal_entry_id,
    };

    // Audit
    await auditEngine.log(ctx, {
      table_name: 'expenses',
      record_id:  expense.id as UUID,
      action:     'insert',
      new_value:  { expense_number: result.expense_number, total_amount: result.total_amount },
    });

    if (cmd.idempotency_key) {
      await markIdempotencyComplete(
        ctx.business_id, ctx.user_id, cmd.idempotency_key, 'expense',
        result as unknown as Record<string, unknown>
      );
    }

    return engineOk(result);
  }

  // ---- recordPayroll ----------------------------------------
  // Records one employee's pay for a period and posts accounting
  // (Dr 6400 Salaries and Wages, Cr Cash) plus a cash outflow.
  // Mirrors recordExpense's shape - payroll is, from the accounting
  // engine's point of view, a specialized expense.

  async recordPayroll(
    ctx: EngineContext,
    cmd: RecordPayrollCommand,
  ): Promise<EngineResult<PayrollResult>> {
    if (cmd.basic_salary <= 0) {
      return engineFail(makeError('VALIDATION_ERROR', 'Basic salary must be positive.', undefined, 'basic_salary'));
    }

    if (cmd.idempotency_key) {
      const { isDuplicate, cachedResult } = await checkIdempotency(
        ctx.business_id, cmd.idempotency_key, 'payroll'
      );
      if (isDuplicate && cachedResult) {
        return engineOk(cachedResult as unknown as PayrollResult);
      }
    }

    const ctxErr = await validateContext(ctx, cmd.branch_id);
    if (ctxErr) return engineFail(ctxErr);

    const allowances      = cmd.allowances       ?? 0;
    const overtimePay     = cmd.overtime_pay      ?? 0;
    const taxDeduction    = cmd.tax_deduction     ?? 0;
    const nssfDeduction   = cmd.nssf_deduction    ?? 0;
    const otherDeductions = cmd.other_deductions  ?? 0;

    const grossPay        = cmd.basic_salary + allowances + overtimePay;
    const totalDeductions = taxDeduction + nssfDeduction + otherDeductions;
    const netPay          = grossPay - totalDeductions;

    if (netPay < 0) {
      return engineFail(makeError('VALIDATION_ERROR', 'Deductions cannot exceed gross pay.', undefined, 'net_pay'));
    }

    const payrollNum = await nextPayrollNumber(ctx.business_id);

    const { data: payroll, error: pErr } = await db.payroll()
      .insert({
        business_id:       ctx.business_id,
        branch_id:         cmd.branch_id,
        user_id:           cmd.user_id,
        payroll_number:    payrollNum,
        pay_period_start:  cmd.pay_period_start,
        pay_period_end:    cmd.pay_period_end,
        pay_date:          cmd.pay_date,
        basic_salary:      cmd.basic_salary,
        allowances,
        overtime_pay:      overtimePay,
        gross_pay:         grossPay,
        tax_deduction:     taxDeduction,
        nssf_deduction:    nssfDeduction,
        other_deductions:  otherDeductions,
        total_deductions:  totalDeductions,
        net_pay:           netPay,
        payment_method:    cmd.payment_method,
        status:            'paid',
        notes:             cmd.notes ?? null,
        created_by:        ctx.user_id,
      })
      .select('id, payroll_number, net_pay, status')
      .single();

    if (pErr || !payroll) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to record payroll.', pErr?.message));
    }

    // Post accounting: Dr 6400 Salaries and Wages, Cr Cash
    const linesResult = await accountingEngine.buildExpenseJournalLines(ctx, {
      amount:        netPay,
      paymentMethod: cmd.payment_method,
      category:      'Salaries and Wages',
    });
    if (!linesResult.ok) return engineFail(linesResult.error!);

    // buildExpenseJournalLines resolves account 6000 by default; payroll
    // uses the more specific 6400 code, so swap the debit line's code.
    const payrollLines = linesResult.data!.map(l =>
      l.debit_amount > 0 ? { ...l, account_code: '6400', account_name: 'Salaries and Wages' } : l
    );

    const jeResult = await accountingEngine.postJournal(ctx, {
      branch_id:      cmd.branch_id,
      entry_type:     'payroll',
      description:    `Payroll: ${payrollNum}`,
      reference_type: 'payroll',
      reference_id:   payroll.id as UUID,
      lines:          payrollLines,
    });
    if (!jeResult.ok) return engineFail(jeResult.error!);

    // Record cash outflow
    const cashResult = await cashEngine.recordMovement(ctx, {
      branch_id:       cmd.branch_id,
      transaction_type:'cash_out',
      amount:          netPay,
      payment_method:  cmd.payment_method,
      reference_type:  'payroll',
      reference_id:    payroll.id as UUID,
      description:     `Payroll payment: ${payrollNum}`,
    });
    if (!cashResult.ok) return engineFail(cashResult.error!);

    await db.payroll()
      .update({ journal_entry_id: jeResult.data!.journal_entry_id, updated_by: ctx.user_id })
      .eq('id', payroll.id);

    const result: PayrollResult = {
      payroll_id:       payroll.id as UUID,
      payroll_number:   payroll.payroll_number as string,
      net_pay:          Number(payroll.net_pay),
      status:           payroll.status as string,
      journal_entry_id: jeResult.data!.journal_entry_id,
    };

    await auditEngine.log(ctx, {
      table_name: 'payroll',
      record_id:  payroll.id as UUID,
      action:     'insert',
      new_value:  { payroll_number: result.payroll_number, net_pay: result.net_pay },
    });

    if (cmd.idempotency_key) {
      await markIdempotencyComplete(
        ctx.business_id, ctx.user_id, cmd.idempotency_key, 'payroll',
        result as unknown as Record<string, unknown>
      );
    }

    return engineOk(result);
  }
}

export const businessEngine = new BusinessEngine();
