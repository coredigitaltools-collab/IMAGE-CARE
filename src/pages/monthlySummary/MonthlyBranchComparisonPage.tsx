import { Building2 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { MonthlySummaryTabs } from '../../components/monthlySummary/MonthlySummaryTabs'
import { MonthPicker, useSelectedMonth } from '../../components/monthlySummary/MonthPicker'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useMonthlyBranchComparison } from '../../features/monthlySummary/hooks/useMonthlySummaryData'

export function MonthlyBranchComparisonPage() {
  const [month, setMonth] = useSelectedMonth()
  const branchQuery = useMonthlyBranchComparison(month)
  const rows = branchQuery.data ?? []
  const hasActivity = rows.some((r) => r.transactionCount > 0)

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Monthly Summary' }]} />
      <MonthlySummaryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Branch Comparison</h1>
          <p className="mt-0.5 text-sm text-ink-500">Sales revenue by branch for the selected month.</p>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      <Card className="p-5">
        {branchQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !hasActivity ? (
          <EmptyState icon={Building2} title="No branch sales this month" description="Sales are attributed to a branch at checkout." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((row) => (
              <li key={row.branchId} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium text-ink-900">{row.branchName}</p>
                  <p className="text-xs text-ink-500">
                    {row.transactionCount} transaction{row.transactionCount === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="font-semibold text-ink-900">{formatCurrency(row.salesUgx, 'UGX')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
