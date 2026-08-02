import { useQuery } from '@tanstack/react-query'
import * as dailySummaryService from '../../../services/dailySummaryService'
import { getCurrentSnapshot } from '../../../services/monthlySummaryService'
import type { SupportedCurrency } from '../../../lib/currency'

export function useDailyFinancials(dateStr: string) {
  return useQuery({ queryKey: ['daily-summary', 'financials', dateStr], queryFn: () => dailySummaryService.getDailyFinancials(dateStr) })
}

export function useDailySalesSummary(dateStr: string) {
  return useQuery({ queryKey: ['daily-summary', 'sales', dateStr], queryFn: () => dailySummaryService.getDailySalesSummary(dateStr) })
}

export function useDailyCashSummary(dateStr: string) {
  return useQuery({ queryKey: ['daily-summary', 'cash', dateStr], queryFn: () => dailySummaryService.getDailyCashSummary(dateStr) })
}

// Inventory value, low stock, and out of stock are running counts, the
// same "as of now" snapshot Monthly and Annual Summary already read.
export function useCurrentSnapshotForDaily(currency: SupportedCurrency) {
  return useQuery({ queryKey: ['daily-summary', 'snapshot', currency], queryFn: () => getCurrentSnapshot(currency) })
}
