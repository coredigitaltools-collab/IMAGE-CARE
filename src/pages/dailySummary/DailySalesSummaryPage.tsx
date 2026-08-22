import { TrendingUp } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { DailySummaryTabs } from '../../components/dailySummary/DailySummaryTabs'
import { DatePicker } from '../../components/dailySummary/DatePicker'
import { useSelectedDate } from '../../components/dailySummary/useSelectedDate'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useDailySalesSummary } from '../../features/dailySummary/hooks/useDailySummaryData'

export function DailySalesSummaryPage() {
  const [date, setDate] = useSelectedDate()
  const salesQuery = useDailySalesSummary(date)
  const data = salesQuery.data

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Daily Summary' }]} />
      <DailySummaryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Daily Sales Summary</h1>
          <p className="mt-0.5 text-sm text-ink-500">Completed sales for the selected day.</p>
        </div>
        <DatePicker value={date} onChange={setDate} />
      </div>

      {salesQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !data || data.transactionCount === 0 ? (
        <Card className="p-6">
          <EmptyState icon={TrendingUp} title="No sales this day" description="Completed sales for the selected day will appear here." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
      )}
    </div>
  )
}
