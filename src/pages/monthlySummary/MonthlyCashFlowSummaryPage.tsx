import { Wallet } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { MonthlySummaryTabs } from '../../components/monthlySummary/MonthlySummaryTabs'
import { MonthPicker } from '../../components/monthlySummary/MonthPicker'
import { useSelectedMonth } from '../../components/monthlySummary/useSelectedMonth'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useMonthlyCashFlowSummary } from '../../features/monthlySummary/hooks/useMonthlySummaryData'

export function MonthlyCashFlowSummaryPage() {
  const [month, setMonth] = useSelectedMonth()
  const cashFlowQuery = useMonthlyCashFlowSummary(month)
  const data = cashFlowQuery.data

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Monthly Summary' }]} />
      <MonthlySummaryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Cash Flow Summary</h1>
          <p className="mt-0.5 text-sm text-ink-500">Cash received and paid out for the selected month, from the same ledger Cash Flow uses.</p>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {cashFlowQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !data || (data.cashReceivedUgx === 0 && data.cashPaidOutUgx === 0) ? (
        <Card className="p-6">
          <EmptyState icon={Wallet} title="No cash activity this month" description="Cash movements for the selected month will appear here." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs text-ink-500">Cash received</p>
            <p className="mt-1 text-lg font-semibold text-success-700">{formatCurrency(data.cashReceivedUgx, 'UGX')}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-500">Cash paid out</p>
            <p className="mt-1 text-lg font-semibold text-brand-red-700">{formatCurrency(data.cashPaidOutUgx, 'UGX')}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-500">Net cash flow</p>
            <p className={`mt-1 text-lg font-semibold ${data.netCashFlowUgx >= 0 ? 'text-success-700' : 'text-brand-red-700'}`}>
              {formatCurrency(data.netCashFlowUgx, 'UGX')}
            </p>
          </Card>
        </div>
      )}
    </div>
  )
}
