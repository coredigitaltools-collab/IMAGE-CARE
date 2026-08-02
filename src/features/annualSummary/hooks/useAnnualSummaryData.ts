import { useQuery } from '@tanstack/react-query'
import * as annualSummaryService from '../../../services/annualSummaryService'
import { getCurrentSnapshot } from '../../../services/monthlySummaryService'
import type { SupportedCurrency } from '../../../lib/currency'

export function useAnnualFinancials(year: number) {
  return useQuery({ queryKey: ['annual-summary', 'financials', year], queryFn: () => annualSummaryService.getAnnualFinancials(year) })
}

export function useAnnualSalesSummary(year: number) {
  return useQuery({ queryKey: ['annual-summary', 'sales', year], queryFn: () => annualSummaryService.getAnnualSalesSummary(year) })
}

export function useAnnualCashFlowSummary(year: number) {
  return useQuery({ queryKey: ['annual-summary', 'cash-flow', year], queryFn: () => annualSummaryService.getAnnualCashFlowSummary(year) })
}

export function useAnnualBranchComparison(year: number) {
  return useQuery({ queryKey: ['annual-summary', 'branches', year], queryFn: () => annualSummaryService.getAnnualBranchComparison(year) })
}

export function useYearOverYearComparison(year: number) {
  return useQuery({ queryKey: ['annual-summary', 'yoy', year], queryFn: () => annualSummaryService.getYearOverYearComparison(year) })
}

// Cash in Hand, Outstanding Credit, and Inventory Value are running
// balances, exactly the same "as of now" snapshot Monthly Summary
// already reads. Reused directly rather than recomputed.
export function useCurrentSnapshotForAnnual(currency: SupportedCurrency) {
  return useQuery({ queryKey: ['annual-summary', 'snapshot', currency], queryFn: () => getCurrentSnapshot(currency) })
}
