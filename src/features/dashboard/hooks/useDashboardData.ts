// Stage 5: Dashboard hooks - rewired to Stage 4 reporting service.
import { useQuery } from '@tanstack/react-query';
import { useUserContext, useActiveBranch } from '../../../context/AppContext';
import { getDashboardKPIs, getLowStockAlerts, getRecentSales } from '../../../services/reporting/reportingService';
import type { SupportedCurrency } from '../../../lib/currency';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error');
  const d = r.data;
  if (d === null || d === undefined) return {};
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string,unknown>).items))
    return (d as Record<string,unknown>).items;
  return d;
}

export function useDashboardSummary(_branchId?: string, _currency?: SupportedCurrency) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const to   = now.toISOString().split('T')[0];
  return useQuery({
    queryKey: ['dashboard-summary', ctx.business_id, branch],
    queryFn: () => getDashboardKPIs(ctx, branch ?? undefined, { from, to }).then(unwrap),
    refetchInterval: 60_000,
  });
}

export function useLowStockItems(_branchId?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  return useQuery({
    queryKey: ['low-stock', ctx.business_id, branch],
    queryFn: () => getLowStockAlerts(ctx, branch ?? undefined).then(unwrap),
    refetchInterval: 5 * 60_000,
  });
}

export function useRecentSales(_branchId?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  return useQuery({
    queryKey: ['recent-sales', ctx.business_id, branch],
    queryFn: () => getRecentSales(ctx, branch ?? undefined).then(unwrap),
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
