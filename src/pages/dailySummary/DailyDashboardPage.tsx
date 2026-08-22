import { useNavigate } from 'react-router-dom'
import { TrendingUp, Receipt, BadgeDollarSign, TrendingDown, PiggyBank, Wallet } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { DailySummaryTabs } from '../../components/dailySummary/DailySummaryTabs'
import { DatePicker } from '../../components/dailySummary/DatePicker'
import { useSelectedDate } from '../../components/dailySummary/useSelectedDate'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { formatCurrency } from '../../lib/format'
import { useDailyCashSummary, useDailyFinancials } from '../../features/dailySummary/hooks/useDailySummaryData'

export function DailyDashboardPage() {
  const navigate = useNavigate()
  const [date, setDate] = useSelectedDate()
  const financialsQuery = useDailyFinancials(date)
  const cashQuery = useDailyCashSummary(date)
  const financials = financialsQuery.data
  const cash = cashQuery.data

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString('en-UG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const quickActions = [
    { label: 'Sales summary', to: `/daily-summary/sales?date=${date}` },
    { label: 'Cash summary', to: `/daily-summary/cash?date=${date}` },
    { label: 'Full report', to: `/daily-summary/report?date=${date}` },
  ]

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Daily Summary' }]} />
      <DailySummaryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Daily Summary</h1>
          <p className="mt-0.5 text-sm text-ink-500">{dateLabel}</p>
        </div>
        <DatePicker value={date} onChange={setDate} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {quickActions.map(({ label, to }) => (
          <button
            key={label}
            onClick={() => navigate(to)}
            className="rounded-card border border-ink-100 bg-white px-3 py-3 text-center text-xs font-medium text-ink-700 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover"
          >
            {label}
          </button>
        ))}
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Financial summary</h2>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Revenue"
          value={financials ? formatCurrency(financials.salesUgx, 'UGX') : '-'}
          icon={TrendingUp}
          tone="blue"
          isLoading={financialsQuery.isLoading}
        />
        <KpiCard
          label="COGS"
          value={financials ? formatCurrency(financials.cogsUgx, 'UGX') : '-'}
          icon={Receipt}
          tone="neutral"
          isLoading={financialsQuery.isLoading}
        />
        <KpiCard
          label="Gross profit"
          value={financials ? formatCurrency(financials.grossProfitUgx, 'UGX') : '-'}
          hint="Revenue minus COGS"
          icon={BadgeDollarSign}
          tone={financials && financials.grossProfitUgx >= 0 ? 'success' : 'red'}
          isLoading={financialsQuery.isLoading}
        />
        <KpiCard
          label="Expenses"
          value={financials ? formatCurrency(financials.expensesUgx, 'UGX') : '-'}
          icon={TrendingDown}
          tone="neutral"
          isLoading={financialsQuery.isLoading}
        />
        <KpiCard
          label="Net profit"
          value={financials ? formatCurrency(financials.netProfitUgx, 'UGX') : '-'}
          hint="Gross profit minus expenses"
          icon={PiggyBank}
          tone={financials && financials.netProfitUgx >= 0 ? 'success' : 'red'}
          isLoading={financialsQuery.isLoading}
        />
        <KpiCard
          label="Cash in hand"
          value={cash ? formatCurrency(cash.cashInHandUgx, 'UGX') : '-'}
          hint="Independent of profit, as of now"
          icon={Wallet}
          tone="blue"
          isLoading={cashQuery.isLoading}
        />
      </div>
    </div>
  )
}
