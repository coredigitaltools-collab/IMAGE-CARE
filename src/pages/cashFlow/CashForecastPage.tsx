import { LineChart } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { CashFlowTabs } from '../../components/cashFlow/CashFlowTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useCashForecast } from '../../features/accounting/hooks/useAccountingData'

export function CashForecastPage() {
  const forecastQuery = useCashForecast(30, 14)
  const forecast = forecastQuery.data

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Cash Flow' }]} />
      <CashFlowTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Cash Forecast</h1>
        <p className="mt-0.5 text-sm text-ink-500">A projection, not a prediction: today's cash in hand, moved forward by the average daily net cash flow of the last 30 days.</p>
      </div>

      {forecastQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !forecast || forecast.points.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={LineChart} title="Not enough activity yet" description="A forecast needs some recent cash history to project from." />
        </Card>
      ) : (
        <>
          <Card className="mb-4 p-5">
            <p className="text-xs text-ink-500">Average daily net cash flow, last {forecast.windowDays} days</p>
            <p className={`mt-1 text-2xl font-semibold ${forecast.dailyAverageNetUgx >= 0 ? 'text-success-700' : 'text-brand-red-700'}`}>
              {forecast.dailyAverageNetUgx >= 0 ? '+' : ''}
              {formatCurrency(forecast.dailyAverageNetUgx, 'UGX')} / day
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Projected cash in hand</h2>
            <ul className="divide-y divide-ink-100">
              {forecast.points.map((p) => (
                <li key={p.date} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink-500">{new Date(p.date).toLocaleDateString('en-UG')}</span>
                  <span className={p.projectedCashInHandUgx < 0 ? 'font-medium text-brand-red-700' : 'font-medium text-ink-900'}>
                    {formatCurrency(p.projectedCashInHandUgx, 'UGX')}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
