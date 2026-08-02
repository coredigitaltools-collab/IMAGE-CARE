import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, TrendingUp, Trophy, Boxes, GitCompare, Layers, ShoppingCart, BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { BranchOverviewTabs } from '../../components/branchOverview/BranchOverviewTabs'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { CurrencySelector } from '../../components/dashboard/CurrencySelector'
import { formatCurrency } from '../../lib/format'
import { useBranchOverviewDashboardKpis } from '../../features/branchOverview/hooks/useBranchOverviewData'
import type { SupportedCurrency } from '../../lib/currency'

export function BranchOverviewDashboardPage() {
  const navigate = useNavigate()
  const [currency, setCurrency] = useState<SupportedCurrency>('UGX')
  const kpisQuery = useBranchOverviewDashboardKpis(currency)
  const data = kpisQuery.data

  const quickActions = [
    { label: 'Performance comparison', icon: GitCompare, to: '/branch-overview/performance' },
    { label: 'Inventory by branch', icon: Layers, to: '/branch-overview/inventory' },
    { label: 'Sales by branch', icon: ShoppingCart, to: '/branch-overview/sales' },
    { label: 'Reports', icon: BarChart3, to: '/branch-overview/reports' },
  ]

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Branch Overview' }]} />
      <BranchOverviewTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Branch Overview</h1>
          <p className="mt-0.5 text-sm text-ink-500">A consolidated view across every branch you have access to.</p>
        </div>
        <CurrencySelector selected={currency} onChange={setCurrency} />
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
        <KpiCard label="Branches" value={data ? String(data.branchCount) : '-'} icon={Building2} tone="blue" isLoading={kpisQuery.isLoading} />
        <KpiCard
          label="Total sales, all branches"
          value={data ? formatCurrency(data.totalSalesUgx, currency) : '-'}
          icon={TrendingUp}
          tone="success"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Best performing branch"
          value={data?.bestBranchName ?? 'No sales yet'}
          icon={Trophy}
          tone="neutral"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Inventory value"
          value={data ? formatCurrency(data.totalInventoryValueUgx, currency) : '-'}
          hint="Business-wide, not split per branch"
          icon={Boxes}
          tone="neutral"
          isLoading={kpisQuery.isLoading}
        />
      </div>
    </div>
  )
}
