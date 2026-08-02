import { useNavigate } from 'react-router-dom'
import { Users, Wallet, Clock, CheckCircle2, TrendingUp, ListChecks, SlidersHorizontal, BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { PayrollTabs } from '../../components/payroll/PayrollTabs'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { usePayrollDashboardKpis } from '../../features/payroll/hooks/usePayrollData'
import { PAYROLL_STATUS_LABELS } from '../../types/payroll'
import type { PayrollPeriodStatus } from '../../types/payroll'

export function PayrollDashboardPage() {
  const navigate = useNavigate()
  const kpisQuery = usePayrollDashboardKpis()

  const quickActions = [
    { label: 'Employees', icon: Users, onClick: () => navigate('/payroll/employees') },
    { label: 'Allowances & deductions', icon: SlidersHorizontal, onClick: () => navigate('/payroll/components') },
    { label: 'Payroll runs', icon: ListChecks, onClick: () => navigate('/payroll/periods') },
    { label: 'Reports', icon: BarChart3, onClick: () => navigate('/payroll/reports') },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Payroll' }]} />
      <PayrollTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Payroll</h1>
        <p className="mt-0.5 text-sm text-ink-500">Employee compensation, payroll runs, and workforce cost.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          label="Employees on payroll"
          value={kpisQuery.data ? String(kpisQuery.data.activeEmployeeCount) : '-'}
          icon={Users}
          tone="blue"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Current period"
          value={kpisQuery.data?.currentPeriodStatus ? PAYROLL_STATUS_LABELS[kpisQuery.data.currentPeriodStatus as PayrollPeriodStatus] : 'None open'}
          icon={Clock}
          tone="neutral"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Pending approval"
          value={kpisQuery.data ? String(kpisQuery.data.pendingApprovalCount) : '-'}
          icon={CheckCircle2}
          tone={kpisQuery.data && kpisQuery.data.pendingApprovalCount > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Last payroll paid"
          value={kpisQuery.data?.lastPaidAt ? formatCurrency(kpisQuery.data.lastPaidAmountUgx, 'UGX') : '-'}
          hint={kpisQuery.data?.lastPaidAt ? formatRelativeTime(kpisQuery.data.lastPaidAt) : 'No payroll paid yet'}
          icon={Wallet}
          tone="success"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="YTD payroll cost"
          value={kpisQuery.data ? formatCurrency(kpisQuery.data.ytdPayrollCostUgx, 'UGX') : '-'}
          icon={TrendingUp}
          tone="neutral"
          isLoading={kpisQuery.isLoading}
        />
      </div>
    </div>
  )
}
