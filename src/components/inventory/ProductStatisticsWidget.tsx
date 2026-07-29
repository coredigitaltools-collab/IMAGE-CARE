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
  /** 'vertical' stacks the three stats (fits a narrow column). 'horizontal'
   *  lays them out side by side (fits a full-width strip). */
  layout?: 'vertical' | 'horizontal'
}

export function ProductStatisticsWidget({ stats, isLoading, currency, layout = 'vertical' }: ProductStatisticsWidgetProps) {
  const isHorizontal = layout === 'horizontal'

  const items = stats
    ? [
        {
          icon: Award,
          iconTone: 'bg-brand-blue-50 text-brand-blue-700',
          label: 'Most expensive',
          value: stats.mostExpensive?.name ?? '—',
          hint: stats.mostExpensive ? formatCurrency(stats.mostExpensive.sellingPrice, currency) : undefined,
        },
        {
          icon: Sparkles,
          iconTone: 'bg-success-100 text-success-700',
          label: 'Newest product',
          value: stats.newest?.name ?? '—',
          hint: undefined,
        },
        {
          icon: Percent,
          iconTone: 'bg-warning-100 text-warning-700',
          label: 'Average profit margin',
          value: `${stats.averageMarginPercent}%`,
          hint: undefined,
        },
      ]
    : []

  return (
    <Card className={`h-full p-5 ${isHorizontal ? '' : 'flex flex-col'}`}>
      <h2 className="mb-4 text-sm font-semibold text-ink-900">Product statistics</h2>

      {isLoading ? (
        <div className={isHorizontal ? 'grid grid-cols-1 gap-4 sm:grid-cols-3' : 'space-y-4'}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !stats || (!stats.mostExpensive && !stats.newest) ? (
        <p className="text-xs text-ink-500">Add products to see statistics here.</p>
      ) : (
        <div className={isHorizontal ? 'grid grid-cols-1 gap-4 sm:grid-cols-3' : 'flex flex-1 flex-col gap-4'}>
          {items.map((item) => (
            <div key={item.label} className="flex items-start gap-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.iconTone}`}>
                <item.icon size={15} strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-ink-500">{item.label}</p>
                <p className="truncate text-sm font-medium text-ink-900">{item.value}</p>
                {item.hint && <p className="text-xs text-ink-500">{item.hint}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
