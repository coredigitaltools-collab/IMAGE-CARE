// ============================================================
// IMC-BLD-003 | ImageCare ERP API & Service Contract v1.0
// File: src/services/financial/financialServices.ts
// Purpose: Expense, payroll, cash, banking, accounting and
//          audit services - all financial service boundaries.
// ============================================================

import { supabase } from '../../lib/supabase';
import { canDo, parseError } from '../../types/app';
import { serviceOk, serviceFail, makeRequestId } from '../../types/contracts';
import type { ServiceResponse, PagedResponse, DateFilter, PaginationRequest } from '../../types/contracts';
import type { UserContext } from '../../types/app';
import type { Expense, PayrollRecord, CashTransaction, JournalEntry, UUID } from '../../types/database';
import { createAndPostExpense, processPayroll, type CreateExpenseInput } from '../business/businessEngine';
import { APP_CONSTANTS } from '../../config/env';
import { cashEngine, accountingEngine } from '../../engines';
import type { EngineContext } from '../../engines/types';

function toEngineContext(ctx: UserContext, branchId?: UUID): EngineContext {
  return {
    business_id: ctx.business_id,
    branch_id:   branchId ?? ctx.branch_id ?? null,
    user_id:     ctx.user_id,
    user_ctx:    ctx,
  };
}

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
    // fn_list_expenses_cursor does not exist live or in any tracked
    // migration (confirmed by Phase 1 verification) - replaced with a
    // direct offset-paginated query, matching the pattern already used
    // by listPurchases/listInventory/listBranches.
    const pageSize = Math.min(pagination.page_size ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE, APP_CONSTANTS.MAX_PAGE_SIZE);
    const offset = ((pagination.page ?? 1) - 1) * pageSize;

    let query = supabase.schema('imagecare').from('expenses')
      .select('*', { count: 'exact' })
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null)
      .range(offset, offset + pageSize - 1)
      .order('expense_date', { ascending: false });

    if (filter.branch_id) query = query.eq('branch_id', filter.branch_id);
    if (filter.category)  query = query.eq('category', filter.category);
    if (filter.date?.from) query = query.gte('expense_date', filter.date.from);
    if (filter.date?.to)   query = query.lte('expense_date', filter.date.to);

    const { data, error, count } = await query;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load expenses.', { requestId });

    return serviceOk({
      items: (data ?? []) as Expense[],
      pagination: {
        total_count:      count ?? 0,
        page_size:        pageSize,
        has_more:         (offset + pageSize) < (count ?? 0),
        next_cursor_date: null,
        next_cursor_id:   null,
      },
    }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load expenses.', { requestId }); }
}

// Fields intentionally NOT editable here: amount, tax_amount, payment_method.
// recordExpense() (engines/business/businessEngine.ts) posts a real double-entry
// journal entry (Dr Expense, Cr Cash) and a cash-out transaction at creation time,
// keyed off those exact values. Changing them after the fact without also
// reversing/reposting the linked journal entry and cash transaction would leave
// the books unbalanced - that reversal/re-posting engine is out of scope here,
// so this only touches the record-keeping fields that carry no accounting
// impact. To correct an amount, delete the expense and record it again.
export interface UpdateExpenseInput {
  expense_date?: string;
  category?: string;
  description?: string;
  notes?: string;
}

export async function updateExpense(
  ctx: UserContext,
  expenseId: UUID,
  patch: UpdateExpenseInput
): Promise<ServiceResponse<{ expense_id: UUID }>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'expenses', 'edit')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to edit expenses.', { requestId });
  }
  try {
    const { error } = await supabase
      .schema('imagecare')
      .from('expenses')
      .update({ ...patch, updated_by: ctx.user_id })
      .eq('id', expenseId)
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null);
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to update expense.', { requestId });
    return serviceOk({ expense_id: expenseId }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to update expense.', { requestId }); }
}

// Soft-delete only, matching the pattern already established for this table
// (listExpenses already filters `deleted_at IS NULL`). This does not reverse
// the posted journal entry / cash transaction - same scope note as
// updateExpense above.
export async function deleteExpense(
  ctx: UserContext,
  expenseId: UUID
): Promise<ServiceResponse<{ expense_id: UUID }>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'expenses', 'delete')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to delete expenses.', { requestId });
  }
  try {
    const { error } = await supabase
      .schema('imagecare')
      .from('expenses')
      .update({ deleted_at: new Date().toISOString(), updated_by: ctx.user_id })
      .eq('id', expenseId)
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null);
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to delete expense.', { requestId });
    return serviceOk({ expense_id: expenseId }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to delete expense.', { requestId }); }
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
    // fn_get_cash_position does not exist live or in any tracked migration
    // (confirmed by Phase 1 verification) - delegated to cashEngine.getCashBalance,
    // which derives cash-in-hand directly from confirmed cash_transactions,
    // never from accounting profit.
    const result = await cashEngine.getCashBalance(toEngineContext(ctx, branchId), branchId);
    if (result.error || !result.data) {
      return serviceFail('INTERNAL_ERROR', result.error?.message ?? 'Failed to load cash balance.', { requestId });
    }
    return serviceOk({
      cash_in:      result.data.total_in,
      cash_out:     result.data.total_out,
      net_position: result.data.balance,
    }, requestId);
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
    // fn_get_account_balance does not exist live or in any tracked migration
    // (confirmed by Phase 1 verification). imagecare.vw_account_balances
    // (created by 0010_stage2_accounting.sql) already aggregates posted
    // journal_lines per account per branch per period - query it directly
    // instead of inventing a new RPC.
    const resolved = await accountingEngine.resolveAccountCode(ctx.business_id, accountCode);
    if (resolved.error || !resolved.data) {
      return serviceFail('RESOURCE_NOT_FOUND', resolved.error?.message ?? 'Account not found.', { requestId });
    }

    let query = supabase.schema('imagecare').from('vw_account_balances')
      .select('net_balance')
      .eq('business_id', ctx.business_id)
      .eq('account_code', accountCode);

    if (filter?.branch_id) query = query.eq('branch_id', filter.branch_id);
    if (filter?.year)      query = query.eq('period_year', filter.year);
    if (filter?.month)     query = query.eq('period_month', filter.month);

    const { data, error } = await query;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load account balance.', { requestId });

    const rawBalance = (data ?? []).reduce((sum, row) => sum + Number(row.net_balance ?? 0), 0);

    // net_balance = debits - credits. Asset/expense accounts carry a normal
    // debit balance (positive as-is); liability/equity/revenue accounts
    // carry a normal credit balance, so flip the sign for a readable figure.
    const creditNormal = ['liability', 'equity', 'revenue'].includes(resolved.data.account_type);
    const balance = creditNormal ? -rawBalance : rawBalance;

    return serviceOk(balance, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load account balance.', { requestId }); }
}

// ===========================================================
// AUDIT SERVICE
// ===========================================================

export async function listAuditLogs(
  ctx: UserContext,
  filter: { table_name?: string; user_id?: UUID; date?: DateFilter } = {},
  pagination: PaginationRequest = {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<ServiceResponse<PagedResponse<any>>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'settings', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view audit logs.', { requestId });
  }
  try {
    // fn_list_audit_logs_cursor does not exist live or in any tracked
    // migration (confirmed by Phase 1 verification) - replaced with a
    // direct offset-paginated query against imagecare.audit_logs.
    const pageSize = Math.min(pagination.page_size ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE, APP_CONSTANTS.MAX_PAGE_SIZE);
    const offset = ((pagination.page ?? 1) - 1) * pageSize;

    let query = supabase.schema('imagecare').from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('business_id', ctx.business_id)
      .range(offset, offset + pageSize - 1)
      .order('created_at', { ascending: false });

    if (filter.table_name) query = query.eq('table_name', filter.table_name);
    if (filter.user_id)    query = query.eq('user_id', filter.user_id);
    if (filter.date?.from) query = query.gte('created_at', filter.date.from);
    if (filter.date?.to)   query = query.lte('created_at', filter.date.to);

    const { data, error, count } = await query;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load audit logs.', { requestId });

    return serviceOk({
      items: data ?? [],
      pagination: {
        total_count:      count ?? 0,
        page_size:        pageSize,
        has_more:         (offset + pageSize) < (count ?? 0),
        next_cursor_date: null,
        next_cursor_id:   null,
      },
    }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load audit logs.', { requestId }); }
}
