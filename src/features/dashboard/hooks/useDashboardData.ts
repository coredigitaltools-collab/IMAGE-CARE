// Stage 5: Dashboard hooks - rewired to Stage 4 reporting service.
import { useQuery } from '@tanstack/react-query';
import { useUserContext, useActiveBranch } from '../../../context/AppContext';
import { getDashboardKPIs, getLowStockAlerts, getRecentSales } from '../../../services/reporting/reportingService';
import { listCustomers } from '../../../services/masterData/masterDataService';
import { startOfDay, endOfDay } from '../../../utils/formatters';
import { convertFromUgx } from '../../../lib/currency';
import type { SupportedCurrency } from '../../../lib/currency';
import type { DashboardKPIs } from '../../../types/database';
import type { DashboardSummary, LowStockItem, RecentSale } from '../../../types/domain';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error');
  const d = r.data;
  if (d === null || d === undefined) return {};
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string,unknown>).items))
    return (d as Record<string,unknown>).items;
  return d;
}

// getDashboardKPIs returns the real, snake_case DashboardKPIs shape used
// everywhere else in the app (see useDailySummaryData.ts's mapKpisToFinancials
// for the same pattern). KpiGrid/DashboardSummary use a different, camelCase
// shape - this was never adapted because this whole page was unwired
// scaffolding (src/features/dashboard/DashboardPage.tsx, the Stage 1
// placeholder, was what the router actually served) until it was connected
// today. Without this mapping every KPI card reads an undefined field and
// formatCurrency(undefined, ...) prints "<code>NaN".
function mapKpisToSummary(kpis: DashboardKPIs, branchId: string, currency: SupportedCurrency): DashboardSummary {
  const toDisplay = (ugx: number) => Math.round(convertFromUgx(ugx, currency));
  return {
    branchId,
    todaysSales: toDisplay(kpis.revenue),
    todaysCogs: toDisplay(kpis.cogs),
    grossProfit: toDisplay(kpis.gross_profit),
    // Real DashboardKPIs also carries a separate `payroll` figure with no
    // field here; matches the same non-payroll "expenses" convention
    // useDailySummaryData.ts's mapKpisToFinancials already uses.
    todaysExpenses: toDisplay(kpis.expenses),
    netProfit: toDisplay(kpis.net_profit),
    cashInHand: toDisplay(kpis.cash_in_hand),
    outstandingCredit: toDisplay(kpis.credit_outstanding),
    currency,
    asOf: new Date().toISOString(),
  };
}

export function useDashboardSummary(branchId?: string, currency: SupportedCurrency = 'UGX') {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  return useQuery({
    queryKey: ['dashboard-summary', ctx.business_id, branch, currency],
    queryFn: async () => {
      const from = startOfDay();
      const to = endOfDay();
      const kpis = (await getDashboardKPIs(ctx, branch ?? undefined, { from, to }).then(unwrap)) as DashboardKPIs;
      return mapKpisToSummary(kpis, branchId ?? 'all', currency);
    },
    refetchInterval: 60_000,
  });
}

export function useLowStockItems(_branchId?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  return useQuery({
    queryKey: ['low-stock', ctx.business_id, branch],
    queryFn: async () => {
      const rows = (await getLowStockAlerts(ctx, branch ?? undefined).then(unwrap)) as Array<{
        product_id: string; product_name: string; quantity_on_hand: number; reorder_level: number; branch_id?: string
      }>;
      return rows.map((r): LowStockItem => ({
        id: r.product_id,
        name: r.product_name,
        quantityRemaining: r.quantity_on_hand,
        reorderLevel: r.reorder_level,
        branchId: r.branch_id ?? 'all',
      }));
    },
    refetchInterval: 5 * 60_000,
  });
}

export function useRecentSales(_branchId?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  return useQuery({
    queryKey: ['recent-sales', ctx.business_id, branch],
    queryFn: async () => {
      // Neither read depends on the other's result - run them together.
      const [rows, customers] = await Promise.all([
        getRecentSales(ctx, branch ?? undefined).then(unwrap) as Promise<Array<{
          id: string; sale_number: string; total_amount: number; status: string; created_at: string; customer_id: string | null; branch_id: string
        }>>,
        listCustomers(ctx).then((r) => (r.error ? [] : r.data ?? [])) as Promise<Array<{ id: string; name: string }>>,
      ]);
      const nameById = new Map(customers.map((c) => [c.id, c.name]));
      return rows.map((r): RecentSale => ({
        id: r.id,
        reference: r.sale_number,
        // Walk-in sales (POS redesign made a customer optional) have no
        // customer_id at all, not a name to look up.
        customerName: r.customer_id ? (nameById.get(r.customer_id) ?? 'Unknown customer') : 'Walk-in customer',
        amount: r.total_amount,
        // Every sale is recorded and posted in UGX, the app's one ledger
        // currency (see src/lib/currency.ts) - only the dashboard's own
        // display total gets converted to the selected reporting currency.
        currency: 'UGX',
        // getRecentSales only ever queries status='confirmed' rows.
        status: 'completed',
        createdAt: r.created_at,
        branchId: r.branch_id,
      }));
    },
    refetchInterval: 60_000,
  });
}

export function useSyncStatus() {
  return useQuery({
    queryKey: ['sync-status'],
    queryFn: async () => ({ lastSynced: new Date().toISOString(), status: 'synced' }),
    staleTime: Infinity,
  });
}
