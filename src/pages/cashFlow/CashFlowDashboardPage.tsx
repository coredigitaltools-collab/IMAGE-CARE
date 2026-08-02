import { useNavigate } from 'react-router-dom'
import { Wallet, ArrowDownToLine, ArrowUpFromLine, PiggyBank, Landmark, TrendingUp, ListChecks, LineChart, ClipboardCheck } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { CashFlowTabs } from '../../components/cashFlow/CashFlowTabs'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { formatCurrency } from '../../lib/format'
import { useCashFlowDashboardKpis } from '../../features/accounting/hooks/useAccountingData'

export function CashFlowDashboardPage() {
  const navigate = useNavigate()
  const kpisQuery = useCashFlowDashboardKpis()
  const data = kpisQuery.data

  const quickActions = [
    { label: 'Cash ledger', icon: ListChecks, onClick: () => navigate('/cash-flow/ledger') },
    { label: 'Forecast', icon: LineChart, onClick: () => navigate('/cash-flow/forecast') },
    { label: 'Reconciliation', icon: ClipboardCheck, onClick: () => navigate('/cash-flow/reconciliation') },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Cash Flow' }]} />
      <CashFlowTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Cash Flow</h1>
        <p className="mt-0.5 text-sm text-ink-500">Where cash came from, where it went, and what's left.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {quickActions.map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="group flex flex-col items-center gap-1.5 rounded-card border border-ink-100 bg-white px-3 py-3 text-center shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover active:translate-y-0 active:scale-[0.97]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue-50 text-brand-blue-700 transition-all duration-200 group-hover:scale-110 group-hover:bg-brand-blue-700 group-hover:text-white">
              <Icon size={16} strokeWidth={1.75} />
            </span>
            <span className="text-xs font-medium text-ink-700">{label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Opening cash"
          value={data ? formatCurrency(data.openingCashUgx, 'UGX') : '-'}
          icon={Wallet}
          tone="neutral"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Cash received"
          value={data ? formatCurrency(data.cashReceivedUgx, 'UGX') : '-'}
          icon={ArrowDownToLine}
          tone="success"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Cash paid out"
          value={data ? formatCurrency(data.cashPaidOutUgx, 'UGX') : '-'}
          icon={ArrowUpFromLine}
          tone="neutral"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Cash in hand"
          value={data ? formatCurrency(data.cashInHandUgx, 'UGX') : '-'}
          icon={PiggyBank}
          tone="blue"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Bank balance"
          value={data ? formatCurrency(data.bankBalanceUgx, 'UGX') : '-'}
          icon={Landmark}
          tone="neutral"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Net cash flow"
          value={data ? formatCurrency(data.netCashFlowUgx, 'UGX') : '-'}
          icon={TrendingUp}
          tone={data && data.netCashFlowUgx >= 0 ? 'success' : 'red'}
          isLoading={kpisQuery.isLoading}
        />
      </div>
    </div>
  )
}
