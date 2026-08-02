import { BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { PurchasingTabs } from '../../components/purchasing/PurchasingTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useSpendBySupplier } from '../../features/purchasing/hooks/usePurchasingData'

export function PurchaseReportsPage() {
  const spendQuery = useSpendBySupplier()
  const rows = spendQuery.data ?? []
  const total = rows.reduce((sum, r) => sum + r.totalSpendUgx, 0)

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Purchasing' }]} />
      <PurchasingTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Purchase Reports</h1>
        <p className="mt-0.5 text-sm text-ink-500">Spend by supplier, computed from received purchase orders.</p>
      </div>

      <Card className="p-5">
        {spendQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState icon={BarChart3} title="No spend recorded yet" description="This fills in once purchase orders are placed and received." />
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-500">
              Total spend: <span className="font-semibold text-ink-900">{formatCurrency(total, 'UGX')}</span>
            </p>
            <ul className="divide-y divide-ink-100">
              {rows.map((row) => (
                <li key={row.supplierId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-ink-900">{row.supplierName}</p>
                    <p className="text-xs text-ink-500">
                      {row.orderCount} order{row.orderCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="font-semibold text-ink-900">{formatCurrency(row.totalSpendUgx, 'UGX')}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}
