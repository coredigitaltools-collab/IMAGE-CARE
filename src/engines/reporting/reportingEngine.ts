// ============================================================
// ImageCare ERP - Stage 3: Reporting Engine
// File: src/engines/reporting/reportingEngine.ts
// Purpose: Authoritative shared KPI and report calculations.
//
// RULES:
//   Reads authoritative transaction and accounting data.
//   NOT a second source of truth.
//   Net Profit = Gross Profit - Expenses (not Sales - Expenses).
//   Cash in Hand comes from cash_transactions, not profit.
//   Stock value uses cost price, never selling price.
//   Same calculation produces same result everywhere.
// ============================================================

import { db } from '../../lib/db';
import type { UUID } from '../../types/database';
import type {
  EngineContext, EngineResult, KpiSummary, StockAlert, ReportingPeriod,
} from '../types';
import { engineOk, engineFail, makeError } from '../types';

export class ReportingEngine {

  // ---- getKpis --------------------------------------------
  // Single authoritative KPI calculation.
  // Revenue: from confirmed sales (not accounting estimates).
  // COGS: from sale_items.unit_cost (cost snapshot at sale time).
  // Gross Profit = Revenue - COGS.
  // Net Profit = Gross Profit - Expenses - Payroll.
  // Cash in Hand: from cash_transactions (not profit).
  // Outstanding Credit: from credit_accounts.

  async getKpis(
    ctx: EngineContext,
    period: ReportingPeriod,
    branchId?: UUID,
  ): Promise<EngineResult<KpiSummary>> {
    const { from_date, to_date } = period;

    // Revenue and COGS from confirmed sales
    let salesQuery = db.sales()
      
      .select('id, total_amount')
      .eq('business_id', ctx.business_id)
      .eq('status', 'confirmed')
      .is('deleted_at', null)
      .gte('sale_date', from_date)
      .lte('sale_date', to_date);

    if (branchId) salesQuery = salesQuery.eq('branch_id', branchId);

    const { data: salesData, error: salesErr } = await salesQuery;
    if (salesErr) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to calculate revenue.', salesErr.message));
    }

    const saleIds = (salesData ?? []).map((s: Record<string, unknown>) => s.id as string);
    const revenue = (salesData ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.total_amount), 0);

    // COGS from sale_items (unit_cost is a snapshot at time of sale)
    let cogs = 0;
    if (saleIds.length > 0) {
      const { data: cogsData, error: cogsErr } = await db.sale_items()
        
        .select('quantity, unit_cost')
        .in('sale_id', saleIds)
        .eq('business_id', ctx.business_id);

      if (cogsErr) {
        return engineFail(makeError('DATABASE_ERROR', 'Failed to calculate COGS.', cogsErr.message));
      }

      cogs = (cogsData ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.quantity) * Number(r.unit_cost), 0);
    }

    const grossProfit = revenue - cogs;

    // Expenses (confirmed)
    let expQuery = db.expenses()
      
      .select('total_amount')
      .eq('business_id', ctx.business_id)
      .eq('status', 'confirmed')
      .is('deleted_at', null)
      .gte('expense_date', from_date)
      .lte('expense_date', to_date);

    if (branchId) expQuery = expQuery.eq('branch_id', branchId);
    const { data: expData } = await expQuery;
    const expenses = (expData ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.total_amount), 0);

    // Payroll (paid)
    let payQuery = db.payroll()
      
      .select('net_pay')
      .eq('business_id', ctx.business_id)
      .eq('status', 'paid')
      .is('deleted_at', null)
      .gte('pay_date', from_date.split('T')[0])
      .lte('pay_date', to_date.split('T')[0]);

    if (branchId) payQuery = payQuery.eq('branch_id', branchId);
    const { data: payData } = await payQuery;
    const payroll = (payData ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.net_pay), 0);

    // Net Profit = Gross Profit - Expenses - Payroll
    // NOT: Revenue - Expenses (which ignores COGS)
    const netProfit = grossProfit - expenses - payroll;

    // Cash in Hand from cash_transactions (NOT from profit or revenue)
    let cashQuery = db.cash_transactions()
      
      .select('transaction_type, amount')
      .eq('business_id', ctx.business_id)
      .eq('status', 'confirmed')
      .is('deleted_at', null);

    if (branchId) cashQuery = cashQuery.eq('branch_id', branchId);
    const { data: cashData } = await cashQuery;

    let cashIn  = 0;
    let cashOut = 0;
    for (const row of (cashData ?? []) as Array<Record<string, unknown>>) {
      const amt = Number(row.amount);
      if (['cash_in', 'deposit'].includes(String(row.transaction_type)))    cashIn  += amt;
      if (['cash_out', 'withdrawal'].includes(String(row.transaction_type))) cashOut += amt;
    }
    const cashInHand = cashIn - cashOut;

    // Outstanding credit (all time - unpaid receivables)
    let creditQuery = db.credit_accounts()
      
      .select('current_balance')
      .eq('business_id', ctx.business_id)
      .eq('is_active', true)
      .not('customer_id', 'is', null)
      .is('deleted_at', null);

    if (branchId) creditQuery = creditQuery.eq('branch_id', branchId);
    const { data: creditData } = await creditQuery;
    const outstandingCredit = (creditData ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.current_balance), 0);

    return engineOk({
      revenue,
      cogs,
      gross_profit:       grossProfit,
      expenses:           expenses + payroll,
      net_profit:         netProfit,
      cash_in_hand:       cashInHand,
      outstanding_credit: outstandingCredit,
      sale_count:         saleIds.length,
    });
  }

  // ---- getLowStockAlerts ----------------------------------
  // Stock value uses reorder_level thresholds, never selling price.

  async getLowStockAlerts(
    ctx: EngineContext,
    branchId?: UUID,
  ): Promise<EngineResult<StockAlert[]>> {
    let query = db.vw_stock_summary()
      
      .select('product_id, product_name, sku, branch_id, quantity_on_hand, reorder_level, stock_status')
      .eq('business_id', ctx.business_id)
      .in('stock_status', ['low_stock', 'out_of_stock']);

    if (branchId) query = query.eq('branch_id', branchId);

    const { data, error } = await query;
    if (error) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to query stock alerts.', error.message));
    }

    return engineOk(
      (data ?? []).map((d: Record<string, unknown>) => ({
        product_id:       d.product_id as UUID,
        product_name:     d.product_name as string,
        sku:              d.sku as string | null,
        branch_id:        d.branch_id as UUID,
        quantity_on_hand: Number(d.quantity_on_hand ?? 0),
        reorder_level:    Number(d.reorder_level ?? 0),
        stock_status:     d.stock_status as string,
      }))
    );
  }

  // ---- getSalesSummary ------------------------------------

  async getSalesSummary(
    ctx: EngineContext,
    period: ReportingPeriod,
    branchId?: UUID,
  ): Promise<EngineResult<{ total_revenue: number; total_sales: number; average_sale: number }>> {
    let query = db.sales()
      
      .select('total_amount')
      .eq('business_id', ctx.business_id)
      .eq('status', 'confirmed')
      .is('deleted_at', null)
      .gte('sale_date', period.from_date)
      .lte('sale_date', period.to_date);

    if (branchId) query = query.eq('branch_id', branchId);

    const { data, error } = await query;
    if (error) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to summarise sales.', error.message));
    }

    const rows = data ?? [];
    const total_revenue = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.total_amount), 0);
    const total_sales   = rows.length;

    return engineOk({
      total_revenue,
      total_sales,
      average_sale: total_sales > 0 ? total_revenue / total_sales : 0,
    });
  }
}

export const reportingEngine = new ReportingEngine();
