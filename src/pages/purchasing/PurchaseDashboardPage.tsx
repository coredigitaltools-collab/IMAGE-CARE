import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ShoppingCart, Package, Wallet, AlertTriangle, FileText } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { PurchasingTabs } from '../../components/purchasing/PurchasingTabs'
import { PurchaseOrderFormModal } from '../../components/purchasing/PurchaseOrderFormModal'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import { useProducts, useSuppliers } from '../../features/inventory/hooks/useInventoryData'
import {
  useCreatePurchaseOrder,
  usePurchaseDashboardKpis,
  usePurchaseOrders,
} from '../../features/purchasing/hooks/usePurchasingData'
import { PO_STATUS_LABELS } from '../../types/purchasing'

export function PurchaseDashboardPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const kpisQuery = usePurchaseDashboardKpis()
  const ordersQuery = usePurchaseOrders()
  const suppliersQuery = useSuppliers()
  const productsQuery = useProducts()
  const createOrder = useCreatePurchaseOrder(user.id)

  const [isPoOpen, setIsPoOpen] = useState(false)

  const activeProducts = (productsQuery.data ?? []).filter((p) => p.status === 'active')
  const activeSuppliers = (suppliersQuery.data ?? []).filter((s) => s.status === 'active')

  // Bug fix (Purchasing module audit 2026-09-03): filtered on statuses the
  // real status enum (draft/confirmed/cancelled/voided) never produces, so
  // this list was always empty even with real draft orders sitting there
  // unactioned. 'draft' is the one real "still needs someone to do
  // something with it" status.
  //
  // Workflow change (2026-09-03, "remove requisitions / simplify purchase
  // order workflow"): a purchase order is now confirmed the instant it's
  // recorded, so a new order never sits in 'draft' any more - this list
  // will only ever show orders left over from before that change (or ones
  // that failed partway through confirming, see createAndPostPurchase() in
  // businessEngine.ts). It's kept rather than removed since a leftover
  // draft genuinely still needs attention (it can be cancelled from its
  // detail page) - there just won't usually be anything here going forward.
  const needsAttention = (ordersQuery.data ?? [])
    .filter((o) => o.status === 'draft')
    .slice(0, 6)

  // Workflow change (2026-09-03): "Request approval to buy" (the
  // Requisition quick action) is removed along with the Requisition
  // workflow itself - there is no more approval-first path, only "Record
  // a purchase" below, which is now the one and only way to start a
  // purchase order.
  const secondaryActions = [
    { label: 'Record supplier invoice', icon: FileText, onClick: () => navigate('/purchasing/invoices') },
    { label: 'Reports', icon: Package, onClick: () => navigate('/purchasing/reports') },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Purchasing' }]} />
      <PurchasingTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Purchasing</h1>
          <p className="mt-0.5 text-sm text-ink-500">Orders, receiving, and what you owe suppliers.</p>
        </div>
        <Button onClick={() => setIsPoOpen(true)}>
          <ShoppingCart size={15} /> Record a purchase
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        {secondaryActions.map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="group flex flex-col items-center gap-1.5 rounded-card border border-ink-100 bg-white px-3 py-3 text-center shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover active:translate-y-0 active:scale-[0.97]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue-50 text-brand-blue-700 transition-all duration-200 group-hover:scale-110 group-hover:bg-brand-blue-700 group-hover:text-white">
              <Icon size={16} strokeWidth={1.75} />
            </span>
            <span className="text-xs font-medium text-ink-700">{label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open orders" value={kpisQuery.data ? String(kpisQuery.data.openOrders) : '-'} icon={ShoppingCart} tone="blue" isLoading={kpisQuery.isLoading} />
        <KpiCard label="Pending receipt" value={kpisQuery.data ? String(kpisQuery.data.pendingReceipt) : '-'} icon={Package} tone="neutral" isLoading={kpisQuery.isLoading} />
        <KpiCard
          label="Spend this month"
          value={kpisQuery.data ? formatCurrency(kpisQuery.data.spendThisMonthUgx, 'UGX') : '-'}
          icon={Wallet}
          tone="success"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Overdue deliveries"
          value={kpisQuery.data ? String(kpisQuery.data.overdueDeliveries) : '-'}
          icon={AlertTriangle}
          tone={kpisQuery.data && kpisQuery.data.overdueDeliveries > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
      </div>

      <Card className="mt-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink-900">Orders needing attention</h2>
        {ordersQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : needsAttention.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="Nothing needs attention" description="No leftover unconfirmed orders right now." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {needsAttention.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link to={`/purchasing/orders/${o.id}`} className="text-sm font-medium text-ink-900 hover:text-brand-blue-700">
                    {o.reference}
                  </Link>
                  <p className="text-xs text-ink-500">{activeSuppliers.find((s) => s.id === o.supplierId)?.name ?? 'Unknown supplier'}</p>
                </div>
                <Badge tone="warning">{PO_STATUS_LABELS[o.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isPoOpen && (
        <PurchaseOrderFormModal
          suppliers={activeSuppliers}
          products={activeProducts}
          onClose={() => setIsPoOpen(false)}
          onSubmit={async (input) => {
            await createOrder.mutateAsync(input)
            showToast('Purchase order recorded and confirmed.', 'success')
            setIsPoOpen(false)
          }}
        />
      )}
    </div>
  )
}
