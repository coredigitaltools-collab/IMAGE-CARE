import { TrendingUp } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { MonthlySummaryTabs } from '../../components/monthlySummary/MonthlySummaryTabs'
import { MonthPicker, useSelectedMonth } from '../../components/monthlySummary/MonthPicker'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useMonthlySalesSummary } from '../../features/monthlySummary/hooks/useMonthlySummaryData'

export function MonthlySalesSummaryPage() {
  const [month, setMonth] = useSelectedMonth()
  const salesQuery = useMonthlySalesSummary(month)
  const data = salesQuery.data

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Monthly Summary' }]} />
      <MonthlySummaryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Sales Summary</h1>
          <p className="mt-0.5 text-sm text-ink-500">Completed sales for the selected month.</p>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {salesQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.transactionCount === 0 ? (
        <Card className="p-6">
          <EmptyState icon={TrendingUp} title="No sales this month" description="Completed sales for the selected month will appear here." />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Card className="p-4">
              <p className="text-xs text-ink-500">Total sales</p>
              <p className="mt-1 text-lg font-semibold text-ink-900">{formatCurrency(data.totalSalesUgx, 'UGX')}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-ink-500">Transactions</p>
              <p className="mt-1 text-lg font-semibold text-ink-900">{data.transactionCount}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-ink-500">Average sale</p>
              <p className="mt-1 text-lg font-semibold text-ink-900">{formatCurrency(data.averageSaleUgx, 'UGX')}</p>
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Top products this month</h2>
            <ul className="divide-y divide-ink-100">
              {data.topProducts.map((p) => (
                <li key={p.productId} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-ink-900">{p.productName}</p>
                    <p className="text-xs text-ink-500">{p.unitsSold} units sold</p>
                  </div>
                  <span className="font-semibold text-ink-900">{formatCurrency(p.revenueUgx, 'UGX')}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
