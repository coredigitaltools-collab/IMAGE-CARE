import { Link, useNavigate } from 'react-router-dom'
import { Wallet, Users, AlertTriangle, TrendingDown, Download, ListChecks, BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { CreditTabs } from '../../components/credit/CreditTabs'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { formatCurrency } from '../../lib/format'
import { useCreditAccounts, useCreditDashboardKpis } from '../../features/credit/hooks/useCreditData'

export function CreditDashboardPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const kpisQuery = useCreditDashboardKpis()
  const accountsQuery = useCreditAccounts()

  const overdueAccounts = (accountsQuery.data ?? []).filter((a) => a.isOverdue).sort((a, b) => b.balance - a.balance).slice(0, 5)

  const exportCsv = () => {
    const accounts = accountsQuery.data ?? []
    if (accounts.length === 0) {
      showToast('No credit accounts to export yet.')
      return
    }
    const header = ['Customer', 'Limit (UGX)', 'Balance (UGX)', 'Available (UGX)', 'Days Outstanding', 'Overdue']
    const rows = accounts.map((a) => [a.customer.name, a.limit, a.balance, a.available, a.daysOutstanding ?? '', a.isOverdue ? 'Yes' : 'No'])
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `credit-accounts-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('Credit accounts exported.', 'success')
  }

  const quickActions = [
    { label: 'View accounts', icon: ListChecks, onClick: () => navigate('/credit/accounts') },
    { label: 'View overdue', icon: AlertTriangle, onClick: () => navigate('/credit/accounts?overdue=1') },
    { label: 'Reports', icon: BarChart3, onClick: () => navigate('/credit/reports') },
    { label: 'Export', icon: Download, onClick: exportCsv },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Credit' }]} />
      <CreditTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Credit</h1>
        <p className="mt-0.5 text-sm text-ink-500">Who owes money, how much, and how overdue.</p>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Total outstanding"
          value={kpisQuery.data ? formatCurrency(kpisQuery.data.totalOutstandingUgx, 'UGX') : '—'}
          icon={Wallet}
          tone={kpisQuery.data && kpisQuery.data.totalOutstandingUgx > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Accounts with balance"
          value={kpisQuery.data ? String(kpisQuery.data.accountsWithBalance) : '—'}
          icon={Users}
          tone="neutral"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Overdue accounts"
          value={kpisQuery.data ? String(kpisQuery.data.overdueAccounts) : '—'}
          hint="Past 30-day terms"
          icon={AlertTriangle}
          tone={kpisQuery.data && kpisQuery.data.overdueAccounts > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Overdue amount"
          value={kpisQuery.data ? formatCurrency(kpisQuery.data.overdueAmountUgx, 'UGX') : '—'}
          icon={TrendingDown}
          tone={kpisQuery.data && kpisQuery.data.overdueAmountUgx > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Collected this month"
          value={kpisQuery.data ? formatCurrency(kpisQuery.data.paymentsThisMonthUgx, 'UGX') : '—'}
          icon={Wallet}
          tone="success"
          isLoading={kpisQuery.isLoading}
        />
      </div>

      <Card className="mt-6 p-5">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle size={16} className="text-brand-red-700" />
          <h2 className="text-sm font-semibold text-ink-900">Most overdue accounts</h2>
        </div>
        {accountsQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : overdueAccounts.length === 0 ? (
          <EmptyState icon={AlertTriangle} title="Nothing overdue" description="No account is currently past its payment terms." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {overdueAccounts.map((a) => (
              <li key={a.customer.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link to={`/customers/${a.customer.id}`} className="text-sm font-medium text-ink-900 hover:text-brand-blue-700">
                    {a.customer.name}
                  </Link>
                  <p className="text-xs text-ink-500">{a.daysOutstanding} days outstanding</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-brand-red-700">{formatCurrency(a.balance, 'UGX')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
