import { Building2, Crown } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { AnnualSummaryTabs } from '../../components/annualSummary/AnnualSummaryTabs'
import { YearPicker } from '../../components/annualSummary/YearPicker'
import { useSelectedYear } from '../../components/annualSummary/useSelectedYear'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useAnnualBranchComparison } from '../../features/annualSummary/hooks/useAnnualSummaryData'

export function AnnualBranchPerformancePage() {
  const [year, setYear] = useSelectedYear()
  const branchQuery = useAnnualBranchComparison(year)
  const rows = branchQuery.data ?? []
  const hasActivity = rows.some((r) => r.transactionCount > 0)

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Annual Summary' }]} />
      <AnnualSummaryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Branch Performance</h1>
          <p className="mt-0.5 text-sm text-ink-500">Sales revenue by branch for {year}.</p>
        </div>
        <YearPicker value={year} onChange={setYear} />
      </div>

      <Card className="p-5">
        {branchQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !hasActivity ? (
          <EmptyState icon={Building2} title="No branch sales this year" description="Sales are attributed to a branch at checkout." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((row, i) => (
              <li key={row.branchId} className="flex items-center justify-between py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  {i === 0 && row.salesUgx > 0 && <Crown size={14} className="text-warning-500" />}
                  <div>
                    <p className="font-medium text-ink-900">{row.branchName}</p>
                    <p className="text-xs text-ink-500">
                      {row.transactionCount} transaction{row.transactionCount === 1 ? '' : 's'}
                    </p>
                  </div>
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
