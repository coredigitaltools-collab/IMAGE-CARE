// ============================================================
// IMC-BLD-001 | ImageCare ERP Application Architecture v1.0
// File: src/services/reporting/reportingService.ts
// Purpose: Shared reporting service.
//          All dashboard KPIs and report data come through here.
//          Pages must never calculate KPIs independently.
//          Uses the shared DB-003/DB-006 reporting engine.
//
// KNOWN GAP (Phase 12 E2E finding, not yet fixed - lower priority than the
// KPI/cash-position/P&L fixes below because no core-9 workflow depends on
// them): getSalesByPeriod, getTopProducts, getOutstandingCredit, and
// getExpenseBreakdown still call RPCs (fn_get_sales_by_period,
// fn_get_top_products, fn_get_outstanding_credit_summary,
// fn_get_expense_breakdown) that do not exist live. They fail safely
// (return a real error, not fake data) rather than being deleted, so the
// calling pages (Top Products, Sales-by-Period charts, Credit Aging,
// Expense Breakdown) surface a clear error instead of silently showing
// nothing. Fixing these the same way getDashboardKPIs/getCashPosition/
// getPLSummary were fixed is straightforward follow-up work.
// ============================================================

import { supabase, rpc } from '../../lib/supabase';
import { ok, fail, parseError } from '../../types/app';
import type { ApiResult, UserContext, DateRange } from '../../types/app';
import type { UUID, DashboardKPIs, StockSummaryRow } from '../../types/database';
import { canDo } from '../../types/app';

// ---- Dashboard KPIs ----------------------------------------

// Bug fix (found during Phase 12 E2E verification): getDashboardKPIs and
// getCashPosition below both called RPCs - fn_get_dashboard_kpis and
// fn_get_cash_position - that do not exist in any tracked migration or in
// the live schema (confirmed live against the Supabase project). Since
// getDashboardKPIs is the single KPI source for the Dashboard, Daily/
// Monthly/Annual Summary, Sales Targets, and Branch Overview pages (every
// one of them imports it from this file), this meant the entire reporting
// layer of the app returned a hard error on every load. Both functions
// are rewritten below to compute the same figures from real tables
// (sales, journal_entries/journal_lines, cash_transactions,
// credit_accounts) - the same tables/columns the engines in src/engines
// already write to, so no new schema or RPC is introduced.

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

    // Sale count for the period.
    let saleQuery = supabase.schema('imagecare').from('sales')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', ctx.business_id)
      .eq('status', 'confirmed')
      .is('deleted_at', null)
      .gte('sale_date', from)
      .lte('sale_date', to);
    if (branchId) saleQuery = saleQuery.eq('branch_id', branchId);
    const { count: saleCount, error: saleErr } = await saleQuery;
    if (saleErr) return fail(parseError(saleErr));

    // Revenue/COGS/expenses/payroll all come from posted journal entries
    // in the period - the same source of truth getPLSummary() below uses.
    let jeQuery = supabase.schema('imagecare').from('journal_entries')
      .select('id')
      .eq('business_id', ctx.business_id)
      .eq('status', 'posted')
      .gte('entry_date', from)
      .lte('entry_date', to);
    if (branchId) jeQuery = jeQuery.eq('branch_id', branchId);
    const { data: entries, error: jeErr } = await jeQuery;
    if (jeErr) return fail(parseError(jeErr));

    const entryIds = (entries ?? []).map((e) => e.id as string);
    let revenue = 0, cogs = 0, expenses = 0, payroll = 0;
    if (entryIds.length > 0) {
      const { data: lines, error: linesErr } = await supabase.schema('imagecare').from('journal_lines')
        .select('account_code, account_type, debit_amount, credit_amount')
        .in('journal_entry_id', entryIds);
      if (linesErr) return fail(parseError(linesErr));
      for (const l of (lines ?? []) as Array<{ account_code: string; account_type: string; debit_amount: number; credit_amount: number }>) {
        const debit  = Number(l.debit_amount  ?? 0);
        const credit = Number(l.credit_amount ?? 0);
        // Account 5000 (COGS) and 6400 (Salaries and Wages) are both
        // account_type='expense' in the chart of accounts, so they must be
        // pulled out by code before bucketing the rest as "expenses" -
        // otherwise COGS/payroll would double-count into expenses too.
        if (l.account_type === 'revenue') revenue += credit;
        else if (l.account_code === '5000') cogs += debit;
        else if (l.account_code === '6400') payroll += debit;
        else if (l.account_type === 'expense') expenses += debit;
      }
    }
    const grossProfit = revenue - cogs;
    const netProfit    = grossProfit - expenses - payroll;

    // Cash in hand and credit outstanding are running balances "as of now",
    // not scoped to the requested date range - see useDailySummaryData.ts's
    // useDailyCashSummary: "Cash in Hand is independent of Profit".
    const cashPosResult = await getCashPosition(ctx, branchId);
    const cashInHand = cashPosResult.success ? cashPosResult.data!.net_position : 0;

    let creditQuery = supabase.schema('imagecare').from('credit_accounts')
      .select('current_balance')
      .eq('business_id', ctx.business_id)
      .eq('is_active', true)
      .is('deleted_at', null);
    if (branchId) creditQuery = creditQuery.eq('branch_id', branchId);
    const { data: creditRows, error: creditErr } = await creditQuery;
    if (creditErr) return fail(parseError(creditErr));
    const creditOutstanding = (creditRows ?? []).reduce((s, r) => s + Number((r as { current_balance: number }).current_balance ?? 0), 0);

    const kpis: DashboardKPIs = {
      period_from:        from,
      period_to:          to,
      sale_count:         saleCount ?? 0,
      revenue,
      cogs,
      gross_profit:       grossProfit,
      expenses,
      payroll,
      net_profit:         netProfit,
      cash_in_hand:       cashInHand,
      credit_outstanding: creditOutstanding,
    };
    return ok(kpis);
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
    // See the fix-note above getDashboardKPIs: fn_get_cash_position does
    // not exist. Running balance (all-time, not date-scoped - this is a
    // point-in-time position, same convention as cashEngine.getCashBalance)
    // computed directly from cash_transactions.
    let query = supabase.schema('imagecare').from('cash_transactions')
      .select('transaction_type, amount, payment_method')
      .eq('business_id', ctx.business_id)
      .eq('status', 'confirmed')
      .is('deleted_at', null);
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query;
    if (error) return fail(parseError(error));

    let cashIn = 0, cashOut = 0;
    const byMethod: Record<string, number> = {};
    for (const row of (data ?? []) as Array<{ transaction_type: string; amount: number; payment_method: string | null }>) {
      const amt = Number(row.amount ?? 0);
      const isIn = row.transaction_type === 'cash_in' || row.transaction_type === 'deposit';
      if (isIn) cashIn += amt; else cashOut += amt;
      const method = row.payment_method ?? 'unknown';
      byMethod[method] = (byMethod[method] ?? 0) + (isIn ? amt : -amt);
    }

    return ok({ cash_in: cashIn, cash_out: cashOut, net_position: cashIn - cashOut, by_method: byMethod });
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
    // Two bugs fixed here (found during Phase 12 E2E verification):
    //   1. `.eq('branch_id', branchId)` was applied directly to
    //      journal_lines, but that table has no branch_id column (only
    //      journal_entries does) - this threw a Postgrest "column does not
    //      exist" error on every call with a branch filter. Branch
    //      filtering now goes through journal_entries first.
    //   2. Expenses were hardcoded to account_code = '6000' only. Payroll
    //      (businessEngine.recordPayroll) always posts its expense line to
    //      6400, not 6000, so any business running payroll had its salary
    //      cost silently excluded from Net Profit, overstating profit.
    //      Expenses are now every account_type='expense' line except 5000
    //      (COGS, tracked separately) - correct regardless of which
    //      specific expense sub-account (6000/6100.../6400/7000) a given
    //      posting used.
    let jeQuery = supabase.schema('imagecare').from('journal_entries')
      .select('id')
      .eq('business_id', ctx.business_id)
      .eq('status', 'posted');
    if (branchId) jeQuery = jeQuery.eq('branch_id', branchId);
    const { data: entries, error: jeErr } = await jeQuery;
    if (jeErr) return serviceFail('INTERNAL_ERROR', 'Failed to load P&L data.', { requestId });

    const entryIds = (entries ?? []).map((e) => e.id as string);
    let revenue = 0, cogs = 0, expenses = 0;
    if (entryIds.length > 0) {
      const { data, error } = await supabase.schema('imagecare').from('journal_lines')
        .select('account_code, account_type, debit_amount, credit_amount')
        .in('journal_entry_id', entryIds);
      if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load P&L data.', { requestId });
      const rows = (data ?? []) as Array<{ account_code: string; account_type: string; debit_amount: number; credit_amount: number }>;
      for (const r of rows) {
        const debit  = Number(r.debit_amount  ?? 0);
        const credit = Number(r.credit_amount ?? 0);
        if (r.account_type === 'revenue') revenue += credit;
        else if (r.account_code === '5000') cogs += debit;
        else if (r.account_type === 'expense') expenses += debit;
      }
    }
    const grossProfit = revenue - cogs;
    const netProfit   = grossProfit - expenses;
    return serviceOk({ revenue, cogs, expenses, grossProfit, netProfit }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load P&L data.', { requestId }); }
}
