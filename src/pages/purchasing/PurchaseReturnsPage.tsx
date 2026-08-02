import { useState } from 'react'
import { Plus, RotateCcw } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { PurchasingTabs } from '../../components/purchasing/PurchasingTabs'
import { PurchaseReturnModal } from '../../components/purchasing/PurchaseReturnModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useProducts, useSuppliers } from '../../features/inventory/hooks/useInventoryData'
import { useCreatePurchaseReturn, usePurchaseReturns } from '../../features/purchasing/hooks/usePurchasingData'

export function PurchaseReturnsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const returnsQuery = usePurchaseReturns()
  const productsQuery = useProducts()
  const suppliersQuery = useSuppliers()
  const createReturn = useCreatePurchaseReturn(user.id)

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
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Purchase Returns</h1>
          <p className="mt-0.5 text-sm text-ink-500">Goods sent back to suppliers, reduces stock immediately.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus size={15} /> New return
        </Button>
      </div>

      <Card className="p-5">
        {returnsQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (returnsQuery.data ?? []).length === 0 ? (
          <EmptyState icon={RotateCcw} title="No returns recorded" description="Goods returned to a supplier will appear here." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(returnsQuery.data ?? []).map((ret) => {
              const total = ret.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0)
              return (
                <li key={ret.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-sm font-medium text-ink-900">{ret.reference}</span>
                      <p className="text-xs text-ink-500">
                        {supplierName(ret.supplierId)} · {formatRelativeTime(ret.createdAt)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-brand-red-700">-{formatCurrency(total, 'UGX')}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {ret.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}, {ret.reason}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {isAddOpen && (
        <PurchaseReturnModal
          suppliers={activeSuppliers}
          products={activeProducts}
          onClose={() => setIsAddOpen(false)}
          onSubmit={async (input) => {
            await createReturn.mutateAsync({ ...input, purchaseOrderId: null })
            showToast('Return recorded, stock updated.', 'success')
            setIsAddOpen(false)
          }}
        />
      )}
    </div>
  )
}
