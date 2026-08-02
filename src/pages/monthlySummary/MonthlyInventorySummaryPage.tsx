import { Link } from 'react-router-dom'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { MonthlySummaryTabs } from '../../components/monthlySummary/MonthlySummaryTabs'
import { MonthPicker, useSelectedMonth } from '../../components/monthlySummary/MonthPicker'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { formatCurrency } from '../../lib/format'
import { useCurrentSnapshot } from '../../features/monthlySummary/hooks/useMonthlySummaryData'

export function MonthlyInventorySummaryPage() {
  const [month, setMonth] = useSelectedMonth()
  const snapshotQuery = useCurrentSnapshot('UGX')
  const data = snapshotQuery.data

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Monthly Summary' }]} />
      <MonthlySummaryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Inventory Summary</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Stock doesn't have a monthly total, this is the current position, as of now, not scoped to a specific month.
          </p>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {snapshotQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs text-ink-500">Inventory value</p>
            <p className="mt-1 text-lg font-semibold text-ink-900">{data ? formatCurrency(data.inventoryValueUgx, 'UGX') : '-'}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-500">Low stock items</p>
            <p className={`mt-1 text-lg font-semibold ${data && data.lowStockCount > 0 ? 'text-warning-700' : 'text-ink-900'}`}>
              {data ? data.lowStockCount : '-'}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-500">Out of stock items</p>
            <p className={`mt-1 text-lg font-semibold ${data && data.outOfStockCount > 0 ? 'text-brand-red-700' : 'text-ink-900'}`}>
              {data ? data.outOfStockCount : '-'}
            </p>
          </Card>
        </div>
      )}

      <p className="mt-4 text-sm text-ink-500">
        For the full breakdown by product, see{' '}
        <Link to="/stock-summary" className="text-brand-blue-700 hover:underline">
          Stock Summary
        </Link>
        .
      </p>
    </div>
  )
}
