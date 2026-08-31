import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ShoppingCart } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { PurchasingTabs } from '../../components/purchasing/PurchasingTabs'
import { PurchaseOrderFormModal } from '../../components/purchasing/PurchaseOrderFormModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useProducts, useSuppliers } from '../../features/inventory/hooks/useInventoryData'
import { useCreatePurchaseOrder, usePurchaseOrders } from '../../features/purchasing/hooks/usePurchasingData'
import { PO_STATUS_LABELS } from '../../types/purchasing'

const STATUS_TONE = {
  draft: 'neutral',
  pending_approval: 'warning',
  approved: 'success',
  sent: 'info',
  partially_received: 'warning',
  received: 'success',
  cancelled: 'danger',
} as const

export function PurchaseOrdersPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const ordersQuery = usePurchaseOrders()
  const productsQuery = useProducts()
  const suppliersQuery = useSuppliers()
  const createOrder = useCreatePurchaseOrder(user.id)

  const [isAddOpen, setIsAddOpen] = useState(false)

  const activeProducts = (productsQuery.data ?? []).filter((p) => p.status === 'active')
  const activeSuppliers = (suppliersQuery.data ?? []).filter((s) => s.status === 'active')
  const supplierName = (id: string) => suppliersQuery.data?.find((s) => s.id === id)?.name ?? 'Unknown supplier'

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Purchasing' }]} />
      <PurchasingTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Purchase Orders</h1>
          <p className="mt-0.5 text-sm text-ink-500">Orders sent to suppliers, from draft through received.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus size={15} /> New order
        </Button>
      </div>

      <Card className="p-5">
        {ordersQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (ordersQuery.data ?? []).length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="No purchase orders yet"
            description="Create one directly, or approve a requisition and convert it."
            action={{ label: '+ New order', onClick: () => setIsAddOpen(true) }}
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(ordersQuery.data ?? []).map((order) => {
              const total = order.items.reduce((sum, i) => sum + i.quantityOrdered * i.unitCost, 0)
              return (
                <li key={order.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link to={`/purchasing/orders/${order.id}`} className="text-sm font-medium text-ink-900 hover:text-brand-blue-700">
                        {order.reference}
                      </Link>
                      <Badge tone={STATUS_TONE[order.status]}>{PO_STATUS_LABELS[order.status]}</Badge>
                    </div>
                    <p className="text-xs text-ink-500">
                      {supplierName(order.supplierId)} · {formatRelativeTime(order.created_at)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-ink-900">{formatCurrency(total, 'UGX')}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {isAddOpen && (
        <PurchaseOrderFormModal
          suppliers={activeSuppliers}
          products={activeProducts}
          onClose={() => setIsAddOpen(false)}
          onSubmit={async (input) => {
            await createOrder.mutateAsync(input)
            showToast('Purchase order created.', 'success')
            setIsAddOpen(false)
          }}
        />
      )}
    </div>
  )
}
