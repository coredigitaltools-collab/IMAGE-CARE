import { useNavigate } from 'react-router-dom'
import { TrendingUp, Receipt, BadgeDollarSign, TrendingDown, PiggyBank, Wallet, CreditCard, Boxes } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { MonthlySummaryTabs } from '../../components/monthlySummary/MonthlySummaryTabs'
import { MonthPicker, useSelectedMonth } from '../../components/monthlySummary/MonthPicker'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { formatCurrency } from '../../lib/format'
import { useCurrentSnapshot, useMonthlyFinancials } from '../../features/monthlySummary/hooks/useMonthlySummaryData'

export function MonthlyDashboardPage() {
  const navigate = useNavigate()
  const [month, setMonth] = useSelectedMonth()
  const financialsQuery = useMonthlyFinancials(month)
  const snapshotQuery = useCurrentSnapshot('UGX')
  const financials = financialsQuery.data
  const snapshot = snapshotQuery.data

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-UG', { month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Monthly Summary' }]} />
      <MonthlySummaryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Monthly Summary</h1>
          <p className="mt-0.5 text-sm text-ink-500">{monthLabel}, executive view across sales, inventory, and cash.</p>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <button
          onClick={() => navigate(`/monthly-summary/sales?month=${month}`)}
          className="rounded-card border border-ink-100 bg-white px-3 py-3 text-center text-xs font-medium text-ink-700 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover"
        >
          Sales summary
        </button>
        <button
          onClick={() => navigate(`/monthly-summary/branches?month=${month}`)}
          className="rounded-card border border-ink-100 bg-white px-3 py-3 text-center text-xs font-medium text-ink-700 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover"
        >
          Branch comparison
        </button>
        <button
          onClick={() => navigate(`/monthly-summary/report?month=${month}`)}
          className="rounded-card border border-ink-100 bg-white px-3 py-3 text-center text-xs font-medium text-ink-700 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover"
        >
          Full report
        </button>
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{monthLabel}</h2>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Monthly sales"
          value={financials ? formatCurrency(financials.salesUgx, 'UGX') : '-'}
          icon={TrendingUp}
          tone="blue"
          isLoading={financialsQuery.isLoading}
        />
        <KpiCard
          label="Monthly COGS"
          value={financials ? formatCurrency(financials.cogsUgx, 'UGX') : '-'}
          icon={Receipt}
          tone="neutral"
          isLoading={financialsQuery.isLoading}
        />
        <KpiCard
          label="Gross profit"
          value={financials ? formatCurrency(financials.grossProfitUgx, 'UGX') : '-'}
          hint="Sales minus COGS"
          icon={BadgeDollarSign}
          tone={financials && financials.grossProfitUgx >= 0 ? 'success' : 'red'}
          isLoading={financialsQuery.isLoading}
        />
        <KpiCard
          label="Operating expenses"
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
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">As of now</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Cash in hand"
          value={snapshot ? formatCurrency(snapshot.cashInHandUgx, 'UGX') : '-'}
          icon={Wallet}
          tone="blue"
          isLoading={snapshotQuery.isLoading}
        />
        <KpiCard
          label="Outstanding credit"
          value={snapshot ? formatCurrency(snapshot.outstandingCreditUgx, 'UGX') : '-'}
          icon={CreditCard}
          tone={snapshot && snapshot.outstandingCreditUgx > 0 ? 'red' : 'neutral'}
          isLoading={snapshotQuery.isLoading}
        />
        <KpiCard
          label="Inventory value"
          value={snapshot ? formatCurrency(snapshot.inventoryValueUgx, 'UGX') : '-'}
          icon={Boxes}
          tone="neutral"
          isLoading={snapshotQuery.isLoading}
        />
      </div>
    </div>
  )
}
