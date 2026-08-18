// ============================================================
// IMC-BLD-003 | ImageCare ERP API & Service Contract v1.0
// File: src/services/financial/financialServices.ts
// Purpose: Expense, payroll, cash, banking, accounting and
//          audit services - all financial service boundaries.
// ============================================================

import { supabase, rpc } from '../../lib/supabase';
import { canDo, parseError } from '../../types/app';
import { serviceOk, serviceFail, makeRequestId } from '../../types/contracts';
import type { ServiceResponse, PagedResponse, DateFilter, PaginationRequest } from '../../types/contracts';
import type { UserContext } from '../../types/app';
import type { Expense, PayrollRecord, CashTransaction, JournalEntry, UUID } from '../../types/database';
import { createAndPostExpense, processPayroll, processCreditRepayment, type CreateExpenseInput } from '../business/businessEngine';
import { APP_CONSTANTS } from '../../config/env';
import { v4 as uuidv4 } from 'uuid';

// ===========================================================
// EXPENSE SERVICE
// ===========================================================

export async function createExpense(
  ctx: UserContext,
  request: CreateExpenseInput & { idempotency_key?: string }
): Promise<ServiceResponse<{ expense_id: UUID; expense_number: string }>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'expenses', 'create')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to record expenses.', { requestId });
  }
  const result = await createAndPostExpense(ctx, request);
  if (result.error) return serviceFail('BUSINESS_RULE_VIOLATION', result.error.message, { requestId });
  return serviceOk(result.data!, requestId);
}

export async function listExpenses(
  ctx: UserContext,
  filter: { branch_id?: UUID; category?: string; date?: DateFilter } = {},
  pagination: PaginationRequest = {}
): Promise<ServiceResponse<PagedResponse<Expense>>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'expenses', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view expenses.', { requestId });
  }
  try {
    const pageSize = Math.min(pagination.page_size ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE, APP_CONSTANTS.MAX_PAGE_SIZE);
    const { data, error } = await rpc('fn_list_expenses_cursor', {
      p_business_id: ctx.business_id,
      p_branch_id:   filter.branch_id ?? null,
      p_category:    filter.category  ?? null,
      p_from_date:   filter.date?.from ?? null,
      p_to_date:     filter.date?.to   ?? null,
      p_cursor_date: pagination.cursor_date ?? null,
      p_cursor_id:   pagination.cursor_id   ?? null,
      p_limit:       pageSize + 1,
    });
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load expenses.', { requestId });
    const rows = (data ?? []) as Expense[];
    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const last = items[items.length - 1] as any;
    return serviceOk({ items, pagination: { total_count: 0, page_size: pageSize, has_more: hasMore, next_cursor_date: hasMore ? last?.expense_date ?? null : null, next_cursor_id: hasMore ? last?.id ?? null : null } }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load expenses.', { requestId }); }
}

// ===========================================================
// PAYROLL SERVICE
// ===========================================================

export async function getPayroll(
  ctx: UserContext,
  payrollId: UUID
): Promise<ServiceResponse<PayrollRecord>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'payroll', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view payroll.', { requestId });
  }
  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('payroll')
      .select('*')
      .eq('id', payrollId)
      .eq('business_id', ctx.business_id)
      .single();
    if (error || !data) return serviceFail('RESOURCE_NOT_FOUND', 'Payroll record not found.', { requestId });
    return serviceOk(data as PayrollRecord, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load payroll.', { requestId }); }
}

export async function listPayroll(
  ctx: UserContext,
  filter: { branch_id?: UUID; user_id?: UUID; status?: string; date?: DateFilter } = {},
  pagination: PaginationRequest = {}
): Promise<ServiceResponse<PagedResponse<PayrollRecord>>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'payroll', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view payroll.', { requestId });
  }
  try {
    const pageSize = Math.min(pagination.page_size ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE, APP_CONSTANTS.MAX_PAGE_SIZE);
    const offset = ((pagination.page ?? 1) - 1) * pageSize;
    let query = supabase.schema('imagecare').from('payroll').select('*', { count: 'exact' }).eq('business_id', ctx.business_id).is('deleted_at', null).range(offset, offset + pageSize - 1).order('pay_date', { ascending: false });
    if (filter.branch_id) query = query.eq('branch_id', filter.branch_id);
    if (filter.user_id)   query = query.eq('user_id', filter.user_id);
    if (filter.status)    query = query.eq('status', filter.status);
    if (filter.date?.from) query = query.gte('pay_date', filter.date.from.split('T')[0]);
    if (filter.date?.to)   query = query.lte('pay_date', filter.date.to.split('T')[0]);
    const { data, error, count } = await query;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load payroll.', { requestId });
    return serviceOk({ items: (data ?? []) as PayrollRecord[], pagination: { total_count: count ?? 0, page_size: pageSize, has_more: (offset + pageSize) < (count ?? 0), next_cursor_date: null, next_cursor_id: null } }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load payroll.', { requestId }); }
}

export async function approvePayroll(
  ctx: UserContext,
  payrollId: UUID
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'payroll', 'approve')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to approve payroll.', { requestId });
  }
  try {
    const { error } = await supabase.schema('imagecare').from('payroll').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', payrollId).eq('business_id', ctx.business_id).eq('status', 'pending');
    if (error) return serviceFail('BUSINESS_RULE_VIOLATION', parseError(error).message, { requestId });
    return serviceOk(undefined, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to approve payroll.', { requestId }); }
}

export async function processPayrollPayment(
  ctx: UserContext,
  payrollId: UUID
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();
  const result = await processPayroll(ctx, payrollId);
  if (result.error) return serviceFail('BUSINESS_RULE_VIOLATION', result.error.message, { requestId });
  return serviceOk(undefined, requestId);
}

// ===========================================================
// CASH SERVICE
// ===========================================================

export async function getCashBalance(
  ctx: UserContext,
  branchId: UUID
): Promise<ServiceResponse<{ cash_in: number; cash_out: number; net_position: number }>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'cash', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view cash data.', { requestId });
  }
  try {
    const { data, error } = await rpc('fn_get_cash_position', {
      p_business_id: ctx.business_id,
      p_branch_id:   branchId,
    });
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load cash balance.', { requestId });
    return serviceOk(data as any, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load cash balance.', { requestId }); }
}

export async function listCashTransactions(
  ctx: UserContext,
  filter: { branch_id?: UUID; transaction_type?: string; date?: DateFilter } = {},
  pagination: PaginationRequest = {}
): Promise<ServiceResponse<PagedResponse<CashTransaction>>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'cash', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view cash transactions.', { requestId });
  }
  try {
    const pageSize = Math.min(pagination.page_size ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE, APP_CONSTANTS.MAX_PAGE_SIZE);
    const offset = ((pagination.page ?? 1) - 1) * pageSize;
    let query = supabase.schema('imagecare').from('cash_transactions').select('*', { count: 'exact' }).eq('business_id', ctx.business_id).is('deleted_at', null).range(offset, offset + pageSize - 1).order('transaction_date', { ascending: false });
    if (filter.branch_id)       query = query.eq('branch_id', filter.branch_id);
    if (filter.transaction_type) query = query.eq('transaction_type', filter.transaction_type);
    if (filter.date?.from) query = query.gte('transaction_date', filter.date.from);
    if (filter.date?.to)   query = query.lte('transaction_date', filter.date.to);
    const { data, error, count } = await query;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load transactions.', { requestId });
    return serviceOk({ items: (data ?? []) as CashTransaction[], pagination: { total_count: count ?? 0, page_size: pageSize, has_more: (offset + pageSize) < (count ?? 0), next_cursor_date: null, next_cursor_id: null } }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load transactions.', { requestId }); }
}

// ===========================================================
// ACCOUNTING SERVICE
// ===========================================================

export async function listJournalEntries(
  ctx: UserContext,
  filter: { branch_id?: UUID; status?: string; date?: DateFilter } = {},
  pagination: PaginationRequest = {}
): Promise<ServiceResponse<PagedResponse<JournalEntry>>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'journal', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view journal entries.', { requestId });
  }
  try {
    const pageSize = Math.min(pagination.page_size ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE, APP_CONSTANTS.MAX_PAGE_SIZE);
    const offset = ((pagination.page ?? 1) - 1) * pageSize;
    let query = supabase.schema('imagecare').from('journal_entries').select('*', { count: 'exact' }).eq('business_id', ctx.business_id).range(offset, offset + pageSize - 1).order('entry_date', { ascending: false });
    if (filter.branch_id) query = query.eq('branch_id', filter.branch_id);
    if (filter.status)    query = query.eq('status', filter.status);
    if (filter.date?.from) query = query.gte('entry_date', filter.date.from);
    if (filter.date?.to)   query = query.lte('entry_date', filter.date.to);
    const { data, error, count } = await query;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load journal entries.', { requestId });
    return serviceOk({ items: (data ?? []) as JournalEntry[], pagination: { total_count: count ?? 0, page_size: pageSize, has_more: (offset + pageSize) < (count ?? 0), next_cursor_date: null, next_cursor_id: null } }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load journal entries.', { requestId }); }
}

export async function getAccountBalance(
  ctx: UserContext,
  accountCode: string,
  filter?: { year?: number; month?: number; branch_id?: UUID }
): Promise<ServiceResponse<number>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'journal', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view account balances.', { requestId });
  }
  try {
    const { data, error } = await rpc('fn_get_account_balance', {
      p_business_id:  ctx.business_id,
      p_account_code: accountCode,
      p_year:         filter?.year   ?? null,
      p_month:        filter?.month  ?? null,
      p_branch_id:    filter?.branch_id ?? null,
    });
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load account balance.', { requestId });
    return serviceOk(data as number, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load account balance.', { requestId }); }
}

// ===========================================================
// AUDIT SERVICE
// ===========================================================

export async function listAuditLogs(
  ctx: UserContext,
  filter: { table_name?: string; user_id?: UUID; date?: DateFilter } = {},
  pagination: PaginationRequest = {}
): Promise<ServiceResponse<PagedResponse<any>>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'settings', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view audit logs.', { requestId });
  }
  try {
    const pageSize = Math.min(pagination.page_size ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE, APP_CONSTANTS.MAX_PAGE_SIZE);
    const { data, error } = await rpc('fn_list_audit_logs_cursor', {
      p_business_id: ctx.business_id,
      p_table_name:  filter.table_name ?? null,
      p_user_id:     filter.user_id   ?? null,
      p_action:      null,
      p_from_date:   filter.date?.from ?? null,
      p_cursor_date: pagination.cursor_date ?? null,
      p_cursor_id:   pagination.cursor_id   ?? null,
      p_limit:       pageSize + 1,
    });
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load audit logs.', { requestId });
    const rows = (data ?? []) as any[];
    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const last = items[items.length - 1];
    return serviceOk({ items, pagination: { total_count: 0, page_size: pageSize, has_more: hasMore, next_cursor_date: hasMore ? last?.created_at ?? null : null, next_cursor_id: hasMore ? last?.id ?? null : null } }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load audit logs.', { requestId }); }
}
