import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Boxes, Package, AlertTriangle, PackageX, ArrowDownToLine, ArrowUpFromLine, ListChecks, Building2, BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { StockSummaryTabs } from '../../components/stockSummary/StockSummaryTabs'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { CurrencySelector } from '../../components/dashboard/CurrencySelector'
import { formatCurrency } from '../../lib/format'
import { useStockSummaryDashboardKpis } from '../../features/stockSummary/hooks/useStockSummaryData'
import type { SupportedCurrency } from '../../lib/currency'

export function StockSummaryDashboardPage() {
  const navigate = useNavigate()
  const [currency, setCurrency] = useState<SupportedCurrency>('UGX')
  const kpisQuery = useStockSummaryDashboardKpis(currency)
  const data = kpisQuery.data

  const quickActions = [
    { label: 'Current stock', icon: ListChecks, onClick: () => navigate('/stock-summary/current-stock') },
    { label: 'Branch comparison', icon: Building2, onClick: () => navigate('/stock-summary/branch-comparison') },
    { label: 'Reports', icon: BarChart3, onClick: () => navigate('/stock-summary/reports') },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Stock Summary' }]} />
      <StockSummaryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Stock Summary</h1>
          <p className="mt-0.5 text-sm text-ink-500">A business-wide view of stock levels, value, and movement.</p>
        </div>
        <CurrencySelector selected={currency} onChange={setCurrency} />
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
          label="Total inventory value"
          value={data ? formatCurrency(data.totalInventoryValue, currency) : '-'}
          icon={Boxes}
          tone="blue"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard label="Stock items" value={data ? String(data.stockItemsCount) : '-'} icon={Package} tone="neutral" isLoading={kpisQuery.isLoading} />
        <KpiCard
          label="Low stock"
          value={data ? String(data.lowStockCount) : '-'}
          icon={AlertTriangle}
          tone={data && data.lowStockCount > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Out of stock"
          value={data ? String(data.outOfStockCount) : '-'}
          icon={PackageX}
          tone={data && data.outOfStockCount > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Today's stock in"
          value={data ? String(data.todaysStockIn) : '-'}
          icon={ArrowDownToLine}
          tone="success"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Today's stock out"
          value={data ? String(data.todaysStockOut) : '-'}
          icon={ArrowUpFromLine}
          tone="neutral"
          isLoading={kpisQuery.isLoading}
        />
      </div>
    </div>
  )
}
