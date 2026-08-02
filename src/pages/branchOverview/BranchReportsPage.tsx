import { BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { BranchOverviewTabs } from '../../components/branchOverview/BranchOverviewTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useBranchOverview } from '../../features/branchOverview/hooks/useBranchOverviewData'

export function BranchReportsPage() {
  const overviewQuery = useBranchOverview()
  const rows = [...(overviewQuery.data ?? [])].sort((a, b) => b.totalSalesUgx - a.totalSalesUgx)

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Branch Overview' }]} />
      <BranchOverviewTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Branch Reports</h1>
        <p className="mt-0.5 text-sm text-ink-500">Sales and stock movement, side by side, for every branch you have access to.</p>
      </div>

      <Card className="p-5">
        {overviewQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState icon={BarChart3} title="No branches to report on" description="This fills in once branches have sales or stock activity." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-500">
                  <th className="pb-2 font-medium">Branch</th>
                  <th className="pb-2 text-right font-medium">Sales</th>
                  <th className="pb-2 text-right font-medium">Transactions</th>
                  <th className="pb-2 text-right font-medium">Stock in</th>
                  <th className="pb-2 text-right font-medium">Stock out</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.branchId} className="border-t border-ink-100">
                    <td className="py-2.5 font-medium text-ink-900">{row.branchName}</td>
                    <td className="py-2.5 text-right text-ink-900">{formatCurrency(row.totalSalesUgx, 'UGX')}</td>
                    <td className="py-2.5 text-right text-ink-700">{row.transactionCount}</td>
                    <td className="py-2.5 text-right text-success-700">{row.stockInUnits}</td>
                    <td className="py-2.5 text-right text-brand-red-700">{row.stockOutUnits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
