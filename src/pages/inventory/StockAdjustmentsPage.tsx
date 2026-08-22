import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ClipboardList, Plus } from 'lucide-react'
import { InventoryTabs } from '../../components/inventory/InventoryTabs'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { StockAdjustmentModal } from '../../components/inventory/StockAdjustmentModal'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatRelativeTime } from '../../lib/format'
import { useCreateAdjustment, useProducts, useStockAdjustments } from '../../features/inventory/hooks/useInventoryData'
import { NegativeStockError } from '../../services/stockService'
import type { StockAdjustmentInput } from '../../types/inventory'

export function StockAdjustmentsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const adjustmentsQuery = useStockAdjustments()
  const productsQuery = useProducts()
  const createAdjustment = useCreateAdjustment(user.id)

  const [isOpen, setIsOpen] = useState(searchParams.get('new') === '1')
  const [formError, setFormError] = useState<string | undefined>()

  const productName = (id: string) => productsQuery.data?.find((p) => p.id === id)?.name ?? 'Unknown product'

  const close = () => {
    setIsOpen(false)
    setFormError(undefined)
    if (searchParams.get('new')) {
      searchParams.delete('new')
      setSearchParams(searchParams, { replace: true })
    }
  }

  const handleSubmit = async (input: StockAdjustmentInput) => {
    setFormError(undefined)
    try {
      await createAdjustment.mutateAsync(input)
      showToast('Stock adjustment recorded.', 'success')
      close()
    } catch (err) {
      setFormError(err instanceof NegativeStockError ? err.message : 'Could not record this adjustment.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <InventoryTabs />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Stock Adjustments</h1>
          <p className="mt-0.5 text-sm text-ink-500">Every adjustment requires a reason and is logged permanently.</p>
        </div>
        <Button onClick={() => setIsOpen(true)}>
          <Plus size={15} /> New adjustment
        </Button>
      </div>

      <Card className="p-5">
        {adjustmentsQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (adjustmentsQuery.data ?? []).length === 0 ? (
          <EmptyState icon={ClipboardList} title="No adjustments yet" description="Adjustments you record will be listed here." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(adjustmentsQuery.data ?? []).map((adj) => (
              <li key={adj.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{productName(adj.productId)}</p>
                  <p className="text-xs text-ink-500">{adj.reason}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-medium ${adj.quantityChange >= 0 ? 'text-success-700' : 'text-brand-red-700'}`}>
                    {adj.quantityChange >= 0 ? '+' : ''}
                    {adj.quantityChange}
                  </p>
                  <p className="text-xs text-ink-500">{formatRelativeTime(adj.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isOpen && (
        <StockAdjustmentModal
          products={(productsQuery.data ?? []).filter((p) => p.status === 'active')}
          onClose={close}
          onSubmit={handleSubmit}
          submitError={formError}
        />
      )}
    </div>
  )
}
