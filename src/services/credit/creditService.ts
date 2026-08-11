// ============================================================
// IMC-BLD-003 | ImageCare ERP API & Service Contract v1.0
// File: src/services/credit/creditService.ts
// Purpose: Credit, invoice and payables services.
// ============================================================

import { supabase } from '../../lib/supabase';
import { canDo, parseError } from '../../types/app';
import { serviceOk, serviceFail, makeRequestId } from '../../types/contracts';
import type { ServiceResponse, PagedResponse, DateFilter, PaginationRequest } from '../../types/contracts';
import type { UserContext } from '../../types/app';
import type { Customer, Invoice, Bill, UUID } from '../../types/database';
import type { CreditAccount } from '../../types/schema';
import { processCreditRepayment } from '../business/businessEngine';
import { APP_CONSTANTS } from '../../config/env';
import { v4 as uuidv4 } from 'uuid';

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
): Promise<ServiceResponse<any[]>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'credit', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view credit data.', { requestId });
  }
  try {
    const { data, error } = await supabase.rpc('fn_get_outstanding_credit_summary', {
      p_business_id: ctx.business_id,
      p_branch_id:   branchId ?? null,
    });
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load credit summary.', { requestId });
    return serviceOk((data ?? []) as any[], requestId);
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
    const { data: invoice } = await supabase.schema('imagecare').from('invoices').select('balance_due, status').eq('id', input.invoice_id).eq('business_id', ctx.business_id).single();
    if (!invoice) return serviceFail('RESOURCE_NOT_FOUND', 'Invoice not found.', { requestId });
    if (invoice.status === 'paid') return serviceFail('BUSINESS_RULE_VIOLATION', 'Invoice is already fully paid.', { requestId });
    if (input.amount > invoice.balance_due) return serviceFail('BUSINESS_RULE_VIOLATION', 'Payment exceeds outstanding balance.', { requestId });

    const newPaid = invoice.balance_due - input.amount <= 0.01 ? 0 : invoice.balance_due - input.amount;
    const { error } = await supabase.schema('imagecare').from('invoices').update({ amount_paid: (invoice.balance_due) + input.amount - invoice.balance_due, balance_due: Math.max(0, invoice.balance_due - input.amount), updated_at: new Date().toISOString() }).eq('id', input.invoice_id);
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to record payment.', { requestId });
    return serviceOk(undefined, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to record payment.', { requestId }); }
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
