// ============================================================
// IMC-BLD-003 | ImageCare ERP API & Service Contract v1.0
// File: src/services/credit/creditService.ts
// Purpose: Credit, invoice and payables services.
// ============================================================

import { supabase, rpc } from '../../lib/supabase';
import { canDo } from '../../types/app';
import { serviceOk, serviceFail, makeRequestId } from '../../types/contracts';
import type { ServiceResponse, PagedResponse, DateFilter, PaginationRequest } from '../../types/contracts';
import type { UserContext } from '../../types/app';
import type { Customer, Invoice, Bill, UUID } from '../../types/database';

import { processCreditRepayment } from '../business/businessEngine';
import { creditEngine } from '../../engines/credit/creditEngine';
import { getSale } from '../sales/salesService';
import { APP_CONSTANTS } from '../../config/env';

// ===========================================================
// CREDIT SERVICE
// ===========================================================

export async function getCustomerCredit(
  ctx: UserContext,
  customerId: UUID
): Promise<ServiceResponse<{ customer: Customer; credit_balance: number; credit_limit: number; utilization_pct: number }>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'credit', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view credit data.', { requestId });
  }
  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null)
      .single();
    if (error || !data) return serviceFail('RESOURCE_NOT_FOUND', 'Customer not found.', { requestId });
    const c = data as Customer;
    const utilization = c.credit_limit > 0 ? (c.credit_balance / c.credit_limit) * 100 : 0;
    return serviceOk({ customer: c, credit_balance: c.credit_balance, credit_limit: c.credit_limit, utilization_pct: Math.round(utilization * 10) / 10 }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load credit data.', { requestId }); }
}

export async function getOutstandingCredit(
  ctx: UserContext,
  branchId?: UUID
): Promise<ServiceResponse<unknown[]>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'credit', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view credit data.', { requestId });
  }
  try {
    const { data, error } = await rpc('fn_get_outstanding_credit_summary', {
      p_business_id: ctx.business_id,
      p_branch_id:   branchId ?? null,
    });
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load credit summary.', { requestId });
    return serviceOk((data ?? []) as unknown[], requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load credit summary.', { requestId }); }
}

export async function recordCreditPayment(
  ctx: UserContext,
  input: { customer_id: UUID; branch_id: UUID; amount: number; payment_method: string; reference_notes?: string }
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'credit', 'create')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to record credit payments.', { requestId });
  }
  if (input.amount <= 0) {
    return serviceFail('INVALID_INPUT', 'Payment amount must be greater than zero.', { requestId, field: 'amount' });
  }
  const result = await processCreditRepayment(ctx, input);
  if (result.error) return serviceFail('BUSINESS_RULE_VIOLATION', result.error.message, { requestId });
  return serviceOk(undefined, requestId);
}

// Bug fix (Save-button audit 2026-09-01): the "Write off balance" action
// (src/features/credit/hooks/useCreditData.ts, useWriteOffBalance) used to
// insert into credit_transactions with `credit_account_id: customerId` -
// that FK points at credit_accounts.id, not customers.id, so every real
// write-off either matched no row (silently produced an orphaned
// transaction-shaped row that no trigger could resolve a customer/supplier
// from) or, once migration 0028 allowed 'write_off' as a type, would have
// hit the DB's FK constraint outright. Resolves the real credit_account_id
// first, the same way processCreditRepayment() above does via
// creditEngine.getOrCreateCreditAccount(), before writing the transaction.
export async function writeOffCreditBalance(
  ctx: UserContext,
  input: { customer_id: UUID; branch_id: UUID; amount: number; reason: string }
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'credit', 'create')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to write off credit balances.', { requestId });
  }
  if (input.amount <= 0) {
    return serviceFail('INVALID_INPUT', 'Write-off amount must be greater than zero.', { requestId, field: 'amount' });
  }
  if (!input.reason?.trim()) {
    return serviceFail('INVALID_INPUT', 'A reason is required to write off a balance.', { requestId, field: 'reason' });
  }
  try {
    const accountResult = await creditEngine.getOrCreateCreditAccount(
      { business_id: ctx.business_id, branch_id: input.branch_id, user_id: ctx.user_id, user_ctx: ctx },
      input.customer_id,
      input.branch_id
    );
    if (!accountResult.ok || !accountResult.data) {
      return serviceFail('INTERNAL_ERROR', accountResult.error?.message ?? 'Could not resolve this customer’s credit account.', { requestId });
    }

    const { error } = await supabase
      .schema('imagecare')
      .from('credit_transactions')
      .insert({
        business_id:       ctx.business_id,
        branch_id:         input.branch_id,
        credit_account_id: accountResult.data.credit_account_id,
        transaction_type:  'write_off',
        amount:            input.amount,
        notes:             `Write-off: ${input.reason.trim()}`,
        transaction_date:  new Date().toISOString(),
        created_by:        ctx.user_id,
      });

    if (error) {
      // The DB trigger (migration 0028) guards against a write-off larger
      // than the current balance and raises a message prefixed IMC-CREDIT.
      if (error.message?.includes('IMC-CREDIT')) {
        return serviceFail('BUSINESS_RULE_VIOLATION', error.message, { requestId });
      }
      return serviceFail('INTERNAL_ERROR', 'Failed to write off balance.', { requestId });
    }
    return serviceOk(undefined, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to write off balance.', { requestId }); }
}

// Real read backing "Payment history" on the Credit tab
// (src/pages/sales/CustomerDetailPage.tsx) - see useCreditPayments() in
// src/features/credit/hooks/useCreditData.ts, which used to be aliased
// directly to the record-payment MUTATION hook (a fresh mutation's `.data`
// is always undefined, so the section could never show anything). Returns
// every transaction (charge/payment/write_off) against this customer's
// credit account, newest first.
export async function listCreditTransactions(
  ctx: UserContext,
  customerId: UUID
): Promise<ServiceResponse<unknown[]>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'credit', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view credit data.', { requestId });
  }
  try {
    const { data: account } = await supabase
      .schema('imagecare')
      .from('credit_accounts')
      .select('id')
      .eq('business_id', ctx.business_id)
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .maybeSingle();
    // No credit account yet means no transactions have ever been posted -
    // an empty list is the honest answer, not an error.
    if (!account) return serviceOk([], requestId);

    const { data, error } = await supabase
      .schema('imagecare')
      .from('credit_transactions')
      .select('*')
      .eq('business_id', ctx.business_id)
      .eq('credit_account_id', account.id)
      .order('transaction_date', { ascending: false });
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load credit transactions.', { requestId });
    return serviceOk((data ?? []) as unknown[], requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load credit transactions.', { requestId }); }
}

// ===========================================================
// INVOICE SERVICE
// ===========================================================

export async function getInvoice(
  ctx: UserContext,
  invoiceId: UUID
): Promise<ServiceResponse<Invoice>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'invoices', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view invoices.', { requestId });
  }
  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('invoices')
      .select('*, invoice_items(*), customers(name)')
      .eq('id', invoiceId)
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null)
      .single();
    if (error || !data) return serviceFail('RESOURCE_NOT_FOUND', 'Invoice not found.', { requestId });
    return serviceOk(data as Invoice, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load invoice.', { requestId }); }
}

export async function listInvoices(
  ctx: UserContext,
  filter: { branch_id?: UUID; customer_id?: UUID; status?: Invoice['status']; date?: DateFilter } = {},
  pagination: PaginationRequest = {}
): Promise<ServiceResponse<PagedResponse<Invoice>>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'invoices', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view invoices.', { requestId });
  }
  try {
    const pageSize = Math.min(pagination.page_size ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE, APP_CONSTANTS.MAX_PAGE_SIZE);
    const offset = ((pagination.page ?? 1) - 1) * pageSize;
    let query = supabase.schema('imagecare').from('invoices').select('*', { count: 'exact' }).eq('business_id', ctx.business_id).is('deleted_at', null).range(offset, offset + pageSize - 1).order('invoice_date', { ascending: false });
    if (filter.branch_id)   query = query.eq('branch_id', filter.branch_id);
    if (filter.customer_id) query = query.eq('customer_id', filter.customer_id);
    if (filter.status)      query = query.eq('status', filter.status);
    if (filter.date?.from)  query = query.gte('invoice_date', filter.date.from);
    if (filter.date?.to)    query = query.lte('invoice_date', filter.date.to);
    const { data, error, count } = await query;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load invoices.', { requestId });
    return serviceOk({ items: (data ?? []) as Invoice[], pagination: { total_count: count ?? 0, page_size: pageSize, has_more: (offset + pageSize) < (count ?? 0), next_cursor_date: null, next_cursor_id: null } }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load invoices.', { requestId }); }
}

export async function recordInvoicePayment(
  ctx: UserContext,
  input: { invoice_id: UUID; amount: number; payment_method: string; payment_date?: string }
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'invoices', 'edit')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to record invoice payments.', { requestId });
  }
  try {
    // Fetch invoice to validate
    const { data: invoice } = await supabase.schema('imagecare').from('invoices').select('amount_paid, balance_due, status').eq('id', input.invoice_id).eq('business_id', ctx.business_id).single();
    if (!invoice) return serviceFail('RESOURCE_NOT_FOUND', 'Invoice not found.', { requestId });
    if (invoice.status === 'paid') return serviceFail('BUSINESS_RULE_VIOLATION', 'Invoice is already fully paid.', { requestId });
    if (input.amount > invoice.balance_due) return serviceFail('BUSINESS_RULE_VIOLATION', 'Payment exceeds outstanding balance.', { requestId });

    // Bug fix (Phase 6, item 3-class bug): the previous update wrote
    // `amount_paid: balance_due + amount - balance_due`, which
    // algebraically simplifies to just `amount` - every payment
    // OVERWROTE amount_paid with only its own value instead of
    // accumulating it, so amount_paid silently diverged from
    // balance_due after any invoice's second payment. Fixed to add
    // this payment onto the running total, and to flip status to
    // 'paid' once the balance reaches zero.
    const newBalanceDue = Math.max(0, invoice.balance_due - input.amount);
    const { error } = await supabase.schema('imagecare').from('invoices').update({
      amount_paid: Number(invoice.amount_paid ?? 0) + input.amount,
      balance_due: newBalanceDue,
      status:      newBalanceDue <= 0.01 ? 'paid' : invoice.status,
      updated_at:  new Date().toISOString(),
    }).eq('id', input.invoice_id);
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to record payment.', { requestId });
    return serviceOk(undefined, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to record payment.', { requestId }); }
}

// Real sale-numbering convention (see nextSaleNumber() in
// src/engines/business/businessEngine.ts): count existing rows for this
// business and take the next sequence, rather than the old local service's
// max(existing numeric suffixes) - simpler and matches how every other
// real document number in this app (sale, expense, payroll...) is derived.
async function nextInvoiceNumber(businessId: UUID): Promise<string> {
  const { count } = await supabase
    .schema('imagecare')
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);
  const seq = ((count ?? 0) + 1).toString().padStart(6, '0');
  return `IVC-${seq}`;
}

// Bug fix (Save-button audit 2026-09-01): "Invoice a sale" used to call
// the LOCAL src/services/invoiceService.ts (IndexedDB) - it created an
// invoice the real list (listInvoices() above) could never see, so
// invoicing a sale silently "vanished". Generates a real imagecare.invoices
// row (+ invoice_items) from a real, completed sale.
export async function generateInvoice(
  ctx: UserContext,
  input: { sale_id: UUID; due_date?: string | null }
): Promise<ServiceResponse<Invoice>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'invoices', 'create')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to generate invoices.', { requestId });
  }
  try {
    const saleResult = await getSale(ctx, input.sale_id);
    if (saleResult.error || !saleResult.data) {
      return serviceFail('RESOURCE_NOT_FOUND', 'Sale not found.', { requestId });
    }
    const sale = saleResult.data;
    // Real sales use TransactionStatus ('draft' | 'confirmed' | 'cancelled'
    // | 'voided') - 'confirmed' is a fully posted/completed sale.
    if (sale.status !== 'confirmed') {
      return serviceFail('BUSINESS_RULE_VIOLATION', 'Invoices can only be generated from a completed sale.', { requestId });
    }

    const { data: existingInvoice } = await supabase
      .schema('imagecare')
      .from('invoices')
      .select('id, invoice_number')
      .eq('business_id', ctx.business_id)
      .eq('sale_id', input.sale_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (existingInvoice) {
      return serviceFail('DUPLICATE_OPERATION', `This sale was already invoiced (${existingInvoice.invoice_number}).`, { requestId });
    }

    // Real sale_items has no product name/description column - fetch it
    // for the invoice_items.description column (NOT NULL).
    const productIds = Array.from(new Set(sale.items.map((i) => i.product_id)));
    const { data: products } = productIds.length > 0
      ? await supabase.schema('imagecare').from('products').select('id, name').in('id', productIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const nameMap = new Map((products ?? []).map((p) => [p.id, p.name]));

    const invoiceNumber = await nextInvoiceNumber(ctx.business_id);
    // "Cash/mobile money/card sales are marked paid immediately (the money
    // already changed hands at checkout); credit sales start unpaid" -
    // same rule the old local generator used, applied to the real row.
    const paidImmediately = sale.payment_method !== 'credit';
    const now = new Date().toISOString();

    const { data: invoiceRow, error: invErr } = await supabase
      .schema('imagecare')
      .from('invoices')
      .insert({
        business_id:     ctx.business_id,
        branch_id:       sale.branch_id,
        customer_id:     sale.customer_id,
        sale_id:         sale.id,
        invoice_number:  invoiceNumber,
        invoice_date:    now,
        due_date:        input.due_date ?? null,
        status:          paidImmediately ? 'paid' : 'unpaid',
        subtotal:        sale.subtotal,
        discount_amount: sale.discount_amount,
        tax_amount:      sale.tax_amount,
        total_amount:    sale.total_amount,
        amount_paid:     paidImmediately ? sale.total_amount : 0,
        balance_due:     paidImmediately ? 0 : sale.total_amount,
        created_by:      ctx.user_id,
      })
      .select('*')
      .single();

    if (invErr || !invoiceRow) {
      return serviceFail('INTERNAL_ERROR', 'Failed to create invoice.', { requestId });
    }

    if (sale.items.length > 0) {
      const itemRows = sale.items.map((item) => ({
        invoice_id:      invoiceRow.id,
        business_id:     ctx.business_id,
        product_id:      item.product_id,
        description:     nameMap.get(item.product_id) ?? 'Item',
        quantity:        item.quantity,
        unit_price:      item.unit_price,
        discount_pct:    item.discount_pct,
        discount_amount: item.discount_amount,
        tax_rate:        item.tax_rate,
        tax_amount:      item.tax_amount,
        line_total:      item.line_total,
      }));
      const { error: itemsErr } = await supabase.schema('imagecare').from('invoice_items').insert(itemRows);
      if (itemsErr) {
        // The invoice header was created but its lines failed - report
        // honestly rather than a fake success with a blank invoice.
        return serviceFail('INTERNAL_ERROR', 'The invoice was created but its line items failed to save. Please check the invoice and try again.', { requestId });
      }
    }

    return serviceOk(invoiceRow as Invoice, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to generate invoice.', { requestId }); }
}

// Bug fix (Save-button audit 2026-09-01): "Mark sent" used to update the
// LOCAL invoice collection only, so it never touched the real invoice Mark
// Paid/Cancel/the list already read from - the button appeared to work but
// nothing about the real invoice ever changed. The real invoices table has
// no dedicated "sent" column, so this is recorded in the extensible
// `metadata` JSONB column (see Invoice.metadata, src/types/database.ts).
export async function markInvoiceSent(
  ctx: UserContext,
  invoiceId: UUID
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'invoices', 'edit')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to update invoices.', { requestId });
  }
  try {
    const { data: invoice } = await supabase
      .schema('imagecare')
      .from('invoices')
      .select('metadata')
      .eq('id', invoiceId)
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!invoice) return serviceFail('RESOURCE_NOT_FOUND', 'Invoice not found.', { requestId });

    const metadata = { ...(invoice.metadata ?? {}), sent_at: new Date().toISOString() };
    const { error } = await supabase
      .schema('imagecare')
      .from('invoices')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('id', invoiceId);
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to mark invoice as sent.', { requestId });
    return serviceOk(undefined, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to mark invoice as sent.', { requestId }); }
}

// Bug fix (Save-button audit 2026-09-01): "Cancel invoice" used to update
// the LOCAL invoice collection only - the real invoice's status never
// changed, so Cancel silently did nothing to the invoice everyone actually
// sees. Cancel reason is recorded in `metadata` for the same reason as
// markInvoiceSent() above (no dedicated column on the real table).
export async function cancelInvoice(
  ctx: UserContext,
  input: { id: UUID; reason: string }
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'invoices', 'edit')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to cancel invoices.', { requestId });
  }
  if (!input.reason?.trim()) {
    return serviceFail('INVALID_INPUT', 'A reason is required to cancel an invoice.', { requestId, field: 'reason' });
  }
  try {
    const { data: invoice } = await supabase
      .schema('imagecare')
      .from('invoices')
      .select('status, metadata')
      .eq('id', input.id)
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!invoice) return serviceFail('RESOURCE_NOT_FOUND', 'Invoice not found.', { requestId });
    if (invoice.status === 'paid') {
      return serviceFail('BUSINESS_RULE_VIOLATION', 'A paid invoice cannot be cancelled, issue a refund on the sale instead.', { requestId });
    }

    const metadata = { ...(invoice.metadata ?? {}), cancel_reason: input.reason.trim() };
    const { error } = await supabase
      .schema('imagecare')
      .from('invoices')
      .update({ status: 'voided', metadata, updated_at: new Date().toISOString() })
      .eq('id', input.id);
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to cancel invoice.', { requestId });
    return serviceOk(undefined, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to cancel invoice.', { requestId }); }
}

// ===========================================================
// PAYABLES SERVICE (Bills)
// ===========================================================

export async function getBill(
  ctx: UserContext,
  billId: UUID
): Promise<ServiceResponse<Bill>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'bills', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view bills.', { requestId });
  }
  try {
    const { data, error } = await supabase.schema('imagecare').from('bills').select('*, suppliers(name)').eq('id', billId).eq('business_id', ctx.business_id).is('deleted_at', null).single();
    if (error || !data) return serviceFail('RESOURCE_NOT_FOUND', 'Bill not found.', { requestId });
    return serviceOk(data as Bill, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load bill.', { requestId }); }
}

export async function listBills(
  ctx: UserContext,
  filter: { branch_id?: UUID; supplier_id?: UUID; status?: Bill['status']; date?: DateFilter } = {},
  pagination: PaginationRequest = {}
): Promise<ServiceResponse<PagedResponse<Bill>>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'bills', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view bills.', { requestId });
  }
  try {
    const pageSize = Math.min(pagination.page_size ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE, APP_CONSTANTS.MAX_PAGE_SIZE);
    const offset = ((pagination.page ?? 1) - 1) * pageSize;
    let query = supabase.schema('imagecare').from('bills').select('*', { count: 'exact' }).eq('business_id', ctx.business_id).is('deleted_at', null).range(offset, offset + pageSize - 1).order('bill_date', { ascending: false });
    if (filter.branch_id)   query = query.eq('branch_id', filter.branch_id);
    if (filter.supplier_id) query = query.eq('supplier_id', filter.supplier_id);
    if (filter.status)      query = query.eq('status', filter.status);
    if (filter.date?.from)  query = query.gte('bill_date', filter.date.from);
    if (filter.date?.to)    query = query.lte('bill_date', filter.date.to);
    const { data, error, count } = await query;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load bills.', { requestId });
    return serviceOk({ items: (data ?? []) as Bill[], pagination: { total_count: count ?? 0, page_size: pageSize, has_more: (offset + pageSize) < (count ?? 0), next_cursor_date: null, next_cursor_id: null } }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load bills.', { requestId }); }
}

// Bug fix (Save-button audit 2026-09-01): useRecordBillPayment used to call
// the LOCAL src/services/purchasingService.ts's recordInvoicePayment(),
// which does `invoices.find(i => i.id === supplierInvoiceId)` against a
// LOCAL IndexedDB collection that a real bill's id is essentially never in
// - every payment attempt against a real bill failed with "Invoice not
// found." Mirrors the same accumulate-not-overwrite fix already applied to
// recordInvoicePayment() above (amount_paid must accumulate across
// payments, not be replaced by the latest one).
export async function recordBillPayment(
  ctx: UserContext,
  input: { bill_id: UUID; amount: number; reference?: string }
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'bills', 'edit')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to record bill payments.', { requestId });
  }
  if (input.amount <= 0) {
    return serviceFail('INVALID_INPUT', 'Enter a payment amount greater than 0.', { requestId, field: 'amount' });
  }
  try {
    const { data: bill } = await supabase
      .schema('imagecare')
      .from('bills')
      .select('amount_paid, balance_due, status')
      .eq('id', input.bill_id)
      .eq('business_id', ctx.business_id)
      .maybeSingle();
    if (!bill) return serviceFail('RESOURCE_NOT_FOUND', 'Bill not found.', { requestId });
    if (bill.status === 'voided') {
      return serviceFail('BUSINESS_RULE_VIOLATION', 'This bill is cancelled and can no longer accept payments.', { requestId });
    }
    if (bill.status === 'paid') {
      return serviceFail('BUSINESS_RULE_VIOLATION', 'This bill is already fully paid.', { requestId });
    }
    if (input.amount > bill.balance_due) {
      return serviceFail('BUSINESS_RULE_VIOLATION', 'Payment exceeds the amount owed on this bill.', { requestId });
    }

    const newBalanceDue = Math.max(0, bill.balance_due - input.amount);
    const { error } = await supabase
      .schema('imagecare')
      .from('bills')
      .update({
        amount_paid: Number(bill.amount_paid ?? 0) + input.amount,
        balance_due: newBalanceDue,
        status:      newBalanceDue <= 0.01 ? 'paid' : 'partial',
        updated_at:  new Date().toISOString(),
      })
      .eq('id', input.bill_id);
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to record payment.', { requestId });
    return serviceOk(undefined, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to record payment.', { requestId }); }
}

// Bug fix (Save-button audit 2026-09-01): useCancelBill used to call the
// LOCAL purchasingService/billsService, which never touched the real bill
// - Cancel appeared to succeed but the real bill (what the register/detail
// pages actually read) never changed. Real `bills.status` has no separate
// 'cancelled' state; 'voided' is the closest real equivalent (same mapping
// already used for display in useBillsData.ts's mapBillStatus()).
export async function cancelBill(
  ctx: UserContext,
  input: { bill_id: UUID; reason: string }
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'bills', 'edit')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to cancel bills.', { requestId });
  }
  if (!input.reason?.trim()) {
    return serviceFail('INVALID_INPUT', 'A reason is required to cancel a bill.', { requestId, field: 'reason' });
  }
  try {
    const { data: bill } = await supabase
      .schema('imagecare')
      .from('bills')
      .select('status, metadata')
      .eq('id', input.bill_id)
      .eq('business_id', ctx.business_id)
      .maybeSingle();
    if (!bill) return serviceFail('RESOURCE_NOT_FOUND', 'Bill not found.', { requestId });
    if (bill.status === 'paid') {
      return serviceFail('BUSINESS_RULE_VIOLATION', 'A paid or closed bill cannot be cancelled.', { requestId });
    }

    const metadata = { ...(bill.metadata ?? {}), cancel_reason: input.reason.trim() };
    const { error } = await supabase
      .schema('imagecare')
      .from('bills')
      .update({ status: 'voided', metadata, updated_at: new Date().toISOString() })
      .eq('id', input.bill_id);
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to cancel bill.', { requestId });
    return serviceOk(undefined, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to cancel bill.', { requestId }); }
}

// Bug fix (Save-button audit 2026-09-01): useCloseBill used to call the
// LOCAL billsService, same "never touches the real bill" problem as
// cancelBill() above. Real `bills.status` has no 'closed' state, so - like
// markInvoiceSent()/cancelInvoice() above - this is recorded in `metadata`
// rather than inventing a status value the DB CHECK constraint (and every
// other real-bill status mapping in this app) doesn't know about.
export async function closeBill(
  ctx: UserContext,
  input: { bill_id: UUID }
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'bills', 'edit')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to close bills.', { requestId });
  }
  try {
    const { data: bill } = await supabase
      .schema('imagecare')
      .from('bills')
      .select('status, metadata')
      .eq('id', input.bill_id)
      .eq('business_id', ctx.business_id)
      .maybeSingle();
    if (!bill) return serviceFail('RESOURCE_NOT_FOUND', 'Bill not found.', { requestId });
    if (bill.status !== 'paid') {
      return serviceFail('BUSINESS_RULE_VIOLATION', 'Only a fully paid bill can be closed.', { requestId });
    }

    const metadata = { ...(bill.metadata ?? {}), closed_at: new Date().toISOString() };
    const { error } = await supabase
      .schema('imagecare')
      .from('bills')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('id', input.bill_id);
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to close bill.', { requestId });
    return serviceOk(undefined, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to close bill.', { requestId }); }
}
