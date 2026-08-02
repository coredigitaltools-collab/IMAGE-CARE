import { useQuery } from '@tanstack/react-query'
import * as monthlySummaryService from '../../../services/monthlySummaryService'
import type { SupportedCurrency } from '../../../lib/currency'

export function useMonthlyFinancials(monthStr: string) {
  return useQuery({ queryKey: ['monthly-summary', 'financials', monthStr], queryFn: () => monthlySummaryService.getMonthlyFinancials(monthStr) })
}

export function useMonthlySalesSummary(monthStr: string) {
  return useQuery({
    queryKey: ['monthly-summary', 'sales', monthStr],
    queryFn: () => monthlySummaryService.getMonthlySalesSummary(monthStr),
  })
}

export function useMonthlyCashFlowSummary(monthStr: string) {
  return useQuery({
    queryKey: ['monthly-summary', 'cash-flow', monthStr],
    queryFn: () => monthlySummaryService.getMonthlyCashFlowSummary(monthStr),
  })
}

export function useMonthlyBranchComparison(monthStr: string) {
  return useQuery({
    queryKey: ['monthly-summary', 'branches', monthStr],
    queryFn: () => monthlySummaryService.getMonthlyBranchComparison(monthStr),
  })
}

export function useCurrentSnapshot(currency: SupportedCurrency) {
  return useQuery({ queryKey: ['monthly-summary', 'snapshot', currency], queryFn: () => monthlySummaryService.getCurrentSnapshot(currency) })
}
