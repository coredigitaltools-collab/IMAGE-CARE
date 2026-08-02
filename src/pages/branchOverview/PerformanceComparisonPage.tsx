import { GitCompare, Crown } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { BranchOverviewTabs } from '../../components/branchOverview/BranchOverviewTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useBranchOverview } from '../../features/branchOverview/hooks/useBranchOverviewData'

export function PerformanceComparisonPage() {
  const overviewQuery = useBranchOverview()
  const rows = [...(overviewQuery.data ?? [])].sort((a, b) => b.totalSalesUgx - a.totalSalesUgx)
  const hasActivity = rows.some((r) => r.transactionCount > 0)

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Branch Overview' }]} />
      <BranchOverviewTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Performance Comparison</h1>
        <p className="mt-0.5 text-sm text-ink-500">Branches ranked by all-time sales.</p>
      </div>

      <Card className="p-5">
        {overviewQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !hasActivity ? (
          <EmptyState icon={GitCompare} title="No sales recorded yet" description="Sales are attributed to a branch at checkout." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((row, i) => (
              <li key={row.branchId} className="flex items-center justify-between py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  {i === 0 && row.totalSalesUgx > 0 && <Crown size={14} className="text-warning-500" />}
                  <div>
                    <p className="font-medium text-ink-900">{row.branchName}</p>
                    <p className="text-xs text-ink-500">
                      {row.transactionCount} transaction{row.transactionCount === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <span className="font-semibold text-ink-900">{formatCurrency(row.totalSalesUgx, 'UGX')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
