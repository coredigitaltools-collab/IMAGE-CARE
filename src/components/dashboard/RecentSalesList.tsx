import { Receipt } from 'lucide-react'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { Badge } from '../ui/Badge'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import type { RecentSale, SaleStatus } from '../../types/domain'

const STATUS_TONE: Record<SaleStatus, 'success' | 'warning' | 'danger'> = {
  completed: 'success',
  pending: 'warning',
  refunded: 'danger',
}

const STATUS_LABEL: Record<SaleStatus, string> = {
  completed: 'Completed',
  pending: 'Pending',
  refunded: 'Refunded',
}

interface RecentSalesListProps {
  sales?: RecentSale[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  onNewSale: () => void
}

export function RecentSalesList({ sales, isLoading, isError, onRetry, onNewSale }: RecentSalesListProps) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Recent sales</h2>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {!isLoading && isError && <ErrorState onRetry={onRetry} />}

      {!isLoading && !isError && sales && sales.length === 0 && (
        <EmptyState
          icon={Receipt}
          title="No sales recorded yet"
          description="Sales made today will show up here as they happen."
          action={{ label: 'Record a sale', onClick: onNewSale }}
        />
      )}

      {!isLoading && !isError && sales && sales.length > 0 && (
        <ul className="divide-y divide-ink-100">
          {sales.map((sale) => (
            <li key={sale.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{sale.customerName}</p>
                <p className="text-xs text-ink-500">
                  {sale.reference} · {formatRelativeTime(sale.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <p className="text-sm font-semibold text-ink-900">{formatCurrency(sale.amount, sale.currency)}</p>
                <Badge tone={STATUS_TONE[sale.status]}>{STATUS_LABEL[sale.status]}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
