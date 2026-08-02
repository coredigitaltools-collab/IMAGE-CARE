import { useState } from 'react'
import { ClipboardList, Plus } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { PurchasingTabs } from '../../components/purchasing/PurchasingTabs'
import { RequisitionFormModal } from '../../components/purchasing/RequisitionFormModal'
import { PurchaseOrderFormModal } from '../../components/purchasing/PurchaseOrderFormModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { formatRelativeTime } from '../../lib/format'
import { useProducts, useSuppliers } from '../../features/inventory/hooks/useInventoryData'
import {
  useApproveRequisition,
  useCreatePurchaseOrder,
  useCreateRequisition,
  useRejectRequisition,
  useRequisitions,
} from '../../features/purchasing/hooks/usePurchasingData'
import { REQUISITION_STATUS_LABELS } from '../../types/purchasing'
import type { PurchaseRequisition } from '../../types/purchasing'

const STATUS_TONE = { draft: 'neutral', pending_approval: 'warning', approved: 'success', rejected: 'danger', converted: 'info' } as const

export function RequisitionsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const requisitionsQuery = useRequisitions()
  const productsQuery = useProducts()
  const suppliersQuery = useSuppliers()
  const createRequisition = useCreateRequisition(user.id, user.name)
  const approveRequisition = useApproveRequisition(user.id)
  const rejectRequisition = useRejectRequisition(user.id)
  const createOrder = useCreatePurchaseOrder(user.id)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [convertingReq, setConvertingReq] = useState<PurchaseRequisition | null>(null)

  const activeProducts = (productsQuery.data ?? []).filter((p) => p.status === 'active')
  const activeSuppliers = (suppliersQuery.data ?? []).filter((s) => s.status === 'active')

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Purchasing' }]} />
      <PurchasingTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Requisitions</h1>
          <p className="mt-0.5 text-sm text-ink-500">Internal requests to buy, approved ones become purchase orders.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus size={15} /> New requisition
        </Button>
      </div>

      <Card className="p-5">
        {requisitionsQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (requisitionsQuery.data ?? []).length === 0 ? (
          <EmptyState icon={ClipboardList} title="No requisitions yet" description="Staff requests to buy items will appear here." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(requisitionsQuery.data ?? []).map((req) => (
              <li key={req.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink-900">{req.reference}</span>
                      <Badge tone={STATUS_TONE[req.status]}>{REQUISITION_STATUS_LABELS[req.status]}</Badge>
                    </div>
                    <p className="text-xs text-ink-500">
                      {req.requestedByName} · {formatRelativeTime(req.created_at)} · {req.items.length} item{req.items.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  {req.status === 'pending_approval' && (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          const reason = window.prompt('Reason for rejecting this requisition?')
                          if (!reason) return
                          await rejectRequisition.mutateAsync({ id: req.id, reason })
                          showToast('Requisition rejected.', 'success')
                        }}
                      >
                        Reject
                      </Button>
                      <Button
                        onClick={async () => {
                          await approveRequisition.mutateAsync(req.id)
                          showToast('Requisition approved.', 'success')
                        }}
                      >
                        Approve
                      </Button>
                    </div>
                  )}
                  {req.status === 'approved' && <Button onClick={() => setConvertingReq(req)}>Convert to order</Button>}
                </div>
                <p className="mt-1.5 text-xs text-ink-500">{req.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}</p>
                {req.rejectionReason && <p className="mt-1 text-xs text-brand-red-700">Rejected: {req.rejectionReason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isAddOpen && (
        <RequisitionFormModal
          products={activeProducts}
          onClose={() => setIsAddOpen(false)}
          onSubmit={async (items, notes) => {
            await createRequisition.mutateAsync({ items, notes })
            showToast('Requisition submitted.', 'success')
            setIsAddOpen(false)
          }}
        />
      )}

      {convertingReq && (
        <PurchaseOrderFormModal
          suppliers={activeSuppliers}
          products={activeProducts}
          requisitionId={convertingReq.id}
          initialRows={convertingReq.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitCost: 0 }))}
          onClose={() => setConvertingReq(null)}
          onSubmit={async (input) => {
            await createOrder.mutateAsync(input)
            showToast('Purchase order created from requisition.', 'success')
            setConvertingReq(null)
          }}
        />
      )}
    </div>
  )
}
