import { Link } from 'react-router-dom'
import { History } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { formatRelativeTime } from '../../lib/format'
import type { Product, StockMovement, StockMovementType } from '../../types/inventory'

const TYPE_TONE: Record<StockMovementType, 'success' | 'warning' | 'info' | 'neutral'> = {
  opening: 'neutral',
  purchase: 'info',
  sale: 'success',
  adjustment: 'warning',
  transfer: 'info',
}

interface RecentStockActivityPanelProps {
  movements?: StockMovement[]
  products: Product[]
  isLoading: boolean
}

export function RecentStockActivityPanel({ movements, products, isLoading }: RecentStockActivityPanelProps) {
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? 'Unknown product'
  const recent = (movements ?? []).slice(0, 6)

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Recent stock activity</h2>
        <Link to="/inventory/movements" className="text-xs font-medium text-brand-blue-700 hover:underline">
          View all
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <EmptyState icon={History} title="No activity yet" description="Stock changes will appear here as they happen." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {recent.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-ink-900">{productName(m.productId)}</p>
                  <Badge tone={TYPE_TONE[m.type]}>{m.type}</Badge>
                </div>
                {m.reason && <p className="truncate text-xs text-ink-500">{m.reason}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-sm font-medium ${m.quantityChange >= 0 ? 'text-success-700' : 'text-brand-red-700'}`}>
                  {m.quantityChange >= 0 ? '+' : ''}
                  {m.quantityChange}
                </p>
                <p className="text-xs text-ink-500">{formatRelativeTime(m.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
