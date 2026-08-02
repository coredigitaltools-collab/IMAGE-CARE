import { Layers } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { BranchOverviewTabs } from '../../components/branchOverview/BranchOverviewTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useBranchOverview } from '../../features/branchOverview/hooks/useBranchOverviewData'

export function InventoryByBranchPage() {
  const overviewQuery = useBranchOverview()
  const rows = overviewQuery.data ?? []
  const hasActivity = rows.some((r) => r.stockInUnits > 0 || r.stockOutUnits > 0)

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Branch Overview' }]} />
      <BranchOverviewTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Inventory by Branch</h1>
        <p className="mt-0.5 text-sm text-ink-500">Stock movement by branch, all-time.</p>
      </div>

      <div className="mb-4 rounded-md bg-ink-50 px-3 py-2.5 text-xs text-ink-500">
        Stock on hand is tracked business-wide, not split per branch, so this shows movement (what came in and went out at each branch) rather than
        a per-branch stock count.
      </div>

      <Card className="p-5">
        {overviewQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !hasActivity ? (
          <EmptyState icon={Layers} title="No branch stock activity yet" description="This fills in once stock moves at a branch." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((row) => (
              <li key={row.branchId} className="py-3 text-sm">
                <p className="mb-1.5 font-medium text-ink-900">{row.branchName}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-ink-500">Stock in</p>
                    <p className="text-success-700">{row.stockInUnits} units</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-500">Stock out</p>
                    <p className="text-brand-red-700">{row.stockOutUnits} units</p>
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
