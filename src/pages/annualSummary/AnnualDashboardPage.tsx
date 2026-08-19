import { useNavigate } from 'react-router-dom'
import { TrendingUp, Receipt, BadgeDollarSign, TrendingDown, PiggyBank, Wallet, CreditCard, Boxes, Trophy, Building2 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { AnnualSummaryTabs } from '../../components/annualSummary/AnnualSummaryTabs'
import { YearPicker } from '../../components/annualSummary/YearPicker'
import { useSelectedYear } from '../../components/annualSummary/useSelectedYear'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { formatCurrency } from '../../lib/format'
import {
  useAnnualBranchComparison,
  useAnnualFinancials,
  useAnnualSalesSummary,
  useCurrentSnapshotForAnnual,
} from '../../features/annualSummary/hooks/useAnnualSummaryData'

export function AnnualDashboardPage() {
  const navigate = useNavigate()
  const [year, setYear] = useSelectedYear()
  const financialsQuery = useAnnualFinancials(year)
  const snapshotQuery = useCurrentSnapshotForAnnual('UGX')
  const salesQuery = useAnnualSalesSummary(year)
  const branchesQuery = useAnnualBranchComparison(year)

  const financials = financialsQuery.data
  const snapshot = snapshotQuery.data
  const topProduct = salesQuery.data?.topProducts[0]
  const bestBranch = branchesQuery.data?.[0]

  const quickActions = [
    { label: 'Sales summary', to: `/annual-summary/sales?year=${year}` },
    { label: 'Year over year', to: `/annual-summary/year-over-year?year=${year}` },
    { label: 'Full report', to: `/annual-summary/report?year=${year}` },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Annual Summary' }]} />
      <AnnualSummaryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Annual Summary</h1>
          <p className="mt-0.5 text-sm text-ink-500">{year}, the executive year-end view.</p>
        </div>
        <YearPicker value={year} onChange={setYear} />
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

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{year} financials</h2>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Annual revenue"
          value={financials ? formatCurrency(financials.salesUgx, 'UGX') : '-'}
          icon={TrendingUp}
          tone="blue"
          isLoading={financialsQuery.isLoading}
        />
        <KpiCard
          label="Annual COGS"
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

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{year} highlights</h2>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard
          label="Top selling product"
          value={topProduct ? topProduct.productName : 'No sales yet'}
          hint={topProduct ? formatCurrency(topProduct.revenueUgx, 'UGX') : undefined}
          icon={Trophy}
          tone="neutral"
          isLoading={salesQuery.isLoading}
        />
        <KpiCard
          label="Best performing branch"
          value={bestBranch ? bestBranch.branchName : 'No branch sales yet'}
          hint={bestBranch ? formatCurrency(bestBranch.salesUgx, 'UGX') : undefined}
          icon={Building2}
          tone="neutral"
          isLoading={branchesQuery.isLoading}
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
          label="Inventory value"
          value={snapshot ? formatCurrency(snapshot.inventoryValueUgx, 'UGX') : '-'}
          icon={Boxes}
          tone="neutral"
          isLoading={snapshotQuery.isLoading}
        />
        <KpiCard
          label="Outstanding credit"
          value={snapshot ? formatCurrency(snapshot.outstandingCreditUgx, 'UGX') : '-'}
          icon={CreditCard}
          tone={snapshot && snapshot.outstandingCreditUgx > 0 ? 'red' : 'neutral'}
          isLoading={snapshotQuery.isLoading}
        />
      </div>
    </div>
  )
}
