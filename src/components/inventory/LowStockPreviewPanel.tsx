import { Link } from 'react-router-dom'
import { AlertOctagon, PackageCheck } from 'lucide-react'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import type { Product } from '../../types/inventory'

interface LowStockPreviewPanelProps {
  products?: Product[]
  isLoading: boolean
}

export function LowStockPreviewPanel({ products, isLoading }: LowStockPreviewPanelProps) {
  const preview = (products ?? []).slice(0, 6)

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Low stock preview</h2>
        {products && products.length > 0 && (
          <span className="rounded-full bg-brand-red-100 px-2 py-0.5 text-xs font-medium text-brand-red-700">
            {products.length} item{products.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : preview.length === 0 ? (
        <EmptyState icon={PackageCheck} title="All items well stocked" description="Nothing is below its reorder level." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {preview.map((product) => (
            <li key={product.id} className="flex items-center gap-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-red-50 text-brand-red-700">
                <AlertOctagon size={14} strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  to={`/inventory/products/${product.id}`}
                  className="truncate text-sm font-medium text-ink-900 hover:text-brand-blue-700"
                >
                  {product.name}
                </Link>
                <p className="text-xs text-ink-500">
                  {product.currentStock} left · reorder at {product.reorderLevel}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
