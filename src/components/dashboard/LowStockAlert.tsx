import { PackageCheck, AlertOctagon } from 'lucide-react'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import type { LowStockItem } from '../../types/domain'

interface LowStockAlertProps {
  items?: LowStockItem[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

export function LowStockAlert({ items, isLoading, isError, onRetry }: LowStockAlertProps) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Low stock</h2>
        {items && items.length > 0 && (
          <span className="rounded-full bg-brand-red-100 px-2 py-0.5 text-xs font-medium text-brand-red-700">
            {items.length} item{items.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {!isLoading && isError && <ErrorState onRetry={onRetry} />}

      {!isLoading && !isError && items && items.length === 0 && (
        <EmptyState
          icon={PackageCheck}
          title="All items well stocked"
          description="Nothing is below its reorder level right now."
        />
      )}

      {!isLoading && !isError && items && items.length > 0 && (
        <ul className="divide-y divide-ink-100">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-red-50 text-brand-red-700">
                <AlertOctagon size={15} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{item.name}</p>
                <p className="text-xs text-ink-500">
                  {item.quantityRemaining} left · reorder at {item.reorderLevel}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
