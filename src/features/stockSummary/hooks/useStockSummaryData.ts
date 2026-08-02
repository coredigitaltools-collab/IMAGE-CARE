import { useQuery } from '@tanstack/react-query'
import * as stockSummaryService from '../../../services/stockSummaryService'
import type { SupportedCurrency } from '../../../lib/currency'

export function useStockSummaryDashboardKpis(currency: SupportedCurrency) {
  return useQuery({
    queryKey: ['stock-summary', 'kpis', currency],
    queryFn: () => stockSummaryService.getStockSummaryDashboardKpis(currency),
  })
}

export function useBranchComparison(currency: SupportedCurrency) {
  return useQuery({
    queryKey: ['stock-summary', 'branch-comparison', currency],
    queryFn: () => stockSummaryService.getBranchComparison(currency),
  })
}

export function useCurrentStockSummary() {
  return useQuery({ queryKey: ['stock-summary', 'current-stock'], queryFn: stockSummaryService.getCurrentStockSummary })
}
