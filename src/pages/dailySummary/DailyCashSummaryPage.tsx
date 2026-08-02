import { Wallet } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { DailySummaryTabs } from '../../components/dailySummary/DailySummaryTabs'
import { DatePicker, useSelectedDate } from '../../components/dailySummary/DatePicker'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { formatCurrency } from '../../lib/format'
import { useDailyCashSummary } from '../../features/dailySummary/hooks/useDailySummaryData'

export function DailyCashSummaryPage() {
  const [date, setDate] = useSelectedDate()
  const cashQuery = useDailyCashSummary(date)
  const data = cashQuery.data

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Daily Summary' }]} />
      <DailySummaryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Cash Summary</h1>
          <p className="mt-0.5 text-sm text-ink-500">Cash movement for the selected day, from the same ledger Cash Flow uses.</p>
        </div>
        <DatePicker value={date} onChange={setDate} />
      </div>

      {cashQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs text-ink-500">Cash received</p>
              <p className="mt-1 text-lg font-semibold text-success-700">{data ? formatCurrency(data.cashReceivedUgx, 'UGX') : '-'}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-ink-500">Cash paid out</p>
              <p className="mt-1 text-lg font-semibold text-brand-red-700">{data ? formatCurrency(data.cashPaidOutUgx, 'UGX') : '-'}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-ink-500">Net cash flow</p>
              <p className={`mt-1 text-lg font-semibold ${data && data.netCashFlowUgx >= 0 ? 'text-success-700' : 'text-brand-red-700'}`}>
                {data ? formatCurrency(data.netCashFlowUgx, 'UGX') : '-'}
              </p>
            </Card>
          </div>

          <Card className="p-5">
            <div className="mb-1 flex items-center gap-2">
              <Wallet size={16} className="text-brand-blue-700" />
              <p className="text-xs text-ink-500">Cash in hand, as of now, independent of profit</p>
            </div>
            <p className="text-2xl font-semibold text-ink-900">{data ? formatCurrency(data.cashInHandUgx, 'UGX') : '-'}</p>
          </Card>
        </>
      )}
    </div>
  )
}
