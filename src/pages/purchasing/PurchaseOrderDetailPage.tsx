import { useParams } from 'react-router-dom'
import { Package } from 'lucide-react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import { useSuppliers } from '../../features/inventory/hooks/useInventoryData'
import {
  useCancelPurchaseOrder,
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
} as const

// Workflow change (2026-09-03, "remove requisitions / simplify purchase
// order workflow"): this page used to offer Approve / Reject / Mark sent /
// Receive goods, all gated on the order still being in 'draft'. A purchase
// order is now confirmed the instant it's recorded (see
// createAndPostPurchase() in services/business/businessEngine.ts), so none
// of those actions have anything left to do for a real order any more -
// they're removed rather than left as dead buttons that can never appear.
// The one remaining action is Cancel, unchanged from before.
//
// The "Goods receipts" card that used to live on this page is also
// removed: it queried ALL confirmed purchases business-wide rather than
// this order's own receipt (a real bug - every order's page was showing
// every other order's confirmed status too), and under the new workflow
// there is no separate receiving event to show any more - confirmation
// happens in the same action as recording the order, which the status
// badge above already reflects.
export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { showToast } = useToast()

  const orderQuery = usePurchaseOrder(id)
  const suppliersQuery = useSuppliers()
  const invoicesQuery = useSupplierInvoices()

  const cancelOrder = useCancelPurchaseOrder(user.id)

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
  const canCancel = order.status !== 'received' && order.status !== 'cancelled'

  return (
    <div className="mx-auto max-w-3xl">
      <SettingsPageHeader
        title={order.reference}
        description={`${supplier?.name ?? 'Unknown supplier'} · ${formatCurrency(total, 'UGX')}`}
        action={
          canCancel ? (
            <Button
              variant="danger"
              onClick={async () => {
                await cancelOrder.mutateAsync(order.id)
                showToast('Order cancelled.', 'success')
              }}
            >
              Cancel
            </Button>
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
    </div>
  )
}
