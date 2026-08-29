import { TrendingUp, TrendingDown, Wallet, PackageX, Receipt, BadgeDollarSign, Banknote, CreditCard } from 'lucide-react'
import { KpiCard } from './KpiCard'
import { formatCurrency } from '../../lib/format'
import type { DashboardSummary, LowStockItem } from '../../types/domain'

interface KpiGridProps {
  summary?: DashboardSummary
  lowStock?: LowStockItem[]
  isSummaryLoading: boolean
  isLowStockLoading: boolean
}

// The 8 KPIs required by the shared Accounting Engine (IMC Accounting
// Engine Correction v1.0), every figure here reads from that one
// engine, never a locally re-derived number.
export function KpiGrid({ summary, lowStock, isSummaryLoading, isLowStockLoading }: KpiGridProps) {
  const currency = summary?.currency ?? 'UGX'
  const lowStockCount = lowStock?.length ?? 0

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Today's sales"
        value={summary ? formatCurrency(summary.todaysSales, currency) : '-'}
        icon={TrendingUp}
        tone="blue"
        isLoading={isSummaryLoading}
      />
      <KpiCard
        label="Today's COGS"
        value={summary ? formatCurrency(summary.todaysCogs, currency) : '-'}
        hint="Cost of goods sold"
        icon={Receipt}
        tone="neutral"
        isLoading={isSummaryLoading}
      />
      <KpiCard
        label="Gross profit"
        value={summary ? formatCurrency(summary.grossProfit, currency) : '-'}
        hint="Sales − COGS"
        icon={BadgeDollarSign}
        tone={summary && summary.grossProfit >= 0 ? 'success' : 'red'}
        isLoading={isSummaryLoading}
      />
      <KpiCard
        label="Today's expenses"
        value={summary ? formatCurrency(summary.todaysExpenses, currency) : '-'}
        icon={TrendingDown}
        tone="neutral"
        isLoading={isSummaryLoading}
      />
      <KpiCard
        label="Net profit"
        value={summary ? formatCurrency(summary.netProfit, currency) : '-'}
        hint="Gross profit − expenses"
        icon={Banknote}
        tone={summary && summary.netProfit >= 0 ? 'success' : 'red'}
        isLoading={isSummaryLoading}
      />
      <KpiCard
        label="Cash in hand"
        value={summary ? formatCurrency(summary.cashInHand, currency) : '-'}
        icon={Wallet}
        tone="success"
        isLoading={isSummaryLoading}
      />
      <KpiCard
        label="Outstanding credit"
        value={summary ? formatCurrency(summary.outstandingCredit, currency) : '-'}
        icon={CreditCard}
        tone={summary && summary.outstandingCredit > 0 ? 'red' : 'neutral'}
        isLoading={isSummaryLoading}
      />
      <KpiCard
        label="Low stock alerts"
        value={isLowStockLoading ? '-' : String(lowStockCount)}
        hint={lowStockCount > 0 ? 'Needs reordering' : 'All items well stocked'}
        icon={PackageX}
        tone={lowStockCount > 0 ? 'red' : 'neutral'}
        isLoading={isLowStockLoading}
      />
    </div>
  )
}
