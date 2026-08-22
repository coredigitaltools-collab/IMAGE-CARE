// ============================================================
// IMC-BLD-001 | ImageCare ERP Application Architecture v1.0
// File: src/services/reporting/reportingService.ts
// Purpose: Shared reporting service.
//          All dashboard KPIs and report data come through here.
//          Pages must never calculate KPIs independently.
//          Uses the shared DB-003/DB-006 reporting engine.
// ============================================================

import { supabase, rpc } from '../../lib/supabase';
import { ok, fail, parseError } from '../../types/app';
import type { ApiResult, UserContext, DateRange } from '../../types/app';
import type { UUID, DashboardKPIs, StockSummaryRow } from '../../types/database';
import { canDo } from '../../types/app';

// ---- Dashboard KPIs ----------------------------------------

export async function getDashboardKPIs(
  ctx: UserContext,
  branchId?: UUID,
  dateRange?: DateRange
): Promise<ApiResult<DashboardKPIs>> {
  if (!canDo(ctx, 'reports', 'view')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to view reports.' });
  }

  try {
    const now = new Date();
    const from = dateRange?.from ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to   = dateRange?.to   ?? now.toISOString();

    const { data, error } = await rpc('fn_get_dashboard_kpis', {
      p_business_id: ctx.business_id,
      p_branch_id:   branchId ?? null,
      p_from_date:   from,
      p_to_date:     to,
    });

    if (error) return fail(parseError(error));
    return ok(data as unknown as DashboardKPIs);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Sales by period ---------------------------------------

export interface SalesByPeriodRow {
  period_label: string;
  period_start: string;
  sale_count: number;
  total_revenue: number;
  total_cogs: number;
  gross_profit: number;
  cash_collected: number;
  credit_given: number;
}

export async function getSalesByPeriod(
  ctx: UserContext,
  input: {
    from_date: string;
    to_date: string;
    group_by?: 'day' | 'week' | 'month';
    branch_id?: UUID;
  }
): Promise<ApiResult<SalesByPeriodRow[]>> {
  if (!canDo(ctx, 'reports', 'view')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to view reports.' });
  }

  try {
    const { data, error } = await rpc('fn_get_sales_by_period', {
      p_business_id: ctx.business_id,
      p_from_date:   input.from_date,
      p_to_date:     input.to_date,
      p_group_by:    input.group_by ?? 'day',
      p_branch_id:   input.branch_id ?? null,
    });

    if (error) return fail(parseError(error));
    return ok((data ?? []) as SalesByPeriodRow[]);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Top products ------------------------------------------

export interface TopProductRow {
  product_id: UUID;
  product_name: string;
  sku: string | null;
  total_qty: number;
  total_revenue: number;
  total_cogs: number;
  gross_profit: number;
  transaction_count: number;
}

export async function getTopProducts(
  ctx: UserContext,
  input: {
    from_date: string;
    to_date: string;
    limit?: number;
    order_by?: 'revenue' | 'quantity' | 'profit';
    branch_id?: UUID;
  }
): Promise<ApiResult<TopProductRow[]>> {
  if (!canDo(ctx, 'reports', 'view')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to view reports.' });
  }

  try {
    const { data, error } = await rpc('fn_get_top_products', {
      p_business_id: ctx.business_id,
      p_from_date:   input.from_date,
      p_to_date:     input.to_date,
      p_limit:       input.limit ?? 10,
      p_order_by:    input.order_by ?? 'revenue',
      p_branch_id:   input.branch_id ?? null,
    });

    if (error) return fail(parseError(error));
    return ok((data ?? []) as TopProductRow[]);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Stock summary -----------------------------------------

export async function getStockSummary(
  ctx: UserContext,
  branchId?: UUID
): Promise<ApiResult<StockSummaryRow[]>> {
  if (!canDo(ctx, 'inventory', 'view')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to view stock.' });
  }

  try {
    let query = supabase
      .schema('imagecare')
      .from('vw_stock_summary')
      .select('*')
      .eq('business_id', ctx.business_id);

    if (branchId) query = query.eq('branch_id', branchId);

    const { data, error } = await query.order('product_name');
    if (error) return fail(parseError(error));
    return ok((data ?? []) as StockSummaryRow[]);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Cash position -----------------------------------------

export interface CashPosition {
  cash_in: number;
  cash_out: number;
  net_position: number;
  by_method: Record<string, number>;
}

export async function getCashPosition(
  ctx: UserContext,
  branchId?: UUID
): Promise<ApiResult<CashPosition>> {
  if (!canDo(ctx, 'cash', 'view')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to view cash data.' });
  }

  try {
    const { data, error } = await rpc('fn_get_cash_position', {
      p_business_id: ctx.business_id,
      p_branch_id:   branchId ?? null,
    });

    if (error) return fail(parseError(error));
    return ok(data as unknown as CashPosition);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Outstanding credit ------------------------------------

export interface CreditSummaryRow {
  customer_id: UUID;
  customer_name: string;
  phone: string | null;
  credit_limit: number;
  credit_balance: number;
  utilization_pct: number;
}

export async function getOutstandingCredit(
  ctx: UserContext,
  branchId?: UUID
): Promise<ApiResult<CreditSummaryRow[]>> {
  if (!canDo(ctx, 'credit', 'view')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to view credit data.' });
  }

  try {
    const { data, error } = await rpc('fn_get_outstanding_credit_summary', {
      p_business_id: ctx.business_id,
      p_branch_id:   branchId ?? null,
    });

    if (error) return fail(parseError(error));
    return ok((data ?? []) as CreditSummaryRow[]);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Expense breakdown -------------------------------------

export interface ExpenseBreakdownRow {
  category: string;
  total_amount: number;
  transaction_count: number;
  avg_amount: number;
}

export async function getExpenseBreakdown(
  ctx: UserContext,
  input: { from_date: string; to_date: string; branch_id?: UUID }
): Promise<ApiResult<ExpenseBreakdownRow[]>> {
  if (!canDo(ctx, 'expenses', 'view')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to view expense data.' });
  }

  try {
    const { data, error } = await rpc('fn_get_expense_breakdown', {
      p_business_id: ctx.business_id,
      p_from_date:   input.from_date,
      p_to_date:     input.to_date,
      p_branch_id:   input.branch_id ?? null,
    });

    if (error) return fail(parseError(error));
    return ok((data ?? []) as ExpenseBreakdownRow[]);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ============================================================
// Stage 5: Low stock alerts and recent sales for dashboard.
// ============================================================

import { serviceOk, serviceFail, makeRequestId } from '../../types/contracts';
import type { ServiceResponse } from '../../types/contracts';

export async function getLowStockAlerts(
  ctx: UserContext,
  branchId?: UUID
): Promise<ServiceResponse<Array<{ product_id: UUID; product_name: string; quantity_on_hand: number; reorder_level: number }>>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'inventory', 'view')) return serviceFail('PERMISSION_DENIED', 'Permission denied.', { requestId });
  try {
    const { data, error } = await supabase.schema('imagecare').from('vw_stock_summary')
      .select('product_id, product_name, quantity_on_hand, reorder_level, branch_id')
      .eq('business_id', ctx.business_id);
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed.', { requestId });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows = (data ?? []) as any[];
    rows = rows.filter(r => (r.quantity_on_hand ?? 0) <= (r.reorder_level ?? 0));
    if (branchId) rows = rows.filter(r => r.branch_id === branchId);
    return serviceOk(rows, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed.', { requestId }); }
}

export async function getRecentSales(
  ctx: UserContext,
  branchId?: UUID,
  limit = 10
): Promise<ServiceResponse<Array<Record<string, unknown>>>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'sales', 'view')) return serviceFail('PERMISSION_DENIED', 'Permission denied.', { requestId });
  try {
    let q = supabase.schema('imagecare').from('sales')
      .select('id, sale_number, total_amount, payment_method, status, created_at, customer_id, branch_id')
      .eq('business_id', ctx.business_id).eq('status', 'confirmed').is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(limit);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed.', { requestId });
    return serviceOk((data ?? []) as Record<string, unknown>[], requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed.', { requestId }); }
}

// ============================================================
// Stage 5 Final: COGS and Revenue from journal_lines for correct P&L
// ============================================================

export async function getPLSummary(
  ctx: UserContext,
  branchId?: UUID
): Promise<ServiceResponse<{ revenue: number; cogs: number; expenses: number; grossProfit: number; netProfit: number }>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'journal', 'view')) return serviceFail('PERMISSION_DENIED', 'Permission denied.', { requestId });
  try {
    // Query journal_lines directly to get actual P&L figures
    // Revenue = sum of credit_amount on account 4000
    // COGS    = sum of debit_amount on account 5000
    // Expenses= sum of debit_amount on account 6000
    let q = supabase.schema('imagecare').from('journal_lines')
      .select('account_code, debit_amount, credit_amount, branch_id')
      .eq('business_id', ctx.business_id)
      .in('account_code', ['4000', '5000', '6000']);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load P&L data.', { requestId });
    const rows = (data ?? []) as Array<{ account_code: string; debit_amount: number; credit_amount: number }>;
    const revenue  = rows.filter(r => r.account_code === '4000').reduce((s, r) => s + (r.credit_amount ?? 0), 0);
    const cogs     = rows.filter(r => r.account_code === '5000').reduce((s, r) => s + (r.debit_amount  ?? 0), 0);
    const expenses = rows.filter(r => r.account_code === '6000').reduce((s, r) => s + (r.debit_amount  ?? 0), 0);
    const grossProfit = revenue - cogs;
    const netProfit   = grossProfit - expenses;
    return serviceOk({ revenue, cogs, expenses, grossProfit, netProfit }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load P&L data.', { requestId }); }
}
