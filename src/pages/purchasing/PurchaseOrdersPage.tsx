import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ShoppingCart, Pencil, Trash2 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { PurchasingTabs } from '../../components/purchasing/PurchasingTabs'
import { PurchaseOrderFormModal } from '../../components/purchasing/PurchaseOrderFormModal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useProducts, useSuppliers } from '../../features/inventory/hooks/useInventoryData'
import {
  useCreatePurchaseOrder, usePurchaseOrders,
  useUpdatePurchaseOrder, useEditConfirmedPurchaseOrder, useCancelPurchaseOrder,
} from '../../features/purchasing/hooks/usePurchasingData'
import { PO_STATUS_LABELS } from '../../types/purchasing'
import type { PurchaseOrder } from '../../types/purchasing'

const STATUS_TONE = {
  draft: 'neutral',
  pending_approval: 'warning',
  approved: 'success',
  sent: 'info',
  partially_received: 'warning',
  received: 'success',
  cancelled: 'danger',
  voided: 'danger',
} as const

export function PurchaseOrdersPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const ordersQuery = usePurchaseOrders()
  const productsQuery = useProducts()
  const suppliersQuery = useSuppliers()
  const createOrder = useCreatePurchaseOrder(user.id)
  const updateDraftOrder = useUpdatePurchaseOrder(user.id)
  const editConfirmedOrder = useEditConfirmedPurchaseOrder(user.id)
  const cancelOrder = useCancelPurchaseOrder(user.id)

  const [isAddOpen, setIsAddOpen] = useState(false)
  // Edit/Delete support (2026-09-03, "edit/delete a purchase order"
  // correction flow - see PurchaseOrderFormModal's initialValues prop and
  // cancelPurchaseOrder()/voidPurchase() in the service/engine layers).
  // Only a still-Draft or Confirmed order can be edited/deleted - a
  // Cancelled or Voided order is already a terminal, resolved state with
  // nothing left to act on.
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null)
  const [deletingOrder, setDeletingOrder] = useState<PurchaseOrder | null>(null)

  const activeProducts = (productsQuery.data ?? []).filter((p) => p.status === 'active')
  const activeSuppliers = (suppliersQuery.data ?? []).filter((s) => s.status === 'active')
  const supplierName = (id: string) => suppliersQuery.data?.find((s) => s.id === id)?.name ?? 'Unknown supplier'

  const canActOn = (order: PurchaseOrder) => order.status === 'draft' || order.status === 'received'

  const handleDelete = async (reason?: string) => {
    if (!deletingOrder) return
    try {
      await cancelOrder.mutateAsync({ id: deletingOrder.id, reason })
      showToast(deletingOrder.status === 'draft' ? 'Draft order deleted.' : 'Purchase order voided - stock and accounting reversed.', 'success')
      setDeletingOrder(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete this purchase order. Please try again.')
    }
  }

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
            description="Record one - it's confirmed right away and ready to invoice."
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
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold text-ink-900">{formatCurrency(total, 'UGX')}</span>
                    {canActOn(order) && (
                      <div className="flex items-center gap-1">
                        <RowActionButton icon={Pencil} label={`Edit ${order.reference}`} onClick={() => setEditingOrder(order)} />
                        <RowActionButton icon={Trash2} label={`Delete ${order.reference}`} tone="danger" onClick={() => setDeletingOrder(order)} />
                      </div>
                    )}
                  </div>
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
            showToast('Purchase order recorded and confirmed.', 'success')
            setIsAddOpen(false)
          }}
        />
      )}

      {editingOrder && (
        <PurchaseOrderFormModal
          suppliers={activeSuppliers}
          products={activeProducts}
          title={editingOrder.status === 'draft' ? 'Edit draft order' : 'Edit purchase order'}
          submitLabel={editingOrder.status === 'draft' ? 'Save changes' : 'Save corrected order'}
          notice={
            editingOrder.status === 'draft'
              ? undefined
              : 'This order is already confirmed. Saving will void the original (reversing its stock and accounting) and record your changes as a new, confirmed order.'
          }
          initialValues={{
            supplierId: editingOrder.supplierId,
            expectedDeliveryDate: editingOrder.expectedDeliveryDate ?? undefined,
            notes: editingOrder.notes,
            items: editingOrder.items.map((i) => ({ productId: i.productId, quantity: i.quantityOrdered, unitCost: i.unitCost })),
          }}
          onClose={() => setEditingOrder(null)}
          onSubmit={async (input) => {
            if (editingOrder.status === 'draft') {
              await updateDraftOrder.mutateAsync({ id: editingOrder.id, input })
              showToast('Draft order updated.', 'success')
            } else {
              await editConfirmedOrder.mutateAsync({ id: editingOrder.id, input })
              showToast('Original order voided; corrected order recorded and confirmed.', 'success')
            }
            setEditingOrder(null)
          }}
        />
      )}

      {deletingOrder && (
        <ConfirmDialog
          title={deletingOrder.status === 'draft' ? 'Delete draft order?' : 'Delete this purchase order?'}
          message={
            deletingOrder.status === 'draft'
              ? `Delete ${deletingOrder.reference}? It hasn't been confirmed yet, so nothing else is affected.`
              : `${deletingOrder.reference} is confirmed - its stock receipt and accounting entry will be reversed, and its supplier balance restored. This can't be undone.`
          }
          confirmLabel="Delete"
          tone="danger"
          reasonLabel={deletingOrder.status === 'draft' ? undefined : 'Reason for deleting this order'}
          reasonPlaceholder={deletingOrder.status === 'draft' ? undefined : 'e.g. wrong supplier, wrong items, duplicate entry'}
          onConfirm={(reason) => handleDelete(reason)}
          onCancel={() => setDeletingOrder(null)}
        />
      )}
    </div>
  )
}
