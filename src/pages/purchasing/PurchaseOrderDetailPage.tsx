import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Package, PackageCheck, Send, XCircle } from 'lucide-react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { GoodsReceiptModal } from '../../components/purchasing/GoodsReceiptModal'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useSuppliers } from '../../features/inventory/hooks/useInventoryData'
import {
  useApprovePurchaseOrder,
  useCancelPurchaseOrder,
  useGoodsReceipts,
  useMarkPurchaseOrderSent,
  usePurchaseOrder,
  useRecordGoodsReceipt,
  useRejectPurchaseOrder,
  useSupplierInvoices,
} from '../../features/purchasing/hooks/usePurchasingData'
import { OverReceiptError } from '../../services/purchasingService'
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

export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { showToast } = useToast()

  const orderQuery = usePurchaseOrder(id)
  const suppliersQuery = useSuppliers()
  const receiptsQuery = useGoodsReceipts(id)
  const invoicesQuery = useSupplierInvoices()

  const approveOrder = useApprovePurchaseOrder(user.id, user.name)
  const rejectOrder = useRejectPurchaseOrder(user.id)
  const markSent = useMarkPurchaseOrderSent(user.id)
  const cancelOrder = useCancelPurchaseOrder(user.id)
  const recordReceipt = useRecordGoodsReceipt(user.id, user.name)

  const [isReceiptOpen, setIsReceiptOpen] = useState(false)
  const [receiptError, setReceiptError] = useState<string | undefined>()
  const [isRejectOpen, setIsRejectOpen] = useState(false)

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
  const canReceive = order.status === 'approved' || order.status === 'sent' || order.status === 'partially_received'

  return (
    <div className="mx-auto max-w-3xl">
      <SettingsPageHeader
        title={order.reference}
        description={`${supplier?.name ?? 'Unknown supplier'} · ${formatCurrency(total, 'UGX')}`}
        action={
          <div className="flex flex-wrap gap-2">
            {order.status === 'pending_approval' && (
              <>
                <Button variant="secondary" onClick={() => setIsRejectOpen(true)}>
                  <XCircle size={14} /> Reject
                </Button>
                <Button
                  onClick={async () => {
                    await approveOrder.mutateAsync(order.id)
                    showToast('Order approved.', 'success')
                  }}
                >
                  <CheckCircle2 size={14} /> Approve
                </Button>
              </>
            )}
            {order.status === 'approved' && (
              <Button
                variant="secondary"
                onClick={async () => {
                  await markSent.mutateAsync(order.id)
                  showToast('Marked as sent to supplier.', 'success')
                }}
              >
                <Send size={14} /> Mark sent
              </Button>
            )}
            {canReceive && (
              <Button
                onClick={() => {
                  setReceiptError(undefined)
                  setIsReceiptOpen(true)
                }}
              >
                <PackageCheck size={14} /> Receive goods
              </Button>
            )}
            {order.status !== 'received' && order.status !== 'cancelled' && (
              <Button
                variant="danger"
                onClick={async () => {
                  await cancelOrder.mutateAsync(order.id)
                  showToast('Order cancelled.', 'success')
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Badge tone={STATUS_TONE[order.status]}>{PO_STATUS_LABELS[order.status]}</Badge>
        {order.expectedDeliveryDate && (
          <span className="text-xs text-ink-500">Expected {new Date(order.expectedDeliveryDate).toLocaleDateString('en-UG')}</span>
        )}
        {order.approvedByName && <span className="text-xs text-ink-500">Approved by {order.approvedByName}</span>}
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Line items</h2>
        <ul className="divide-y divide-ink-100">
          {order.items.map((item) => (
            <li key={item.productId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-900">{item.productName}</p>
                <p className="text-xs text-ink-500">
                  {item.sku} · {item.quantityReceived} of {item.quantityOrdered} received · {formatCurrency(item.unitCost, 'UGX')} each
                </p>
              </div>
              <p className="shrink-0 font-medium text-ink-900">{formatCurrency(item.quantityOrdered * item.unitCost, 'UGX')}</p>
            </li>
          ))}
        </ul>
        {order.notes && <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-ink-500">{order.notes}</p>}
        {order.rejectionReason && <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-brand-red-700">Rejected: {order.rejectionReason}</p>}
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Goods receipts</h2>
        {(receiptsQuery.data ?? []).length === 0 ? (
          <EmptyState icon={PackageCheck} title="Nothing received yet" description="Receipts will appear here once goods start arriving." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(receiptsQuery.data ?? []).map((receipt) => (
              <li key={receipt.id} className="py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink-900">{receipt.reference}</span>
                  <span className="text-xs text-ink-500">
                    {formatRelativeTime(receipt.receivedAt)} · {receipt.receivedByName}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-500">{receipt.items.map((i) => `${i.quantityReceived}× ${i.productName}`).join(', ')}</p>
              </li>
            ))}
          </ul>
        )}
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

      {isReceiptOpen && (
        <GoodsReceiptModal
          order={order}
          submitError={receiptError}
          onClose={() => setIsReceiptOpen(false)}
          onSubmit={async (items, notes) => {
            try {
              await recordReceipt.mutateAsync({ purchaseOrderId: order.id, items, notes })
              showToast('Goods receipt recorded, inventory updated.', 'success')
              setIsReceiptOpen(false)
            } catch (err) {
              setReceiptError(err instanceof OverReceiptError ? err.message : 'Could not record this receipt.')
            }
          }}
        />
      )}

      {isRejectOpen && (
        <ConfirmDialog
          title="Reject this order?"
          message={`Reject purchase order ${order.reference}.`}
          confirmLabel="Reject"
          tone="danger"
          reasonLabel="Reason for rejecting this order"
          onConfirm={async (reason) => {
            await rejectOrder.mutateAsync({ id: order.id, reason: reason ?? '' })
            showToast('Order rejected.', 'success')
            setIsRejectOpen(false)
          }}
          onCancel={() => setIsRejectOpen(false)}
        />
      )}
    </div>
  )
}
