import { Printer } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { DailySummaryTabs } from '../../components/dailySummary/DailySummaryTabs'
import { DatePicker } from '../../components/dailySummary/DatePicker'
import { useSelectedDate } from '../../components/dailySummary/useSelectedDate'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { formatCurrency } from '../../lib/format'
import {
  useCurrentSnapshotForDaily,
  useDailyCashSummary,
  useDailyFinancials,
  useDailySalesSummary,
} from '../../features/dailySummary/hooks/useDailySummaryData'

export function DailyReportPage() {
  const [date, setDate] = useSelectedDate()
  const financialsQuery = useDailyFinancials(date)
  const salesQuery = useDailySalesSummary(date)
  const cashQuery = useDailyCashSummary(date)
  const snapshotQuery = useCurrentSnapshotForDaily('UGX')

  const isLoading = financialsQuery.isLoading || salesQuery.isLoading || cashQuery.isLoading || snapshotQuery.isLoading
  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString('en-UG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Daily Summary' }]} />
      <DailySummaryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Daily Report</h1>
          <p className="mt-0.5 text-sm text-ink-500">Everything above, combined for print.</p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker value={date} onChange={setDate} />
          <Button onClick={() => window.print()}>
            <Printer size={14} /> Print
          </Button>
        </div>
      </div>

      <h1 className="mb-4 hidden text-xl font-semibold text-ink-900 print:block">Daily Summary, {dateLabel}</h1>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Financial Summary, {dateLabel}</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-ink-500">Revenue</dt>
                <dd className="text-ink-900">{formatCurrency(financialsQuery.data?.salesUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">COGS</dt>
                <dd className="text-ink-900">{formatCurrency(financialsQuery.data?.cogsUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Gross profit</dt>
                <dd className="text-ink-900">{formatCurrency(financialsQuery.data?.grossProfitUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Expenses</dt>
                <dd className="text-ink-900">{formatCurrency(financialsQuery.data?.expensesUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Net profit</dt>
                <dd className="text-ink-900">{formatCurrency(financialsQuery.data?.netProfitUgx ?? 0, 'UGX')}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Sales Summary</h2>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-500">Total sales</dt>
                <dd className="text-ink-900">{formatCurrency(salesQuery.data?.totalSalesUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Transactions</dt>
                <dd className="text-ink-900">{salesQuery.data?.transactionCount ?? 0}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Average sale</dt>
                <dd className="text-ink-900">{formatCurrency(salesQuery.data?.averageSaleUgx ?? 0, 'UGX')}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Cash Summary</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-ink-500">Cash received</dt>
                <dd className="text-ink-900">{formatCurrency(cashQuery.data?.cashReceivedUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Cash paid out</dt>
                <dd className="text-ink-900">{formatCurrency(cashQuery.data?.cashPaidOutUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Net cash flow</dt>
                <dd className="text-ink-900">{formatCurrency(cashQuery.data?.netCashFlowUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Cash in hand (as of now)</dt>
                <dd className="text-ink-900">{formatCurrency(cashQuery.data?.cashInHandUgx ?? 0, 'UGX')}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Inventory (as of now)</h2>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-500">Inventory value</dt>
                <dd className="text-ink-900">{formatCurrency(snapshotQuery.data?.inventoryValueUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Low stock items</dt>
                <dd className="text-ink-900">{snapshotQuery.data?.lowStockCount ?? 0}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Out of stock items</dt>
                <dd className="text-ink-900">{snapshotQuery.data?.outOfStockCount ?? 0}</dd>
              </div>
            </dl>
          </Card>
        </div>
      )}
    </div>
  )
}
