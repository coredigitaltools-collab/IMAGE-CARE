import { Award, Percent, Sparkles } from 'lucide-react'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { formatCurrency } from '../../lib/format'
import type { ProductStatistics } from '../../services/inventoryDashboardService'
import type { SupportedCurrency } from '../../lib/currency'

interface ProductStatisticsWidgetProps {
  stats?: ProductStatistics
  isLoading: boolean
  currency: SupportedCurrency
}

export function ProductStatisticsWidget({ stats, isLoading, currency }: ProductStatisticsWidgetProps) {
  return (
    <Card className="flex h-full flex-col p-5">
      <h2 className="mb-4 text-sm font-semibold text-ink-900">Product statistics</h2>

      {isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !stats || (!stats.mostExpensive && !stats.newest) ? (
        <p className="text-xs text-ink-500">Add products to see statistics here.</p>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue-50 text-brand-blue-700">
              <Award size={15} strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-ink-500">Most expensive</p>
              <p className="truncate text-sm font-medium text-ink-900">{stats.mostExpensive?.name ?? '—'}</p>
              {stats.mostExpensive && (
                <p className="text-xs text-ink-500">{formatCurrency(stats.mostExpensive.sellingPrice, currency)}</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success-100 text-success-700">
              <Sparkles size={15} strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-ink-500">Newest product</p>
              <p className="truncate text-sm font-medium text-ink-900">{stats.newest?.name ?? '—'}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning-100 text-warning-700">
              <Percent size={15} strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-ink-500">Average profit margin</p>
              <p className="text-sm font-medium text-ink-900">{stats.averageMarginPercent}%</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
