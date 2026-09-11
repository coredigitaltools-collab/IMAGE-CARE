import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Package, Pencil, Trash2 } from 'lucide-react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { PurchaseOrderFormModal } from '../../components/purchasing/PurchaseOrderFormModal'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import { useProducts, useSuppliers } from '../../features/inventory/hooks/useInventoryData'
import {
  useCancelPurchaseOrder,
  useUpdatePurchaseOrder,
  useEditConfirmedPurchaseOrder,
  usePurchaseOrder,
  useSupplierInvoices,
} from '../../features/purchasing/hooks/usePurchasingData'
import { PO_STATUS_LABELS } from '../../types/purchasing'

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

// Workflow change (2026-09-03, "remove requisitions / simplify purchase
// order workflow"): this page used to offer Approve / Reject / Mark sent /
// Receive goods, all gated on the order still being in 'draft'. A purchase
// order is now confirmed the instant it's recorded (see
// createAndPostPurchase() in services/business/businessEngine.ts), so none
// of those actions have anything left to do for a real order any more -
// they're removed rather than left as dead buttons that can never appear.
//
// The "Goods receipts" card that used to live on this page is also
// removed: it queried ALL confirmed purchases business-wide rather than
// this order's own receipt (a real bug - every order's page was showing
// every other order's confirmed status too), and under the new workflow
// there is no separate receiving event to show any more - confirmation
// happens in the same action as recording the order, which the status
// badge above already reflects.
//
// Edit/Delete added 2026-09-03 for the "edit/delete a purchase order"
// correction flow - "imagine you made a mistake": Delete on a Confirmed
// order now really reverses its stock and accounting (voidPurchase(), via
// cancelPurchaseOrder()) instead of the old Cancel button's silent status
// flip, and Edit reopens the order form pre-filled - a still-Draft order
// updates in place, a Confirmed one is voided and replaced by a corrected,
// newly-confirmed order (see PurchaseOrdersPage for the identical flow).
export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast } = useToast()

  const orderQuery = usePurchaseOrder(id)
  const suppliersQuery = useSuppliers()
  const productsQuery = useProducts()
  const invoicesQuery = useSupplierInvoices()

  const cancelOrder = useCancelPurchaseOrder(user.id)
  const updateDraftOrder = useUpdatePurchaseOrder(user.id)
  const editConfirmedOrder = useEditConfirmedPurchaseOrder(user.id)

  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  const order = orderQuery.data

  if (orderQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState icon={Package} title="Purchase order not found" description="It may have been removed." />
      </div>
    )
  }

  const total = order.items.reduce((sum, i) => sum + i.quantityOrdered * i.unitCost, 0)
  const supplier = suppliersQuery.data?.find((s) => s.id === order.supplierId)
  const linkedInvoices = (invoicesQuery.data ?? []).filter((inv) => inv.purchaseOrderId === order.id)
  const canActOn = order.status === 'draft' || order.status === 'received'
  const activeProducts = (productsQuery.data ?? []).filter((p) => p.status === 'active')
  const activeSuppliers = (suppliersQuery.data ?? []).filter((s) => s.status === 'active')

  const handleDelete = async (reason?: string) => {
    try {
      await cancelOrder.mutateAsync({ id: order.id, reason })
      showToast(order.status === 'draft' ? 'Draft order deleted.' : 'Purchase order voided - stock and accounting reversed.', 'success')
      navigate('/purchasing/orders')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete this purchase order. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SettingsPageHeader
        title={order.reference}
        description={`${supplier?.name ?? 'Unknown supplier'} · ${formatCurrency(total, 'UGX')}`}
        action={
          canActOn ? (
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setIsEditOpen(true)}>
                <Pencil size={15} /> Edit
              </Button>
              <Button variant="danger" onClick={() => setIsDeleteOpen(true)}>
                <Trash2 size={15} /> Delete
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Badge tone={STATUS_TONE[order.status]}>{PO_STATUS_LABELS[order.status]}</Badge>
        {order.expectedDeliveryDate && (
          <span className="text-xs text-ink-500">Expected {new Date(order.expectedDeliveryDate).toLocaleDateString('en-UG')}</span>
        )}
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Line items</h2>
        <ul className="divide-y divide-ink-100">
          {order.items.map((item) => (
            <li key={item.productId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-900">{item.productName}</p>
                <p className="text-xs text-ink-500">
                  {item.sku} · Qty: {item.quantityOrdered} · Price: {formatCurrency(item.unitCost, 'UGX')} each
                </p>
              </div>
              <p className="shrink-0 font-medium text-ink-900">{formatCurrency(item.quantityOrdered * item.unitCost, 'UGX')}</p>
            </li>
          ))}
        </ul>
        {order.notes && <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-ink-500">{order.notes}</p>}
        {order.rejectionReason && <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-brand-red-700">{order.rejectionReason}</p>}
      </Card>

      {linkedInvoices.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Supplier invoices</h2>
          <ul className="divide-y divide-ink-100">
            {linkedInvoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink-900">{inv.reference}</span>
                <span className="font-medium text-ink-900">{formatCurrency(inv.amount, 'UGX')}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isEditOpen && (
        <PurchaseOrderFormModal
          suppliers={activeSuppliers}
          products={activeProducts}
          title={order.status === 'draft' ? 'Edit draft order' : 'Edit purchase order'}
          submitLabel={order.status === 'draft' ? 'Save changes' : 'Save corrected order'}
          notice={
            order.status === 'draft'
              ? undefined
              : 'This order is already confirmed. Saving will void the original (reversing its stock and accounting) and record your changes as a new, confirmed order.'
          }
          initialValues={{
            supplierId: order.supplierId,
            expectedDeliveryDate: order.expectedDeliveryDate ?? undefined,
            notes: order.notes,
            items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantityOrdered, unitCost: i.unitCost })),
          }}
          onClose={() => setIsEditOpen(false)}
          onSubmit={async (input) => {
            if (order.status === 'draft') {
              await updateDraftOrder.mutateAsync({ id: order.id, input })
              showToast('Draft order updated.', 'success')
              setIsEditOpen(false)
            } else {
              const result = await editConfirmedOrder.mutateAsync({ id: order.id, input })
              showToast('Original order voided; corrected order recorded and confirmed.', 'success')
              setIsEditOpen(false)
              navigate(`/purchasing/orders/${result.purchase_id}`)
            }
          }}
        />
      )}

      {isDeleteOpen && (
        <ConfirmDialog
          title={order.status === 'draft' ? 'Delete draft order?' : 'Delete this purchase order?'}
          message={
            order.status === 'draft'
              ? `Delete ${order.reference}? It hasn't been confirmed yet, so nothing else is affected.`
              : `${order.reference} is confirmed - its stock receipt and accounting entry will be reversed, and its supplier balance restored. This can't be undone.`
          }
          confirmLabel="Delete"
          tone="danger"
          reasonLabel={order.status === 'draft' ? undefined : 'Reason for deleting this order'}
          reasonPlaceholder={order.status === 'draft' ? undefined : 'e.g. wrong supplier, wrong items, duplicate entry'}
          onConfirm={(reason) => handleDelete(reason)}
          onCancel={() => setIsDeleteOpen(false)}
        />
      )}
    </div>
  )
}
