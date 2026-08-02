import { Link } from 'react-router-dom'
import { Package } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { StockSummaryTabs } from '../../components/stockSummary/StockSummaryTabs'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useCurrentStockSummary } from '../../features/stockSummary/hooks/useStockSummaryData'

const STATUS_TONE = { ok: 'success', low: 'warning', out: 'danger' } as const
const STATUS_LABELS = { ok: 'In stock', low: 'Low', out: 'Out of stock' } as const

export function CurrentStockPage() {
  const stockQuery = useCurrentStockSummary()
  const rows = stockQuery.data ?? []

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Stock Summary' }]} />
      <StockSummaryTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Current Stock</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Every active product, lowest stock first. For editing or creating products, use{' '}
          <Link to="/inventory/products" className="text-brand-blue-700 hover:underline">
            Inventory
          </Link>
          .
        </p>
      </div>

      <Card className="p-5">
        {stockQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState icon={Package} title="No products yet" description="Add products under Inventory to see stock here." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <Link to={`/inventory/products/${row.id}`} className="font-medium text-ink-900 hover:text-brand-blue-700">
                    {row.name}
                  </Link>
                  <p className="text-xs text-ink-500">{row.sku}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-ink-700">
                    {row.currentStock} <span className="text-xs text-ink-500">(reorder at {row.reorderLevel})</span>
                  </span>
                  <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
