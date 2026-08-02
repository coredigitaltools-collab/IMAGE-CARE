import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { StockSummaryTabs } from '../../components/stockSummary/StockSummaryTabs'
import { Card } from '../../components/ui/Card'
import { CurrencySelector } from '../../components/dashboard/CurrencySelector'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useBranchComparison } from '../../features/stockSummary/hooks/useStockSummaryData'
import type { SupportedCurrency } from '../../lib/currency'

export function BranchComparisonPage() {
  const [currency, setCurrency] = useState<SupportedCurrency>('UGX')
  const comparisonQuery = useBranchComparison(currency)
  const rows = comparisonQuery.data ?? []

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Stock Summary' }]} />
      <StockSummaryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Branch Comparison</h1>
          <p className="mt-0.5 text-sm text-ink-500">Stock movement activity by branch, all-time.</p>
        </div>
        <CurrencySelector selected={currency} onChange={setCurrency} />
      </div>

      <div className="mb-4 rounded-md bg-ink-50 px-3 py-2.5 text-xs text-ink-500">
        Stock on hand is tracked business-wide in this version of the app, not split per branch, so this compares stock movement (what came in and
        went out at each branch) rather than a per-branch stock count.
      </div>

      <Card className="p-5">
        {comparisonQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState icon={Building2} title="No branch activity yet" description="This fills in once stock moves at a branch." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((row) => (
              <li key={row.branchId} className="py-3 text-sm">
                <p className="mb-1.5 font-medium text-ink-900">{row.branchName}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-ink-500">Stock in</p>
                    <p className="text-success-700">
                      {row.stockInUnits} units, {formatCurrency(row.stockInValue, currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-500">Stock out</p>
                    <p className="text-brand-red-700">
                      {row.stockOutUnits} units, {formatCurrency(row.stockOutValue, currency)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
