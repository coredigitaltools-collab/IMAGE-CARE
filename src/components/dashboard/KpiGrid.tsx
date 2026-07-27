import { TrendingUp, TrendingDown, Wallet, PackageX } from 'lucide-react'
import { KpiCard } from './KpiCard'
import { formatCurrency } from '../../lib/format'
import type { DashboardSummary, LowStockItem } from '../../types/domain'

interface KpiGridProps {
  summary?: DashboardSummary
  lowStock?: LowStockItem[]
  isSummaryLoading: boolean
  isLowStockLoading: boolean
}

export function KpiGrid({ summary, lowStock, isSummaryLoading, isLowStockLoading }: KpiGridProps) {
  const currency = summary?.currency ?? 'KES'
  const lowStockCount = lowStock?.length ?? 0

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Today's sales"
        value={summary ? formatCurrency(summary.todaysSales, currency) : '—'}
        icon={TrendingUp}
        tone="blue"
        isLoading={isSummaryLoading}
      />
      <KpiCard
        label="Today's expenses"
        value={summary ? formatCurrency(summary.todaysExpenses, currency) : '—'}
        icon={TrendingDown}
        tone="neutral"
        isLoading={isSummaryLoading}
      />
      <KpiCard
        label="Cash available"
        value={summary ? formatCurrency(summary.cashAvailable, currency) : '—'}
        icon={Wallet}
        tone="success"
        isLoading={isSummaryLoading}
      />
      <KpiCard
        label="Low stock alerts"
        value={isLowStockLoading ? '—' : String(lowStockCount)}
        hint={lowStockCount > 0 ? 'Needs reordering' : 'All items well stocked'}
        icon={PackageX}
        tone={lowStockCount > 0 ? 'red' : 'neutral'}
        isLoading={isLowStockLoading}
      />
    </div>
  )
}
