import { useQuery } from '@tanstack/react-query'
import { getDashboardSummary, getLowStockItems, getRecentSales, getSyncStatus } from '../../../services/dashboardService'

export function useDashboardSummary(branchId: string) {
  return useQuery({
    queryKey: ['dashboard-summary', branchId],
    queryFn: () => getDashboardSummary(branchId),
    refetchInterval: 60_000,
  })
}

export function useLowStockItems(branchId: string) {
  return useQuery({
    queryKey: ['low-stock', branchId],
    queryFn: () => getLowStockItems(branchId),
  })
}

export function useRecentSales(branchId: string) {
  return useQuery({
    queryKey: ['recent-sales', branchId],
    queryFn: () => getRecentSales(branchId),
  })
}

export function useSyncStatus() {
  return useQuery({
    queryKey: ['sync-status'],
    queryFn: getSyncStatus,
    refetchInterval: 30_000,
  })
}
