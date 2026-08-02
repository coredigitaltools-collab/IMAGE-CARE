import { useNavigate } from 'react-router-dom'
import { Landmark, ListChecks, AlertTriangle, FileWarning, Building2, GitCompare, BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { BankReconciliationTabs } from '../../components/bankReconciliation/BankReconciliationTabs'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { formatCurrency } from '../../lib/format'
import { useBankReconciliationDashboardKpis } from '../../features/bankReconciliation/hooks/useBankReconciliationData'

export function BankDashboardPage() {
  const navigate = useNavigate()
  const kpisQuery = useBankReconciliationDashboardKpis()
  const data = kpisQuery.data

  const quickActions = [
    { label: 'Bank accounts', icon: Building2, to: '/bank-reconciliation/accounts' },
    { label: 'Reconcile', icon: GitCompare, to: '/bank-reconciliation/reconcile' },
    { label: 'Unmatched', icon: FileWarning, to: '/bank-reconciliation/unmatched' },
    { label: 'Reports', icon: BarChart3, to: '/bank-reconciliation/reports' },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Bank Reconciliation' }]} />
      <BankReconciliationTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Bank Reconciliation</h1>
        <p className="mt-0.5 text-sm text-ink-500">Matching ERP cash records against real bank statements.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickActions.map(({ label, icon: Icon, to }) => (
          <button
            key={label}
            onClick={() => navigate(to)}
            className="group flex flex-col items-center gap-1.5 rounded-card border border-ink-100 bg-white px-3 py-3 text-center shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover active:translate-y-0 active:scale-[0.97]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue-50 text-brand-blue-700 transition-all duration-200 group-hover:scale-110 group-hover:bg-brand-blue-700 group-hover:text-white">
              <Icon size={16} strokeWidth={1.75} />
            </span>
            <span className="text-xs font-medium text-ink-700">{label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Bank accounts" value={data ? String(data.accountCount) : '-'} icon={Landmark} tone="blue" isLoading={kpisQuery.isLoading} />
        <KpiCard
          label="Reconciled balance"
          value={data ? formatCurrency(data.totalReconciledBalanceUgx, 'UGX') : '-'}
          hint="Opening balance plus matched deposits only"
          icon={ListChecks}
          tone="success"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Unmatched statement lines"
          value={data ? String(data.unmatchedStatementLineCount) : '-'}
          icon={FileWarning}
          tone={data && data.unmatchedStatementLineCount > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Unmatched deposits"
          value={data ? String(data.unmatchedDepositCount) : '-'}
          icon={AlertTriangle}
          tone={data && data.unmatchedDepositCount > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
      </div>
    </div>
  )
}
