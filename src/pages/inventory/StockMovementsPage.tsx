import { useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { InventoryTabs } from '../../components/inventory/InventoryTabs'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatRelativeTime } from '../../lib/format'
import { useProducts, useStockMovements } from '../../features/inventory/hooks/useInventoryData'
import type { StockMovementType } from '../../types/inventory'

const TYPE_TONE: Record<StockMovementType, 'success' | 'warning' | 'info' | 'neutral' | 'danger'> = {
  opening: 'neutral',
  purchase: 'info',
  sale: 'success',
  adjustment: 'warning',
  transfer: 'info',
}

export function StockMovementsPage() {
  const movementsQuery = useStockMovements()
  const productsQuery = useProducts()
  const [productFilter, setProductFilter] = useState('all')

  const productName = (id: string) => productsQuery.data?.find((p) => p.id === id)?.name ?? 'Unknown product'

  const filtered = useMemo(() => {
    const movements = movementsQuery.data ?? []
    return productFilter === 'all' ? movements : movements.filter((m) => m.productId === productFilter)
  }, [movementsQuery.data, productFilter])

  return (
    <div className="mx-auto max-w-4xl">
      <InventoryTabs />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Stock Movements</h1>
          <p className="mt-0.5 text-sm text-ink-500">Permanent, read-only audit trail of every inventory change.</p>
        </div>
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
        >
          <option value="all">All products</option>
          {productsQuery.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <Card className="p-5">
        {movementsQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={History} title="No movements yet" description="Inventory changes will be recorded here as they happen." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {filtered.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-ink-900">{productName(m.productId)}</p>
                    <Badge tone={TYPE_TONE[m.type]}>{m.type}</Badge>
                  </div>
                  {m.reason && <p className="text-xs text-ink-500">{m.reason}</p>}
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
    </div>
  )
}
